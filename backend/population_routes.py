from datetime import datetime, timedelta, timezone
from pathlib import Path
import sqlite3
from typing import Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

router = APIRouter(tags=["Population estimation"])

DB_PATH = Path(__file__).resolve().parent / "population_reports.db"

ReportSource = Literal[
    "official_report",
    "sensor_count",
    "shelter_registration",
    "manual_report",
]


def get_connection():
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database():
    with get_connection() as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS population_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                area_id TEXT NOT NULL,
                people_count INTEGER NOT NULL,
                source TEXT NOT NULL,
                reported_by TEXT,
                note TEXT,
                created_at TEXT NOT NULL
            )
        """)
        connection.execute("""
            CREATE INDEX IF NOT EXISTS idx_population_area_time
            ON population_reports(area_id, created_at)
        """)


initialize_database()


class PopulationReport(BaseModel):
    area_id: str = Field(min_length=1, max_length=100)
    people_count: int = Field(ge=0, le=10_000_000)
    source: ReportSource
    reported_by: str | None = Field(default=None, max_length=100)
    note: str | None = Field(default=None, max_length=500)


class AreaEstimateRequest(BaseModel):
    area_id: str = Field(min_length=1, max_length=100)
    area_km2: float = Field(gt=0, le=100_000)
    density_per_km2: float = Field(ge=0, le=1_000_000)


@router.post("/api/population/report")
def create_population_report(report: PopulationReport):
    """Save one report from an operator or authorized data source."""
    area_id = report.area_id.strip()
    if not area_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="Area ID cannot be blank.")

    timestamp = datetime.now(timezone.utc).isoformat()

    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO population_reports
                (area_id, people_count, source, reported_by, note, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                area_id,
                report.people_count,
                report.source,
                report.reported_by,
                report.note,
                timestamp,
            ),
        )
        report_id = cursor.lastrowid

    return {
        "status": "saved",
        "report_id": report_id,
        "area_id": area_id,
        "people_count": report.people_count,
        "source": report.source,
        "created_at": timestamp,
        "message": "Report saved. The count has not been independently verified.",
    }


@router.post("/api/population/area-estimate")
def estimate_area_population(request: AreaEstimateRequest):
    """Estimate population from area size and supplied population density."""
    area_id = request.area_id.strip()
    if not area_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="Area ID cannot be blank.")

    estimate = round(request.area_km2 * request.density_per_km2)

    return {
        "area_id": area_id,
        "area_km2": request.area_km2,
        "density_per_km2": request.density_per_km2,
        "estimated_people": estimate,
        "source": "area_and_population_density",
        "status": "estimated",
        "warning": (
            "This is a density-based estimate, not a live count of people "
            "currently present in the area."
        ),
    }


@router.get("/api/population/summary")
def population_summary(
    area_id: str = Query(min_length=1, max_length=100),
    area_km2: float | None = Query(default=None, gt=0, le=100_000),
    density_per_km2: float | None = Query(
        default=None, ge=0, le=1_000_000
    ),
):
    """
    Return the latest report from the past six hours.
    If there is no recent report, optionally return a density-based estimate.
    Reports are never summed because they may overlap.
    """
    area_id = area_id.strip()
    if not area_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="Area ID cannot be blank.")

    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(hours=6)).isoformat()

    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, area_id, people_count, source, reported_by, note, created_at
            FROM population_reports
            WHERE area_id = ? AND created_at >= ?
            ORDER BY created_at DESC
            LIMIT 50
            """,
            (area_id, cutoff),
        ).fetchall()

    reports = [dict(row) for row in rows]

    if reports:
        latest = reports[0]
        return {
            "area_id": area_id,
            "people_count": latest["people_count"],
            "status": "reported",
            "source": latest["source"],
            "last_updated": latest["created_at"],
            "report_count": len(reports),
            "reports": reports,
            "warning": (
                "Showing the latest recent report. Reports are not added "
                "together because they may count the same people."
            ),
        }

    if area_km2 is not None and density_per_km2 is not None:
        return {
            "area_id": area_id,
            "people_count": round(area_km2 * density_per_km2),
            "status": "estimated",
            "source": "area_and_population_density",
            "last_updated": None,
            "report_count": 0,
            "reports": [],
            "warning": (
                "No recent report is available. This is a density-based "
                "estimate, not a live headcount."
            ),
        }

    return {
        "area_id": area_id,
        "people_count": None,
        "status": "unavailable",
        "source": None,
        "last_updated": None,
        "report_count": 0,
        "reports": [],
        "warning": (
            "No recent report or estimation inputs are available. "
            "Unavailable does not mean zero people."
        ),
    }