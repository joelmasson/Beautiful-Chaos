import type {
  MovementSequence,
  PlayerPosition,
  PlayerTrajectory,
} from "@beautiful-chaos/contracts";

export type PlaybackState = {
  timestampMs: number;
  playing: boolean;
  speed: number;
};

export type PlaybackAction =
  | { type: "play" | "pause" | "reset" }
  | { type: "seek"; timestampMs: number }
  | { type: "speed"; speed: number }
  | { type: "tick"; elapsedMs: number };

export const initialPlaybackState: PlaybackState = {
  timestampMs: 0,
  playing: false,
  speed: 1,
};

export function startPlaybackClock(
  onElapsed: (elapsedMs: number) => void,
  clock = {
    now: () => performance.now(),
    requestFrame: (callback: FrameRequestCallback) => requestAnimationFrame(callback),
    cancelFrame: (animationId: number) => cancelAnimationFrame(animationId),
  },
): () => void {
  let previousTime = clock.now();
  let active = true;
  let animationId: number;
  const tick = () => {
    if (!active) return;
    const now = clock.now();
    onElapsed(now - previousTime);
    previousTime = now;
    animationId = clock.requestFrame(tick);
  };
  animationId = clock.requestFrame(tick);
  return () => {
    active = false;
    clock.cancelFrame(animationId);
  };
}

function clampTimestamp(timestampMs: number, durationMs: number): number {
  if (!Number.isFinite(timestampMs)) throw new Error("Playback timestamp must be finite");
  return Math.min(durationMs, Math.max(0, timestampMs));
}

export function reducePlayback(
  state: PlaybackState,
  action: PlaybackAction,
  durationMs: number,
): PlaybackState {
  switch (action.type) {
    case "play":
      return {
        ...state,
        timestampMs: state.timestampMs >= durationMs ? 0 : state.timestampMs,
        playing: true,
      };
    case "pause":
      return { ...state, playing: false };
    case "reset":
      return { ...initialPlaybackState };
    case "seek": {
      const timestampMs = clampTimestamp(action.timestampMs, durationMs);
      return { ...state, timestampMs, playing: state.playing && timestampMs < durationMs };
    }
    case "speed":
      if (!Number.isFinite(action.speed) || action.speed <= 0) {
        throw new Error("Playback speed must be finite and positive");
      }
      return { ...state, speed: action.speed };
    case "tick": {
      if (!Number.isFinite(action.elapsedMs) || action.elapsedMs < 0) {
        throw new Error("Elapsed playback time must be finite and nonnegative");
      }
      if (!state.playing) return state;
      const timestampMs = clampTimestamp(
        state.timestampMs + action.elapsedMs * state.speed,
        durationMs,
      );
      return { ...state, timestampMs, playing: timestampMs < durationMs };
    }
  }
}

function findObservation(trajectory: PlayerTrajectory, timestampMs: number) {
  let low = 0;
  let high = trajectory.observations.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const observation = trajectory.observations[middle];
    if (observation.timestampMs === timestampMs) return observation;
    if (observation.timestampMs < timestampMs) low = middle + 1;
    else high = middle - 1;
  }
  return undefined;
}

export function getMovementFrame(sequence: MovementSequence, timestampMs: number) {
  const time = clampTimestamp(timestampMs, sequence.metadata.durationMs);
  const sampleTimestampMs = Math.floor(time / sequence.observationIntervalMs) *
    sequence.observationIntervalMs;
  const players = sequence.teams.flatMap((team) =>
    team.trajectories.flatMap((trajectory) => {
      const observation = findObservation(trajectory, sampleTimestampMs);
      if (!observation) return [];
      let position: PlayerPosition = observation.position;
      if (time !== sampleTimestampMs) {
        const nextTimestampMs = sampleTimestampMs + sequence.observationIntervalMs;
        const nextObservation = findObservation(trajectory, nextTimestampMs);
        if (
          !nextObservation ||
          observation.position.kind !== "observed" ||
          nextObservation.position.kind !== "observed"
        ) return [];
        const fraction = (time - sampleTimestampMs) / sequence.observationIntervalMs;
        position = {
          kind: "interpolated",
          x: observation.position.x + (nextObservation.position.x - observation.position.x) * fraction,
          y: observation.position.y + (nextObservation.position.y - observation.position.y) * fraction,
          confidence: {
            score: Math.min(observation.position.confidence.score, nextObservation.position.confidence.score),
            method: "playback-linear",
          },
          interpolation: {
            method: "linear",
            fromTimestampMs: sampleTimestampMs,
            toTimestampMs: nextTimestampMs,
          },
        };
      }
      return [{ teamId: team.teamId, color: team.color, observation, position }];
    }),
  );
  const present = new Set(players.map((player) => player.observation.trackingId));
  const missingTrackingIds = sequence.teams.flatMap((team) =>
    team.trajectories
      .filter((trajectory) => !present.has(trajectory.trackingId))
      .map((trajectory) => trajectory.trackingId),
  );
  return { timestampMs: time, sampleTimestampMs, players, missingTrackingIds };
}

export type MovementFrame = ReturnType<typeof getMovementFrame>;

export function nominalFrameIndex(sequence: MovementSequence, timestampMs: number): number {
  return Math.floor((clampTimestamp(timestampMs, sequence.metadata.durationMs) /
    sequence.observationIntervalMs) + 1e-8);
}

export function getTrackingFrame(sequence: MovementSequence, timestampMs: number): MovementFrame {
  const index = nominalFrameIndex(sequence, timestampMs);
  const time = index * sequence.observationIntervalMs;
  const players = sequence.teams.flatMap((team) => team.trajectories.flatMap((trajectory) => {
    const observation = findObservation(trajectory, time);
    return observation ? [{ teamId: team.teamId, color: team.color,
      observation, position: observation.position }] : [];
  }));
  const present = new Set(players.map((p) => p.observation.trackingId));
  return { timestampMs: time, sampleTimestampMs: time, players,
    missingTrackingIds: sequence.teams.flatMap((t) => t.trajectories
      .filter((track) => !present.has(track.trackingId)).map((track) => track.trackingId)) };
}

export function formatPlaybackTime(timestampMs: number): string {
  const tenths = Math.floor(timestampMs / 100);
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor(tenths / 10) % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths % 10}`;
}
