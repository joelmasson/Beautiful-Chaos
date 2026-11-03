import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { generateSyntheticSequence, syntheticSequenceSeed } from "../.test-dist/data/samples/generate.js";
import { PlayerPositionSchema } from "@beautiful-chaos/contracts";
import {
  loadSyntheticSequence,
  parseMovementSequence,
} from "../.test-dist/apps/web/src/lib/movement-data.js";
import {
  formatPlaybackTime,
  getMovementFrame,
  initialPlaybackState,
  reducePlayback,
  startPlaybackClock,
} from "../.test-dist/apps/web/src/lib/playback.js";
import {
  drawMovementFrame,
  getRinkViewport,
  rinkToCanvas,
} from "../.test-dist/apps/web/src/lib/rink-renderer.js";

const sampleText = readFileSync(
  new URL("../../../data/samples/neutral-zone-attack.json", import.meta.url),
  "utf8",
);
const sequence = parseMovementSequence(JSON.parse(sampleText));
const invalidSample = () => JSON.parse(sampleText);
const firstObservation = (sample) => sample.teams[0].trajectories[0].observations[0];
const reduce = (state, action) => reducePlayback(state, action, sequence.metadata.durationMs);

test("loads a valid 30-second sequence with ten temporary tracks on two teams", () => {
  assert.equal(sequence.metadata.durationMs, 30000);
  assert.equal(sequence.observationIntervalMs, 100);
  assert.equal(sequence.teams.length, 2);
  for (const team of sequence.teams) assert.equal(team.trajectories.length, 5);
  assert.equal(getMovementFrame(sequence, 0).players.length, 10);
  assert.equal(getMovementFrame(sequence, 30000).players.length, 10);
});

test("sample generation is deterministic and reproduces the checked-in JSON byte for byte", () => {
  assert.equal(syntheticSequenceSeed, 7219);
  assert.deepEqual(generateSyntheticSequence(), generateSyntheticSequence(syntheticSequenceSeed));
  assert.deepEqual(generateSyntheticSequence(42), generateSyntheticSequence(42));
  assert.notDeepEqual(generateSyntheticSequence(42), generateSyntheticSequence(43));
  assert.equal(`${JSON.stringify(generateSyntheticSequence(), null, 2)}\n`, sampleText);
});

test("seed variation changes confidence without randomizing paths or filling omissions", () => {
  const generated = generateSyntheticSequence(42);
  for (const [teamIndex, team] of generated.teams.entries()) {
    for (const [trackIndex, trajectory] of team.trajectories.entries()) {
      const original = sequence.teams[teamIndex].trajectories[trackIndex];
      assert.deepEqual(
        trajectory.observations.map(({ timestampMs, position }) => [timestampMs, position.x, position.y]),
        original.observations.map(({ timestampMs, position }) => [timestampMs, position.x, position.y]),
      );
    }
  }
  for (const seed of [-1, 1.2, NaN, Infinity, 0x100000000]) {
    assert.throws(() => generateSyntheticSequence(seed), /unsigned 32-bit integer/);
  }
});

test("synthetic waypoints produce a neutral-zone transition, attack and defensive return", () => {
  const attacker = sequence.teams[0].trajectories[0];
  const positionAt = (time) => attacker.observations.find((observation) => observation.timestampMs === time).position;
  assert.ok(positionAt(0).x < -0.5);
  assert.ok(positionAt(9000).x > 0);
  assert.ok(positionAt(16000).x > 0.6);
  assert.ok(positionAt(30000).x < -0.4);
  const supporter = sequence.teams[0].trajectories[3].observations.find((observation) => observation.timestampMs === 16000);
  assert.ok(supporter.position.x > 0 && supporter.position.x < positionAt(16000).x);
  // No skating leg exceeds 7 m/s, including spans over omitted observations.
  for (const team of sequence.teams) {
    for (const trajectory of team.trajectories) {
      for (let index = 1; index < trajectory.observations.length; index++) {
        const current = trajectory.observations[index];
        const previous = trajectory.observations[index - 1];
        const distanceMeters = Math.hypot(
          (current.position.x - previous.position.x) * 30,
          (current.position.y - previous.position.y) * 13,
        );
        assert.ok(distanceMeters / ((current.timestampMs - previous.timestampMs) / 1000) < 7);
      }
    }
  }
});

test("every observation is on the regular cadence and exactly six observations are omitted", () => {
  let count = 0;
  for (const team of sequence.teams) {
    for (const trajectory of team.trajectories) {
      for (const observation of trajectory.observations) {
        assert.equal(observation.timestampMs % 100, 0);
        assert.equal(observation.position.kind, "observed");
        assert.ok(observation.position.confidence.score >= 0 && observation.position.confidence.score <= 1);
        count++;
      }
    }
  }
  assert.equal(count, 3010 - 6);
});

test("rejects malformed data with a meaningful path rather than an empty fallback", () => {
  assert.throws(() => parseMovementSequence({}), /Invalid movement sequence:.*metadata/s);
  const sample = invalidSample();
  firstObservation(sample).position.confidence.score = 1.01;
  assert.throws(() => parseMovementSequence(sample), /teams\.0\.trajectories\.0\.observations\.0\.position\.confidence\.score/);
});

test("rejects descending and duplicate timestamps", () => {
  for (const timestamps of [[100, 0], [0, 0]]) {
    const sample = invalidSample();
    const observations = sample.teams[0].trajectories[0].observations;
    observations[0].timestampMs = timestamps[0];
    observations[1].timestampMs = timestamps[1];
    assert.throws(() => parseMovementSequence(sample), /timestamps must be strictly increasing/);
  }
});

test("accepts coordinate boundaries and rejects out-of-bounds coordinates", () => {
  const sample = invalidSample();
  firstObservation(sample).position.x = -1;
  firstObservation(sample).position.y = 1;
  assert.doesNotThrow(() => parseMovementSequence(sample));
  for (const [axis, value] of [["x", 1.001], ["y", -1.001]]) {
    const invalid = invalidSample();
    firstObservation(invalid).position[axis] = value;
    assert.throws(() => parseMovementSequence(invalid), /position\.(x|y)/);
  }
});

test("rejects observations with mismatched tracking and sequence IDs", () => {
  const sample = invalidSample();
  firstObservation(sample).trackingId = "other-track";
  assert.throws(() => parseMovementSequence(sample), /tracking ID must match/);
  firstObservation(sample).trackingId = "A-01";
  firstObservation(sample).sequenceId = "other-sequence";
  assert.throws(() => parseMovementSequence(sample), /sequence ID must match/);
});

test("rejects duplicate team and sequence-scoped tracking IDs", () => {
  const sample = invalidSample();
  sample.teams[1].teamId = sample.teams[0].teamId;
  assert.throws(() => parseMovementSequence(sample), /Team IDs must be unique/);
  sample.teams[1].teamId = "team-b";
  sample.teams[1].trajectories.push(sample.teams[0].trajectories[0]);
  assert.throws(() => parseMovementSequence(sample), /Tracking IDs must be unique/);
});

test("rejects invalid cadence and observations outside the sequence", () => {
  const sample = invalidSample();
  sample.observationIntervalMs = 0;
  assert.throws(() => parseMovementSequence(sample), /observationIntervalMs/);
  sample.observationIntervalMs = 31000;
  assert.throws(() => parseMovementSequence(sample), /interval cannot exceed sequence duration/);
  sample.observationIntervalMs = 100;
  firstObservation(sample).timestampMs = 1;
  assert.throws(() => parseMovementSequence(sample), /align with the sequence interval/);
  firstObservation(sample).timestampMs = 0;
  sample.teams[0].trajectories[0].observations.at(-1).timestampMs = 30100;
  assert.throws(() => parseMovementSequence(sample), /exceeds sequence duration/);
});

test("interpolated input is preserved and its timestamp must be inside declared bounds", () => {
  const sample = invalidSample();
  const observation = sample.teams[0].trajectories[0].observations[1];
  observation.position.kind = "interpolated";
  observation.position.interpolation = { method: "linear", fromTimestampMs: 0, toTimestampMs: 200 };
  const parsed = parseMovementSequence(sample);
  assert.equal(getMovementFrame(parsed, 100).players[0].observation.position.kind, "interpolated");
  observation.position.interpolation.fromTimestampMs = 100;
  assert.throws(() => parseMovementSequence(sample), /timestamp must lie inside source bounds/);
});

test("exact timestamps preserve observed positions and intermediate positions are linear", () => {
  const first = getMovementFrame(sequence, 0);
  const next = getMovementFrame(sequence, 100);
  const midpoint = getMovementFrame(sequence, 50);
  assert.equal(midpoint.timestampMs, 50);
  assert.equal(midpoint.sampleTimestampMs, 0);
  assert.equal(midpoint.players.length, 10);
  for (const [index, player] of midpoint.players.entries()) {
    assert.equal(first.players[index].position.kind, "observed");
    assert.equal(player.position.kind, "interpolated");
    assert.ok(Math.abs(player.position.x - (first.players[index].position.x + next.players[index].position.x) / 2) < 1e-12);
    assert.ok(Math.abs(player.position.y - (first.players[index].position.y + next.players[index].position.y) / 2) < 1e-12);
    assert.equal(player.position.confidence.score, Math.min(
      first.players[index].position.confidence.score, next.players[index].position.confidence.score,
    ));
    assert.deepEqual(player.position.interpolation, {
      method: "linear", fromTimestampMs: 0, toTimestampMs: 100,
    });
    assert.doesNotThrow(() => PlayerPositionSchema.parse(player.position));
    assert.equal(player.observation, first.players[index].observation);
  }
  const fractional = getMovementFrame(sequence, 25.5).players[0].position;
  assert.ok(Math.abs(fractional.x - (first.players[0].position.x +
    (next.players[0].position.x - first.players[0].position.x) * 0.255)) < 1e-12);
  assert.equal(next.sampleTimestampMs, 100);
  assert.notDeepEqual(next.players[0].observation.position, first.players[0].observation.position);
  assert.deepEqual(getMovementFrame(sequence, -100), first);
  assert.deepEqual(getMovementFrame(sequence, 40000), getMovementFrame(sequence, 30000));
});

test("missing observations hide only the affected skater until its next recorded sample", () => {
  for (const timestampMs of [11600.01, 11699, 11700, 11800, 11900, 11999]) {
    const frame = getMovementFrame(sequence, timestampMs);
    assert.equal(frame.players.length, 9);
    assert.deepEqual(frame.missingTrackingIds, ["A-03"]);
    assert.equal(frame.players.some((player) => player.observation.trackingId === "A-03"), false);
  }
  assert.equal(getMovementFrame(sequence, 11600).players.length, 10);
  assert.equal(getMovementFrame(sequence, 12000).players.length, 10);
  assert.deepEqual(getMovementFrame(sequence, 15800).missingTrackingIds, ["B-04"]);
  assert.deepEqual(getMovementFrame(sequence, 21400).missingTrackingIds, ["B-03"]);
  assert.deepEqual(getMovementFrame(sequence, 21600).missingTrackingIds, []);
});

test("interpolation never uses estimated endpoints or extrapolates unbounded positions", () => {
  const sample = invalidSample();
  const trajectory = sample.teams[0].trajectories[0];
  trajectory.observations[1].position = {
    ...trajectory.observations[1].position,
    kind: "interpolated",
    interpolation: { method: "linear", fromTimestampMs: 0, toTimestampMs: 200 },
  };
  let parsed = parseMovementSequence(sample);
  assert.deepEqual(getMovementFrame(parsed, 50).missingTrackingIds, ["A-01"]);
  assert.equal(getMovementFrame(parsed, 100).players[0].position.kind, "interpolated");
  assert.deepEqual(getMovementFrame(parsed, 150).missingTrackingIds, ["A-01"]);
  trajectory.observations.shift();
  parsed = parseMovementSequence(sample);
  assert.deepEqual(getMovementFrame(parsed, 0).missingTrackingIds, ["A-01"]);
  trajectory.observations.pop();
  parsed = parseMovementSequence(sample);
  assert.deepEqual(getMovementFrame(parsed, 29950).missingTrackingIds, ["A-01"]);
  assert.deepEqual(getMovementFrame(parsed, 30000).missingTrackingIds, ["A-01"]);
});

test("sampling and rendering do not mutate frozen source data", () => {
  const source = parseMovementSequence(JSON.parse(sampleText));
  const freeze = (value) => {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
  };
  const before = JSON.stringify(source);
  freeze(source);
  const context = Object.fromEntries(
    ["fillRect", "strokeRect", "beginPath", "moveTo", "lineTo", "stroke", "arc", "fill", "fillText"]
      .map((name) => [name, () => {}]),
  );
  for (const timestampMs of [0, 25.5, 50, 11650, 11999, 12000, 30000, 150, 100, 0]) {
    drawMovementFrame(context, 1000, 500, source.metadata.rinkDimensionsMeters,
      getMovementFrame(source, timestampMs), true);
  }
  assert.equal(JSON.stringify(source), before);
});

test("empty trajectories never fabricate positions", () => {
  const sample = invalidSample();
  sample.teams[0].trajectories[0].observations = [];
  const frame = getMovementFrame(parseMovementSequence(sample), 0);
  assert.equal(frame.players.length, 9);
  assert.deepEqual(frame.missingTrackingIds, ["A-01"]);
  assert.equal(getMovementFrame(parseMovementSequence({ ...sample, teams: [] }), 0).players.length, 0);
});

test("playback progresses by elapsed time, pauses, scrubs, changes speed, and resets", () => {
  let state = reduce(initialPlaybackState, { type: "tick", elapsedMs: 500 });
  assert.equal(state.timestampMs, 0);
  state = reduce(state, { type: "play" });
  state = reduce(state, { type: "tick", elapsedMs: 500 });
  assert.equal(state.timestampMs, 500);
  state = reduce(state, { type: "speed", speed: 2 });
  state = reduce(state, { type: "tick", elapsedMs: 750 });
  assert.equal(state.timestampMs, 2000);
  state = reduce(state, { type: "pause" });
  state = reduce(state, { type: "tick", elapsedMs: 1000 });
  assert.equal(state.timestampMs, 2000);
  state = reduce(state, { type: "seek", timestampMs: 11750 });
  assert.equal(state.timestampMs, 11750);
  assert.equal(state.playing, false);
  assert.deepEqual(getMovementFrame(sequence, state.timestampMs).missingTrackingIds, ["A-03"]);
  state = reduce(state, { type: "reset" });
  assert.deepEqual(state, initialPlaybackState);
});

test("playback is independent of animation-frame frequency", () => {
  const advance = (deltas) => deltas.reduce(
    (state, elapsedMs) => reduce(state, { type: "tick", elapsedMs }),
    reduce(initialPlaybackState, { type: "play" }),
  );
  assert.deepEqual(advance(Array(600).fill(10)), advance(Array(60).fill(100)));
  assert.deepEqual(advance([6000]), advance(Array(60).fill(100)));
});

test("forward and backward scrubbing produce the same interpolation and preserve pause state", () => {
  let state = initialPlaybackState;
  const initialFrame = getMovementFrame(sequence, 50);
  for (const timestampMs of [15000, 11750, 50, 29950, 0, 50]) {
    state = reduce(state, { type: "seek", timestampMs });
    assert.equal(state.timestampMs, timestampMs);
    assert.equal(state.playing, false);
  }
  assert.deepEqual(getMovementFrame(sequence, state.timestampMs), initialFrame);
  state = reduce(state, { type: "play" });
  state = reduce(state, { type: "seek", timestampMs: 200 });
  state = reduce(state, { type: "seek", timestampMs: 50 });
  assert.equal(state.playing, true);
  assert.deepEqual(getMovementFrame(sequence, state.timestampMs), initialFrame);
});

test("the clock measures monotonic elapsed time even when animation-frame timestamps are stale", () => {
  let now = 1000;
  let nextFrame;
  let scheduledId = 0;
  let canceledId;
  let state = reduce(initialPlaybackState, { type: "play" });
  const stop = startPlaybackClock(
    (elapsedMs) => { state = reduce(state, { type: "tick", elapsedMs }); },
    {
      now: () => now,
      requestFrame: (callback) => { nextFrame = callback; return ++scheduledId; },
      cancelFrame: (id) => { canceledId = id; },
    },
  );
  now = 1010;
  nextFrame(990);
  assert.equal(state.timestampMs, 10);
  now = 2010;
  nextFrame(1000);
  assert.equal(state.timestampMs, 1010);
  stop();
  assert.equal(canceledId, scheduledId);
  now = 3010;
  nextFrame(2000);
  assert.equal(state.timestampMs, 1010);
});

test("playback stops exactly at the end, replays from zero, and clamps timeline seeks", () => {
  let state = reduce(initialPlaybackState, { type: "play" });
  state = reduce(state, { type: "tick", elapsedMs: 31000 });
  assert.deepEqual(state, { timestampMs: 30000, playing: false, speed: 1 });
  state = reduce(state, { type: "play" });
  assert.equal(state.timestampMs, 0);
  assert.equal(state.playing, true);
  state = reduce(state, { type: "seek", timestampMs: -20 });
  assert.equal(state.timestampMs, 0);
  assert.equal(state.playing, true);
  state = reduce(state, { type: "seek", timestampMs: 40000 });
  assert.equal(state.timestampMs, 30000);
  assert.equal(state.playing, false);
});

test("invalid clock values surface errors", () => {
  assert.throws(() => reduce(initialPlaybackState, { type: "speed", speed: 0 }), /speed/);
  assert.throws(() => reduce(initialPlaybackState, { type: "speed", speed: Infinity }), /speed/);
  assert.throws(() => reduce(initialPlaybackState, { type: "tick", elapsedMs: -1 }), /Elapsed/);
  assert.throws(() => reduce(initialPlaybackState, { type: "seek", timestampMs: NaN }), /timestamp/);
});

test("time labels include the duration and tenths of seconds", () => {
  assert.equal(formatPlaybackTime(0), "00:00.0");
  assert.equal(formatPlaybackTime(11750), "00:11.7");
  assert.equal(formatPlaybackTime(30000), "00:30.0");
});

test("rink mapping preserves aspect ratio, center, boundaries, and positive-y orientation", () => {
  const rink = getRinkViewport(1000, 500, { length: 60, width: 26 });
  assert.ok(Math.abs(rink.width / rink.height - 60 / 26) < 1e-10);
  assert.deepEqual(rinkToCanvas({ x: 0, y: 0 }, rink), { x: 500, y: 250 });
  assert.deepEqual(rinkToCanvas({ x: -1, y: 1 }, rink), { x: rink.left, y: rink.top });
  assert.deepEqual(rinkToCanvas({ x: 1, y: -1 }, rink), {
    x: rink.left + rink.width,
    y: rink.top + rink.height,
  });
});

test("Canvas draws the recorded players, team colors, and configurable labels", () => {
  const calls = [];
  const context = Object.fromEntries(
    ["fillRect", "strokeRect", "beginPath", "moveTo", "lineTo", "stroke", "arc", "fill", "fillText"].map(
      (name) => [name, (...args) => calls.push({ name, args, color: context.fillStyle })],
    ),
  );
  drawMovementFrame(context, 1000, 500, sequence.metadata.rinkDimensionsMeters, getMovementFrame(sequence, 0), true);
  assert.equal(calls.filter((call) => call.name === "arc").length, 10);
  assert.equal(calls.filter((call) => call.name === "fillText").length, 10);
  assert.equal(calls.filter((call) => call.name === "fill" && call.color === "#c4e66a").length, 5);
  assert.equal(calls.filter((call) => call.name === "fill" && call.color === "#e9a18d").length, 5);
  calls.length = 0;
  drawMovementFrame(context, 1000, 500, sequence.metadata.rinkDimensionsMeters, getMovementFrame(sequence, 11800), false);
  assert.equal(calls.filter((call) => call.name === "arc").length, 9);
  assert.equal(calls.filter((call) => call.name === "fillText").length, 0);
  calls.length = 0;
  const frame = getMovementFrame(sequence, 50);
  drawMovementFrame(context, 1000, 500, sequence.metadata.rinkDimensionsMeters, frame, true);
  assert.equal(calls.filter((call) => call.name === "arc").length, 10);
  assert.equal(calls.filter((call) => call.name === "fill").length, 0);
  const point = rinkToCanvas(frame.players[0].position,
    getRinkViewport(1000, 500, sequence.metadata.rinkDimensionsMeters));
  const firstArc = calls.find((call) => call.name === "arc");
  assert.deepEqual(firstArc.args.slice(0, 2), [point.x, point.y]);
});

test("local JSON loader validates the response and rejects invalid data and HTTP errors", async (context) => {
  const signal = new AbortController().signal;
  context.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "/api/sample");
    assert.equal(options.signal, signal);
    return Response.json(sequence);
  });
  assert.deepEqual(await loadSyntheticSequence(signal), sequence);
  globalThis.fetch = async () => Response.json({ invalid: true });
  await assert.rejects(loadSyntheticSequence(signal), /Invalid movement sequence/);
  globalThis.fetch = async () => new Response(null, { status: 503 });
  await assert.rejects(loadSyntheticSequence(signal), /HTTP 503/);
});
