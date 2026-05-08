const DEFAULT_PUBLIC_ERROR = "Temporarily unable to load SolSoul data.";

export function publicApiErrorMessage(label = DEFAULT_PUBLIC_ERROR): string {
  return label;
}

export function publicApiWarning(source: string, timedOut = false): string {
  return timedOut
    ? `${source}: request timed out`
    : `${source}: temporarily unavailable`;
}
