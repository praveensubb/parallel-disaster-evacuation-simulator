"""
GPS participant check-in API for the Parallel Disaster Evacuation Simulator.

This is an opt-in check-in system, not passive GPS tracking. A browser must ask
the participant for location permission. The API stores an approximate location
and expires check-ins after a configurable period.
"""
from datetime import datetime, timedelta, timezone
from math import radians, sin, cos, asin, sqrt
import os
import sqlite3
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/gps-population", tags=["GPS population"])

DB_PATH = Path(os.getenv("GPS_POPULATION_DB", str(Path(__file__).with_name("gps_population.db"))))
CHECKIN_TTL_MINUTES = int(os.getenv("GPS_CHECKIN_TTL_MINUTES", "30"))
MAX_RADIUS_METERS = 100_000


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


def connect_db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS gps_checkins (
                participant_id TEXT PRIMARY KEY,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                accuracy_m REAL,
                checked_in_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_gps_checkins_expires ON gps_checkins(expires_at)")


init_db()


class CheckInRequest(BaseModel):
    # Client-generated random ID; do not use a person's name/email as this ID.
    participant_id: str = Field(min_length=8, max_length=80, pattern=r"^[A-Za-z0-9_-]+$")
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy_m: Optional[float] = Field(default=None, ge=0, le=100_000)


class CheckInResponse(BaseModel):
    ok: bool
    message: str
    expires_at: str


class PopulationCountResponse(BaseModel):
    area_latitude: float
    area_longitude: float
    radius_meters: int
    active_checkins: int
    counted_at: str
    freshness_minutes: int
    note: str


def purge_expired(conn):
    now = utc_iso(utc_now())
    conn.execute("DELETE FROM gps_checkins WHERE expires_at <= ?", (now,))


def haversine_m(lat1, lon1, lat2, lon2) -> float:
    earth_radius_m = 6_371_000
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * earth_radius_m * asin(sqrt(min(1.0, a)))


@router.post("/check-in", response_model=CheckInResponse)
def check_in(payload: CheckInRequest):
    now = utc_now()
    expires = now + timedelta(minutes=CHECKIN_TTL_MINUTES)
    with connect_db() as conn:
        purge_expired(conn)
        conn.execute("""
            INSERT INTO gps_checkins
                (participant_id, latitude, longitude, accuracy_m, checked_in_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(participant_id) DO UPDATE SET
                latitude=excluded.latitude,
                longitude=excluded.longitude,
                accuracy_m=excluded.accuracy_m,
                checked_in_at=excluded.checked_in_at,
                expires_at=excluded.expires_at
        """, (
            payload.participant_id, payload.latitude, payload.longitude,
            payload.accuracy_m, utc_iso(now), utc_iso(expires)
        ))
    return CheckInResponse(
        ok=True,
        message="GPS check-in saved. It will expire automatically.",
        expires_at=utc_iso(expires),
    )


@router.get("/count", response_model=PopulationCountResponse)
def count_people(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    radius_meters: int = Query(500, ge=50, le=MAX_RADIUS_METERS),
):
    now = utc_now()
    cutoff = now - timedelta(minutes=CHECKIN_TTL_MINUTES)
    with connect_db() as conn:
        purge_expired(conn)
        rows = conn.execute("""
            SELECT latitude, longitude, accuracy_m, checked_in_at
            FROM gps_checkins
            WHERE checked_in_at >= ? AND expires_at > ?
        """, (utc_iso(cutoff), utc_iso(now))).fetchall()

    count = 0
    for row in rows:
        # Do not include very inaccurate readings: their area membership is unreliable.
        if row["accuracy_m"] is not None and row["accuracy_m"] > max(100, radius_meters):
            continue
        if haversine_m(latitude, longitude, row["latitude"], row["longitude"]) <= radius_meters:
            count += 1

    return PopulationCountResponse(
        area_latitude=latitude,
        area_longitude=longitude,
        radius_meters=radius_meters,
        active_checkins=count,
        counted_at=utc_iso(now),
        freshness_minutes=CHECKIN_TTL_MINUTES,
        note=(
            "This is the number of unique, consenting devices with recent check-ins, "
            "not a verified total headcount. People without check-ins are not counted."
        ),
    )


@router.delete("/check-in/{participant_id}")
def delete_check_in(participant_id: str):
    with connect_db() as conn:
        cursor = conn.execute(
            "DELETE FROM gps_checkins WHERE participant_id = ?",
            (participant_id,),
        )
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Check-in not found or already expired")
    return {"ok": True, "message": "Check-in removed."}


@router.get("/health")
def gps_population_health():
    return {
        "ok": True,
        "checkin_ttl_minutes": CHECKIN_TTL_MINUTES,
        "database": str(DB_PATH.name),
    }
