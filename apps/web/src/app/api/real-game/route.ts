import plays from "../../../../../../data/nhl/2026020224/play-by-play.json";
import shifts from "../../../../../../data/nhl/2026020224/shifts.json";
import { normalizeRealGame } from "../../../../../../data/nhl/normalize";

export const dynamic = "force-static";

export function GET() {
  return Response.json(normalizeRealGame(plays, shifts));
}
