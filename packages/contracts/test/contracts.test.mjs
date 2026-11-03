import assert from "node:assert/strict";
import test from "node:test";
import {
  GameSequenceMetadataSchema,
  GenerativeRenderingConfigSchema,
  PlayerTrajectorySchema,
} from "../dist/index.js";

test("accepts sequence metadata without a permanent player identity", () => {
  const parsed = GameSequenceMetadataSchema.parse({
    schemaVersion: 1,
    sequenceId: "sequence-demo",
    durationMs: 12000,
    frameRate: 30,
    coordinateSystem: "rink-centered-normalized",
    rinkDimensionsMeters: { length: 60, width: 26 },
  });

  assert.equal(parsed.sequenceId, "sequence-demo");
});

test("accepts observed and interpolated positions for a temporary track", () => {
  const result = PlayerTrajectorySchema.safeParse({
    trackingId: "track-17",
    observations: [
      {
        sequenceId: "sequence-demo",
        trackingId: "track-17",
        timestampMs: 100,
        position: {
          kind: "observed",
          x: -0.4,
          y: 0.2,
          confidence: { score: 0.91 },
        },
      },
      {
        sequenceId: "sequence-demo",
        trackingId: "track-17",
        timestampMs: 200,
        position: {
          kind: "interpolated",
          x: -0.2,
          y: 0.3,
          confidence: { score: 0.65, method: "linear" },
          interpolation: {
            method: "linear",
            fromTimestampMs: 100,
            toTimestampMs: 300,
          },
        },
      },
    ],
  });

  assert.equal(result.success, true);
});

test("rejects out-of-range confidence and inconsistent trajectory IDs", () => {
  const result = PlayerTrajectorySchema.safeParse({
    trackingId: "track-17",
    observations: [
      {
        sequenceId: "sequence-demo",
        trackingId: "different-track",
        timestampMs: 100,
        position: {
          kind: "observed",
          x: 0,
          y: 0,
          confidence: { score: 1.2 },
        },
      },
    ],
  });

  assert.equal(result.success, false);
});

test("validates rendering configuration without rendering artwork", () => {
  const result = GenerativeRenderingConfigSchema.safeParse({
    seed: 8,
    palette: ["#c4e66a", "#111210"],
    particleCount: 400,
    motionScale: 1.25,
    trailLength: 48,
    blendMode: "screen",
  });

  assert.equal(result.success, true);
});
