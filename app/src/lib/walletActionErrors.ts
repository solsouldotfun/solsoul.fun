export type WalletAction = "buy" | "sell" | "claim" | "launch" | "generate";

export type WalletActionErrorCode =
  | "walletRejected"
  | "validation"
  | "settlement"
  | "rpcUnavailable"
  | "submissionFailed";

export function classifyWalletActionError(error: unknown): WalletActionErrorCode {
  const message = errorMessage(error);

  if (
    /user (?:rejected|denied|cancel(?:led|ed))|wallet(?: request)? (?:rejected|denied)|request rejected|transaction rejected|signature request denied|sign(?:ature|ing)? request (?:rejected|denied)|WalletSign(?:Transaction)?Error|Phantom.*(?:rejected|denied)/i.test(
      message,
    )
  ) {
    return "walletRejected";
  }

  if (
    /enter (?:a|an)|invalid|connect (?:a )?(?:devnet )?(?:phantom )?wallet|slippage|amount|at least|greater than|too large|insufficient|not enough|balance|curve state is still loading|supply cap|market is closed|already been claimed|qualifying|holder gate/i.test(
      message,
    )
  ) {
    return "validation";
  }

  if (
    /settlement|receipt|boundary|source token account|selected receipt|active receipts|canonical Token-2022 associated token account/i.test(
      message,
    )
  ) {
    return "settlement";
  }

  if (
    /rpc|network|fetch|timeout|429|blockhash|preflight|simulation|node is behind|failed to send|transaction was not confirmed|sendTransaction/i.test(
      message,
    )
  ) {
    return "rpcUnavailable";
  }

  return "submissionFailed";
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    );
  } catch {
    return String(error);
  }
}
