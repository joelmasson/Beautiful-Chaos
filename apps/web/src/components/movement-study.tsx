"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import type { MovementSequence, RealGamePassage, TrackingPassage } from "@beautiful-chaos/contracts";
import { createDefaultParticleConfig, createParticleEngine, createRecordedEventEngine } from "@beautiful-chaos/generative-engine";
import { loadSyntheticSequence, loadRealGamePassage, loadTrackingPassage } from "@/lib/movement-data";
import {
  formatPlaybackTime,
  getMovementFrame,
  getTrackingFrame,
  nominalFrameIndex,
  initialPlaybackState,
  reducePlayback,
  startPlaybackClock,
  type PlaybackAction,
  type PlaybackState,
} from "@/lib/playback";
import { VisualizationCanvas } from "./visualization-canvas";
import { ParticleSettings } from "./particle-settings";
import { SourceDiagnostics } from "./source-diagnostics";
import { TrackingDiagnostics } from "./tracking-diagnostics";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; sequence: MovementSequence; passage?: RealGamePassage; tracking?: TrackingPassage };

export function MovementStudy() {
  const [source, setSource] = useState("synthetic");
  return (
    <>
      <label className="source-selector">
        Data source
        <select aria-label="Data source" value={source} onChange={(event) => setSource(event.target.value)}>
          <option value="synthetic">Synthetic / canonical movement</option>
          <option value="nhl">NHL TOR / VAN / recorded events</option>
          <option value="bdc">Big Data Cup / real movement (local)</option>
        </select>
      </label>
      <SourceStudy key={source} source={source} />
    </>
  );
}

function SourceStudy({ source }: { source: string }) {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoadState({ status: "loading" });
    const load = async (): Promise<Extract<LoadState, { status: "loaded" }>> => {
      if (source === "bdc") {
        const tracking = await loadTrackingPassage(controller.signal);
        return { status: "loaded", sequence: tracking.movement, tracking };
      }
      if (source === "nhl") {
        const passage = await loadRealGamePassage(controller.signal);
        return { status: "loaded", sequence: passage.movement, passage };
      }
      return { status: "loaded", sequence: await loadSyntheticSequence(controller.signal) };
    };
    load().then(
      (loaded) => {
        if (!controller.signal.aborted) setLoadState(loaded);
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadState({
          status: "error",
          message: error instanceof Error ? error.message : "Unable to load movement data.",
        });
      },
    );
    return () => controller.abort();
  }, [loadAttempt, source]);

  if (loadState.status === "loaded") {
    const hasObservations = loadState.sequence.teams.some((team) =>
      team.trajectories.some((trajectory) => trajectory.observations.length > 0),
    );
    if (hasObservations && loadState.sequence.teams.length !== 2) {
      return <VisualizationCanvas state="error" message="Dueling Pixels requires a sequence with two teams." />;
    }
    if (hasObservations || loadState.passage) return <SequencePlayer sequence={loadState.sequence}
      passage={loadState.passage} tracking={loadState.tracking} />;
    return <VisualizationCanvas state="empty" />;
  }

  return (
    <div className="movement-study">
      {loadState.status === "error" ? (
        <>
          <VisualizationCanvas state="error" message={loadState.message} />
          <button className="sample-retry" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
            Reload selected source
          </button>
        </>
      ) : (
        <VisualizationCanvas state="loading" />
      )}
    </div>
  );
}

function SequencePlayer({ sequence, passage, tracking }: {
  sequence: MovementSequence; passage?: RealGamePassage; tracking?: TrackingPassage;
}) {
  const [revision, setRevision] = useState(0);
  return (
    <SequencePlayback
      key={revision}
      sequence={sequence}
      passage={passage}
      tracking={tracking}
      onReset={() => setRevision((value) => value + 1)}
    />
  );
}

function SequencePlayback({ sequence, passage, tracking, onReset }: {
  sequence: MovementSequence; passage?: RealGamePassage; tracking?: TrackingPassage; onReset: () => void;
}) {
  const durationMs = sequence.metadata.durationMs;
  const [playback, dispatch] = useReducer(
    (state: PlaybackState, action: PlaybackAction) => reducePlayback(state, action, durationMs),
    initialPlaybackState,
  );
  const [showTrackingIds, setShowTrackingIds] = useState(true);
  const [showPlayers, setShowPlayers] = useState(false);
  const [inspectTracking, setInspectTracking] = useState(false);
  const [showRink, setShowRink] = useState(false);
  const [particleConfig, setParticleConfig] = useState(() =>
    createDefaultParticleConfig(sequence.teams.map((team) => team.teamId)),
  );
  const prepared = useMemo(() => {
    try {
      return { engine: passage ? createRecordedEventEngine(passage, particleConfig) :
        createParticleEngine(sequence, particleConfig), error: null };
    } catch (error: unknown) {
      return {
        engine: null,
        error: error instanceof Error ? error.message : "Unable to prepare particle systems.",
      };
    }
  }, [sequence, passage, particleConfig]);
  const frameIndex = tracking ? nominalFrameIndex(sequence, playback.timestampMs) : 0;
  const renderTime = tracking ? frameIndex * sequence.observationIntervalMs : playback.timestampMs;
  const particleFrame = useMemo(
    () => prepared.engine?.frameAt(renderTime),
    [prepared.engine, renderTime],
  );
  const frame = useMemo(
    () => tracking ? getTrackingFrame(sequence, renderTime) : getMovementFrame(sequence, renderTime),
    [sequence, renderTime, tracking],
  );

  useEffect(() => {
    if (!playback.playing) return;
    return startPlaybackClock((elapsedMs) => dispatch({ type: "tick", elapsedMs }));
  }, [playback.playing]);

  return (
    <div className="movement-study">
      {prepared.error ? (
        <VisualizationCanvas state="error" message={prepared.error} />
      ) : (
        <VisualizationCanvas
          state="ready"
          frame={frame}
          dimensions={sequence.metadata.rinkDimensionsMeters}
          showTrackingIds={showTrackingIds}
          particleFrame={showPlayers && !passage && !tracking ? undefined : particleFrame}
          overlay={tracking ? { players: showPlayers, rink: showRink } : undefined}
          sourceLabel={tracking ? "Big Data Cup observed tracklets, nominal frame time" :
            passage ? "Recorded NHL event locations, not player tracking" : undefined}
        />
      )}
      <div className="study-note">
        <span>{sequence.metadata.label ?? "Synthetic movement study"}</span>
        <span className="team-key">
          {sequence.teams.map((team) => (
            <span key={team.teamId}>
              <i style={{ backgroundColor: showPlayers && !passage && !tracking ? team.color :
                particleConfig.systems.find((system) => system.teamId === team.teamId)?.palette[0] }} aria-hidden="true" />
              {team.label}
            </span>
          ))}
        </span>
      </div>
      <div className="playback-controls" aria-label="Movement playback controls">
        <button onClick={() => dispatch({ type: playback.playing ? "pause" : "play" })}>
          {playback.playing ? "Pause" : "Play"}
        </button>
        <button onClick={onReset}>Reset</button>
        <label className="playback-timeline">
          <span className="visually-hidden">Timeline</span>
          <input
            type="range"
            min={0}
            max={tracking ? tracking.source.endFrame - tracking.source.startFrame : durationMs}
            step={1}
            value={tracking ? frameIndex : playback.timestampMs}
            aria-valuetext={tracking ? `Source frame ${tracking.source.startFrame + frameIndex}` : formatPlaybackTime(playback.timestampMs)}
            onChange={(event) => dispatch({ type: "seek", timestampMs: Number(event.target.value) *
              (tracking ? sequence.observationIntervalMs : 1) })}
          />
        </label>
        <output className="playback-time" aria-live="off">
          {tracking ? `F${tracking.source.startFrame + frameIndex} / ${tracking.source.endFrame}` :
            `${formatPlaybackTime(playback.timestampMs)} / ${formatPlaybackTime(durationMs)}`}
        </output>
        <label className="playback-speed">
          <span className="visually-hidden">Playback speed</span>
          <select
            value={playback.speed}
            onChange={(event) => dispatch({ type: "speed", speed: Number(event.target.value) })}
          >
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
          </select>
        </label>
        <label className="tracking-toggle">
          <input
            type="checkbox"
            checked={showPlayers}
            onChange={(event) => setShowPlayers(event.target.checked)}
          />
          {passage ? "Inspect source" : "Show players"}
        </label>
        {showPlayers && !passage && <label className="tracking-toggle">
          <input
            type="checkbox"
            checked={showTrackingIds}
            onChange={(event) => setShowTrackingIds(event.target.checked)}
          />
          Track IDs
        </label>}
        {tracking && <>
          <label className="tracking-toggle"><input type="checkbox" checked={showRink}
            onChange={(event) => setShowRink(event.target.checked)} />Show rink</label>
          <label className="tracking-toggle"><input type="checkbox" checked={inspectTracking}
            onChange={(event) => setInspectTracking(event.target.checked)} />Inspect source</label>
        </>}
      </div>
      <p className="observation-note" role="status">
        {tracking
          ? `Real observed tracklets / nominal ${tracking.source.nominalFps} fps, not verified wall-clock time. No gap interpolation. Local experimental data: Stathletes / Big Data Cup 2026.`
          : passage
          ? "Recorded event artwork / player positions unknown. No inferred paths or connections between events."
          : frame.missingTrackingIds.length > 0
          ? `Temporarily unavailable: ${frame.missingTrackingIds.join(", ")}. Emission pauses; existing pixels fade.`
          : showPlayers
            ? "Synthetic data. Filled dots are observed; hollow dots interpolate adjacent valid observations."
            : "Dueling Pixels / independent movement traces. No collisions or event effects."}
      </p>
      {passage && showPlayers && <SourceDiagnostics passage={passage} timestampMs={playback.timestampMs} />}
      {tracking && inspectTracking && <TrackingDiagnostics passage={tracking} frameIndex={frameIndex} rendered={frame.players.length} />}
      {passage && <p className="observation-note">
        Studio settings: palette, seed, density, size, opacity, intensity and persistence affect event marks.
        Lifespan, movement response, wander and tracer width require supported player paths and are unused here.
      </p>}
      <ParticleSettings config={particleConfig} teams={sequence.teams} onChange={setParticleConfig} />
    </div>
  );
}
