import { readFile, stat } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import { canonicalTrackingOptions, normalizeTracking } from "../../../../data/big-data-cup/normalize";

export async function readLocalTracking(env: NodeJS.ProcessEnv = process.env) {
  const file = env.BDC_SOURCE_FILE;
  if (!file) throw new Error("Big Data Cup is local-only. Set BDC_SOURCE_FILE to an absolute path to the 2025-10-11 Team A @ Team D Tracking_P1.csv file, then restart the server. No synthetic fallback is used.");
  if (!isAbsolute(file)) throw new Error("BDC_SOURCE_FILE must be an absolute local file path.");
  const options = {
    startFrame: env.BDC_START_FRAME === undefined ? canonicalTrackingOptions.startFrame : Number(env.BDC_START_FRAME),
    frameCount: env.BDC_FRAME_COUNT === undefined ? canonicalTrackingOptions.frameCount : Number(env.BDC_FRAME_COUNT),
    nominalFps: env.BDC_NOMINAL_FPS === undefined ? canonicalTrackingOptions.nominalFps : Number(env.BDC_NOMINAL_FPS),
  };
  const info = await stat(file);
  if (!info.isFile() || info.size > 40 * 1024 * 1024) throw new Error("BDC_SOURCE_FILE must be one tracking CSV file, at most 40 MiB.");
  const text = await readFile(file, "utf8");
  return normalizeTracking(text, basename(file), options);
}
