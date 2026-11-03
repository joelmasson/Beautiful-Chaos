# Generative engine

This TypeScript package interprets validated, normalized movement as two
independent, deterministic particle systems. It has no Canvas, React, video,
or computer-vision dependencies. The web renderer paints its output.

## Usage

```ts
import {
  createDefaultParticleConfig,
  createParticleEngine,
} from "@beautiful-chaos/generative-engine";

// sequence has already passed MovementSequenceSchema validation.
const config = createDefaultParticleConfig(sequence.teams.map((team) => team.teamId));
const engine = createParticleEngine(sequence, config);
const frame = engine.frameAt(16000);
```

Configuration must match exactly two distinct source team IDs. Presets are
assigned in the supplied ID order; configuration lookup uses explicit IDs, not
array order or source diagnostic colors. Engine construction validates artistic
configuration and reports mismatches or excessive workloads explicitly.
Movement validation remains at the shared-contract loading boundary.

`births` is an immutable, time-sorted compilation of emissions.
`frameAt(timestampMs)` returns independent particle appearances, with a current
point (or `null`) and short wake samples, plus `traces`: historical player-path
segments with clipped endpoints and age-dependent rendering attributes.
A particle may have only a fading wake after its head expires. Calling frames in any order gives the
same result. Times clamp to the sequence duration; non-finite times reject.
Neither source data nor caller configuration is modified.

## Independent configuration

### Recorded-event adapter (Slice 1C)

`createRecordedEventEngine(passage, config)` consumes a validated
`RealGamePassage` and the same two-team configuration. It returns `markCount`
and `frameAt(time)` using the existing `ParticleFrame` API. With no supported
player anchors, it emits no `traces` and never connects events. Stationary
seeded patches are artistic offsets around recorded event locations, identified
by event IDs rather than player tracking IDs.

Palette, seed, size, opacity, visual/trail intensity and persistence apply.
`emissionRate` controls bounded mark density per recorded event (maximum 96);
it is not continuous skater emission. Event-type weights alter density and
intensity, not source facts or physical behavior. Persistence controls fading
over `max(100, trailPersistenceMs)` milliseconds. Lifespan, movement influence,
wander and tracer width are unused because no player paths exist.
Missing locations/owner teams produce no marks. No synthetic opening rule is
applied to real data. Six-second source-path tracers remain unchanged in the
movement engine. See the [POC report](../../docs/real-game-poc.md) for paired
measurements and evidence limitations.

`DuelingPixelsConfig` contains `systems: ParticleSystemConfig[]`, validated by
the shared schema to exactly two distinct systems. Each supports:

| Property | Meaning / allowed range | Cool preset | Warm preset |
| --- | --- | --- | --- |
| `teamId` | Explicit source team ID | First supplied ID | Second supplied ID |
| `palette` | 1-8 six-digit hex colors | `#136cff`, `#00d5ff`, `#d9faff` | `#ff7224`, `#f13d32`, `#ffc35c` |
| `seed` | Integer 0-4294967295 | 7219 | 1823 |
| `lifespanMs` | Head lifespan, 100-8000 ms | 4200 | 2400 |
| `emissionRate` | Particles/s per skater at 4 m/s and full confidence, 0-120 | 70 | 90 |
| `particleSize` | Base square size, 0.5-8 CSS px | 2 | 2.2 |
| `opacity` | Base opacity, 0-1 | 0.85 | 0.9 |
| `trailPersistenceMs` | Observed player history, 0-10000 ms | 6000 | 6000 |
| `trailWidth` | Tracer core width, 0.5-8 CSS px | 2 | 2.2 |
| `trailIntensity` | Tracer opacity multiplier, 0-2 | 1 | 1 |
| `movementInfluence` | Velocity response, 0-2 | 0.2 | 0.35 |
| `visualIntensity` | Opacity multiplier, 0-2, clamped to visible alpha 1 | 1 | 1 |
| `wanderMeters` | Seeded perpendicular motion amplitude, 0-2 m | 0.35 | 0.9 |

These are artistic defaults, not permanent team identities. Seeded variation
changes individual sizes, palette choices, and organic motion. Zero emission
or intensity deliberately disables emission or visibility respectively.

## Movement and time rules

- A deliberate opening rule seeds one stationary pixel at each exact observed
  0 ms position with positive confidence and enabled emission. Its size is
  twice the configured base size and its palette choice uses a separate seeded
  stream, leaving subsequent movement randomness unchanged. It fades normally,
  with no invented velocity or pre-roll history. This makes both canonical
  teams visible while playback starts paused at zero.
- For subsequent emission, only consecutive **observed** endpoints exactly one source cadence apart
  permit emission. Birth locations interpolate within that valid segment.
  Missing slots and estimated endpoints cannot bridge an emission segment.
- Direction and speed derive from normalized coordinate differences,
  physical rink dimensions, and elapsed seconds. Speed below 0.05 m/s emits
  no new moving particles (the opening rule above is the sole exception).
  No stored source velocity fields are needed.
- Rate is `emissionRate * min(2, speedMetersPerSecond / 4) * confidence`.
  Confidence is the minimum endpoint score. It also scales particle opacity.
  Gaps, stationary intervals, and zero confidence reset fractional emission
  credit, avoiding a catch-up burst.
- Per-track seeded randomness is consumed during compilation only.
  Analytical damped velocity and perpendicular oscillation drive each pixel.
  Motion is independent of other players: no collisions or impact turbulence.
- Head opacity decays quadratically over lifespan. Six historical samples
  render a lightweight particle wake capped at 700 ms, rather than a persistent Canvas buffer.
  Old particles remain visible over missing source intervals without implying
  a current player position.
- The long tracer is **not** a straight chord or extrapolated particle wake.
  Each valid source segment is retained, preserving cadence vertices, turns,
  acceleration, and reversals. Endpoints interpolate only inside that segment
  when clipped to the current time or history boundary. Gaps and estimated
  endpoints never produce a joining segment.
- Tracers fade as `(1 - normalizedAge)^1.25` using segment midpoint age,
  multiplied by conservative endpoint confidence, opacity, visual intensity,
  and tracer intensity (clamped to alpha 1). The renderer broadens the low-alpha
  halo with age, weakens the old core, and highlights recent sections. Slight
  width variation depends only on segment time and system seed.
- Frame lookup binary-searches births and source segments. Particle retention
  uses lifespan plus the capped wake; tracer retention uses the team's history
  duration. Reset and scrubbing need no replay.

## Validation and performance

From the repository root:

```sh
npm test --workspace @beautiful-chaos/generative-engine
npm run typecheck
```

Tests cover assignment and independent settings, physical speed/direction,
confidence, gaps and estimated endpoints, lifespan/trails, deterministic seek
order, validation failures, and immutable input/output boundaries. The web
tests cover Canvas drawing and playback integration.

The default 30-second ten-skater fixture compiles 13,526 births, including ten
opening pixels. Before adding those opening pixels, it compiled 13,516 births, with a sampled
peak of 2,734 active appearances (including trail remnants) and 14,716 drawn
squares. On an Apple M1 Pro with Node 26, compilation measured about 54 ms;
sampling 301 sequence times measured mean 1.62 ms, p95 2.79 ms, and max 21.24 ms
per engine frame. These are development observations, not timing guarantees.
Those are pre-1B.1 measurements. Opening pixels expire before the documented
9/16/26 s review moments. Slice 1B.1 deliberately changes those compositions
through longer source-path tracers and capped wakes; births and source data
remain unchanged.

Production Chrome 156 headless on the same machine, at DPR 1 with an
1182 x 618 Canvas bitmap, measured actual renderer dispatch over 120 frames at
9, 16, and 26 seconds: mean 7.59 ms, p95 49.70 ms, max 162.80 ms. This times
the renderer call, not deferred GPU raster/compositing. Normal playback over
180 animation intervals measured mean 63.33 ms, p95 333.40 ms, max 1083.30 ms.
An idle 120-interval baseline measured mean 19.17 ms and max 249.90 ms.
These shared-machine headless results are uneven: **stable 60 fps is not
verified**, and active playback shows additional cost beyond idle scheduling.
Software rendering showed similar variability. Profiling on target exhibition
hardware and further allocation/draw-call tuning remain technical debt;
do not infer smooth production performance from engine-only timing.

Browser functional checks separately verified both palettes, independent
settings, visible invalid-input errors, missing sources, pause/end behavior,
reset/reload/speed/seek repeatability, and a 390 px-wide layout. Pixel comparisons
used a fixed readback-oriented Canvas backend to avoid a backend switch during
repeated image reads; performance measurements used the unmodified context.

### Slice 1B.1 measurements

The canonical fixture and seeds are unchanged. A 301-time sweep (0-30000 ms,
100 ms steps, after 60 warm-up frames) on the same M1 Pro / Node 26 measured:

| Metric | Before refinement | Extended tracers |
| --- | --- | --- |
| Compiled births | 13,526 | 13,526 |
| Sampled peak particle appearances | 2,734 | 2,485 |
| Sampled peak pixel squares | 14,716 | 14,727 |
| Sampled peak source-path segments | 0 | 600 |
| Compilation | 54.76 ms | 42.03 ms |
| Mean engine frame | 2.33 ms | 1.28 ms |
| p95 engine frame | 7.02 ms | 1.92 ms |
| Max engine frame | 116.14 ms | 14.67 ms |

These are individual shared-machine runs, not evidence of a guaranteed speedup.
The important workload change is bounded source segments instead of extending
particle retention. Up to 600 segments add up to 1800 Canvas stroke calls at
the default cadence/history; fractional-time clipping may add one segment per
track. No particles are spawned for tracer history.

Production Chrome 156 headless, same 1440 x 1000 viewport / DPR 1 and
1182 x 618 bitmap as the original Slice 1B screenshots: paired, alternating
draws at 9/16/26 seconds, 30 warm-up iterations and 120 measured samples per
condition, without Canvas readbacks:

| Renderer dispatch | Mean | Median | p95 | Max |
| --- | --- | --- | --- | --- |
| Current particles/wakes only, tracers disabled | 5.53 ms | 2.70 ms | 3.90 ms | 221.20 ms |
| Same frames with extended tracers | 16.23 ms | 8.30 ms | 66.80 ms | 159.20 ms |

This isolates the extra stroke cost, not a byte-identical old-renderer
comparison (particle wakes changed). The original renderer's separate 7.59 ms
mean above is historical context, not a paired timing. Dispatch timing excludes
deferred rasterization/compositing; outliers remain significant and **stable
60 fps is still not verified**. No WebGL/dependency change was introduced.

Fresh screenshots at 9, 16, and 26 seconds use default configuration and the
same reference viewport. Compared with the old short pixel fans, they show
continuous long-exposure paths, retained corners, faded older history, and
disconnected missing-data gaps. The particle texture and cool/warm identities
remain visible. Browser checks passed repeated seek/reset/reload image
comparisons, pause/play, independent tracer settings, invalid settings, and
full-state Reset after custom settings and debug/speed changes.

## Limits

- Compilation is synchronous and retains sequence-wide births in memory.
  A 100,000-birth budget throws an explicit error. Long sequences need a
  separately scoped bounded/streaming compilation strategy.
- Increasing emission or lifespan raises particle cost. Player history
  increases source-segment/stroke work but does not increase birth count or
  retain more particles beyond the 700 ms wake cap. Source-segment compilation
  also caps at 100,000 with an explicit error. High source cadence can still
  be expensive within a long history window.
- Geometry is piecewise-linear between known cadence samples, not a recovered
  continuous skating curve. Older diffusion is a layered-stroke approximation,
  not a blur simulation. No smoothing shortcuts skip observation vertices.
- Artistic pixels can drift beyond rink bounds; source coordinates stay
  unchanged. The Canvas surface naturally clips artwork.
- Floating-point and Canvas rasterization may differ across devices/backends;
  deterministic engine state is the guarantee, not cross-browser PNG identity.
- Settings are not persisted, and no collision physics, event processing, real
  footage, or real team identities are implemented.

See [creative direction](../../docs/creative-direction.md) for the future
collision-led artwork and [architecture](../../docs/architecture.md) for the
source/interpretation/rendering boundaries.
