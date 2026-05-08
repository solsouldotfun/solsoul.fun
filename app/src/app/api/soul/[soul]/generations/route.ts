import { generationRowsRouteResponse } from "@/lib/generationProvenanceRoute";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { soul: string } },
) {
  return generationRowsRouteResponse(request, { soul: params.soul });
}
