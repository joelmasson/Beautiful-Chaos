# Big Data Cup 2026 diagnostic (Slice 1D.1)

Isolated, read-only research tooling. It is not a Beautiful Chaos importer,
renderer change or contract migration. Uses Python 3 standard library only.
No application dependencies or scripts are changed.

Read the [investigation report](../../docs/big-data-cup-investigation.md) and
[Stathletes agreement](https://github.com/bigdatacup/Big-Data-Cup-2026/blob/main/legal.md)
before downloading. Local non-commercial research is the intended use here;
raw redistribution and commercial/art-exhibition permission remain unresolved.
Raw CSVs are deliberately **not bundled** or embedded in the HTML/screenshots.
Screenshots are derived non-commercial research figures, not a licence for
commercial artwork or redistributing the underlying data.

## Reproduce the selected preview

From the repository root, store a single period outside the repository:

```sh
mkdir -p "$HOME/.cache/beautiful-chaos/bdc-2026"
curl -fL \
  'https://github.com/bigdatacup/Big-Data-Cup-2026/releases/download/Data/2025-10-11.Team.A.%40.Team.D.Tracking_P1.csv' \
  -o "$HOME/.cache/beautiful-chaos/bdc-2026/tracking-p1.csv"
python3 investigations/big-data-cup/preview.py \
  --tracking "$HOME/.cache/beautiful-chaos/bdc-2026/tracking-p1.csv"
```

Open **http://127.0.0.1:3041**. Stop with Ctrl+C. The server binds to loopback,
serves only the diagnostic HTML and a bounded in-memory source passage, and
does not expose the raw file/directory. Do not tunnel or publicly host it until
redistribution permission is clarified.

The fixed review passage is P1 clock **19:55-19:30**, source frames
**65618-66368**, 751 frames. The title/team labels are specific to this game;
this is not a general-purpose dataset viewer. Source position values and
missingness are preserved exactly. Time labels/playback assume **30 fps**,
inferred from source clock bins, not certified source metadata.

- Starts paused at frame zero.
- Play/Pause, Reset and source-frame scrubber are available.
- Six-second trails connect only adjacent frames with valid coordinates and
  unchanged team/track ID/jersey label. No stitching across tracking IDs.
- Player IDs are optional, shown as `jersey [tracking ID]`.
- Puck is a separate yellow diamond with an independent visibility toggle.
- Missing-coordinate rows are explicit. Recently absent IDs are listed in
  diagnostics without inventing their positions or calling every absence a
  tracking failure. Red segments flag a diagnostic speed threshold, not a
  validated physical impossibility or an automatic correction.
- The rink outline is schematic; rounded-board calibration is not established.

Screenshots at **8, 16, 24 nominal seconds**, source frames 65858/66098/66338,
with IDs enabled and 1440 x 1100 viewport:
[8 s](screenshots/08s.png), [16 s](screenshots/16s.png),
[24 s](screenshots/24s.png).

## Reproduce full-period statistics

Optionally fetch the second period (about 25 MB), not the entire release:

```sh
curl -fL \
  'https://github.com/bigdatacup/Big-Data-Cup-2026/releases/download/Data/2025-10-11.Team.A.%40.Team.D.Tracking_P2.csv' \
  -o "$HOME/.cache/beautiful-chaos/bdc-2026/tracking-p2.csv"
python3 investigations/big-data-cup/analyze.py \
  "$HOME/.cache/beautiful-chaos/bdc-2026/tracking-p1.csv" \
  "$HOME/.cache/beautiful-chaos/bdc-2026/tracking-p2.csv" \
  > "$HOME/.cache/beautiful-chaos/bdc-2026/quality.json"
```

Output includes field missingness, source hashes, cadence/gap distributions,
coordinate ranges, duplicate identities/jerseys, per-track sample counts,
nominal within-span sampling rates and continuous-run lengths. These
measurements do not infer missing positions or equate track IDs with people.
Metrics dependent on 30 fps are explicitly named nominal/assumed.
Clock gaps and suffix gaps are separate: broadcast edits/stoppages are not
automatically treated as dropped live-play frames.

## Browser checks

With the viewer running, Node 22+ (built-in WebSocket) and Chrome installed:

```sh
node investigations/big-data-cup/verify.mjs
```

On other platforms set `CHROME` to your Chrome executable. The script starts
its own headless browser, verifies advancing playback, pause, Reset, repeated
pixel-identical seeks, explicit missing XY and puck visibility, and regenerates
the three screenshots. It stops Chrome and removes only its own temporary
profile. No Playwright/npm installation or application build is needed.
