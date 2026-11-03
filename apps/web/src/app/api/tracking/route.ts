import { readLocalTracking } from "@/lib/local-tracking";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
let cached: ReturnType<typeof readLocalTracking> | undefined;

export async function GET() {
  try {
    cached ??= readLocalTracking();
    return Response.json(await cached, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    cached = undefined;
    console.error("Big Data Cup local source unavailable:", error);
    return Response.json({
      error: error instanceof Error ? `Unable to load local Big Data Cup source: ${error.message}` :
        "Unable to load local Big Data Cup source. See server logs.",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
