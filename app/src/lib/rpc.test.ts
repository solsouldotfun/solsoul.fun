import { afterEach, describe, expect, it, vi } from "vitest";
import { createRpcFailoverFetch } from "./rpc";

describe("createRpcFailoverFetch backoff", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("primary 200 returns immediately with no fallback call", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: "ok" }), { status: 200 }));
    const rpcFetch = createRpcFailoverFetch(
      "https://primary.example",
      "https://secondary.example",
      fetchImpl,
    );
    const response = await rpcFetch("https://primary.example", { method: "POST" });
    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("primary 429 waits 250ms before fallback hop", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: "ok" }), { status: 200 }));
    const rpcFetch = createRpcFailoverFetch(
      "https://primary.example",
      "https://secondary.example",
      fetchImpl,
    );

    const responsePromise = rpcFetch("https://primary.example", { method: "POST" });
    await vi.advanceTimersByTimeAsync(250);
    const response = await responsePromise;

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1]?.[0]).toBe("https://secondary.example");
  });

  it("primary 429 with Retry-After header honors header value", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const headers = new Headers({ "Retry-After": "1" }); // 1 second
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429, headers }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: "ok" }), { status: 200 }));
    const rpcFetch = createRpcFailoverFetch(
      "https://primary.example",
      "https://secondary.example",
      fetchImpl,
    );

    const responsePromise = rpcFetch("https://primary.example", { method: "POST" });
    await vi.advanceTimersByTimeAsync(1000);
    const response = await responsePromise;

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("primary 429 with Retry-After exceeding 2000ms cap waits at most 2000ms", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const headers = new Headers({ "Retry-After": "10" }); // 10 seconds -> capped at 2000ms
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429, headers }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: "ok" }), { status: 200 }));
    const rpcFetch = createRpcFailoverFetch(
      "https://primary.example",
      "https://secondary.example",
      fetchImpl,
    );

    const responsePromise = rpcFetch("https://primary.example", { method: "POST" });
    await vi.advanceTimersByTimeAsync(2000);
    const response = await responsePromise;

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("network error falls over to fallback without backoff delay", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: "ok" }), { status: 200 }));
    const rpcFetch = createRpcFailoverFetch(
      "https://primary.example",
      "https://secondary.example",
      fetchImpl,
    );

    // No timer advancement needed — network errors have no backoff sleep
    const response = await rpcFetch("https://primary.example", { method: "POST" });

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createRpcFailoverFetch", () => {
  it("retries one 429 response on the secondary RPC URL", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: "ok" }), { status: 200 }));
    const rpcFetch = createRpcFailoverFetch(
      "https://primary.example",
      "https://secondary.example",
      fetchImpl,
    );

    const response = await rpcFetch("https://primary.example", {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: "ok" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://primary.example");
    expect(fetchImpl.mock.calls[1]?.[0]).toBe("https://secondary.example");
    expect(consoleLog).toHaveBeenCalledWith(
      "[app] RPC primary returned HTTP 429; retrying once on configured-rpc",
    );
  });

  it("retries a 5xx response only once on the fallback RPC URL", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("still unavailable", { status: 503 }));
    const rpcFetch = createRpcFailoverFetch(
      "https://primary.example",
      "https://secondary.example",
      fetchImpl,
    );

    const response = await rpcFetch("https://primary.example", { method: "POST" });

    expect(response.status).toBe(503);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("records redacted failover attribution without leaking credential-bearing URLs", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const credentialPath = "redacted-fallback-token-fixture";
    const credentialQuery = "redacted-query-secret-fixture";
    const fallbackUrl = `https://triton-devnet.example.com/${credentialPath}?api-key=${credentialQuery}`;
    const events: unknown[] = [];
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: "ok" }), { status: 200 }));
    const rpcFetch = createRpcFailoverFetch(
      "https://primary.example",
      fallbackUrl,
      fetchImpl,
      (event) => events.push(event),
    );

    await rpcFetch("https://primary.example", { method: "POST" });

    expect(events).toEqual([
      {
        primaryEndpointLabel: "configured-rpc",
        fallbackEndpointLabel: "triton-devnet:<redacted>",
        usedEndpointLabel: "triton-devnet:<redacted>",
        reason: "http_status",
        status: 429,
      },
    ]);
    expect(JSON.stringify(events)).not.toContain(credentialPath);
    expect(JSON.stringify(events)).not.toContain(credentialQuery);
    expect(JSON.stringify(events)).not.toContain(fallbackUrl);
  });
});
