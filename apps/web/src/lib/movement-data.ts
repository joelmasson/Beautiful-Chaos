import {
  MovementSequenceSchema,
  RealGamePassageSchema,
  TrackingPassageSchema,
  type MovementSequence,
} from "@beautiful-chaos/contracts";

export async function loadTrackingPassage(signal: AbortSignal) {
  const response = await fetch("/api/tracking", { signal, cache: "no-store" });
  if (!response.ok) {
    const body: unknown = await response.json();
    const message = typeof body === "object" && body !== null && "error" in body &&
      typeof body.error === "string" ? body.error : `Local source request failed (HTTP ${response.status})`;
    throw new Error(message);
  }
  const result = TrackingPassageSchema.safeParse(await response.json());
  if (!result.success) throw new Error(`Invalid local tracking passage: ${result.error.message}`);
  return result.data;
}

export function parseMovementSequence(input: unknown): MovementSequence {
  const result = MovementSequenceSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Invalid movement sequence:\n${result.error.issues
        .map((issue) => `${issue.path.join(".") || "sequence"}: ${issue.message}`)
        .join("\n")}`,
    );
  }

  return result.data;
}

export async function loadRealGamePassage(signal: AbortSignal) {
  const response = await fetch("/api/real-game", { signal });
  if (!response.ok) throw new Error(`Unable to load real-game passage (HTTP ${response.status})`);
  const result = RealGamePassageSchema.safeParse(await response.json());
  if (!result.success) {
    throw new Error(`Invalid real-game passage:\n${result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n")}`);
  }
  return result.data;
}

export async function loadSyntheticSequence(signal: AbortSignal): Promise<MovementSequence> {
  const response = await fetch("/api/sample", { signal });
  if (!response.ok) {
    throw new Error(`Unable to load synthetic sequence (HTTP ${response.status})`);
  }
  return parseMovementSequence(await response.json());
}
