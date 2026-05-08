import { buildProductNavItems, type ProductNavLabels } from "./navigationItems";

export type MobileNavLabels = ProductNavLabels;

export function buildMobileNavItems(labels: MobileNavLabels) {
  return buildProductNavItems(labels).map(({ href, icon, label }) => ({ href, icon, label }));
}

export function isMobileNavItemActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
