"use client";

import React, { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useConnection } from "@solana/wallet-adapter-react";
import type { Connection } from "@solana/web3.js";
import { deriveSoulConfigPda, PROGRAM_IDS } from "sdk";
import { getRpcEndpoint, isLoopbackRpcEndpoint } from "@/lib/config";
import { uiPrimitives } from "./uiPrimitives";

export type PauseState = {
  isPaused: boolean;
  isLoading: boolean;
  pausedPrograms: Array<"bondingCurve" | "soulGenerator">;
  error?: string;
};

const PauseContext = createContext<PauseState>({
  isPaused: false,
  isLoading: false,
  pausedPrograms: [],
});

const PAUSED_OFFSET = 32;
const LOCAL_PAUSE_POLLING_FLAG = "1";

function unpausedState(): PauseState {
  return {
    isPaused: false,
    isLoading: false,
    pausedPrograms: [],
  };
}

function pausedState(): PauseState {
  return {
    isPaused: true,
    isLoading: false,
    pausedPrograms: ["soulGenerator"],
  };
}

export function resolvePauseStateOverride({
  endpoint = getRpcEndpoint(),
  pauseState = process.env.NEXT_PUBLIC_PAUSE_STATE,
  enableLocalPausePolling = process.env.NEXT_PUBLIC_ENABLE_LOCAL_PAUSE_POLLING,
}: {
  endpoint?: string;
  pauseState?: string;
  enableLocalPausePolling?: string;
} = {}): PauseState | null {
  const normalizedPauseState = pauseState?.trim().toLowerCase();

  if (["paused", "true", "1"].includes(normalizedPauseState ?? "")) {
    return pausedState();
  }

  if (["unpaused", "false", "0"].includes(normalizedPauseState ?? "")) {
    return unpausedState();
  }

  if (
    endpoint &&
    isLoopbackRpcEndpoint(endpoint) &&
    enableLocalPausePolling !== LOCAL_PAUSE_POLLING_FLAG
  ) {
    return unpausedState();
  }

  return null;
}

export function parseGlobalConfigPaused(data: Uint8Array): boolean {
  if (data.byteLength <= PAUSED_OFFSET) {
    throw new Error(`GlobalConfig data too small: expected at least 33 bytes, got ${data.byteLength}`);
  }

  const paused = data[PAUSED_OFFSET];
  if (paused === 0) {
    return false;
  }
  if (paused === 1) {
    return true;
  }
  throw new Error(`Invalid GlobalConfig paused flag: ${paused}`);
}

export async function fetchPauseState(connection: Connection): Promise<PauseState> {
  const programs = [
    {
      name: "soulGenerator" as const,
      pda: deriveSoulConfigPda(PROGRAM_IDS.soulGenerator),
    },
  ];
  const accounts = await connection.getMultipleAccountsInfo(
    programs.map((program) => program.pda),
    "confirmed",
  );
  const pausedPrograms = programs.flatMap((program, index) => {
    const account = accounts[index];
    if (!account) {
      return [];
    }
    return parseGlobalConfigPaused(account.data) ? [program.name] : [];
  });

  return {
    isPaused: pausedPrograms.length > 0,
    isLoading: false,
    pausedPrograms,
  };
}

export function PauseProvider({ children }: { children: ReactNode }) {
  const { connection } = useConnection();
  const [state, setState] = useState<PauseState>({
    isPaused: false,
    isLoading: true,
    pausedPrograms: [],
  });

  useEffect(() => {
    let isMounted = true;
    const overrideState = resolvePauseStateOverride({
      endpoint: connection.rpcEndpoint,
    });

    if (overrideState) {
      setState(overrideState);
      return () => {
        isMounted = false;
      };
    }

    setState((current) => ({ ...current, isLoading: true, error: undefined }));

    fetchPauseState(connection)
      .then((nextState) => {
        if (isMounted) {
          setState(nextState);
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unable to load pause state";
        console.warn("[app] pause state fetch failed", error);
        if (isMounted) {
          setState({
            isPaused: false,
            isLoading: false,
            pausedPrograms: [],
            error: message,
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [connection]);

  return (
    <PauseContext.Provider value={state}>{children}</PauseContext.Provider>
  );
}

export function usePauseStatus(): PauseState {
  return useContext(PauseContext);
}

export function PauseBannerView({
  isPaused,
  message,
}: {
  isPaused: boolean;
  message: string;
}) {
  if (!isPaused) {
    return null;
  }

  return (
    <div
      className={uiPrimitives.banner}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}

export function PauseBanner() {
  const t = useTranslations("pause");
  const { isPaused } = usePauseStatus();
  return <PauseBannerView isPaused={isPaused} message={t("banner")} />;
}

export function isLaunchSubmitDisabled({
  canCreate,
  isLaunching,
  isPaused,
}: {
  canCreate: boolean;
  isLaunching: boolean;
  isPaused: boolean;
}): boolean {
  return isPaused || !canCreate || isLaunching;
}

export function isTokenWriteActionDisabled({
  isPaused,
  isBusy = false,
}: {
  isPaused: boolean;
  isBusy?: boolean;
}): boolean {
  return isPaused || isBusy;
}
