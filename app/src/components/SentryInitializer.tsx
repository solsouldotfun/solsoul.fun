"use client";

import { useEffect } from "react";
import { initSentry } from "@/lib/sentry";

export function SentryInitializer() {
  useEffect(() => {
    initSentry();
  }, []);

  return null;
}
