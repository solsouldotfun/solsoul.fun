import { generationRowsRouteResponse } from "@/lib/generationProvenanceRoute";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { mint: string } },
) {
  return generationRowsRouteResponse(request, { mint: params.mint });
}
