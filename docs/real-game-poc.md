# Slice 1C: real-game data-quality and review report

## Source verification and preservation

Game **2026020224**, Toronto Maple Leafs at Vancouver Canucks, October 31, 2026,
Rogers Arena, final **TOR 4-2 VAN**. Both endpoints returned usable matching
payloads, preserved locally with HTTP headers and a
[provenance manifest](../data/nhl/2026020224/provenance.json):

- [Play-by-play](https://api-web.nhle.com/v1/gamecenter/2026020224/play-by-play)
  snapshot: [play-by-play.json](../data/nhl/2026020224/play-by-play.json).
- [Shift charts](https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId=2026020224)
  snapshot: [shifts.json](../data/nhl/2026020224/shifts.json).

Retrieved 2026-11-03T19:11:44Z. Raw JSON bytes are never rewritten by normalization.
SHA256:

```text
play-by-play fbe21913afe5fd1fe755a4c1a62d675ece2cb6560467f1fe6868ed63f3f34ee7
shifts       6ef90aee39c443969144097f985782a27c32760f2882887c88b708ee161549d5
```

The play response supplies `plays` with eventId, typeDescKey, periodDescriptor,
timeInPeriod/timeRemaining, sortOrder, homeTeamDefendingSide and optional
details (coordinates, owner team, participant roles), plus rosterSpots.
The shift response supplies `total` and `data` rows with IDs, game/player/team,
period, startTime, endTime and duration. Parsers validate these actual fields;
complete unmodeled source fields remain in the preserved snapshots.

## Quality findings

| Metric | Full game |
| --- | ---: |
| Events | 308 |
| Complete coordinate pairs | 258 |
| Events without coordinates | 50 |
| Shift rows / reported total | 734 / 734 |
| Shifted players / roster entries | 38 / 40 |

Events include 57 hits, 54 faceoffs, 50 shots on goal, 43 stoppages,
36 blocked shots, 24 missed shots, 21 giveaways, 6 goals, 6 penalties,
4 takeaways and 7 period/game boundary events. Source event IDs are not
chronological; sorting uses normalized clocks and source sortOrder.

All regulation clocks reconcile elapsed + remaining = 20 minutes. Coordinate
ranges are x [-98, 99], y [-41, 41]. The conventional NHL 200 x 85 ft rink
normalizes x/100 and y/42.5, with dimensions 60.96 x 25.908 m.
Units are a domain assumption, not explicit coordinate-unit metadata.
Axes remain rink-fixed: center origin, positive x right, positive y up in Canvas.
All events agree on home defending side right/left/right in periods 1/2/3.
All six goal coordinate signs agree with the resulting attacking directions.
Neither possession nor period changes trigger a renderer coordinate flip.

All returned shifts have valid positive intervals, matching durations and
resolvable roster/team identities. One exact duplicate overlap exists:
Brandon Duhaime (8479520), rows 16813302/16813303, P1 19:09-19:35.
It is outside the chosen passage, retained in raw data and surfaced as a
warning; active membership is deduplicated. Returned rows appear complete
against `total`, but this is not proof of perfect underlying provider coverage.

## Selected passage

**P1 02:13-02:58**, 45 seconds, startGameMs 133000. Chosen from the actual
returned events for seven event types, activity at both ends and both teams:
11 events, 9 located, 17 intersecting shifts/players (15 skaters, 2 goalies).
There are 6 TOR and 11 VAN players represented across changes; 12 active
including goalies at sampled event times. Every selected event participant
resolves to an active shift at its timestamp.

| Relative seconds | Event ID | Type | Owner | Source x,y (feet) |
| ---: | ---: | --- | --- | --- |
| 0 | 10 | stoppage | unknown | unknown |
| 0 | 82 | faceoff | TOR | 69,22 |
| 5 | 11 | stoppage | unknown | unknown |
| 5 | 85 | faceoff | TOR | 69,-22 |
| 13 | 89 | shot-on-goal | TOR | 62,-39 |
| 15 | 90 | blocked-shot | TOR | 75,3 |
| 25 | 118 | hit | VAN | -90,-29 |
| 30 | 100 | giveaway | TOR | -34,-15 |
| 35 | 152 | missed-shot | VAN | -86,7 |
| 38 | 94 | shot-on-goal | VAN | -29,-23 |
| 42 | 127 | hit | TOR | -87,-35 |

## Evidence versus interpretation

**Observed source facts:** event times/types/locations/participants and shift
intervals. These are not independently observed player coordinates.
**Player samples: 0 observed, 0 inferred; all 17 player positions unknown.**
There are no defensible player-specific positional anchors, so reconstruction
deliberately emits empty trajectories rather than interpolating event locations
or placing active players arbitrarily. Unknown records prohibit coordinates.
Future inferred records require source anchors and reuse existing interpolated
position contracts; schema support does not establish evidence.

The event adapter uses the existing Canvas renderer and palettes, interpreting
located owned events as stationary seeded pixel patches. Artistic offsets,
event-type density/intensity weights and six-second fading are not measurements,
new event simulations, player movement or impact physics. No paths join events;
missing locations are skipped. The source remains immutable and traceable by
endpoint, raw path, JSON pointer and record ID. Shift participation is inspectable,
not positional. Synthetic source-path tracers are unchanged.

## Repeatable review

From the repository root:

```sh
npm ci
npm run build
PORT=3032 npm start
```

Open **http://localhost:3032**, select **NHL TOR / VAN / recorded events**.
Both sources start paused at zero, 1x, defaults loaded. Reset restores the
selected source; switching resets settings/playback; reload selects synthetic.
TOR/VAN seeds are 7219/1823. No external service or manual data preparation is
needed after installation/build. Direct-Node startup is documented in the
[README](../README.md#canonical-production-demonstration).

Captures use 1440 x 1000 viewport, DPR 1, default settings:

| Capture | Relative time | Game clock | Activity |
| --- | ---: | --- | --- |
| real-game-14s.png | 14000 ms | P1 02:27 | TOR shot location |
| real-game-26s.png | 26000 ms | P1 02:39 | VAN hit location |
| real-game-43s.png | 43000 ms | P1 02:56 | VAN shot and TOR hit locations |

Production Chrome 156 verification covers canonical load, paused zero/1x,
play/pause, full Reset after settings/debug/speed changes, repeated seeks in
both directions, source switching twice, reload, diagnostics and 390 px layout.
Synthetic Canvas hashes at 9/16/26 seconds match Slice 1B.1 exactly.
Real repeated timestamp hashes match on a fixed readback-oriented Canvas
backend; timings use a separate unmodified context. Rasterization may differ
across devices/backends; engine state is deterministic.

Final validation passed: **64 tests** (41 web, 4 contracts, 19 engine),
`npm run typecheck`, and `npm run build`, including both static data routes.
The twelve new real-game tests cover payload hashes/parsing, identity and
malformed records, coordinates/orientation/clocks, shift boundaries and active
participants, provenance, unknown/observed/inferred distinctions, frozen-source
preservation, deterministic interpretation/rendering, configuration and loader
failures.

## Paired performance

Apple M1 Pro, Node 26.3.1, Chrome 156.0.8078.80 headless, shared machine.
Engine: 60 warm-up calls, 100 ms sweep, 301 synthetic / 451 real samples.
Browser: 30 warm-up iterations, 120 measured per source, alternating draw order,
same 1182 x 618 Canvas, three documented timestamps per source.

| Metric | Synthetic tracer baseline | Real event study |
| --- | ---: | ---: |
| Represented players | 10 | 17 |
| Source events (passage / full game) | none | 11 / 308 |
| Observed player samples | 3004 synthetic | 0 |
| Inferred source player samples | 0 | 0 |
| Compiled births / event marks | 13526 | 442 |
| Peak active particle appearances (100 ms sweep) | 2485 | 123 |
| Peak tracer segments | 600 | 0 |
| Compilation | 58.54 ms | 3.970 ms |
| Engine mean / p95 | 1.487 / 3.058 ms | 0.01555 / 0.017 ms |
| Browser renderer mean / p95 (final build) | 18.66 / 53.20 ms | 1.10 / 3.00 ms |
| Browser renderer maximum (final build) | 324.00 ms | 42.10 ms |

Browser timings measure renderer-call dispatch, not deferred GPU raster or
compositing. Workloads are radically different; lower real cost does not prove
faster real tracking. The preceding run measured synthetic mean/p95
13.00/40.00 ms and real 1.14/4.80 ms; substantial shared-machine variability
and outliers remain. **Stable 60 fps is not verified.**

## Limitations and follow-up

- The real study is sparse stationary event artwork, not continuous tracers or
  reconstructed skating. Blank gaps and single-team moments are truthful.
- Six-second player tracers cannot be exercised on real data without anchors.
  Movement-specific Studio controls are explicitly marked unused in this view.
- The normalizer intentionally supports only this verified regulation game and
  fixed selected passage, not a general NHL client, overtime or shootouts.
- Provider coordinates are coarse event metadata, not calibrated player tracking.
  Shift participation cannot resolve spatial proximity or speed.
- Diagnostics expose evidence but are not an analytics dashboard.
- Profile Canvas allocations/draw calls on target exhibition hardware; review
  artistic usefulness before expanding scope. Any future reconstruction needs
  genuine player-specific positional evidence and bounded-gap provenance.
- No collision physics, vision, video ingestion or next milestone implemented.
