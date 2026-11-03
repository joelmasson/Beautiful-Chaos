# Beautiful Chaos: creative direction

## Project identity

Beautiful Chaos is an experimental generative art experience derived from real
hockey movement data. **Generative art first. Analytics second.**

The audience should initially experience an abstract digital artwork. Its
connection to an actual hockey game should become apparent only after further
exploration, not through a statistics-first presentation. The artwork must
remain compelling without requiring the viewer to understand hockey.

**One game. One movement dataset. Infinite artistic interpretations.**

The same source movement and recorded events should support different artistic
interpretations through configuration, without changing the source dataset.

The artwork should look like two opposing forces colliding, with beauty
emerging from the chaos.

## Dominant mechanic: Dueling Pixels

Two opposing hockey teams are represented as independent particle systems
occupying a shared visual environment. Each system retains a recognizable
identity while interacting with the other when their movement brings them
together.

### Initial visual identities

| System | Palette | Movement | Movement history |
| --- | --- | --- | --- |
| Team A | Electric blue, cyan, white highlights | Smooth, coherent particle motion | Longer trails |
| Team B | Orange, red, amber highlights | More turbulent | Shorter trails |

These are configurable defaults, not permanent or hardcoded team identities.
The smooth Team A default describes motion, not a fluid-field model. Particles
in both systems represent solid entities.

Each system has its own configurable particle behaviour, trail persistence,
density, movement response, and visual intensity. These settings and palettes
belong to artistic configuration, not movement data or permanent player identity.

## Dominant interaction: physical collision

Collision must derive from actual spatial relationships and movement data.
Opposing movement sources determine where interaction occurs and how its
intensity changes. Particles represent solid entities, not fluid fields.
Physical collision is an artistic particle interaction, not evidence that
the underlying players made contact.

As opposing sources approach:

- Particles converge according to actual spatial proximity.
- Collisions produce directional scattering and deflection.
- Impact intensity responds to relative velocity and proximity.
- Trails overlap and show the resulting disruption.
- Local visual density and turbulence can increase around the impact.

After impact and as opposing movement separates:

- Collision intensity decreases.
- Particle systems return to independent behaviour.
- Turbulence gradually dissipates.
- Existing trails dissipate naturally.

Interaction should feel organic rather than mechanical. Visual complexity
should emerge from simple movement rules, with local responses to proximity
rather than arbitrary explosions or random collision effects. Trails preserve
a sense of movement history
without permanently obscuring the two systems' identities.

Particle motion is an artistic simulation, not an additional measurement of
player motion. Missing player observations must remain explicit; the artwork
must never fabricate player positions to create a collision.

## Event-driven visual grammar

Recorded hockey events should influence the artwork through configurable visual
rules. The initial vocabulary is:

| Recorded event | Initial visual interpretation |
| --- | --- |
| Hit | Directional impact and particle scatter |
| Shot | Concentrated directional release |
| Save | Interruption and ripple/dispersal |
| Goal | Distinctive composition-wide release |
| Turnover | Disruption and directional reversal |

These are initial artistic interpretations, not immutable rules. The same event
data must be capable of producing different visual interpretations. A
composition-wide goal response is tied to a recorded goal, not an arbitrary
explosion.

Do not fabricate event details, locations, directions, or participants when
source information is unavailable. Movement proximity alone must not be
presented as a recorded hit, shot, save, goal, or turnover. Where event
information cannot support a configured response, leave that response
unapplied rather than inventing source facts.

## Three-layer architecture

These responsibilities are separate layers within the existing architecture,
not new applications or packages:

1. **Source data:** observed movement, timestamps, recorded events, and
   confidence, with position provenance and missing information preserved.
2. **Interpretation:** configurable rules translating movement and events into
   visual behaviour, including team responses and collision/event intensity.
3. **Rendering:** particles, trails, colours, density, turbulence, and
   composition that express the interpretation as artwork.

The interpretation and rendering layers must never modify the underlying
source data. Different interpretations may be derived from the same dataset;
artistic configuration must not rewrite movement or event records.

## Architectural principles

1. **Computer vision extracts movement.** Python owns video analysis,
   detection, tracking, and observation extraction.
2. **TypeScript normalizes movement.** A preprocessing stage converts extracted
   observations into standardized rink coordinates before artwork playback.
   Normalization is independent of artistic choices.
3. **The generative engine interprets movement and recorded events.** Normalized
   trajectories, available event records, and separate artistic configuration
   drive team particle behaviour, collision responses, and event grammar.
4. **The renderer produces artwork.** The visual surface presents the engine's
   interpretation within an exhibition-oriented experience.
5. **The data layer never depends on artistic configuration.** Palettes,
   particle density, turbulence, and trail settings must not change tracking
   IDs, coordinates, timestamps, confidence, or observed/interpolated
   provenance or event details.

The browser consumes preprocessed movement data and does not perform computer
vision. The existing diagnostic rink renderer remains a verification tool,
separate from the primary artistic experience.

See [architecture.md](architecture.md) for component boundaries and
[data-contracts.md](data-contracts.md) for the existing movement contracts.

## Exclusions

- Sports dashboards and conventional statistics interfaces.
- Scoreboard-led presentation.
- Player cards or statistics as the primary experience.
- Arbitrary visual explosions unrelated to movement.
- Fabricated movement, player positions, or event details.
- Hardcoded team identities or artistic colours.

## Future possibilities

Alternative collision behaviours and event mappings may be explored within
this configurable direction. Territory competition is a possible secondary
mechanic, not a replacement for physical collision.

## Unresolved implementation questions

- Which future source supplies defensible player-specific positional anchors,
  beyond the NHL event locations and shift participation established in Slice 1C?
- How should any future reconstruction bound gaps and communicate confidence
  without promoting event coordinates to player observations?
- How will observed relative velocity, particle scale, collision thresholds,
  and intensity mappings be defined and tuned?

These questions are deferred to scoped implementation work. The
[Slice 1C report](real-game-poc.md) records the deliberately limited NHL
integration; no physics algorithm or collision defaults are selected here.

## Current implementation boundary

This document records the target direction; not every feature is implemented.
Slice 1A provides validated synthetic movement and diagnostic Canvas playback.
Slice 1B adds two independent, configurable particle systems driven by valid
movement segments, with distinct palettes, lifespans, movement responses,
and fading trails. The primary exhibition now shows those particles; the
diagnostic rink and player markers remain available through **Show players**.
Seeded, analytical sampling keeps artwork consistent across replay and seeks.
Slice 1B.1 extends movement history with six-second source-path tracers for both
teams, independently configurable in duration, width, and intensity. Bright
recent cores fade into softer old history; observed turns are retained and
missing observations break the tracer rather than creating a connecting line.
The canonical fixture remains explicitly synthetic and contains no recorded
event stream. Slice 1C adds a selectable real NHL event study with stationary
seeded marks at recorded event locations. All represented player positions
remain unknown; event locations and shifts cannot establish skating paths.
No event-to-event connections or fabricated player tracers are drawn.
The separate visual concept
preview is illustrative, not an authoritative collision model or implemented
engine.

Particles do not yet interact: trail overlap is ordinary visual overlap, not
evidence of a collision or recorded event. Organic motion is each system's own
configured response, not impact-driven turbulence. Particle interactions,
collision physics, continuous tracking and computer vision remain
unimplemented. Source movement contracts, diagnostic colors, and
timestamp playback semantics are preserved; artistic configuration is separate.
