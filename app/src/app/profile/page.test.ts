import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((target: string) => {
    throw new Error(`NEXT_REDIRECT:${target}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

describe("/profile legacy route", () => {
  beforeEach(() => {
    redirectMock.mockClear();
  });

  it("redirects the unprefixed route to the default locale profile route", async () => {
    const { default: LegacyProfilePage } = await import("./page");

    expect(() => LegacyProfilePage()).toThrow("NEXT_REDIRECT:/en/profile");
    expect(redirectMock).toHaveBeenCalledWith("/en/profile");
  });
});
