export type ProductNavLabels = {
  explore: string;
  market: string;
  souls: string;
  docs: string;
  launch: string;
};

export type ProductNavItem = {
  key: keyof ProductNavLabels;
  href: string;
  label: string;
  icon: string;
  variant: "link" | "cta";
};

export function buildProductNavItems(labels: ProductNavLabels): ProductNavItem[] {
  return [
    { key: "explore", href: "/", label: labels.explore, icon: "⌂", variant: "link" },
    { key: "market", href: "/tokens", label: labels.market, icon: "⬡", variant: "link" },
    { key: "souls", href: "/souls", label: labels.souls, icon: "◇", variant: "link" },
    { key: "docs", href: "/docs", label: labels.docs, icon: "◈", variant: "link" },
    { key: "launch", href: "/launch", label: labels.launch, icon: "✦", variant: "cta" },
  ];
}
