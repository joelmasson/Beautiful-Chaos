import { writeFileSync } from "node:fs";
import {
  MovementSequenceSchema,
  type MovementSequence,
  type PlayerTrajectory,
} from "@beautiful-chaos/contracts";

const sequenceId = "synthetic-neutral-zone-attack-v1";
export const syntheticSequenceSeed = 7219;
const intervalMs = 100;
const phaseTimesMs = [0, 4000, 9000, 13000, 16000, 19000, 23000, 27000, 30000];
type Point = readonly [number, number];
type TrackPlan = {
  trackingId: string;
  waypoints: readonly Point[];
  missingTimestampsMs: readonly number[];
};

// Keyframes describe breakout, attack/support, a slot shot at 16s, and a defensive return.
const plans: readonly TrackPlan[] = [
  { trackingId: "A-01", waypoints: [[-0.68, -0.2], [-0.4, -0.18], [0.1, -0.12], [0.52, -0.16], [0.68, 0], [0.8, -0.14], [0.4, -0.16], [-0.1, -0.2], [-0.46, -0.22]], missingTimestampsMs: [] },
  { trackingId: "A-02", waypoints: [[-0.52, -0.5], [-0.22, -0.5], [0.23, -0.5], [0.68, -0.5], [0.83, -0.33], [0.86, -0.52], [0.36, -0.48], [-0.22, -0.46], [-0.6, -0.42]], missingTimestampsMs: [] },
  { trackingId: "A-03", waypoints: [[-0.55, 0.48], [-0.22, 0.48], [0.2, 0.42], [0.57, 0.38], [0.78, 0.2], [0.72, 0.48], [0.28, 0.4], [-0.25, 0.38], [-0.58, 0.35]], missingTimestampsMs: [11700, 11800, 11900] },
  { trackingId: "A-04", waypoints: [[-0.83, -0.4], [-0.6, -0.35], [-0.12, -0.32], [0.28, -0.35], [0.35, -0.34], [0.22, -0.32], [-0.12, -0.34], [-0.55, -0.32], [-0.78, -0.28]], missingTimestampsMs: [] },
  { trackingId: "A-05", waypoints: [[-0.8, 0.38], [-0.58, 0.3], [-0.15, 0.3], [0.22, 0.32], [0.33, 0.3], [0.18, 0.26], [-0.18, 0.28], [-0.6, 0.28], [-0.82, 0.25]], missingTimestampsMs: [] },
  { trackingId: "B-01", waypoints: [[-0.28, -0.1], [-0.14, -0.16], [0.35, -0.1], [0.7, -0.12], [0.81, -0.08], [0.74, -0.2], [0.3, -0.2], [-0.12, -0.16], [-0.52, -0.08]], missingTimestampsMs: [] },
  { trackingId: "B-02", waypoints: [[-0.16, -0.52], [0.02, -0.52], [0.4, -0.48], [0.77, -0.42], [0.9, -0.28], [0.82, -0.48], [0.33, -0.5], [-0.23, -0.46], [-0.6, -0.38]], missingTimestampsMs: [] },
  { trackingId: "B-03", waypoints: [[-0.18, 0.5], [0.03, 0.5], [0.42, 0.4], [0.73, 0.35], [0.87, 0.22], [0.79, 0.42], [0.3, 0.48], [-0.18, 0.44], [-0.57, 0.36]], missingTimestampsMs: [21400, 21500] },
  { trackingId: "B-04", waypoints: [[0.08, -0.25], [0.3, -0.25], [0.6, -0.24], [0.85, -0.2], [0.9, -0.13], [0.86, -0.24], [0.5, -0.32], [0.07, -0.32], [-0.27, -0.26]], missingTimestampsMs: [15800] },
  { trackingId: "B-05", waypoints: [[0.08, 0.26], [0.3, 0.24], [0.6, 0.22], [0.85, 0.18], [0.92, 0.12], [0.86, 0.2], [0.5, 0.3], [0.07, 0.3], [-0.27, 0.24]], missingTimestampsMs: [] },
];

function generateTrajectory(plan: TrackPlan, trackIndex: number, seed: number): PlayerTrajectory {
  const observations: PlayerTrajectory["observations"] = [];
  let randomState = (seed ^ Math.imul(trackIndex + 1, 0x9e3779b9)) >>> 0;
  const nextConfidence = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return Number((0.9 + (randomState / 4294967296) * 0.06).toFixed(2));
  };
  let segment = 0;
  for (let timestampMs = 0; timestampMs <= 30000; timestampMs += intervalMs) {
    if (plan.missingTimestampsMs.includes(timestampMs)) continue;
    while (segment < phaseTimesMs.length - 2 && timestampMs > phaseTimesMs[segment + 1]) {
      segment++;
    }
    const start = plan.waypoints[segment];
    const end = plan.waypoints[segment + 1];
    const fraction = (timestampMs - phaseTimesMs[segment]) /
      (phaseTimesMs[segment + 1] - phaseTimesMs[segment]);
    observations.push({
      sequenceId,
      trackingId: plan.trackingId,
      timestampMs,
      position: {
        kind: "observed",
        x: Number((start[0] + (end[0] - start[0]) * fraction).toFixed(5)),
        y: Number((start[1] + (end[1] - start[1]) * fraction).toFixed(5)),
        confidence: {
          score: nextConfidence(),
          method: "synthetic",
        },
      },
    });
  }
  return { trackingId: plan.trackingId, observations };
}

export function generateSyntheticSequence(seed = syntheticSequenceSeed): MovementSequence {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error("Synthetic sequence seed must be an unsigned 32-bit integer");
  }
  return MovementSequenceSchema.parse({
    metadata: {
      schemaVersion: 1,
      sequenceId,
      label: "Synthetic study / neutral-zone attack",
      durationMs: 30000,
      frameRate: 30,
      coordinateSystem: "rink-centered-normalized",
      rinkDimensionsMeters: { length: 60, width: 26 },
    },
    observationIntervalMs: intervalMs,
    teams: [
      { teamId: "team-a", label: "Team A", color: "#c4e66a", trajectories: plans.slice(0, 5).map((plan, index) => generateTrajectory(plan, index, seed)) },
      { teamId: "team-b", label: "Team B", color: "#e9a18d", trajectories: plans.slice(5).map((plan, index) => generateTrajectory(plan, index + 5, seed)) },
    ],
  });
}

if (require.main === module) {
  const outputPath = process.argv[2];
  if (!outputPath) throw new Error("Provide the output JSON path");
  writeFileSync(outputPath, `${JSON.stringify(generateSyntheticSequence(), null, 2)}\n`);
}
