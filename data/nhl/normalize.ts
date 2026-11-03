import { z } from "zod";
import {
  RealGamePassageSchema,
  type RealGamePassage,
  type SourceReference,
} from "@beautiful-chaos/contracts";

const clockSchema = z.string().regex(/^\d{2}:[0-5]\d$/);
const sideSchema = z.enum(["left", "right"]);
const teamSchema = z.object({ id: z.number().int(), abbrev: z.string(), score: z.number().int() });
const detailsSchema = z.object({
  xCoord: z.number().min(-100).max(100).optional(),
  yCoord: z.number().min(-42.5).max(42.5).optional(),
  eventOwnerTeamId: z.number().int().optional(),
}).catchall(z.unknown());
export const NhlPlayByPlaySchema = z.object({
  id: z.number().int(),
  gameDate: z.string(),
  venue: z.object({ default: z.string() }),
  gameState: z.string(),
  awayTeam: teamSchema,
  homeTeam: teamSchema,
  plays: z.array(z.object({
    eventId: z.number().int(),
    typeDescKey: z.string(),
    periodDescriptor: z.object({
      number: z.number().int().min(1).max(3),
      periodType: z.literal("REG"),
    }),
    timeInPeriod: clockSchema,
    timeRemaining: clockSchema,
    sortOrder: z.number().int(),
    homeTeamDefendingSide: sideSchema,
    details: detailsSchema.optional(),
  })),
  rosterSpots: z.array(z.object({
    playerId: z.number().int(),
    teamId: z.number().int(),
    firstName: z.object({ default: z.string() }),
    lastName: z.object({ default: z.string() }),
    positionCode: z.string(),
  })),
});

export const NhlShiftsSchema = z.object({
  total: z.number().int().nonnegative(),
  data: z.array(z.object({
    id: z.number().int(),
    gameId: z.number().int(),
    playerId: z.number().int(),
    teamId: z.number().int(),
    period: z.number().int().min(1).max(3),
    startTime: clockSchema,
    endTime: clockSchema,
    duration: clockSchema,
    typeCode: z.literal(517),
  })),
}).superRefine((value, context) => {
  if (value.total !== value.data.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["total"],
      message: "Incomplete shift response: total does not match returned rows" });
  }
});

export const nhlEndpoints = {
  events: "https://api-web.nhle.com/v1/gamecenter/2026020224/play-by-play",
  shifts: "https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId=2026020224",
};

export function clockMs(clock: string): number {
  const parsed = clockSchema.parse(clock);
  const [minutes, seconds] = parsed.split(":").map(Number);
  return (minutes * 60 + seconds) * 1000;
}

export function gameTimeMs(period: number, clock: string): number {
  if (!Number.isInteger(period) || period < 1 || period > 3) {
    throw new Error("This POC supports regulation periods 1-3 only");
  }
  const time = clockMs(clock);
  if (time > 1200000) throw new Error("Clock exceeds a 20-minute regulation period");
  return (period - 1) * 1200000 + time;
}

export function normalizeEventLocation(x: number | undefined, y: number | undefined) {
  if (x === undefined || y === undefined) {
    return { kind: "unknown" as const, reason: "Source event has no complete rink coordinate pair" };
  }
  const location = z.object({
    x: z.number().min(-100).max(100),
    y: z.number().min(-42.5).max(42.5),
  }).parse({ x, y });
  return { kind: "recorded-event" as const, x: location.x / 100, y: location.y / 42.5 };
}

function reference(kind: "events" | "shifts", index: number, id: number): SourceReference {
  return {
    endpoint: nhlEndpoints[kind],
    rawFile: `data/nhl/2026020224/${kind === "events" ? "play-by-play" : "shifts"}.json`,
    pointer: `/${kind === "events" ? "plays" : "data"}/${index}`,
    recordId: id,
  };
}

export function normalizeRealGame(rawEvents: unknown, rawShifts: unknown): RealGamePassage {
  const game = NhlPlayByPlaySchema.parse(rawEvents);
  const shifts = NhlShiftsSchema.parse(rawShifts);
  if (game.id !== 2026020224 || game.gameDate !== "2026-10-31" ||
    game.awayTeam.id !== 10 || game.homeTeam.id !== 23 ||
    game.awayTeam.score !== 4 || game.homeTeam.score !== 2 ||
    game.venue.default !== "Rogers Arena" || game.gameState !== "OFF") {
    throw new Error("Source game does not match the verified Toronto/Vancouver candidate");
  }
  const quality: string[] = [];
  const sides = new Map<number, string>();
  const eventIds = new Set<number>();
  const ordered = game.plays.map((event, index) => {
    const period = event.periodDescriptor.number;
    const timestamp = gameTimeMs(period, event.timeInPeriod);
    if (clockMs(event.timeInPeriod) + clockMs(event.timeRemaining) !== 1200000) {
      throw new Error(`Event ${event.eventId}: elapsed and remaining clocks disagree`);
    }
    if (eventIds.has(event.eventId)) throw new Error(`Duplicate event ID ${event.eventId}`);
    eventIds.add(event.eventId);
    if (sides.has(period) && sides.get(period) !== event.homeTeamDefendingSide) {
      throw new Error(`Inconsistent home defending side in period ${period}`);
    }
    sides.set(period, event.homeTeamDefendingSide);
    const owner = event.details?.eventOwnerTeamId;
    if (owner !== undefined && owner !== 10 && owner !== 23) {
      throw new Error(`Event ${event.eventId}: unknown owner team ${owner}`);
    }
    return { event, index, timestamp };
  }).sort((a, b) => a.timestamp - b.timestamp || a.event.sortOrder - b.event.sortOrder);
  if (sides.size !== 3 || sides.get(1) !== sides.get(3) || sides.get(1) === sides.get(2)) {
    throw new Error("Regulation attacking orientation does not alternate between periods");
  }
  const startGameMs = gameTimeMs(1, "02:13");
  const endGameMs = startGameMs + 45000;
  const roster = new Map(game.rosterSpots.map((player) => [player.playerId, player]));
  const shiftIds = new Set<number>();
  const previous = new Map<string, { end: number; id: number }>();
  const normalizedShifts = shifts.data.map((shift, index) => {
    if (shift.gameId !== game.id) throw new Error(`Shift ${shift.id}: wrong game ID`);
    if (shiftIds.has(shift.id)) throw new Error(`Duplicate shift ID ${shift.id}`);
    shiftIds.add(shift.id);
    if (roster.get(shift.playerId)?.teamId !== shift.teamId) {
      throw new Error(`Shift ${shift.id}: missing or mismatched roster identity`);
    }
    const start = gameTimeMs(shift.period, shift.startTime);
    const end = gameTimeMs(shift.period, shift.endTime);
    if (end <= start || end - start !== clockMs(shift.duration)) {
      throw new Error(`Shift ${shift.id}: invalid start/end/duration`);
    }
    return { shiftId: shift.id, playerId: shift.playerId, teamId: String(shift.teamId),
      startGameMs: start, endGameMs: end, source: reference("shifts", index, shift.id) };
  }).sort((a, b) => a.startGameMs - b.startGameMs || a.shiftId - b.shiftId);
  for (const shift of normalizedShifts) {
    const key = `${shift.playerId}/${Math.floor(shift.startGameMs / 1200000)}`;
    const prior = previous.get(key);
    if (prior && shift.startGameMs < prior.end) {
      quality.push(`Overlapping shift rows ${prior.id}/${shift.shiftId} for player ${shift.playerId}; active IDs are deduplicated, raw rows preserved.`);
    }
    previous.set(key, { end: Math.max(prior?.end ?? 0, shift.endGameMs), id: shift.shiftId });
  }
  const passageShifts = normalizedShifts.filter((shift) =>
    shift.startGameMs < endGameMs && shift.endGameMs > startGameMs);
  const represented = new Set(passageShifts.map((shift) => shift.playerId));
  const events = ordered.filter((entry) => entry.timestamp >= startGameMs && entry.timestamp <= endGameMs)
    .map(({ event, index, timestamp }) => ({
      eventId: event.eventId, type: event.typeDescKey, period: event.periodDescriptor.number,
      timeInPeriod: event.timeInPeriod, timestampMs: timestamp - startGameMs, gameTimestampMs: timestamp,
      teamId: event.details?.eventOwnerTeamId === undefined ? null : String(event.details.eventOwnerTeamId),
      participants: Object.entries(event.details ?? {}).flatMap(([role, playerId]) =>
        role.endsWith("PlayerId") || role === "playerId" || role === "goalieInNetId"
          ? [{ role, playerId: z.number().int().parse(playerId) }] : []),
      location: normalizeEventLocation(event.details?.xCoord, event.details?.yCoord),
      homeDefendingSide: event.homeTeamDefendingSide,
      source: reference("events", index, event.eventId),
    }));
  if (events.filter((event) => event.location.kind === "recorded-event").length === 0 ||
    passageShifts.length === 0) throw new Error("Selected passage has no usable events or shift coverage");
  const players = game.rosterSpots.filter((player) => represented.has(player.playerId)).map((player) => ({
    playerId: player.playerId, teamId: String(player.teamId),
    name: `${player.firstName.default} ${player.lastName.default}`, positionCode: player.positionCode,
    reconstruction: { kind: "unknown" as const,
      reason: "Shift participation and event locations provide no independent player-position anchors" },
  }));
  return RealGamePassageSchema.parse({
    gameId: game.id, gameDate: game.gameDate, venue: game.venue.default,
    period: 1, startGameMs, homeTeamId: String(game.homeTeam.id), homeDefendingSide: sides.get(1),
    movement: {
      metadata: { schemaVersion: 1, sequenceId: `nhl-${game.id}-p1-0213-0258`,
        label: "NHL TOR / VAN · P1 02:13–02:58 · recorded events, unknown player positions",
        durationMs: 45000, frameRate: 30, coordinateSystem: "rink-centered-normalized",
        rinkDimensionsMeters: { length: 60.96, width: 25.908 } },
      observationIntervalMs: 100,
      teams: [game.awayTeam, game.homeTeam].map((team, index) => ({
        teamId: String(team.id), label: team.abbrev, color: index === 0 ? "#136cff" : "#ff7224",
        trajectories: players.filter((player) => player.teamId === String(team.id))
          .map((player) => ({ trackingId: `nhl-${player.playerId}`, observations: [] })),
      })),
    },
    events, shifts: passageShifts, players, quality,
  });
}

export function activePlayersAt(passage: RealGamePassage, timestampMs: number) {
  if (!Number.isFinite(timestampMs) || timestampMs < 0 || timestampMs > passage.movement.metadata.durationMs) {
    throw new Error("Passage time must be finite and within its duration");
  }
  const time = passage.startGameMs + timestampMs;
  const active = new Set(passage.shifts.filter((shift) =>
    shift.startGameMs <= time && time < shift.endGameMs).map((shift) => shift.playerId));
  return passage.players.filter((player) => active.has(player.playerId));
}
