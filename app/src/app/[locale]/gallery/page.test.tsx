// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readEnglishGalleryDescription() {
  const messages = JSON.parse(readFileSync(path.join(process.cwd(), "messages/en.json"), "utf8")) as {
    gallery: { description: string };
  };
  return messages.gallery.description;
}

describe("/en/gallery no-wallet visible copy", () => {
  it("states the 10,000-token MT claim threshold in visible innerText", () => {
    if (!("innerText" in document.body)) {
      Object.defineProperty(HTMLElement.prototype, "innerText", {
        get() {
          return this.textContent ?? "";
        },
        set(value: string) {
          this.textContent = value;
        },
        configurable: true,
      });
    }

    const description = document.createElement("p");
    description.innerText = readEnglishGalleryDescription();
    document.body.replaceChildren(description);

    const visibleText = document.body.innerText;

    expect(visibleText).toContain("not a standalone NFT drop");
    expect(visibleText).toContain("21,000,000 fungible tokens");
    expect(visibleText).toContain("10,000-token holder gate");
  });
});
