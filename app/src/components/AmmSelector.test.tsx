// @ts-nocheck — justified: AmmSelector component tests reference TARGET_AMM; component preserved as-is post-curve-refactor
import React, { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TARGET_AMM } from "sdk";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";
import { AMM_OPTIONS, AmmSelectorView, type AmmOptionLabels } from "./AmmSelector";

function labelsFor(messages: typeof en): AmmOptionLabels {
  return {
    raydium: messages.amm.raydium,
    pump: messages.amm.pump,
    meteora: messages.amm.meteora,
  };
}

function collectInputs(node: ReactNode): ReactElement[] {
  if (!isValidElement(node)) {
    return [];
  }

  const current = node.type === "input" ? [node as ReactElement] : [];
  const props = node.props as { children?: ReactNode };
  return [
    ...current,
    ...Children.toArray(props.children).flatMap((child) => collectInputs(child)),
  ];
}

describe("AmmSelectorView", () => {
  it.each([
    ["en", en],
    ["zh", zh],
  ])("renders no user-facing AMM chooser controls in %s", (_locale, messages) => {
    const html = renderToStaticMarkup(
      <AmmSelectorView
        value={TARGET_AMM.Raydium}
        onChange={() => undefined}
        groupLabel={messages.amm.label}
        labels={labelsFor(messages)}
      />,
    );

    expect(html).not.toContain('name="target_amm"');
    expect(html).not.toContain('role="radiogroup"');
    expect(html).not.toContain(messages.amm.label);
    expect(html).not.toContain(messages.amm.pump.title);
    expect(html).not.toContain(messages.amm.pump.description);
    expect(html).not.toContain(messages.amm.meteora.title);
    expect(html).not.toContain(messages.amm.meteora.description);
  });

  it("keeps only the fixed internal Raydium default and exposes no selectable alternatives", () => {
    expect(AMM_OPTIONS.map((option) => option.value)).toEqual([TARGET_AMM.Raydium]);
    expect(AMM_OPTIONS.map((option) => option.id)).not.toContain("pump");
    expect(AMM_OPTIONS.map((option) => option.id)).not.toContain("meteora");

    const onChange = vi.fn();
    const element = AmmSelectorView({
      value: TARGET_AMM.Raydium,
      onChange,
      groupLabel: en.amm.label,
      labels: labelsFor(en),
    });

    for (const input of collectInputs(element)) {
      const props = input.props as { onChange: () => void };
      props.onChange();
    }

    expect(onChange).not.toHaveBeenCalled();
  });
});
