import { describe, expect, it, vi, beforeEach } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { deriveCurvePda, deriveSoulPda } from "sdk";
import { TOKEN_TIMELINE_ROUTE_TIMEOUT_MS } from "./routeConfig";

// Mocked before importing the route so the module sees the mocks
vi.mock("@/lib/tokenTimelineFetch", () => ({
  loadTokenTimelineSnapshot: vi.fn(),
}));
vi.mock("@/lib/rpc", () => ({
  createRpcConnection: vi.fn(() => ({})),
  redactedEndpointLabel: vi.fn((endpoint: string) => endpoint),
}));
vi.mock("@/lib/config", () => ({
  getRpcEndpoint: vi.fn(() => "https://api.devnet.solana.com"),
  isLoopbackRpcEndpoint: vi.fn((endpoint: string) => endpoint.includes("127.0.0.1")),
}));

import { GET } from "./route";
import { loadTokenTimelineSnapshot } from "@/lib/tokenTimelineFetch";
import { getRpcEndpoint } from "@/lib/config";
import { createRpcConnection } from "@/lib/rpc";

function findTimelineCompatibleMint(): string {
  for (let index = 0; index < 100; index += 1) {
    const mint = PublicKey.unique();
    try {
      deriveCurvePda(mint);
      deriveSoulPda(mint);
      return mint.toBase58();
    } catch {
      // Legacy no-bump SolSoul PDAs only support selected mint seeds.
    }
  }
  throw new Error("Unable to find a mint with valid SolSoul timeline PDAs");
}

const VALID_MINT = findTimelineCompatibleMint();
const PDA_INVALID_SYSTEM_MINT = "11111111111111111111111111111111";

function makeRequest(mint: string): Request {
  return new Request(`http://localhost/api/token/${mint}/timeline`);
}

describe("/api/token/[mint]/timeline route hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the production timeout bounded below public devnet HTTP timeouts", () => {
    expect(TOKEN_TIMELINE_ROUTE_TIMEOUT_MS).toBeGreaterThanOrEqual(45_000);
  });

  it("returns 400 ok:false for an invalid mint", async () => {
    const response = await GET(makeRequest("not-a-valid-mint"), {
      params: { mint: "not-a-valid-mint" },
    });
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it("returns controlled 400 for syntactically valid mints whose SolSoul PDAs cannot be derived", async () => {
    const response = await GET(makeRequest(PDA_INVALID_SYSTEM_MINT), {
      params: { mint: PDA_INVALID_SYSTEM_MINT },
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/SolSoul launch mint/i);
    expect(body.error).not.toMatch(/Invalid seeds|fall off the curve/i);
    expect(vi.mocked(createRpcConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(loadTokenTimelineSnapshot)).not.toHaveBeenCalled();
  });

  it("returns 502 ok:false when loadTokenTimelineSnapshot rejects with a server/RPC error", async () => {
    vi.mocked(loadTokenTimelineSnapshot).mockRejectedValueOnce(
      new Error("RPC connection refused"),
    );
    const response = await GET(makeRequest(VALID_MINT), {
      params: { mint: VALID_MINT },
    });
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Unable to load token timeline.");
    expect(JSON.stringify(body)).not.toContain("RPC connection refused");
  });

  it("returns a deterministic empty timeline for local RPC browser validation", async () => {
    vi.mocked(getRpcEndpoint).mockReturnValueOnce("http://127.0.0.1:8899");

    const response = await GET(makeRequest(VALID_MINT), {
      params: { mint: VALID_MINT },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.tokenMint).toBe(VALID_MINT);
    expect(body.events).toEqual([]);
    expect(body.partial).toBe(true);
    expect(vi.mocked(createRpcConnection)).not.toHaveBeenCalled();
    expect(vi.mocked(loadTokenTimelineSnapshot)).not.toHaveBeenCalled();
  });

  it("returns 504 ok:false when loadTokenTimelineSnapshot rejects with a timeout error", async () => {
    vi.mocked(loadTokenTimelineSnapshot).mockRejectedValueOnce(
      new Error(`token timeline timed out after ${TOKEN_TIMELINE_ROUTE_TIMEOUT_MS}ms`),
    );
    const response = await GET(makeRequest(VALID_MINT), {
      params: { mint: VALID_MINT },
    });
    const body = await response.json();
    expect(response.status).toBe(504);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Token timeline request timed out.");
    expect(JSON.stringify(body)).not.toContain(String(TOKEN_TIMELINE_ROUTE_TIMEOUT_MS));
  });

  it("returns 200 ok:true with snapshot data when loadTokenTimelineSnapshot resolves", async () => {
    const fakeSnapshot = {
      tokenMint: VALID_MINT,
      events: [],
      source: { fetchedAt: new Date().toISOString(), rpcEndpoint: "https://api.devnet.solana.com" },
    };
    vi.mocked(loadTokenTimelineSnapshot).mockResolvedValueOnce(fakeSnapshot as never);
    const response = await GET(makeRequest(VALID_MINT), {
      params: { mint: VALID_MINT },
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.tokenMint).toBe(VALID_MINT);
  });
});
