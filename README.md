# Beautiful Chaos

Beautiful Chaos is an experimental generative art project that turns hockey
player movement into abstract visual compositions. Its browser experience
consumes preprocessed movement data; computer vision stays in the Python
service and is not run in the browser.

**Generative art first. Analytics second.** Viewers should encounter abstract
artwork before discovering its connection to an actual hockey game.
**One game. One movement dataset. Infinite artistic interpretations.**

The creative direction is **Dueling Pixels**: two distinct solid-particle
systems whose directional collisions respond to actual movement proximity and
relative velocity, with configurable interpretations of recorded events. See
[docs/creative-direction.md](docs/creative-direction.md) for the agreed palettes,
behaviours, and artistic boundaries.

## Repository

- `apps/web` — Next.js particle exhibition, diagnostic canvas, and playback.
- `services/vision` — Python environment for future video-processing work.
- `packages/contracts` — shared, runtime-validated TypeScript data contracts.
- `packages/generative-engine` — deterministic movement-to-particle interpretation.
- `data/samples` — small, synthetic movement fixtures for development.
- `docs` — creative direction, architecture, data contracts, and delivery plan.

## Getting started

Requirements: Node.js and npm, plus Python 3.11 or newer.

```sh
npm install
npm run dev
```

The web app is available at `http://localhost:3000`. It loads a local synthetic
30-second sequence with ten skaters on two fictional teams. Use Play/Pause,
Reset, the timeline, and the speed selector to explore it. Movement emits two
independently configurable pixel systems: blue/cyan/white with longer-lived
particles, and orange/red/amber with shorter, more energetic particles. Both
now leave six-second luminous player-path tracers. Open **Studio settings** to
edit each system's palette, seed, emission, lifespan, size, opacity, tracer
duration/width/intensity, movement response, and visual intensity.

The artwork starts paused at time zero, with one deterministic opening pixel
at each skater's valid observed starting position so both teams are visible.
These pixels fade without inventing motion; press Play or scrub forward to see
movement history. **Show players** switches to the diagnostic rink; Track IDs
can be hidden there. Consecutive observed samples support interpolation, but
missing observations stop emission and hide the affected debug skater.
Previously emitted particles fade naturally. Playback never bridges gaps or
modifies source data.

## Canonical production demonstration

From the repository root, with Node.js and npm installed:

```sh
npm ci
npm run build
PORT=3030 npm start
```

Open **http://localhost:3030** in a desktop browser (1440 x 1000 is the review
reference size). No data preparation, Python service, external connection, or
fixture regeneration is required. After installation, the demo runs locally
without external services. Stop it with Ctrl+C. For later launches of the
same build, just run `PORT=3030 npm start`; rebuild after changing source code.
The explicit port avoids assuming that development port 3000 is free. If 3030
is occupied, choose another `PORT` and use the matching URL. In Windows
PowerShell use `$env:PORT=3030; npm start`.

If dependencies and the production build already exist but your shell has
Node.js without npm, launch that same build directly:

```sh
node node_modules/next/dist/bin/next start apps/web --port 3030
```

The app defaults to the canonical
[`data/samples/neutral-zone-attack.json`](data/samples/neutral-zone-attack.json)
demonstration: 30 seconds, Team A (`team-a`, tracks A-01 through A-05) and
Team B (`team-b`, B-01 through B-05). The fixture's generation seed is **7219**;
the default particle seeds are **7219 for Team A** and **1823 for Team B**.
The [engine guide](packages/generative-engine/README.md#independent-configuration)
records the complete default configuration.

Every launch starts **paused at 0 ms, 1x speed**, with both default systems
enabled, artwork visible, debug markers hidden, and Studio settings closed.
**Reset restores this entire state**, including defaults after configuration
edits, unapplied form values, errors, speed, and overlay/settings visibility.
Click **Play** to replay. Pause freezes sequence time and artwork; scrub in
either direction while paused for exact comparisons. Scrubbing during play
preserves playback, except at the end. Use 0.5x, 1x, or 2x for speed.

Pause and scrub to these fixed review/capture moments. The timeline supports
keyboard adjustment (1 ms per arrow-key step) and displays elapsed time:

| Timestamp | Review moment |
| --- | --- |
| 9000 ms / 00:09.0 | Neutral-zone transition |
| 16000 ms / 00:16.0 | Offensive attack / illustrative shot phase |
| 26000 ms / 00:26.0 | Defensive recovery |

Repeated seeks, Reset, and reload reproduce the same particle state for the
same source/configuration/seeds. Opening pixels are an intentional revision to
the earlier empty-zero-time presentation; they use only exact observed 0 ms
positions and a separate seeded stream, preserving later movement emissions.
Do not silently replace the fixture, team assignments, timestamps, seeds, or
defaults between slices. Document deliberate changes and reverify the
production demonstration with three timestamped screenshots for every slice.

Slice 1B.1 deliberately changes both default tracer histories to **6000 ms**
(previously 1800/700 ms particle-history windows), and adds independent
`trailWidth` (2/2.2 CSS px) and `trailIntensity` (1/1). Tracers follow every
valid observed cadence segment, including turns, with gradual age fading and
broader, softer old sections. Missing observations split the path. Particle
wakes are capped at 700 ms so the longer player history does not retain
thousands of additional particles. The canonical JSON, team assignments,
seeds, zero-time artwork, and complete Reset semantics are unchanged.

### Known review limitations

- No collisions. The optional NHL view interprets recorded events, not player tracking.
- At zero the composition is deliberately sparse (ten opening pixels), not
  pre-rolled movement history. Missing/estimated/zero-confidence initial
  observations do not receive opening pixels.
- Playback freezes at 30 seconds; it does not append an outro.
- Settings are in memory. Reset and reload discard custom interpretations.
- Stable 60 fps is **not verified**. Headless Chrome showed frame-time spikes;
  see [measured performance](packages/generative-engine/README.md#validation-and-performance).
  Pixel rasterization can vary by device/Canvas backend; reproducibility refers
  to deterministic particle state, with screenshot equality checked on a fixed
  browser/backend/viewport.

To build and test the TypeScript workspaces:

```sh
npm run typecheck
npm test
npm run build
```

Regenerate the checked-in sample deterministically:

```sh
npm run generate:sample --workspace @beautiful-chaos/web
```

The movement view implements independent particle systems, not collisions.
The same sequence, artistic configuration, seed, and
timestamp produce the same particle state, including after backward seeks.
No external services are needed to run the installed application. See the
[engine guide](packages/generative-engine/README.md) for configuration,
performance measurements, and current limitations.

## Slice 1C: selectable NHL event study

Use **Data source > NHL TOR / VAN / recorded events** to review game
`2026020224`, Toronto 4-2 Vancouver, October 31, 2026. The preserved play-by-play
and shift snapshots are normalized during the build; the browser never contacts
NHL services. The synthetic fixture, defaults and artwork are unchanged.

The selected 45-second passage is **P1 02:13-02:58**. Review screenshots at
**14, 26 and 43 seconds** on its relative timeline (P1 02:27, 02:39, 02:56).
Both sources open paused at zero and 1x; switching sources discards custom
settings and resets playback. Reset restores the selected source's defaults;
reload returns to synthetic. Default artistic seeds remain **7219 / 1823**,
assigned to TOR / VAN respectively in the real view.

**These are event locations, not tracked player positions.** All 17 represented
players have unknown positions: zero observed player samples and zero inferred
samples. Shift charts identify participation only. Stationary seeded pixel
patches interpret recorded locations and fade over six seconds; they never
connect events or imply skating paths. Sparse/blank intervals are intentional.
At zero only the located TOR faceoff is visible; no VAN opening point is invented.
**Inspect source** exposes participants, active shifts, unknown positions and
raw-record provenance. Movement-only Studio settings are explicitly unused.

See the [data-quality and performance report](docs/real-game-poc.md) for source
endpoints, normalization assumptions, the duplicate-shift warning, measurements,
and limitations. Launch using the production commands above; verification used
port **3032** (`PORT=3032 npm start`, **http://localhost:3032**).

Initialize and test the Python service without installing computer-vision
models or libraries:

```sh
python3 -m venv services/vision/.venv
PYTHONPATH=services/vision/src \
  services/vision/.venv/bin/python -m unittest discover -s services/vision/tests
```

See [docs/architecture.md](docs/architecture.md),
[docs/data-contracts.md](docs/data-contracts.md), and
[docs/development-plan.md](docs/development-plan.md) for boundaries and next
steps.
