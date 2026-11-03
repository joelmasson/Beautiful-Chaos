import {
  DuelingPixelsConfigSchema,
  type DuelingPixelsConfig,
  type MovementSequence,
  type ParticleSystemConfig,
} from "@beautiful-chaos/contracts";

const minimumSpeedMetersPerSecond = 0.05;
const referenceSpeedMetersPerSecond = 4;
const maxBirths = 100000;
const trailSamples = 6;
const maximumParticleWakeMs = 700;

export type ParticleBirth = Readonly<{
  id: string;
  teamId: string;
  trackingId: string;
  timestampMs: number;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  speedMetersPerSecond: number;
  confidence: number;
  color: string;
  size: number;
  phase: number;
  frequency: number;
}>;

export type ParticlePoint = { x: number; y: number; opacity: number };
export type ParticleAppearance = {
  id: string;
  teamId: string;
  trackingId: string;
  color: string;
  size: number;
  point: ParticlePoint | null;
  trail: ParticlePoint[];
};
type TracePosition = { x: number; y: number };
type MovementSegment = {
  teamId: string;
  trackingId: string;
  fromTimestampMs: number;
  timestampMs: number;
  from: TracePosition;
  to: TracePosition;
  confidence: number;
};
export type MovementTrace = {
  teamId: string;
  trackingId: string;
  fromTimestampMs: number;
  timestampMs: number;
  from: TracePosition;
  to: TracePosition;
  opacity: number;
  width: number;
  diffusion: number;
  color: string;
  highlight: string;
};
export type ParticleFrame = {
  timestampMs: number;
  particles: ParticleAppearance[];
  traces: MovementTrace[];
};

export function createDefaultParticleConfig(teamIds: readonly string[]): DuelingPixelsConfig {
  if (teamIds.length !== 2 || teamIds[0] === teamIds[1]) {
    throw new Error("Dueling Pixels requires exactly two distinct team IDs");
  }
  return {
    systems: [
      {
        teamId: teamIds[0],
        palette: ["#136cff", "#00d5ff", "#d9faff"],
        seed: 7219,
        lifespanMs: 4200,
        emissionRate: 70,
        particleSize: 2,
        opacity: 0.85,
        trailPersistenceMs: 6000,
        trailWidth: 2,
        trailIntensity: 1,
        movementInfluence: 0.2,
        visualIntensity: 1,
        wanderMeters: 0.35,
      },
      {
        teamId: teamIds[1],
        palette: ["#ff7224", "#f13d32", "#ffc35c"],
        seed: 1823,
        lifespanMs: 2400,
        emissionRate: 90,
        particleSize: 2.2,
        opacity: 0.9,
        trailPersistenceMs: 6000,
        trailWidth: 2.2,
        trailIntensity: 1,
        movementInfluence: 0.35,
        visualIntensity: 1,
        wanderMeters: 0.9,
      },
    ],
  };
}

function seededRandom(seed: number, identity: string) {
  let state = seed >>> 0;
  for (let index = 0; index < identity.length; index++) {
    state = Math.imul(state ^ identity.charCodeAt(index), 16777619) >>> 0;
  }
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function lowerBound(births: readonly { timestampMs: number }[], timestampMs: number) {
  let low = 0;
  let high = births.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (births[middle].timestampMs < timestampMs) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function createParticleEngine(sequence: MovementSequence, input: DuelingPixelsConfig) {
  const config = DuelingPixelsConfigSchema.parse(input);
  const systemByTeam = new Map(config.systems.map((system) => [system.teamId, system]));
  if (sequence.teams.length !== 2 || sequence.teams.some((team) => !systemByTeam.has(team.teamId))) {
    throw new Error("Particle configuration must match the sequence's two team IDs");
  }
  const dimensions = sequence.metadata.rinkDimensionsMeters;
  const halfLength = dimensions.length / 2;
  const halfWidth = dimensions.width / 2;
  const births: ParticleBirth[] = [];
  const segments: MovementSegment[] = [];

  for (const team of sequence.teams) {
    const system = systemByTeam.get(team.teamId);
    if (!system) throw new Error(`No particle system configured for ${team.teamId}`);
    for (const trajectory of team.trajectories) {
      let emissionCredit = 0;
      let birthIndex = 0;
      const random = seededRandom(system.seed, `${sequence.metadata.sequenceId}/${team.teamId}/${trajectory.trackingId}`);
      const initial = trajectory.observations[0];
      if (initial?.timestampMs === 0 && initial.position.kind === "observed" &&
        initial.position.confidence.score > 0 && system.emissionRate > 0) {
        if (births.length >= maxBirths) {
          throw new Error("Particle birth budget exceeded (100,000). Reduce emission rate or sequence length.");
        }
        // A single stationary opening pixel reveals known sources without inventing motion.
        const openingRandom = seededRandom(system.seed, `${sequence.metadata.sequenceId}/${team.teamId}/${trajectory.trackingId}/opening`);
        births.push(Object.freeze({
          id: `${team.teamId}/${trajectory.trackingId}/opening`,
          teamId: team.teamId,
          trackingId: trajectory.trackingId,
          timestampMs: 0,
          x: initial.position.x,
          y: initial.position.y,
          velocityX: 0,
          velocityY: 0,
          speedMetersPerSecond: 0,
          confidence: initial.position.confidence.score,
          color: system.palette[Math.floor(openingRandom() * system.palette.length)],
          size: system.particleSize * 2,
          phase: 0,
          frequency: 0,
        }));
      }
      for (let index = 1; index < trajectory.observations.length; index++) {
        const from = trajectory.observations[index - 1];
        const to = trajectory.observations[index];
        const elapsedMs = to.timestampMs - from.timestampMs;
        if (
          (sequence.metadata.timing
            ? Math.abs(elapsedMs - sequence.observationIntervalMs) > 1e-8
            : elapsedMs !== sequence.observationIntervalMs) ||
          from.position.kind !== "observed" ||
          to.position.kind !== "observed"
        ) {
          emissionCredit = 0;
          continue;
        }
        const velocityX = (to.position.x - from.position.x) * halfLength * 1000 / elapsedMs;
        const velocityY = (to.position.y - from.position.y) * halfWidth * 1000 / elapsedMs;
        const speed = Math.hypot(velocityX, velocityY);
        const confidence = Math.min(from.position.confidence.score, to.position.confidence.score);
        const rate = system.emissionRate * Math.min(2, speed / referenceSpeedMetersPerSecond) * confidence;
        if (speed < minimumSpeedMetersPerSecond || rate === 0) {
          emissionCredit = 0;
          continue;
        }
        if (segments.length >= maxBirths) {
          throw new Error("Movement tracer segment budget exceeded (100,000). Reduce sequence length or track count.");
        }
        segments.push({
          teamId: team.teamId,
          trackingId: trajectory.trackingId,
          fromTimestampMs: from.timestampMs,
          timestampMs: to.timestampMs,
          from: { x: from.position.x, y: from.position.y },
          to: { x: to.position.x, y: to.position.y },
          confidence,
        });
        const expected = rate * elapsedMs / 1000;
        const count = Math.floor(emissionCredit + expected);
        for (let emission = 0; emission < count; emission++) {
          if (births.length >= maxBirths) {
            throw new Error("Particle birth budget exceeded (100,000). Reduce emission rate or sequence length.");
          }
          const fraction = (emission + 1 - emissionCredit) / expected;
          births.push(Object.freeze({
            id: `${team.teamId}/${trajectory.trackingId}/${birthIndex++}`,
            teamId: team.teamId,
            trackingId: trajectory.trackingId,
            timestampMs: Math.min(to.timestampMs, from.timestampMs + fraction * elapsedMs),
            x: from.position.x + (to.position.x - from.position.x) * fraction,
            y: from.position.y + (to.position.y - from.position.y) * fraction,
            velocityX,
            velocityY,
            speedMetersPerSecond: speed,
            confidence,
            color: system.palette[Math.min(system.palette.length - 1, Math.floor(random() * system.palette.length))],
            size: system.particleSize * (0.65 + random() * 0.7),
            phase: random() * Math.PI * 2,
            frequency: 1.5 + random() * 2.5,
          }));
        }
        emissionCredit = emissionCredit + expected - count;
      }
    }
  }
  births.sort((left, right) => left.timestampMs - right.timestampMs ||
    (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  segments.sort((left, right) => left.timestampMs - right.timestampMs ||
    (left.trackingId < right.trackingId ? -1 : left.trackingId > right.trackingId ? 1 : 0));
  const maximumHistoryMs = Math.max(...config.systems.map((system) =>
    system.lifespanMs + Math.min(maximumParticleWakeMs, system.trailPersistenceMs)));
  const maximumTraceMs = Math.max(...config.systems.map((system) => system.trailPersistenceMs));

  function tracesAt(time: number): MovementTrace[] {
    const traces: MovementTrace[] = [];
    const start = lowerBound(segments, time - maximumTraceMs);
    for (let index = start; index < segments.length; index++) {
      const segment = segments[index];
      if (segment.fromTimestampMs >= time) break;
      const system = systemByTeam.get(segment.teamId);
      if (!system) throw new Error(`No particle system configured for ${segment.teamId}`);
      const duration = system.trailPersistenceMs;
      if (duration === 0 || segment.timestampMs <= time - duration) continue;
      const fromTime = Math.max(segment.fromTimestampMs, time - duration);
      const toTime = Math.min(segment.timestampMs, time);
      const interpolate = (timestamp: number): TracePosition => {
        const fraction = (timestamp - segment.fromTimestampMs) /
          (segment.timestampMs - segment.fromTimestampMs);
        return {
          x: segment.from.x + (segment.to.x - segment.from.x) * fraction,
          y: segment.from.y + (segment.to.y - segment.from.y) * fraction,
        };
      };
      const age = (time - (fromTime + toTime) / 2) / duration;
      traces.push({
        teamId: segment.teamId,
        trackingId: segment.trackingId,
        fromTimestampMs: fromTime,
        timestampMs: toTime,
        from: interpolate(fromTime),
        to: interpolate(toTime),
        opacity: Math.min(1, system.opacity * system.visualIntensity * system.trailIntensity *
          segment.confidence) * (1 - age) ** 1.25,
        width: system.trailWidth * (1 + 0.08 * Math.sin(segment.fromTimestampMs / 450 + system.seed)),
        diffusion: age,
        color: system.palette[Math.min(1, system.palette.length - 1)],
        highlight: system.palette[system.palette.length - 1],
      });
    }
    return traces;
  }

  function appearanceAt(birth: ParticleBirth, system: ParticleSystemConfig, ageMs: number): ParticlePoint | null {
    if (ageMs < 0 || ageMs >= system.lifespanMs) return null;
    const seconds = ageMs / 1000;
    const progress = ageMs / system.lifespanMs;
    const displacement = (1 - Math.exp(-seconds * 0.9)) / 0.9;
    const wander = system.wanderMeters *
      (Math.sin(birth.phase + seconds * birth.frequency) - Math.sin(birth.phase)) *
      (1 - Math.exp(-seconds * 2));
    const perpendicularX = birth.speedMetersPerSecond > 0 ? -birth.velocityY / birth.speedMetersPerSecond : 0;
    const perpendicularY = birth.speedMetersPerSecond > 0 ? birth.velocityX / birth.speedMetersPerSecond : 0;
    return {
      x: birth.x + (birth.velocityX * system.movementInfluence * displacement + perpendicularX * wander) / halfLength,
      y: birth.y + (birth.velocityY * system.movementInfluence * displacement + perpendicularY * wander) / halfWidth,
      opacity: Math.min(1, system.opacity * system.visualIntensity * birth.confidence) * (1 - progress) ** 2,
    };
  }

  return {
    births: Object.freeze(births),
    frameAt(timestampMs: number): ParticleFrame {
      if (!Number.isFinite(timestampMs)) throw new Error("Particle frame timestamp must be finite");
      const time = Math.min(sequence.metadata.durationMs, Math.max(0, timestampMs));
      const particles: ParticleAppearance[] = [];
      const start = lowerBound(births, time - maximumHistoryMs);
      for (let index = start; index < births.length && births[index].timestampMs <= time; index++) {
        const birth = births[index];
        const system = systemByTeam.get(birth.teamId);
        if (!system) throw new Error(`No particle system configured for ${birth.teamId}`);
        const ageMs = time - birth.timestampMs;
        const wakeMs = Math.min(maximumParticleWakeMs, system.trailPersistenceMs);
        if (ageMs >= system.lifespanMs + wakeMs) continue;
        const point = appearanceAt(birth, system, ageMs);
        const trail: ParticlePoint[] = [];
        if (wakeMs > 0) {
          for (let sample = 1; sample <= trailSamples; sample++) {
            const lagMs = wakeMs * sample / (trailSamples + 1);
            const previous = appearanceAt(birth, system, ageMs - lagMs);
            if (previous) {
              previous.opacity *= (1 - lagMs / wakeMs) * 0.3;
              trail.push(previous);
            }
          }
        }
        if (point || trail.length) {
          particles.push({
            id: birth.id, teamId: birth.teamId, trackingId: birth.trackingId,
            color: birth.color, size: birth.size, point, trail,
          });
        }
      }
      return { timestampMs: time, particles, traces: tracesAt(time) };
    },
  };
}
