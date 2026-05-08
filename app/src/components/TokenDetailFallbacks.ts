export type TokenDetailLoadStatus = "idle" | "loading" | "loaded" | "error";

export function resolveTokenDetailFieldLabel({
  status,
  loadedValue,
  loadingLabel,
  unavailableLabel,
}: {
  status: TokenDetailLoadStatus;
  loadedValue?: string | null;
  loadingLabel: string;
  unavailableLabel: string;
}): string {
  if (status === "idle" || status === "loading") {
    return loadingLabel;
  }

  if (status === "error") {
    return unavailableLabel;
  }

  const displayValue = loadedValue ?? "";
  return displayValue.trim() ? displayValue : unavailableLabel;
}
