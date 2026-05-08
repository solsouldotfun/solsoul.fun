import {
  initializeSoulIx,
  launchTokenWithWallet,
  TARGET_AMM,
  uploadTemplate,
  type LaunchTokenResult,
  type LaunchTokenWalletParams,
  type PublicKeyLike,
  type TargetAmm,
  type UploadTemplateWalletParams,
} from "sdk";
import {
  withPreSignTransactionReview,
  type PreSignReviewHandler,
} from "./preSignReview";
import { validateTemplateSvg } from "./templateValidation";

export type DevnetLaunchPayload = {
  action: "launch";
  name: string;
  symbol: string;
  templateSvg: string;
  target_amm: number;
};

export const ACTIVE_LAUNCH_TARGET_AMM = TARGET_AMM.Raydium;

function requireActiveLaunchTargetAmm(targetAmm: number, context: string): typeof TARGET_AMM.Raydium {
  if (targetAmm !== ACTIVE_LAUNCH_TARGET_AMM) {
    throw new Error(
      `Only the fixed legacy Raydium target_amm is accepted for ${context}; AMM selection and migration are historical/deferred.`,
    );
  }
  return ACTIVE_LAUNCH_TARGET_AMM;
}

export function buildDevnetLaunchPayload(params: {
  name: string;
  symbol: string;
  templateSvg: string;
  targetAmm: number;
}): DevnetLaunchPayload {
  const targetAmm = requireActiveLaunchTargetAmm(params.targetAmm, "launch payloads");
  return {
    action: "launch",
    name: params.name.trim(),
    symbol: params.symbol,
    templateSvg: params.templateSvg,
    target_amm: targetAmm,
  };
}

type InitializeSoulIxFn = typeof initializeSoulIx;

export function submitInitializeSoulPreview(params: {
  initializeSoul?: InitializeSoulIxFn;
  mint: PublicKeyLike;
  authority: PublicKeyLike;
  createdAt: bigint;
  symbol: string;
  targetAmm: TargetAmm;
}) {
  const initializeSoul = params.initializeSoul ?? initializeSoulIx;
  return initializeSoul({
    mint: params.mint,
    authority: params.authority,
    createdAt: params.createdAt,
    symbol: params.symbol,
    targetAmm: requireActiveLaunchTargetAmm(params.targetAmm, "initialize previews"),
  });
}

type LaunchTokenWithWalletFn = typeof launchTokenWithWallet;
type UploadTemplateWithWalletFn = typeof uploadTemplate;

export async function submitWalletLaunch(
  params: Omit<LaunchTokenWalletParams, "commitment"> & {
    launchTokenWithWallet?: LaunchTokenWithWalletFn;
    onPreSignReview?: PreSignReviewHandler;
  },
): Promise<LaunchTokenResult> {
  const submitLaunch = params.launchTokenWithWallet ?? launchTokenWithWallet;
  const targetAmm = requireActiveLaunchTargetAmm(
    params.targetAmm ?? ACTIVE_LAUNCH_TARGET_AMM,
    "wallet launches",
  );

  return submitLaunch({
    connection: params.connection,
    payer: params.payer,
    sendTransaction: withPreSignTransactionReview(
      params.sendTransaction,
      params.onPreSignReview,
    ),
    symbol: params.symbol,
    targetAmm,
    commitment: "finalized",
  });
}

export async function submitWalletTemplateUpload(
  params: Omit<UploadTemplateWalletParams, "commitment" | "styleParams"> & {
    styleParams?: string;
    uploadTemplateWithWallet?: UploadTemplateWithWalletFn;
    onPreSignReview?: PreSignReviewHandler;
  },
): Promise<string> {
  const submitUpload = params.uploadTemplateWithWallet ?? uploadTemplate;
  const templateText =
    typeof params.template === "string" ? params.template : new TextDecoder().decode(params.template);
  const validation = validateTemplateSvg(templateText);
  if (!validation.isValid) {
    throw new Error("Template SVG failed safety validation before wallet signing.");
  }

  return submitUpload({
    connection: params.connection,
    payer: params.payer,
    mint: params.mint,
    template: params.template,
    styleParams: params.styleParams ?? "mode=hsl;evolution=3",
    sendTransaction: withPreSignTransactionReview(
      params.sendTransaction,
      params.onPreSignReview,
    ),
    commitment: "finalized",
    programIds: params.programIds,
  });
}
