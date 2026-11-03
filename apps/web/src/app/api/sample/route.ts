import sample from "../../../../../../data/samples/neutral-zone-attack.json";

export const dynamic = "force-static";

export function GET() {
  return Response.json(sample);
}
