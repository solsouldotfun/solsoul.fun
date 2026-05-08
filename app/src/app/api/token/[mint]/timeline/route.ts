import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getRpcEndpoint, isLoopbackRpcEndpoint } from "@/lib/config";
import { createRpcConnection, redactedEndpointLabel } from "@/lib/rpc";
import { publicApiErrorMessage } from "@/lib/publicApiErrors";
import type { TokenTimelineSnapshot } from "@/lib/tokenTimeline";
import { loadTokenTimelineSnapshot } from "@/lib/tokenTimelineFetch";
import {
  UNSUPPORTED_SOLSOUL_MINT_MESSAGE,
  deriveSolSoulTokenPdas,
  isUnsupportedSolSoulMintError,
} from "@/lib/tokenPdaValidation";
import { TOKEN_TIMELINE_ROUTE_TIMEOUT_MS } from "./routeConfig";

export const dynamic = "force-dynamic";

const LOCAL_TIMELINE_POLLING_FLAG = "1";

export async function GET(
  _request: Request,
  { params }: { params: { mint: string } },
) {
  let mint: PublicKey;
  try {
    mint = new PublicKey(params.mint);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid token mint." },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    deriveSolSoulTokenPdas(mint);
  } catch (error: unknown) {
    if (isUnsupportedSolSoulMintError(error)) {
      return NextResponse.json(
        { ok: false, error: UNSUPPORTED_SOLSOUL_MINT_MESSAGE },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }
    throw error;
  }

  try {
    const configuredRpcEndpoint = getRpcEndpoint();
    const rpcEndpoint = redactedEndpointLabel(configuredRpcEndpoint);
    if (
      isLoopbackRpcEndpoint(configuredRpcEndpoint) &&
      process.env.NEXT_PUBLIC_ENABLE_LOCAL_TIMELINE_POLLING !== LOCAL_TIMELINE_POLLING_FLAG
    ) {
      return NextResponse.json(
        {
          ok: true,
          ...buildLocalTimelineSnapshot({
            mint,
            rpcEndpoint,
          }),
        },
        {
          headers: {
            "cache-control": "no-store",
          },
        },
      );
    }

    const connection = createRpcConnection({ commitment: "confirmed" });
    const snapshot = await withRouteTimeout(
      loadTokenTimelineSnapshot({
        connection,
        mint,
        rpcEndpoint,
      }),
      TOKEN_TIMELINE_ROUTE_TIMEOUT_MS,
    );

    return NextResponse.json(
      { ok: true, ...snapshot },
      {
        headers: {
          "cache-control": "public, max-age=15, stale-while-revalidate=45",
        },
      },
    );
  } catch (error: unknown) {
    if (isUnsupportedSolSoulMintError(error)) {
      return NextResponse.json(
        { ok: false, error: UNSUPPORTED_SOLSOUL_MINT_MESSAGE },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }
    const isTimeout = error instanceof Error && /timed out/.test(error.message);
    const status = isTimeout ? 504 : 502;
    const errorMessage = isTimeout
      ? publicApiErrorMessage("Token timeline request timed out.")
      : publicApiErrorMessage("Unable to load token timeline.");
    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status, headers: { "cache-control": "no-store" } },
    );
  }
}

function buildLocalTimelineSnapshot({
  mint,
  rpcEndpoint,
}: {
  mint: PublicKey;
  rpcEndpoint: string;
}): TokenTimelineSnapshot {
  return {
    tokenMint: mint.toBase58(),
    events: [],
    source: {
      fetchedAt: new Date().toISOString(),
      rpcEndpoint,
    },
    partial: true,
    warnings: [
      {
        source: "local-visual-validation",
        reason: "Using deterministic empty timeline while local timeline polling is disabled.",
      },
    ],
  };
}

function withRouteTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`token timeline timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}
