# Architecture

## Component boundaries

```text
Broadcast video
      |
      v
Python vision service
  detection and tracking
  movement extraction
      |
      | extracted observations
      v
TypeScript movement preprocessing (planned)
  screen-to-rink normalization
      |
      | preprocessed JSON
      v
TypeScript contracts <---- shared validation and types
      |
      v
TypeScript generative engine
  trajectory interpretation
  configurable recorded-event interpretation
  visual parameterization
      |
      v
Next.js web experience
  artwork renderer and exhibition layout
```

This target architecture follows [creative-direction.md](creative-direction.md).
Movement extraction and normalization are not implemented yet; the current
synthetic movement and particle paths are described below.

### Video processing

The Python service owns video-facing work: frame analysis, temporary object
tracking, and extracting observations from broadcast imagery. Models are not
part of the initial environment. Permanent NHL player identity is not required
or assumed; tracks use sequence-scoped temporary IDs.

### Movement normalization

TypeScript owns the planned conversion of extracted screen positions into a
rink-centered normalized coordinate system. This preprocessing stage sits
between Python movement extraction and generative interpretation, and emits
validated movement JSON before artwork playback. It must not depend on
palettes, particle behaviour, or other artistic configuration. The browser
consumes preprocessed movement only and never performs computer vision.

### Generative rendering

The TypeScript generative engine consumes the shared movement contracts and
rendering configuration. Slice 1B translates trajectories into two independent
solid-particle systems with seeded movement, fading, and historical trails.
Directional collisions driven by proximity and relative velocity remain
future work. Available
recorded events inform configurable visual rules through the separate Slice 1C
event adapter. The renderer produces artwork from that interpretation. The
Next.js app owns the exhibition experience and canvas surface; it should not absorb
vision logic or become a traditional analytics dashboard.

## Data flow and packages

`packages/contracts` is the language-level agreement for sequence metadata,
trajectory observations, and rendering configuration. `services/vision` is the
planned Python movement extractor. TypeScript preprocessing will produce
normalized JSON conforming to the movement contracts; its module location is
not established yet. `packages/generative-engine` is
the artistic consumer/transformer. `apps/web` renders and presents the
result. `data/samples` contains synthetic fixtures shared during development.

The data layer must never depend on artistic configuration. Rendering choices
must not alter coordinates, timestamps, confidence, tracking IDs, or position
provenance. Diagnostic team colors are unchanged; artistic palettes are
configured separately from those fixture display hints.

### Source, interpretation, and rendering

The [creative direction](creative-direction.md#three-layer-architecture) defines
three logical layers within these existing component boundaries:

- **Source data:** observed movement, timestamps, confidence, position
  provenance, and future recorded events, independent of artistic settings.
- **Interpretation:** configurable movement and event rules in the generative
  engine, producing visual behaviour without modifying source records.
- **Rendering:** particles, trails, colours, density, turbulence, and composition
  presented by the artwork renderer.

One dataset can feed multiple artistic interpretations. Neither interpretation
nor rendering may fabricate player positions or unavailable event details.
Recorded-event contracts complement rather than replace movement observations.
This layering does not change the synthetic playback pipeline.

There is no database or authentication system. The NHL POC preserves external
snapshots; application playback uses only local data.

## Slice 1A: synthetic diagnostic path

```text
TypeScript waypoint generator (data/samples/generate.ts)
      | shared-contract validation
      v
Checked-in synthetic JSON
      | same-origin static /api/sample route
      v
Browser loader + MovementSequenceSchema validation
      |
      v
Timestamp sampler + playback state
      |
      v
Diagnostic Canvas renderer in apps/web
```

This diagnostic path bypasses the generative engine: it proves that normalized
movement can be consumed accurately, independently of artistic interpretation.
It remains available through **Show players**. The Python service is unchanged.
The sample route is a local fixture delivery mechanism, not an external
integration or video-processing service. No copy is stored in the public
directory; the route serves the one canonical checked-in JSON fixture.

Playback uses elapsed monotonic `performance.now()` time and a
`requestAnimationFrame` scheduler, not one fixed movement step per rendered
frame. The same time source is used before and during callbacks to avoid stale
animation-frame timestamp errors. Pause cancels the clock; Reset restores the
entire canonical demonstration, including zero time, paused playback, 1x speed,
default particle configuration, and closed settings/hidden debug markers.
Playing from the end restarts from zero with the current configuration. Scrubbing
preserves play/pause state unless it reaches the end, where playback stops.
When frames are delayed or the tab is hidden, the next callback catches up to
elapsed time rather than inventing extra observations.

Sample lookup uses binary search within each trajectory. Between consecutive
observed samples, a derived display position is linearly interpolated at the
playback timestamp; missing or estimated endpoints prevent interpolation.
Exact source observations remain separate and unchanged. The frame is memoized
by playback timestamp rather than cadence slot, so the Canvas redraws with
continuous playback as well as label or viewport changes. ResizeObserver and
device pixel ratio keep its
backing bitmap aligned with the display while preserving the rink's physical
aspect ratio. Missing observations are omitted from drawing and named in a
small status message.

## Slice 1B: independent particle interpretation

```text
Validated synthetic JSON + separate DuelingPixelsConfig
      |
      v
Generative engine compilation
  observed, cadence-adjacent segments only
  physical direction/speed + conservative confidence
  seeded, immutable particle births
      |
      | frameAt(playbackTimestampMs)
      v
Analytical particle positions + bounded wakes + observed player-path tracers
      |
      v
Canvas pixel renderer + exhibition playback controls
```

Engine construction happens only when sequence or artistic configuration
changes. Frame sampling is derived directly from sequence time, not previous
animation frames. The renderer clears the surface before each draw, making
backward seeks, reset, pause, and speed changes consistent without maintaining
a framebuffer history. Studio settings independently validate/apply each
team's artistic configuration; errors are visible rather than silently
defaulting. Preparation failures also surface in the exhibition.

Birth locations use only valid observed movement segments. Missing or
estimated endpoints prevent new emissions. Already-emitted particles keep
moving and fading over source gaps; those artistic positions are not player
observations and never feed back into the dataset. Head and trail lifetimes
are independent per team. Shared rink mapping preserves physical proportions,
but the primary artwork does not draw rink boundaries or player markers.

The engine has no renderer/browser dependency. The Canvas renderer has no
vision, normalization, collision, or event responsibilities. The optional
diagnostic view continues using the existing source sampler. Exactly two
teams are required by Dueling Pixels, not by the general movement contract.
The canonical opening deliberately includes one stationary pixel per valid
observed 0 ms source, rather than a blank canvas. A separate seeded stream
chooses its palette color without changing later emission randomness. Initial
pixels fade using ordinary lifespans/trails and never imply prior motion.
No opening pixel is created for missing, estimated, or zero-confidence sources,
or systems with emission disabled. Reset remounts the player state and forms,
canceling the old clock and discarding all custom/unapplied settings.
See the [engine guide](../packages/generative-engine/README.md) for formulas,
configuration, performance measurements, and workload limits.

### Slice 1B.1: extended player tracers

The same validated segment pass now compiles copied source-path endpoints
alongside seeded particle births. A separate time-sorted segment array allows
binary-searching the configured history window. Only cadence-adjacent,
observed, moving, positive-confidence sources with enabled emission qualify.
Each visible segment is clipped to `[time - teamHistoryMs, time]` within its
own endpoints; no resampling skips corners and no segment spans a data gap.
This preserves piecewise-observed turns, speed changes, and direction reversals
without inventing a smooth route between unavailable observations.

Both defaults are 6000 ms. Width/intensity are independent per team; opacity,
visual intensity, and palette also affect tracers. Age drives fading and
diffusion, while a seeded time function gives slight width variation. Canvas
renders each segment separately with halo/core/highlight strokes, followed by
the original particle pixels. Diffusion changes stroke width/alpha, not source
geometry; no impact turbulence or event effects are introduced.

Particle wakes reuse the existing six samples but are capped at 700 ms,
so longer player tracers do not extend particle retention. Compilation caps
both births and source segments at 100,000 with explicit errors. Default
source history is about 600 segments across ten skaters, rather than a new
particle population. Source cadence and configured history determine this
workload; high-cadence/long sequences remain a separate scaling concern.

## Slice 1C: preserved NHL events and shifts

`data/nhl/2026020224` retains byte-identical source responses, HTTP headers and
a SHA256 provenance manifest. `data/nhl/normalize.ts` validates actual payload
shapes, identity, regulation clocks, coordinates, period orientation and shift
intervals. The static `/api/real-game` route runs normalization at build time,
then the browser validates `RealGamePassageSchema` before playback. No source
fetching/parsing occurs per animation frame.

The passage embeds the existing movement metadata/team/trajectory envelope,
with empty observations, plus complementary recorded events, shift intervals,
source references and explicit unknown player reconstruction states.
Event coordinates never enter player observations. No inference runs without
defensible player anchors.

`createRecordedEventEngine` compiles stationary seeded artistic marks around
recorded event locations. Their offsets are artwork, not source measurements;
there is no event-to-event connection or event physics. It emits the existing
`ParticleFrame` with no player tracers, consumed by the unchanged Canvas
renderer. The synthetic source continues using `createParticleEngine` and
six-second observed-path tracers. Source selection and Reset remount playback
state/settings; reload always selects synthetic. Open-only source diagnostics
resolve shift participation without placing players on the rink.

See [real-game-poc.md](real-game-poc.md) for data quality and limitations.
