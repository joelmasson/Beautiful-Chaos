import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import { PlayerReconstructionSchema } from "@beautiful-chaos/contracts";
import { createDefaultParticleConfig, createRecordedEventEngine } from "@beautiful-chaos/generative-engine";
import {
  NhlPlayByPlaySchema, NhlShiftsSchema, clockMs, gameTimeMs,
  normalizeEventLocation, normalizeRealGame, activePlayersAt,
} from "../.test-dist/data/nhl/normalize.js";
import { drawParticleFrame } from "../.test-dist/apps/web/src/lib/particle-renderer.js";
import { loadRealGamePassage } from "../.test-dist/apps/web/src/lib/movement-data.js";

const root = new URL("../../../data/nhl/2026020224/", import.meta.url);
const read = (name) => JSON.parse(readFileSync(new URL(name, root), "utf8"));
const plays = read("play-by-play.json");
const shifts = read("shifts.json");
const passage = normalizeRealGame(plays, shifts);
const config = createDefaultParticleConfig(passage.movement.teams.map((team) => team.teamId));

test("preserved raw payloads match provenance hashes and parse actual NHL response structures", () => {
  for (const source of read("provenance.json").sources) {
    assert.equal(createHash("sha256").update(readFileSync(new URL(source.rawFile, root))).digest("hex"), source.sha256);
  }
  assert.equal(NhlPlayByPlaySchema.parse(plays).plays.length, 308);
  assert.equal(NhlShiftsSchema.parse(shifts).data.length, 734);
  assert.throws(() => NhlPlayByPlaySchema.parse({ ...plays, plays: [{ eventId: "bad" }] }));
  assert.throws(() => NhlShiftsSchema.parse({ ...shifts, total: 999 }), /Incomplete shift response/);
});

test("candidate identity, clocks, event IDs and shift consistency reject explicit errors", () => {
  assert.throws(() => normalizeRealGame({ ...plays, id: 1 }, shifts), /does not match/);
  const badClock = structuredClone(plays);
  badClock.plays[0].timeRemaining = "19:00";
  assert.throws(() => normalizeRealGame(badClock, shifts), /clocks disagree/);
  const duplicate = structuredClone(plays);
  duplicate.plays.push(duplicate.plays[0]);
  assert.throws(() => normalizeRealGame(duplicate, shifts), /Duplicate event ID/);
  const badShift = structuredClone(shifts);
  badShift.data[0].endTime = "01:00";
  assert.throws(() => normalizeRealGame(plays, badShift), /invalid start\/end/);
  const badRoster = structuredClone(shifts);
  badRoster.data[0].playerId = 999;
  assert.throws(() => normalizeRealGame(plays, badRoster), /roster identity/);
});

test("timestamps normalize elapsed period clocks into regulation game and passage milliseconds", () => {
  assert.equal(clockMs("02:13"), 133000);
  assert.equal(gameTimeMs(1, "02:13"), 133000);
  assert.equal(gameTimeMs(2, "02:13"), 1333000);
  assert.equal(gameTimeMs(3, "20:00"), 3600000);
  assert.throws(() => gameTimeMs(4, "00:00"), /regulation/);
  assert.throws(() => gameTimeMs(1, "20:01"), /exceeds/);
  assert.throws(() => clockMs("12:60"));
  assert.equal(passage.movement.metadata.durationMs, 45000);
  assert.equal(passage.events.find((event) => event.eventId === 89).timestampMs, 13000);
  assert.ok(passage.events.every((event, index, events) => index === 0 ||
    event.timestampMs >= events[index - 1].timestampMs));
});

test("event coordinates normalize feet without flipping rink axes or becoming player positions", () => {
  assert.deepEqual(normalizeEventLocation(100, 42.5), { kind: "recorded-event", x: 1, y: 1 });
  assert.deepEqual(normalizeEventLocation(-100, -42.5), { kind: "recorded-event", x: -1, y: -1 });
  assert.equal(normalizeEventLocation(undefined, 2).kind, "unknown");
  assert.throws(() => normalizeEventLocation(101, 0));
  assert.throws(() => normalizeEventLocation(0, -43));
  const shot = passage.events.find((event) => event.eventId === 89);
  assert.equal(shot.location.kind, "recorded-event");
  assert.equal(shot.location.x, 0.62);
  assert.equal(shot.location.y, -39 / 42.5);
  assert.equal(passage.events.find((event) => event.eventId === 10).location.kind, "unknown");
});

test("period orientation alternates and matches shot/goal event signs, while coordinates stay arena-fixed", () => {
  const directions = new Map(plays.plays.map((event) =>
    [event.periodDescriptor.number, event.homeTeamDefendingSide]));
  assert.deepEqual([...directions], [[1, "right"], [2, "left"], [3, "right"]]);
  for (const event of plays.plays.filter((event) => event.typeDescKey === "goal")) {
    const home = event.details.eventOwnerTeamId === plays.homeTeam.id;
    const homeAttacksPositive = event.homeTeamDefendingSide === "left";
    assert.equal(event.details.xCoord > 0, home ? homeAttacksPositive : !homeAttacksPositive);
  }
  const bad = structuredClone(plays);
  bad.plays[1].homeTeamDefendingSide = "left";
  assert.throws(() => normalizeRealGame(bad, shifts), /Inconsistent/);
});

test("shift participation is start-inclusive/end-exclusive and duplicate overlap is surfaced, not double counted", () => {
  assert.equal(passage.shifts.length, 17);
  assert.equal(passage.players.length, 17);
  assert.equal(activePlayersAt(passage, 0).length, 12);
  for (const event of passage.events) {
    const active = new Set(activePlayersAt(passage, event.timestampMs).map((player) => player.playerId));
    assert.ok(event.participants.every((player) => active.has(player.playerId)),
      `Event ${event.eventId} participant is absent from active shifts`);
  }
  for (const shift of passage.shifts) {
    const start = shift.startGameMs - passage.startGameMs;
    const end = shift.endGameMs - passage.startGameMs;
    if (start >= 0 && start <= 45000) assert.ok(activePlayersAt(passage, start).some((player) => player.playerId === shift.playerId));
    if (end >= 0 && end <= 45000) assert.equal(activePlayersAt(passage, end).some((player) => player.playerId === shift.playerId), false);
  }
  assert.equal(passage.quality.length, 1);
  assert.match(passage.quality[0], /16813302\/16813303/);
  assert.throws(() => activePlayersAt(passage, -1), /within/);
});

test("source provenance points to exact raw event/shift records and retains participants", () => {
  for (const event of passage.events) {
    const index = Number(event.source.pointer.split("/").at(-1));
    assert.equal(plays.plays[index].eventId, event.eventId);
    assert.equal(event.source.recordId, event.eventId);
  }
  for (const shift of passage.shifts) {
    const index = Number(shift.source.pointer.split("/").at(-1));
    assert.equal(shifts.data[index].id, shift.shiftId);
  }
  const shot = passage.events.find((event) => event.eventId === 89);
  assert.ok(shot.participants.some((player) => player.role === "shootingPlayerId" && player.playerId === 8475690));
  assert.ok(shot.participants.some((player) => player.role === "goalieInNetId"));
});

test("reconstruction never promotes events or shifts to positions; unknown/observed/inferred remain distinct", () => {
  assert.ok(passage.players.every((player) => player.reconstruction.kind === "unknown"));
  assert.ok(passage.movement.teams.every((team) => team.trajectories.every((track) => track.observations.length === 0)));
  assert.equal(PlayerReconstructionSchema.safeParse({ kind: "unknown", reason: "no anchors", position: { x: 0, y: 0 } }).success, false);
  const anchor = passage.events[0].source;
  assert.equal(PlayerReconstructionSchema.safeParse({
    kind: "observed", position: { kind: "observed", x: 0, y: 0, confidence: { score: 1 } }, anchors: [anchor],
  }).success, true);
  const inferred = {
    kind: "inferred", position: { kind: "interpolated", x: 0, y: 0, confidence: { score: 0.2 },
      interpolation: { method: "test-only", fromTimestampMs: 100, toTimestampMs: 200 } },
    anchors: [anchor, passage.events[1].source],
  };
  assert.equal(PlayerReconstructionSchema.safeParse(inferred).success, true);
  assert.equal(PlayerReconstructionSchema.safeParse({ ...inferred, anchors: [anchor] }).success, false);
});

test("normalization and interpretation are deterministic and cannot modify frozen raw sources", () => {
  const freeze = (object) => {
    if (object && typeof object === "object") { Object.values(object).forEach(freeze); Object.freeze(object); }
  };
  const before = JSON.stringify([plays, shifts]);
  freeze(plays); freeze(shifts);
  assert.deepEqual(normalizeRealGame(plays, shifts), passage);
  freeze(passage); freeze(config);
  const engine = createRecordedEventEngine(passage, config);
  const expected = engine.frameAt(14000);
  for (const time of [0, 33000, 14000, 45000, 5000]) engine.frameAt(time);
  assert.deepEqual(engine.frameAt(14000), expected);
  assert.deepEqual(createRecordedEventEngine(passage, config).frameAt(14000), expected);
  assert.equal(JSON.stringify([plays, shifts]), before);
  const mutable = engine.frameAt(14000);
  mutable.particles[0].point.x = 999;
  assert.deepEqual(engine.frameAt(14000), expected);
});

test("recorded events use stationary artistic pixels, bounded history, no player tracers, and independent team settings", () => {
  const engine = createRecordedEventEngine(passage, config);
  assert.ok(engine.frameAt(0).particles.length > 0);
  assert.equal(engine.frameAt(0).traces.length, 0);
  const early = engine.frameAt(13000);
  const later = engine.frameAt(14000);
  const pixel = early.particles.find((particle) => particle.trackingId === "event-89");
  const same = later.particles.find((particle) => particle.id === pixel.id);
  assert.equal(same.point.x, pixel.point.x);
  assert.equal(same.point.y, pixel.point.y);
  assert.ok(same.point.opacity < pixel.point.opacity);
  assert.equal(engine.frameAt(19000).particles.some((particle) => particle.trackingId === "event-89"), false);
  assert.ok(later.particles.every((particle) => particle.trail.length === 0 && particle.trackingId.startsWith("event-")));
  const changed = structuredClone(config);
  changed.systems[0].emissionRate = 0;
  const other = createRecordedEventEngine(passage, changed);
  assert.deepEqual(other.frameAt(26000).particles, engine.frameAt(26000).particles.filter((pixel) => pixel.teamId !== "10"));
  assert.throws(() => engine.frameAt(NaN), /finite/);
  const wrong = structuredClone(config); wrong.systems[0].teamId = "wrong";
  assert.throws(() => createRecordedEventEngine(passage, wrong), /match/);
});

test("same renderer produces identical draw calls after repeated recorded-event seeks", () => {
  const engine = createRecordedEventEngine(passage, config);
  const draw = (time) => {
    const calls = [];
    const context = { fillRect(...rect) { calls.push([rect, this.globalAlpha, this.fillStyle]); } };
    drawParticleFrame(context, 1000, 500, passage.movement.metadata.rinkDimensionsMeters, engine.frameAt(time));
    return calls;
  };
  const expected = draw(14000);
  draw(26000); draw(0); draw(45000);
  assert.deepEqual(draw(14000), expected);
});

test("real-game loader validates responses and explicitly rejects HTTP and schema errors", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json(passage);
    assert.deepEqual(await loadRealGamePassage(new AbortController().signal), passage);
    globalThis.fetch = async () => new Response(null, { status: 503 });
    await assert.rejects(loadRealGamePassage(new AbortController().signal), /HTTP 503/);
    globalThis.fetch = async () => Response.json({});
    await assert.rejects(loadRealGamePassage(new AbortController().signal), /Invalid real-game passage/);
  } finally { globalThis.fetch = original; }
});
