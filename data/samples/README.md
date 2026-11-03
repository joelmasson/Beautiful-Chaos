# Sample data

[`neutral-zone-attack.json`](neutral-zone-attack.json) is an illustrative,
deterministic 30-second sequence, not an NHL reconstruction. It has ten skaters
(five per fictional team), sequence-scoped temporary IDs, and normalized
rink-centered coordinates.

## Choreography

- 0–4 seconds: Team A breaks out; Team B starts retreating.
- 4–9 seconds: both teams transition through the neutral zone.
- 9–13 seconds: Team A attacks, with wide forwards and trailing support.
- 13–16 seconds: A-01 moves into the slot for an illustrative shot at 16 seconds.
- 16–19 seconds: forwards move into rebound/support positions.
- 19–30 seconds: Team B transitions back toward the other end while Team A
  returns to defensive positions.

There is no puck, goalie, shot event stream, or outcome model in this slice.
The shot phase is represented by skater choreography, not an actual measured shot.

## Generation and gaps

[`generate.ts`](generate.ts) samples hand-authored piecewise-linear waypoints
at 100 ms intervals, including both endpoints. This is synthetic observation
generation, not runtime gap interpolation. Every stored position has
`kind: "observed"` and confidence method `synthetic`; confidence scores are
illustrative, not calibrated model probabilities. A per-track seeded integer
generator supplies those scores, with fixed default seed `7219`. Hand-authored
paths and omission times remain coordinated and unchanged by the seed; no
random walking is used. `generateSyntheticSequence(seed)` accepts an unsigned
32-bit seed for reproducible confidence variation, while the CLI always writes
the canonical default-seed fixture.

There are 3,004 stored observations out of 3,010 possible samples:

| Track | Omitted timestamps (ms) |
| --- | --- |
| A-03 | 11700, 11800, 11900 |
| B-04 | 15800 |
| B-03 | 21400, 21500 |

Omissions are absent entries, never zero coordinates or fabricated positions.
All ten tracks are present at both sequence endpoints.

This is the single canonical demo fixture loaded automatically by the app.
Keep its timestamps, assignments, paths, and seed stable between slices unless
a deliberate change is documented. Default artistic seeds are separately
7219 (Team A) and 1823 (Team B); source confidence is not artistic configuration.
See the [production demo guide](../../README.md#canonical-production-demonstration)
for startup, full-state Reset, and review moments at 9, 16, and 26 seconds.

The viewer interpolates display positions only between adjacent observed
samples. It hides a track between samples when either endpoint is missing,
including the interval just before the first omission, until an exact valid
sample is reached. It never alters this JSON. See
[coordinate and playback conventions](../../docs/data-contracts.md) for axes,
boundaries, timestamp units, and period-direction assumptions.

Regenerate from the repository root:

```sh
npm run generate:sample --workspace @beautiful-chaos/web
```

The generator validates against shared contracts before writing JSON. The web
tests check exact byte-for-byte reproduction and keep each skating segment
below 7 m/s on the 60 m by 26 m rink.

Do not commit broadcast footage or real player-identifying data.
