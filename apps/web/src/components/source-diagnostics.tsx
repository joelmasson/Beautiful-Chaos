"use client";

import type { RealGamePassage } from "@beautiful-chaos/contracts";

export function SourceDiagnostics({ passage, timestampMs }: {
  passage: RealGamePassage;
  timestampMs: number;
}) {
  const time = passage.startGameMs + timestampMs;
  const active = new Set(passage.shifts.filter((shift) =>
    shift.startGameMs <= time && time < shift.endGameMs).map((shift) => shift.playerId));
  const recent = passage.events.filter((event) =>
    event.timestampMs <= timestampMs && event.timestampMs >= timestampMs - 6000);
  return (
    <aside className="source-diagnostics" aria-label="Source diagnostics">
      <p>Recorded event locations only. 0 observed player positions; 0 inferred.
        All {passage.players.length} represented players have unknown positions.
        No player movement is reconstructed.</p>
      <p>Period {passage.period}; home defends {passage.homeDefendingSide}.
        Fixed rink axes, no attacking-direction flip. Shift intervals are start-inclusive/end-exclusive.</p>
      <p>Active by shift ({active.size}): {passage.players.filter((player) => active.has(player.playerId))
        .map((player) => `${player.name} [${player.playerId}, team ${player.teamId}, ${player.positionCode}]: ${player.reconstruction.kind}`)
        .join("; ")}</p>
      <ul>
        {recent.map((event) => (
          <li key={event.eventId}>
            #{event.eventId} / {event.timeInPeriod} / {event.type} / team {event.teamId ?? "unknown"} /
            {event.location.kind === "recorded-event"
              ? ` event location (${event.location.x.toFixed(3)}, ${event.location.y.toFixed(3)})`
              : " location unknown"} /
            {event.participants.map((player) => `${player.role}: ${player.playerId}`).join(", ")} /
            {event.source.rawFile}{event.source.pointer}
          </li>
        ))}
      </ul>
      {passage.quality.map((message) => <p key={message}>{message}</p>)}
    </aside>
  );
}
