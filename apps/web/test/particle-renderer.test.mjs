import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createParticleEngine, createDefaultParticleConfig } from "@beautiful-chaos/generative-engine";
import { parseMovementSequence } from "../.test-dist/apps/web/src/lib/movement-data.js";
import { drawParticleFrame } from "../.test-dist/apps/web/src/lib/particle-renderer.js";
import { initialPlaybackState, reducePlayback } from "../.test-dist/apps/web/src/lib/playback.js";

const sequence = parseMovementSequence(JSON.parse(readFileSync(
  new URL("../../../data/samples/neutral-zone-attack.json", import.meta.url), "utf8",
)));
const engine = createParticleEngine(sequence, createDefaultParticleConfig(sequence.teams.map((team) => team.teamId)));

test("Canvas clears history and paints configured pixel/trail colors without rink or player markers", () => {
  const calls = [];
  const strokes = [];
  let path = [];
  const context = {
    globalAlpha: 1,
    fillStyle: "",
    fillRect(...args) { calls.push({ args, color: this.fillStyle, opacity: this.globalAlpha }); },
    beginPath() { path = []; },
    moveTo(...point) { path.push(point); },
    lineTo(...point) { path.push(point); },
    stroke() { strokes.push({ path, opacity: this.globalAlpha, width: this.lineWidth, color: this.strokeStyle }); },
  };
  const frame = engine.frameAt(16000);
  drawParticleFrame(context, 1000, 500, sequence.metadata.rinkDimensionsMeters, frame);
  assert.deepEqual(calls[0], { args: [0, 0, 1000, 500], color: "#080b10", opacity: 1 });
  assert.equal(calls.length, 1 + frame.particles.reduce((sum, particle) =>
    sum + particle.trail.length + Number(particle.point !== null), 0));
  assert.equal(context.globalAlpha, 1);
  assert.equal(strokes.length, frame.traces.length * 3);
  assert.ok(strokes.every((stroke) => stroke.opacity >= 0 && stroke.opacity <= 1));
  assert.ok(strokes[0].width > strokes[1].width && strokes[1].width > strokes[2].width);
  assert.ok(strokes[0].opacity < strokes[1].opacity);
  assert.ok(calls.slice(1).every((call) => call.opacity >= 0 && call.opacity <= 1));
  const first = structuredClone(calls);
  const firstStrokes = structuredClone(strokes);
  calls.length = 0;
  strokes.length = 0;
  drawParticleFrame(context, 1000, 500, sequence.metadata.rinkDimensionsMeters, engine.frameAt(16000));
  assert.deepEqual(calls, first);
  assert.deepEqual(strokes, firstStrokes);
  calls.length = 0;
  strokes.length = 0;
  drawParticleFrame(context, 1000, 500, sequence.metadata.rinkDimensionsMeters, engine.frameAt(0));
  assert.equal(calls.length, 11);
  assert.equal(strokes.length, 0);
});

test("playback time, not browser-frame history or speed setting, determines particle output", () => {
  const reduce = (state, action) => reducePlayback(state, action, sequence.metadata.durationMs);
  let state = reduce(initialPlaybackState, { type: "play" });
  state = reduce(state, { type: "tick", elapsedMs: 1000 });
  const first = engine.frameAt(state.timestampMs);
  state = reduce(state, { type: "pause" });
  state = reduce(state, { type: "tick", elapsedMs: 2000 });
  assert.deepEqual(engine.frameAt(state.timestampMs), first);
  state = reduce(state, { type: "speed", speed: 2 });
  assert.deepEqual(engine.frameAt(state.timestampMs), first);
  state = reduce(state, { type: "seek", timestampMs: 20000 });
  state = reduce(state, { type: "seek", timestampMs: 1000 });
  assert.deepEqual(engine.frameAt(state.timestampMs), first);
  state = reduce(state, { type: "reset" });
  assert.deepEqual(state, initialPlaybackState);
  assert.deepEqual(engine.frameAt(state.timestampMs), engine.frameAt(0));
  state = reduce(state, { type: "play" });
  state = reduce(state, { type: "tick", elapsedMs: 1000 });
  assert.deepEqual(engine.frameAt(state.timestampMs), first);
});
