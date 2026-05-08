import * as Sentry from "@sentry/nextjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initSentry } from "./sentry";

vi.mock("@sentry/nextjs", () => ({
  init: vi.fn(),
}));

describe("initSentry", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    delete process.env.NEXT_PUBLIC_ENV;
  });

  it("does not initialize Sentry when NEXT_PUBLIC_SENTRY_DSN is empty", () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "";

    initSentry();

    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it("initializes Sentry once with the public DSN and environment", () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://public@example.ingest.sentry.io/1";
    process.env.NEXT_PUBLIC_ENV = "staging";

    initSentry();

    expect(Sentry.init).toHaveBeenCalledOnce();
    expect(Sentry.init).toHaveBeenCalledWith({
      dsn: "https://public@example.ingest.sentry.io/1",
      tracesSampleRate: 0.1,
      environment: "staging",
    });
  });
});
