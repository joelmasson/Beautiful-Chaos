# Data contracts

The initial runtime-validated TypeScript schemas live in
`packages/contracts/src/index.ts`. The Python service will extract movement;
TypeScript preprocessing will normalize it into validated movement JSON. The
browser and generative engine consume preprocessed, normalized movement.

## Sequence metadata

`GameSequenceMetadata` describes one analyzed sequence, not a player identity.
It carries a schema version, sequence ID, optional display label, duration,
frame rate, rink dimensions in meters, and the coordinate-system identifier
`rink-centered-normalized`.

The normalized rink plane uses `x` and `y` values in `[-1, 1]`, with `(0, 0)`
at rink center and the axes aligned with rink length and width. TypeScript
preprocessing owns this planned transformation after Python extraction and
before generative interpretation.

For the synthetic study, positive `x` is toward the right end and positive `y`
is upward on the rendered rink. Canvas maps `x` using `(x + 1) / 2` and `y`
using `(1 - y) / 2`, preserving the metadata's physical rink aspect ratio.
Coordinate bounds describe a rectangular normalized plane, not rounded-board
geometry or a team's permanent attack direction.

The rink frame stays fixed; coordinates are not flipped when possession or
attacking direction changes. The 30-second synthetic passage represents no
period boundary and has no period/attack-direction fields. Real teams can
switch attacking ends between periods, but that must be documented in future
source metadata rather than inferred from movement or implemented as a
renderer coordinate flip. Slice 1C supplies this metadata explicitly below.

## Observations and trajectories

Each `PlayerMovementObservation` associates a sequence-scoped `trackingId`
with a timestamp and position. The tracking ID is temporary; the contract does
not include a permanent NHL player ID.

Timestamps are milliseconds elapsed from sequence start (`0`), not wall-clock
time or source-video frame numbers. The current observation contract does not
store speed or direction. No extra fields are added here; movement is expressed
through changing coordinates, with segment speeds checked in tests.

Positions are discriminated by `kind`:

- `observed` means the position came directly from a vision observation.
- `interpolated` means it was estimated between observations and includes the
  interpolation method and source time bounds.

Both carry `MovementConfidence`, represented as a score from `0` to `1` and an
optional method label. A trajectory is a time-ordered set of observations for
one tracking ID; timestamps must increase and the IDs must match.

## Complete movement sequence

`MovementSequence` composes the existing metadata and trajectory schemas:

```text
metadata: GameSequenceMetadata
observationIntervalMs: positive integer
teams: [
  { teamId, label, color: six-digit hex, trajectories: PlayerTrajectory[] }
]
```

Team membership groups existing trajectories rather than changing their
observation model. Team IDs and tracking IDs must be unique within the
sequence. All observations must reference its sequence ID, fall within its
duration, and align with its interval starting at timestamp zero. Missing slots
are omitted observations. An interpolated observation must lie strictly inside
its declared source time bounds, within the sequence.

The sequence schema intentionally does not require ten tracks, complete
coverage, or two teams: those are properties of this synthetic fixture, not
universal data assumptions. Empty sequences can be validated and displayed
explicitly.

The browser validates JSON once at loading. Errors identify the failing
property path (for example, `teams.0.trajectories.0.observations.0.position.x`);
invalid data is never replaced with a success-shaped empty sequence.

## Timestamp sampling and missing data

Playback locates the slot beginning at
`floor(playbackTimestampMs / observationIntervalMs) * observationIntervalMs`.
At an exact recorded timestamp it displays that source position unchanged.
Between timestamps, it linearly interpolates only when both endpoints are
`observed` and present at consecutive cadence slots. It does not interpolate
over any omitted slot, extrapolate outside available observations, or chain
interpolation through estimated endpoints.

The derived frame keeps the source `observation` separate from its display
`position`. The display position uses the existing `interpolated` contract,
with the source timestamp bounds and `playback-linear` confidence method. Its
confidence score is the lower endpoint score, not a newly calibrated
probability. Derived frames may use fractional millisecond playback times;
source observation timestamps remain integer milliseconds.

When either bracketing observation is missing, the track is temporarily
unavailable. For example, A-03 is shown at exactly 11600 ms, hidden for
`11600 < t < 12000` because 11700–11900 ms are omitted, and shown again at
12000 ms. No last-known position is held across that gap. Exact stored
interpolated input remains visible at its own timestamp, but does not become
an endpoint for further interpolation.

Filled markers indicate exact observed positions; hollow markers indicate
interpolated display positions. The supplied fixture has only synthetic
observed positions. Playback never rewrites the sequence to insert estimates.
Source video frame rate is metadata, independent of the movement sampling
interval and the browser display refresh rate.

## Rendering configuration

`GenerativeRenderingConfig` remains the original generic configuration
contract: random seed, palette, particle count, motion scale, trail length,
and blend mode. It is preserved for compatibility, but is not the active
Dueling Pixels API. The diagnostic renderer uses neither artistic schema.

Slice 1B adds `ParticleSystemConfig` and `DuelingPixelsConfig` alongside the
existing contracts, without changing movement JSON or `schemaVersion`.
`DuelingPixelsConfig.systems` contains exactly two systems with distinct,
explicit `teamId` values. Engine preparation additionally checks they match the
source teams. Each system defines its own palette, unsigned 32-bit seed,
lifespan in milliseconds, emission rate, size in CSS pixels, opacity, trail
persistence in milliseconds, movement influence, visual intensity, and
perpendicular wander amplitude in meters. Slice 1B.1 extends
`trailPersistenceMs` to 0-10000 ms (default 6000 for both teams) and adds
`trailWidth` (0.5-8 CSS px; defaults 2 and 2.2) and `trailIntensity` (0-2;
default 1). These settings describe source-path tracers, not longer particle
lifetimes. Existing in-memory artistic configurations need the two added
fields; no persisted configuration or movement migration exists. See the
[engine configuration table](../packages/generative-engine/README.md#independent-configuration)
for validated ranges and presets.

Direction and physical speed are derived from consecutive observed positions,
elapsed time, and source rink dimensions. Emission requires cadence-adjacent
observed endpoints; it does not reuse stored estimated positions or cross
missing slots. The minimum endpoint confidence scales both emission and
opacity. No source schema extension for speed, direction, or particle state is
needed. These are artistic interpretations, not new measurements.

Particle frames belong to the engine output API, not the source movement
schema. Historical particle positions may persist after a player becomes
unavailable; this is fading artwork, not a held or fabricated player position.
`ParticleFrame.traces` contains clipped cadence segments, timestamps, team/track
IDs, age-dependent opacity/diffusion, width, and palette colors. Endpoints
interpolate only inside one known valid segment at the history-window or
current-time boundary. Every recorded turn between those boundaries is
preserved. Missing/estimated endpoints produce no segment, so the renderer
cannot join across a gap. These output objects are fresh per frame and cannot
mutate the engine's copied geometry or source data.

The data layer must never depend on artistic configuration. Dueling Pixels'
team palettes, particle behaviours, collision responses, and trail settings
belong to artistic interpretation and must not change movement observations.
The current sequence `color` field is a diagnostic display hint, not a hardcoded
artistic identity; the existing schema and sample colors remain unchanged.
See [creative-direction.md](creative-direction.md) for the agreed defaults.

## Slice 1C: recorded events and reconstruction

The creative direction includes configurable interpretations of recorded hits,
shots, saves, goals, and turnovers. These records belong to source data,
separate from the rules that turn them into visual behaviour. Interpretation
and rendering must not alter event facts or fabricate unavailable event
details. A movement-derived particle collision is not a recorded hockey event.

The synthetic sample and its movement contracts are unchanged. Complementary
shared schemas now define:

- `SourceReference`: endpoint, preserved raw file, JSON pointer and record ID.
- `RecordedEvent`: source ID/type, period/clock, absolute game and relative
  passage milliseconds, owner team (or null), participant IDs/roles,
  defending side, provenance, and `recorded-event` or `unknown` location.
  A recorded-event coordinate is never an observed player position.
- `PlayerReconstruction`: `observed` reuses `ObservedPosition` with source
  anchors; `inferred` reuses `InterpolatedPosition` and requires at least two
  anchor references; `unknown` requires a reason and permits no position.
  These schemas distinguish evidence; they do not themselves establish that
  event participants are positional anchors.
- `RealGamePassage`: the existing `MovementSequence` envelope, source identity,
  passage start, period orientation, events, shifts, player reconstruction
  states and quality warnings. Real player IDs remain separate from temporary
  movement tracking IDs (`nhl-<id>` is a passage-local association).

For the selected NHL sources, all player reconstruction states are unknown
and every movement trajectory has an empty observation array. No player
confidence value or inferred path is invented. Shift intervals are absolute
game milliseconds, start-inclusive/end-exclusive; active player IDs are
deduplicated. Relative time equals game time minus passage start (133000 ms).
Regulation periods last 1200000 ms; overtime/shootouts fail explicitly in
this deliberately game-specific POC.

Event coordinates use the conventional 200 x 85 ft NHL rink:
`x / 100`, `y / 42.5`, with center origin and positive y rendered upward.
This unit convention is an assumption, not calibrated tracking metadata.
The fixed rink axes are not flipped by team or period. Explicit home defending
sides right/left/right imply home attack left/right/left; all six goal signs
agree. Missing coordinate pairs remain unknown. See the
[source quality report](real-game-poc.md) for validation and limitations.

## Compatibility

Increment `schemaVersion` when a future change requires an explicit data
migration or coordinated producer/consumer update. Keep raw video and
computer-vision-specific intermediate results out of browser-facing contracts.
