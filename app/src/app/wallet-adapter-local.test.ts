import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("local wallet adapter modal stylesheet", () => {
  it("keeps the modal middle button readable on its white background", () => {
    const css = readFileSync(new URL("./wallet-adapter-local.css", import.meta.url), "utf8");
    const match = css.match(/\.wallet-adapter-modal-middle-button\s*\{(?<body>[^}]*)\}/);
    const body = match?.groups?.body ?? "";
    const textColorDeclaration = body
      .split(";")
      .map((declaration) => declaration.trim())
      .find((declaration) => declaration.startsWith("color:"));

    expect(body).toContain("background-color: #ffffff");
    expect(textColorDeclaration).not.toMatch(/^color:\s*(#fff|#ffffff|white)$/i);
    expect(textColorDeclaration).toMatch(/^color:\s*(#050505|#000000|black)$/i);
  });

  it("keeps the mission wallet adapter inventory Phantom-only", () => {
    const provider = readFileSync(
      new URL("../components/AppWalletProvider.tsx", import.meta.url),
      "utf8",
    );

    expect(provider).toContain("@solana/wallet-adapter-phantom");
    expect(provider).toContain("new PhantomWalletAdapter()");
    expect(provider).not.toContain("@solana/wallet-adapter-solflare");
    expect(provider).not.toContain("SolflareWalletAdapter");
  });
});
