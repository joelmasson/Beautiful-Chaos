import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MovementSequenceSchema, TrackingPassageSchema } from "@beautiful-chaos/contracts";
import { createParticleEngine, createDefaultParticleConfig } from "@beautiful-chaos/generative-engine";
import { normalizeTracking, normalizeTrackingCoordinates, parseTrackingCsv } from "../.test-dist/data/big-data-cup/normalize.js";
import { readLocalTracking } from "../.test-dist/apps/web/src/lib/local-tracking.js";
import { loadTrackingPassage } from "../.test-dist/apps/web/src/lib/movement-data.js";
import { getTrackingFrame, nominalFrameIndex, initialPlaybackState, reducePlayback } from "../.test-dist/apps/web/src/lib/playback.js";

// Test-only miniature records, not redistributed provider data.
const header = "Image Id,Period,Game Clock,Player or Puck,Team,Player Id,Player Jersey Number,Rink Location X (Feet),Rink Location Y (Feet),Rink Location Z (Feet),Goal Score";
const row = (frame, team, id, x, y = 0, jersey = "52") =>
  [`2025-10-11 Team A @ Team D_${frame}`, "1", "19:55", "Player", team, id, jersey, x, y, "1", ""].join(",");
const csv = (...rows) => [header, ...rows].join("\n") + "\n";
const options = { startFrame: 100, frameCount: 12, nominalFps: 30 };
const away = Array.from({ length: 12 }, (_, i) => row(100 + i, "Away", "2", i, 1, "63"));
const home = [row(100, "Home", "1", 0), row(101, "Home", "1", 1),
  row(102, "Home", "1", ""), row(103, "Home", "1", 3), row(104, "Home", "1", 4),
  row(106, "Home", "1", 6), row(107, "Home", "1", 7, 0, "88"),
  row(108, "Home", "9", 8, 0, "88"), row(109, "Home", "9", 9, 0, "88")];
const text = csv(...home, ...away);
const make = () => normalizeTracking(text, "test-only.csv", options);

test("tracking coordinates transform without clamping, filling blanks or changing source values", () => {
  assert.deepEqual(normalizeTrackingCoordinates("100", "-42.5"), { status: "valid", x: 1, y: -1 });
  assert.deepEqual(normalizeTrackingCoordinates("-50", "21.25"), { status: "valid", x: -0.5, y: 0.5 });
  assert.equal(normalizeTrackingCoordinates("", "0").status, "missing");
  for (const x of ["NaN", "Infinity", "0x10", "101"]) assert.equal(normalizeTrackingCoordinates(x, "0").status, "invalid");
});

test("actual eleven-column CSV shape supports BOM, CRLF and quotes; malformed records fail explicitly", () => {
  assert.equal(parseTrackingCsv("\uFEFF" + text.replaceAll("\n", "\r\n")).length, home.length + away.length);
  assert.equal(parseTrackingCsv(text.replace("19:55", '"19:55"'))[0].cells[2], "19:55");
  assert.throws(() => parseTrackingCsv("wrong\n1"), /headers/);
  assert.throws(() => parseTrackingCsv(header + '\n"unfinished'), /unterminated/);
  assert.throws(() => parseTrackingCsv(header + "\n1,2"), /eleven/);
  assert.throws(() => normalizeTracking(text.replaceAll("Team A @ Team D", "wrong game"), "test.csv", options), /verified/);
});

test("all source IDs, frames, original feet, file hash and physical source lines remain traceable", () => {
  const p = make();
  assert.equal(p.source.sha256, createHash("sha256").update(text).digest("hex"));
  assert.equal(p.source.bytes, Buffer.byteLength(text));
  assert.equal(p.records[0].imageId, "2025-10-11 Team A @ Team D_100");
  assert.equal(p.records[0].line, 2);
  assert.equal(p.records[0].xFeet, "0");
  assert.equal(p.records[0].frame, 100);
  assert.equal(p.records[0].trackingId, "1");
  assert.equal(p.records.find(r => r.frame === 102 && r.team === "Home").xFeet, "");
  assert.equal(TrackingPassageSchema.safeParse(p).success, true);
});

test("missing XY, absent frames, jersey changes and tracking ID changes split independent tracklets", () => {
  const p = make();
  const tracklets = p.tracklets.filter(t => t.team === "Home");
  assert.deepEqual(tracklets.map(t => [t.trackingId, t.firstFrame, t.lastFrame, t.startReason]), [
    ["1", 100, 101, "first-observation"], ["1", 103, 104, "missing-or-invalid"],
    ["1", 106, 106, "frame-gap"], ["1", 107, 107, "jersey-change"],
    ["9", 108, 109, "first-observation"],
  ]);
  assert.equal(p.quality.missing, 1);
  assert.equal(p.quality.breaks, 3);
  assert.equal(p.quality.absentIdentitySlots, 1);
  assert.equal(p.movement.teams.flatMap(t => t.trajectories).flatMap(t => t.observations).length, p.quality.valid);
});

test("invalid coordinates and simultaneous duplicate identities are omitted, not selected arbitrarily", () => {
  const p = normalizeTracking(csv(row(100, "Home", "1", 0), row(101, "Home", "1", 101),
    row(102, "Home", "1", 2), row(103, "Home", "1", 3), row(103, "Home", "1", 4),
    row(104, "Home", "1", 5), ...away), "test.csv", options);
  assert.equal(p.quality.invalid, 3);
  assert.equal(p.records.filter(r => r.frame === 103 && r.team === "Home").every(r => r.status === "invalid"), true);
  assert.equal(p.tracklets.filter(t => t.team === "Home").length, 3);
  assert.equal(p.records.find(r => r.xFeet === "101").xFeet, "101");
});

test("no jersey stitching occurs and identical numeric track IDs are team-scoped", () => {
  const p = normalizeTracking(csv(row(100, "Home", "2", 0, 0, "63"), row(101, "Home", "3", 1, 0, "63"), ...away), "test.csv", options);
  const tracks = p.movement.teams.flatMap(t => t.trajectories);
  assert.equal(new Set(tracks.map(t => t.trackingId)).size, 3);
  assert.equal(p.tracklets.filter(t => t.team === "Home").length, 2);
});

test("global source frame discontinuities split paths and absent frames remain empty", () => {
  const p = normalizeTracking(csv(row(100, "Home", "1", 0), row(102, "Home", "1", 2),
    row(100, "Away", "2", 0), row(102, "Away", "2", 2)), "test.csv", { ...options, frameCount: 3 });
  assert.equal(p.quality.absentFrames, 1);
  assert.equal(p.tracklets.length, 4);
  assert.equal(getTrackingFrame(p.movement, p.movement.observationIntervalMs).players.length, 0);
  const engine = createParticleEngine(p.movement, createDefaultParticleConfig(["Home", "Away"]));
  assert.equal(engine.frameAt(p.movement.metadata.durationMs).traces.length, 0);
});

test("nominal fractional-ms cadence preserves every frame without resampling and requires explicit timing", () => {
  const p = make();
  assert.equal(p.movement.observationIntervalMs, 1000 / 30);
  assert.equal(p.movement.teams[1].trajectories[0].observations.length, 12);
  const legacy = structuredClone(p.movement);
  delete legacy.metadata.timing;
  assert.equal(MovementSequenceSchema.safeParse(legacy).success, false);
  const mismatch = structuredClone(p.movement);
  mismatch.metadata.timing.framesPerSecond = 25;
  assert.equal(MovementSequenceSchema.safeParse(mismatch).success, false);
  const changed = normalizeTracking(text, "test.csv", { ...options, nominalFps: 25 });
  assert.equal(changed.movement.observationIntervalMs, 40);
  assert.deepEqual(changed.records, p.records);
  assert.throws(() => normalizeTracking(text, "test.csv", { ...options, nominalFps: NaN }), /nominal/);
});

test("display is exact observed-frame sampling, never interpolated or held across missing frames", () => {
  const p = make(), step = p.movement.observationIntervalMs;
  assert.equal(nominalFrameIndex(p.movement, 3 * step), 3);
  assert.equal(getTrackingFrame(p.movement, 2 * step).players.some(p => p.teamId === "Home"), false);
  const frame = getTrackingFrame(p.movement, 3.8 * step);
  assert.ok(frame.players.every(p => p.position.kind === "observed"));
  assert.equal(frame.players.find(p => p.teamId === "Home").position.x, 0.03);
  assert.equal(frame.timestampMs, 3 * step);
});

test("tracers and particle emissions terminate at every tracklet boundary and preserve all valid consecutive turns", () => {
  const p = make(), step = p.movement.observationIntervalMs;
  const engine = createParticleEngine(p.movement, createDefaultParticleConfig(["Home", "Away"]));
  const traces = engine.frameAt(p.movement.metadata.durationMs).traces;
  const homeTraces = traces.filter(t => t.teamId === "Home");
  assert.deepEqual(homeTraces.map(t => [Math.round(t.fromTimestampMs / step), Math.round(t.timestampMs / step)]), [[0, 1], [3, 4], [8, 9]]);
  const homeBirths = engine.births.filter(b => b.teamId === "Home" && b.timestampMs > 0);
  assert.ok(homeBirths.every(b => [ [0,1], [3,4], [8,9] ].some(([a,z]) => b.timestampMs > a*step && b.timestampMs <= z*step)));
  assert.ok(traces.every(t => Math.abs((t.timestampMs - t.fromTimestampMs) - step) < 1e-8));
});

test("deterministic emission, seek order, frame reset and source immutability", () => {
  const p = make(), before = JSON.stringify(p);
  const config = createDefaultParticleConfig(["Home", "Away"]);
  const engine = createParticleEngine(p.movement, config);
  const expected = engine.frameAt(100);
  engine.frameAt(0); engine.frameAt(300);
  assert.deepEqual(engine.frameAt(100), expected);
  assert.deepEqual(createParticleEngine(p.movement, config).births, engine.births);
  assert.equal(JSON.stringify(p), before);
  assert.equal(JSON.stringify(normalizeTracking(text, "test-only.csv", options)), before);
  let state = reducePlayback(initialPlaybackState, { type: "play" }, p.movement.metadata.durationMs);
  state = reducePlayback(state, { type: "speed", speed: 2 }, p.movement.metadata.durationMs);
  state = reducePlayback(state, { type: "tick", elapsedMs: 100 }, p.movement.metadata.durationMs);
  assert.equal(nominalFrameIndex(p.movement, state.timestampMs), 6);
  state = reducePlayback(state, { type: "reset" }, p.movement.metadata.durationMs);
  assert.deepEqual(state, initialPlaybackState);
  assert.deepEqual(engine.frameAt(state.timestampMs), createParticleEngine(p.movement, config).frameAt(0));
});

test("missing/unreadable local files and invalid configuration fail clearly without synthetic fallback", async () => {
  await assert.rejects(readLocalTracking({}), /BDC_SOURCE_FILE/);
  await assert.rejects(readLocalTracking({ BDC_SOURCE_FILE: "relative.csv" }), /absolute/);
  await assert.rejects(readLocalTracking({ BDC_SOURCE_FILE: "/nonexistent-bdc-test.csv" }), /ENOENT/);
  const dir = await mkdtemp(join(tmpdir(), "bdc-source-test-"));
  try {
    const file = join(dir, "test.csv"); await writeFile(file, text);
    const env = { BDC_SOURCE_FILE: file, BDC_START_FRAME: "100", BDC_FRAME_COUNT: "12", BDC_NOMINAL_FPS: "30" };
    const p = await readLocalTracking(env);
    assert.equal(p.source.file, "test.csv");
    assert.equal(JSON.stringify(p).includes(dir), false);
    await assert.rejects(readLocalTracking({ ...env, BDC_NOMINAL_FPS: "" }), /nominal/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("tracking loader validates schema and surfaces local source setup errors", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json(make());
    assert.deepEqual(await loadTrackingPassage(new AbortController().signal), make());
    globalThis.fetch = async () => Response.json({ error: "Set BDC_SOURCE_FILE; no fallback" }, { status: 503 });
    await assert.rejects(loadTrackingPassage(new AbortController().signal), /BDC_SOURCE_FILE/);
    globalThis.fetch = async () => Response.json({});
    await assert.rejects(loadTrackingPassage(new AbortController().signal), /Invalid local tracking/);
  } finally { globalThis.fetch = original; }
});
