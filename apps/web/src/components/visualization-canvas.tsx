"use client";

import { useEffect, useRef, useState } from "react";
import type { GameSequenceMetadata } from "@beautiful-chaos/contracts";
import type { ParticleFrame } from "@beautiful-chaos/generative-engine";
import type { MovementFrame } from "@/lib/playback";
import { drawMovementFrame } from "@/lib/rink-renderer";
import { drawParticleFrame } from "@/lib/particle-renderer";

type VisualizationCanvasProps =
  | { state: "loading" | "empty" }
  | { state: "error"; message: string }
  | {
      state: "ready";
      frame: MovementFrame;
      dimensions: GameSequenceMetadata["rinkDimensionsMeters"];
      showTrackingIds: boolean;
      particleFrame?: ParticleFrame;
      sourceLabel?: string;
      overlay?: { players: boolean; rink: boolean };
    };

export function VisualizationCanvas(props: VisualizationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0, pixelRatio: 1 });
  const [renderError, setRenderError] = useState<string | null>(null);
  const frame = props.state === "ready" ? props.frame : null;
  const dimensions = props.state === "ready" ? props.dimensions : null;
  const particleFrame = props.state === "ready" ? props.particleFrame : undefined;
  const showTrackingIds = props.state === "ready" && props.showTrackingIds;
  const overlayPlayers = props.state === "ready" && props.overlay?.players;
  const overlayRink = props.state === "ready" && props.overlay?.rink;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      setSize({
        width: bounds.width,
        height: bounds.height,
        pixelRatio: window.devicePixelRatio || 1,
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener("resize", resize);
    resize();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.width || !size.height) return;
    const context = canvas.getContext("2d");
    if (!context) {
      setRenderError("A 2D Canvas context is unavailable in this browser.");
      return;
    }
    const width = Math.round(size.width * size.pixelRatio);
    const height = Math.round(size.height * size.pixelRatio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.setTransform(size.pixelRatio, 0, 0, size.pixelRatio, 0, 0);
    if (frame && dimensions) {
      if (particleFrame) {
        drawParticleFrame(context, size.width, size.height, dimensions, particleFrame);
        if (overlayPlayers || overlayRink) drawMovementFrame(context, size.width, size.height,
          dimensions, frame, showTrackingIds, { overlay: true, showRink: !!overlayRink, showPlayers: !!overlayPlayers });
      } else {
        drawMovementFrame(context, size.width, size.height, dimensions, frame, showTrackingIds);
      }
    } else {
      context.clearRect(0, 0, size.width, size.height);
    }
  }, [frame, dimensions, particleFrame, showTrackingIds, overlayPlayers, overlayRink, size]);

  const errorMessage = props.state === "error" ? props.message : renderError;

  return (
    <div className="visualization" data-state={errorMessage ? "error" : props.state}>
      <canvas
        ref={canvasRef}
        className="visualization__canvas"
        aria-label={props.state === "ready"
          ? particleFrame
            ? props.sourceLabel
              ? `${props.sourceLabel}: ${particleFrame.particles.length} artistic pixels; ${particleFrame.traces.length} player tracer segments`
              : `Dueling Pixels artwork: ${particleFrame.particles.length} particles from synthetic movement; ${particleFrame.traces.length} historical tracer segments`
            : `Synthetic rink movement: ${props.frame.players.length} skaters visible`
          : "Movement visualization canvas"}
        role="img"
      />
      {(props.state !== "ready" || errorMessage) && (
        <div
          className="visualization__message"
          role={errorMessage ? "alert" : "status"}
          aria-live="polite"
        >
          {errorMessage ? (
            <p className="visualization__error">{errorMessage}</p>
          ) : props.state === "loading" ? (
            <>
              <span className="visualization__indicator" aria-hidden="true" />
              <p>Preparing the movement study…</p>
            </>
          ) : (
            <p>No movement observations in this sequence.</p>
          )}
        </div>
      )}
    </div>
  );
}
