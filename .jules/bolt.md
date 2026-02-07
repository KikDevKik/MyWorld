## 2026-02-07 - [O(N^2) Bottleneck in Graph Links]
**Learning:** Found nested loops using `.find()` inside `useMemo` for link generation in `GraphSimulationV2`. This caused O(N^2) complexity, severely impacting performance for large graphs. Replacing with O(N) `Map` lookups yielded ~40-100x speedup.
**Action:** Always inspect `useMemo` blocks iterating over arrays for potential O(N²) complexity, especially in visual components handling large datasets.
