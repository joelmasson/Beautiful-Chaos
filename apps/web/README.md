# Web application

The Next.js app is the exhibition-facing shell for Beautiful Chaos. Run it from
the repository root with `npm run dev`, or use `npm run dev` in this workspace.
Startup builds the shared contracts and generative engine before Next.js runs.

## Synthetic movement study

The local `/api/sample` route serves the checked-in JSON fixture from
[`data/samples`](../../data/samples). The client validates the complete response
with the shared contracts before enabling playback. Loading, empty, and error
states are explicit; load failures offer a retry.

The primary canvas presents two independently configured particle systems on a
dark background. Cool particles live longer; warm particles are shorter-lived
and more energetic. Both teams default to six-second luminous player tracers,
following actual observed paths rather than extrapolated particle drift.
New sections have a narrow bright core; older sections fade and broaden.
Duration (0-10000 ms), width, and intensity are independently editable per team.
These presets are assigned to explicit temporary team
IDs, not inferred from diagnostic colors or permanent team identities.
**Studio settings** exposes validated per-team configuration. Applying a
setting reinterprets the current sequence time; settings remain in memory.
Reset and reload restore defaults, including unapplied edits and errors.

Play/Pause, Reset, scrubbing, and 0.5x/1x/2x playback operate on sequence
timestamps. Particle state is analytical, not accumulated per animation frame,
so backward seeks and replay need no simulation warm-up. Pause freezes the
artwork; Reset restores the full opening demonstration: paused at zero, 1x,
default configuration, both systems enabled, hidden debug markers, and closed
Studio settings. The player subtree remounts on Reset so form drafts, errors,
and clock callbacks cannot survive it. One stationary opening pixel per valid
observed starting position makes both teams visible at zero; it fades normally.
Playback stops at 30 seconds,
including any particles still alive at that time; it does not add a fade-out
after the source sequence ends.

**Show players** switches to the diagnostic rink. Filled markers represent
observed positions; hollow markers represent gap-safe display interpolation.
Track IDs can be toggled there. Missing observations hide the affected skater
and stop its emission; existing particles and valid historical path sections
continue fading. Each tracer segment comes from one pair of adjacent observed
cadence samples. No stroke connects across missing/estimated observations.
Source data is never modified.

`src/lib/movement-data.ts` owns loading and shared-contract validation.
`src/lib/playback.ts` owns the testable playback state, monotonic clock, and
sample lookup and gap-safe display interpolation.
`packages/generative-engine` owns emission, seeded motion, fading, and trail
sampling, including clipped source-path segments. `src/lib/particle-renderer.ts`
draws luminous segments in three lightweight strokes (diffuse halo, color core,
highlight) before the existing pixels. Short six-sample particle wakes remain
capped at 700 ms independently of the longer source history. This bounds
particle retention rather than multiplying particles for long exposures.
The renderer draws the resulting frames
without persistent framebuffer history. `src/lib/rink-renderer.ts` provides
shared coordinate mapping and diagnostic drawing. React components wire these
together; the settings forms are memoized to avoid updating on every frame.

## Validation

```sh
npm test --workspace @beautiful-chaos/web
npm run typecheck
npm run build
```

Run the last two commands from the repository root. Tests use TypeScript and
Node's existing test runner; no extra testing dependency is required.

This app does not load broadcast video, run computer vision, fetch external
data at playback, or implement particle collisions. See the
[engine guide](../../packages/generative-engine/README.md) for configuration
and measured performance limitations, and the
[production demo instructions](../../README.md#canonical-production-demonstration)
for exact startup and review timestamps.

## Selectable real-game study

The discreet Data source selector defaults to synthetic. The NHL option loads
the static `/api/real-game` passage, normalized from preserved snapshots at
build time and validated on load. `createRecordedEventEngine` supplies the same
Canvas frame type: stationary event-location marks, no fabricated player paths.
Play/Pause/Reset/scrub/speed work identically; source changes reset all player
state and settings. Reset retains the selected source; reload selects synthetic.

**Inspect source** opens diagnostic participation, event IDs/roles, normalized
locations, raw source pointers and explicit unknown player positions.
Movement-specific settings are marked unused for this event-only passage.
See the [POC report](../../docs/real-game-poc.md) for 14/26/43-second captures,
data integrity decisions and paired performance results.
