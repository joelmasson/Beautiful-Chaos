"use client";

import { memo, useState, type FormEvent } from "react";
import {
  ParticleSystemConfigSchema,
  type DuelingPixelsConfig,
  type MovementTeam,
  type ParticleSystemConfig,
} from "@beautiful-chaos/contracts";

const fields = [
  ["lifespanMs", "Lifespan (ms)"],
  ["emissionRate", "Emission rate (particles/s at 4 m/s)"],
  ["particleSize", "Pixel size (CSS px)"],
  ["opacity", "Opacity (0–1)"],
  ["trailPersistenceMs", "Player history (ms, 0–10000)"],
  ["trailWidth", "Tracer width (CSS px, 0.5–8)"],
  ["trailIntensity", "Tracer intensity (0–2)"],
  ["movementInfluence", "Movement influence (0–2)"],
  ["visualIntensity", "Visual intensity (0–2)"],
  ["wanderMeters", "Organic motion (m)"],
  ["seed", "Random seed"],
] as const;

export const ParticleSettings = memo(function ParticleSettings({
  config,
  teams,
  onChange,
}: {
  config: DuelingPixelsConfig;
  teams: MovementTeam[];
  onChange: (config: DuelingPixelsConfig) => void;
}) {
  return (
    <details className="particle-settings">
      <summary>Studio settings</summary>
      <p>Independent visual rules. Applying settings reinterprets the current time without changing movement data.</p>
      <div className="particle-settings__systems">
        {config.systems.map((system) => (
          <SystemSettings
            key={system.teamId}
            system={system}
            label={teams.find((team) => team.teamId === system.teamId)?.label ?? system.teamId}
            onApply={(updated) => onChange({
              systems: config.systems.map((entry) => entry.teamId === updated.teamId ? updated : entry),
            })}
          />
        ))}
      </div>
    </details>
  );
});

function SystemSettings({
  system,
  label,
  onApply,
}: {
  system: ParticleSystemConfig;
  label: string;
  onApply: (system: ParticleSystemConfig) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(fields.map(([key]) => [key, Number(form.get(key))]));
    const result = ParticleSystemConfigSchema.safeParse({
      ...values,
      teamId: system.teamId,
      palette: String(form.get("palette")).split(",").map((color) => color.trim()),
    });
    if (!result.success) {
      setError(result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n"));
      return;
    }
    setError(null);
    onApply(result.data);
  };
  return (
    <form onSubmit={submit}>
      <fieldset>
        <legend>{label} / {system.teamId}</legend>
        <label>
          Palette (comma-separated hex colors)
          <input name="palette" defaultValue={system.palette.join(", ")} required />
        </label>
        <div className="particle-settings__fields">
          {fields.map(([key, title]) => (
            <label key={key}>
              {title}
              <input name={key} type="number" step="any" defaultValue={system[key]} required />
            </label>
          ))}
        </div>
        {error && <p role="alert" className="particle-settings__error">{error}</p>}
        <button type="submit">Apply {label}</button>
      </fieldset>
    </form>
  );
}
