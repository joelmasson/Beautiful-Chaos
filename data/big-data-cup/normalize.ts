import { createHash } from "node:crypto";
import {
  TrackingPassageSchema,
  type MovementSequence,
  type TrackingPassage,
  type TrackingSourceRecord,
} from "@beautiful-chaos/contracts";

const headers = ["Image Id", "Period", "Game Clock", "Player or Puck", "Team", "Player Id",
  "Player Jersey Number", "Rink Location X (Feet)", "Rink Location Y (Feet)",
  "Rink Location Z (Feet)", "Goal Score"];
const game = "2025-10-11 Team A @ Team D";

export type TrackingOptions = { startFrame: number; frameCount: number; nominalFps: number };
export const canonicalTrackingOptions: TrackingOptions = { startFrame: 65618, frameCount: 751, nominalFps: 30 };

// RFC-style quoted cells are accepted; a row's physical source line remains traceable.
export function parseTrackingCsv(text: string) {
  const rows: { line: number; cells: string[] }[] = [];
  let cells: string[] = [], cell = "", quoted = false, line = 1, startLine = 1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else if (quoted || cell.length === 0) quoted = !quoted;
      else throw new Error(`CSV line ${line}: unexpected quote`);
    } else if (ch === "," && !quoted) {
      cells.push(cell); cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      cells.push(cell);
      if (cells.some((value) => value !== "")) rows.push({ line: startLine, cells });
      cells = []; cell = ""; line++; startLine = line;
    } else {
      cell += ch;
      if (ch === "\n") line++;
    }
  }
  if (quoted) throw new Error(`CSV line ${startLine}: unterminated quoted field`);
  if (cell || cells.length) { cells.push(cell); rows.push({ line: startLine, cells }); }
  const header = rows.shift();
  if (!header || header.cells.map((v, i) => i === 0 ? v.replace(/^\uFEFF/, "") : v).join("|") !== headers.join("|")) {
    throw new Error("Big Data Cup CSV headers do not match the inspected eleven-column tracking schema");
  }
  for (const row of rows) {
    if (row.cells.length !== headers.length) throw new Error(`CSV line ${row.line}: expected eleven columns`);
  }
  return rows;
}

export function normalizeTrackingCoordinates(x: string, y: string) {
  if (!x.trim() || !y.trim()) return { status: "missing" as const, reason: "Source XY pair missing" };
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  if (!decimal.test(x) || !decimal.test(y) || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y)) ||
    Math.abs(Number(x)) > 100 || Math.abs(Number(y)) > 42.5) {
    return { status: "invalid" as const, reason: "Source XY is not a finite in-bounds feet coordinate pair" };
  }
  return { status: "valid" as const, x: Number(x) / 100, y: Number(y) / 42.5 };
}

export function normalizeTracking(
  text: string, file: string, options: TrackingOptions = canonicalTrackingOptions,
): TrackingPassage {
  const { startFrame, frameCount, nominalFps } = options;
  if (!Number.isSafeInteger(startFrame) || startFrame < 0 ||
    !Number.isSafeInteger(frameCount) || frameCount < 2 || frameCount > 1801 ||
    !Number.isFinite(nominalFps) || nominalFps < 1 || nominalFps > 120 ||
    (frameCount - 1) / nominalFps > 60) {
    throw new Error("Tracking passage requires a safe start frame, 2-1801 frames, 1-120 nominal fps and at most 60 nominal seconds");
  }
  const endFrame = startFrame + frameCount - 1;
  const cadence = 1000 / nominalFps;
  const records: TrackingSourceRecord[] = [];
  const selectedFrames = new Set<number>();
  const quality = { sourceRows: 0, playerRows: 0, skippedPuckRows: 0,
    valid: 0, missing: 0, invalid: 0, absentFrames: 0, absentIdentitySlots: 0, breaks: 0 };
  for (const { line, cells } of parseTrackingCsv(text)) {
    const [imageId, period, clock, kind, team, trackingId, jersey, xFeet, yFeet, zFeet] = cells;
    const match = /^(.*)_(\d+)$/.exec(imageId);
    if (!match || match[1] !== game || period !== "1") {
      throw new Error(`CSV line ${line}: this local POC requires the verified ${game}, period 1`);
    }
    const frame = Number(match[2]);
    if (!Number.isSafeInteger(frame)) throw new Error(`CSV line ${line}: invalid source frame`);
    if (frame < startFrame || frame > endFrame) continue;
    quality.sourceRows++;
    selectedFrames.add(frame);
    if (kind === "Puck") { quality.skippedPuckRows++; continue; }
    if (kind !== "Player" || (team !== "Home" && team !== "Away")) {
      throw new Error(`CSV line ${line}: unknown entity kind/team`);
    }
    const coordinate = normalizeTrackingCoordinates(xFeet, yFeet);
    const identityValid = /^\d+$/.test(trackingId);
    records.push({ line, imageId, frame, clock: clock || null, team, trackingId,
      jersey: jersey || null, xFeet, yFeet, zFeet,
      status: identityValid ? coordinate.status : "invalid",
      ...(!identityValid ? { reason: "Missing or invalid source tracking ID" } :
        coordinate.status !== "valid" ? { reason: coordinate.reason } : {}) });
  }
  if (records.length === 0) throw new Error("Selected source-frame passage has no player rows; check BDC_START_FRAME and BDC_FRAME_COUNT");
  const identities = new Map<string, TrackingSourceRecord[]>();
  for (const record of records) {
    const key = `${record.team}/${record.trackingId}`;
    const group = identities.get(key) ?? [];
    group.push(record); identities.set(key, group);
  }
  const movement: MovementSequence = {
    metadata: { schemaVersion: 1, sequenceId: `bdc-20251011-p1-${startFrame}-${endFrame}`,
      label: "Big Data Cup / Team D vs Team A / real tracklets, nominal frame time",
      durationMs: (frameCount - 1) * cadence, frameRate: nominalFps,
      timing: { kind: "nominal-source-frames", framesPerSecond: nominalFps },
      coordinateSystem: "rink-centered-normalized", rinkDimensionsMeters: { length: 60.96, width: 25.908 } },
    observationIntervalMs: cadence,
    teams: [{ teamId: "Home", label: "Team D / Home", color: "#136cff", trajectories: [] },
      { teamId: "Away", label: "Team A / Away", color: "#ff7224", trajectories: [] }],
  };
  const tracklets: TrackingPassage["tracklets"] = [];
  for (const [identity, group] of identities) {
    group.sort((a, b) => a.frame - b.frame || a.line - b.line);
    const counts = new Map<number, number>();
    for (const r of group) counts.set(r.frame, (counts.get(r.frame) ?? 0) + 1);
    let previous: TrackingSourceRecord | undefined;
    let current: TrackingPassage["tracklets"][number] | undefined;
    let hadTracklet = false;
    const team = movement.teams.find((t) => t.teamId === group[0].team);
    if (!team) throw new Error(`Unknown tracking team ${group[0].team}`);
    for (const r of group) {
      if ((counts.get(r.frame) ?? 0) > 1) {
        r.status = "invalid"; r.reason = "Simultaneous duplicate source identity; all conflicting rows omitted";
      }
      if (previous && r.frame > previous.frame + 1) quality.absentIdentitySlots += r.frame - previous.frame - 1;
      const gap = previous && r.frame !== previous.frame + 1;
      const jerseyChange = previous && r.jersey !== previous.jersey;
      if (r.status !== "valid") { current = undefined; previous = r; continue; }
      if (!current || gap || jerseyChange) {
        const startReason = !previous ? "first-observation" :
          previous.status !== "valid" ? "missing-or-invalid" : gap ? "frame-gap" : "jersey-change";
        const id = `${identity}/segment-${r.frame}`;
        current = { id, team: r.team, trackingId: r.trackingId, jersey: r.jersey,
          firstFrame: r.frame, lastFrame: r.frame, samples: 0, startReason };
        tracklets.push(current);
        team.trajectories.push({ trackingId: id, observations: [] });
        if (hadTracklet) quality.breaks++;
        hadTracklet = true;
      }
      const coordinate = normalizeTrackingCoordinates(r.xFeet, r.yFeet);
      if (coordinate.status !== "valid") throw new Error("Valid source record lost its coordinates");
      const trajectory = team.trajectories[team.trajectories.length - 1];
      trajectory.observations.push({
        sequenceId: movement.metadata.sequenceId, trackingId: current.id,
        timestampMs: (r.frame - startFrame) * cadence,
        position: { kind: "observed", x: coordinate.x, y: coordinate.y,
          confidence: { score: 1, method: "provider-unrated; unit-artistic-weight-not-measured-confidence" } },
      });
      r.trackletId = current.id;
      current.lastFrame = r.frame; current.samples++;
      previous = r;
    }
  }
  quality.playerRows = records.length;
  for (const r of records) quality[r.status]++;
  quality.absentFrames = frameCount - selectedFrames.size;
  if (quality.valid === 0 || movement.teams.some((t) => t.trajectories.length === 0)) {
    throw new Error("Selected passage needs valid observed tracklets from both teams; no fallback data was substituted");
  }
  return TrackingPassageSchema.parse({
    source: { file, sha256: createHash("sha256").update(text).digest("hex"),
      bytes: Buffer.byteLength(text), game, period: 1, startFrame, endFrame, nominalFps },
    movement, records: records.sort((a, b) => a.frame - b.frame || a.line - b.line), tracklets, quality,
  });
}
