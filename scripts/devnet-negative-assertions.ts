export const CLAIM_INSUFFICIENT_PROVENANCE_ERROR = 0x303;
export const TRANSFER_HOOK_BOUNDARY_BREAK_ERROR = 7_004;

export interface NegativeFailureExpectation {
  customErrorCode: number;
  requiredLogFragments?: string[];
}

export interface NegativeFailureAssertionInput {
  label: string;
  err: unknown;
  logs: string[];
  expectation: NegativeFailureExpectation;
}

export function assertExpectedNegativeFailure({
  label,
  err,
  logs,
  expectation,
}: NegativeFailureAssertionInput): void {
  if (!err) {
    throw new Error(`${label} unexpectedly succeeded; expected custom error ${formatCustomErrorCode(expectation.customErrorCode)}`);
  }

  const observedCustomErrors = collectCustomErrorCodes(err, logs);
  if (!observedCustomErrors.has(expectation.customErrorCode)) {
    const observed = [...observedCustomErrors].map(formatCustomErrorCode).join(", ") || "none";
    throw new Error(
      `${label} failed with unexpected error; expected custom error ${formatCustomErrorCode(
        expectation.customErrorCode,
      )}, observed custom errors: ${observed}; logs: ${logs.join(" | ")}`,
    );
  }

  const logText = logs.join("\n");
  for (const fragment of expectation.requiredLogFragments ?? []) {
    if (!logText.includes(fragment)) {
      throw new Error(`${label} failed with expected code but missing expected log fragment: ${fragment}`);
    }
  }
}

export function formatCustomErrorCode(code: number): string {
  return `${code} (0x${code.toString(16)})`;
}

function collectCustomErrorCodes(err: unknown, logs: string[]): Set<number> {
  const codes = new Set<number>();
  collectCodesFromErr(err, codes);
  collectCodesFromLogs(logs, codes);
  return codes;
}

function collectCodesFromErr(value: unknown, codes: Set<number>): void {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectCodesFromErr(item, codes);
    }
    return;
  }

  const record = value as Record<string, unknown>;
  const custom = record.Custom ?? record.custom;
  if (typeof custom === "number" && Number.isSafeInteger(custom)) {
    codes.add(custom);
  }
  for (const nested of Object.values(record)) {
    if (nested !== custom) {
      collectCodesFromErr(nested, codes);
    }
  }
}

function collectCodesFromLogs(logs: string[], codes: Set<number>): void {
  const hexPattern = /custom program error:\s*0x([0-9a-f]+)/giu;
  const customPattern = /\bCustom\((\d+)\)|"Custom"\s*:\s*(\d+)|\bCustom:\s*(\d+)/gu;
  for (const log of logs) {
    for (const match of log.matchAll(hexPattern)) {
      codes.add(Number.parseInt(match[1]!, 16));
    }
    for (const match of log.matchAll(customPattern)) {
      const decimal = match[1] ?? match[2] ?? match[3];
      if (decimal) {
        codes.add(Number.parseInt(decimal, 10));
      }
    }
  }
}
