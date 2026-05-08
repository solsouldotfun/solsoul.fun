"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { buildMobileNavItems, isMobileNavItemActive, type MobileNavLabels } from "./MobileBottomNav.logic";
import { joinClasses } from "./uiPrimitives";

type MobileBottomNavProps = {
  labels: MobileNavLabels;
};

export function MobileBottomNav({ labels }: MobileBottomNavProps) {
  const pathname = usePathname();
  const items = buildMobileNavItems(labels);

  return (
    <nav
      aria-label="Mobile primary navigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-black/95 px-3 py-2 shadow-[0_-24px_80px_rgba(0,0,0,0.55)] backdrop-blur sm:hidden"
    >
      <div className="mx-auto grid max-w-screen-sm grid-cols-5 gap-1">
        {items.map((item) => {
          const active = isMobileNavItemActive(pathname, item.href);

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={joinClasses(
                "min-w-0 rounded-2xl border px-2 py-2 text-center text-xs font-semibold transition hover:-translate-y-0.5 hover:border-soul-mint/50 hover:text-soul-mint",
                active
                  ? "border-soul-mint/45 bg-soul-mint/[0.12] text-soul-mint shadow-[0_0_24px_rgba(215,255,63,0.14)]"
                  : "border-white/10 bg-white/[0.035] text-white/65",
              )}
              href={item.href}
              key={item.href}
            >
              <span aria-hidden="true" className="block text-lg leading-none">
                {item.icon}
              </span>
              <span className="mt-1 block truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
