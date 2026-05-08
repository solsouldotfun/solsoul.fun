import { Buffer } from "buffer";
import {
  Connection,
  ComputeBudgetProgram,
  Keypair,
  type AccountMeta,
  PublicKey,
  sendAndConfirmTransaction,
  Signer,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type Commitment,
  type ConfirmOptions,
  type PublicKeyInitData,
} from "@solana/web3.js";
import {
  ACCOUNT_SIZE,
  AccountLayout,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createExecuteInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeTransferHookInstruction,
  createTransferCheckedInstruction,
  ExtensionType,
  getAccount,
  getExtraAccountMetaAddress,
  getExtraAccountMetas,
  getTokenMetadata,
  getTransferHook,
  MINT_SIZE,
  getMintLen,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
  resolveExtraAccountMeta,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  unpackMint,
} from "@solana/spl-token";

declare const process: {
  env: {
    NODE_ENV?: string;
    NEXT_PUBLIC_BONDING_CURVE_PROGRAM_ID?: string;
    NEXT_PUBLIC_SOUL_GENERATOR_PROGRAM_ID?: string;
    NEXT_PUBLIC_TRANSFER_HOOK_PROGRAM_ID?: string;
  };
};

export const DEVNET_PROGRAM_IDS = {
  bondingCurve: "CoL4Sti1wZbv8tJSYXC6pLSzhwj9eeArw9mdAbsS69un",
  soulGenerator: "34erFyVvAiLsTwDivcauQCJnVX16ZjEwgJ6tEs5NeaMZ",
  transferHook: "Gccbqia51Z8qpdeWvp1yGTrTwoyJX6WNGhFyH5pnPW66",
} as const;

function publicEnv(name: string): string | undefined {
  const value =
    name === "NEXT_PUBLIC_BONDING_CURVE_PROGRAM_ID"
      ? process.env.NEXT_PUBLIC_BONDING_CURVE_PROGRAM_ID?.trim()
      : name === "NEXT_PUBLIC_SOUL_GENERATOR_PROGRAM_ID"
        ? process.env.NEXT_PUBLIC_SOUL_GENERATOR_PROGRAM_ID?.trim()
        : process.env.NEXT_PUBLIC_TRANSFER_HOOK_PROGRAM_ID?.trim();
  return value && value.length > 0 ? value : undefined;
}

function publicProgramId(envName: string, devFallback: string): string {
  const configured = publicEnv(envName);
  if (configured) {
    return configured;
  }

  return devFallback;
}

export const PROGRAM_IDS = {
  soulGenerator: publicProgramId(
    "NEXT_PUBLIC_SOUL_GENERATOR_PROGRAM_ID",
    DEVNET_PROGRAM_IDS.soulGenerator,
  ),
  bondingCurve: publicProgramId(
    "NEXT_PUBLIC_BONDING_CURVE_PROGRAM_ID",
    DEVNET_PROGRAM_IDS.bondingCurve,
  ),
  transferHook: publicProgramId(
    "NEXT_PUBLIC_TRANSFER_HOOK_PROGRAM_ID",
    DEVNET_PROGRAM_IDS.transferHook,
  ),
  token2022: TOKEN_2022_PROGRAM_ID.toBase58(),
} as const;

export const SLOT_HASHES_SYSVAR_ID = new PublicKey(
  "SysvarS1otHashes111111111111111111111111111",
);

export const RECENT_BLOCKHASHES_SYSVAR_ID = new PublicKey(
  "SysvarRecentB1ockHashes11111111111111111111",
);
export const BPF_LOADER_UPGRADEABLE_PROGRAM_ID = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111",
);

export const CURVE_SEED = "curve";
export const VAULT_SEED = "vault";
export const TREASURY_SEED = "treasury";
export const LP_LOCK_SEED = "lp_lock";
export const SOUL_SEED = "soul";
export const CLAIM_SEED = "claim";
export const RECEIPT_SEED = "receipt";
export const RECEIPT_REGISTRY_SEED = "receipt_registry";
export const NFT_AUTHORITY_SEED = "nft";
export const NFT_METADATA_SYMBOL = "SOUL";
export const MEME_SYMBOL_CAPACITY = 16;
export const TOKEN_METADATA_BASE_PACKED_LEN = 80;
export const NFT_MINT_ACCOUNT_SIZE = getMintLen([ExtensionType.MetadataPointer]);
export const LAUNCHED_TOKEN_MINT_ACCOUNT_SIZE = getMintLen([ExtensionType.TransferHook]);
export const RAYDIUM_CP_SWAP_DEVNET_PROGRAM_ID =
  "CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW";
export const RAYDIUM_CP_SWAP_MAINNET_PROGRAM_ID =
  "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C";
export const RAYDIUM_AMM_CONFIG_INDEX = 0;
export const RAYDIUM_CREATE_POOL_FEE_RECEIVER_DEVNET =
  "G11FKBRaAkHAKuLCgLM6K6NUc9rTjPAznRCjZifrTQe2";
export const RAYDIUM_CREATE_POOL_FEE_RECEIVER_MAINNET =
  "DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8";

export const RAYDIUM_DUST_WARNING_CODES = {
  PoolMissing: "raydium_pool_missing",
  PoolOwnerMismatch: "raydium_pool_owner_mismatch",
  VaultMissing: "raydium_vault_missing",
  VaultOwnerMismatch: "raydium_vault_owner_mismatch",
  VaultMintMismatch: "raydium_vault_mint_mismatch",
  VaultUnsupportedTokenProgram: "raydium_vault_unsupported_token_program",
  VaultUnverified: "raydium_vault_unverified",
} as const;
export type RaydiumDustWarningCode =
  (typeof RAYDIUM_DUST_WARNING_CODES)[keyof typeof RAYDIUM_DUST_WARNING_CODES];

export const TARGET_AMM = {
  Raydium: 0,
  Pump: 1,
  Meteora: 2,
} as const;
export type TargetAmm = (typeof TARGET_AMM)[keyof typeof TARGET_AMM];
export const ACTIVE_TARGET_AMM = TARGET_AMM.Raydium;
export const ACTIVE_TARGET_AMM_LABEL = "raydium";
export const TRANSFER_HOOK_COMPATIBILITY_SCOPE = {
  activeAmm: "none_current_curve_only",
  legacyTargetAmm: "raydium",
  walletDirectTransfer: {
    status: "supported",
    accountResolution: [
      "token2022_transfer_checked_base_accounts",
      "extra_account_meta_validation_pda",
      "soul_generator_program",
      "source_owner_receipt_registry_pda",
    ],
    failureModes: [
      "missing_extra_account_metas",
      "wrong_validation_owner",
      "missing_receipt_registry",
      "wrong_registry_owner",
      "wrong_registry_claimant",
      "wrong_registry_mint",
      "malformed_receipt_registry",
      "rpc_account_resolution_failure",
      "paused_or_program_error_state",
    ],
  },
  raydiumSwapPath: {
    status: "unsupported_bounded",
    warningCodes: [
      "post_graduation_raydium_receipt_paths_bounded",
      "raydium_transfer_hook_mints_unsupported",
    ],
    enforcement:
      "Only wallet direct transfers are currently account-resolution hardened and presented as receipt-protected; historical/deferred Raydium CP-Swap liquidity/swap paths must not be presented as receipt-protected, and Transfer Hook-enabled mints do not migrate to Raydium in the active curve-only product flow.",
  },
} as const;

/**
 * PD18.F5 — gating contract for any "official single dust dominance ratio" surface.
 *
 * Until the protocol coverage required by PD18.A5 is complete, the app, docs,
 * APIs, and mission artifacts MUST surface raw/liquidity dust metrics only and
 * MUST NOT advertise an official scarcity / official dominance ratio. The gate
 * encodes the three coverage prerequisites:
 *
 *   1. Bonding-curve sell hard-binding is enforced (PD17/PD18.F2 baseline).
 *   2. Direct Token-2022 transfers are hook-aware and reject boundary breaks
 *      without settlement (PD18.F1/F2 baseline).
 *   3. Historical/deferred Raydium receipt invariant evidence is retained only
 *      as validation context; active product copy must not present AMM
 *      migration paths as receipt-protected.
 *
 * Any surface that wants to render or expose an "official" ratio MUST consult
 * `isOfficialDustDominanceRatioEnabled()`; while it returns `false` the surface
 * MUST hide the ratio or label it raw-only.
 */
export const OFFICIAL_DUST_DOMINANCE_RATIO_GATE = {
  status: "gated",
  enabled: false,
  reason: "pd18_protocol_coverage_incomplete",
  rawMetricLabel: "liquidity_dust_ratio",
  /**
   * Affirmative public-claim phrases that must NOT appear in current
   * user-facing copy. The list intentionally targets affirmative wording (a
   * surface advertising an "official" ratio) rather than disclaimers like
   * "not an official scarcity signal", which remain allowed.
   */
  forbiddenPublicWording: [
    "official scarcity ratio",
    "official scarcity proof",
    "official dust dominance ratio",
    "official dust dominance",
    "official dominance ratio",
    "official dominance proof",
    "single dust dominance ratio",
    "official single dust dominance",
    "scarcity proof ratio",
  ],
  /**
   * Substrings that suppress matches when present in surrounding text. The
   * canonical case is the disclaimer "not an official scarcity signal": it
   * contains "official scarcity" but it is explicitly negating the claim.
   */
  permittedDisclaimerSubstrings: [
    "not an official scarcity signal",
    "not an official scarcity proof",
    "not an official dust dominance",
    "not an official dominance",
    "no single official dust dominance",
    "no official single dust dominance",
  ],
  requiredCoverage: [
    "bonding_curve_sell_hard_binding_validated",
    "direct_transfer_hook_boundary_validated",
    "post_graduation_raydium_receipt_invariants_validated",
  ],
  validatedCoverage: [] as readonly string[],
} as const;

export type OfficialDustDominanceRatioCoverage =
  (typeof OFFICIAL_DUST_DOMINANCE_RATIO_GATE.requiredCoverage)[number];

export interface OfficialDustDominanceRatioGateInput {
  bondingCurveSellHardBindingValidated?: boolean;
  directTransferHookBoundaryValidated?: boolean;
  postGraduationRaydiumReceiptInvariantsValidated?: boolean;
}

/**
 * Returns true only when ALL prerequisite invariants are validated. Defaults
 * to false and MUST be treated by callers as the binding gate for any "official"
 * ratio surface; the production default in this build is gated (false).
 */
export function isOfficialDustDominanceRatioEnabled(
  input: OfficialDustDominanceRatioGateInput = {},
): boolean {
  // The gate is wired closed in this build until protocol coverage completes.
  // Narrow via a runtime read so TS does not eliminate the guard at compile
  // time; future work flips OFFICIAL_DUST_DOMINANCE_RATIO_GATE.enabled to true
  // in lockstep with the validated coverage list.
  const gateEnabled: boolean = Boolean(
    (OFFICIAL_DUST_DOMINANCE_RATIO_GATE as { enabled: boolean }).enabled,
  );
  if (!gateEnabled) {
    return false;
  }
  return (
    input.bondingCurveSellHardBindingValidated === true &&
    input.directTransferHookBoundaryValidated === true &&
    input.postGraduationRaydiumReceiptInvariantsValidated === true
  );
}

/**
 * Asserts that the supplied caller-provided text does not advertise a public
 * "official" dust dominance / scarcity ratio while the gate is closed. Used by
 * automated copy-audit tests to keep app/docs/API surfaces honest.
 */
export function assertNoOfficialDominanceWording(
  haystack: string,
  context: string = "copy",
): void {
  // Strip permitted disclaimer phrases first so that "not an official scarcity
  // signal" does not falsely trip the affirmative checks below.
  let scrubbed = haystack.toLowerCase();
  for (const disclaimer of OFFICIAL_DUST_DOMINANCE_RATIO_GATE.permittedDisclaimerSubstrings) {
    scrubbed = scrubbed.split(disclaimer).join(" ");
  }

  const hits = OFFICIAL_DUST_DOMINANCE_RATIO_GATE.forbiddenPublicWording.filter((needle) =>
    scrubbed.includes(needle),
  );
  if (hits.length > 0) {
    throw new Error(
      `[PD18.F5] ${context} contains gated official-dominance wording: ${hits.join(", ")}`,
    );
  }
}

/**
 * Pre-M7 layout: stops after `graduation_threshold_lamports` and is the
 * smallest size that decoders must accept for backwards compatibility with
 * accounts written before the AMM dispatcher landed.
 */
export const BONDING_CURVE_ACCOUNT_PRE_M7_LEGACY_SIZE = 138;
export const CURVE_TARGET_AMM_OFFSET = BONDING_CURVE_ACCOUNT_PRE_M7_LEGACY_SIZE;
/**
 * Exponential curve layout (sato-style).
 * Mint(32) + cumulativeSol(8) + totalMinted(8) + selfDeprecated(1) + lastInteractionSlot(8) = 57
 */
export const BONDING_CURVE_ACCOUNT_SIZE = 57;
export const CURVE_CUMULATIVE_SOL_OFFSET = 32;
export const CURVE_TOTAL_MINTED_OFFSET = 40;
export const CURVE_SELF_DEPRECATED_OFFSET = 48;
export const CURVE_LAST_INTERACTION_SLOT_OFFSET = 49;
export const LAUNCH_FEE_LAMPORTS = 30_000_000n;

export const GLOBAL_CONFIG_SEED = "global_config";
export const GLOBAL_CONFIG_ACCOUNT_SIZE = 33;
export const GLOBAL_CONFIG_AUTHORITY_OFFSET = 0;
export const GLOBAL_CONFIG_PAUSED_OFFSET = 32;

const DEFAULT_GENERATION_PROVENANCE_LIMIT = 100;
export const LAST_SVG_CAPACITY = 4_096;
export const FUNGIBLE_TOKEN_DECIMALS = 6;
export const FUNGIBLE_TOKEN_BASE_UNITS = 1_000_000n;
const TOKEN_COUNT_SCALE_MILLION = 1_000_000n;
export const FUNGIBLE_CURVE_CAP_TOKENS = 21n * TOKEN_COUNT_SCALE_MILLION;
export const FUNGIBLE_TOKEN_SUPPLY_BASE_UNITS =
  FUNGIBLE_CURVE_CAP_TOKENS * FUNGIBLE_TOKEN_BASE_UNITS;
export const MT_CLAIM_QUANTUM_TOKENS = 10_000n;
export const MT_CLAIM_QUANTUM_BASE_UNITS =
  MT_CLAIM_QUANTUM_TOKENS * FUNGIBLE_TOKEN_BASE_UNITS;
export const MAX_MT_SOUL_NFT_CLAIMS = 2_100n;
export const MIN_CLAIM_BALANCE = MT_CLAIM_QUANTUM_BASE_UNITS;
export const LAST_SVG_OFFSET = 82;
export const BASE_SVG_TEMPLATE_CAPACITY = 2_048;
export const BASE_SVG_TEMPLATE_OFFSET = LAST_SVG_OFFSET + LAST_SVG_CAPACITY;
export const TEMPLATE_LEN_OFFSET = BASE_SVG_TEMPLATE_OFFSET + BASE_SVG_TEMPLATE_CAPACITY;
export const STYLE_PARAMS_CAPACITY = 256;
export const STYLE_PARAMS_OFFSET = TEMPLATE_LEN_OFFSET + 2;
export const STYLE_PARAMS_LEN_OFFSET = STYLE_PARAMS_OFFSET + STYLE_PARAMS_CAPACITY;
export const MIN_CLAIM_BALANCE_OFFSET = STYLE_PARAMS_LEN_OFFSET + 2;
export const CLAIM_COUNT_OFFSET = MIN_CLAIM_BALANCE_OFFSET + 8;
export const CLAIM_COUNT_END_OFFSET = CLAIM_COUNT_OFFSET + 8;
export const SOUL_ACCOUNT_PRE_M3_LEGACY_SIZE = CLAIM_COUNT_END_OFFSET;
export const MEME_SYMBOL_OFFSET = CLAIM_COUNT_END_OFFSET;
export const MEME_SYMBOL_LEN_OFFSET = MEME_SYMBOL_OFFSET + MEME_SYMBOL_CAPACITY;
export const SOUL_ACCOUNT_LEGACY_SIZE = MEME_SYMBOL_LEN_OFFSET + 1;
export const SOUL_TARGET_AMM_OFFSET = SOUL_ACCOUNT_LEGACY_SIZE;
export const SOUL_ACCOUNT_PRE_PD7_LEGACY_SIZE = SOUL_TARGET_AMM_OFFSET + 1;
export const SOUL_PROVENANCE_GENERATION_OFFSET = SOUL_ACCOUNT_PRE_PD7_LEGACY_SIZE;
export const SOUL_PROVENANCE_SIDE_OFFSET = SOUL_PROVENANCE_GENERATION_OFFSET + 8;
export const SOUL_PROVENANCE_AMOUNT_OFFSET = SOUL_PROVENANCE_SIDE_OFFSET + 1;
export const SOUL_PROVENANCE_TRADER_OFFSET = SOUL_PROVENANCE_AMOUNT_OFFSET + 8;
export const SOUL_PROVENANCE_TOKEN_ACCOUNT_OFFSET = SOUL_PROVENANCE_TRADER_OFFSET + 32;
export const SOUL_PROVENANCE_MINT_OFFSET = SOUL_PROVENANCE_TOKEN_ACCOUNT_OFFSET + 32;
export const SOUL_PROVENANCE_SOUL_OFFSET = SOUL_PROVENANCE_MINT_OFFSET + 32;
export const SOUL_PROVENANCE_SEED_HASH_OFFSET = SOUL_PROVENANCE_SOUL_OFFSET + 32;
export const SOUL_PROVENANCE_SEED_HASH_LEN = 8;
export const SOUL_PROVENANCE_TOKEN_AMOUNT_OFFSET =
  SOUL_PROVENANCE_SEED_HASH_OFFSET + SOUL_PROVENANCE_SEED_HASH_LEN;
export const SOUL_ACCOUNT_PRE_PROVENANCE_TOKEN_AMOUNT_SIZE =
  SOUL_PROVENANCE_TOKEN_AMOUNT_OFFSET;
export const SOUL_ACCOUNT_SIZE =
  SOUL_PROVENANCE_TOKEN_AMOUNT_OFFSET + 8;
export const SOUL_PROVENANCE_SIDE = {
  None: 0,
  Buy: 1,
  Sell: 2,
} as const;
export type SoulProvenanceSide =
  (typeof SOUL_PROVENANCE_SIDE)[keyof typeof SOUL_PROVENANCE_SIDE];
export type GenerationTradeSide = "buy" | "sell";
export type ArtThemeId =
  | "neonpuff"
  | "soulpuff"
  | "monochrome"
  | "hexagram"
  | "signal"
  | "fractal"
  | "field"
  | "lattice"
  | "chaos"
  | "harmonic"
  | "pixel_fractal"
  | "pixel_art"
  | "symphony"
  | "legacy"
  | "custom";
export interface ResolvedSoulTheme {
  id: ArtThemeId;
  label: string;
  renderer: "built-in" | "custom-template";
}
export type DefaultSoulTraitCategoryId =
  | "character_archetype"
  | "goggles_eyes"
  | "expression"
  | "gas_aura_cloud"
  | "background"
  | "outfit"
  | "relic"
  | "animation_behavior"
  | "gas_level";
export interface DefaultSoulTraitOption {
  id: string;
  weight: number;
}
export interface DefaultSoulTraitCategory {
  id: DefaultSoulTraitCategoryId;
  options: readonly DefaultSoulTraitOption[];
}
export interface DefaultSoulTraitInput {
  seed: Uint8Array | string;
  theme?: ArtThemeId | string;
  provenanceSide?: SoulProvenanceSide | "none" | "buy" | "sell";
  generation?: AmountLike;
  amount?: AmountLike;
  tokenAmount?: AmountLike;
}
export interface DefaultSoulTraitSet {
  characterArchetype: string;
  gogglesEyes: string;
  expression: string;
  gasAuraCloud: string;
  background: string;
  outfit: string;
  relic: string;
  animationBehavior: string;
  gasLevel: string;
}
export type CoreArtTraitCategoryId = "palette" | "mood" | "form" | "background";
export type CoreArtTraitStyleKey =
  | "trait_palette"
  | "trait_mood"
  | "trait_form"
  | "trait_background";
export type CoreArtTraitPalette = "solana" | "aurora" | "ember" | "mono";
export type CoreArtTraitMood = "serene" | "charged" | "mystic" | "radiant";
export type CoreArtTraitForm = "spiral" | "wave" | "crystal" | "orb";
export type CoreArtTraitBackground = "midnight" | "nebula" | "grid" | "eclipse";
export interface CoreArtTraitSelection {
  palette?: CoreArtTraitPalette;
  mood?: CoreArtTraitMood;
  form?: CoreArtTraitForm;
  background?: CoreArtTraitBackground;
}
export interface FinalCoreArtTraits {
  palette: CoreArtTraitPalette;
  mood: CoreArtTraitMood;
  form: CoreArtTraitForm;
  background: CoreArtTraitBackground;
}
export interface CoreArtTraitOption {
  id: string;
  weight: number;
}
export interface CoreArtTraitCategory {
  id: CoreArtTraitCategoryId;
  styleKey: CoreArtTraitStyleKey;
  options: readonly CoreArtTraitOption[];
}
export interface BlendedSoulTraitSet {
  defaults: DefaultSoulTraitSet;
  core: FinalCoreArtTraits;
}
export interface BlendedSoulTraitInput extends DefaultSoulTraitInput {
  styleParams?: string | Uint8Array;
}
export type SoulRarityTierId =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary"
  | "mythic";
export interface SoulMetadataRarity {
  tier: SoulRarityTierId;
  score: number;
}
export interface SoulGeneratedTraitAttribute {
  category: DefaultSoulTraitCategoryId;
  traitType: string;
  value: string;
}
export interface DecodedSoulNftMetadataJson {
  name: string;
  symbol: string;
  image?: string;
  artTheme?: string;
  generation?: string;
  attributes: Array<{ trait_type: string; value: string }>;
  generatedTraits: SoulGeneratedTraitAttribute[];
  rarity: SoulMetadataRarity | null;
}
export const DEFAULT_SOUL_TRAIT_CATEGORIES = [
  {
    id: "character_archetype",
    options: [
      { id: "neonpuff_unicorn", weight: 4_800 },
      { id: "rainbow_pegasus", weight: 1_800 },
      { id: "solana_dragon", weight: 1_300 },
      { id: "vapor_fox", weight: 900 },
      { id: "gas_goblin", weight: 700 },
      { id: "oracle_cat", weight: 350 },
      { id: "mythic_star_horse", weight: 150 },
    ],
  },
  {
    id: "goggles_eyes",
    options: [
      { id: "rainbow_goggles", weight: 3_600 },
      { id: "laser_lenses", weight: 2_100 },
      { id: "starry_eyes", weight: 1_700 },
      { id: "sleepy_lids", weight: 1_100 },
      { id: "monocle_scope", weight: 800 },
      { id: "hologram_visor", weight: 500 },
      { id: "cosmic_third_eye", weight: 200 },
    ],
  },
  {
    id: "expression",
    options: [
      { id: "zen_smirk", weight: 3_200 },
      { id: "diamond_grin", weight: 2_400 },
      { id: "surprised_puff", weight: 1_600 },
      { id: "battle_squint", weight: 1_200 },
      { id: "meme_cackle", weight: 1_000 },
      { id: "oracle_focus", weight: 450 },
      { id: "legendary_wink", weight: 150 },
    ],
  },
  {
    id: "gas_aura_cloud",
    options: [
      { id: "green_gas_puff", weight: 3_400 },
      { id: "rainbow_aura", weight: 2_300 },
      { id: "solana_mist", weight: 1_500 },
      { id: "neon_cloud", weight: 1_200 },
      { id: "spark_burst", weight: 900 },
      { id: "plasma_halo", weight: 500 },
      { id: "golden_fog", weight: 200 },
    ],
  },
  {
    id: "background",
    options: [
      { id: "midnight_gradient", weight: 3_000 },
      { id: "solana_sky", weight: 2_400 },
      { id: "checker_stars", weight: 1_600 },
      { id: "meme_wall", weight: 1_200 },
      { id: "nebula_ring", weight: 1_000 },
      { id: "aurora_grid", weight: 600 },
      { id: "eclipse_gold", weight: 200 },
    ],
  },
  {
    id: "outfit",
    options: [
      { id: "hoodie", weight: 3_000 },
      { id: "space_jacket", weight: 2_200 },
      { id: "raydium_racer", weight: 1_600 },
      { id: "puffer_vest", weight: 1_300 },
      { id: "wizard_cape", weight: 900 },
      { id: "gold_chain", weight: 700 },
      { id: "king_robes", weight: 300 },
    ],
  },
  {
    id: "relic",
    options: [
      { id: "none", weight: 3_800 },
      { id: "solana_coin", weight: 1_900 },
      { id: "raydium_orb", weight: 1_500 },
      { id: "tiny_launcher", weight: 1_100 },
      { id: "neon_carrot", weight: 800 },
      { id: "gas_canister", weight: 600 },
      { id: "ancient_receipt", weight: 300 },
    ],
  },
  {
    id: "animation_behavior",
    options: [
      { id: "gentle_gas_drift", weight: 3_200 },
      { id: "lens_shine", weight: 2_300 },
      { id: "aura_flow", weight: 1_800 },
      { id: "background_pulse", weight: 1_300 },
      { id: "sparkle_pop", weight: 900 },
      { id: "rainbow_orbit", weight: 400 },
      { id: "mythic_prism_bloom", weight: 100 },
    ],
  },
  {
    id: "gas_level",
    options: [
      { id: "level_1", weight: 2_400 },
      { id: "level_2", weight: 2_200 },
      { id: "level_3", weight: 1_900 },
      { id: "level_4", weight: 1_500 },
      { id: "level_5", weight: 1_000 },
      { id: "level_6", weight: 650 },
      { id: "level_7", weight: 250 },
      { id: "level_8", weight: 100 },
    ],
  },
] as const satisfies readonly DefaultSoulTraitCategory[];
export const SOUL_TRAIT_METADATA_ATTRIBUTE_TYPES = [
  { category: "character_archetype", traitType: "Character", key: "characterArchetype" },
  { category: "goggles_eyes", traitType: "Goggles/Eyes", key: "gogglesEyes" },
  { category: "expression", traitType: "Expression", key: "expression" },
  { category: "gas_aura_cloud", traitType: "Gas/Aura", key: "gasAuraCloud" },
  { category: "background", traitType: "Background", key: "background" },
  { category: "outfit", traitType: "Outfit", key: "outfit" },
  { category: "relic", traitType: "Relic", key: "relic" },
  { category: "animation_behavior", traitType: "Animation", key: "animationBehavior" },
  { category: "gas_level", traitType: "Gas Level", key: "gasLevel" },
] as const satisfies readonly {
  category: DefaultSoulTraitCategoryId;
  traitType: string;
  key: keyof DefaultSoulTraitSet;
}[];
export const MAX_USER_CORE_TRAIT_SELECTIONS = 3;
export const CORE_ART_TRAIT_CATEGORIES = [
  {
    id: "palette",
    styleKey: "trait_palette",
    options: [
      { id: "solana", weight: 2_500 },
      { id: "aurora", weight: 2_500 },
      { id: "ember", weight: 2_500 },
      { id: "mono", weight: 2_500 },
    ],
  },
  {
    id: "mood",
    styleKey: "trait_mood",
    options: [
      { id: "serene", weight: 2_500 },
      { id: "charged", weight: 2_500 },
      { id: "mystic", weight: 2_500 },
      { id: "radiant", weight: 2_500 },
    ],
  },
  {
    id: "form",
    styleKey: "trait_form",
    options: [
      { id: "spiral", weight: 2_500 },
      { id: "wave", weight: 2_500 },
      { id: "crystal", weight: 2_500 },
      { id: "orb", weight: 2_500 },
    ],
  },
  {
    id: "background",
    styleKey: "trait_background",
    options: [
      { id: "midnight", weight: 2_500 },
      { id: "nebula", weight: 2_500 },
      { id: "grid", weight: 2_500 },
      { id: "eclipse", weight: 2_500 },
    ],
  },
] as const satisfies readonly CoreArtTraitCategory[];
export const CLAIM_SOUL_OFFSET = 0;
export const CLAIM_CLAIMER_OFFSET = CLAIM_SOUL_OFFSET + 32;
export const CLAIM_NFT_MINT_OFFSET = CLAIM_CLAIMER_OFFSET + 32;
export const CLAIM_SEQUENCE_OFFSET = CLAIM_NFT_MINT_OFFSET + 32;
export const CLAIM_GENERATION_COUNT_OFFSET = CLAIM_SEQUENCE_OFFSET + 8;
export const CLAIM_ACCOUNT_SIZE = CLAIM_GENERATION_COUNT_OFFSET + 8;
export const RECEIPT_SOUL_OFFSET = 0;
export const RECEIPT_CLAIMANT_OFFSET = RECEIPT_SOUL_OFFSET + 32;
export const RECEIPT_TOKEN_MINT_OFFSET = RECEIPT_CLAIMANT_OFFSET + 32;
export const RECEIPT_NFT_MINT_OFFSET = RECEIPT_TOKEN_MINT_OFFSET + 32;
export const RECEIPT_SEQUENCE_OFFSET = RECEIPT_NFT_MINT_OFFSET + 32;
export const RECEIPT_GENERATION_COUNT_OFFSET = RECEIPT_SEQUENCE_OFFSET + 8;
export const RECEIPT_BOUND_QUANTITY_OFFSET = RECEIPT_GENERATION_COUNT_OFFSET + 8;
export const RECEIPT_BOUND_BOUNDARY_OFFSET = RECEIPT_BOUND_QUANTITY_OFFSET + 8;
export const RECEIPT_LIFECYCLE_STATE_OFFSET = RECEIPT_BOUND_BOUNDARY_OFFSET + 8;
export const RECEIPT_ACCOUNT_SIZE = RECEIPT_LIFECYCLE_STATE_OFFSET + 1;
export const RECEIPT_REGISTRY_CLAIMANT_OFFSET = 0;
export const RECEIPT_REGISTRY_TOKEN_MINT_OFFSET = RECEIPT_REGISTRY_CLAIMANT_OFFSET + 32;
export const RECEIPT_REGISTRY_ACTIVE_RECEIPTS_OFFSET = RECEIPT_REGISTRY_TOKEN_MINT_OFFSET + 32;
export const RECEIPT_REGISTRY_BURNED_RECEIPTS_OFFSET =
  RECEIPT_REGISTRY_ACTIVE_RECEIPTS_OFFSET + 8;
export const RECEIPT_REGISTRY_FORFEITED_RECEIPTS_OFFSET =
  RECEIPT_REGISTRY_BURNED_RECEIPTS_OFFSET + 8;
export const RECEIPT_REGISTRY_ACCOUNT_SIZE = RECEIPT_REGISTRY_FORFEITED_RECEIPTS_OFFSET + 8;
export const RECEIPT_LIFECYCLE_STATE = {
  Active: 1,
  Burned: 2,
  Forfeited: 3,
} as const;
export type ReceiptLifecycleState = "active" | "burned" | "forfeited";

export const CREATE_TOKEN_DISCRIMINATOR = 0;
export const BUY_DISCRIMINATOR = 1;
export const SELL_DISCRIMINATOR = 2;
// Legacy discriminators (migration removed; program rejects 3)
export const MIGRATE_DISCRIMINATOR = 3;
export const RELEASE_LP_DISCRIMINATOR = 4;
export const UNSUPPORTED_MIGRATION_ERROR =
  "Bonding-curve migration/LP release instructions are unsupported; SolSoul curves run forever with no AMM migration.";
// Current discriminators (must match program)
export const INITIALIZE_GLOBAL_CONFIG_DISCRIMINATOR = 4;
export const PAUSE_DISCRIMINATOR = 5;
export const UNPAUSE_DISCRIMINATOR = 6;
export const RENOUNCE_ADMIN_DISCRIMINATOR = 7;
export const WITHDRAW_TREASURY_DISCRIMINATOR = 8;
export const INITIALIZE_SOUL_DISCRIMINATOR = 0;
export const GENERATE_SOUL_DISCRIMINATOR = 1;
export const UPLOAD_TEMPLATE_DISCRIMINATOR = 2;
export const CLAIM_SOUL_DISCRIMINATOR = 3;
export const SOUL_PAUSE_DISCRIMINATOR = 4;
export const SOUL_UNPAUSE_DISCRIMINATOR = 5;
export const RECEIPT_LIFECYCLE_DISCRIMINATOR = 6;
export const SETTLE_RECEIPTS_DISCRIMINATOR = 7;
export const CLAIM_SOUL_COMPUTE_UNIT_LIMIT = 700_000;

export type ProgramName = keyof typeof PROGRAM_IDS;
export type PublicKeyLike = PublicKey | PublicKeyInitData;
export type AmountLike = bigint | number | string;

export interface ProgramIdOverrides {
  soulGenerator?: PublicKeyLike;
  bondingCurve?: PublicKeyLike;
  transferHook?: PublicKeyLike;
}

export type TransferHookDetection =
  | {
      status: "hookEnabled";
      mint: PublicKey;
      decimals: number;
      transferHookProgramId: PublicKey;
      validationAccount: PublicKey;
    }
  | {
      status: "token2022WithoutHook";
      mint: PublicKey;
      decimals: number;
      expectedProgramId: PublicKey;
    }
  | {
      status: "legacySplToken";
      mint: PublicKey;
      owner: PublicKey;
      expectedProgramId: PublicKey;
    }
  | {
      status: "unsupportedHookProgram";
      mint: PublicKey;
      decimals: number;
      configuredProgramId: PublicKey;
      expectedProgramId: PublicKey;
      validationAccount: PublicKey;
    };

export interface DetectTransferHookExtensionParams {
  connection: Connection;
  mint: PublicKeyLike;
  transferHookProgramId?: PublicKeyLike;
  commitment?: Commitment;
  programIds?: ProgramIdOverrides;
}

export interface HookAwareTransferCheckedIxParams extends DetectTransferHookExtensionParams {
  source: PublicKeyLike;
  destination: PublicKeyLike;
  authority: PublicKeyLike;
  amount: AmountLike;
  decimals?: number;
  multiSigners?: (Signer | PublicKey)[];
  tokenProgramId?: PublicKeyLike;
}

export interface HookAwareTransferCheckedResolution {
  instruction: TransactionInstruction;
  mint: PublicKey;
  source: PublicKey;
  destination: PublicKey;
  authority: PublicKey;
  sourceOwner: PublicKey;
  transferHookProgramId: PublicKey;
  validationAccount: PublicKey;
  receiptRegistry: PublicKey;
  resolvedHookMetas: AccountMeta[];
}

export interface PreflightHookAwareTransferCheckedParams
  extends HookAwareTransferCheckedIxParams {
  feePayer?: PublicKeyLike;
  preInstructions?: TransactionInstruction[];
}

export interface HookAwareTransferPreflightResult
  extends HookAwareTransferCheckedResolution {
  simulation: Awaited<ReturnType<Connection["simulateTransaction"]>>;
}

const TRANSFER_HOOK_CUSTOM_ERROR_NAMES: Record<number, string> = {
  7000: "MissingValidationAccount",
  7001: "InvalidValidationAccount",
  7002: "MissingBindingAccount",
  7003: "InvalidReceiptBinding",
  7004: "BoundaryBreakRejected",
  7005: "ArithmeticOverflow",
  7006: "InvalidTransferHookConfig",
  7007: "UnauthorizedAuthority",
};

export interface TransferCheckedWithHookWalletParams
  extends PreflightHookAwareTransferCheckedParams {
  payer: PublicKeyLike;
  sendTransaction: (
    transaction: Transaction,
    connection: Connection,
    options?: { signers?: Signer[] },
  ) => Promise<string>;
  confirmOptions?: ConfirmOptions;
  preflight?: boolean;
}

export interface DerivedLaunchAddresses {
  mint: PublicKey;
  curve: PublicKey;
  vault: PublicKey;
  soul: PublicKey;
}

export interface CreateTokenIxParams {
  mint: PublicKeyLike;
  payer: PublicKeyLike;
  curve?: PublicKeyLike;
  vault?: PublicKeyLike;
  treasury?: PublicKeyLike;
  globalConfig?: PublicKeyLike;
  programIds?: ProgramIdOverrides;
}

export interface BuyIxParams {
  mint: PublicKeyLike;
  buyer: PublicKeyLike;
  buyerTokenAccount: PublicKeyLike;
  solIn: AmountLike;
  minAmountOut: AmountLike;
  curve?: PublicKeyLike;
  vault?: PublicKeyLike;
  soul?: PublicKeyLike;
  soulConfigPda?: PublicKeyLike;
  globalConfig?: PublicKeyLike;
  programIds?: ProgramIdOverrides;
}

export interface SellIxParams {
  mint: PublicKeyLike;
  seller: PublicKeyLike;
  sellerTokenAccount: PublicKeyLike;
  tokenIn: AmountLike;
  minAmountOut: AmountLike;
  curve?: PublicKeyLike;
  vault?: PublicKeyLike;
  soul?: PublicKeyLike;
  soulConfigPda?: PublicKeyLike;
  globalConfig?: PublicKeyLike;
  hardBindingAccounts?: TransactionInstruction["keys"];
  programIds?: ProgramIdOverrides;
}

export interface MigrateIxParams {
  mint: PublicKeyLike;
  migrationTarget: PublicKeyLike;
  migrationTokenAccount?: PublicKeyLike;
  curve?: PublicKeyLike;
  vault?: PublicKeyLike;
  remainingAccounts?: TransactionInstruction["keys"];
  raydiumAccounts?: RaydiumCpSwapRemainingAccountsInput;
  programIds?: ProgramIdOverrides;
}

export interface ReleaseLpIxParams {
  lbPair: PublicKeyLike;
  admin: PublicKeyLike;
  curve?: PublicKeyLike;
  lpLockPda?: PublicKeyLike;
  lpLockTokenAccount: PublicKeyLike;
  adminLpTokenAccount: PublicKeyLike;
  programIds?: ProgramIdOverrides;
}

export interface InitializeGlobalConfigIxParams {
  authority: PublicKeyLike;
  globalConfig?: PublicKeyLike;
  programData?: PublicKeyLike;
  programIds?: ProgramIdOverrides;
}

export interface PauseIxParams {
  authority: PublicKeyLike;
  globalConfig?: PublicKeyLike;
  programIds?: ProgramIdOverrides;
}

export interface UnpauseIxParams {
  authority: PublicKeyLike;
  globalConfig?: PublicKeyLike;
  programIds?: ProgramIdOverrides;
}

export interface RenounceAdminIxParams {
  authority: PublicKeyLike;
  globalConfig?: PublicKeyLike;
  programIds?: ProgramIdOverrides;
}

export interface WithdrawTreasuryIxParams {
  authority: PublicKeyLike;
  recipient: PublicKeyLike;
  amount?: AmountLike;
  treasury?: PublicKeyLike;
  globalConfig?: PublicKeyLike;
  programIds?: ProgramIdOverrides;
}

export interface RaydiumCpSwapPdas {
  ammConfig: PublicKey;
  authority: PublicKey;
  poolState: PublicKey;
  lpMint: PublicKey;
  token0Vault: PublicKey;
  token1Vault: PublicKey;
  observationState: PublicKey;
  token0Mint: PublicKey;
  token1Mint: PublicKey;
  nativeIsToken0: boolean;
}

export interface RaydiumAccountInfoLike {
  owner: PublicKey;
  data: Uint8Array;
  executable?: boolean;
  lamports?: number;
}

export interface RaydiumCpSwapVaultBalanceInput {
  memeMint: PublicKeyLike;
  poolStateAccount?: RaydiumAccountInfoLike | null;
  token0VaultAccount?: RaydiumAccountInfoLike | null;
  token1VaultAccount?: RaydiumAccountInfoLike | null;
  raydiumProgramId?: PublicKeyLike;
  slot?: number;
  commitment?: Commitment;
}

export interface RaydiumCpSwapVaultBalance {
  verified: boolean;
  warnings: RaydiumDustWarningCode[];
  raydiumProgramId: PublicKey;
  poolState: PublicKey;
  token0Vault: PublicKey;
  token1Vault: PublicKey;
  token0Mint: PublicKey;
  token1Mint: PublicKey;
  selectedVault: PublicKey | null;
  selectedVaultTokenProgram: PublicKey | null;
  activeLiquidityBaseUnits: bigint | null;
  nonSelectedVault: PublicKey | null;
  nonSelectedVaultTokenProgram: PublicKey | null;
  slot?: number;
  commitment?: Commitment;
}

export interface RaydiumCpSwapRemainingAccountsInput {
  creator: PublicKeyLike;
  memeMint?: PublicKeyLike;
  ammConfig?: PublicKeyLike;
  authority?: PublicKeyLike;
  poolState?: PublicKeyLike;
  token0Mint?: PublicKeyLike;
  token1Mint?: PublicKeyLike;
  lpMint?: PublicKeyLike;
  creatorToken0?: PublicKeyLike;
  creatorToken1?: PublicKeyLike;
  creatorLpToken?: PublicKeyLike;
  token0Vault?: PublicKeyLike;
  token1Vault?: PublicKeyLike;
  createPoolFee?: PublicKeyLike;
  observationState?: PublicKeyLike;
  splTokenProgram?: PublicKeyLike;
  token0Program?: PublicKeyLike;
  token1Program?: PublicKeyLike;
  associatedTokenProgram?: PublicKeyLike;
  systemProgram?: PublicKeyLike;
  rentSysvar?: PublicKeyLike;
  raydiumProgramId?: PublicKeyLike;
}

export interface InitializeSoulIxParams {
  mint: PublicKeyLike;
  authority: PublicKeyLike;
  createdAt: AmountLike;
  symbol?: string | Uint8Array;
  targetAmm?: TargetAmm;
  soul?: PublicKeyLike;
  programIds?: ProgramIdOverrides;
}

export interface GenerateSoulIxParams {
  mint: PublicKeyLike;
  payer: PublicKeyLike;
  swapAmount: AmountLike;
  isBuy: boolean;
  soul?: PublicKeyLike;
  configPda?: PublicKeyLike;
  programIds?: ProgramIdOverrides;
}

export interface GenerateSoulParams extends SendHelperParams {
  mint: PublicKeyLike;
  swapAmount: AmountLike;
  isBuy?: boolean;
  programIds?: ProgramIdOverrides;
}

export interface GenerateSoulWalletParams {
  connection: Connection;
  payer: PublicKeyLike;
  mint: PublicKeyLike;
  swapAmount: AmountLike;
  isBuy?: boolean;
  sendTransaction: (
    transaction: Transaction,
    connection: Connection,
    options?: { signers?: Signer[] },
  ) => Promise<string>;
  commitment?: Commitment;
  confirmOptions?: ConfirmOptions;
  programIds?: ProgramIdOverrides;
}

export interface UploadTemplateIxParams {
  mint: PublicKeyLike;
  authority: PublicKeyLike;
  template: string | Uint8Array;
  styleParams?: string | Uint8Array;
  soul?: PublicKeyLike;
  configPda?: PublicKeyLike;
  programIds?: ProgramIdOverrides;
}

export interface UploadTemplateParams extends SendHelperParams {
  mint: PublicKeyLike;
  template: string | Uint8Array;
  styleParams?: string | Uint8Array;
  programIds?: ProgramIdOverrides;
}

export interface UploadTemplateWalletParams {
  connection: Connection;
  payer: PublicKeyLike;
  mint: PublicKeyLike;
  template: string | Uint8Array;
  styleParams?: string | Uint8Array;
  sendTransaction: (
    transaction: Transaction,
    connection: Connection,
    options?: { signers?: Signer[] },
  ) => Promise<string>;
  commitment?: Commitment;
  confirmOptions?: ConfirmOptions;
  programIds?: ProgramIdOverrides;
}

export interface LaunchTokenWalletParams {
  connection: Connection;
  payer: PublicKeyLike;
  sendTransaction: (
    transaction: Transaction,
    connection: Connection,
    options?: { signers?: Signer[] },
  ) => Promise<string>;
  mint?: Signer;
  symbol?: string | Uint8Array;
  targetAmm?: TargetAmm;
  commitment?: Commitment;
  programIds?: ProgramIdOverrides;
  now?: () => number;
}

export interface LaunchTokenResult extends DerivedLaunchAddresses {
  signature: string;
  symbol: string;
  targetAmm: TargetAmm;
}

export interface ClaimSoulIxParams {
  mint: PublicKeyLike;
  claimer: PublicKeyLike;
  nftMint: PublicKeyLike;
  sequence: AmountLike;
  soul?: PublicKeyLike;
  claim?: PublicKeyLike;
  receipt?: PublicKeyLike;
  receiptRegistry?: PublicKeyLike;
  claimerMemeAta?: PublicKeyLike;
  nftTokenAccount?: PublicKeyLike;
  nftAuthority?: PublicKeyLike;
  configPda?: PublicKeyLike;
  programIds?: ProgramIdOverrides;
}

export interface ReceiptLifecycleIxParams {
  receipt: PublicKeyLike;
  receiptRegistry: PublicKeyLike;
  authority: PublicKeyLike;
  state: ReceiptLifecycleState;
  programIds?: ProgramIdOverrides;
}

export type ReceiptSettlementState = "burned" | "forfeited";

export interface SettleReceiptsIxParams {
  authority: PublicKeyLike;
  tokenAccount: PublicKeyLike;
  tokenMint?: PublicKeyLike;
  receiptRegistry?: PublicKeyLike;
  receipts: readonly PublicKeyLike[];
  state: ReceiptSettlementState;
  movementAmount: AmountLike;
  programIds?: ProgramIdOverrides;
}

export interface RequiredReceiptSettlement {
  preWholeUnits: bigint;
  postWholeUnits: bigint;
  crossedDown: bigint;
  activeReceiptCount: bigint;
  requiredCount: bigint;
  preBoundCapacity: bigint;
  postBoundCapacity: bigint;
}

export interface SettlementReceiptCandidate {
  receiptAccount: PublicKey;
  receipt: ReceiptAccount;
}

export interface ComputeRequiredReceiptSettlementParams {
  currentBalance: AmountLike;
  movementAmount: AmountLike;
  activeReceiptCount: AmountLike;
}

export interface SelectSettlementReceiptsParams
  extends ComputeRequiredReceiptSettlementParams {
  owner: PublicKeyLike;
  mint: PublicKeyLike;
  candidates: readonly SettlementReceiptCandidate[];
  programIds?: ProgramIdOverrides;
}

export interface SelectedReceiptSettlement extends RequiredReceiptSettlement {
  selectedReceipts: SettlementReceiptCandidate[];
}

export interface FetchSettlementReceiptCandidatesOptions {
  commitment?: Commitment;
  programIds?: ProgramIdOverrides;
}

export interface FetchReceiptRegistryOptions {
  commitment?: Commitment;
  programIds?: ProgramIdOverrides;
}

export interface BuildSettlementSellTransactionParams {
  settlement?: SettleReceiptsIxParams;
  sell: SellIxParams;
}

export interface BuildSettlementTransferTransactionParams {
  settlement?: SettleReceiptsIxParams;
  transferInstruction: TransactionInstruction;
  preInstructions?: readonly TransactionInstruction[];
}

export interface SendHelperParams {
  connection: Connection;
  payer: Signer;
  commitment?: Commitment;
  confirmOptions?: ConfirmOptions;
}

export interface CreateTokenParams extends SendHelperParams {
  mint: PublicKeyLike;
  treasury?: PublicKeyLike;
  programIds?: ProgramIdOverrides;
}

export interface BuyParams extends SendHelperParams {
  mint: PublicKeyLike;
  solIn: AmountLike;
  minAmountOut?: AmountLike;
  buyerTokenAccount?: PublicKeyLike;
  createBuyerTokenAccount?: boolean;
  programIds?: ProgramIdOverrides;
}

export interface BuyWalletParams {
  connection: Connection;
  payer: PublicKeyLike;
  mint: PublicKeyLike;
  sendTransaction: (
    transaction: Transaction,
    connection: Connection,
    options?: { signers?: Signer[] },
  ) => Promise<string>;
  solIn: AmountLike;
  minAmountOut?: AmountLike;
  buyerTokenAccount?: PublicKeyLike;
  createBuyerTokenAccount?: boolean;
  commitment?: Commitment;
  confirmOptions?: ConfirmOptions;
  programIds?: ProgramIdOverrides;
  includeGenerationProvenance?: false;
}

export interface BuyWalletProvenanceParams extends Omit<BuyWalletParams, "includeGenerationProvenance"> {
  includeGenerationProvenance: true;
  generationApiBaseUrl?: string;
  provenanceFetch?: FetchLike;
}

export interface BuyAndAutoClaimSoulWalletParams extends Omit<BuyWalletProvenanceParams, "includeGenerationProvenance"> {
  nftMint?: Signer;
  nftTokenAccount?: PublicKeyLike;
}

export interface BuyAndAutoClaimSoulResult extends TradeWithGenerationProvenanceResult {
  nftMint: PublicKey;
  nftTokenAccount: PublicKey;
}

export interface SellParams extends SendHelperParams {
  mint: PublicKeyLike;
  tokenIn: AmountLike;
  minAmountOut?: AmountLike;
  sellerTokenAccount?: PublicKeyLike;
  programIds?: ProgramIdOverrides;
}

export interface SellWalletParams {
  connection: Connection;
  payer: PublicKeyLike;
  mint: PublicKeyLike;
  sendTransaction: (
    transaction: Transaction,
    connection: Connection,
    options?: { signers?: Signer[] },
  ) => Promise<string>;
  tokenIn: AmountLike;
  minAmountOut?: AmountLike;
  sellerTokenAccount?: PublicKeyLike;
  commitment?: Commitment;
  confirmOptions?: ConfirmOptions;
  settlement?: SettleReceiptsIxParams;
  programIds?: ProgramIdOverrides;
  includeGenerationProvenance?: false;
}

export interface SellWalletProvenanceParams extends Omit<SellWalletParams, "includeGenerationProvenance"> {
  includeGenerationProvenance: true;
  generationApiBaseUrl?: string;
  provenanceFetch?: FetchLike;
}

export interface MigrateParams extends SendHelperParams {
  mint: PublicKeyLike;
  migrationTarget: PublicKeyLike;
  migrationTokenAccount?: PublicKeyLike;
  remainingAccounts?: TransactionInstruction["keys"];
  raydiumAccounts?: RaydiumCpSwapRemainingAccountsInput;
  programIds?: ProgramIdOverrides;
}

export interface ClaimSoulParams extends SendHelperParams {
  mint: PublicKeyLike;
  nftMint: Signer;
  claimerMemeAta?: PublicKeyLike;
  nftTokenAccount?: PublicKeyLike;
  createNftMintAccount?: boolean;
  createNftTokenAccount?: boolean;
  programIds?: ProgramIdOverrides;
}

export interface ClaimSoulWalletParams {
  connection: Connection;
  payer: PublicKeyLike;
  nftMint: Signer;
  mint: PublicKeyLike;
  sendTransaction: (
    transaction: Transaction,
    connection: Connection,
    options?: { signers?: Signer[] },
  ) => Promise<string>;
  claimerMemeAta?: PublicKeyLike;
  nftTokenAccount?: PublicKeyLike;
  createNftMintAccount?: boolean;
  createNftTokenAccount?: boolean;
  commitment?: Commitment;
  confirmOptions?: ConfirmOptions;
  programIds?: ProgramIdOverrides;
}

export interface SoulAccount {
  mint: PublicKey;
  authority: PublicKey;
  createdAt: bigint;
  generationCount: bigint;
  lastSvgLen: number;
  lastSvg: string;
  lastSvgBytes: Uint8Array;
  templateLen: number;
  baseSvgTemplate: string;
  baseSvgTemplateBytes: Uint8Array;
  styleParamsLen: number;
  styleParams: string;
  styleParamsBytes: Uint8Array;
  minClaimBalance: bigint;
  claimCount: bigint;
  memeSymbol: string;
  memeSymbolBytes: Uint8Array;
  memeSymbolLen: number;
  targetAmm: TargetAmm;
  provenanceGeneration: bigint;
  provenanceSide: SoulProvenanceSide;
  provenanceAmount: bigint;
  provenanceTokenAmount: bigint;
  provenanceTrader: PublicKey;
  provenanceTokenAccount: PublicKey;
  provenanceMint: PublicKey;
  provenanceSoul: PublicKey;
  provenanceSeedHash: Uint8Array;
  provenanceSeedHashHex: string;
  artTheme?: ResolvedSoulTheme;
  latestGenerationProvenance?: GenerationProvenance | null;
  historicalGenerationProvenance?: GenerationProvenance[];
}

export type SoulClaimEligibilityReason =
  | "noGeneratedSoul"
  | "alreadyClaimed"
  | "missingProvenance"
  | "sellGenerated"
  | "subWholeProvenance"
  | "walletMismatch"
  | "insufficientCurrentBalance";

export interface SoulClaimEligibility {
  claimable: boolean;
  reason: SoulClaimEligibilityReason | null;
  requiredBalance: bigint;
  currentBalance: bigint | null;
  targetGeneration: bigint;
  provenanceGeneration: bigint;
  provenanceSide: SoulProvenanceSide;
  provenanceTokenAmount: bigint;
  hasQualifyingProvenance: boolean;
}

export interface GetSoulClaimEligibilityParams {
  soul?: SoulAccount | null;
  wallet?: PublicKeyLike | null;
  walletTokenBalanceBaseUnits?: AmountLike | null;
}

export interface GenerationProvenance {
  generation: bigint;
  side: GenerationTradeSide;
  amount: bigint;
  trader: PublicKey;
  tokenAccount: PublicKey;
  tokenMint: PublicKey;
  soul: PublicKey;
  seedHash: string;
  signature?: string;
  slot?: number;
  blockTime?: number | null;
  explorerUrl?: string;
  source: "on-chain-soul-account" | "finalized-rpc-logs";
}

export interface TradeWithGenerationProvenanceResult {
  signature: string;
  generationProvenance: GenerationProvenance | null;
}

export type FetchLike = (
  input: string,
  init?: { headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export interface FetchGenerationProvenanceOptions {
  apiBaseUrl?: string;
  fetch?: FetchLike;
  mint?: PublicKeyLike;
  soul?: PublicKeyLike;
  generation?: number | bigint;
  limit?: number;
}

export interface BondingCurveAccount {
  mint: PublicKey;
  cumulativeSol: bigint;
  totalMinted: bigint;
  selfDeprecated: boolean;
  lastInteractionSlot: bigint;
}

export interface GlobalConfigAccount {
  authority: PublicKey;
  /** 0 = active, 1 = paused (emergency stop). */
  paused: number;
}

export interface SoulNftMetadata {
  name: string;
  symbol: string;
  uri: string;
  platform: "SolSoul";
  creator: string;
  launcher: string;
  associatedTokenMint: string;
  associatedTokenSymbol: string;
  artEngine: "SolSoul On-Chain Art Engine";
  artTheme: string;
  generation: string;
  attributes?: Array<{ trait_type: string; value: string }>;
  mintAccountSize: number;
  mintRentExemptionSize: number;
}

export interface ClaimAccount {
  soul: PublicKey;
  claimer: PublicKey;
  nftMint: PublicKey;
  sequence: bigint;
  generationCount: bigint;
}

export interface ReceiptAccount {
  soul: PublicKey;
  claimant: PublicKey;
  tokenMint: PublicKey;
  nftMint: PublicKey;
  sequence: bigint;
  generationCount: bigint;
  boundQuantity: bigint;
  boundBoundary: bigint;
  lifecycleState: ReceiptLifecycleState;
}

export interface ReceiptRegistryAccount {
  claimant: PublicKey;
  tokenMint: PublicKey;
  activeReceipts: bigint;
  burnedReceipts: bigint;
  forfeitedReceipts: bigint;
}

export interface ClaimedSoulNftMetadata {
  name: string;
  symbol: string;
  uri: string;
}

export interface ClaimedSoulNft extends ClaimAccount {
  claim: PublicKey;
  tokenMint: PublicKey | null;
  metadataAuthority: PublicKey;
  metadata: ClaimedSoulNftMetadata | null;
  soulAccount?: SoulAccount | null;
  receiptAccount?: PublicKey;
  receipt?: ReceiptAccount;
  receiptLifecycleState?: ReceiptLifecycleState;
}

export interface ClaimedSoulNftPage {
  items: ClaimedSoulNft[];
  page: number;
  pageSize: number;
  total: number;
  hasNextPage: boolean;
}

export interface LaunchedToken {
  curve: PublicKey;
  soul: PublicKey;
  mint: PublicKey;
  bondingCurve: BondingCurveAccount;
  soulAccount: SoulAccount | null;
  createdAt: bigint | null;
}

export interface LaunchedTokenPage {
  items: LaunchedToken[];
  page: number;
  pageSize: number;
  total: number;
  hasNextPage: boolean;
}

export interface ListClaimedSoulNftsByMintOptions {
  page?: number;
  pageSize?: number;
  commitment?: Commitment;
  fetchMetadata?: boolean;
  receiptLifecycle?: "active" | "all";
  programIds?: ProgramIdOverrides;
}

export type ListClaimedSoulNftsOptions = ListClaimedSoulNftsByMintOptions;
export type ListBondingCurveTokensOptions = Pick<
  ListClaimedSoulNftsByMintOptions,
  "page" | "pageSize" | "commitment" | "programIds"
>;
export type ListClaimedSoulNftsByNftMintsOptions = Pick<
  ListClaimedSoulNftsByMintOptions,
  "commitment" | "fetchMetadata" | "receiptLifecycle" | "programIds"
>;

export function getProgramId(program: ProgramName): string {
  return PROGRAM_IDS[program];
}

export function getProgramPublicKey(program: ProgramName): PublicKey {
  return new PublicKey(PROGRAM_IDS[program]);
}

export function deriveSoulPda(
  mint: PublicKeyLike,
  programId: PublicKeyLike = PROGRAM_IDS.soulGenerator,
): PublicKey {
  return createNoBumpPda(SOUL_SEED, mint, programId);
}

export function deriveClaimPda(
  soul: PublicKeyLike,
  sequence: AmountLike,
  programId: PublicKeyLike = PROGRAM_IDS.soulGenerator,
): PublicKey {
  return createLegacyOrCanonicalPdaFromSeeds(
    [Buffer.from(CLAIM_SEED), asPublicKey(soul).toBuffer(), u64Buffer(sequence)],
    programId,
  );
}

export function deriveReceiptPda(
  soul: PublicKeyLike,
  sequence: AmountLike,
  programId: PublicKeyLike = PROGRAM_IDS.soulGenerator,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(RECEIPT_SEED), asPublicKey(soul).toBuffer(), u64Buffer(sequence)],
    asPublicKey(programId),
  )[0];
}

export function deriveReceiptRegistryPda(
  claimant: PublicKeyLike,
  tokenMint: PublicKeyLike,
  programId: PublicKeyLike = PROGRAM_IDS.soulGenerator,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(RECEIPT_REGISTRY_SEED),
      asPublicKey(claimant).toBuffer(),
      asPublicKey(tokenMint).toBuffer(),
    ],
    asPublicKey(programId),
  )[0];
}

export async function detectTransferHookExtension(
  params: DetectTransferHookExtensionParams,
): Promise<TransferHookDetection> {
  const mint = asPublicKey(params.mint);
  const expectedProgramId = resolveTransferHookProgramId(params);
  const account = await params.connection.getAccountInfo(
    mint,
    params.commitment ?? "confirmed",
  );
  if (!account) {
    throw new Error(`Mint account not found: ${mint.toBase58()}`);
  }

  if (!account.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    return {
      status: "legacySplToken",
      mint,
      owner: account.owner,
      expectedProgramId,
    };
  }

  const mintInfo = unpackMint(mint, account, TOKEN_2022_PROGRAM_ID);
  const transferHook = getTransferHook(mintInfo);
  if (!transferHook) {
    return {
      status: "token2022WithoutHook",
      mint,
      decimals: mintInfo.decimals,
      expectedProgramId,
    };
  }

  const validationAccount = getExtraAccountMetaAddress(mint, transferHook.programId);
  if (!transferHook.programId.equals(expectedProgramId)) {
    return {
      status: "unsupportedHookProgram",
      mint,
      decimals: mintInfo.decimals,
      configuredProgramId: transferHook.programId,
      expectedProgramId,
      validationAccount,
    };
  }

  return {
    status: "hookEnabled",
    mint,
    decimals: mintInfo.decimals,
    transferHookProgramId: transferHook.programId,
    validationAccount,
  };
}

export async function buildHookAwareTransferCheckedIx(
  params: HookAwareTransferCheckedIxParams,
): Promise<HookAwareTransferCheckedResolution> {
  const mint = asPublicKey(params.mint);
  const source = asPublicKey(params.source);
  const destination = asPublicKey(params.destination);
  const authority = asPublicKey(params.authority);
  const tokenProgramId = asPublicKey(params.tokenProgramId ?? TOKEN_2022_PROGRAM_ID);
  if (!tokenProgramId.equals(TOKEN_2022_PROGRAM_ID)) {
    throw new Error("Hook-aware direct transfers require the Token-2022 program.");
  }

  const detection = await detectTransferHookExtension(params);
  if (detection.status !== "hookEnabled") {
    throw new Error(hookDetectionErrorMessage(detection));
  }

  const sourceAccount = await getAccount(
    params.connection,
    source,
    params.commitment ?? "confirmed",
    tokenProgramId,
  );
  if (!sourceAccount.mint.equals(mint)) {
    throw new Error(
      `Source token account mint mismatch: expected ${mint.toBase58()}, got ${sourceAccount.mint.toBase58()}`,
    );
  }
  const sourceOwner = sourceAccount.owner;
  const programIds = resolveProgramIds(params.programIds);
  const expectedRegistry = deriveReceiptRegistryPda(
    sourceOwner,
    mint,
    programIds.soulGenerator,
  );
  const validationAccountInfo = await params.connection.getAccountInfo(
    detection.validationAccount,
    params.commitment ?? "confirmed",
  );
  if (!validationAccountInfo) {
    throw new Error(
      `Transfer Hook validation account is missing: ${detection.validationAccount.toBase58()}`,
    );
  }
  if (!validationAccountInfo.owner.equals(detection.transferHookProgramId)) {
    throw new Error(
      `Transfer Hook validation account owner mismatch: expected ${detection.transferHookProgramId.toBase58()}, got ${validationAccountInfo.owner.toBase58()}`,
    );
  }

  let extraMetas;
  try {
    extraMetas = getExtraAccountMetas(validationAccountInfo);
  } catch (error) {
    throw new Error(
      `Transfer Hook validation account has malformed extra-account metas: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const amount = toU64(params.amount);
  if (amount > sourceAccount.amount) {
    throw new Error(
      `Hook-aware transfer amount exceeds source token account balance: amount ${amount.toString()} > balance ${sourceAccount.amount.toString()}`,
    );
  }
  const decimals = params.decimals ?? detection.decimals;
  const instruction = createTransferCheckedInstruction(
    source,
    mint,
    destination,
    authority,
    amount,
    decimals,
    params.multiSigners ?? [],
    tokenProgramId,
  );
  const executeInstruction = createExecuteInstruction(
    detection.transferHookProgramId,
    source,
    mint,
    destination,
    authority,
    detection.validationAccount,
    amount,
  );
  const resolvedHookMetas: AccountMeta[] = [];
  for (const extraMeta of extraMetas) {
    const resolved = await resolveExtraAccountMeta(
      params.connection,
      extraMeta,
      executeInstruction.keys,
      executeInstruction.data,
      executeInstruction.programId,
    );
    const deEscalated = deEscalateResolvedMeta(resolved, executeInstruction.keys);
    executeInstruction.keys.push(deEscalated);
    resolvedHookMetas.push(deEscalated);
  }

  if (!resolvedHookMetas.some((meta) => meta.pubkey.equals(programIds.soulGenerator))) {
    throw new Error(
      `Transfer Hook extra-account metas are missing the SolSoul receipt program ${programIds.soulGenerator.toBase58()}`,
    );
  }
  if (!resolvedHookMetas.some((meta) => meta.pubkey.equals(expectedRegistry))) {
    throw new Error(
      `Transfer Hook extra-account metas are missing source-owner receipt registry meta ${expectedRegistry.toBase58()}`,
    );
  }
  assertNoDuplicateHookMetas(resolvedHookMetas);
  if (crossesWholeTokenBoundary(sourceAccount.amount, amount)) {
    await validateBoundaryReceiptRegistryForHookTransfer({
      connection: params.connection,
      commitment: params.commitment ?? "confirmed",
      expectedRegistry,
      sourceOwner,
      mint,
      soulGenerator: asPublicKey(programIds.soulGenerator),
    });
  }

  instruction.keys.push(...executeInstruction.keys.slice(5));
  instruction.keys.push({
    pubkey: detection.transferHookProgramId,
    isSigner: false,
    isWritable: false,
  });
  instruction.keys.push({
    pubkey: detection.validationAccount,
    isSigner: false,
    isWritable: false,
  });

  return {
    instruction,
    mint,
    source,
    destination,
    authority,
    sourceOwner,
    transferHookProgramId: detection.transferHookProgramId,
    validationAccount: detection.validationAccount,
    receiptRegistry: expectedRegistry,
    resolvedHookMetas,
  };
}

function crossesWholeTokenBoundary(preBalance: bigint, amount: bigint): boolean {
  const postBalance = preBalance - amount;
  return preBalance / MIN_CLAIM_BALANCE > postBalance / MIN_CLAIM_BALANCE;
}

async function validateBoundaryReceiptRegistryForHookTransfer(params: {
  connection: Connection;
  commitment: Commitment;
  expectedRegistry: PublicKey;
  sourceOwner: PublicKey;
  mint: PublicKey;
  soulGenerator: PublicKey;
}): Promise<void> {
  let account;
  try {
    account = await params.connection.getAccountInfo(
      params.expectedRegistry,
      params.commitment,
    );
  } catch (error) {
    throw new Error(
      `Transfer Hook failed to resolve receipt registry account ${params.expectedRegistry.toBase58()}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!account) {
    throw new Error(
      `Transfer Hook receipt registry account is missing: ${params.expectedRegistry.toBase58()}`,
    );
  }
  if (!account.owner.equals(params.soulGenerator)) {
    throw new Error(
      `Transfer Hook receipt registry owner mismatch: expected ${params.soulGenerator.toBase58()}, got ${account.owner.toBase58()}`,
    );
  }

  let registry: ReceiptRegistryAccount;
  try {
    registry = decodeReceiptRegistryAccount(account.data);
  } catch (error) {
    throw new Error(
      `Transfer Hook malformed receipt registry account ${params.expectedRegistry.toBase58()}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!registry.claimant.equals(params.sourceOwner)) {
    throw new Error(
      `Transfer Hook receipt registry claimant mismatch: expected ${params.sourceOwner.toBase58()}, got ${registry.claimant.toBase58()}`,
    );
  }
  if (!registry.tokenMint.equals(params.mint)) {
    throw new Error(
      `Transfer Hook receipt registry mint mismatch: expected ${params.mint.toBase58()}, got ${registry.tokenMint.toBase58()}`,
    );
  }
}

export async function preflightHookAwareTransferChecked(
  params: PreflightHookAwareTransferCheckedParams,
): Promise<HookAwareTransferPreflightResult> {
  const resolution = await buildHookAwareTransferCheckedIx(params);
  const transaction = new Transaction().add(
    ...(params.preInstructions ?? []),
    resolution.instruction,
  );
  transaction.feePayer = asPublicKey(params.feePayer ?? params.authority);
  const latestBlockhash = await params.connection.getLatestBlockhash(
    params.commitment ?? "confirmed",
  );
  transaction.recentBlockhash = latestBlockhash.blockhash;
  const simulation = await params.connection.simulateTransaction(transaction, [], false);
  if (simulation.value.err) {
    throw new Error(formatHookAwareTransferPreflightError(simulation.value));
  }
  return {
    ...resolution,
    simulation,
  };
}

export async function transferCheckedWithHook(
  params: TransferCheckedWithHookWalletParams,
): Promise<string> {
  const payer = asPublicKey(params.payer);
  const commitment = params.commitment ?? "finalized";
  const resolution =
    params.preflight === false
      ? await buildHookAwareTransferCheckedIx(params)
      : await preflightHookAwareTransferChecked({ ...params, feePayer: payer });
  const tx = new Transaction();
  for (const instruction of params.preInstructions ?? []) {
    tx.add(instruction);
  }
  tx.add(resolution.instruction);
  const latestBlockhash = await params.connection.getLatestBlockhash(commitment);
  tx.feePayer = payer;
  tx.recentBlockhash = latestBlockhash.blockhash;
  const signature = await params.sendTransaction(tx, params.connection);
  const confirmation = await params.connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    commitment,
  );
  if (confirmation.value.err) {
    throw new Error(
      `Hook-aware transfer transaction failed: ${JSON.stringify(confirmation.value.err)}`,
    );
  }
  return signature;
}

function formatHookAwareTransferPreflightError(
  simulationValue: Awaited<ReturnType<Connection["simulateTransaction"]>>["value"],
): string {
  const errJson = JSON.stringify(simulationValue.err);
  const lines = [`Hook-aware transfer preflight failed: ${errJson}`];
  const customErrorContext = formatTransferHookCustomErrorContext(simulationValue);
  if (customErrorContext) {
    lines.push(customErrorContext);
  }
  if (simulationValue.logs?.length) {
    lines.push("Simulation logs:", ...simulationValue.logs);
  }
  return lines.join("\n");
}

function formatTransferHookCustomErrorContext(
  simulationValue: Awaited<ReturnType<Connection["simulateTransaction"]>>["value"],
): string | null {
  const codes = new Set<number>();
  collectCustomErrorCodes(simulationValue.err, codes);
  for (const log of simulationValue.logs ?? []) {
    collectCustomErrorCodes(log, codes);
  }
  const knownCodes = [...codes]
    .filter((code) => TRANSFER_HOOK_CUSTOM_ERROR_NAMES[code])
    .sort((left, right) => left - right);
  if (knownCodes.length === 0) {
    return null;
  }
  const names = knownCodes
    .map((code) => `${TRANSFER_HOOK_CUSTOM_ERROR_NAMES[code]} (custom ${code})`)
    .join(", ");
  return `Transfer Hook error context: ${names}`;
}

function collectCustomErrorCodes(value: unknown, codes: Set<number>): void {
  if (typeof value === "string") {
    for (const match of value.matchAll(/custom program error:\s*0x([0-9a-f]+)/gi)) {
      codes.add(Number.parseInt(match[1]!, 16));
    }
    for (const match of value.matchAll(/"?Custom"?\s*[:=]\s*(\d+)/gi)) {
      codes.add(Number.parseInt(match[1]!, 10));
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectCustomErrorCodes(entry, codes);
    }
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key === "Custom" && typeof entry === "number") {
      codes.add(entry);
      continue;
    }
    collectCustomErrorCodes(entry, codes);
  }
}

export function deriveNftAuthorityPda(
  soul: PublicKeyLike,
  sequence: AmountLike,
  programId: PublicKeyLike = PROGRAM_IDS.soulGenerator,
): PublicKey {
  return createLegacyOrCanonicalPdaFromSeeds(
    [
      Buffer.from(NFT_AUTHORITY_SEED),
      asPublicKey(soul).toBuffer(),
      u64Buffer(sequence),
    ],
    programId,
  );
}

export function deriveCurvePda(
  mint: PublicKeyLike,
  programId: PublicKeyLike = PROGRAM_IDS.bondingCurve,
): PublicKey {
  return createNoBumpPda(CURVE_SEED, mint, programId);
}

export function deriveVaultPda(
  mint: PublicKeyLike,
  programId: PublicKeyLike = PROGRAM_IDS.bondingCurve,
): PublicKey {
  return createNoBumpPda(VAULT_SEED, mint, programId);
}

export function deriveTreasuryPda(
  programId: PublicKeyLike = PROGRAM_IDS.bondingCurve,
): PublicKey {
  return createNoBumpPdaFromSeeds([Buffer.from(TREASURY_SEED)], programId);
}

export function deriveGlobalConfigPda(
  programId: PublicKeyLike = PROGRAM_IDS.bondingCurve,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(GLOBAL_CONFIG_SEED)],
    asPublicKey(programId),
  )[0];
}

export function deriveProgramDataPda(programId: PublicKeyLike): PublicKey {
  return PublicKey.findProgramAddressSync(
    [asPublicKey(programId).toBuffer()],
    BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
  )[0];
}

/** Derive the program config PDA (seed "global_config") for the given program, used by soul-generator admin control. */
export function deriveSoulConfigPda(programId: PublicKeyLike): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("global_config")],
    asPublicKey(programId),
  )[0];
}


export function deriveLpLockPda(
  lbPair: PublicKeyLike,
  programId: PublicKeyLike = PROGRAM_IDS.bondingCurve,
): PublicKey {
  const [lpLockPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(LP_LOCK_SEED), asPublicKey(lbPair).toBuffer()],
    asPublicKey(programId),
  );
  return lpLockPda;
}

export function findMintWithNoBumpPdas(
  programIds: ProgramIdOverrides = {},
): DerivedLaunchAddresses {
  const bondingProgramId = asPublicKey(
    programIds.bondingCurve ?? PROGRAM_IDS.bondingCurve,
  );
  const soulProgramId = asPublicKey(
    programIds.soulGenerator ?? PROGRAM_IDS.soulGenerator,
  );

  for (let byte = 1; byte <= 255; byte += 1) {
    const mint = new PublicKey(new Uint8Array(32).fill(byte));
    try {
      return {
        mint,
        curve: deriveCurvePda(mint, bondingProgramId),
        vault: deriveVaultPda(mint, bondingProgramId),
        soul: deriveSoulPda(mint, soulProgramId),
      };
    } catch {
      // On-chain programs intentionally use no-bump create_program_address.
      // Keep scanning deterministic fixture mints until all three are off-curve.
    }
  }

  throw new Error("Unable to find a deterministic mint with no-bump PDAs");
}

export function findFreshLaunchKeypair(
  programIds: ProgramIdOverrides = {},
): { mint: Keypair; curve: PublicKey; vault: PublicKey; soul: PublicKey } {
  const resolvedProgramIds = resolveProgramIds(programIds);

  for (let attempt = 0; attempt < 20_000; attempt += 1) {
    const mint = Keypair.generate();
    try {
      return {
        mint,
        curve: deriveCurvePda(mint.publicKey, resolvedProgramIds.bondingCurve),
        vault: deriveVaultPda(mint.publicKey, resolvedProgramIds.bondingCurve),
        soul: deriveSoulPda(mint.publicKey, resolvedProgramIds.soulGenerator),
      };
    } catch {
      // On-chain programs intentionally use no-bump create_program_address.
      // Keep sampling random mints until all launch PDAs are off-curve.
    }
  }

  throw new Error("Unable to find a fresh launch mint with no-bump PDAs");
}

export function getSoulClaimEligibility(
  params: GetSoulClaimEligibilityParams,
): SoulClaimEligibility {
  const requiredBalance = resolveMtClaimQuantum(params.soul?.minClaimBalance);
  const currentBalance =
    params.walletTokenBalanceBaseUnits === undefined ||
    params.walletTokenBalanceBaseUnits === null
      ? null
      : toU64(params.walletTokenBalanceBaseUnits);
  const targetGeneration = params.soul?.generationCount ?? 0n;
  const base = {
    requiredBalance,
    currentBalance,
    targetGeneration,
    provenanceGeneration: params.soul?.provenanceGeneration ?? 0n,
    provenanceSide: params.soul?.provenanceSide ?? SOUL_PROVENANCE_SIDE.None,
    provenanceTokenAmount: params.soul?.provenanceTokenAmount ?? 0n,
  };

  function result(
    claimable: boolean,
    reason: SoulClaimEligibilityReason | null,
    hasQualifyingProvenance: boolean,
  ): SoulClaimEligibility {
    return {
      claimable,
      reason,
      hasQualifyingProvenance,
      ...base,
    };
  }

  const soul = params.soul;
  if (!soul || soul.generationCount === 0n || soul.lastSvgLen === 0) {
    return result(false, "noGeneratedSoul", false);
  }

  if (soul.claimCount >= soul.generationCount) {
    return result(false, "alreadyClaimed", false);
  }

  if (
    soul.provenanceSide === SOUL_PROVENANCE_SIDE.None ||
    soul.provenanceGeneration === 0n ||
    soul.provenanceGeneration !== soul.generationCount
  ) {
    return result(false, "missingProvenance", false);
  }

  if (soul.provenanceSide === SOUL_PROVENANCE_SIDE.Sell) {
    return result(false, "sellGenerated", false);
  }

  if (soul.provenanceSide !== SOUL_PROVENANCE_SIDE.Buy) {
    return result(false, "missingProvenance", false);
  }

  if (soul.provenanceTokenAmount < requiredBalance) {
    return result(false, "subWholeProvenance", false);
  }

  if (params.wallet) {
    const wallet = asPublicKey(params.wallet);
    if (!soul.provenanceTrader.equals(wallet)) {
      return result(false, "walletMismatch", true);
    }
  }

  if (currentBalance !== null && currentBalance < requiredBalance) {
    return result(false, "insufficientCurrentBalance", true);
  }

  return result(true, null, true);
}

export function resolveMtClaimQuantum(candidate?: bigint | null): bigint {
  if (candidate && candidate > MIN_CLAIM_BALANCE) {
    return candidate;
  }

  return MIN_CLAIM_BALANCE;
}

export async function launchTokenWithWallet(
  params: LaunchTokenWalletParams,
): Promise<LaunchTokenResult> {
  const programIds = resolveProgramIds(params.programIds);
  const payer = asPublicKey(params.payer);
  const targetAmm = assertActiveTargetAmm(
    params.targetAmm ?? TARGET_AMM.Raydium,
    "launchToken",
  );
  const symbol =
    typeof params.symbol === "string"
      ? params.symbol
      : params.symbol
        ? new TextDecoder().decode(params.symbol)
        : "";
  const launch = params.mint
    ? {
        mint: params.mint,
        curve: deriveCurvePda(params.mint.publicKey, programIds.bondingCurve),
        vault: deriveVaultPda(params.mint.publicKey, programIds.bondingCurve),
        soul: deriveSoulPda(params.mint.publicKey, programIds.soulGenerator),
      }
    : findFreshLaunchKeypair(programIds);
  const createdAt = BigInt(
    Math.floor((params.now?.() ?? Date.now()) / 1_000),
  );
  const mintLamports = await params.connection.getMinimumBalanceForRentExemption(
    LAUNCHED_TOKEN_MINT_ACCOUNT_SIZE,
    params.commitment,
  );
  const latestBlockhash = await params.connection.getLatestBlockhash(
    params.commitment,
  );
  const transaction = new Transaction({
    feePayer: payer,
    recentBlockhash: latestBlockhash.blockhash,
  }).add(
    SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: launch.mint.publicKey,
      lamports: mintLamports,
      space: LAUNCHED_TOKEN_MINT_ACCOUNT_SIZE,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeTransferHookInstruction(
      launch.mint.publicKey,
      launch.curve,
      programIds.transferHook,
      TOKEN_2022_PROGRAM_ID,
    ),
    initializeSoulIx({
      mint: launch.mint.publicKey,
      authority: payer,
      createdAt,
      symbol: params.symbol,
      targetAmm,
      soul: launch.soul,
      programIds,
    }),
    createTokenIx({
      mint: launch.mint.publicKey,
      payer,
      curve: launch.curve,
      vault: launch.vault,
      programIds,
    }),
  );

  const commitment = params.commitment ?? "finalized";
  const signature = await params.sendTransaction(transaction, params.connection, {
    signers: [launch.mint],
  });
  const confirmation = await params.connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    commitment,
  );
  if (confirmation.value.err) {
    throw new Error(
      `Launch transaction failed: ${JSON.stringify(confirmation.value.err)}`,
    );
  }

  return {
    signature,
    mint: launch.mint.publicKey,
    curve: launch.curve,
    vault: launch.vault,
    soul: launch.soul,
    symbol,
    targetAmm,
  };
}

export function createTokenIx(params: CreateTokenIxParams): TransactionInstruction {
  const programIds = resolveProgramIds(params.programIds);
  const mint = asPublicKey(params.mint);
  const payer = asPublicKey(params.payer);
  const curve = asPublicKey(params.curve ?? deriveCurvePda(mint, programIds.bondingCurve));
  const vault = asPublicKey(params.vault ?? deriveVaultPda(mint, programIds.bondingCurve));
  const treasury = asPublicKey(
    params.treasury ?? deriveTreasuryPda(programIds.bondingCurve),
  );
  const globalConfig = asPublicKey(
    params.globalConfig ?? deriveGlobalConfigPda(programIds.bondingCurve),
  );
  return new TransactionInstruction({
    programId: programIds.bondingCurve,
    keys: [
      { pubkey: curve, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: treasury, isSigner: false, isWritable: true },
      { pubkey: globalConfig, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([CREATE_TOKEN_DISCRIMINATOR]),
  });
}

export function deriveRaydiumCpSwapPdas(
  memeMint: PublicKeyLike,
  raydiumProgramId: PublicKeyLike = RAYDIUM_CP_SWAP_DEVNET_PROGRAM_ID,
): RaydiumCpSwapPdas {
  const programId = asPublicKey(raydiumProgramId);
  const meme = asPublicKey(memeMint);
  const nativeIsToken0 = Buffer.compare(NATIVE_MINT.toBuffer(), meme.toBuffer()) < 0;
  const token0Mint = nativeIsToken0 ? NATIVE_MINT : meme;
  const token1Mint = nativeIsToken0 ? meme : NATIVE_MINT;
  const configIndex = Buffer.alloc(2);
  configIndex.writeUInt16BE(RAYDIUM_AMM_CONFIG_INDEX, 0);
  const [ammConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("amm_config"), configIndex],
    programId,
  );
  const [authority] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_and_lp_mint_auth_seed")],
    programId,
  );
  const [poolState] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("pool"),
      ammConfig.toBuffer(),
      token0Mint.toBuffer(),
      token1Mint.toBuffer(),
    ],
    programId,
  );
  const [lpMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool_lp_mint"), poolState.toBuffer()],
    programId,
  );
  const [token0Vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool_vault"), poolState.toBuffer(), token0Mint.toBuffer()],
    programId,
  );
  const [token1Vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool_vault"), poolState.toBuffer(), token1Mint.toBuffer()],
    programId,
  );
  const [observationState] = PublicKey.findProgramAddressSync(
    [Buffer.from("observation"), poolState.toBuffer()],
    programId,
  );

  return {
    ammConfig,
    authority,
    poolState,
    lpMint,
    token0Vault,
    token1Vault,
    observationState,
    token0Mint,
    token1Mint,
    nativeIsToken0,
  };
}

export function resolveRaydiumCpSwapVaultBalance(
  params: RaydiumCpSwapVaultBalanceInput,
): RaydiumCpSwapVaultBalance {
  const memeMint = asPublicKey(params.memeMint);
  const raydiumProgramId = asPublicKey(
    params.raydiumProgramId ?? RAYDIUM_CP_SWAP_DEVNET_PROGRAM_ID,
  );
  const pdas = deriveRaydiumCpSwapPdas(memeMint, raydiumProgramId);
  const warnings = new Set<RaydiumDustWarningCode>();

  if (!params.poolStateAccount) {
    warnings.add(RAYDIUM_DUST_WARNING_CODES.PoolMissing);
  } else if (!params.poolStateAccount.owner.equals(raydiumProgramId)) {
    warnings.add(RAYDIUM_DUST_WARNING_CODES.PoolOwnerMismatch);
  }

  const token0 = decodeRaydiumVaultAccount(
    params.token0VaultAccount ?? null,
    pdas.token0Mint,
    warnings,
  );
  const token1 = decodeRaydiumVaultAccount(
    params.token1VaultAccount ?? null,
    pdas.token1Mint,
    warnings,
  );
  const selected =
    token0?.mint.equals(memeMint) === true
      ? { address: pdas.token0Vault, decoded: token0, otherAddress: pdas.token1Vault, other: token1 }
      : token1?.mint.equals(memeMint) === true
        ? { address: pdas.token1Vault, decoded: token1, otherAddress: pdas.token0Vault, other: token0 }
        : null;

  if (!selected) {
    warnings.add(RAYDIUM_DUST_WARNING_CODES.VaultUnverified);
  }

  return {
    verified: warnings.size === 0 && selected !== null,
    warnings: Array.from(warnings).sort(),
    raydiumProgramId,
    poolState: pdas.poolState,
    token0Vault: pdas.token0Vault,
    token1Vault: pdas.token1Vault,
    token0Mint: pdas.token0Mint,
    token1Mint: pdas.token1Mint,
    selectedVault: selected?.address ?? null,
    selectedVaultTokenProgram: selected?.decoded.owner ?? null,
    activeLiquidityBaseUnits: selected?.decoded.amount ?? null,
    nonSelectedVault: selected?.otherAddress ?? null,
    nonSelectedVaultTokenProgram: selected?.other?.owner ?? null,
    ...(params.slot !== undefined ? { slot: params.slot } : {}),
    ...(params.commitment ? { commitment: params.commitment } : {}),
  };
}

function decodeRaydiumVaultAccount(
  account: RaydiumAccountInfoLike | null,
  expectedMint: PublicKey,
  warnings: Set<RaydiumDustWarningCode>,
): { mint: PublicKey; amount: bigint; owner: PublicKey } | null {
  if (!account) {
    warnings.add(RAYDIUM_DUST_WARNING_CODES.VaultMissing);
    return null;
  }
  if (
    !account.owner.equals(TOKEN_PROGRAM_ID) &&
    !account.owner.equals(TOKEN_2022_PROGRAM_ID)
  ) {
    warnings.add(RAYDIUM_DUST_WARNING_CODES.VaultOwnerMismatch);
    warnings.add(RAYDIUM_DUST_WARNING_CODES.VaultUnsupportedTokenProgram);
    return null;
  }
  if (account.data.byteLength < ACCOUNT_SIZE) {
    warnings.add(RAYDIUM_DUST_WARNING_CODES.VaultUnsupportedTokenProgram);
    return null;
  }

  const decoded = AccountLayout.decode(account.data);
  const mint = new PublicKey(decoded.mint);
  if (!mint.equals(expectedMint)) {
    warnings.add(RAYDIUM_DUST_WARNING_CODES.VaultMintMismatch);
  }

  return {
    mint,
    amount: decoded.amount,
    owner: account.owner,
  };
}

export function raydiumCpSwapRemainingAccounts(
  params: RaydiumCpSwapRemainingAccountsInput,
): TransactionInstruction["keys"] {
  const creator = asPublicKey(params.creator);
  const memeMintSource = params.memeMint ?? params.token0Mint ?? params.token1Mint;
  if (!memeMintSource) {
    throw new Error("raydiumCpSwapRemainingAccounts requires memeMint");
  }
  const memeMint = asPublicKey(memeMintSource);
  const raydiumProgramId = asPublicKey(
    params.raydiumProgramId ?? RAYDIUM_CP_SWAP_DEVNET_PROGRAM_ID,
  );
  const pdas = deriveRaydiumCpSwapPdas(memeMint, raydiumProgramId);
  const token0Mint = asPublicKey(params.token0Mint ?? pdas.token0Mint);
  const token1Mint = asPublicKey(params.token1Mint ?? pdas.token1Mint);
  const token0Program =
    token0Mint.equals(NATIVE_MINT) ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID;
  const token1Program =
    token1Mint.equals(NATIVE_MINT) ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID;
  const creatorToken0 = asPublicKey(
    params.creatorToken0 ??
      getAssociatedTokenAddressSync(token0Mint, creator, false, token0Program),
  );
  const creatorToken1 = asPublicKey(
    params.creatorToken1 ??
      getAssociatedTokenAddressSync(token1Mint, creator, false, token1Program),
  );
  const creatorLpToken = asPublicKey(
    params.creatorLpToken ??
      getAssociatedTokenAddressSync(pdas.lpMint, creator, false, TOKEN_PROGRAM_ID),
  );

  return [
    { pubkey: creator, isSigner: true, isWritable: true },
    { pubkey: asPublicKey(params.ammConfig ?? pdas.ammConfig), isSigner: false, isWritable: false },
    { pubkey: asPublicKey(params.authority ?? pdas.authority), isSigner: false, isWritable: false },
    { pubkey: asPublicKey(params.poolState ?? pdas.poolState), isSigner: false, isWritable: true },
    { pubkey: token0Mint, isSigner: false, isWritable: false },
    { pubkey: token1Mint, isSigner: false, isWritable: false },
    { pubkey: asPublicKey(params.lpMint ?? pdas.lpMint), isSigner: false, isWritable: true },
    { pubkey: creatorToken0, isSigner: false, isWritable: true },
    { pubkey: creatorToken1, isSigner: false, isWritable: true },
    { pubkey: creatorLpToken, isSigner: false, isWritable: true },
    { pubkey: asPublicKey(params.token0Vault ?? pdas.token0Vault), isSigner: false, isWritable: true },
    { pubkey: asPublicKey(params.token1Vault ?? pdas.token1Vault), isSigner: false, isWritable: true },
    {
      pubkey: asPublicKey(
        params.createPoolFee ?? RAYDIUM_CREATE_POOL_FEE_RECEIVER_DEVNET,
      ),
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: asPublicKey(params.observationState ?? pdas.observationState),
      isSigner: false,
      isWritable: true,
    },
    { pubkey: asPublicKey(params.splTokenProgram ?? TOKEN_PROGRAM_ID), isSigner: false, isWritable: false },
    { pubkey: asPublicKey(params.token0Program ?? token0Program), isSigner: false, isWritable: false },
    { pubkey: asPublicKey(params.token1Program ?? token1Program), isSigner: false, isWritable: false },
    {
      pubkey: asPublicKey(params.associatedTokenProgram ?? ASSOCIATED_TOKEN_PROGRAM_ID),
      isSigner: false,
      isWritable: false,
    },
    { pubkey: asPublicKey(params.systemProgram ?? SystemProgram.programId), isSigner: false, isWritable: false },
    { pubkey: asPublicKey(params.rentSysvar ?? SYSVAR_RENT_PUBKEY), isSigner: false, isWritable: false },
    { pubkey: raydiumProgramId, isSigner: false, isWritable: false },
  ];
}

export function migrateIx(params: MigrateIxParams): TransactionInstruction {
  void params;
  throw new Error(UNSUPPORTED_MIGRATION_ERROR);
}

export function releaseLpIx(params: ReleaseLpIxParams): TransactionInstruction {
  void params;
  throw new Error(UNSUPPORTED_MIGRATION_ERROR);
}

export function initializeGlobalConfigIx(
  params: InitializeGlobalConfigIxParams,
): TransactionInstruction {
  const programIds = resolveProgramIds(params.programIds);
  const authority = asPublicKey(params.authority);
  const globalConfig = asPublicKey(
    params.globalConfig ?? deriveGlobalConfigPda(programIds.bondingCurve),
  );
  const programData = asPublicKey(
    params.programData ?? deriveProgramDataPda(programIds.bondingCurve),
  );

  return new TransactionInstruction({
    programId: programIds.bondingCurve,
    keys: [
      { pubkey: globalConfig, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: programData, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([INITIALIZE_GLOBAL_CONFIG_DISCRIMINATOR]),
  });
}

export function pauseIx(params: PauseIxParams): TransactionInstruction {
  const programIds = resolveProgramIds(params.programIds);
  const authority = asPublicKey(params.authority);
  const globalConfig = asPublicKey(
    params.globalConfig ?? deriveGlobalConfigPda(programIds.bondingCurve),
  );

  return new TransactionInstruction({
    programId: programIds.bondingCurve,
    keys: [
      { pubkey: globalConfig, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data: Buffer.from([PAUSE_DISCRIMINATOR]),
  });
}

export function unpauseIx(params: UnpauseIxParams): TransactionInstruction {
  const programIds = resolveProgramIds(params.programIds);
  const authority = asPublicKey(params.authority);
  const globalConfig = asPublicKey(
    params.globalConfig ?? deriveGlobalConfigPda(programIds.bondingCurve),
  );

  return new TransactionInstruction({
    programId: programIds.bondingCurve,
    keys: [
      { pubkey: globalConfig, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data: Buffer.from([UNPAUSE_DISCRIMINATOR]),
  });
}

export function renounceAdminIx(
  params: RenounceAdminIxParams,
): TransactionInstruction {
  const programIds = resolveProgramIds(params.programIds);
  const authority = asPublicKey(params.authority);
  const globalConfig = asPublicKey(
    params.globalConfig ?? deriveGlobalConfigPda(programIds.bondingCurve),
  );

  return new TransactionInstruction({
    programId: programIds.bondingCurve,
    keys: [
      { pubkey: globalConfig, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data: Buffer.from([RENOUNCE_ADMIN_DISCRIMINATOR]),
  });
}

export function withdrawTreasuryIx(
  params: WithdrawTreasuryIxParams,
): TransactionInstruction {
  const programIds = resolveProgramIds(params.programIds);
  const treasury = asPublicKey(params.treasury ?? deriveTreasuryPda(programIds.bondingCurve));
  const globalConfig = asPublicKey(
    params.globalConfig ?? deriveGlobalConfigPda(programIds.bondingCurve),
  );

  return new TransactionInstruction({
    programId: programIds.bondingCurve,
    keys: [
      { pubkey: treasury, isSigner: false, isWritable: true },
      { pubkey: globalConfig, isSigner: false, isWritable: false },
      { pubkey: asPublicKey(params.authority), isSigner: true, isWritable: false },
      { pubkey: asPublicKey(params.recipient), isSigner: false, isWritable: true },
    ],
    data: packDiscriminatorAndU64s(WITHDRAW_TREASURY_DISCRIMINATOR, [
      params.amount ?? 0n,
    ]),
  });
}

export function buyIx(params: BuyIxParams): TransactionInstruction {
  const programIds = resolveProgramIds(params.programIds);
  const mint = asPublicKey(params.mint);
  const buyer = asPublicKey(params.buyer);
  const curve = asPublicKey(params.curve ?? deriveCurvePda(mint, programIds.bondingCurve));
  const vault = asPublicKey(params.vault ?? deriveVaultPda(mint, programIds.bondingCurve));
  const soul = asPublicKey(params.soul ?? deriveSoulPda(mint, programIds.soulGenerator));
  const buyerTokenAccount = asPublicKey(params.buyerTokenAccount);
  const soulConfigPda = asPublicKey(
    params.soulConfigPda ?? deriveSoulConfigPda(programIds.soulGenerator),
  );
  const globalConfig = asPublicKey(
    params.globalConfig ?? deriveGlobalConfigPda(programIds.bondingCurve),
  );

  return new TransactionInstruction({
    programId: programIds.bondingCurve,
    keys: [
      { pubkey: curve, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: buyerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: buyer, isSigner: true, isWritable: true },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: soul, isSigner: false, isWritable: true },
      { pubkey: programIds.soulGenerator, isSigner: false, isWritable: false },
      { pubkey: RECENT_BLOCKHASHES_SYSVAR_ID, isSigner: false, isWritable: false },
      { pubkey: soulConfigPda, isSigner: false, isWritable: false },
      { pubkey: globalConfig, isSigner: false, isWritable: false },
    ],
    data: packDiscriminatorAndU64s(BUY_DISCRIMINATOR, [
      params.solIn,
      params.minAmountOut,
    ]),
  });
}

export function sellIx(params: SellIxParams): TransactionInstruction {
  const programIds = resolveProgramIds(params.programIds);
  const mint = asPublicKey(params.mint);
  const seller = asPublicKey(params.seller);
  const curve = asPublicKey(params.curve ?? deriveCurvePda(mint, programIds.bondingCurve));
  const vault = asPublicKey(params.vault ?? deriveVaultPda(mint, programIds.bondingCurve));
  const soul = asPublicKey(params.soul ?? deriveSoulPda(mint, programIds.soulGenerator));
  const sellerTokenAccount = asPublicKey(params.sellerTokenAccount);
  const soulConfigPda = asPublicKey(
    params.soulConfigPda ?? deriveSoulConfigPda(programIds.soulGenerator),
  );
  const globalConfig = asPublicKey(
    params.globalConfig ?? deriveGlobalConfigPda(programIds.bondingCurve),
  );
  const hardBindingAccounts = params.hardBindingAccounts ?? [
    {
      pubkey: deriveReceiptRegistryPda(seller, mint, programIds.soulGenerator),
      isSigner: false,
      isWritable: false,
    },
  ];

  return new TransactionInstruction({
    programId: programIds.bondingCurve,
    keys: [
      { pubkey: curve, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: sellerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: seller, isSigner: true, isWritable: true },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: globalConfig, isSigner: false, isWritable: false },
      ...(params.soul
        ? [
            { pubkey: soul, isSigner: false, isWritable: true },
            { pubkey: programIds.soulGenerator, isSigner: false, isWritable: false },
            { pubkey: RECENT_BLOCKHASHES_SYSVAR_ID, isSigner: false, isWritable: false },
            { pubkey: soulConfigPda, isSigner: false, isWritable: false },
          ]
        : []),
      ...hardBindingAccounts,
    ],
    data: packDiscriminatorAndU64s(SELL_DISCRIMINATOR, [
      params.tokenIn,
      params.minAmountOut,
    ]),
  });
}

export function initializeSoulIx(
  params: InitializeSoulIxParams,
): TransactionInstruction {
  const programIds = resolveProgramIds(params.programIds);
  const mint = asPublicKey(params.mint);
  const soul = asPublicKey(params.soul ?? deriveSoulPda(mint, programIds.soulGenerator));
  const authority = asPublicKey(params.authority);
  const symbolBytes = encodeMemeSymbol(params.symbol);
  const targetAmm =
    params.targetAmm === undefined
      ? undefined
      : assertActiveTargetAmm(params.targetAmm, "initializeSoul");
  const data = Buffer.alloc(
    9 +
      (symbolBytes.length > 0 || targetAmm !== undefined
        ? 1 + symbolBytes.length
        : 0) +
      (targetAmm !== undefined ? 1 : 0),
  );
  data[0] = INITIALIZE_SOUL_DISCRIMINATOR;
  writeI64LE(data, toI64(params.createdAt), 1);
  if (symbolBytes.length > 0 || targetAmm !== undefined) {
    data[9] = symbolBytes.length;
    data.set(symbolBytes, 10);
  }
  if (targetAmm !== undefined) {
    data[10 + symbolBytes.length] = targetAmm;
  }

  return new TransactionInstruction({
    programId: programIds.soulGenerator,
    keys: [
      { pubkey: soul, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function generateSoulIx(params: GenerateSoulIxParams): TransactionInstruction {
  const programIds = resolveProgramIds(params.programIds);
  const mint = asPublicKey(params.mint);
  const soul = asPublicKey(params.soul ?? deriveSoulPda(mint, programIds.soulGenerator));
  const payer = asPublicKey(params.payer);
  const configPda = asPublicKey(
    params.configPda ?? deriveSoulConfigPda(programIds.soulGenerator),
  );
  const data = Buffer.alloc(10);
  data[0] = GENERATE_SOUL_DISCRIMINATOR;
  writeU64LE(data, toU64(params.swapAmount), 1);
  data[9] = params.isBuy ? 1 : 0;

  return new TransactionInstruction({
    programId: programIds.soulGenerator,
    keys: [
      { pubkey: soul, isSigner: false, isWritable: true },
      { pubkey: payer, isSigner: true, isWritable: false },
      { pubkey: SLOT_HASHES_SYSVAR_ID, isSigner: false, isWritable: false },
      { pubkey: configPda, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function encodeTemplateUploadBytes(params: {
  template: string | Uint8Array;
  styleParams?: string | Uint8Array;
}): { templateBytes: Uint8Array; styleParamBytes: Uint8Array; data: Buffer } {
  const templateBytes = bytesFromStringOrUint8Array(params.template);
  const styleParamBytes = bytesFromStringOrUint8Array(params.styleParams ?? "");
  validateTemplateUploadBytes(templateBytes, styleParamBytes);
  const data = Buffer.alloc(1 + 2 + templateBytes.length + 2 + styleParamBytes.length);
  data[0] = UPLOAD_TEMPLATE_DISCRIMINATOR;
  data.writeUInt16LE(templateBytes.length, 1);
  data.set(templateBytes, 3);
  const styleLenOffset = 3 + templateBytes.length;
  data.writeUInt16LE(styleParamBytes.length, styleLenOffset);
  data.set(styleParamBytes, styleLenOffset + 2);
  return { templateBytes, styleParamBytes, data };
}

export function uploadTemplateIx(params: UploadTemplateIxParams): TransactionInstruction {
  const programIds = resolveProgramIds(params.programIds);
  const mint = asPublicKey(params.mint);
  const soul = asPublicKey(params.soul ?? deriveSoulPda(mint, programIds.soulGenerator));
  const authority = asPublicKey(params.authority);
  const configPda = asPublicKey(
    params.configPda ?? deriveSoulConfigPda(programIds.soulGenerator),
  );
  const { data } = encodeTemplateUploadBytes({
    template: params.template,
    styleParams: params.styleParams,
  });

  return new TransactionInstruction({
    programId: programIds.soulGenerator,
    keys: [
      { pubkey: soul, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: configPda, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function claimSoulIx(params: ClaimSoulIxParams): TransactionInstruction {
  const programIds = resolveProgramIds(params.programIds);
  const mint = asPublicKey(params.mint);
  const claimer = asPublicKey(params.claimer);
  const soul = asPublicKey(params.soul ?? deriveSoulPda(mint, programIds.soulGenerator));
  const sequence = toU64(params.sequence);
  const claim = asPublicKey(
    params.claim ?? deriveClaimPda(soul, sequence, programIds.soulGenerator),
  );
  const receipt = asPublicKey(
    params.receipt ?? deriveReceiptPda(soul, sequence, programIds.soulGenerator),
  );
  const receiptRegistry = asPublicKey(
    params.receiptRegistry ?? deriveReceiptRegistryPda(claimer, mint, programIds.soulGenerator),
  );
  const nftMint = asPublicKey(params.nftMint);
  const claimerMemeAta = asPublicKey(
    params.claimerMemeAta ??
      getAssociatedTokenAddressSync(mint, claimer, false, TOKEN_2022_PROGRAM_ID),
  );
  const nftTokenAccount = asPublicKey(
    params.nftTokenAccount ??
      getAssociatedTokenAddressSync(nftMint, claimer, false, TOKEN_2022_PROGRAM_ID),
  );
  const nftAuthority = asPublicKey(
    params.nftAuthority ??
      deriveNftAuthorityPda(soul, sequence, programIds.soulGenerator),
  );
  const configPda = asPublicKey(
    params.configPda ?? deriveSoulConfigPda(programIds.soulGenerator),
  );

  return new TransactionInstruction({
    programId: programIds.soulGenerator,
    keys: [
      { pubkey: soul, isSigner: false, isWritable: true },
      { pubkey: claim, isSigner: false, isWritable: true },
      { pubkey: claimer, isSigner: true, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: claimerMemeAta, isSigner: false, isWritable: false },
      { pubkey: nftMint, isSigner: false, isWritable: true },
      { pubkey: nftTokenAccount, isSigner: false, isWritable: true },
      { pubkey: nftAuthority, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: receipt, isSigner: false, isWritable: true },
      { pubkey: receiptRegistry, isSigner: false, isWritable: true },
      { pubkey: configPda, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([CLAIM_SOUL_DISCRIMINATOR]),
  });
}

function encodeReceiptLifecycleState(state: ReceiptLifecycleState): number {
  switch (state) {
    case "active":
      return RECEIPT_LIFECYCLE_STATE.Active;
    case "burned":
      return RECEIPT_LIFECYCLE_STATE.Burned;
    case "forfeited":
      return RECEIPT_LIFECYCLE_STATE.Forfeited;
    default: {
      const neverState: never = state;
      throw new Error(`Unknown receipt lifecycle state: ${neverState}`);
    }
  }
}

export function receiptLifecycleIx(params: ReceiptLifecycleIxParams): TransactionInstruction {
  const programIds = resolveProgramIds(params.programIds);
  return new TransactionInstruction({
    programId: programIds.soulGenerator,
    keys: [
      { pubkey: asPublicKey(params.receipt), isSigner: false, isWritable: true },
      { pubkey: asPublicKey(params.receiptRegistry), isSigner: false, isWritable: true },
      { pubkey: asPublicKey(params.authority), isSigner: true, isWritable: false },
    ],
    data: Buffer.from([
      RECEIPT_LIFECYCLE_DISCRIMINATOR,
      encodeReceiptLifecycleState(params.state),
    ]),
  });
}

export function computeRequiredReceiptSettlement(
  params: ComputeRequiredReceiptSettlementParams,
): RequiredReceiptSettlement {
  const currentBalance = toU64(params.currentBalance);
  const movementAmount = toU64(params.movementAmount);
  const activeReceiptCount = toU64(params.activeReceiptCount);
  if (movementAmount > currentBalance) {
    throw new Error(
      `Settlement movement exceeds current balance: movement ${movementAmount.toString()} > balance ${currentBalance.toString()}`,
    );
  }

  const preWholeUnits = currentBalance / MIN_CLAIM_BALANCE;
  const postWholeUnits = (currentBalance - movementAmount) / MIN_CLAIM_BALANCE;
  const crossedDown = preWholeUnits - postWholeUnits;
  const requiredCount =
    activeReceiptCount > postWholeUnits ? activeReceiptCount - postWholeUnits : 0n;

  return {
    preWholeUnits,
    postWholeUnits,
    crossedDown,
    activeReceiptCount,
    requiredCount,
    preBoundCapacity: preWholeUnits * MIN_CLAIM_BALANCE,
    postBoundCapacity: postWholeUnits * MIN_CLAIM_BALANCE,
  };
}

export function selectSettlementReceipts(
  params: SelectSettlementReceiptsParams,
): SelectedReceiptSettlement {
  const programIds = resolveProgramIds(params.programIds);
  const owner = asPublicKey(params.owner);
  const mint = asPublicKey(params.mint);
  const settlement = computeRequiredReceiptSettlement(params);
  const requiredCount = Number(settlement.requiredCount);
  if (settlement.requiredCount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(
      `Required settlement count is too large: ${settlement.requiredCount.toString()}`,
    );
  }
  if (requiredCount === 0) {
    return { ...settlement, selectedReceipts: [] };
  }

  const activeCandidates = params.candidates.filter(({ receipt }) => {
    return (
      receipt.lifecycleState === "active" &&
      receipt.claimant.equals(owner) &&
      receipt.tokenMint.equals(mint)
    );
  });
  if (BigInt(activeCandidates.length) < settlement.requiredCount) {
    throw new Error(
      `Under-settled boundary movement: ${settlement.requiredCount.toString()} receipt(s) required but only ${activeCandidates.length} active matching receipt(s) are available.`,
    );
  }

  const selected: SettlementReceiptCandidate[] = [];
  const used = new Set<string>();
  for (let index = 0; index < requiredCount; index += 1) {
    const expectedBoundary =
      settlement.postBoundCapacity + BigInt(requiredCount - index) * MIN_CLAIM_BALANCE;
    const matches = activeCandidates
      .filter(({ receiptAccount, receipt }) => {
        if (used.has(receiptAccount.toBase58())) {
          return false;
        }
        return receipt.boundBoundary === expectedBoundary;
      })
      .sort((left, right) =>
        left.receiptAccount.toBase58().localeCompare(right.receiptAccount.toBase58()),
      );
    const candidate = matches[0];
    if (!candidate) {
      throw new Error(
        `Under-settled boundary movement: missing active receipt for boundary ${expectedBoundary.toString()}.`,
      );
    }
    const expectedPda = deriveReceiptPda(
      candidate.receipt.soul,
      candidate.receipt.sequence,
      programIds.soulGenerator,
    );
    if (!candidate.receiptAccount.equals(expectedPda)) {
      throw new Error(
        `Receipt ${candidate.receiptAccount.toBase58()} is not the canonical PDA for sequence ${candidate.receipt.sequence.toString()}.`,
      );
    }
    used.add(candidate.receiptAccount.toBase58());
    selected.push(candidate);
  }

  return { ...settlement, selectedReceipts: selected };
}

export async function fetchSettlementReceiptCandidates(
  connection: Connection,
  owner: PublicKeyLike,
  mint: PublicKeyLike,
  options: FetchSettlementReceiptCandidatesOptions = {},
): Promise<SettlementReceiptCandidate[]> {
  const programIds = resolveProgramIds(options.programIds);
  const ownerPublicKey = asPublicKey(owner);
  const mintPublicKey = asPublicKey(mint);
  const accounts = await connection.getProgramAccounts(programIds.soulGenerator, {
    commitment: options.commitment ?? "confirmed",
    filters: [
      { dataSize: RECEIPT_ACCOUNT_SIZE },
      { memcmp: { offset: RECEIPT_CLAIMANT_OFFSET, bytes: ownerPublicKey.toBase58() } },
      { memcmp: { offset: RECEIPT_TOKEN_MINT_OFFSET, bytes: mintPublicKey.toBase58() } },
    ],
  });

  return accounts
    .flatMap((account) => {
      try {
        const receipt = decodeReceiptAccount(account.account.data);
        if (
          receipt.lifecycleState !== "active" ||
          !receipt.claimant.equals(ownerPublicKey) ||
          !receipt.tokenMint.equals(mintPublicKey)
        ) {
          return [];
        }
        return [{ receiptAccount: account.pubkey, receipt }];
      } catch {
        return [];
      }
    })
    .sort((left, right) => {
      if (left.receipt.boundBoundary === right.receipt.boundBoundary) {
        return left.receiptAccount.toBase58().localeCompare(right.receiptAccount.toBase58());
      }
      return left.receipt.boundBoundary > right.receipt.boundBoundary ? -1 : 1;
    });
}

export async function fetchReceiptRegistryAccount(
  connection: Connection,
  owner: PublicKeyLike,
  mint: PublicKeyLike,
  options: FetchReceiptRegistryOptions = {},
): Promise<{ address: PublicKey; registry: ReceiptRegistryAccount } | null> {
  const programIds = resolveProgramIds(options.programIds);
  const address = deriveReceiptRegistryPda(owner, mint, programIds.soulGenerator);
  const account = await connection.getAccountInfo(address, options.commitment ?? "confirmed");
  if (!account) {
    return null;
  }
  if (!account.owner.equals(programIds.soulGenerator)) {
    throw new Error(
      `Receipt registry owner mismatch: expected ${programIds.soulGenerator.toBase58()}, got ${account.owner.toBase58()}`,
    );
  }
  return {
    address,
    registry: decodeReceiptRegistryAccount(account.data),
  };
}

export function settleReceiptsIx(params: SettleReceiptsIxParams): TransactionInstruction {
  const programIds = resolveProgramIds(params.programIds);
  const authority = asPublicKey(params.authority);
  if (!params.receiptRegistry && !params.tokenMint) {
    throw new Error("settleReceiptsIx requires either receiptRegistry or tokenMint.");
  }
  const receiptRegistry = asPublicKey(
    params.receiptRegistry ??
      deriveReceiptRegistryPda(authority, params.tokenMint!, programIds.soulGenerator),
  );
  const data = Buffer.alloc(10);
  data[0] = SETTLE_RECEIPTS_DISCRIMINATOR;
  data[1] = encodeReceiptLifecycleState(params.state);
  writeU64LE(data, toU64(params.movementAmount), 2);

  return new TransactionInstruction({
    programId: programIds.soulGenerator,
    keys: [
      { pubkey: receiptRegistry, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: asPublicKey(params.tokenAccount), isSigner: false, isWritable: false },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      ...params.receipts.map((receipt) => ({
        pubkey: asPublicKey(receipt),
        isSigner: false,
        isWritable: true,
      })),
    ],
    data,
  });
}

export function buildSettlementSellTransaction(
  params: BuildSettlementSellTransactionParams,
): Transaction {
  const tx = new Transaction();
  let hardBindingAccounts = params.sell.hardBindingAccounts;
  if (params.settlement) {
    const settlementIx = settleReceiptsIx(params.settlement);
    tx.add(settlementIx);
    hardBindingAccounts = [
      {
        pubkey: settlementIx.keys[0]!.pubkey,
        isSigner: false,
        isWritable: false,
      },
      ...(hardBindingAccounts ?? []),
    ];
  }
  tx.add(sellIx({ ...params.sell, hardBindingAccounts }));
  return tx;
}

export function buildSettlementTransferTransaction(
  params: BuildSettlementTransferTransactionParams,
): Transaction {
  const tx = new Transaction();
  if (params.settlement) {
    tx.add(settleReceiptsIx(params.settlement));
  }
  for (const instruction of params.preInstructions ?? []) {
    tx.add(instruction);
  }
  tx.add(params.transferInstruction);
  return tx;
}

export async function createToken(params: CreateTokenParams): Promise<string> {
  const tx = new Transaction().add(
    createTokenIx({
      mint: params.mint,
      payer: params.payer.publicKey,
      treasury: params.treasury,
      programIds: params.programIds,
    }),
  );
  return sendTransaction(params, tx);
}

export async function migrate(params: MigrateParams): Promise<string> {
  const tx = new Transaction().add(
    migrateIx({
      mint: params.mint,
      migrationTarget: params.migrationTarget,
      migrationTokenAccount: params.migrationTokenAccount,
      remainingAccounts: params.remainingAccounts,
      raydiumAccounts: params.raydiumAccounts,
      programIds: params.programIds,
    }),
  );
  return sendTransaction(params, tx);
}

export async function buy(params: BuyParams): Promise<string>;
export async function buy(params: BuyWalletProvenanceParams): Promise<TradeWithGenerationProvenanceResult>;
export async function buy(params: BuyWalletParams): Promise<string>;
export async function buy(
  params: BuyParams | BuyWalletParams | BuyWalletProvenanceParams,
): Promise<string | TradeWithGenerationProvenanceResult> {
  const mint = asPublicKey(params.mint);
  const payerPublicKey = getPayerPublicKey(params.payer);
  const buyerTokenAccount = asPublicKey(
    params.buyerTokenAccount ??
      getAssociatedTokenAddressSync(
        mint,
        payerPublicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      ),
  );
  const tx = new Transaction();

  if (params.createBuyerTokenAccount ?? true) {
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        payerPublicKey,
        buyerTokenAccount,
        payerPublicKey,
        mint,
        TOKEN_2022_PROGRAM_ID,
      ),
    );
  }

  tx.add(
    buyIx({
      mint,
      buyer: payerPublicKey,
      buyerTokenAccount,
      solIn: params.solIn,
      minAmountOut: params.minAmountOut ?? 1n,
      programIds: params.programIds,
    }),
  );

  if ("sendTransaction" in params) {
    const commitment = params.commitment ?? "finalized";
    const latestBlockhash = await params.connection.getLatestBlockhash(commitment);
    tx.feePayer = payerPublicKey;
    tx.recentBlockhash = latestBlockhash.blockhash;
    const signature = await params.sendTransaction(tx, params.connection);
    const confirmation = await params.connection.confirmTransaction(
      {
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      commitment,
    );
    if (confirmation.value.err) {
      throw new Error(
        `Buy transaction failed: ${JSON.stringify(confirmation.value.err)}`,
      );
    }
    if (params.includeGenerationProvenance) {
      return resolveTradeGenerationProvenance({
        connection: params.connection,
        signature,
        mint,
        expectedSide: "buy",
        expectedAmount: netBuyGenerationAmount(toU64(params.solIn)),
        trader: payerPublicKey,
        tokenAccount: buyerTokenAccount,
        commitment,
        programIds: params.programIds,
        generationApiBaseUrl: params.generationApiBaseUrl,
        provenanceFetch: params.provenanceFetch,
      });
    }
    return signature;
  }

  return sendTransaction(params, tx);
}

export async function buyAndAutoClaimSoul(
  params: BuyAndAutoClaimSoulWalletParams,
): Promise<BuyAndAutoClaimSoulResult> {
  const mint = asPublicKey(params.mint);
  const payerPublicKey = getPayerPublicKey(params.payer);
  const programIds = resolveProgramIds(params.programIds);
  const soul = deriveSoulPda(mint, programIds.soulGenerator);
  const preBuySoul = await fetchSoul(params.connection, mint, {
    commitment: params.commitment,
    programIds: params.programIds,
  });
  const buyerTokenAccount = asPublicKey(
    params.buyerTokenAccount ??
      getAssociatedTokenAddressSync(
        mint,
        payerPublicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      ),
  );
  const nftMint = params.nftMint ?? Keypair.generate();
  const nftTokenAccount = asPublicKey(
    params.nftTokenAccount ??
      getAssociatedTokenAddressSync(
        nftMint.publicKey,
        payerPublicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      ),
  );
  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({
      units: 1_200_000,
    }),
  );

  if (params.createBuyerTokenAccount ?? true) {
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        payerPublicKey,
        buyerTokenAccount,
        payerPublicKey,
        mint,
        TOKEN_2022_PROGRAM_ID,
      ),
    );
  }

  tx.add(
    SystemProgram.createAccount({
      fromPubkey: payerPublicKey,
      newAccountPubkey: nftMint.publicKey,
      lamports: await params.connection.getMinimumBalanceForRentExemption(
        maxSoulNftRentExemptionSize(preBuySoul),
      ),
      space: NFT_MINT_ACCOUNT_SIZE,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    buyIx({
      mint,
      buyer: payerPublicKey,
      buyerTokenAccount,
      solIn: params.solIn,
      minAmountOut: params.minAmountOut ?? 1n,
      programIds: params.programIds,
    }),
    claimSoulIx({
      mint,
      claimer: payerPublicKey,
      claimerMemeAta: buyerTokenAccount,
      nftMint: nftMint.publicKey,
      nftTokenAccount,
      sequence: preBuySoul.claimCount,
      soul,
      programIds: params.programIds,
    }),
  );

  const commitment = params.commitment ?? "finalized";
  const latestBlockhash = await params.connection.getLatestBlockhash(commitment);
  tx.feePayer = payerPublicKey;
  tx.recentBlockhash = latestBlockhash.blockhash;
  const signature = await params.sendTransaction(tx, params.connection, {
    signers: [nftMint],
  });
  const confirmation = await params.connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    commitment,
  );
  if (confirmation.value.err) {
    throw new Error(
      `Buy + Soul NFT issuance transaction failed: ${JSON.stringify(confirmation.value.err)}`,
    );
  }
  const provenanceResult = await resolveTradeGenerationProvenance({
    connection: params.connection,
    signature,
    mint,
    expectedSide: "buy",
    expectedAmount: netBuyGenerationAmount(toU64(params.solIn)),
    trader: payerPublicKey,
    tokenAccount: buyerTokenAccount,
    commitment,
    programIds: params.programIds,
    generationApiBaseUrl: params.generationApiBaseUrl,
    provenanceFetch: params.provenanceFetch,
  });

  return {
    ...provenanceResult,
    nftMint: nftMint.publicKey,
    nftTokenAccount,
  };
}

export async function sell(params: SellParams): Promise<string>;
export async function sell(params: SellWalletProvenanceParams): Promise<TradeWithGenerationProvenanceResult>;
export async function sell(params: SellWalletParams): Promise<string>;
export async function sell(
  params: SellParams | SellWalletParams | SellWalletProvenanceParams,
): Promise<string | TradeWithGenerationProvenanceResult> {
  const mint = asPublicKey(params.mint);
  const payerPublicKey = getPayerPublicKey(params.payer);
  const sellerTokenAccount = asPublicKey(
    params.sellerTokenAccount ??
      getAssociatedTokenAddressSync(
        mint,
        payerPublicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      ),
  );
  const tx = buildSettlementSellTransaction({
    settlement: "settlement" in params ? params.settlement : undefined,
    sell: {
      mint,
      seller: payerPublicKey,
      sellerTokenAccount,
      soul: deriveSoulPda(mint, resolveProgramIds(params.programIds).soulGenerator),
      tokenIn: params.tokenIn,
      minAmountOut: params.minAmountOut ?? 1n,
      programIds: params.programIds,
    },
  });

  if ("sendTransaction" in params) {
    const commitment = params.commitment ?? "finalized";
    const latestBlockhash = await params.connection.getLatestBlockhash(commitment);
    tx.feePayer = payerPublicKey;
    tx.recentBlockhash = latestBlockhash.blockhash;
    const signature = await params.sendTransaction(tx, params.connection);
    const confirmation = await params.connection.confirmTransaction(
      {
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      commitment,
    );
    if (confirmation.value.err) {
      throw new Error(
        `Sell transaction failed: ${JSON.stringify(confirmation.value.err)}`,
      );
    }
    if (params.includeGenerationProvenance) {
      return resolveTradeGenerationProvenance({
        connection: params.connection,
        signature,
        mint,
        expectedSide: "sell",
        expectedAmount: toU64(params.tokenIn),
        trader: payerPublicKey,
        tokenAccount: sellerTokenAccount,
        commitment,
        programIds: params.programIds,
        generationApiBaseUrl: params.generationApiBaseUrl,
        provenanceFetch: params.provenanceFetch,
      });
    }
    return signature;
  }

  return sendTransaction(params, tx);
}

export async function generateSoul(params: GenerateSoulParams): Promise<string>;
export async function generateSoul(params: GenerateSoulWalletParams): Promise<string>;
export async function generateSoul(
  params: GenerateSoulParams | GenerateSoulWalletParams,
): Promise<string> {
  const payerPublicKey = getPayerPublicKey(params.payer);
  const tx = new Transaction().add(
    generateSoulIx({
      mint: params.mint,
      payer: payerPublicKey,
      swapAmount: params.swapAmount,
      isBuy: params.isBuy ?? true,
      programIds: params.programIds,
    }),
  );

  if ("sendTransaction" in params) {
    const signature = await params.sendTransaction(tx, params.connection);
    await params.connection.confirmTransaction(
      signature,
      params.commitment ?? "confirmed",
    );
    return signature;
  }

  return sendTransaction(params, tx);
}

export async function uploadTemplate(params: UploadTemplateParams): Promise<string>;
export async function uploadTemplate(params: UploadTemplateWalletParams): Promise<string>;
export async function uploadTemplate(
  params: UploadTemplateParams | UploadTemplateWalletParams,
): Promise<string> {
  const payerPublicKey = getPayerPublicKey(params.payer);
  const tx = new Transaction().add(
    uploadTemplateIx({
      mint: params.mint,
      authority: payerPublicKey,
      template: params.template,
      styleParams: params.styleParams,
      programIds: params.programIds,
    }),
  );

  if ("sendTransaction" in params) {
    const commitment = params.commitment ?? "finalized";
    const latestBlockhash = await params.connection.getLatestBlockhash(commitment);
    tx.feePayer = payerPublicKey;
    tx.recentBlockhash = latestBlockhash.blockhash;
    const signature = await params.sendTransaction(tx, params.connection);
    const confirmation = await params.connection.confirmTransaction(
      {
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      commitment,
    );
    if (confirmation.value.err) {
      throw new Error(
        `Template upload transaction failed: ${JSON.stringify(confirmation.value.err)}`,
      );
    }
    return signature;
  }

  return sendTransaction(params, tx);
}

export async function claimSoul(params: ClaimSoulParams): Promise<string>;
export async function claimSoul(params: ClaimSoulWalletParams): Promise<string>;
export async function claimSoul(
  params: ClaimSoulParams | ClaimSoulWalletParams,
): Promise<string> {
  const mint = asPublicKey(params.mint);
  const soulState = await fetchSoul(params.connection, mint, {
    commitment: params.commitment,
    programIds: params.programIds,
  });
  const programIds = resolveProgramIds(params.programIds);
  const payerPublicKey = getPayerPublicKey(params.payer);
  const nftMint = params.nftMint.publicKey;
  const nftTokenAccount = asPublicKey(
    params.nftTokenAccount ??
      getAssociatedTokenAddressSync(
        nftMint,
        payerPublicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      ),
  );
  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({
      units: CLAIM_SOUL_COMPUTE_UNIT_LIMIT,
    }),
  );

  if (params.createNftMintAccount ?? true) {
    const metadata = buildSoulNftMetadata(soulState);
    tx.add(
      SystemProgram.createAccount({
        fromPubkey: payerPublicKey,
        newAccountPubkey: nftMint,
        lamports: await params.connection.getMinimumBalanceForRentExemption(
          metadata.mintRentExemptionSize,
        ),
        space: metadata.mintAccountSize,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
    );
  }

  if (params.createNftTokenAccount ?? false) {
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        payerPublicKey,
        nftTokenAccount,
        payerPublicKey,
        nftMint,
        TOKEN_2022_PROGRAM_ID,
      ),
    );
  }

  tx.add(
    claimSoulIx({
      mint,
      claimer: payerPublicKey,
      claimerMemeAta: params.claimerMemeAta,
      nftMint,
      nftTokenAccount,
      sequence: soulState.claimCount,
      soul: deriveSoulPda(mint, programIds.soulGenerator),
      programIds: params.programIds,
    }),
  );

  if ("sendTransaction" in params) {
    const signature = await params.sendTransaction(tx, params.connection, {
      signers: [params.nftMint],
    });
    await params.connection.confirmTransaction(
      signature,
      params.commitment ?? "confirmed",
    );
    return signature;
  }

  return sendAndConfirmTransaction(params.connection, tx, [params.payer, params.nftMint], {
    commitment: params.commitment ?? "confirmed",
    ...params.confirmOptions,
  });
}

export function buildSoulNftMetadata(soul: SoulAccount): SoulNftMetadata {
  const symbol = soul.memeSymbol || NFT_METADATA_SYMBOL;
  const name = `${symbol} Soul #${(soul.claimCount + 1n).toString()}`;
  const image = `data:image/svg+xml;base64,${Buffer.from(soul.lastSvgBytes).toString("base64")}`;
  const platform = "SolSoul" as const;
  const creator = soul.authority.toBase58();
  const launcher = creator;
  const associatedTokenMint = soul.mint.toBase58();
  const associatedTokenSymbol = symbol;
  const artEngine = "SolSoul On-Chain Art Engine" as const;
  const artTheme = (soul.artTheme ?? resolveSoulTheme(soul)).label;
  const generation = (
    soul.provenanceGeneration > 0n ? soul.provenanceGeneration : soul.generationCount
  ).toString();
  const attributes = soulMetadataAttributes(soul, {
    platform,
    creator,
    launcher,
    associatedTokenMint,
    associatedTokenSymbol,
    artEngine,
    artTheme,
    generation,
  });
  const json = {
    name,
    symbol,
    image,
    platform,
    creator,
    launcher,
    associatedTokenMint,
    associatedTokenSymbol,
    artEngine,
    artTheme,
    generation,
    attributes,
  };
  const uri = `data:application/json;base64,${Buffer.from(
    JSON.stringify(json),
  ).toString("base64")}`;
  const tokenMetadataPackedLen =
    TOKEN_METADATA_BASE_PACKED_LEN +
    Buffer.byteLength(name) +
    Buffer.byteLength(symbol) +
    Buffer.byteLength(uri);

  return {
    name,
    symbol,
    uri,
    platform,
    creator,
    launcher,
    associatedTokenMint,
    associatedTokenSymbol,
    artEngine,
    artTheme,
    generation,
    attributes,
    mintAccountSize: NFT_MINT_ACCOUNT_SIZE,
    mintRentExemptionSize: getMintLen([ExtensionType.MetadataPointer], {
      [ExtensionType.TokenMetadata]: tokenMetadataPackedLen,
    }),
  };
}

function maxSoulNftRentExemptionSize(soul: SoulAccount): number {
  const symbol = soul.memeSymbol || NFT_METADATA_SYMBOL;
  const maxSvgBase64Length = Buffer.from(new Uint8Array(LAST_SVG_CAPACITY)).toString(
    "base64",
  ).length;
  const maxImage = `${"data:image/svg+xml;base64,"}${"A".repeat(maxSvgBase64Length)}`;
  const maxJson = {
    name: `${symbol} Soul #${(soul.claimCount + 1n).toString()}`,
    symbol,
    image: maxImage,
    platform: "SolSoul",
    creator: soul.authority.toBase58(),
    launcher: soul.authority.toBase58(),
    associatedTokenMint: soul.mint.toBase58(),
    associatedTokenSymbol: symbol,
    artEngine: "SolSoul On-Chain Art Engine",
    artTheme: (soul.artTheme ?? resolveSoulTheme(soul)).label,
    generation: (soul.generationCount + 1n).toString(),
    attributes: [
      { trait_type: "Platform", value: "SolSoul" },
      { trait_type: "Creator", value: soul.authority.toBase58() },
      { trait_type: "Launcher", value: soul.authority.toBase58() },
      { trait_type: "Associated token mint", value: soul.mint.toBase58() },
      { trait_type: "Associated token symbol", value: symbol },
      { trait_type: "Art engine", value: "SolSoul On-Chain Art Engine" },
      { trait_type: "Art theme", value: (soul.artTheme ?? resolveSoulTheme(soul)).label },
      { trait_type: "Generation", value: (soul.generationCount + 1n).toString() },
      { trait_type: "Rarity tier", value: "legendary" },
      { trait_type: "Soul Score", value: "1000" },
      { trait_type: "Trade side", value: "buy" },
      { trait_type: "Trade amount", value: "18446744073709551615" },
      { trait_type: "Trade token output", value: "18446744073709551615" },
      { trait_type: "Trader wallet", value: PublicKey.default.toBase58() },
      { trait_type: "Trader token account", value: PublicKey.default.toBase58() },
      { trait_type: "Seed hash", value: "f".repeat(64) },
      { trait_type: "Token mint", value: soul.mint.toBase58() },
      { trait_type: "Soul PDA", value: PublicKey.default.toBase58() },
      ...Array.from({ length: 16 }, (_, index) => ({
        trait_type: `Generated trait ${index}`,
        value: "x".repeat(96),
      })),
    ],
  };
  const maxUri = `data:application/json;base64,${Buffer.from(
    JSON.stringify(maxJson),
  ).toString("base64")}`;
  const tokenMetadataPackedLen =
    TOKEN_METADATA_BASE_PACKED_LEN +
    Buffer.byteLength(maxJson.name) +
    Buffer.byteLength(symbol) +
    Buffer.byteLength(maxUri);

  return getMintLen([ExtensionType.MetadataPointer], {
    [ExtensionType.TokenMetadata]: tokenMetadataPackedLen,
  });
}

function soulMetadataAttributes(
  soul: SoulAccount,
  identity: Pick<
    SoulNftMetadata,
    | "platform"
    | "creator"
    | "launcher"
    | "associatedTokenMint"
    | "associatedTokenSymbol"
    | "artEngine"
    | "artTheme"
    | "generation"
  >,
): Array<{ trait_type: string; value: string }> {
  const attributes = [
    { trait_type: "Platform", value: identity.platform },
    { trait_type: "Creator", value: identity.creator },
    { trait_type: "Launcher", value: identity.launcher },
    { trait_type: "Associated token mint", value: identity.associatedTokenMint },
    { trait_type: "Associated token symbol", value: identity.associatedTokenSymbol },
    { trait_type: "Art engine", value: identity.artEngine },
    { trait_type: "Art theme", value: identity.artTheme },
    { trait_type: "Generation", value: identity.generation },
  ];
  if (soul.provenanceGeneration > 0n) {
    attributes.push(
      ...soulGeneratedTraitMetadataAttributes(soul).map(({ traitType, value }) => ({
        trait_type: traitType,
        value,
      })),
    );
    const rarity = deriveSoulMetadataRarity(soul, {
      nftMint: undefined,
      generation: identity.generation,
      artTheme: identity.artTheme,
    });
    attributes.push(
      { trait_type: "Rarity tier", value: rarity.tier },
      { trait_type: "Soul Score", value: rarity.score.toString() },
    );
  }
  const side =
    soul.provenanceSide === SOUL_PROVENANCE_SIDE.Buy
      ? "buy"
      : soul.provenanceSide === SOUL_PROVENANCE_SIDE.Sell
        ? "sell"
        : null;
  if (!side || soul.provenanceGeneration === 0n) {
    return attributes;
  }

  attributes.push(
    { trait_type: "Trade side", value: side },
    { trait_type: "Trade amount", value: soul.provenanceAmount.toString() },
    { trait_type: "Trade token output", value: soul.provenanceTokenAmount.toString() },
    { trait_type: "Trader wallet", value: soul.provenanceTrader.toBase58() },
  );
  if (!soul.provenanceTokenAccount.equals(PublicKey.default)) {
    attributes.push({
      trait_type: "Trader token account",
      value: soul.provenanceTokenAccount.toBase58(),
    });
  }
  attributes.push(
    { trait_type: "Seed hash", value: soul.provenanceSeedHashHex },
    { trait_type: "Token mint", value: soul.provenanceMint.toBase58() },
    { trait_type: "Soul PDA", value: soul.provenanceSoul.toBase58() },
  );
  return attributes;
}

export function soulGeneratedTraitMetadataAttributes(
  soul: SoulAccount,
): SoulGeneratedTraitAttribute[] {
  if (soul.provenanceGeneration === 0n) {
    return [];
  }
  const traits = deriveBlendedSoulTraits({
    seed: soul.provenanceSeedHash,
    theme: resolveSoulTheme(soul).id,
    provenanceSide: soul.provenanceSide,
    generation: soul.provenanceGeneration,
    amount: soul.provenanceAmount,
    tokenAmount: soul.provenanceTokenAmount,
    styleParams: soul.styleParamsBytes,
  });
  return blendedSoulTraitsToMetadataAttributes(traits);
}

export function defaultSoulTraitsToMetadataAttributes(
  traits: DefaultSoulTraitSet,
): SoulGeneratedTraitAttribute[] {
  return SOUL_TRAIT_METADATA_ATTRIBUTE_TYPES.map(({ category, traitType, key }) => ({
    category,
    traitType,
    value: traits[key],
  }));
}

export function blendedSoulTraitsToMetadataAttributes(
  traits: BlendedSoulTraitSet,
): SoulGeneratedTraitAttribute[] {
  return [
    { category: "gas_aura_cloud", traitType: "Palette", value: traits.core.palette },
    { category: "expression", traitType: "Mood", value: traits.core.mood },
    { category: "character_archetype", traitType: "Form", value: traits.core.form },
    {
      category: "background",
      traitType: "Background Style",
      value: traits.core.background,
    },
    ...defaultSoulTraitsToMetadataAttributes(traits.defaults),
  ];
}

export function decodeSoulNftMetadataUri(uri: string): DecodedSoulNftMetadataJson | null {
  const jsonText = decodeMetadataDataUri(uri, "application/json");
  if (!jsonText) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonText) as Partial<{
      name: unknown;
      symbol: unknown;
      image: unknown;
      artTheme: unknown;
      generation: unknown;
      attributes: unknown;
    }>;
    if (typeof parsed.name !== "string" || typeof parsed.symbol !== "string") {
      return null;
    }
    const attributes = Array.isArray(parsed.attributes)
      ? parsed.attributes.filter(isSoulMetadataAttribute)
      : [];
    return {
      name: parsed.name,
      symbol: parsed.symbol,
      ...(typeof parsed.image === "string" ? { image: parsed.image } : {}),
      ...(typeof parsed.artTheme === "string" ? { artTheme: parsed.artTheme } : {}),
      ...(typeof parsed.generation === "string" ? { generation: parsed.generation } : {}),
      attributes,
      generatedTraits: generatedTraitAttributesFromMetadataAttributes(attributes),
      rarity: soulMetadataRarityFromAttributes(attributes),
    };
  } catch {
    return null;
  }
}

function decodeMetadataDataUri(uri: string, mimeType: string): string | null {
  const prefix = `data:${mimeType}`;
  if (!uri.startsWith(prefix)) {
    return null;
  }
  const commaIndex = uri.indexOf(",");
  if (commaIndex < 0) {
    return null;
  }
  const metadata = uri.slice(0, commaIndex).toLowerCase();
  const payload = uri.slice(commaIndex + 1);
  try {
    if (metadata.endsWith(";base64")) {
      return Buffer.from(payload, "base64").toString("utf8");
    }
    if (metadata.endsWith(";utf8") || metadata === prefix) {
      return decodeURIComponent(payload);
    }
  } catch {
    return null;
  }
  return null;
}

function isSoulMetadataAttribute(
  value: unknown,
): value is { trait_type: string; value: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "trait_type" in value &&
    typeof value.trait_type === "string" &&
    "value" in value &&
    typeof value.value === "string"
  );
}

function generatedTraitAttributesFromMetadataAttributes(
  attributes: Array<{ trait_type: string; value: string }>,
): SoulGeneratedTraitAttribute[] {
  return SOUL_TRAIT_METADATA_ATTRIBUTE_TYPES.flatMap(({ category, traitType }) => {
    const value = attributes.find((attribute) => attribute.trait_type === traitType)?.value;
    return value ? [{ category, traitType, value }] : [];
  });
}

function soulMetadataRarityFromAttributes(
  attributes: Array<{ trait_type: string; value: string }>,
): SoulMetadataRarity | null {
  const tier = attributes.find((attribute) => attribute.trait_type === "Rarity tier")?.value;
  const scoreRaw = attributes.find((attribute) => attribute.trait_type === "Soul Score")?.value;
  if (!isSoulRarityTier(tier) || !scoreRaw || !/^\d+$/.test(scoreRaw)) {
    return null;
  }
  const score = Number(scoreRaw);
  return Number.isSafeInteger(score) ? { tier, score } : null;
}

export function deriveSoulMetadataRarity(
  soul: SoulAccount,
  context: {
    nftMint?: PublicKey;
    generation?: string | number | bigint;
    artTheme?: string;
  } = {},
): SoulMetadataRarity {
  const generation = soulRarityPositiveInteger(
    context.generation ?? (soul.provenanceGeneration > 0n ? soul.provenanceGeneration : soul.generationCount),
  );
  let hash = SOUL_TRAIT_FNV_OFFSET_64;
  hash = mixSoulTraitBytes(hash, soul.mint.toBytes());
  hash = mixSoulTraitBytes(hash, new TextEncoder().encode(context.artTheme ?? resolveSoulTheme(soul).label));
  hash = mixSoulTraitBytes(hash, u64Le(generation ?? undefined));
  hash = mixSoulTraitBytes(hash, soul.provenanceSeedHash);
  hash = mixSoulTraitBytes(hash, soul.provenanceMint.toBytes());
  hash = mixSoulTraitBytes(hash, soul.provenanceSoul.toBytes());
  hash = mixSoulTraitBytes(hash, soul.provenanceTrader.toBytes());
  hash = mixSoulTraitBytes(hash, Uint8Array.of(Number(soul.provenanceSide)));
  hash = mixSoulTraitBytes(hash, u64Le(soul.provenanceAmount));
  hash = mixSoulTraitBytes(hash, u64Le(soul.provenanceTokenAmount));
  const percentile = Number(hash % 1000n);
  const score = 100 + Math.floor((percentile * 900) / 999);
  return { tier: soulRarityTierForPercentile(percentile), score };
}

function soulRarityPositiveInteger(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = value.toString().trim();
  return /^\d+$/.test(normalized) ? normalized : null;
}

function soulRarityTierForPercentile(percentile: number): SoulRarityTierId {
  if (percentile >= 995) {
    return "mythic";
  }
  if (percentile >= 970) {
    return "legendary";
  }
  if (percentile >= 900) {
    return "epic";
  }
  if (percentile >= 750) {
    return "rare";
  }
  if (percentile >= 500) {
    return "uncommon";
  }
  return "common";
}

function isSoulRarityTier(value: unknown): value is SoulRarityTierId {
  return (
    value === "common" ||
    value === "uncommon" ||
    value === "rare" ||
    value === "epic" ||
    value === "legendary" ||
    value === "mythic"
  );
}

export function decodeClaimAccount(data: Uint8Array): ClaimAccount {
  if (data.byteLength < CLAIM_ACCOUNT_SIZE) {
    throw new Error(
      `ClaimAccount data too small: expected ${CLAIM_ACCOUNT_SIZE}, got ${data.byteLength}`,
    );
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    soul: new PublicKey(data.slice(CLAIM_SOUL_OFFSET, CLAIM_CLAIMER_OFFSET)),
    claimer: new PublicKey(data.slice(CLAIM_CLAIMER_OFFSET, CLAIM_NFT_MINT_OFFSET)),
    nftMint: new PublicKey(data.slice(CLAIM_NFT_MINT_OFFSET, CLAIM_SEQUENCE_OFFSET)),
    sequence: view.getBigUint64(CLAIM_SEQUENCE_OFFSET, true),
    generationCount: view.getBigUint64(CLAIM_GENERATION_COUNT_OFFSET, true),
  };
}

function decodeReceiptLifecycleState(value: number): ReceiptLifecycleState {
  switch (value) {
    case RECEIPT_LIFECYCLE_STATE.Active:
      return "active";
    case RECEIPT_LIFECYCLE_STATE.Burned:
      return "burned";
    case RECEIPT_LIFECYCLE_STATE.Forfeited:
      return "forfeited";
    default:
      throw new Error(`Unknown receipt lifecycle state: ${value}`);
  }
}

export function decodeReceiptAccount(data: Uint8Array): ReceiptAccount {
  if (data.byteLength < RECEIPT_ACCOUNT_SIZE) {
    throw new Error(
      `ReceiptAccount data too small: expected ${RECEIPT_ACCOUNT_SIZE}, got ${data.byteLength}`,
    );
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    soul: new PublicKey(data.slice(RECEIPT_SOUL_OFFSET, RECEIPT_CLAIMANT_OFFSET)),
    claimant: new PublicKey(data.slice(RECEIPT_CLAIMANT_OFFSET, RECEIPT_TOKEN_MINT_OFFSET)),
    tokenMint: new PublicKey(data.slice(RECEIPT_TOKEN_MINT_OFFSET, RECEIPT_NFT_MINT_OFFSET)),
    nftMint: new PublicKey(data.slice(RECEIPT_NFT_MINT_OFFSET, RECEIPT_SEQUENCE_OFFSET)),
    sequence: view.getBigUint64(RECEIPT_SEQUENCE_OFFSET, true),
    generationCount: view.getBigUint64(RECEIPT_GENERATION_COUNT_OFFSET, true),
    boundQuantity: view.getBigUint64(RECEIPT_BOUND_QUANTITY_OFFSET, true),
    boundBoundary: view.getBigUint64(RECEIPT_BOUND_BOUNDARY_OFFSET, true),
    lifecycleState: decodeReceiptLifecycleState(data[RECEIPT_LIFECYCLE_STATE_OFFSET] ?? 0),
  };
}

export function decodeReceiptRegistryAccount(data: Uint8Array): ReceiptRegistryAccount {
  if (data.byteLength < RECEIPT_REGISTRY_ACCOUNT_SIZE) {
    throw new Error(
      `ReceiptRegistryAccount data too small: expected ${RECEIPT_REGISTRY_ACCOUNT_SIZE}, got ${data.byteLength}`,
    );
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    claimant: new PublicKey(
      data.slice(RECEIPT_REGISTRY_CLAIMANT_OFFSET, RECEIPT_REGISTRY_TOKEN_MINT_OFFSET),
    ),
    tokenMint: new PublicKey(
      data.slice(
        RECEIPT_REGISTRY_TOKEN_MINT_OFFSET,
        RECEIPT_REGISTRY_ACTIVE_RECEIPTS_OFFSET,
      ),
    ),
    activeReceipts: view.getBigUint64(RECEIPT_REGISTRY_ACTIVE_RECEIPTS_OFFSET, true),
    burnedReceipts: view.getBigUint64(RECEIPT_REGISTRY_BURNED_RECEIPTS_OFFSET, true),
    forfeitedReceipts: view.getBigUint64(RECEIPT_REGISTRY_FORFEITED_RECEIPTS_OFFSET, true),
  };
}

async function mapInBatches<T, U>(
  items: readonly T[],
  batchSize: number,
  mapper: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
  const results: U[] = [];

  for (let offset = 0; offset < items.length; offset += batchSize) {
    const batch = items.slice(offset, offset + batchSize);
    results.push(...(await Promise.all(batch.map((item, index) => mapper(item, offset + index)))));
  }

  return results;
}

async function getMultipleAccountInfosInBatches(
  connection: Connection,
  publicKeys: readonly PublicKey[],
  commitment: Commitment,
) {
  const results: Awaited<ReturnType<Connection["getMultipleAccountsInfo"]>> = [];

  for (let offset = 0; offset < publicKeys.length; offset += 99) {
    const batch = publicKeys.slice(offset, offset + 99);
    if (batch.length === 0) {
      continue;
    }
    results.push(...(await connection.getMultipleAccountsInfo(batch, commitment)));
  }

  return results;
}

type DecodedClaimWithPubkey = ClaimAccount & { claim: PublicKey };
type DecodedReceiptWithPubkey = ReceiptAccount & { receiptAccount: PublicKey };

function receiptLifecycleFilter(
  options: Pick<ListClaimedSoulNftsByMintOptions, "receiptLifecycle">,
): "active" | "all" {
  return options.receiptLifecycle ?? "active";
}

function receiptMatchesLifecycle(
  receipt: ReceiptAccount,
  options: Pick<ListClaimedSoulNftsByMintOptions, "receiptLifecycle">,
): boolean {
  return receiptLifecycleFilter(options) === "all" || receipt.lifecycleState === "active";
}

function compareReceiptsByNewestSequence(
  left: DecodedReceiptWithPubkey,
  right: DecodedReceiptWithPubkey,
): number {
  if (left.sequence === right.sequence) {
    return left.receiptAccount.toBase58().localeCompare(right.receiptAccount.toBase58());
  }
  return left.sequence > right.sequence ? -1 : 1;
}

function decodeReceiptAccounts(
  accounts: Awaited<ReturnType<Connection["getProgramAccounts"]>>,
  options: Pick<ListClaimedSoulNftsByMintOptions, "receiptLifecycle">,
): DecodedReceiptWithPubkey[] {
  return accounts
    .flatMap((account) => {
      try {
        const receipt = decodeReceiptAccount(account.account.data);
        return receiptMatchesLifecycle(receipt, options)
          ? [{ receiptAccount: account.pubkey, ...receipt }]
          : [];
      } catch {
        return [];
      }
    })
    .sort(compareReceiptsByNewestSequence);
}

async function hydrateClaimedSoulNft(
  connection: Connection,
  claim: DecodedClaimWithPubkey,
  options: ListClaimedSoulNftsByMintOptions,
  knownTokenMint?: PublicKey,
): Promise<ClaimedSoulNft | null> {
  const programIds = resolveProgramIds(options.programIds);

  try {
    const metadataAuthority = deriveNftAuthorityPda(
      claim.soul,
      claim.sequence,
      programIds.soulGenerator,
    );
    let tokenMint: PublicKey | null = knownTokenMint ?? null;
    let soulAccount: SoulAccount | null = null;
    try {
      const soulAccountInfo = await connection.getAccountInfo(
        claim.soul,
        options.commitment ?? "confirmed",
      );
      soulAccount = soulAccountInfo ? decodeSoulAccount(soulAccountInfo.data) : null;
      tokenMint = tokenMint ?? soulAccount?.mint ?? null;
    } catch {
      soulAccount = null;
      tokenMint = tokenMint ?? null;
    }

    let metadata: ClaimedSoulNftMetadata | null = null;
    if (options.fetchMetadata ?? true) {
      try {
        const tokenMetadata = await getTokenMetadata(
          connection,
          claim.nftMint,
          options.commitment ?? "confirmed",
          TOKEN_2022_PROGRAM_ID,
        );
        metadata = tokenMetadata
          ? {
              name: tokenMetadata.name,
              symbol: tokenMetadata.symbol,
              uri: tokenMetadata.uri,
            }
          : null;
      } catch {
        metadata = null;
      }
    }

    return {
      ...claim,
      tokenMint,
      metadataAuthority,
      metadata,
      soulAccount,
    };
  } catch {
    return null;
  }
}

async function hydrateReceiptBackedClaimedSoulNft(
  connection: Connection,
  receipt: DecodedReceiptWithPubkey,
  options: ListClaimedSoulNftsByMintOptions,
): Promise<ClaimedSoulNft | null> {
  const programIds = resolveProgramIds(options.programIds);
  const claim: DecodedClaimWithPubkey = {
    claim: deriveClaimPda(receipt.soul, receipt.sequence, programIds.soulGenerator),
    soul: receipt.soul,
    claimer: receipt.claimant,
    nftMint: receipt.nftMint,
    sequence: receipt.sequence,
    generationCount: receipt.generationCount,
  };
  const hydrated = await hydrateClaimedSoulNft(
    connection,
    claim,
    options,
    receipt.tokenMint,
  );
  if (!hydrated) {
    return null;
  }

  const { receiptAccount: receiptAccountAddress, ...receiptFields } = receipt;
  return {
    ...hydrated,
    receiptAccount: receiptAccountAddress,
    receipt: receiptFields,
    receiptLifecycleState: receipt.lifecycleState,
  };
}

export async function listClaimedSoulNftsByMint(
  connection: Connection,
  mint: PublicKeyLike,
  options: ListClaimedSoulNftsByMintOptions = {},
): Promise<ClaimedSoulNftPage> {
  const page = normalizePositiveInteger(options.page ?? 1, "page");
  const pageSize = normalizePositiveInteger(options.pageSize ?? 24, "pageSize");
  const programIds = resolveProgramIds(options.programIds);
  const soul = deriveSoulPda(mint, programIds.soulGenerator);
  const accounts = await connection.getProgramAccounts(programIds.soulGenerator, {
    commitment: options.commitment ?? "confirmed",
    filters: [
      { dataSize: RECEIPT_ACCOUNT_SIZE },
      { memcmp: { offset: RECEIPT_SOUL_OFFSET, bytes: soul.toBase58() } },
    ],
  });
  const sortedReceipts = decodeReceiptAccounts(accounts, options);
  const start = (page - 1) * pageSize;
  const pagedReceipts = sortedReceipts.slice(start, start + pageSize);
  const itemsWithBadClaims = await mapInBatches(pagedReceipts, 8, async (receipt) => {
    return hydrateReceiptBackedClaimedSoulNft(connection, receipt, options);
  });
  const items = itemsWithBadClaims.filter((item): item is ClaimedSoulNft => item !== null);

  return {
    items,
    page,
    pageSize,
    total: sortedReceipts.length,
    hasNextPage: start + pageSize < sortedReceipts.length,
  };
}

export async function listClaimedSoulNftsByClaimer(
  connection: Connection,
  claimer: PublicKeyLike,
  options: ListClaimedSoulNftsOptions = {},
): Promise<ClaimedSoulNftPage> {
  const page = normalizePositiveInteger(options.page ?? 1, "page");
  const pageSize = normalizePositiveInteger(options.pageSize ?? 24, "pageSize");
  const programIds = resolveProgramIds(options.programIds);
  const claimerPublicKey = asPublicKey(claimer);
  const accounts = await connection.getProgramAccounts(programIds.soulGenerator, {
    commitment: options.commitment ?? "confirmed",
    filters: [
      { dataSize: RECEIPT_ACCOUNT_SIZE },
      { memcmp: { offset: RECEIPT_CLAIMANT_OFFSET, bytes: claimerPublicKey.toBase58() } },
    ],
  });
  const sortedReceipts = decodeReceiptAccounts(accounts, options);
  const start = (page - 1) * pageSize;
  const pagedReceipts = sortedReceipts.slice(start, start + pageSize);
  const itemsWithBadClaims = await mapInBatches(pagedReceipts, 8, async (receipt) => {
    return hydrateReceiptBackedClaimedSoulNft(connection, receipt, options);
  });
  const items = itemsWithBadClaims.filter((item): item is ClaimedSoulNft => item !== null);

  return {
    items,
    page,
    pageSize,
    total: sortedReceipts.length,
    hasNextPage: start + pageSize < sortedReceipts.length,
  };
}

export async function listClaimedSoulNfts(
  connection: Connection,
  options: ListClaimedSoulNftsOptions = {},
): Promise<ClaimedSoulNftPage> {
  const page = normalizePositiveInteger(options.page ?? 1, "page");
  const pageSize = normalizePositiveInteger(options.pageSize ?? 24, "pageSize");
  const programIds = resolveProgramIds(options.programIds);
  const accounts = await connection.getProgramAccounts(programIds.soulGenerator, {
    commitment: options.commitment ?? "confirmed",
    filters: [{ dataSize: RECEIPT_ACCOUNT_SIZE }],
  });
  const sortedReceipts = decodeReceiptAccounts(accounts, options);
  const start = (page - 1) * pageSize;
  const pagedReceipts = sortedReceipts.slice(start, start + pageSize);
  const itemsWithBadClaims = await mapInBatches(pagedReceipts, 8, async (receipt) => {
    return hydrateReceiptBackedClaimedSoulNft(connection, receipt, options);
  });
  const items = itemsWithBadClaims.filter((item): item is ClaimedSoulNft => item !== null);

  return {
    items,
    page,
    pageSize,
    total: sortedReceipts.length,
    hasNextPage: start + pageSize < sortedReceipts.length,
  };
}

export async function listClaimedSoulNftsByNftMints(
  connection: Connection,
  nftMints: readonly PublicKeyLike[],
  options: ListClaimedSoulNftsByNftMintsOptions = {},
): Promise<Map<string, ClaimedSoulNft>> {
  const programIds = resolveProgramIds(options.programIds);
  const uniqueMints = Array.from(
    new Map(
      nftMints.map((mint) => {
        const publicKey = asPublicKey(mint);
        return [publicKey.toBase58(), publicKey] as const;
      }),
    ).values(),
  );

  const entries = await mapInBatches(uniqueMints, 8, async (nftMint) => {
    const accounts = await connection.getProgramAccounts(programIds.soulGenerator, {
      commitment: options.commitment ?? "confirmed",
      filters: [
        { dataSize: RECEIPT_ACCOUNT_SIZE },
        { memcmp: { offset: RECEIPT_NFT_MINT_OFFSET, bytes: nftMint.toBase58() } },
      ],
    });
    const firstReceipt = decodeReceiptAccounts(accounts, options)[0];
    if (!firstReceipt) {
      return null;
    }

    const hydrated = await hydrateReceiptBackedClaimedSoulNft(connection, firstReceipt, options);
    return hydrated ? ([nftMint.toBase58(), hydrated] as const) : null;
  });

  return new Map(entries.filter((entry): entry is readonly [string, ClaimedSoulNft] => entry !== null));
}

export async function listBondingCurveTokens(
  connection: Connection,
  options: ListBondingCurveTokensOptions = {},
): Promise<LaunchedTokenPage> {
  const page = normalizePositiveInteger(options.page ?? 1, "page");
  const pageSize = normalizePositiveInteger(options.pageSize ?? 24, "pageSize");
  const programIds = resolveProgramIds(options.programIds);
  const commitment = options.commitment ?? "confirmed";
  const accountSizes = Array.from(
    new Set([
      BONDING_CURVE_ACCOUNT_SIZE,
    ]),
  );
  const accountsBySize = await Promise.all(
    accountSizes.map((dataSize) =>
      connection.getProgramAccounts(programIds.bondingCurve, {
        commitment,
        filters: [{ dataSize }],
      }),
    ),
  );
  const seenCurves = new Set<string>();
  const decodedCurves = accountsBySize.flatMap((accounts) =>
    accounts.flatMap((account) => {
      const curveKey = account.pubkey.toBase58();
      if (seenCurves.has(curveKey)) {
        return [];
      }
      seenCurves.add(curveKey);

      try {
        const bondingCurve = decodeBondingCurveAccount(account.account.data);
        const soul = deriveSoulPda(bondingCurve.mint, programIds.soulGenerator);
        return [
          {
            curve: account.pubkey,
            soul,
            mint: bondingCurve.mint,
            bondingCurve,
          },
        ];
      } catch {
        return [];
      }
    }),
  );
  const soulAccounts = await getMultipleAccountInfosInBatches(
    connection,
    decodedCurves.map((item) => item.soul),
    commitment,
  );
  const tokens = decodedCurves
    .map((item, index): LaunchedToken => {
      const account = soulAccounts[index];
      let soulAccount: SoulAccount | null = null;
      if (account) {
        try {
          soulAccount = decodeSoulAccount(account.data);
        } catch {
          soulAccount = null;
        }
      }

      return {
        ...item,
        soulAccount,
        createdAt: soulAccount?.createdAt ?? null,
      };
    })
    .sort(compareLaunchedTokensByRecentCreation);
  const start = (page - 1) * pageSize;

  return {
    items: tokens.slice(start, start + pageSize),
    page,
    pageSize,
    total: tokens.length,
    hasNextPage: start + pageSize < tokens.length,
  };
}

export async function fetchSoul(
  connection: Connection,
  mintOrSoul: PublicKeyLike,
  options: {
    soul?: PublicKeyLike;
    commitment?: Commitment;
    programIds?: ProgramIdOverrides;
    includeGenerationHistory?: boolean;
    generationApiBaseUrl?: string;
    provenanceFetch?: FetchLike;
  } = {},
): Promise<SoulAccount> {
  const soul = asPublicKey(
    options.soul ??
      deriveSoulPda(mintOrSoul, options.programIds?.soulGenerator ?? PROGRAM_IDS.soulGenerator),
  );
  const account = await connection.getAccountInfo(soul, options.commitment ?? "confirmed");
  if (!account) {
    throw new Error(`SoulAccount not found: ${soul.toBase58()}`);
  }
  const decoded = decodeSoulAccount(account.data);
  if (options.includeGenerationHistory) {
    decoded.historicalGenerationProvenance = await fetchSoulGenerationProvenance({
      soul,
      apiBaseUrl: options.generationApiBaseUrl,
      fetch: options.provenanceFetch,
    });
  }
  return decoded;
}

export async function fetchBondingCurve(
  connection: Connection,
  mintOrCurve: PublicKeyLike,
  options: { curve?: PublicKeyLike; commitment?: Commitment; programIds?: ProgramIdOverrides } = {},
): Promise<BondingCurveAccount> {
  const curve = asPublicKey(
    options.curve ??
      deriveCurvePda(mintOrCurve, options.programIds?.bondingCurve ?? PROGRAM_IDS.bondingCurve),
  );
  const account = await connection.getAccountInfo(curve, options.commitment ?? "confirmed");
  if (!account) {
    throw new Error(`BondingCurveAccount not found: ${curve.toBase58()}`);
  }
  return decodeBondingCurveAccount(account.data);
}

export async function fetchTokenGenerationProvenance(
  options: Omit<FetchGenerationProvenanceOptions, "soul"> & { mint: PublicKeyLike },
): Promise<GenerationProvenance[]> {
  return fetchGenerationProvenanceRows({
    ...options,
    mint: options.mint,
  });
}

export async function fetchSoulGenerationProvenance(
  options: Omit<FetchGenerationProvenanceOptions, "mint"> & { soul: PublicKeyLike },
): Promise<GenerationProvenance[]> {
  return fetchGenerationProvenanceRows({
    ...options,
    soul: options.soul,
  });
}

export async function fetchGenerationProvenanceRows(
  options: FetchGenerationProvenanceOptions = {},
): Promise<GenerationProvenance[]> {
  const url = generationProvenanceApiUrl(options);
  const fetchImpl = options.fetch ?? defaultFetch();
  const response = await fetchImpl(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Generation provenance API failed with HTTP ${response.status}`);
  }

  const body = await response.json();
  const rows = readGenerationRows(body);
  return rows.map(decodeGenerationProvenanceRow);
}

export function decodeSoulAccount(data: Uint8Array): SoulAccount {
  if (data.byteLength < SOUL_ACCOUNT_PRE_M3_LEGACY_SIZE) {
    throw new Error(
      `SoulAccount data too small: expected ${SOUL_ACCOUNT_PRE_M3_LEGACY_SIZE}, got ${data.byteLength}`,
    );
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const lastSvgLen = view.getUint16(80, true);
  if (lastSvgLen > LAST_SVG_CAPACITY) {
    throw new Error(`Invalid SoulAccount SVG length: ${lastSvgLen}`);
  }
  const templateLen = view.getUint16(TEMPLATE_LEN_OFFSET, true);
  if (templateLen > BASE_SVG_TEMPLATE_CAPACITY) {
    throw new Error(`Invalid SoulAccount template length: ${templateLen}`);
  }
  const styleParamsLen = view.getUint16(STYLE_PARAMS_LEN_OFFSET, true);
  if (styleParamsLen > STYLE_PARAMS_CAPACITY) {
    throw new Error(`Invalid SoulAccount style params length: ${styleParamsLen}`);
  }

  const lastSvgBytes = data.slice(LAST_SVG_OFFSET, LAST_SVG_OFFSET + lastSvgLen);
  const baseSvgTemplateBytes = data.slice(
    BASE_SVG_TEMPLATE_OFFSET,
    BASE_SVG_TEMPLATE_OFFSET + templateLen,
  );
  const styleParamsBytes = data.slice(
    STYLE_PARAMS_OFFSET,
    STYLE_PARAMS_OFFSET + styleParamsLen,
  );
  const memeSymbolLen =
    data.byteLength >= SOUL_ACCOUNT_LEGACY_SIZE ? (data[MEME_SYMBOL_LEN_OFFSET] ?? 0) : 0;
  if (memeSymbolLen > MEME_SYMBOL_CAPACITY) {
    throw new Error(`Invalid SoulAccount meme symbol length: ${memeSymbolLen}`);
  }
  const memeSymbolBytes = data.slice(
    MEME_SYMBOL_OFFSET,
    MEME_SYMBOL_OFFSET + memeSymbolLen,
  );
  if (!isAscii(memeSymbolBytes)) {
    throw new Error("Invalid SoulAccount meme symbol: expected ASCII bytes");
  }
  const targetAmm =
    data.byteLength >= SOUL_ACCOUNT_PRE_PD7_LEGACY_SIZE
      ? assertTargetAmm(data[SOUL_TARGET_AMM_OFFSET] ?? TARGET_AMM.Raydium, "SoulAccount")
      : TARGET_AMM.Raydium;
  const hasProvenance =
    data.byteLength >= SOUL_ACCOUNT_PRE_PROVENANCE_TOKEN_AMOUNT_SIZE;
  const hasProvenanceTokenAmount = data.byteLength >= SOUL_ACCOUNT_SIZE;
  const provenanceSide = hasProvenance
    ? assertSoulProvenanceSide(data[SOUL_PROVENANCE_SIDE_OFFSET] ?? 0)
    : SOUL_PROVENANCE_SIDE.None;
  const provenanceSeedHash = hasProvenance
    ? data.slice(
        SOUL_PROVENANCE_SEED_HASH_OFFSET,
        SOUL_PROVENANCE_SEED_HASH_OFFSET + SOUL_PROVENANCE_SEED_HASH_LEN,
      )
    : new Uint8Array(SOUL_PROVENANCE_SEED_HASH_LEN);

  const decoded: SoulAccount = {
    mint: new PublicKey(data.slice(0, 32)),
    authority: new PublicKey(data.slice(32, 64)),
    createdAt: view.getBigInt64(64, true),
    generationCount: view.getBigUint64(72, true),
    lastSvgLen,
    lastSvg: new TextDecoder().decode(lastSvgBytes),
    lastSvgBytes,
    templateLen,
    baseSvgTemplate: new TextDecoder().decode(baseSvgTemplateBytes),
    baseSvgTemplateBytes,
    styleParamsLen,
    styleParams: new TextDecoder().decode(styleParamsBytes),
    styleParamsBytes,
    minClaimBalance: view.getBigUint64(MIN_CLAIM_BALANCE_OFFSET, true),
    claimCount: view.getBigUint64(CLAIM_COUNT_OFFSET, true),
    memeSymbolLen,
    memeSymbol: new TextDecoder().decode(memeSymbolBytes),
    memeSymbolBytes,
    targetAmm,
    provenanceGeneration: hasProvenance
      ? view.getBigUint64(SOUL_PROVENANCE_GENERATION_OFFSET, true)
      : 0n,
    provenanceSide,
    provenanceAmount: hasProvenance
      ? view.getBigUint64(SOUL_PROVENANCE_AMOUNT_OFFSET, true)
      : 0n,
    provenanceTokenAmount: hasProvenanceTokenAmount
      ? view.getBigUint64(SOUL_PROVENANCE_TOKEN_AMOUNT_OFFSET, true)
      : 0n,
    provenanceTrader: new PublicKey(
      hasProvenance
        ? data.slice(SOUL_PROVENANCE_TRADER_OFFSET, SOUL_PROVENANCE_TOKEN_ACCOUNT_OFFSET)
        : new Uint8Array(32),
    ),
    provenanceTokenAccount: new PublicKey(
      hasProvenance
        ? data.slice(SOUL_PROVENANCE_TOKEN_ACCOUNT_OFFSET, SOUL_PROVENANCE_MINT_OFFSET)
        : new Uint8Array(32),
    ),
    provenanceMint: new PublicKey(
      hasProvenance
        ? data.slice(SOUL_PROVENANCE_MINT_OFFSET, SOUL_PROVENANCE_SOUL_OFFSET)
        : new Uint8Array(32),
    ),
    provenanceSoul: new PublicKey(
      hasProvenance
        ? data.slice(SOUL_PROVENANCE_SOUL_OFFSET, SOUL_PROVENANCE_SEED_HASH_OFFSET)
        : new Uint8Array(32),
    ),
    provenanceSeedHash,
    provenanceSeedHashHex: Buffer.from(provenanceSeedHash).toString("hex"),
    artTheme: resolveSoulTheme({
      templateLen,
      styleParams: styleParamsBytes,
    }),
    latestGenerationProvenance: null,
  };
  decoded.latestGenerationProvenance = generationProvenanceFromSoul(decoded);
  return decoded;
}

export function resolveSoulTheme(_input: {
  templateLen?: number;
  styleParams?: string | Uint8Array;
}): ResolvedSoulTheme {
  const templateLen = _input.templateLen ?? 0;
  if (templateLen > 0) {
    return themeInfo("custom");
  }

  const styleParams =
    typeof _input.styleParams === "string"
      ? _input.styleParams
      : _input.styleParams
        ? new TextDecoder().decode(_input.styleParams)
        : "";
  const params = parseStyleParams(styleParams);
  const explicitTheme = params.get("theme");
  if (explicitTheme) {
    const normalizedTheme = explicitTheme.toLowerCase();
    if (normalizedTheme === "custom") {
      return themeInfo("custom");
    }
    const builtInTheme = canonicalBuiltInThemeInfo(normalizedTheme);
    if (builtInTheme) {
      return builtInTheme;
    }
    return themeInfo("legacy");
  }

  if (params.get("mode") === "hexagram") {
    return themeInfo("legacy");
  }

  return themeInfo("fractal");
}

const SOUL_TRAIT_FNV_OFFSET_64 = 0xcbf29ce484222325n;
const SOUL_TRAIT_FNV_PRIME_64 = 0x100000001b3n;
const SOUL_TRAIT_FNV_MASK_64 = 0xffffffffffffffffn;
const SOUL_TRAIT_DOMAIN = new TextEncoder().encode("solsoul:traits:v1");
const CORE_TRAIT_DOMAIN = new TextEncoder().encode("solsoul:core_traits:v1");

export function deriveDefaultSoulTraits(input: DefaultSoulTraitInput): DefaultSoulTraitSet {
  return {
    characterArchetype: selectDefaultSoulTrait("character_archetype", input),
    gogglesEyes: selectDefaultSoulTrait("goggles_eyes", input),
    expression: selectDefaultSoulTrait("expression", input),
    gasAuraCloud: selectDefaultSoulTrait("gas_aura_cloud", input),
    background: selectDefaultSoulTrait("background", input),
    outfit: selectDefaultSoulTrait("outfit", input),
    relic: selectDefaultSoulTrait("relic", input),
    animationBehavior: selectDefaultSoulTrait("animation_behavior", input),
    gasLevel: selectDefaultSoulTrait("gas_level", input),
  };
}

export function parseCoreArtTraitStyleParams(
  styleParams: string | Uint8Array = "",
): CoreArtTraitSelection {
  const params =
    typeof styleParams === "string" ? styleParams : new TextDecoder().decode(styleParams);
  const selection: Partial<Record<CoreArtTraitCategoryId, string>> = {};
  let selectedCount = 0;
  for (const pair of params.split(";")) {
    if (!pair) {
      continue;
    }
    const equals = pair.indexOf("=");
    if (equals <= 0) {
      continue;
    }
    const key = pair.slice(0, equals);
    const value = pair.slice(equals + 1);
    const category = CORE_ART_TRAIT_CATEGORIES.find((entry) => entry.styleKey === key);
    if (!category) {
      continue;
    }
    if (!isCoreArtTraitValue(category.id, value)) {
      throw new Error(`Invalid ${category.id} art trait value: ${value || "<empty>"}`);
    }
    if (selection[category.id]) {
      throw new Error(`Duplicate ${category.id} art trait selection`);
    }
    selection[category.id] = value;
    selectedCount += 1;
    if (selectedCount > MAX_USER_CORE_TRAIT_SELECTIONS) {
      throw new Error(
        `Select at most ${MAX_USER_CORE_TRAIT_SELECTIONS} core art traits`,
      );
    }
  }
  return selection as CoreArtTraitSelection;
}

export function validateCoreArtTraitStyleParams(
  styleParams: string | Uint8Array = "",
): void {
  parseCoreArtTraitStyleParams(styleParams);
}

export function encodeCoreArtTraitStyleParams(
  selection: CoreArtTraitSelection,
  baseStyleParams: string = "",
): string {
  const normalizedSelection = normalizeCoreArtTraitSelection(selection);
  const existingPairs = baseStyleParams
    .split(";")
    .filter((pair) => pair.length > 0)
    .filter((pair) => {
      const key = pair.slice(0, pair.indexOf("=") >= 0 ? pair.indexOf("=") : pair.length);
      return !CORE_ART_TRAIT_CATEGORIES.some((category) => category.styleKey === key);
    });
  const traitPairs = CORE_ART_TRAIT_CATEGORIES.flatMap((category) => {
    const value = normalizedSelection[category.id];
    return value ? [`${category.styleKey}=${value}`] : [];
  });
  return [...existingPairs, ...traitPairs].join(";");
}

export function deriveFinalCoreArtTraits(input: BlendedSoulTraitInput): FinalCoreArtTraits {
  const selection = parseCoreArtTraitStyleParams(input.styleParams ?? "");
  return {
    palette: selection.palette ?? selectCoreArtTrait("palette", input),
    mood: selection.mood ?? selectCoreArtTrait("mood", input),
    form: selection.form ?? selectCoreArtTrait("form", input),
    background: selection.background ?? selectCoreArtTrait("background", input),
  };
}

export function deriveBlendedSoulTraits(input: BlendedSoulTraitInput): BlendedSoulTraitSet {
  return {
    defaults: deriveDefaultSoulTraits(input),
    core: deriveFinalCoreArtTraits(input),
  };
}

function selectDefaultSoulTrait(
  categoryId: DefaultSoulTraitCategoryId,
  input: DefaultSoulTraitInput,
): string {
  const category = DEFAULT_SOUL_TRAIT_CATEGORIES.find((entry) => entry.id === categoryId);
  if (!category) {
    throw new Error(`Unknown default Soul trait category: ${categoryId}`);
  }
  const totalWeight = category.options.reduce((sum, option) => sum + option.weight, 0);
  let bucket = Number(defaultSoulTraitHash(categoryId, input) % BigInt(totalWeight));
  for (const option of category.options) {
    if (bucket < option.weight) {
      return option.id;
    }
    bucket -= option.weight;
  }
  return category.options[category.options.length - 1].id;
}

function selectCoreArtTrait<T extends CoreArtTraitCategoryId>(
  categoryId: T,
  input: DefaultSoulTraitInput,
): FinalCoreArtTraits[T] {
  const category = CORE_ART_TRAIT_CATEGORIES.find((entry) => entry.id === categoryId);
  if (!category) {
    throw new Error(`Unknown core art trait category: ${categoryId}`);
  }
  const totalWeight = category.options.reduce((sum, option) => sum + option.weight, 0);
  let bucket = Number(coreArtTraitHash(categoryId, input) % BigInt(totalWeight));
  for (const option of category.options) {
    if (bucket < option.weight) {
      return option.id as FinalCoreArtTraits[T];
    }
    bucket -= option.weight;
  }
  return category.options[category.options.length - 1].id as FinalCoreArtTraits[T];
}

function defaultSoulTraitHash(
  categoryId: DefaultSoulTraitCategoryId,
  input: DefaultSoulTraitInput,
): bigint {
  let hash = SOUL_TRAIT_FNV_OFFSET_64;
  hash = mixSoulTraitBytes(hash, SOUL_TRAIT_DOMAIN);
  hash = mixSoulTraitBytes(hash, Uint8Array.of(0xff));
  hash = mixSoulTraitBytes(hash, new TextEncoder().encode(categoryId));
  hash = mixSoulTraitBytes(hash, Uint8Array.of(0xfe));
  hash = mixSoulTraitBytes(hash, new TextEncoder().encode(normalizeSoulTraitTheme(input.theme)));
  hash = mixSoulTraitBytes(hash, Uint8Array.of(normalizeSoulTraitSide(input.provenanceSide)));
  hash = mixSoulTraitBytes(hash, u64Le(input.generation));
  hash = mixSoulTraitBytes(hash, u64Le(input.amount));
  hash = mixSoulTraitBytes(hash, u64Le(input.tokenAmount));
  return mixSoulTraitBytes(hash, normalizeSoulTraitSeed(input.seed));
}

function coreArtTraitHash(
  categoryId: CoreArtTraitCategoryId,
  input: DefaultSoulTraitInput,
): bigint {
  let hash = SOUL_TRAIT_FNV_OFFSET_64;
  hash = mixSoulTraitBytes(hash, CORE_TRAIT_DOMAIN);
  hash = mixSoulTraitBytes(hash, Uint8Array.of(0xff));
  hash = mixSoulTraitBytes(hash, new TextEncoder().encode(categoryId));
  hash = mixSoulTraitBytes(hash, Uint8Array.of(0xfe));
  hash = mixSoulTraitBytes(hash, new TextEncoder().encode(normalizeSoulTraitTheme(input.theme)));
  hash = mixSoulTraitBytes(hash, Uint8Array.of(normalizeSoulTraitSide(input.provenanceSide)));
  hash = mixSoulTraitBytes(hash, u64Le(input.generation));
  hash = mixSoulTraitBytes(hash, u64Le(input.amount));
  hash = mixSoulTraitBytes(hash, u64Le(input.tokenAmount));
  return mixSoulTraitBytes(hash, normalizeSoulTraitSeed(input.seed));
}

function normalizeCoreArtTraitSelection(
  selection: CoreArtTraitSelection,
): CoreArtTraitSelection {
  const selectedEntries = CORE_ART_TRAIT_CATEGORIES.flatMap((category) => {
    const value = selection[category.id];
    if (!value) {
      return [];
    }
    if (!isCoreArtTraitValue(category.id, value)) {
      throw new Error(`Invalid ${category.id} art trait value: ${value}`);
    }
    return [[category.id, value] as const];
  });
  if (selectedEntries.length > MAX_USER_CORE_TRAIT_SELECTIONS) {
    throw new Error(`Select at most ${MAX_USER_CORE_TRAIT_SELECTIONS} core art traits`);
  }
  return Object.fromEntries(selectedEntries) as CoreArtTraitSelection;
}

function isCoreArtTraitValue(
  categoryId: CoreArtTraitCategoryId,
  value: string,
): value is NonNullable<CoreArtTraitSelection[typeof categoryId]> {
  return CORE_ART_TRAIT_CATEGORIES.some(
    (category) =>
      category.id === categoryId &&
      category.options.some((option) => option.id === value),
  );
}

function mixSoulTraitBytes(hash: bigint, bytes: Uint8Array): bigint {
  let mixed = hash;
  for (const byte of bytes) {
    mixed ^= BigInt(byte);
    mixed = (mixed * SOUL_TRAIT_FNV_PRIME_64) & SOUL_TRAIT_FNV_MASK_64;
  }
  return mixed;
}

function normalizeSoulTraitSeed(seed: Uint8Array | string): Uint8Array {
  return typeof seed === "string" ? new TextEncoder().encode(seed) : seed;
}

function normalizeSoulTraitTheme(theme: string | undefined): string {
  if (
    theme === "neonpuff" ||
    theme === "soulpuff" ||
    theme === "monochrome" ||
    theme === "hexagram" ||
    theme === "signal" ||
    theme === "fractal" ||
    theme === "field" ||
    theme === "lattice" ||
    theme === "chaos" ||
    theme === "harmonic" ||
    theme === "pixel_fractal" ||
    theme === "pixel_art" ||
    theme === "symphony" ||
    theme === "legacy" ||
    theme === "custom"
  ) {
    return theme;
  }
  return "legacy";
}

function normalizeSoulTraitSide(
  side: DefaultSoulTraitInput["provenanceSide"] | undefined,
): number {
  if (side === SOUL_PROVENANCE_SIDE.Buy || side === "buy") {
    return SOUL_PROVENANCE_SIDE.Buy;
  }
  if (side === SOUL_PROVENANCE_SIDE.Sell || side === "sell") {
    return SOUL_PROVENANCE_SIDE.Sell;
  }
  return SOUL_PROVENANCE_SIDE.None;
}

function u64Le(value: AmountLike | undefined): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt.asUintN(64, amountToBigInt(value)), true);
  return bytes;
}

function amountToBigInt(value: AmountLike | undefined): bigint {
  if (value === undefined || value === null) {
    return 0n;
  }
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    return BigInt(Math.trunc(value));
  }
  return BigInt(value);
}

function themeInfo(id: ArtThemeId): ResolvedSoulTheme {
  if (id === "neonpuff") {
    return { id, label: "NeonPuff Soul", renderer: "built-in" };
  }
  if (id === "soulpuff") {
    return { id, label: "SoulPuff", renderer: "built-in" };
  }
  if (id === "hexagram") {
    return { id, label: "Hexagram Oracle", renderer: "built-in" };
  }
  if (id === "signal") {
    return { id, label: "Signal Field", renderer: "built-in" };
  }
  if (id === "fractal") {
    return { id, label: "Fractal Structure", renderer: "built-in" };
  }
  if (id === "field") {
    return { id, label: "Vector Field", renderer: "built-in" };
  }
  if (id === "lattice") {
    return { id, label: "Crystal Lattice", renderer: "built-in" };
  }
  if (id === "chaos") {
    return { id, label: "Strange Attractor", renderer: "built-in" };
  }
  if (id === "harmonic") {
    return { id, label: "Harmonic Wave", renderer: "built-in" };
  }
  if (id === "pixel_fractal") {
    return { id, label: "Pixel Fractal", renderer: "built-in" };
  }
  if (id === "pixel_art") {
    return { id, label: "Pixel Art", renderer: "built-in" };
  }
  if (id === "symphony") {
    return { id, label: "Symphony", renderer: "built-in" };
  }
  if (id === "legacy") {
    return { id, label: "Legacy / unknown art theme", renderer: "built-in" };
  }
  if (id === "custom") {
    return { id, label: "Custom Template", renderer: "custom-template" };
  }
  return { id: "monochrome", label: "Monochrome Soul", renderer: "built-in" };
}

function canonicalBuiltInThemeInfo(theme: string): ResolvedSoulTheme | undefined {
  if (theme === "fractal") {
    return themeInfo("fractal");
  }
  if (theme === "field") {
    return themeInfo("field");
  }
  if (theme === "lattice") {
    return themeInfo("lattice");
  }
  if (theme === "chaos") {
    return themeInfo("chaos");
  }
  if (theme === "harmonic") {
    return themeInfo("harmonic");
  }
  if (theme === "pixelfractal") {
    return themeInfo("pixel_fractal");
  }
  if (theme === "pixelart") {
    return themeInfo("pixel_art");
  }
  if (theme === "symphony") {
    return themeInfo("symphony");
  }
  return undefined;
}

function parseStyleParams(styleParams: string): Map<string, string> {
  const params = new Map<string, string>();
  for (const pair of styleParams.split(";")) {
    if (!pair) {
      continue;
    }
    const equals = pair.indexOf("=");
    if (equals <= 0 || equals === pair.length - 1) {
      continue;
    }
    params.set(pair.slice(0, equals), pair.slice(equals + 1));
  }
  return params;
}

export function decodeBondingCurveAccount(data: Uint8Array): BondingCurveAccount {
  if (data.byteLength < BONDING_CURVE_ACCOUNT_SIZE) {
    throw new Error(
      `BondingCurveAccount data too small: expected ${BONDING_CURVE_ACCOUNT_SIZE}, got ${data.byteLength}`,
    );
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const selfDeprecated = data[CURVE_SELF_DEPRECATED_OFFSET];
  if (selfDeprecated !== 0 && selfDeprecated !== 1) {
    throw new Error(`Invalid BondingCurveAccount selfDeprecated flag: ${selfDeprecated}`);
  }

  return {
    mint: new PublicKey(data.slice(0, CURVE_CUMULATIVE_SOL_OFFSET)),
    cumulativeSol: view.getBigUint64(CURVE_CUMULATIVE_SOL_OFFSET, true),
    totalMinted: view.getBigUint64(CURVE_TOTAL_MINTED_OFFSET, true),
    selfDeprecated: selfDeprecated === 1,
    lastInteractionSlot: view.getBigUint64(CURVE_LAST_INTERACTION_SLOT_OFFSET, true),
  };
}

export function decodeGlobalConfigAccount(data: Uint8Array): GlobalConfigAccount {
  if (data.byteLength < GLOBAL_CONFIG_ACCOUNT_SIZE) {
    throw new Error(
      `GlobalConfigAccount data too small: expected ${GLOBAL_CONFIG_ACCOUNT_SIZE}, got ${data.byteLength}`,
    );
  }
  const paused = data[GLOBAL_CONFIG_PAUSED_OFFSET];
  if (paused !== 0 && paused !== 1) {
    throw new Error(`Invalid GlobalConfigAccount paused flag: ${paused}`);
  }
  return {
    authority: new PublicKey(data.slice(GLOBAL_CONFIG_AUTHORITY_OFFSET, GLOBAL_CONFIG_PAUSED_OFFSET)),
    paused,
  };
}

function generationProvenanceFromSoul(soul: SoulAccount): GenerationProvenance | null {
  const side = soulProvenanceSideToTradeSide(soul.provenanceSide);
  if (!side || soul.provenanceGeneration === 0n) {
    return null;
  }

  return {
    generation: soul.provenanceGeneration,
    side,
    amount: soul.provenanceAmount,
    trader: soul.provenanceTrader,
    tokenAccount: soul.provenanceTokenAccount,
    tokenMint: soul.provenanceMint,
    soul: soul.provenanceSoul,
    seedHash: soul.provenanceSeedHashHex,
    source: "on-chain-soul-account",
  };
}

async function resolveTradeGenerationProvenance({
  connection,
  signature,
  mint,
  expectedSide,
  expectedAmount,
  trader,
  tokenAccount,
  commitment,
  programIds,
  generationApiBaseUrl,
  provenanceFetch,
}: {
  connection: Connection;
  signature: string;
  mint: PublicKey;
  expectedSide: GenerationTradeSide;
  expectedAmount: bigint;
  trader: PublicKey;
  tokenAccount: PublicKey;
  commitment: Commitment;
  programIds?: ProgramIdOverrides;
  generationApiBaseUrl?: string;
  provenanceFetch?: FetchLike;
}): Promise<TradeWithGenerationProvenanceResult> {
  let provenance: GenerationProvenance | null = null;
  try {
    const soul = await fetchSoul(connection, mint, { commitment, programIds });
    provenance = generationProvenanceFromSoul(soul);
    if (
      provenance &&
      !matchesTradeGeneration(provenance, {
        signature: undefined,
        mint,
        expectedSide,
        expectedAmount,
        trader,
        tokenAccount,
      })
    ) {
      provenance = null;
    }
  } catch {
    provenance = null;
  }

  if (!provenance && (generationApiBaseUrl || provenanceFetch)) {
    try {
      const rows = await fetchTokenGenerationProvenance({
        mint,
        apiBaseUrl: generationApiBaseUrl,
        fetch: provenanceFetch,
      });
      provenance =
        rows.find(
          (row) => matchesTradeGeneration(row, {
            signature,
            mint,
            expectedSide,
            expectedAmount,
            trader,
            tokenAccount,
          }),
        ) ??
        null;
    } catch {
      provenance = null;
    }
  }

  if (provenance) {
    const rpcContext = await finalizedSignatureContext(connection, signature);
    provenance = {
      ...provenance,
      signature,
      slot: rpcContext.slot,
      blockTime: rpcContext.blockTime,
      explorerUrl: devnetExplorerTxUrl(signature),
    };

    if (generationApiBaseUrl || provenanceFetch) {
      try {
        const rows = await fetchTokenGenerationProvenance({
          mint,
          generation: provenance.generation,
          apiBaseUrl: generationApiBaseUrl,
          fetch: provenanceFetch,
        });
        const row = rows.find(
          (candidate) => matchesTradeGeneration(candidate, {
            signature,
            mint,
            expectedSide,
            expectedAmount,
            trader,
            tokenAccount,
          }),
        );
        if (row) {
          provenance = row;
        }
      } catch {
        // The public API is a best-effort finalized read model. Keep the on-chain
        // SoulAccount + direct RPC context so callers still receive provenance.
      }
    }
  }

  return { signature, generationProvenance: provenance };
}

function matchesTradeGeneration(
  provenance: GenerationProvenance,
  expected: {
    signature?: string;
    mint: PublicKey;
    expectedSide: GenerationTradeSide;
    expectedAmount: bigint;
    trader: PublicKey;
    tokenAccount: PublicKey;
  },
): boolean {
  return (
    (expected.signature === undefined || provenance.signature === expected.signature) &&
    provenance.side === expected.expectedSide &&
    provenance.amount === expected.expectedAmount &&
    provenance.trader.equals(expected.trader) &&
    provenance.tokenAccount.equals(expected.tokenAccount) &&
    provenance.tokenMint.equals(expected.mint)
  );
}

async function finalizedSignatureContext(
  connection: Connection,
  signature: string,
): Promise<{ slot?: number; blockTime?: number | null }> {
  try {
    const transaction = await connection.getTransaction(signature, {
      commitment: "finalized",
      maxSupportedTransactionVersion: 0,
    });
    return {
      slot: transaction?.slot,
      blockTime: transaction?.blockTime ?? null,
    };
  } catch {
    return {};
  }
}

function generationProvenanceApiUrl(options: FetchGenerationProvenanceOptions): string {
  const baseUrl = (options.apiBaseUrl ?? "https://solsoul-devnet.vercel.app").replace(/\/+$/, "");
  const generation = options.generation === undefined ? undefined : BigInt(options.generation);
  if (generation !== undefined && generation < 0n) {
    throw new Error(`Invalid generation number: ${generation.toString()}`);
  }
  const limit = options.limit ?? DEFAULT_GENERATION_PROVENANCE_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`Invalid generation provenance limit: ${String(options.limit)}`);
  }
  const listQuery = generation === undefined ? `?limit=${limit.toString()}` : "";

  if (options.mint) {
    const mint = asPublicKey(options.mint).toBase58();
    return `${baseUrl}/api/token/${mint}/generations${generation === undefined ? listQuery : `/${generation.toString()}`}`;
  }
  if (options.soul) {
    const soul = asPublicKey(options.soul).toBase58();
    return `${baseUrl}/api/soul/${soul}/generations${generation === undefined ? listQuery : `/${generation.toString()}`}`;
  }
  return `${baseUrl}/api/generations?${generation === undefined ? "" : `generation=${generation.toString()}&`}limit=${limit.toString()}`;
}

function readGenerationRows(body: unknown): unknown[] {
  if (
    !body ||
    typeof body !== "object" ||
    !Array.isArray((body as { generations?: unknown }).generations)
  ) {
    throw new Error("Generation provenance API response missing generations array");
  }
  return (body as { generations: unknown[] }).generations;
}

function decodeGenerationProvenanceRow(row: unknown): GenerationProvenance {
  if (!row || typeof row !== "object") {
    throw new Error("Invalid generation provenance row");
  }
  const record = row as Record<string, unknown>;
  const side = record.side === "buy" || record.side === "sell" ? record.side : null;
  if (!side) {
    throw new Error(`Invalid generation provenance side: ${String(record.side)}`);
  }
  const signature = stringField(record, "signature");
  return {
    generation: BigInt(numberField(record, "generation")),
    side,
    amount: BigInt(stringField(record, "amount")),
    trader: new PublicKey(stringField(record, "trader")),
    tokenAccount: new PublicKey(stringField(record, "tokenAccount")),
    tokenMint: new PublicKey(stringField(record, "tokenMint")),
    soul: new PublicKey(stringField(record, "soul")),
    seedHash: stringField(record, "seedHash").toLowerCase(),
    signature,
    slot: numberField(record, "slot"),
    blockTime:
      record.blockTime === null || record.blockTime === undefined
        ? null
        : numberField(record, "blockTime"),
    explorerUrl: devnetExplorerTxUrl(signature),
    source: "finalized-rpc-logs",
  };
}

function defaultFetch(): FetchLike {
  if (typeof globalThis.fetch !== "function") {
    throw new Error("No fetch implementation available for generation provenance API");
  }
  return globalThis.fetch as FetchLike;
}

function stringField(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid generation provenance ${field}`);
  }
  return value;
}

function numberField(record: Record<string, unknown>, field: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`Invalid generation provenance ${field}`);
  }
  return value;
}

function soulProvenanceSideToTradeSide(
  side: SoulProvenanceSide,
): GenerationTradeSide | null {
  if (side === SOUL_PROVENANCE_SIDE.Buy) {
    return "buy";
  }
  if (side === SOUL_PROVENANCE_SIDE.Sell) {
    return "sell";
  }
  return null;
}

function devnetExplorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

function netBuyGenerationAmount(solIn: bigint): bigint {
  return solIn - ((solIn * 100n) / 10_000n);
}

function encodeMemeSymbol(symbol: string | Uint8Array | undefined): Uint8Array {
  if (symbol === undefined) {
    return new Uint8Array();
  }
  const bytes = typeof symbol === "string" ? new TextEncoder().encode(symbol) : symbol;
  if (bytes.length > MEME_SYMBOL_CAPACITY) {
    throw new RangeError(
      `Meme symbol must be at most ${MEME_SYMBOL_CAPACITY} ASCII bytes`,
    );
  }
  if (!isAscii(bytes)) {
    throw new Error("Meme symbol must contain ASCII bytes only");
  }
  return bytes;
}

function isAscii(bytes: Uint8Array): boolean {
  return bytes.every((byte) => byte <= 0x7f);
}

function bytesFromStringOrUint8Array(value: string | Uint8Array): Uint8Array {
  return typeof value === "string" ? new TextEncoder().encode(value) : value;
}

export function validateTemplateUploadBytes(
  templateBytes: Uint8Array,
  styleParamBytes: Uint8Array = new Uint8Array(),
): void {
  if (templateBytes.length > BASE_SVG_TEMPLATE_CAPACITY) {
    throw new RangeError(
      `Template SVG must fit on-chain capacity (${BASE_SVG_TEMPLATE_CAPACITY} bytes)`,
    );
  }
  if (styleParamBytes.length > STYLE_PARAMS_CAPACITY) {
    throw new RangeError(
      `Template style params must fit on-chain capacity (${STYLE_PARAMS_CAPACITY} bytes)`,
    );
  }
  validateCoreArtTraitStyleParams(styleParamBytes);
  assertTemplateUploadStyleParamsSupported(styleParamBytes, templateBytes.length > 0);
  if (templateBytes.length === 0) {
    const theme = resolveSoulTheme({ templateLen: 0, styleParams: styleParamBytes });
    if (theme.id === "custom") {
      throw new Error("Custom template mode requires non-empty SVG template bytes");
    }
    return;
  }
  const template = new TextDecoder().decode(templateBytes);
  const trimmedTemplate = template.trim();
  if (!trimmedTemplate.toLowerCase().startsWith("<svg")) {
    throw new Error("Template SVG must start with <svg");
  }
  if (!trimmedTemplate.toLowerCase().endsWith("</svg>")) {
    throw new Error("Template SVG must end with </svg>");
  }
  if (containsForbiddenTemplateReference(template)) {
    throw new Error("Template SVG must not contain active content, hrefs, URLs, or external references");
  }
  validateTemplateXmlIfParserAvailable(template);
}

function assertTemplateUploadStyleParamsSupported(
  styleParamBytes: Uint8Array,
  hasTemplate: boolean,
): void {
  const styleParams = new TextDecoder().decode(styleParamBytes);
  const params = parseStyleParams(styleParams);
  const explicitTheme = params.get("theme")?.toLowerCase();
  if (explicitTheme) {
    if (explicitTheme === "custom") {
      if (!hasTemplate) {
        throw new Error("Custom template mode requires non-empty SVG template bytes");
      }
    } else if (!canonicalBuiltInThemeInfo(explicitTheme)) {
      throw new Error(
        `Unsupported art theme "${explicitTheme}" cannot be uploaded; choose a supported SolSoul theme or Custom Template`,
      );
    }
  }

  if (!hasTemplate && params.get("mode")?.toLowerCase() === "hexagram") {
    throw new Error(
      'Unsupported legacy art mode "hexagram" cannot be uploaded; choose a supported SolSoul theme',
    );
  }

  if (hasTemplate) {
    const coreTraitKey = CORE_ART_TRAIT_CATEGORIES.find((category) =>
      params.has(category.styleKey),
    )?.styleKey;
    if (coreTraitKey) {
      throw new Error(
        `Custom template mode does not support core trait style param "${coreTraitKey}"; use a built-in theme to guide core traits`,
      );
    }
  }
}

export function validateTemplateUploadInput(params: {
  template: string | Uint8Array;
  styleParams?: string | Uint8Array;
}): void {
  validateTemplateUploadBytes(
    bytesFromStringOrUint8Array(params.template),
    bytesFromStringOrUint8Array(params.styleParams ?? ""),
  );
}

function containsForbiddenTemplateReference(template: string): boolean {
  const externalScheme = /(?:https?|ipfs|ar|data):/i;
  return (
    /<\s*\/?\s*(?:script|image|iframe|embed|object|foreignObject|animate|set)\b/i.test(template) ||
    /(?:^|[\s<])on[a-zA-Z][\w-]*\s*=/i.test(template) ||
    /(?:^|[\s<])(?:href|xlink:href)\s*=/i.test(template) ||
    externalScheme.test(template) ||
    /url\(\s*['"]?\s*(?:(?:https?|ipfs|ar|data):|\/\/)/i.test(template)
  );
}

type TemplateParserDocument = {
  getElementsByTagName: (tagName: string) => { length: number };
};

type TemplateParser = {
  parseFromString: (source: string, mimeType: string) => TemplateParserDocument;
};

type TemplateParserConstructor = new () => TemplateParser;

function validateTemplateXmlIfParserAvailable(template: string): void {
  const Parser = (globalThis as typeof globalThis & {
    DOMParser?: TemplateParserConstructor;
  }).DOMParser;

  if (!Parser) {
    return;
  }

  try {
    const parsed = new Parser().parseFromString(template, "image/svg+xml");
    if (parsed.getElementsByTagName("parsererror").length > 0) {
      throw new Error("Template SVG must parse as XML");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "Template SVG must parse as XML") {
      throw error;
    }
    throw new Error("Template SVG must parse as XML");
  }
}

function assertTargetAmm(value: number, accountName: string): TargetAmm {
  if (value === TARGET_AMM.Raydium || value === TARGET_AMM.Pump || value === TARGET_AMM.Meteora) {
    return value;
  }
  throw new Error(`Invalid ${accountName} target_amm: ${value}`);
}

function assertActiveTargetAmm(value: number, accountName: string): TargetAmm {
  const targetAmm = assertTargetAmm(value, accountName);
  if (targetAmm !== ACTIVE_TARGET_AMM) {
    throw new Error(
      `Only the fixed legacy Raydium target_amm is accepted for ${accountName}; AMM selection and migration are historical/deferred.`,
    );
  }
  return targetAmm;
}

function assertSoulProvenanceSide(value: number): SoulProvenanceSide {
  if (
    value === SOUL_PROVENANCE_SIDE.None ||
    value === SOUL_PROVENANCE_SIDE.Buy ||
    value === SOUL_PROVENANCE_SIDE.Sell
  ) {
    return value;
  }
  throw new Error(`Invalid SoulAccount provenance side: ${value}`);
}

function normalizePositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return value;
}

function compareLaunchedTokensByRecentCreation(left: LaunchedToken, right: LaunchedToken): number {
  if (left.createdAt !== null && right.createdAt !== null && left.createdAt !== right.createdAt) {
    return left.createdAt > right.createdAt ? -1 : 1;
  }
  if (left.createdAt !== null && right.createdAt === null) {
    return -1;
  }
  if (left.createdAt === null && right.createdAt !== null) {
    return 1;
  }

  return right.mint.toBase58().localeCompare(left.mint.toBase58());
}

function createNoBumpPda(
  seed: string,
  mint: PublicKeyLike,
  programId: PublicKeyLike,
): PublicKey {
  return createNoBumpPdaFromSeeds(
    [Buffer.from(seed), asPublicKey(mint).toBuffer()],
    programId,
  );
}

function createNoBumpPdaFromSeeds(
  seeds: Array<Buffer | Uint8Array>,
  programId: PublicKeyLike,
): PublicKey {
  return PublicKey.createProgramAddressSync(
    seeds.map((seed) => Buffer.from(seed)),
    asPublicKey(programId),
  );
}

function createLegacyOrCanonicalPdaFromSeeds(
  seeds: Array<Buffer | Uint8Array>,
  programId: PublicKeyLike,
): PublicKey {
  const seedBuffers = seeds.map((seed) => Buffer.from(seed));
  const resolvedProgramId = asPublicKey(programId);
  try {
    return PublicKey.createProgramAddressSync(seedBuffers, resolvedProgramId);
  } catch {
    return PublicKey.findProgramAddressSync(seedBuffers, resolvedProgramId)[0];
  }
}

function resolveProgramIds(programIds: ProgramIdOverrides = {}): {
  soulGenerator: PublicKey;
  bondingCurve: PublicKey;
  transferHook: PublicKey;
} {
  return {
    soulGenerator: asPublicKey(programIds.soulGenerator ?? PROGRAM_IDS.soulGenerator),
    bondingCurve: asPublicKey(programIds.bondingCurve ?? PROGRAM_IDS.bondingCurve),
    transferHook: asPublicKey(programIds.transferHook ?? PROGRAM_IDS.transferHook),
  };
}

function resolveTransferHookProgramId(
  params: Pick<DetectTransferHookExtensionParams, "transferHookProgramId" | "programIds">,
): PublicKey {
  return asPublicKey(
    params.transferHookProgramId ??
      params.programIds?.transferHook ??
      PROGRAM_IDS.transferHook,
  );
}

function hookDetectionErrorMessage(detection: Exclude<TransferHookDetection, { status: "hookEnabled" }>): string {
  switch (detection.status) {
    case "legacySplToken":
      return `Direct transfer mint is not a Token-2022 mint: owner ${detection.owner.toBase58()}`;
    case "token2022WithoutHook":
      return "Token-2022 mint does not have a Transfer Hook extension.";
    case "unsupportedHookProgram":
      return `Token-2022 mint Transfer Hook program ${detection.configuredProgramId.toBase58()} does not match expected SolSoul hook ${detection.expectedProgramId.toBase58()}.`;
    default: {
      const neverDetection: never = detection;
      return `Unsupported Transfer Hook state: ${JSON.stringify(neverDetection)}`;
    }
  }
}

function deEscalateResolvedMeta(meta: AccountMeta, previousMetas: AccountMeta[]): AccountMeta {
  const existing = previousMetas.find((previous) => previous.pubkey.equals(meta.pubkey));
  if (!existing) {
    return meta;
  }
  return {
    pubkey: meta.pubkey,
    isSigner: meta.isSigner && existing.isSigner,
    isWritable: meta.isWritable && existing.isWritable,
  };
}

function assertNoDuplicateHookMetas(metas: AccountMeta[]): void {
  const seen = new Set<string>();
  for (const meta of metas) {
    const key = meta.pubkey.toBase58();
    if (seen.has(key)) {
      throw new Error(`Transfer Hook extra-account metas contain duplicate account ${key}`);
    }
    seen.add(key);
  }
}

function asPublicKey(value: PublicKeyLike): PublicKey {
  return value instanceof PublicKey ? value : new PublicKey(value);
}

function getPayerPublicKey(payer: Signer | PublicKeyLike): PublicKey {
  if (typeof payer === "object" && "publicKey" in payer && payer.publicKey instanceof PublicKey) {
    return payer.publicKey;
  }

  return asPublicKey(payer as PublicKeyLike);
}

function packDiscriminatorAndU64s(discriminator: number, values: AmountLike[]): Buffer {
  const data = Buffer.alloc(1 + values.length * 8);
  data[0] = discriminator;
  values.forEach((value, index) => {
    writeU64LE(data, toU64(value), 1 + index * 8);
  });
  return data;
}

function writeU64LE(data: Uint8Array, value: bigint, offset: number): void {
  for (let i = 0; i < 8; i += 1) {
    data[offset + i] = Number((value >> (BigInt(i) * 8n)) & 0xffn);
  }
}

function u64Buffer(value: AmountLike): Buffer {
  const data = Buffer.alloc(8);
  writeU64LE(data, toU64(value), 0);
  return data;
}

function writeI64LE(data: Uint8Array, value: bigint, offset: number): void {
  writeU64LE(data, value < 0n ? (1n << 64n) + value : value, offset);
}

function toU64(value: AmountLike): bigint {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new RangeError(`Value must be a safe integer number or use bigint/string: ${value}`);
  }
  const amount = BigInt(value);
  if (amount < 0n || amount > 0xffff_ffff_ffff_ffffn) {
    throw new RangeError(`Value does not fit in u64: ${value.toString()}`);
  }
  return amount;
}

function toI64(value: AmountLike): bigint {
  const amount = BigInt(value);
  if (amount < -0x8000_0000_0000_0000n || amount > 0x7fff_ffff_ffff_ffffn) {
    throw new RangeError(`Value does not fit in i64: ${value.toString()}`);
  }
  return amount;
}

async function sendTransaction(params: SendHelperParams, tx: Transaction): Promise<string> {
  return sendAndConfirmTransaction(params.connection, tx, [params.payer], {
    commitment: params.commitment ?? "confirmed",
    ...params.confirmOptions,
  });
}
