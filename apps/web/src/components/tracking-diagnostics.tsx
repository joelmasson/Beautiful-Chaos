"use client";

import { useMemo } from "react";
import type { TrackingPassage, TrackingSourceRecord } from "@beautiful-chaos/contracts";

export function TrackingDiagnostics({ passage, frameIndex, rendered }: {
  passage: TrackingPassage; frameIndex: number; rendered: number;
}) {
  const byFrame = useMemo(() => {
    const map = new Map<number, TrackingSourceRecord[]>();
    for (const record of passage.records) {
      const rows = map.get(record.frame) ?? [];
      rows.push(record); map.set(record.frame, rows);
    }
    return map;
  }, [passage]);
  const frame = passage.source.startFrame + frameIndex;
  const rows = byFrame.get(frame) ?? [];
  const omitted = rows.filter((r) => r.status !== "valid");
  return <aside className="source-diagnostics" aria-label="Tracking source diagnostics">
    <p>{passage.source.file} / {passage.source.game} / P{passage.source.period} /
      source frames {passage.source.startFrame}-{passage.source.endFrame}; current {frame}.
      Clock: {rows[0]?.clock ?? "unknown"}.</p>
    <p>Nominal {passage.source.nominalFps} fps, not verified wall-clock time.
      Six seconds = {6 * passage.source.nominalFps} nominal frame intervals.
      Observed source XY only; x/100, y/42.5 is a derived coordinate transform, not a new measurement.
      Provider confidence unknown; engine score 1 is unit artistic weight, not measured certainty.</p>
    <p>{rendered} observed positions rendered at this source frame; {omitted.length} omitted
      because XY or identity is missing/invalid. Absent IDs receive no position.</p>
    <p>Passage: {passage.quality.sourceRows} source rows; {passage.quality.playerRows} player rows;
      {" "}{passage.quality.valid} valid, {passage.quality.missing} missing XY, {passage.quality.invalid} invalid;
      {" "}{passage.tracklets.length} tracklets, {passage.quality.breaks} within-identity breaks;
      {" "}{passage.quality.absentFrames} source frames absent;
      {" "}{passage.quality.absentIdentitySlots} absent identity slots inside first/last appearance.
      {" "}{passage.quality.skippedPuckRows} puck rows excluded from player artwork.</p>
    <p>Tracklets are not complete player paths. No jersey-based stitching, held positions, gap interpolation,
      or source anomaly smoothing. Data: Stathletes / Big Data Cup 2026; local non-commercial experiment.
      Redistribution and wider exhibition rights are not established.</p>
    <p>Source SHA256: {passage.source.sha256}</p>
    <ul>{rows.map((r) => <li key={r.line}>
      {r.team} / tracking ID {r.trackingId || "unknown"} / jersey {r.jersey ?? "unknown"} /
      source line {r.line}, frame {r.frame}, {r.imageId} /
      original feet ({r.xFeet || "missing"}, {r.yFeet || "missing"}, {r.zFeet || "missing"}) /
      {r.status} {r.reason ?? ""} / tracklet {r.trackletId ?? "none"}
    </li>)}</ul>
  </aside>;
}
