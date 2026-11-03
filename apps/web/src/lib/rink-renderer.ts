import type { GameSequenceMetadata, PlayerPosition } from "@beautiful-chaos/contracts";
import type { MovementFrame } from "./playback";

export function getRinkViewport(
  width: number,
  height: number,
  dimensions: GameSequenceMetadata["rinkDimensionsMeters"],
) {
  const padding = 32;
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const scale = Math.min(availableWidth / dimensions.length, availableHeight / dimensions.width);
  const rinkWidth = dimensions.length * scale;
  const rinkHeight = dimensions.width * scale;
  return {
    left: (width - rinkWidth) / 2,
    top: (height - rinkHeight) / 2,
    width: rinkWidth,
    height: rinkHeight,
  };
}

export function rinkToCanvas(
  position: Pick<PlayerPosition, "x" | "y">,
  viewport: ReturnType<typeof getRinkViewport>,
) {
  return {
    x: viewport.left + ((position.x + 1) / 2) * viewport.width,
    y: viewport.top + ((1 - position.y) / 2) * viewport.height,
  };
}

export function drawMovementFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  dimensions: GameSequenceMetadata["rinkDimensionsMeters"],
  frame: MovementFrame,
  showTrackingIds: boolean,
  options: { overlay?: boolean; showRink?: boolean; showPlayers?: boolean } = {},
) {
  const rink = getRinkViewport(width, height, dimensions);
  if (!options.overlay) {
    context.fillStyle = "#111210";
    context.fillRect(0, 0, width, height);
  }
  if (options.showRink !== false) {
    context.strokeStyle = "rgba(233, 231, 223, 0.22)";
    context.lineWidth = 1;
    context.strokeRect(rink.left, rink.top, rink.width, rink.height);
    context.strokeStyle = "rgba(233, 231, 223, 0.08)";
    context.beginPath();
    context.moveTo(rink.left + rink.width / 2, rink.top);
    context.lineTo(rink.left + rink.width / 2, rink.top + rink.height);
    context.stroke();
  }

  if (options.showPlayers === false) return;
  context.font = "10px SFMono-Regular, Consolas, monospace";
  context.textBaseline = "middle";
  for (const { color, observation, position } of frame.players) {
    const point = rinkToCanvas(position, rink);
    context.fillStyle = color;
    context.beginPath();
    context.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
    if (position.kind === "observed") {
      context.fill();
    } else {
      context.strokeStyle = color;
      context.stroke();
    }
    if (showTrackingIds) {
      const labelOnLeft = point.x > rink.left + rink.width - 45;
      context.textAlign = labelOnLeft ? "right" : "left";
      context.fillText(observation.trackingId, point.x + (labelOnLeft ? -9 : 9), point.y);
    }
  }
}
