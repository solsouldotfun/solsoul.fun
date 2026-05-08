"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import type { Adapter } from "@solana/wallet-adapter-base";
import { getRpcEndpoint } from "@/lib/config";
import { createRpcConnectionConfig } from "@/lib/rpc";

type AppWalletProviderProps = {
  children: ReactNode;
};

export function AppWalletProvider({ children }: AppWalletProviderProps) {
  const endpoint = getRpcEndpoint();
  const connectionConfig = useMemo(() => createRpcConnectionConfig(), []);
  const [wallets, setWallets] = useState<Adapter[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadAdapters = async () => {
      const { PhantomWalletAdapter } = await import("@solana/wallet-adapter-phantom");

      if (!cancelled) {
        setWallets([new PhantomWalletAdapter()]);
      }
    };

    const scheduleAdapterLoad = () => {
      void loadAdapters();
    };

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(scheduleAdapterLoad, { timeout: 2_000 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(idleId);
      };
    }

    const timeoutId = globalThis.setTimeout(scheduleAdapterLoad, 1_000);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint} config={connectionConfig}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
