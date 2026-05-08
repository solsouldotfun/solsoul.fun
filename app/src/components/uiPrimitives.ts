export const uiPrimitives = {
  addressMono: "break-all font-mono text-white/60",
  amountMono: "font-mono tabular-nums text-white",
  buttonPrimary:
    "inline-flex items-center justify-center rounded-xl border border-soul-mint/60 bg-soul-mint px-6 py-3.5 text-sm font-semibold text-black shadow-[0_0_28px_rgba(215,255,63,0.20)] transition hover:border-soul-mint hover:bg-[#e4ff67] hover:shadow-[0_0_36px_rgba(215,255,63,0.30)] focus:outline-none focus-visible:ring-2 focus-visible:ring-soul-mint/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/15 disabled:text-white/40 disabled:shadow-none",
  buttonSecondary:
    "inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/[0.04] px-6 py-3.5 text-sm font-semibold text-white/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:border-soul-purple/50 hover:bg-soul-purple/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-soul-purple/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-50",
  banner:
    "w-full border-b border-soul-mint/20 bg-[linear-gradient(90deg,rgba(215,255,63,0.16),rgba(155,92,255,0.12),rgba(34,211,238,0.12))] px-4 py-2 text-center text-xs font-semibold uppercase tracking-[0.18em] text-white/85 shadow-[0_0_30px_rgba(155,92,255,0.18)] sm:text-sm",
  card:
    "rounded-3xl border border-white/10 bg-neutral-950/85 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur",
  denseRow: "min-w-0 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
  heroPanel:
    "rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(215,255,63,0.10),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(155,92,255,0.12),transparent_34%),rgba(255,255,255,0.035)] shadow-[0_30px_100px_rgba(0,0,0,0.55)] backdrop-blur",
  input:
    "w-full min-w-0 rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-white/30 focus:border-soul-mint/50 focus:bg-black/55 focus:ring-2 focus:ring-soul-mint/15",
  label: "text-xs font-semibold uppercase tracking-[0.22em] text-soul-mint/70",
  modalShell:
    "max-h-full w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/10 bg-neutral-950/95 p-6 text-white shadow-[0_30px_120px_rgba(0,0,0,0.75)] backdrop-blur",
  navLink:
    "hidden rounded-full border border-soul-mint/20 bg-soul-mint/[0.06] px-3 py-1.5 text-sm font-semibold text-soul-mint/85 shadow-[0_0_22px_rgba(215,255,63,0.10)] transition hover:border-soul-mint/45 hover:bg-soul-mint/[0.10] hover:text-soul-mint sm:inline-flex",
  navLinkMuted: "hidden rounded-full px-3 py-1.5 text-sm font-medium text-white/50 transition hover:bg-white/[0.05] hover:text-white sm:inline-flex",
  panel:
    "rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] shadow-[0_24px_90px_rgba(0,0,0,0.45)] backdrop-blur",
  pill:
    "inline-flex w-fit items-center gap-2 rounded-full border border-soul-mint/20 bg-soul-mint/[0.08] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-soul-mint/80",
  statusError:
    "rounded-2xl border border-rose-400/25 bg-rose-500/[0.08] p-4 text-sm text-rose-100/80",
  statusNeutral: "rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm text-white/65 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
  walletTrigger:
    "!min-w-0 !max-w-[8.5rem] sm:!max-w-full !overflow-hidden !text-ellipsis !rounded-xl !border !border-soul-mint/25 !bg-soul-mint/[0.08] !px-4 !font-semibold !text-white !whitespace-nowrap hover:!border-soul-mint/45 hover:!bg-soul-mint/[0.12]",
} as const;

export function joinClasses(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
