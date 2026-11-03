# Big Data Cup 2026 tracking investigation - Slice 1D.1

Investigation date: **2026-11-03**. **Read-only with respect to the application.**
No importer, application/renderer/contract changes, source smoothing, gap
interpolation or player-identity stitching were implemented.

## Recommendation at a glance

**Conditional go for a narrowly scoped, non-commercial Slice 1D.2 proof of
concept; not a drop-in reliable full-game player-tracking source.**

Actual player-specific XY observations can produce believable connected
six-second traces within continuous tracklets. However, identities fragment
heavily, some labels conflict, coverage is camera-limited, and exact subsecond
timing/coordinate reference-point semantics are undocumented. Licence terms
affirm non-profit research sharing, not unrestricted commercial generative art
or raw redistribution. Preserve these caveats instead of filling gaps.

## 1. Official source, hosting and bounded inspection

Primary sources:

1. [Official Big Data Cup 2026 repository and data definitions](https://github.com/bigdatacup/Big-Data-Cup-2026).
2. [Official Data release](https://github.com/bigdatacup/Big-Data-Cup-2026/releases/tag/Data)
   and [release metadata](https://api.github.com/repos/bigdatacup/Big-Data-Cup-2026/releases/tags/Data).
3. [Stathletes Public Data User Agreement](https://github.com/bigdatacup/Big-Data-Cup-2026/blob/main/legal.md).
4. [Official coordinate diagram](https://github.com/bigdatacup/Big-Data-Cup-2026/blob/main/rink_coords.png).
5. [Camera orientations](https://github.com/bigdatacup/Big-Data-Cup-2026/releases/download/Data/camera_orientations.csv).

The official README describes Stathletes event data plus player tracking
**generated from broadcast video**. These are provider-generated tracking
estimates, not certified sensor ground truth. Teams are anonymized, and
no NHL identities or league identity should be reverse-engineered from jerseys.
The [current competition landing page](https://stathletes.com/big-data-cup)
has rolled forward to a different 2027 dataset; this investigation uses the
2026 repository/release, not the new goalie-pose dataset or an older BDC edition.

The release contains **54 individually downloadable CSV assets, 674,203,388
bytes (~643 MiB), for ten games** dated 2025-10-11 through 2025-11-28.
Each game has separate Events/Shifts and Tracking_P1/P2/P3 files; two also
have Tracking_POT. A shared camera-orientation CSV is 371 bytes.
No full dataset/archive download is needed. A complete selected game's
tracking is 76,012,049 bytes across three regulation periods.

### Actual files inspected

| Asset | Bytes inspected/downloaded | Scope |
| --- | ---: | --- |
| [2025-10-11 Team A @ Team D Tracking_P1](https://github.com/bigdatacup/Big-Data-Cup-2026/releases/download/Data/2025-10-11.Team.A.%40.Team.D.Tracking_P1.csv) | 26,455,697 | Entire period, primary measurements/preview |
| [Same game Tracking_P2](https://github.com/bigdatacup/Big-Data-Cup-2026/releases/download/Data/2025-10-11.Team.A.%40.Team.D.Tracking_P2.csv) | 24,911,021 | Entire period, orientation/identity comparison |
| [Same game Events](https://github.com/bigdatacup/Big-Data-Cup-2026/releases/download/Data/2025-10-11.Team.A.%40.Team.D.Events.csv) | 172,284 | Actual header/home-away/coordinate context |
| [Same game Shifts](https://github.com/bigdatacup/Big-Data-Cup-2026/releases/download/Data/2025-10-11.Team.A.%40.Team.D.Shifts.csv) | 43,823 | Actual identity/clock conventions |
| Camera orientations | 371 | All ten game mappings |
| [2025-10-17 Team F @ Team L Tracking_P1](https://github.com/bigdatacup/Big-Data-Cup-2026/releases/download/Data/2025-10-17.Team.F.%40.Team.L.Tracking_P1.csv) | 262,144 of 22,867,284 | HTTP range prefix only; not a full-game assessment |

P1/P2 total **643,112 records**. P3 and the other full games were deliberately
not downloaded. Actual event fields establish **Team D home, Team A away**;
do not invert these based on the filename.

Raw P1/P2 SHA256:

```text
P1 1be4697eba033349ff48baaa4e7a178ce2def8aa0698ac82cc9aaa38697585d6
P2 200d60e4637681e686d2ce19facdd541bdbbfa6e670e9f839bb7f414d4566943
```

Raw downloads remain outside the repository in a private local investigation
directory. A redistributable raw sample is **not included** because raw
redistribution permission is unclear. Re-download the official period for local
research using the [standalone instructions](../investigations/big-data-cup/README.md).

## 2. Actual tracking schema (all eleven columns)

CSV cells are strings; types below describe observed values and safe
interpretation, not a new application contract.

| Exact column | Actual representation / meaning | Missingness/caveats |
| --- | --- | --- |
| `Image Id` | String: game/date/team prefix plus numeric suffix, e.g. suffix 065468 | Repeats for all entities in one frame. **Not just a game identifier** despite README wording. Unique suffix is an apparent source-frame index, not documented fps metadata. No separate game-ID column. |
| `Period` | Integer-text `1` / `2` in inspected full files | No missing full-file values |
| `Game Clock` | Remaining period time, `20:00`, `19:55`, later `1:00`; M:SS precision | No subsecond timestamp. Missing entirely in inspected second-game prefix. Not a unique frame key. |
| `Player or Puck` | Enum-text `Player` or `Puck` | No missing values in full files |
| `Team` | `Home`, `Away`; `n/a` for puck | Game-scoped role, not permanent team ID |
| `Player Id` | Numeric-text internal ID for players; `n/a` for puck | No blank player IDs in P1/P2, but heavy fragmentation/reuse across team roles; not NHL IDs |
| `Player Jersey Number` | Numeric-text, `Go` for goalie, blank unidentified; `n/a` for puck | Distinct from Player Id; identity evidence, not a globally unique key |
| `Rink Location X (Feet)` | Signed decimal feet | Empty values, not zero positions; paired missingness with Y |
| `Rink Location Y (Feet)` | Signed decimal feet | Same |
| `Rink Location Z (Feet)` | Decimal-text feet | Every player row is `1`; puck generally `0.02`, blank with unavailable puck, some P2 goal-area variations |
| `Goal Score` | Empty or `G` | Sparse event flag, not a score; P1 one G, P2 three G |

No separate wall-clock timestamp, calibrated frame duration, confidence,
velocity, body bounding box, track-quality flag or persistent roster identity
is present. `Image Id` is entity-frame provenance; `(period, Image Id, entity
type, team, Player Id)` identifies player records in these files.

The README does **not** specify whether XY is anatomical player centre,
skate contact, bounding-box footpoint or another projected reference point.
Player Z=1 is a placeholder, not evidence that XY is a particular body centre.
Ask Stathletes before describing these as calibrated player-centre coordinates.

Important actual-versus-documentation differences: separate jersey column;
frame-like Image Id suffix; variable M:SS clock width; missing coordinates;
fragmented IDs with contradictory jerseys; and a second game's blank clocks.
Actual shift headers are `Date, Home_Team, Away_Team, Team, Player_Id,
shift_number, period, start_clock, end_clock, shift_length`, not the README's
suggested `game_name/team_name` layout. Event/shift player references look like
jerseys or `Go`, not the tracking IDs; no unverified join was performed.

## 3. Measured temporal resolution

All statistics below come from the actual full tracking CSVs using
[analyze.py](../investigations/big-data-cup/analyze.py), not an assumed schema.

| Metric | P1 | P2 |
| --- | ---: | ---: |
| Total records | 331,871 | 311,241 |
| Player rows / puck rows | 297,458 / 34,413 | 276,175 / 35,066 |
| Unique Image Id frames | 34,413 | 35,066 |
| Unique integer game-clock values | 1,153 | 1,171 |
| Source suffix first-last | 65,468-132,578 | 168,325-227,792 |
| Frames per represented clock second, min / median / max | 1 / 30 / 57 | 1 / 30 / 59 |
| Mean frames per represented clock second | 29.846 | 29.945 |
| Frames / all 1,200 period seconds | 28.678 | 29.222 |
| Aggregate player rows / period second (not per-player Hz) | 247.882 | 230.146 |
| Adjacent frame-suffix gap, min / median / max | 1 / 1 / 4,541 | 1 / 1 / 5,056 |
| Mean frame-suffix gap | 1.9502 | 1.6959 |
| Suffix increments >1 | 31 | 24 |
| Suffix slots absent between first/last frame | 32,698 | 24,402 |
| Clock seconds absent from 20:00 through 0:00 inclusive | 48 | 30 |
| Clock jumps forward >1 s / reversals | 16 / 0 | 12 / 2 |

**Observed cadence is about 30 distinct frames per live clock second. Exact Hz
and exact millisecond intervals cannot be certified from these files.**
Clock precision is one second (within-second clock deltas are usually zero);
README supplies no source FPS or wall-clock timestamps. The frame suffix
behaves as an index, not a timestamp in milliseconds. 30 versus 29.97 Hz
cannot be resolved safely from clock-bin counts alone.

For diagnostic playback only, assume 30 fps within a contiguous source-frame
run: one frame ~=33.333 ms. This is a declared timing interpretation, **not
positional interpolation or recovered ground-truth timing**. Global suffix
jumps include broadcast stoppages/cuts/omissions, not necessarily dropped
on-ice frames. Do not project one continuous game clock from the entire suffix.
P2 clock reversals occur at suffixes 186556->186557 (13:13->13:14) and
194853->194854 (10:31->10:32).

### Per-track samples and observation-gap distribution

Track key here is `(period, team role, Player Id)`, **not a person**.

| Metric | P1 | P2 |
| --- | ---: | ---: |
| Track keys | 1,233 | 1,476 |
| Samples per key, min / median / mean / max | 1 / 149 / 241.25 / 2,079 | 1 / 126 / 187.11 / 1,739 |
| Adjacent observations within same key | 296,225 | 274,699 |
| Gap = 1 source frame | 295,776 | 274,249 |
| Gap = 2-3 frames | 244 | 231 |
| Gap = 4-30 frames | 130 | 132 |
| Gap = 31-180 frames | 44 | 55 |
| Gap >180 frames | 31 | 32 |
| Min / median / mean / max frame gap | 1 / 1 / 1.0676 / 840 | 1 / 1 / 1.0683 / 536 |
| Nominal interval min / median / mean / max at 30 fps | 33.33 / 33.33 / 35.59 ms / 28 s | 33.33 / 33.33 / 35.61 ms / 17.87 s |
| Mean per-key within-first/last nominal samples/s | 28.40 | 28.52 |
| Median per-key nominal samples/s | 30 | 30 |
| Conditional suffix-slot coverage inside each key's first-last span | 93.69% | 93.64% |

Per-key nominal rate = `rowCount * 30 / (lastFrame - firstFrame + 1)`.
It ranges from 0.115 to 30 in P1 and 0.166 to 30 in P2; these rates are
conditional on observed track spans, not full-period per-player coverage.
Detailed sample counts/rates for **every** track key are emitted by the
analysis command in the [reproduction guide](../investigations/big-data-cup/README.md#reproduce-full-period-statistics).
No true per-person sampling statistic is defensible without identity resolution.

Constant-looking local cadence coexists with long observation gaps and
camera omissions. No missing positions were interpolated to calculate these
figures. Suffix-slot deficits include exits/reentries/cuts, so they are not a
provider accuracy or dropped-frame percentage.

## 4. Identity continuity

| Metric | P1 | P2 |
| --- | ---: | ---: |
| Unique raw player IDs (ignoring team) | 1,058 | 1,276 |
| Home / Away track keys | 572 / 661 | 694 / 782 |
| Raw ID values appearing on both team roles | 175 | 200 |
| Team-scoped jersey labels, including `Go` | 40 | 41 |
| Keys with multiple nonblank jersey labels | 15 | 17 |
| Keys with multiple numeric jersey labels (excluding `Go`) | 3 | 5 |
| Track keys disappearing and reappearing after >1 suffix frame | 260 | 297 |
| Duplicate complete rows | 0 | 0 |
| Duplicate same-frame/team/track extra rows | 0 | 0 |
| Same-frame/team/jersey duplicate keys, including `Go` | 215 | 388 |
| Same-frame/team/numeric-jersey duplicate keys | 182 | 365 |
| Player rows with missing ID | 0 | 0 |
| Player rows with blank jersey | 1,758 (0.591%) | 2,268 (0.821%) |

Both-team raw IDs are **not proof that a person changed teams**: IDs are not
globally unique and must be scoped. There is no shared `(team, Player Id)` key
between these two periods (2,709 combined keys); do not infer cross-period
identity continuity from numeric resemblance. Jersey assignments are themselves
noisy: P1 Away track 542 has jerseys 5 and 88; tracks 2175 and 2223 have
63 and 92. Some other changes involve `Go` versus a numeric label.

One team/jersey maps to many track IDs: P1 Home 52 has 40 IDs; Home 88 has
39; Away 48 has 36; `Go` maps to 84 Home and 86 Away IDs. These are measured
fragmentation associations, not validated identity switches. Numeric jerseys
also appear on multiple simultaneous tracks. Automatically merging by jersey
would connect uncertain or contradictory observations.

**Conclusion:** player-specific tracklets exist, but persistent person identity
is not reliable enough to assume. A disappeared ID may reflect a substitution,
camera exit, occlusion, re-detection or identity change; source alone does not
separate these causes. Jersey numbers are game/team scoped evidence, not
globally unique players and not NHL identifiers.

## 5. Missingness, spatial quality and coordinates

| Metric | P1 | P2 |
| --- | ---: | ---: |
| Player XY missing pairs | 322 (0.108%) | 307 (0.111%) |
| Puck XY missing pairs | 1,635 (4.751%) | 1,534 (4.375%) |
| All missing XY rows | 1,957 | 1,841 |
| Frames with no player row | 19 | 38 |
| Player rows/frame, min / median / mean / max | 0 / 9 / 8.64 / 12 | 0 / 8 / 7.88 / 12 |
| Records outside rectangular +/-100 x +/-42.5 ft bounds | 0 | 0 |
| Near-edge rows: abs(x)>=99.9 or abs(y)>=42.48 ft | 3,201 | 3,321 |

These are **missing values in existing rows**, not total visibility/availability.
Absent players often have no row at all. Counts cannot establish an expected
12-player ground-truth denominator without resolving identities and shifts.
There is one puck row per represented frame, but its XY may be empty.
Empty coordinates never become `(0,0)` and absent entities receive no held
position.

P1 XY ranges:

- Players: x **[-100,100]**, y **[-41.856,42.487]** ft.
- Puck: x **[-100,100]**, y **[-39.954,42.487]** ft.

P2: players x **[-100,100]**, y **[-41.633,42.487]** ft; puck x
**[-100,100]**, y **[-40.1,42.487]** ft. Numerous repeated edge values
(notably y=42.487) and extreme local speeds warrant checking provider clipping/
projection behavior. They are **not** proof that every row is physically on ice.
Rounded-corner/board validity and the projection reference point are not
calibrated by this investigation. Do not silently clamp or smooth to improve art.
At assumed 30 fps, consecutive valid same-track row speeds exceed 60 ft/s
93 times in P1 and 95 in P2; maxima are 236.25 and 124.33 ft/s.
These are anomaly flags, not source-validated physical speed measurements.

### Axes and attacking orientation

The official diagram puts **(0,0) at centre ice**, +X to the camera's right,
+Y away from the camera/up in the diagram; the conventional rink dimensions
are **200 x 85 ft = 60.96 x 25.908 m**. The README describes camera-perspective
coordinates and supplies per-game first-period goalie-side metadata.

For Team A @ Team D, the camera file says **Away goalie on right in P1**.
Measured `Go`-labelled median x: Home **-87.179**, Away **85.887** in P1;
Home **86.533**, Away **-86.796** in P2. These support a fixed camera-facing
frame with ends changing between periods: Home attacks +X then -X; Away
attacks -X then +X. Goalie-label outliers exist; not every `Go` row is trusted.
P3 alternation is expected by hockey rules, **not measured here**.

### Cross-game check (strictly bounded)

The 262,144-byte Team F @ Team L P1 prefix has the same eleven headers.
After discarding the partial final CSV row **and entire incomplete final
frame**, 3,597 complete rows / 389 frames remain (3,208 player, 389 puck).
**Every inspected clock is blank.** Ranges x [-27.352,100],
y [-40.208,42.054] ft fit the same scale; no `Go` label is present in this
prefix, so goalie orientation cannot be independently confirmed there.
The camera file says Home goalie right in P1, opposite the first game's
Away-right mapping.

This supports common column/unit conventions, but **does not validate all
games' temporal metadata or orientation**. Blank clocks in a second game are
an explicit counterexample to assuming the first game's completeness globally.

### Proposed Beautiful Chaos normalization (proposal only)

1. Preserve raw CSV/hash, exact Image Id, period, game clock, team role, track
   ID, jersey label and missing-value flags.
2. Use game+period+team+tracking-ID segment scope; do not promote jerseys to
   permanent identity or stitch new IDs without separate evidence.
3. For valid source XY only, `xNormalized=xFeet/100`,
   `yNormalized=yFeet/42.5`; dimensions 60.96 x 25.908 m.
   Existing Canvas +X right/+Y up conventions already match. Keep rink axes
   fixed; store attacking orientation separately, never flip by possession.
4. Omit unknown positions; split paths on missing frames/XY, identity/jersey
   conflicts, camera cuts and unresolved timing. Preserve anomalous source
   positions with diagnostic flags; a future explicit exclusion policy needs
   review, not silent cleanup.
5. Obtain authoritative frame timing and reference-point semantics before
   claiming real-time six-second physical trajectories. For a restricted POC,
   an explicitly labelled nominal 30 fps assumption could be reviewed.
6. Existing contracts require integer-ms cadence-aligned observations and a
   confidence score; raw ~30 Hz does **not** fit one exact integer-ms lattice.
   A future source-preserving 100 ms subset might be possible only after clock/
   frame rate confirmation. No timestamp rounding, confidence=1 assignment,
   resampling, contract change or importer was performed here.

## 6. Standalone visual preview

The [isolated diagnostic](../investigations/big-data-cup/README.md) shows
actual P1 **19:55-19:30**, frames **65618-66368** inclusive: 751 contiguous
source frames, 8,717 records (7,966 player + 751 puck), **34 team/track IDs**,
13 nonblank team/jersey labels (including goalies), 49 blank-jersey player rows
and **8 player rows missing XY**. Both teams appear throughout; 8-12 player
rows have valid positions per frame. This is a relatively well-covered
25-second passage, selected deliberately to assess potential, **not claimed
representative of worst-case full-game quality**.

The preview displays a schematic rink, team colours, positions, fading
six-second raw-frame paths, optional jersey/track labels, separate puck diamond,
scrubber, Play/Pause/Reset, and missing/absent track diagnostics. No path joins
nonadjacent observations, new IDs, missing XY or changed jersey labels.
Red path segments flag >60 ft/s at the declared 30 fps assumption.
Unknown positions are not drawn at their last location.

| Screenshot, 1440 x 1100, IDs on | Nominal offset | Source frame / P1 clock | Current player rows |
| --- | ---: | --- | --- |
| [8 seconds](../investigations/big-data-cup/screenshots/08s.png) | 8 s | 65858 / 19:47 | Home 5, Away 6 |
| [16 seconds](../investigations/big-data-cup/screenshots/16s.png) | 16 s | 66098 / 19:39 | Home 4, Away 6 |
| [24 seconds](../investigations/big-data-cup/screenshots/24s.png) | 24 s | 66338 / 19:31 | Home 5, Away 5 |

Visual result: coordinated, hockey-like motion and turns are clearly visible;
many short paths look smooth enough for luminous traces. However, paths visibly
start/end as IDs change or leave view; occasional jitter/jumps and boundary
artifacts are apparent. The puck often sticks near the edge in this passage,
so its presence must not be mistaken for reliable continuous puck tracking.
Without synchronized video/ground truth, visual plausibility cannot certify
correct identities or spatial accuracy.

### Six-second continuity measured, not just judged by eye

Split valid player rows into runs requiring **consecutive source suffixes,
same team/ID and unchanged jersey label**, with no missing XY:

| Metric | P1 | P2 |
| --- | ---: | ---: |
| Runs | 1,856 | 2,083 |
| Median run frames / nominal duration | 78.5 / ~2.6 s | 77 / ~2.6 s |
| Runs spanning >=181 samples (six nominal seconds) | 590 | 567 |
| Longest run | 1,722 samples (~57.4 s) | 1,548 (~51.6 s) |
| Valid player observations with a complete prior 180-frame run | 130,986 / 297,136 (44.08%) | 93,209 / 275,868 (33.79%) |

The last row counts `sum(max(0, runLength-180))`, not the proportion of players
continuously tracked. No speed/accuracy exclusions were applied, so even these
unbroken runs can contain bad observations or identity mistakes.
Six-second tracers are **feasible locally**, not consistently available for
every skater throughout a game.

## 7. Licence, attribution and provenance

The applicable source is the repository's bespoke **Stathletes Public Data
User Agreement**, not MIT/CC or an unrestricted open-data licence.

| Question | Finding |
| --- | --- |
| Owner/original source | Stathletes; README says tracking generated from broadcast video. Exact underlying broadcast rights/league are not specified. |
| Local experimentation | Non-profit research is the stated purpose; this local read-only diagnostic fits that purpose. Using the service binds users to its terms. |
| Public derived research | Agreement permits sharing research produced from the dataset provided it is not used for profit. This supports non-commercial research figures/diagnostics. |
| Generative artwork/exhibition | Not expressly addressed. Do not treat permission for research as a blanket licence for public/commercial artwork. Obtain written clarification before publication outside research context or any monetization. |
| Attribution | No required wording/citation format found. Recommended: "Data provided by Stathletes, Big Data Cup 2026", link official release and agreement, retain provenance. Preview already does this. |
| Raw redistribution or embedding samples | Not explicitly granted. Do not commit/rehost CSVs or embed a raw coordinate passage in distributable HTML/JS without clarification. |
| Hackathon submissions | Stathletes retains the right to publish submitted work. No submission is made by this investigation. |

The three screenshots are derived diagnostic research figures with source
credit, not a redistributable tracking sample. The viewer's loopback data
endpoint is private local research only; public deployment would expose
coordinates and requires a separate permission decision.

## 8. Verification and next milestone

- Both full periods parsed with measured counts, exact hashes and no source
  writes. Actual second-game prefix inspected rather than extrapolated.
- Every one of the preview's **8,717 entity rows** was checked against its
  original CSV row: identical numeric XYZ and null missingness.
- Standalone browser checks passed via
  [verify.mjs](../investigations/big-data-cup/verify.mjs): playback advanced
  18 actual frames over ~600 ms; pause stable; Reset exact; repeated backward/
  forward seeks pixel-identical; frame 65800's missing XY surfaced; puck toggle
  works; no JavaScript exceptions. Fixed-size screenshots regenerated.
- No npm packages, main dependencies, application builds or Python vision
  changes required. Application regression suite not rerun because no
  application/package source was changed.
- Canonical fixture SHA256 remains
  `f0608ed93f212b961c1659a42cf53d763f7a90746405f006ae3f88624162eb77`.

**Recommended Slice 1D.2, only after approval:** a small isolated importer POC
for one explicitly selected continuous passage, with immutable provenance,
unknown positions retained, conservative tracklet segmentation, no jersey-only
stitching, measured anomaly flags, and an approved frame-time/confidence policy.
First request provider clarification on FPS, XY reference point, tracking-ID
semantics, confidence and raw/derived-art rights. If exact timing remains
unavailable, explicitly approve a nominal-time research POC or defer ingestion;
do not silently represent reconstructed timing as measured.

Do not replace the synthetic baseline, claim full-game persistent identities,
add collisions or promote this to commercial/public exhibition data on the
strength of this investigation alone. **Slice 1D.1 stops here.**
