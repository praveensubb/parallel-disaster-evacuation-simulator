# Parallel Disaster Evacuation Simulator

A college-ready **software prototype** demonstrating CPU parallel computing with C++ and OpenMP. The React dashboard calls a FastAPI backend, which compiles/runs a C++ simulation engine and returns measured execution times.

## What it demonstrates

- Deterministic city-grid generation with roads, obstacles, safe zones, and simulated evacuees.
- Multi-source BFS to compute shortest grid distances to a safe zone.
- The same per-agent simulation workload in sequential and OpenMP-parallel modes.
- Measured execution time, speedup (`sequential_time / parallel_time`) and parallel efficiency (`speedup / threads`).
- React dashboard with city visualization and benchmark charts.

> **Academic honesty:** timings depend on your computer, compiler, thread count, and workload. The dashboard reports values measured from actual runs. Parallel mode may be slower for small workloads because of thread overhead. This is a simulation prototype, not a validated real-world emergency planning tool.

## Requirements (Windows)

1. Python 3.10+.
2. Node.js 18+ (includes npm).
3. A C++ compiler with OpenMP. Recommended: MinGW-w64 GCC installed through MSYS2, with `g++` available in PowerShell.
4. VS Code (recommended).

Check tools in PowerShell:

```powershell
python --version
node --version
npm --version
g++ --version
g++ -fopenmp --version
```

If `g++` is not recognized, install a MinGW-w64 GCC toolchain with OpenMP and add its `bin` directory to PATH. Restart VS Code after changing PATH.

## Run the application

Open **two VS Code terminals** from the project root.

### Terminal 1 — backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app:app --reload --port 8000
```

If PowerShell blocks activation, use `.\.venv\Scripts\python.exe -m pip install -r requirements.txt` and `.\.venv\Scripts\python.exe -m uvicorn app:app --reload --port 8000`.

Backend API docs: http://127.0.0.1:8000/docs

### Terminal 2 — frontend

```powershell
cd frontend
npm install
npm run dev
```

Open the URL printed by Vite, usually http://localhost:5173.

## How to use

1. Set grid size, population, obstacle percentage, disaster type, and thread count.
2. Click **Run benchmark**.
3. The backend runs sequential and parallel modes separately on the same deterministic scenario.
4. Review the city grid, evacuated-agent count, timing, speedup, efficiency, and thread comparison chart.

## API

- `GET /api/health` — checks backend and compiler availability.
- `POST /api/simulate` — runs sequential and parallel simulations.
- `GET /api/benchmark?grid_size=60&people=3000&obstacle_percent=15&threads=4&disaster=flood` — convenient benchmark endpoint.

## Project structure

```text
parallel-disaster-evacuation-simulator/
├── backend/
│   ├── app.py
│   ├── requirements.txt
│   └── cpp/
│       └── evacuation.cpp
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       └── styles.css
└── README.md
```

## Notes for your project report

- **Problem statement:** evacuation planning requires repeated route and agent calculations; independent agent calculations can be distributed across CPU threads.
- **Parallelization:** OpenMP `parallel for` divides per-agent work among worker threads.
- **Correctness:** the sequential and parallel modes use the same deterministic city, evacuees, and calculations. The backend checks the evacuated count and aggregate result.
- **Speedup:** `T_sequential / T_parallel`.
- **Efficiency:** `speedup / actual_threads_used`. Efficiency can exceed expectations or be low depending on CPU and overhead; discuss observed results rather than assuming a target.
- **Limitations:** the model uses a grid and simplified agent behavior. It is for demonstrating parallel computing, not operational emergency response.

## Troubleshooting

- **`g++` not found:** install a GCC/MinGW-w64 compiler with OpenMP and add its `bin` directory to PATH.
- **OpenMP not supported:** run `g++ -fopenmp backend/cpp/evacuation.cpp -o backend/cpp/evacuation.exe`; if that fails, your compiler build may lack OpenMP.
- **Frontend cannot reach backend:** confirm the API is running at port 8000 and refresh the browser.
- **No speedup:** test a larger population or grid, and try several thread counts. A parallel implementation is not guaranteed to outperform sequential execution on every workload.
