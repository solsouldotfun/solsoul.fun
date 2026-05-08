"use client";

import dynamic from "next/dynamic";
import type React from "react";
import { useTranslations } from "next-intl";
import { uiPrimitives } from "./uiPrimitives";

type WalletConnectButtonLabels = {
  "change-wallet": string;
  connecting: string;
  "copy-address": string;
  copied: string;
  disconnect: string;
  "has-wallet": string;
  "no-wallet": string;
};

type WalletConnectButtonMessageKey =
  | "changeWallet"
  | "connecting"
  | "copyAddress"
  | "copied"
  | "disconnect"
  | "connect"
  | "selectWallet";

type LocalizedWalletMultiButtonProps = {
  className?: string;
  labels: WalletConnectButtonLabels;
};

const LocalizedWalletMultiButton = dynamic<LocalizedWalletMultiButtonProps>(
  async () => {
    const { BaseWalletMultiButton } = await import("@solana/wallet-adapter-react-ui");
    return BaseWalletMultiButton as React.ComponentType<LocalizedWalletMultiButtonProps>;
  },
  { ssr: false },
);

export const WALLET_CONNECT_BUTTON_CLASS =
  uiPrimitives.walletTrigger;

export function buildWalletConnectButtonLabels(
  t: (key: WalletConnectButtonMessageKey) => string,
): WalletConnectButtonLabels {
  return {
    "change-wallet": t("changeWallet"),
    connecting: t("connecting"),
    "copy-address": t("copyAddress"),
    copied: t("copied"),
    disconnect: t("disconnect"),
    "has-wallet": t("connect"),
    "no-wallet": t("selectWallet"),
  };
}

export function WalletConnectButton() {
  const t = useTranslations("shared.walletButton");
  return (
    <LocalizedWalletMultiButton
      className={WALLET_CONNECT_BUTTON_CLASS}
      labels={buildWalletConnectButtonLabels(t)}
    />
  );
}
