import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("/api/devnet-smoke", () => {
  it("retires server-signed smoke writes in favor of connected wallet flows", async () => {
    const response = await POST(
      new Request("http://localhost/api/devnet-smoke", {
        method: "POST",
        body: JSON.stringify({ action: "claim" }),
      }),
    );
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.error).toContain("connected wallet claim Soul flow");
    expect(body.error).toContain("wallet-signed only");
  });
});
