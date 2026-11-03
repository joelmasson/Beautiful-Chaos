import { z } from "zod";

export const MovementConfidenceSchema = z
  .object({
    score: z.number().min(0).max(1),
    method: z.string().min(1).optional(),
  })
  .strict();

const NormalizedCoordinateSchema = z.number().min(-1).max(1);

const PositionCoordinatesSchema = z
  .object({
    x: NormalizedCoordinateSchema,
    y: NormalizedCoordinateSchema,
  })
  .strict();

export const ObservedPositionSchema = PositionCoordinatesSchema.extend({
  kind: z.literal("observed"),
  confidence: MovementConfidenceSchema,
}).strict();

export const InterpolatedPositionSchema = PositionCoordinatesSchema.extend({
  kind: z.literal("interpolated"),
  confidence: MovementConfidenceSchema,
  interpolation: z
    .object({
      method: z.string().min(1),
      fromTimestampMs: z.number().int().nonnegative(),
      toTimestampMs: z.number().int().nonnegative(),
    })
    .strict()
    .refine(
      ({ fromTimestampMs, toTimestampMs }) =>
        fromTimestampMs < toTimestampMs,
      "Interpolation start must precede its end",
    ),
}).strict();

export const PlayerPositionSchema = z.discriminatedUnion("kind", [
  ObservedPositionSchema,
  InterpolatedPositionSchema,
]);

export const PlayerMovementObservationSchema = z
  .object({
    sequenceId: z.string().min(1),
    trackingId: z.string().min(1),
    timestampMs: z.number().finite().nonnegative(),
    position: PlayerPositionSchema,
  })
  .strict();

export const PlayerTrajectorySchema = z
  .object({
    trackingId: z.string().min(1),
    observations: z.array(PlayerMovementObservationSchema),
  })
  .strict()
  .superRefine(({ trackingId, observations }, context) => {
    let previousTimestamp = -1;

    observations.forEach((observation, index) => {
      if (observation.trackingId !== trackingId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["observations", index, "trackingId"],
          message: "Observation tracking ID must match its trajectory",
        });
      }

      if (observation.timestampMs <= previousTimestamp) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["observations", index, "timestampMs"],
          message: "Trajectory timestamps must be strictly increasing",
        });
      }

      previousTimestamp = observation.timestampMs;
    });
  });

export const GameSequenceMetadataSchema = z
  .object({
    schemaVersion: z.literal(1),
    sequenceId: z.string().min(1),
    label: z.string().min(1).optional(),
    durationMs: z.number().finite().positive(),
    frameRate: z.number().positive(),
    timing: z.object({
      kind: z.literal("nominal-source-frames"),
      framesPerSecond: z.number().min(1).max(120),
    }).strict().optional(),
    coordinateSystem: z.literal("rink-centered-normalized"),
    rinkDimensionsMeters: z
      .object({
        length: z.number().positive(),
        width: z.number().positive(),
      })
      .strict(),
  })
  .strict();

export const MovementTeamSchema = z
  .object({
    teamId: z.string().min(1),
    label: z.string().min(1),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Expected a six-digit hex color"),
    trajectories: z.array(PlayerTrajectorySchema),
  })
  .strict();

export const MovementSequenceSchema = z
  .object({
    metadata: GameSequenceMetadataSchema,
    observationIntervalMs: z.number().finite().positive(),
    teams: z.array(MovementTeamSchema),
  })
  .strict()
  .superRefine(({ metadata, observationIntervalMs, teams }, context) => {
    const teamIds = new Set<string>();
    const trackingIds = new Set<string>();
    const nominal = metadata.timing;
    if (nominal && Math.abs(observationIntervalMs - 1000 / nominal.framesPerSecond) > 1e-8) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["observationIntervalMs"],
        message: "Nominal frame cadence must match the declared frame rate" });
    }
    if (!nominal && (!Number.isInteger(metadata.durationMs) || !Number.isInteger(observationIntervalMs))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["metadata"],
        message: "Fractional milliseconds require explicit nominal-source-frames timing" });
    }

    if (observationIntervalMs > metadata.durationMs) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["observationIntervalMs"],
        message: "Observation interval cannot exceed sequence duration",
      });
    }

    teams.forEach((team, teamIndex) => {
      if (teamIds.has(team.teamId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["teams", teamIndex, "teamId"],
          message: "Team IDs must be unique within a sequence",
        });
      }
      teamIds.add(team.teamId);

      team.trajectories.forEach((trajectory, trajectoryIndex) => {
        const path = ["teams", teamIndex, "trajectories", trajectoryIndex];
        if (trackingIds.has(trajectory.trackingId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...path, "trackingId"],
            message: "Tracking IDs must be unique within a sequence",
          });
        }
        trackingIds.add(trajectory.trackingId);

        trajectory.observations.forEach((observation, observationIndex) => {
          const observationPath = [...path, "observations", observationIndex];
          if (observation.sequenceId !== metadata.sequenceId) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: [...observationPath, "sequenceId"],
              message: "Observation sequence ID must match its metadata",
            });
          }
          if (observation.timestampMs > metadata.durationMs) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: [...observationPath, "timestampMs"],
              message: "Observation timestamp exceeds sequence duration",
            });
          }
          const slot = observation.timestampMs / observationIntervalMs;
          if (nominal
            ? Math.abs(slot - Math.round(slot)) > 1e-8
            : !Number.isInteger(observation.timestampMs) || observation.timestampMs % observationIntervalMs !== 0) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: [...observationPath, "timestampMs"],
              message: "Observation timestamp must align with the sequence interval",
            });
          }
          if (observation.position.kind === "interpolated") {
            const { fromTimestampMs, toTimestampMs } = observation.position.interpolation;
            if (
              observation.timestampMs <= fromTimestampMs ||
              observation.timestampMs >= toTimestampMs ||
              toTimestampMs > metadata.durationMs
            ) {
              context.addIssue({
                code: z.ZodIssueCode.custom,
                path: [...observationPath, "position", "interpolation"],
                message: "Interpolated timestamp must lie inside source bounds within the sequence",
              });
            }
          }
        });
      });
    });
  });

export const GenerativeRenderingConfigSchema = z
  .object({
    seed: z.number().int().nonnegative(),
    palette: z.array(z.string().min(1)).min(1),
    particleCount: z.number().int().positive(),
    motionScale: z.number().positive(),
    trailLength: z.number().int().positive(),
    blendMode: z.enum(["normal", "multiply", "screen", "overlay"]),
  })
  .strict();

export const ParticleSystemConfigSchema = z
  .object({
    teamId: z.string().min(1),
    palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(1).max(8),
    seed: z.number().int().min(0).max(0xffffffff),
    lifespanMs: z.number().int().min(100).max(8000),
    emissionRate: z.number().min(0).max(120),
    particleSize: z.number().min(0.5).max(8),
    opacity: z.number().min(0).max(1),
    trailPersistenceMs: z.number().int().min(0).max(10000),
    trailWidth: z.number().min(0.5).max(8),
    trailIntensity: z.number().min(0).max(2),
    movementInfluence: z.number().min(0).max(2),
    visualIntensity: z.number().min(0).max(2),
    wanderMeters: z.number().min(0).max(2),
  })
  .strict();

export const DuelingPixelsConfigSchema = z
  .object({
    systems: z.array(ParticleSystemConfigSchema).length(2),
  })
  .strict()
  .refine(
    ({ systems }) => new Set(systems.map((system) => system.teamId)).size === systems.length,
    "Particle systems must have distinct team IDs",
  );

export type MovementConfidence = z.infer<typeof MovementConfidenceSchema>;
export type ObservedPosition = z.infer<typeof ObservedPositionSchema>;
export type InterpolatedPosition = z.infer<
  typeof InterpolatedPositionSchema
>;
export type PlayerPosition = z.infer<typeof PlayerPositionSchema>;
export type PlayerMovementObservation = z.infer<
  typeof PlayerMovementObservationSchema
>;
export type PlayerTrajectory = z.infer<typeof PlayerTrajectorySchema>;
export type GameSequenceMetadata = z.infer<
  typeof GameSequenceMetadataSchema
>;
export type MovementTeam = z.infer<typeof MovementTeamSchema>;
export type MovementSequence = z.infer<typeof MovementSequenceSchema>;
export type GenerativeRenderingConfig = z.infer<
  typeof GenerativeRenderingConfigSchema
>;
export type ParticleSystemConfig = z.infer<typeof ParticleSystemConfigSchema>;
export type DuelingPixelsConfig = z.infer<typeof DuelingPixelsConfigSchema>;

export const SourceReferenceSchema = z.object({
  endpoint: z.string().url(),
  rawFile: z.string().min(1),
  pointer: z.string().startsWith("/"),
  recordId: z.number().int(),
}).strict();

export const PlayerReconstructionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("observed"),
    position: ObservedPositionSchema,
    anchors: z.array(SourceReferenceSchema).min(1),
  }).strict(),
  z.object({
    kind: z.literal("inferred"),
    position: InterpolatedPositionSchema,
    anchors: z.array(SourceReferenceSchema).min(2),
  }).strict(),
  z.object({
    kind: z.literal("unknown"),
    reason: z.string().min(1),
  }).strict(),
]);

export const RecordedEventSchema = z.object({
  eventId: z.number().int(),
  type: z.string().min(1),
  period: z.number().int().positive(),
  timeInPeriod: z.string(),
  timestampMs: z.number().int().nonnegative(),
  gameTimestampMs: z.number().int().nonnegative(),
  teamId: z.string().nullable(),
  participants: z.array(z.object({ role: z.string(), playerId: z.number().int() }).strict()),
  location: z.discriminatedUnion("kind", [
    PositionCoordinatesSchema.extend({ kind: z.literal("recorded-event") }).strict(),
    z.object({ kind: z.literal("unknown"), reason: z.string() }).strict(),
  ]),
  homeDefendingSide: z.enum(["left", "right"]),
  source: SourceReferenceSchema,
}).strict();

export const RealGamePassageSchema = z.object({
  gameId: z.number().int(),
  gameDate: z.string(),
  venue: z.string(),
  period: z.number().int().positive(),
  startGameMs: z.number().int().nonnegative(),
  homeTeamId: z.string(),
  homeDefendingSide: z.enum(["left", "right"]),
  movement: MovementSequenceSchema,
  events: z.array(RecordedEventSchema),
  shifts: z.array(z.object({
    shiftId: z.number().int(),
    playerId: z.number().int(),
    teamId: z.string(),
    startGameMs: z.number().int().nonnegative(),
    endGameMs: z.number().int().nonnegative(),
    source: SourceReferenceSchema,
  }).strict().refine((shift) => shift.startGameMs < shift.endGameMs, "Shift end must follow start")),
  players: z.array(z.object({
    playerId: z.number().int(),
    teamId: z.string(),
    name: z.string(),
    positionCode: z.string(),
    reconstruction: PlayerReconstructionSchema,
  }).strict()),
  quality: z.array(z.string()),
}).strict();

export type SourceReference = z.infer<typeof SourceReferenceSchema>;
export type PlayerReconstruction = z.infer<typeof PlayerReconstructionSchema>;
export type RecordedEvent = z.infer<typeof RecordedEventSchema>;
export type RealGamePassage = z.infer<typeof RealGamePassageSchema>;

export const TrackingSourceRecordSchema = z.object({
  line: z.number().int().min(2),
  imageId: z.string().min(1),
  frame: z.number().int().nonnegative(),
  clock: z.string().nullable(),
  team: z.enum(["Home", "Away"]),
  trackingId: z.string(),
  jersey: z.string().nullable(),
  xFeet: z.string(),
  yFeet: z.string(),
  zFeet: z.string(),
  status: z.enum(["valid", "missing", "invalid"]),
  reason: z.string().optional(),
  trackletId: z.string().optional(),
}).strict();

export const TrackingPassageSchema = z.object({
  source: z.object({
    file: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    bytes: z.number().int().positive(),
    game: z.literal("2025-10-11 Team A @ Team D"),
    period: z.literal(1),
    startFrame: z.number().int().nonnegative(),
    endFrame: z.number().int().nonnegative(),
    nominalFps: z.number().min(1).max(120),
  }).strict(),
  movement: MovementSequenceSchema,
  records: z.array(TrackingSourceRecordSchema),
  tracklets: z.array(z.object({
    id: z.string().min(1), team: z.enum(["Home", "Away"]),
    trackingId: z.string().min(1), jersey: z.string().nullable(),
    firstFrame: z.number().int(), lastFrame: z.number().int(), samples: z.number().int().positive(),
    startReason: z.enum(["first-observation", "missing-or-invalid", "frame-gap", "jersey-change"]),
  }).strict()),
  quality: z.object({
    sourceRows: z.number().int().nonnegative(),
    playerRows: z.number().int().nonnegative(),
    skippedPuckRows: z.number().int().nonnegative(),
    valid: z.number().int().nonnegative(),
    missing: z.number().int().nonnegative(),
    invalid: z.number().int().nonnegative(),
    absentFrames: z.number().int().nonnegative(),
    absentIdentitySlots: z.number().int().nonnegative(),
    breaks: z.number().int().nonnegative(),
  }).strict(),
}).strict();

export type TrackingSourceRecord = z.infer<typeof TrackingSourceRecordSchema>;
export type TrackingPassage = z.infer<typeof TrackingPassageSchema>;
