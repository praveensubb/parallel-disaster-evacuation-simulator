from __future__ import annotations



import json

import os

import shutil

import subprocess

from pathlib import Path

from statistics import mean, median

from typing import Literal



from fastapi import FastAPI, HTTPException, Query

from fastapi.middleware.cors import CORSMiddleware

from pydantic import BaseModel, Field

from population_routes import router as population_router
from gps_population_routes import router as gps_population_router





# --------------------------------------------------

# Configuration

# --------------------------------------------------



BASE_DIR = Path(__file__).resolve().parent

CPP_SOURCE = BASE_DIR / "cpp" / "evacuation.cpp"

IS_WINDOWS = os.name == "nt"

BINARY = BASE_DIR / "cpp" / (

    "evacuation.exe" if IS_WINDOWS else "evacuation"

)



app = FastAPI(

    title="Parallel Disaster Evacuation Simulator API",

    version="1.2.0",

    description=(

        "Educational disaster evacuation simulation with sequential, "

        "OpenMP thread-scaling, and workload-size benchmarks."

    ),

)



app.add_middleware(

    CORSMiddleware,

    allow_origins=[

        "http://localhost:5173",

        "http://127.0.0.1:5173",

    ],

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"],

)


app.include_router(population_router)
app.include_router(gps_population_router)





# --------------------------------------------------

# Request model

# --------------------------------------------------



class SimulationRequest(BaseModel):

    grid_size: int = Field(default=50, ge=20, le=120)

    people: int = Field(default=1500, ge=1, le=20000)

    obstacle_percent: int = Field(default=12, ge=0, le=35)

    threads: int = Field(default=4, ge=1, le=64)

    disaster: Literal["flood", "fire"] = "flood"





# --------------------------------------------------

# C++ compiler and engine

# --------------------------------------------------



def compiler_path() -> str | None:

    """Find an available C++ compiler."""

    return (

        shutil.which("g++")

        or shutil.which("g++-13")

        or shutil.which("clang++")

    )





def compile_engine() -> None:

    """Compile the C++ simulation with OpenMP support."""

    compiler = compiler_path()



    if not compiler:

        raise HTTPException(

            status_code=503,

            detail=(

                "C++ compiler not found. Install GCC with OpenMP support "

                "and ensure g++ is available on PATH."

            ),

        )



    if not CPP_SOURCE.exists():

        raise HTTPException(

            status_code=500,

            detail=f"C++ source file missing: {CPP_SOURCE}",

        )



    command = [

        compiler,

        "-O2",

        "-std=c++14",

        "-fopenmp",

        str(CPP_SOURCE),

        "-o",

        str(BINARY),

    ]



    try:

        result = subprocess.run(

            command,

            capture_output=True,

            text=True,

            timeout=60,

            cwd=str(BASE_DIR),

        )

    except subprocess.TimeoutExpired:

        raise HTTPException(

            status_code=504,

            detail="C++ compilation exceeded 60 seconds.",

        )



    if result.returncode != 0:

        raise HTTPException(

            status_code=503,

            detail=(

                "Could not compile the OpenMP engine. Check the compiler "

                "and OpenMP installation.\n" + result.stderr[-3000:]

            ),

        )





def ensure_engine() -> None:

    """Compile the engine if it is missing or older than its source."""

    if not CPP_SOURCE.exists():

        raise HTTPException(

            status_code=500,

            detail=f"C++ source file missing: {CPP_SOURCE}",

        )



    if (

        not BINARY.exists()

        or BINARY.stat().st_mtime < CPP_SOURCE.stat().st_mtime

    ):

        compile_engine()





def run_engine(

    req: SimulationRequest,

    mode: str,

    threads: int,

) -> dict:

    """Run the C++ engine and parse its JSON output."""

    ensure_engine()



    command = [

        str(BINARY),

        str(req.grid_size),

        str(req.people),

        str(req.obstacle_percent),

        str(threads),

        req.disaster,

        mode,

    ]



    try:

        result = subprocess.run(

            command,

            capture_output=True,

            text=True,

            timeout=45,

            cwd=str(BASE_DIR),

        )

    except subprocess.TimeoutExpired:

        raise HTTPException(

            status_code=504,

            detail=(

                "Simulation exceeded 45 seconds. Reduce the population "

                "or grid size."

            ),

        )



    if result.returncode != 0:

        raise HTTPException(

            status_code=500,

            detail="Simulation engine failed: " + result.stderr[-2000:],

        )



    try:

        return json.loads(result.stdout)

    except json.JSONDecodeError:

        raise HTTPException(

            status_code=500,

            detail="Simulation engine returned invalid JSON.",

        )





def compact_result(result: dict) -> dict:

    """Remove visualization arrays from compact result objects."""

    excluded = ("grid", "people_positions", "safe_zones", "movement_paths")

    return {

        key: value

        for key, value in result.items()

        if key not in excluded

    }





# --------------------------------------------------

# Correctness validation

# --------------------------------------------------



def results_match(sequential: dict, parallel: dict) -> bool:

    """Check whether the main sequential and parallel outcomes match."""

    if sequential["evacuated"] != parallel["evacuated"]:

        return False



    if sequential["not_evacuated"] != parallel["not_evacuated"]:

        return False



    return abs(

        float(sequential["average_arrival_steps"])

        - float(parallel["average_arrival_steps"])

    ) < 1e-9





# --------------------------------------------------

# Health endpoint

# --------------------------------------------------



@app.get("/api/health")

def health():

    compiler = compiler_path()

    return {

        "status": "ok",

        "compiler_found": compiler is not None,

        "compiler": compiler,

        "engine_source_exists": CPP_SOURCE.exists(),

        "engine_compiled": BINARY.exists(),

    }





# --------------------------------------------------

# Main simulation endpoint

# --------------------------------------------------



@app.post("/api/simulate")

def simulate(req: SimulationRequest):

    sequential = run_engine(req, "sequential", 1)

    parallel = run_engine(req, "parallel", req.threads)



    if not results_match(sequential, parallel):

        raise HTTPException(

            status_code=500,

            detail=(

                "Sequential and parallel outcomes do not match. "

                "Correctness check failed."

            ),

        )



    sequential_ms = float(sequential["execution_ms"])

    parallel_ms = float(parallel["execution_ms"])

    speedup = sequential_ms / parallel_ms if parallel_ms > 0 else 0.0

    threads_used = max(1, int(parallel["threads_used"]))

    efficiency = speedup / threads_used



    return {

        "scenario": {

            "grid_size": req.grid_size,

            "people": req.people,

            "obstacle_percent": req.obstacle_percent,

            "threads": req.threads,

            "disaster": req.disaster,

        },

        "sequential": compact_result(sequential),

        "parallel": compact_result(parallel),

        "performance": {

            "sequential_ms": sequential_ms,

            "parallel_ms": parallel_ms,

            "speedup": speedup,

            "efficiency": efficiency,

            "threads_used": parallel["threads_used"],

            "correctness_passed": True,

        },

        "visualization": {

            "grid": parallel["grid"],

            "people_positions": parallel["people_positions"][:2500],

            "safe_zones": parallel["safe_zones"],

            "movement_paths": parallel.get("movement_paths", []),

        },

        "note": (

            "Execution times measure the C++ agent-processing loop. "

            "Results vary by hardware and workload. This is an educational "

            "simulation, not a real evacuation planning tool."

        ),

    }





# --------------------------------------------------

# Existing single-run benchmark endpoint

# --------------------------------------------------



@app.get("/api/benchmark")

def benchmark(

    grid_size: int = Query(default=50, ge=20, le=120),

    people: int = Query(default=1500, ge=1, le=20000),

    obstacle_percent: int = Query(default=12, ge=0, le=35),

    threads: int = Query(default=4, ge=1, le=64),

    disaster: Literal["flood", "fire"] = "flood",

):

    req = SimulationRequest(

        grid_size=grid_size,

        people=people,

        obstacle_percent=obstacle_percent,

        threads=threads,

        disaster=disaster,

    )

    return simulate(req)





# --------------------------------------------------

# Repeated benchmark and thread-scaling endpoint

# --------------------------------------------------



@app.get("/api/benchmark-scaling")

def benchmark_scaling(

    grid_size: int = Query(default=50, ge=20, le=120),

    people: int = Query(default=5000, ge=1, le=20000),

    obstacle_percent: int = Query(default=12, ge=0, le=35),

    repeats: int = Query(default=3, ge=1, le=10),

    disaster: Literal["flood", "fire"] = "flood",

):

    """Compare repeated runs at 1, 2, 4, and 8 requested OpenMP threads."""

    req = SimulationRequest(

        grid_size=grid_size,

        people=people,

        obstacle_percent=obstacle_percent,

        threads=1,

        disaster=disaster,

    )



    sequential_times = []

    sequential_reference = None



    for _ in range(repeats):

        result = run_engine(req, "sequential", 1)

        sequential_times.append(float(result["execution_ms"]))



        if sequential_reference is None:

            sequential_reference = result

        elif not results_match(sequential_reference, result):

            raise HTTPException(

                status_code=500,

                detail="Sequential runs produced different outcomes.",

            )



    sequential_average = mean(sequential_times)

    scaling_results = []



    for thread_count in [1, 2, 4, 8]:

        parallel_times = []

        parallel_result = None



        for _ in range(repeats):

            result = run_engine(req, "parallel", thread_count)



            if not results_match(sequential_reference, result):

                raise HTTPException(

                    status_code=500,

                    detail=(

                        f"Correctness check failed at "

                        f"{thread_count} requested threads."

                    ),

                )



            parallel_times.append(float(result["execution_ms"]))

            parallel_result = result



        parallel_average = mean(parallel_times)

        speedup = (

            sequential_average / parallel_average

            if parallel_average > 0

            else 0.0

        )



        scaling_results.append({

            "threads": thread_count,

            "average_ms": round(parallel_average, 4),

            "median_ms": round(median(parallel_times), 4),

            "speedup": round(speedup, 4),

            "efficiency": round(speedup / thread_count, 4),

            "threads_used": parallel_result["threads_used"],

            "evacuated": parallel_result["evacuated"],

            "not_evacuated": parallel_result["not_evacuated"],

            "correctness_passed": True,

            "individual_times_ms": [

                round(value, 4) for value in parallel_times

            ],

        })



    return {

        "scenario": {

            "grid_size": req.grid_size,

            "people": req.people,

            "obstacle_percent": req.obstacle_percent,

            "disaster": req.disaster,

            "repeats": repeats,

        },

        "sequential_baseline": {

            "average_ms": round(sequential_average, 4),

            "median_ms": round(median(sequential_times), 4),

            "individual_times_ms": [

                round(value, 4) for value in sequential_times

            ],

        },

        "thread_scaling": scaling_results,

        "correctness_passed": True,

        "note": (

            "Timings measure the C++ agent-processing loop, excluding "

            "compilation and process startup. Speedup is sequential average "

            "divided by parallel average; efficiency is speedup divided by "

            "requested threads. Educational simulation only."

        ),

    }





# --------------------------------------------------

# Workload-size comparison endpoint

# --------------------------------------------------



@app.get("/api/benchmark-workloads")

def benchmark_workloads(

    grid_size: int = Query(default=50, ge=20, le=120),

    obstacle_percent: int = Query(default=12, ge=0, le=35),

    repeats: int = Query(default=3, ge=1, le=10),

    disaster: Literal["flood", "fire"] = "flood",

):

    """

    Compare 1,000, 5,000, and 10,000 people.

    Each workload includes a sequential baseline and parallel runs

    at 1, 2, 4, and 8 requested threads.

    """

    workload_sizes = [1000, 5000, 10000]

    thread_counts = [1, 2, 4, 8]

    workload_results = []



    for population in workload_sizes:

        req = SimulationRequest(

            grid_size=grid_size,

            people=population,

            obstacle_percent=obstacle_percent,

            threads=1,

            disaster=disaster,

        )



        sequential_times = []

        sequential_reference = None



        for _ in range(repeats):

            result = run_engine(req, "sequential", 1)

            sequential_times.append(float(result["execution_ms"]))



            if sequential_reference is None:

                sequential_reference = result

            elif not results_match(sequential_reference, result):

                raise HTTPException(

                    status_code=500,

                    detail=(

                        f"Sequential correctness failed for "

                        f"population {population}."

                    ),

                )



        sequential_average = mean(sequential_times)

        scaling_results = []



        for thread_count in thread_counts:

            parallel_times = []

            parallel_reference = None



            for _ in range(repeats):

                result = run_engine(req, "parallel", thread_count)



                if not results_match(sequential_reference, result):

                    raise HTTPException(

                        status_code=500,

                        detail=(

                            f"Correctness check failed for {population} "

                            f"people at {thread_count} requested threads."

                        ),

                    )



                parallel_times.append(float(result["execution_ms"]))

                parallel_reference = result



            parallel_average = mean(parallel_times)

            speedup = (

                sequential_average / parallel_average

                if parallel_average > 0

                else 0.0

            )



            scaling_results.append({

                "threads": thread_count,

                "average_ms": round(parallel_average, 4),

                "median_ms": round(median(parallel_times), 4),

                "speedup": round(speedup, 4),

                "efficiency": round(speedup / thread_count, 4),

                "threads_used": parallel_reference["threads_used"],

                "correctness_passed": True,

                "individual_times_ms": [

                    round(value, 4) for value in parallel_times

                ],

            })



        workload_results.append({

            "people": population,

            "sequential_average_ms": round(sequential_average, 4),

            "sequential_median_ms": round(median(sequential_times), 4),

            "sequential_individual_times_ms": [

                round(value, 4) for value in sequential_times

            ],

            "thread_scaling": scaling_results,

            "correctness_passed": True,

        })



    return {

        "scenario": {

            "grid_size": grid_size,

            "obstacle_percent": obstacle_percent,

            "disaster": disaster,

            "repeats": repeats,

            "workload_sizes": workload_sizes,

            "thread_counts": thread_counts,

        },

        "workload_results": workload_results,

        "correctness_passed": True,

        "note": (

            "Timings measure the C++ agent-processing loop, excluding "

            "compilation and process startup. Speedup is sequential average "

            "divided by parallel average; efficiency is speedup divided by "

            "requested threads. Results depend on hardware and workload. "

            "Educational simulation only."

        ),

    }
