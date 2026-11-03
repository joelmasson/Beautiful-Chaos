import type { GameSequenceMetadata } from "@beautiful-chaos/contracts";
import type { ParticleFrame, ParticlePoint } from "@beautiful-chaos/generative-engine";
import { getRinkViewport, rinkToCanvas } from "./rink-renderer";

export function drawParticleFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  dimensions: GameSequenceMetadata["rinkDimensionsMeters"],
  frame: ParticleFrame,
) {
  const viewport = getRinkViewport(width, height, dimensions);
  context.globalAlpha = 1;
  context.fillStyle = "#080b10";
  context.fillRect(0, 0, width, height);
  context.lineCap = "round";
  for (const trace of frame.traces) {
    const from = rinkToCanvas(trace.from, viewport);
    const to = rinkToCanvas(trace.to, viewport);
    const stroke = (color: string, size: number, opacity: number) => {
      context.strokeStyle = color;
      context.lineWidth = size;
      context.globalAlpha = opacity;
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
    };
    stroke(trace.color, trace.width * (3 + trace.diffusion * 5), trace.opacity * 0.12);
    stroke(trace.color, trace.width * (1 + trace.diffusion), trace.opacity * (1 - trace.diffusion * 0.5));
    stroke(trace.highlight, trace.width * 0.35, trace.opacity * (1 - trace.diffusion) * 0.85);
  }
  const drawPixel = (position: ParticlePoint, size: number) => {
    const point = rinkToCanvas(position, viewport);
    context.globalAlpha = position.opacity;
    context.fillRect(point.x - size / 2, point.y - size / 2, size, size);
  };
  for (const particle of frame.particles) {
    context.fillStyle = particle.color;
    for (const point of particle.trail) drawPixel(point, particle.size * 0.8);
    if (particle.point) drawPixel(particle.point, particle.size);
  }
  context.globalAlpha = 1;
}
