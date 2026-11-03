import {
  DuelingPixelsConfigSchema,
  type DuelingPixelsConfig,
  type RealGamePassage,
} from "@beautiful-chaos/contracts";
import type { ParticleFrame } from "./particles";

// These factors alter stationary artwork only; they are not reconstructed event physics.
const eventWeight: Record<string, number> = {
  faceoff: 0.8, "shot-on-goal": 1.2, "blocked-shot": 1, "missed-shot": 0.9,
  hit: 1.1, giveaway: 0.7, takeaway: 0.7, goal: 1.3,
};

export function createRecordedEventEngine(passage: RealGamePassage, input: DuelingPixelsConfig) {
  const config = DuelingPixelsConfigSchema.parse(input);
  const byTeam = new Map(config.systems.map((system) => [system.teamId, system]));
  if (passage.movement.teams.length !== 2 ||
    passage.movement.teams.some((team) => !byTeam.has(team.teamId))) {
    throw new Error("Recorded-event configuration must match the passage's two team IDs");
  }
  const marks = passage.events.flatMap((event) => {
    if (event.location.kind !== "recorded-event" || event.teamId === null) return [];
    const teamId = event.teamId;
    const system = byTeam.get(teamId);
    if (!system) throw new Error(`Unknown event team ${event.teamId}`);
    if (system.emissionRate === 0) return [];
    let state = (system.seed ^ event.eventId) >>> 0;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const weight = eventWeight[event.type] ?? 0.6;
    const count = Math.min(96, Math.max(1, Math.round(system.emissionRate * weight * 0.65)));
    const anchor = { x: event.location.x, y: event.location.y };
    return Array.from({ length: count }, (_, index) => {
      const angle = random() * Math.PI * 2;
      const radius = index === 0 ? 0 : Math.sqrt(random()) * 1.1 * weight;
      return {
        id: `recorded-event/${event.eventId}/${index}`,
        teamId,
        // This is an event identity, never a source player/track ID.
        trackingId: `event-${event.eventId}`,
        timestampMs: event.timestampMs,
        x: anchor.x + Math.cos(angle) * radius / (passage.movement.metadata.rinkDimensionsMeters.length / 2),
        y: anchor.y + Math.sin(angle) * radius / (passage.movement.metadata.rinkDimensionsMeters.width / 2),
        color: system.palette[Math.floor(random() * system.palette.length)],
        size: system.particleSize * (index === 0 ? 2 : 0.7 + random()),
        weight,
      };
    });
  });
  return {
    markCount: marks.length,
    frameAt(timestampMs: number): ParticleFrame {
      if (!Number.isFinite(timestampMs)) throw new Error("Recorded-event frame time must be finite");
      const time = Math.max(0, Math.min(passage.movement.metadata.durationMs, timestampMs));
      return {
        timestampMs: time,
        traces: [],
        particles: marks.flatMap((mark) => {
          const system = byTeam.get(mark.teamId);
          if (!system) throw new Error(`Unknown mark team ${mark.teamId}`);
          const duration = Math.max(100, system.trailPersistenceMs);
          const age = time - mark.timestampMs;
          if (age < 0 || age >= duration) return [];
          return [{
            id: mark.id, teamId: mark.teamId, trackingId: mark.trackingId,
            color: mark.color, size: mark.size,
            point: { x: mark.x, y: mark.y,
              opacity: Math.min(1, system.opacity * system.visualIntensity *
                system.trailIntensity * mark.weight) * (1 - age / duration) ** 1.25 },
            trail: [],
          }];
        }),
      };
    },
  };
}
