import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DuelingPixelsConfigSchema, MovementSequenceSchema } from "@beautiful-chaos/contracts";
import { createDefaultParticleConfig, createParticleEngine } from "../dist/index.js";

const sample = MovementSequenceSchema.parse(JSON.parse(readFileSync(
  new URL("../../../data/samples/neutral-zone-attack.json", import.meta.url), "utf8",
)));
const defaultConfig = () => createDefaultParticleConfig(sample.teams.map((team) => team.teamId));
const defaultEngine = createParticleEngine(sample, defaultConfig());

test("canonical team assignments and complete default artistic configuration stay stable", () => {
  assert.deepEqual(defaultConfig(), {
    systems: [
      {
        teamId: "team-a", palette: ["#136cff", "#00d5ff", "#d9faff"], seed: 7219,
        lifespanMs: 4200, emissionRate: 70, particleSize: 2, opacity: 0.85,
        trailPersistenceMs: 6000, trailWidth: 2, trailIntensity: 1,
        movementInfluence: 0.2, visualIntensity: 1, wanderMeters: 0.35,
      },
      {
        teamId: "team-b", palette: ["#ff7224", "#f13d32", "#ffc35c"], seed: 1823,
        lifespanMs: 2400, emissionRate: 90, particleSize: 2.2, opacity: 0.9,
        trailPersistenceMs: 6000, trailWidth: 2.2, trailIntensity: 1,
        movementInfluence: 0.35, visualIntensity: 1, wanderMeters: 0.9,
      },
    ],
  });
});

test("opening artwork deterministically reveals only valid zero-time observations without motion", () => {
  const config = defaultConfig();
  const frame = defaultEngine.frameAt(0);
  assert.equal(frame.particles.length, 10);
  assert.equal(frame.particles.filter((particle) => particle.teamId === "team-a").length, 5);
  assert.equal(frame.particles.filter((particle) => particle.teamId === "team-b").length, 5);
  for (const particle of frame.particles) {
    const observation = sample.teams.find((team) => team.teamId === particle.teamId)
      .trajectories.find((track) => track.trackingId === particle.trackingId).observations[0];
    assert.equal(particle.point.x, observation.position.x);
    assert.equal(particle.point.y, observation.position.y);
    assert.equal(particle.trail.length, 0);
    const later = defaultEngine.frameAt(100).particles.find((entry) => entry.id === particle.id);
    assert.equal(later.point.x, particle.point.x);
    assert.equal(later.point.y, particle.point.y);
    assert.ok(later.point.opacity < particle.point.opacity);
  }
  assert.deepEqual(createParticleEngine(sample, config).frameAt(0), frame);
  const unavailable = movement({ missing: [0] });
  assert.equal(createParticleEngine(unavailable, config).frameAt(0).particles.length, 0);
  const estimated = movement();
  estimated.teams[0].trajectories[0].observations[0].position = {
    ...estimated.teams[0].trajectories[0].observations[0].position,
    kind: "interpolated",
    interpolation: { method: "linear", fromTimestampMs: 0, toTimestampMs: 100 },
  };
  assert.equal(createParticleEngine(estimated, config).frameAt(0).particles.length, 1);
});

function movement({ speed = 4, confidence = 1, missing = [], stationaryB = false } = {}) {
  return MovementSequenceSchema.parse({
    metadata: {
      ...sample.metadata, sequenceId: "test-sequence", durationMs: 6000,
    },
    observationIntervalMs: 100,
    teams: ["team-a", "team-b"].map((teamId, teamIndex) => ({
      teamId, label: teamId, color: "#ffffff",
      trajectories: [{
        trackingId: `track-${teamIndex}`,
        observations: Array.from({ length: 21 }, (_, index) => index * 100)
          .filter((timestampMs) => !missing.includes(timestampMs))
          .map((timestampMs) => ({
            sequenceId: "test-sequence", trackingId: `track-${teamIndex}`, timestampMs,
            position: {
              kind: "observed",
              x: (teamIndex === 1 && stationaryB ? 0 : speed * timestampMs / 1000 / 30),
              y: teamIndex * 0.2,
              confidence: { score: confidence },
            },
          })),
      }],
    })),
  });
}

test("independent defaults are validated, configurable, and assigned by team ID", () => {
  const config = defaultConfig();
  assert.doesNotThrow(() => DuelingPixelsConfigSchema.parse(config));
  assert.ok(config.systems[0].lifespanMs > config.systems[1].lifespanMs);
  assert.equal(config.systems[0].trailPersistenceMs, 6000);
  assert.equal(config.systems[1].trailPersistenceMs, 6000);
  assert.ok(config.systems[1].wanderMeters > config.systems[0].wanderMeters);
  for (const birth of defaultEngine.births) {
    const system = config.systems.find((entry) => entry.teamId === birth.teamId);
    assert.ok(system.palette.includes(birth.color));
    assert.ok(sample.teams.find((team) => team.teamId === birth.teamId)
      .trajectories.some((trajectory) => trajectory.trackingId === birth.trackingId));
  }
  const reversed = { systems: [...config.systems].reverse() };
  assert.deepEqual(createParticleEngine(sample, reversed).frameAt(16000), defaultEngine.frameAt(16000));
});

test("changing one system cannot change the other team's artwork", () => {
  const config = defaultConfig();
  Object.assign(config.systems[0], {
    palette: ["#aabbcc"], seed: 8, emissionRate: 25, lifespanMs: 1200,
    trailPersistenceMs: 0, movementInfluence: 1, wanderMeters: 1,
  });
  const changed = createParticleEngine(sample, config).frameAt(15000);
  const original = defaultEngine.frameAt(15000);
  assert.deepEqual(changed.particles.filter((particle) => particle.teamId === "team-b"),
    original.particles.filter((particle) => particle.teamId === "team-b"));
  assert.notDeepEqual(changed.particles.filter((particle) => particle.teamId === "team-a"),
    original.particles.filter((particle) => particle.teamId === "team-a"));
  assert.ok(changed.particles.filter((particle) => particle.teamId === "team-a")
    .every((particle) => particle.color === "#aabbcc"));
  assert.deepEqual(changed.traces.filter((trace) => trace.teamId === "team-b"),
    original.traces.filter((trace) => trace.teamId === "team-b"));
});

test("six-second tracers retain exact cadence paths, clip the window, and fade by historical age", () => {
  const frame = defaultEngine.frameAt(9000);
  const traces = frame.traces.filter((trace) => trace.trackingId === "A-01");
  assert.equal(traces.length, 60);
  assert.equal(traces[0].fromTimestampMs, 3000);
  assert.equal(traces.at(-1).timestampMs, 9000);
  const observations = sample.teams[0].trajectories[0].observations;
  for (const trace of traces) {
    const from = observations.find((observation) => observation.timestampMs === trace.fromTimestampMs);
    const to = observations.find((observation) => observation.timestampMs === trace.timestampMs);
    assert.deepEqual(trace.from, { x: from.position.x, y: from.position.y });
    assert.deepEqual(trace.to, { x: to.position.x, y: to.position.y });
  }
  assert.ok(traces[0].opacity < traces.at(-1).opacity);
  assert.ok(traces[0].diffusion > traces.at(-1).diffusion);
  const partial = defaultEngine.frameAt(9050).traces.filter((trace) => trace.trackingId === "A-01");
  assert.equal(partial[0].fromTimestampMs, 3050);
  assert.equal(partial.at(-1).timestampMs, 9050);
  assert.ok(partial.every((trace) => trace.fromTimestampMs >= 3050 && trace.timestampMs <= 9050));
});

test("tracers preserve right-angle turns and speed changes rather than shortcutting the path", () => {
  const source = movement();
  for (const team of source.teams) {
    for (const observation of team.trajectories[0].observations) {
      observation.position.x = Math.min(observation.timestampMs, 1000) / 10000;
      observation.position.y = Math.max(0, observation.timestampMs - 1000) / 5000;
    }
  }
  const traces = createParticleEngine(source, defaultConfig()).frameAt(2000).traces
    .filter((trace) => trace.teamId === "team-a");
  assert.equal(traces.length, 20);
  assert.ok(traces.slice(0, 10).every((trace) => trace.from.y === 0 && trace.to.y === 0));
  assert.ok(traces.slice(10).every((trace) => trace.from.x === 0.1 && trace.to.x === 0.1));
  assert.deepEqual(traces[9].to, traces[10].from);
  assert.equal(traces[9].timestampMs, 1000);
  assert.equal(traces[10].fromTimestampMs, 1000);
});

test("historical tracer gaps remain disconnected, including missing and estimated endpoints", () => {
  const source = movement({ missing: [500, 600, 700] });
  const estimated = source.teams[0].trajectories[0].observations.find((observation) => observation.timestampMs === 1000);
  estimated.position = { ...estimated.position, kind: "interpolated",
    interpolation: { method: "linear", fromTimestampMs: 900, toTimestampMs: 1100 } };
  const traces = createParticleEngine(source, defaultConfig()).frameAt(2000).traces;
  assert.ok(traces.some((trace) => trace.timestampMs === 400));
  assert.ok(traces.some((trace) => trace.fromTimestampMs === 800));
  assert.ok(traces.every((trace) => trace.timestampMs <= 400 || trace.fromTimestampMs >= 800));
  assert.ok(traces.filter((trace) => trace.teamId === "team-a")
    .every((trace) => trace.timestampMs <= 900 || trace.fromTimestampMs >= 1100));
  assert.ok(defaultEngine.frameAt(13000).traces.filter((trace) => trace.trackingId === "A-03")
    .every((trace) => trace.timestampMs <= 11600 || trace.fromTimestampMs >= 12000));
});

test("teams independently control tracer duration/appearance without extending particle lifetime or birth count", () => {
  const config = defaultConfig();
  config.systems[1].trailPersistenceMs = 2000;
  config.systems[1].trailWidth = 5;
  config.systems[1].trailIntensity = 0.4;
  const engine = createParticleEngine(sample, config);
  const frame = engine.frameAt(9050);
  assert.equal(frame.traces.filter((trace) => trace.trackingId === "A-01")[0].fromTimestampMs, 3050);
  assert.equal(frame.traces.filter((trace) => trace.trackingId === "B-01")[0].fromTimestampMs, 7050);
  assert.ok(frame.traces.filter((trace) => trace.teamId === "team-b").every((trace) => trace.width > 4));
  const long = defaultConfig();
  long.systems.forEach((system) => { system.trailPersistenceMs = 10000; });
  const longer = createParticleEngine(sample, long);
  assert.equal(longer.births.length, defaultEngine.births.length);
  assert.ok(longer.frameAt(16050).traces.length <= 1010);
  assert.deepEqual(longer.frameAt(16000).particles, defaultEngine.frameAt(16000).particles);
  const none = defaultConfig();
  none.systems.forEach((system) => { system.trailPersistenceMs = 0; });
  assert.equal(createParticleEngine(sample, none).frameAt(9000).traces.length, 0);
});

test("a stopped source retains its old tracer for exactly the configured history duration", () => {
  const config = defaultConfig();
  config.systems.forEach((system) => { system.trailPersistenceMs = 3000; });
  const engine = createParticleEngine(movement(), config);
  assert.ok(engine.frameAt(4999).traces.length > 0);
  assert.equal(engine.frameAt(5000).traces.length, 0);
  const newer = engine.frameAt(2500).traces.at(-1);
  const older = engine.frameAt(3500).traces.at(-1);
  assert.ok(newer.opacity > older.opacity);
  assert.deepEqual(newer.to, older.to);
});

test("solid pixels emit from known positions and physical speed/direction use the rink dimensions", () => {
  const source = movement({ stationaryB: true });
  const engine = createParticleEngine(source, defaultConfig());
  assert.ok(engine.births.length > 0);
  const movingBirths = engine.births.filter((birth) => birth.timestampMs > 0);
  assert.ok(movingBirths.every((birth) => birth.teamId === "team-a"));
  for (const birth of movingBirths) {
    assert.ok(Math.abs(birth.speedMetersPerSecond - 4) < 1e-10);
    assert.ok(Math.abs(birth.velocityX - 4) < 1e-10);
    assert.equal(birth.velocityY, 0);
    assert.ok(Math.abs(birth.x - 4 * birth.timestampMs / 1000 / 30) < 1e-10);
    assert.equal(birth.y, 0);
  }
  const vertical = movement();
  for (const team of vertical.teams) {
    for (const observation of team.trajectories[0].observations) {
      observation.position.x = 0;
      observation.position.y = -4 * observation.timestampMs / 1000 / 13;
    }
  }
  const birth = createParticleEngine(vertical, defaultConfig()).births.find((entry) => entry.timestampMs > 0);
  assert.equal(birth.velocityX, 0);
  assert.ok(Math.abs(birth.velocityY + 4) < 1e-10);
});

test("stationary sources only receive opening pixels; speed scales subsequent emission and movement response", () => {
  const stationary = createParticleEngine(movement({ speed: 0 }), defaultConfig());
  assert.equal(stationary.births.length, 2);
  assert.ok(stationary.births.every((birth) => birth.timestampMs === 0));
  const slow = createParticleEngine(movement({ speed: 2 }), defaultConfig());
  const fast = createParticleEngine(movement({ speed: 6 }), defaultConfig());
  assert.ok(fast.births.length > slow.births.length * 2);
  assert.ok(fast.births.find((birth) => birth.timestampMs > 0).velocityX >
    slow.births.find((birth) => birth.timestampMs > 0).velocityX);
  const noDrift = defaultConfig();
  for (const system of noDrift.systems) {
    system.movementInfluence = 0;
    system.wanderMeters = 0;
  }
  const engine = createParticleEngine(movement(), noDrift);
  const appearance = engine.frameAt(300).particles[0];
  const birth = engine.births.find((entry) => entry.id === appearance.id);
  assert.equal(appearance.point.x, birth.x);
  assert.equal(appearance.point.y, birth.y);
});

test("confidence reduces both emission and opacity; zero confidence cannot emit", () => {
  const full = createParticleEngine(movement(), defaultConfig());
  const half = createParticleEngine(movement({ confidence: 0.5 }), defaultConfig());
  const zero = createParticleEngine(movement({ confidence: 0 }), defaultConfig());
  assert.ok(half.births.length < full.births.length);
  assert.equal(zero.births.length, 0);
  assert.equal(zero.frameAt(1000).traces.length, 0);
  assert.ok(half.births.every((birth) => birth.confidence === 0.5));
  const first = half.births[0];
  const atBirth = half.frameAt(first.timestampMs).particles.find((particle) => particle.id === first.id);
  const opacity = defaultConfig().systems.find((system) => system.teamId === first.teamId).opacity;
  assert.ok(Math.abs(atBirth.point.opacity - opacity * 0.5) < 1e-10);
});

test("gaps stop new emissions without erasing the particles already alive", () => {
  const source = movement({ missing: [500, 600, 700] });
  const engine = createParticleEngine(source, defaultConfig());
  assert.equal(engine.births.some((birth) => birth.timestampMs > 400 && birth.timestampMs <= 800), false);
  assert.ok(engine.births.some((birth) => birth.timestampMs > 800));
  const before = engine.frameAt(400).particles;
  const during = engine.frameAt(650).particles;
  assert.ok(during.length > 0);
  const tracked = before[0];
  const later = during.find((particle) => particle.id === tracked.id);
  assert.ok(later);
  assert.ok(later.point.opacity < tracked.point.opacity);
  for (const [trackingId, start, end] of [["A-03", 11600, 12000], ["B-04", 15700, 15900], ["B-03", 21300, 21600]]) {
    assert.equal(defaultEngine.births.some((birth) =>
      birth.trackingId === trackingId && birth.timestampMs > start && birth.timestampMs <= end), false);
  }
});

test("estimated observations are never endpoints for new emissions", () => {
  const source = movement();
  const observation = source.teams[0].trajectories[0].observations[5];
  observation.position = {
    ...observation.position, kind: "interpolated",
    interpolation: { method: "linear", fromTimestampMs: 400, toTimestampMs: 600 },
  };
  const engine = createParticleEngine(source, defaultConfig());
  assert.equal(engine.births.some((birth) =>
    birth.teamId === "team-a" && birth.timestampMs > 400 && birth.timestampMs <= 600), false);
});

test("particle lifespan, opacity and independently persistent trails fade deterministically", () => {
  const config = defaultConfig();
  for (const system of config.systems) {
    system.lifespanMs = 1000;
    system.trailPersistenceMs = 500;
  }
  const engine = createParticleEngine(movement(), config);
  const birth = engine.births[0];
  const at = (age) => engine.frameAt(birth.timestampMs + age).particles.find((particle) => particle.id === birth.id);
  assert.ok(at(500).point.opacity < at(100).point.opacity);
  assert.ok(at(1001).point === null && at(1001).trail.length > 0);
  assert.equal(at(1501), undefined);
  const noTrails = structuredClone(config);
  noTrails.systems.forEach((system) => { system.trailPersistenceMs = 0; });
  const without = createParticleEngine(movement(), noTrails);
  assert.equal(without.frameAt(birth.timestampMs + 1001).particles.some((particle) => particle.id === birth.id), false);
  assert.ok(without.frameAt(500).particles.every((particle) => particle.trail.length === 0));
});

test("time-derived output is deterministic across seek order, reset, instances and seed changes", () => {
  const reference = defaultEngine.frameAt(16000.25);
  for (const time of [24000, 0, 16000.25, 9000, 30000, 16000.25]) defaultEngine.frameAt(time);
  assert.deepEqual(defaultEngine.frameAt(16000.25), reference);
  assert.deepEqual(createParticleEngine(sample, defaultConfig()).frameAt(16000.25), reference);
  assert.equal(defaultEngine.frameAt(0).particles.length, 10);
  assert.deepEqual(defaultEngine.frameAt(-100), defaultEngine.frameAt(0));
  assert.deepEqual(defaultEngine.frameAt(40000), defaultEngine.frameAt(30000));
  const changedSeed = defaultConfig();
  changedSeed.systems[0].seed++;
  assert.notDeepEqual(createParticleEngine(sample, changedSeed).frameAt(16000.25), reference);
  assert.throws(() => defaultEngine.frameAt(NaN), /timestamp must be finite/);
});

test("invalid config/assignments explicitly reject rather than using silent defaults", () => {
  for (const systems of [[], [defaultConfig().systems[0]], [...defaultConfig().systems, {
    ...defaultConfig().systems[0], teamId: "third",
  }]]) {
    const result = DuelingPixelsConfigSchema.safeParse({ systems });
    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.path.join(".") === "systems"));
  }
  assert.throws(() => createDefaultParticleConfig(["one-team"]), /exactly two/);
  const wrong = defaultConfig();
  wrong.systems[0].teamId = "unknown";
  assert.throws(() => createParticleEngine(sample, wrong), /must match/);
  const duplicate = defaultConfig();
  duplicate.systems[0].teamId = duplicate.systems[1].teamId;
  assert.throws(() => createParticleEngine(sample, duplicate), /distinct team IDs/);
  for (const [key, value] of [["emissionRate", -1], ["lifespanMs", 9000], ["seed", -1],
    ["opacity", 2], ["palette", ["blue"]], ["particleSize", 0],
    ["trailPersistenceMs", 10001], ["trailPersistenceMs", -1],
    ["trailWidth", 0], ["trailWidth", 9], ["trailIntensity", -1], ["trailIntensity", 3]]) {
    const invalid = defaultConfig();
    invalid.systems[0][key] = value;
    assert.throws(() => createParticleEngine(sample, invalid));
  }
});

test("zero emission/intensity and palettes are intentional independent artistic settings", () => {
  const config = defaultConfig();
  config.systems[0].emissionRate = 0;
  const engine = createParticleEngine(sample, config);
  assert.ok(engine.births.every((birth) => birth.teamId === "team-b"));
  config.systems[1].visualIntensity = 0;
  const dark = createParticleEngine(sample, config).frameAt(12000);
  assert.ok(dark.particles.every((particle) =>
    (!particle.point || particle.point.opacity === 0) && particle.trail.every((point) => point.opacity === 0)));
});

test("frozen source/config are untouched, birth records are read-only, returned frames cannot corrupt output", () => {
  const source = structuredClone(sample);
  const config = defaultConfig();
  const before = JSON.stringify(source);
  const freeze = (value) => {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
  };
  freeze(source);
  freeze(config);
  const engine = createParticleEngine(source, config);
  const initial = engine.frameAt(12000);
  const reference = structuredClone(initial);
  initial.particles.find((particle) => particle.point !== null).point.x = 999;
  initial.traces[0].from.x = 999;
  assert.deepEqual(engine.frameAt(12000), reference);
  assert.throws(() => { engine.births[0].x = 999; }, TypeError);
  assert.equal(JSON.stringify(source), before);
});
