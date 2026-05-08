import React from "react";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PrivacyPageView, type PrivacyPageCopy } from "../../../components/PrivacyPageView";

const appDir = fileURLToPath(new URL("./", import.meta.url));
const appPublicDir = fileURLToPath(new URL("../../../../public/", import.meta.url));
const requiredTodo = "// TODO(legal): replace with reviewed privacy policy text before mainnet launch";

const copy: PrivacyPageCopy = {
  eyebrow: "Privacy skeleton",
  title: "Privacy Policy",
  updated: "Last updated: legal review pending",
  placeholder: "This placeholder privacy policy is not final legal text.",
  sections: [
    {
      title: "Information we may process",
      body: "Wallet addresses, transaction metadata, and client diagnostics may be processed to operate SolSoul.fun.",
    },
    {
      title: "Before mainnet launch",
      body: "Legal counsel must replace this skeleton with the reviewed production privacy policy.",
    },
  ],
  contact: "Questions: legal review contact pending.",
};

describe("privacy page skeleton", () => {
  it("renders the placeholder privacy policy copy", () => {
    const html = renderToStaticMarkup(<PrivacyPageView copy={copy} />);

    expect(html).toContain(copy.title);
    expect(html).toContain(copy.placeholder);
    expect(html).toContain(copy.sections[0].title);
    expect(html).toContain(copy.sections[1].body);
    expect(html).toContain(copy.contact);
  });

  it("keeps the legal TODO comment in the privacy page source", () => {
    const source = readFileSync(`${appDir}page.tsx`, "utf8");

    expect(source).toContain(requiredTodo);
  });

  it("ships a simple allow-all robots.txt", () => {
    const robotsPath = `${appPublicDir}robots.txt`;

    expect(existsSync(robotsPath)).toBe(true);
    expect(readFileSync(robotsPath, "utf8")).toBe("User-agent: *\nAllow: /\n");
  });
});
