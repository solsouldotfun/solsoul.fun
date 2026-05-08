import { generationRowsRouteResponse } from "@/lib/generationProvenanceRoute";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return generationRowsRouteResponse(request);
}
