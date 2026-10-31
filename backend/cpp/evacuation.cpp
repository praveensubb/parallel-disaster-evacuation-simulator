
#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <queue>
#include <random>
#include <string>
#include <vector>
#include <omp.h>

struct Person {
    int r;
    int c;
};

static int idx(int r, int c, int n) {
    return r * n + c;
}

struct MovementPath {
    int person_id;
    std::vector<std::pair<int, int>> path;
};

int main(int argc, char** argv) {
    if (argc < 7) {
        std::cerr
            << "Usage: evacuation <grid_size> <people> "
            << "<obstacle_percent> <threads> <disaster> <mode>\n";
        return 2;
    }

    int n = std::max(20, std::min(120, std::atoi(argv[1])));
    int people_count = std::max(1, std::min(20000, std::atoi(argv[2])));
    int obstacle_pct = std::max(0, std::min(35, std::atoi(argv[3])));
    int threads = std::max(1, std::min(64, std::atoi(argv[4])));

    std::string disaster = argv[5];
    std::string mode = argv[6];
    bool parallel = (mode == "parallel");

    omp_set_dynamic(0);
    omp_set_num_threads(threads);

    // Fixed seed ensures repeatable scenario generation.
    std::mt19937 rng(20261010);
    std::uniform_int_distribution<int> pos(0, n - 1);
    std::uniform_int_distribution<int> pct(0, 99);

    // Cell types:
    // 0 = walkable, 1 = obstacle, 2 = safe zone, 3 = hazard.
    std::vector<int> grid(n * n, 0);

    for (int r = 0; r < n; ++r) {
        for (int c = 0; c < n; ++c) {
            if (pct(rng) < obstacle_pct) {
                grid[idx(r, c, n)] = 1;
            }
        }
    }

    // Four safe zones near the corners.
    std::vector<std::pair<int, int>> safe = {
        {1, 1},
        {1, n - 2},
        {n - 2, 1},
        {n - 2, n - 2}
    };

    for (const auto& p : safe) {
        grid[idx(p.first, p.second, n)] = 2;
    }

    // Central hazard region.
    int radius = std::max(2, n / 12);
    int center = n / 2;

    for (int r = center - radius; r <= center + radius; ++r) {
        for (int c = center - radius; c <= center + radius; ++c) {
            if (r >= 0 && c >= 0 && r < n && c < n &&
                grid[idx(r, c, n)] != 2) {
                grid[idx(r, c, n)] = 3;
            }
        }
    }

    // Multi-source BFS: shortest distance to a safe zone.
    // This retains the original distance calculation behavior.
    const int INF = 1000000;
    std::vector<int> dist(n * n, INF);
    std::queue<std::pair<int, int>> q;

    for (const auto& p : safe) {
        int k = idx(p.first, p.second, n);
        dist[k] = 0;
        q.push(p);
    }

    const int dr[4] = {-1, 1, 0, 0};
    const int dc[4] = {0, 0, -1, 1};

    while (!q.empty()) {
        auto current = q.front();
        q.pop();

        int r = current.first;
        int c = current.second;

        for (int d = 0; d < 4; ++d) {
            int nr = r + dr[d];
            int nc = c + dc[d];

            if (nr < 0 || nc < 0 || nr >= n || nc >= n) {
                continue;
            }

            int k = idx(nr, nc, n);

            if (grid[k] == 1 || dist[k] != INF) {
                continue;
            }

            dist[k] = dist[idx(r, c, n)] + 1;
            q.push({nr, nc});
        }
    }

    // Generate people using the same deterministic random scenario.
    std::vector<Person> people;
    people.reserve(people_count);

    for (int i = 0; i < people_count; ++i) {
        int r = pos(rng);
        int c = pos(rng);
        int tries = 0;

        while ((grid[idx(r, c, n)] == 1 ||
                grid[idx(r, c, n)] == 2) &&
               tries++ < 100) {
            r = pos(rng);
            c = pos(rng);
        }

        people.push_back({r, c});
    }

    std::vector<double> arrival(people_count, 0.0);
    std::vector<int> evacuated(people_count, 0);

    // Benchmark only the original per-person computation.
    auto start = std::chrono::steady_clock::now();

    if (parallel) {
        #pragma omp parallel for schedule(static)
        for (int i = 0; i < people_count; ++i) {
            const Person p = people[i];
            int d = dist[idx(p.r, p.c, n)];

            double risk = 0.0;
            double progress = 0.0;
            const int steps = 240;

            for (int s = 0; s < steps; ++s) {
                double phase =
                    static_cast<double>((i * 17 + s * 13) % 997) / 997.0;

                double hazard_factor =
                    (grid[idx(p.r, p.c, n)] == 3) ? 1.7 : 1.0;

                risk += phase * hazard_factor / (1.0 + (s % 11));

                progress +=
                    (d < INF ? 1.0 / (1.0 + d) : 0.0) *
                    (0.5 + phase);
            }

            bool ok = d < INF && grid[idx(p.r, p.c, n)] != 3;

            evacuated[i] = ok ? 1 : 0;
            arrival[i] = ok
                ? d + risk * 0.02 + (progress > 0 ? 0.1 : 0.0)
                : INF;
        }
    } else {
        for (int i = 0; i < people_count; ++i) {
            const Person p = people[i];
            int d = dist[idx(p.r, p.c, n)];

            double risk = 0.0;
            double progress = 0.0;
            const int steps = 240;

            for (int s = 0; s < steps; ++s) {
                double phase =
                    static_cast<double>((i * 17 + s * 13) % 997) / 997.0;

                double hazard_factor =
                    (grid[idx(p.r, p.c, n)] == 3) ? 1.7 : 1.0;

                risk += phase * hazard_factor / (1.0 + (s % 11));

                progress +=
                    (d < INF ? 1.0 / (1.0 + d) : 0.0) *
                    (0.5 + phase);
            }

            bool ok = d < INF && grid[idx(p.r, p.c, n)] != 3;

            evacuated[i] = ok ? 1 : 0;
            arrival[i] = ok
                ? d + risk * 0.02 + (progress > 0 ? 0.1 : 0.0)
                : INF;
        }
    }

    auto end = std::chrono::steady_clock::now();

    double elapsed =
        std::chrono::duration<double, std::milli>(end - start).count();

    int total_evacuated = 0;
    double sum_arrival = 0.0;

    for (int i = 0; i < people_count; ++i) {
        total_evacuated += evacuated[i];

        if (evacuated[i]) {
            sum_arrival += arrival[i];
        }
    }

    // Build movement traces AFTER timing so visualization work
    // does not distort the sequential/parallel benchmark.
    // At most 200 evacuees are included in the animation.
    const int MAX_TRACED_PEOPLE = 200;
    const int MAX_PATH_STEPS = 500;

    std::vector<MovementPath> movement_paths;
    movement_paths.reserve(std::min(total_evacuated, MAX_TRACED_PEOPLE));

    for (int i = 0;
         i < people_count &&
         static_cast<int>(movement_paths.size()) < MAX_TRACED_PEOPLE;
         ++i) {

        if (!evacuated[i]) {
            continue;
        }

        int r = people[i].r;
        int c = people[i].c;

        MovementPath trace;
        trace.person_id = i;
        trace.path.push_back({r, c});

        // Follow decreasing BFS distance until a safe zone is reached.
        // Neighbor order is fixed to keep paths deterministic.
        int steps = 0;

        while (grid[idx(r, c, n)] != 2 &&
               steps < MAX_PATH_STEPS) {

            int current_dist = dist[idx(r, c, n)];
            bool moved = false;

            for (int d = 0; d < 4; ++d) {
                int nr = r + dr[d];
                int nc = c + dc[d];

                if (nr < 0 || nc < 0 || nr >= n || nc >= n) {
                    continue;
                }

                int next_idx = idx(nr, nc, n);

                if (grid[next_idx] == 1) {
                    continue;
                }

                if (dist[next_idx] == current_dist - 1) {
                    r = nr;
                    c = nc;
                    trace.path.push_back({r, c});
                    moved = true;
                    ++steps;
                    break;
                }
            }

            if (!moved) {
                break;
            }
        }

        movement_paths.push_back(std::move(trace));
    }

    // JSON output consumed by FastAPI and React.
    std::cout
        << "{\"mode\":\""
        << (parallel ? "parallel" : "sequential")
        << "\",\"grid_size\":" << n
        << ",\"people\":" << people_count
        << ",\"obstacle_percent\":" << obstacle_pct
        << ",\"threads_requested\":" << threads
        << ",\"threads_used\":"
        << (parallel ? omp_get_max_threads() : 1)
        << ",\"disaster\":\"" << disaster << "\""
        << ",\"execution_ms\":" << elapsed
        << ",\"evacuated\":" << total_evacuated
        << ",\"not_evacuated\":" << (people_count - total_evacuated)
        << ",\"average_arrival_steps\":"
        << (total_evacuated
            ? sum_arrival / total_evacuated
            : 0.0)
        << ",\"grid\":[";

    for (int i = 0; i < n * n; ++i) {
        if (i) std::cout << ",";
        std::cout << grid[i];
    }

    std::cout << "],\"people_positions\":[";

    for (int i = 0; i < people_count; ++i) {
        if (i) std::cout << ",";
        std::cout << "[" << people[i].r << "," << people[i].c << "]";
    }

    std::cout << "],\"safe_zones\":[";

    for (int i = 0; i < static_cast<int>(safe.size()); ++i) {
        if (i) std::cout << ",";
        std::cout << "[" << safe[i].first << "," << safe[i].second << "]";
    }

    std::cout << "],\"movement_paths\":[";

    for (int i = 0; i < static_cast<int>(movement_paths.size()); ++i) {
        if (i) std::cout << ",";

        const MovementPath& trace = movement_paths[i];

        std::cout << "{\"person_id\":" << trace.person_id
                  << ",\"path\":[";

        for (int j = 0; j < static_cast<int>(trace.path.size()); ++j) {
            if (j) std::cout << ",";

            std::cout << "["
                      << trace.path[j].first << ","
                      << trace.path[j].second << "]";
        }

        std::cout << "]}";
    }

    std::cout << "]}";

    return 0;
}
