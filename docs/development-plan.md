# Development plan

The project has a 20-day delivery window. Slice 0 established package boundaries
and contracts. Slice 1A now connects synthetic movement JSON to validated,
timestamp-synchronized diagnostic Canvas playback without vision or artwork.
Slice 1B now adds independent, deterministic Dueling Pixels particle systems
without collisions or event effects.
Slice 1B.1 refines those systems with six-second, gap-safe observed-path
tracers and independent per-team width/intensity controls. This does not start
the collision slice or change the canonical movement fixture.
The following is a sequencing guide, not a commitment to particular models or
visual techniques.

| Days | Slice | Outcome |
| --- | --- | --- |
| 1–2 | Foundation (Slice 0, implemented) | Workspaces, contracts, Python environment, exhibition shell, and docs. |
| 3–6 | Synthetic data path (Slice 1A, implemented) | Deterministic ten-skater fixture, shared validation, diagnostic Canvas, and playback with explicit gaps. |
| 7–9 | Independent particle systems (Slice 1B, implemented) | Configurable team identities, movement-driven emission, fading trails, deterministic playback, and debug positions. |
| 10–11 | Movement normalization | Define and test rink calibration and coordinate conversion independently of model selection. |
| 12–15 | Vision prototype | Evaluate a minimal tracking approach on authorized footage; emit temporary tracks and confidence. |
| 16–18 | Generative studies | Explore Dueling Pixels: distinct solid-particle systems, directional collisions, and dissipating trails; configurable event grammar when recorded data is available. |
| 19–20 | Integration and polish | Connect one processed sequence to the exhibition, validate performance, and document limitations. |

## Slice 1C: real-game reconstruction POC

Implemented the user-defined real-game study instead of the earlier suggested
collision study. Preserved NHL event/shift snapshots feed a selectable,
deterministic event-location interpretation. The synthetic default and its
six-second tracers remain unchanged. No defensible player-position anchors
exist in these sources, so no player path is reconstructed. See the
[data-quality report](real-game-poc.md) for verification and measured limitations.

Recommended follow-up: review whether the deliberately sparse event-only study
is artistically useful, and profile on target exhibition hardware. Any future
player reconstruction needs genuinely player-specific positional evidence and
provenance. Collision physics and another milestone require explicit approval.

The user-defined Slice 1B prioritizes the visual language ahead of the earlier
normalization recommendation. Rink calibration/normalization is still planned,
not removed: test known synthetic screen-to-rink correspondences, axis
orientation, units, failure handling, and confidence provenance before real
video integration. Python extraction and TypeScript normalization boundaries
remain unchanged.

## Delivery principles

- Every slice must preserve and verify the canonical production demo:
  paused zero-time defaults, both teams visible, full-state Reset, deterministic
  seeks, and screenshots at 9, 16, and 26 seconds. Keep exact startup instructions
  and limitations in the [README](../README.md#canonical-production-demonstration).
  Document any intentional fixture, seed, assignment, or presentation change.
- Keep computer vision in Python and publish preprocessed JSON at the boundary.
- Keep movement normalization in TypeScript, independent of artistic settings.
- Follow [creative-direction.md](creative-direction.md): collision is the
  dominant artistic interaction, driven by proximity and relative velocity;
  team identities and recorded-event interpretations remain configurable.
- Keep source data separate from interpretation and rendering. Do not
  fabricate movement or missing event details.
- Stabilize and test contracts before coupling the producer and consumers.
- Use synthetic data before introducing footage or model dependencies.
- Keep the web experience focused on artwork rather than analytics controls.
- Defer database, authentication, deployment, and external integrations until
  a concrete requirement exists.
