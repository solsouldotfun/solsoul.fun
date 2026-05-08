export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SmokeRequest = {
  action?: unknown;
};

const RETIRED_STATUS = 410;

export async function POST(request: Request): Promise<Response> {
  let body: SmokeRequest = {};
  try {
    body = (await request.json()) as SmokeRequest;
  } catch {
    body = {};
  }

  const action = typeof body.action === "string" ? body.action : "write";
  return Response.json(
    {
      error: `Devnet smoke ${action} is retired. Use the connected wallet ${walletFlowLabel(
        action,
      )} flow; SolSoul public writes are wallet-signed only.`,
    },
    {
      status: RETIRED_STATUS,
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}

function walletFlowLabel(action: string): string {
  switch (action) {
    case "launch":
      return "launch";
    case "buy":
      return "buy";
    case "sell":
      return "sell";
    case "generate":
      return "generate Soul";
    case "claim":
      return "claim Soul";
    default:
      return "write";
  }
}
