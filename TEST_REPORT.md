# TEST_REPORT.md

## Test levels
U = unit (no Adobe) · G = golden script snapshots · H = real app (Premiere/AE on İso's Mac).
A feature is "verified" only with H results recorded here, including app versions and OS.

## Environments
| Machine | OS | Premiere | After Effects | Notes |
|---|---|---|---|---|
| İso's MacBook Air (Apple Silicon) | macOS (version TBD) | 2026 (26.5.2 seen 2026-10-29) | TBD | Local Premiere MCP bridge present |

## Results
No product code yet → no tests run.

## Known bugs
None (no code).

## Inherited facts from the prototype (Creative Universe, 2026-10-29, not our code)
- Premiere 26.5.2 interprets imported PNG sequences at 25 fps by default → our importers must set frame rate explicitly.
- Full-range MP4 (yuvj420p) shows crushed blacks in editors → use BT.709 limited range.
