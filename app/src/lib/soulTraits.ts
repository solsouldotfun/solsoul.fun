export type AppSoulTraitCategoryId =
  | "character_archetype"
  | "goggles_eyes"
  | "expression"
  | "gas_aura_cloud"
  | "background"
  | "outfit"
  | "relic"
  | "animation_behavior"
  | "gas_level";

export interface AppSoulTraitOption {
  id: string;
  weight: number;
}

export interface AppSoulTraitCategory {
  id: AppSoulTraitCategoryId;
  options: readonly AppSoulTraitOption[];
}

export interface AppSoulTraitInput {
  seed: Uint8Array | string;
  theme?: string;
  provenanceSide?: "none" | "buy" | "sell" | 0 | 1 | 2;
  generation?: bigint | number | string;
  amount?: bigint | number | string;
  tokenAmount?: bigint | number | string;
}

export interface AppSoulTraitSet {
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

export type AppCoreArtTraitCategoryId = "palette" | "mood" | "form" | "background";
export type AppCoreArtTraitStyleKey =
  | "trait_palette"
  | "trait_mood"
  | "trait_form"
  | "trait_background";
export type AppCoreArtTraitPalette = "solana" | "aurora" | "ember" | "mono";
export type AppCoreArtTraitMood = "serene" | "charged" | "mystic" | "radiant";
export type AppCoreArtTraitForm = "spiral" | "wave" | "crystal" | "orb";
export type AppCoreArtTraitBackground = "midnight" | "nebula" | "grid" | "eclipse";

export interface AppCoreArtTraitSelection {
  palette?: AppCoreArtTraitPalette;
  mood?: AppCoreArtTraitMood;
  form?: AppCoreArtTraitForm;
  background?: AppCoreArtTraitBackground;
}

export interface AppFinalCoreArtTraits {
  palette: AppCoreArtTraitPalette;
  mood: AppCoreArtTraitMood;
  form: AppCoreArtTraitForm;
  background: AppCoreArtTraitBackground;
}

export interface AppCoreArtTraitCategory {
  id: AppCoreArtTraitCategoryId;
  styleKey: AppCoreArtTraitStyleKey;
  options: readonly AppSoulTraitOption[];
}

export interface AppBlendedSoulTraitInput extends AppSoulTraitInput {
  styleParams?: string | Uint8Array;
}

export interface AppBlendedSoulTraitSet {
  defaults: AppSoulTraitSet;
  core: AppFinalCoreArtTraits;
}

export interface AppSoulCoreTrait {
  category: AppCoreArtTraitCategoryId;
  traitType: string;
  value: string;
  source: "launch" | "system";
}

export interface AppSoulGeneratedTrait {
  category: AppSoulTraitCategoryId;
  traitType: string;
  value: string;
}

export interface AppSoulTraitDisplayGroups {
  launchGuidedCoreTraits: AppSoulCoreTrait[];
  systemCoreTraits: AppSoulCoreTrait[];
  generatedTraits: AppSoulGeneratedTrait[];
}

export const APP_DEFAULT_SOUL_TRAIT_CATEGORIES = [
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
] as const satisfies readonly AppSoulTraitCategory[];

export const APP_SOUL_TRAIT_METADATA_ATTRIBUTE_TYPES = [
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
  category: AppSoulTraitCategoryId;
  traitType: string;
  key: keyof AppSoulTraitSet;
}[];

export const APP_CORE_ART_TRAIT_METADATA_ATTRIBUTE_TYPES = [
  { category: "palette", traitType: "Palette", key: "palette" },
  { category: "mood", traitType: "Mood", key: "mood" },
  { category: "form", traitType: "Form", key: "form" },
  { category: "background", traitType: "Background Style", key: "background" },
] as const satisfies readonly {
  category: AppCoreArtTraitCategoryId;
  traitType: string;
  key: keyof AppFinalCoreArtTraits;
}[];

export const APP_MAX_USER_CORE_TRAIT_SELECTIONS = 3;
export const APP_CORE_ART_TRAIT_CATEGORIES = [
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
] as const satisfies readonly AppCoreArtTraitCategory[];

const FNV_OFFSET_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const FNV_MASK_64 = 0xffffffffffffffffn;
const TRAIT_DOMAIN = new TextEncoder().encode("solsoul:traits:v1");
const CORE_TRAIT_DOMAIN = new TextEncoder().encode("solsoul:core_traits:v1");

export function deriveAppDefaultSoulTraits(input: AppSoulTraitInput): AppSoulTraitSet {
  return {
    characterArchetype: selectTrait("character_archetype", input),
    gogglesEyes: selectTrait("goggles_eyes", input),
    expression: selectTrait("expression", input),
    gasAuraCloud: selectTrait("gas_aura_cloud", input),
    background: selectTrait("background", input),
    outfit: selectTrait("outfit", input),
    relic: selectTrait("relic", input),
    animationBehavior: selectTrait("animation_behavior", input),
    gasLevel: selectTrait("gas_level", input),
  };
}

export function parseAppCoreArtTraitStyleParams(
  styleParams: string | Uint8Array = "",
): AppCoreArtTraitSelection {
  const params =
    typeof styleParams === "string" ? styleParams : new TextDecoder().decode(styleParams);
  const selection: Partial<Record<AppCoreArtTraitCategoryId, string>> = {};
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
    const category = APP_CORE_ART_TRAIT_CATEGORIES.find((entry) => entry.styleKey === key);
    if (!category) {
      continue;
    }
    if (!isAppCoreArtTraitValue(category.id, value)) {
      throw new Error(`Invalid ${category.id} art trait value: ${value || "<empty>"}`);
    }
    if (selection[category.id]) {
      throw new Error(`Duplicate ${category.id} art trait selection`);
    }
    selection[category.id] = value;
    selectedCount += 1;
    if (selectedCount > APP_MAX_USER_CORE_TRAIT_SELECTIONS) {
      throw new Error(`Select at most ${APP_MAX_USER_CORE_TRAIT_SELECTIONS} core art traits`);
    }
  }
  return selection as AppCoreArtTraitSelection;
}

export function encodeAppCoreArtTraitStyleParams(
  selection: AppCoreArtTraitSelection,
  baseStyleParams: string = "",
): string {
  const selectedEntries = APP_CORE_ART_TRAIT_CATEGORIES.flatMap((category) => {
    const value = selection[category.id];
    if (!value) {
      return [];
    }
    if (!isAppCoreArtTraitValue(category.id, value)) {
      throw new Error(`Invalid ${category.id} art trait value: ${value}`);
    }
    return [`${category.styleKey}=${value}`];
  });
  if (selectedEntries.length > APP_MAX_USER_CORE_TRAIT_SELECTIONS) {
    throw new Error(`Select at most ${APP_MAX_USER_CORE_TRAIT_SELECTIONS} core art traits`);
  }
  const legacyPairs = baseStyleParams
    .split(";")
    .filter((pair) => pair.length > 0)
    .filter((pair) => {
      const equals = pair.indexOf("=");
      const key = pair.slice(0, equals >= 0 ? equals : pair.length);
      return !APP_CORE_ART_TRAIT_CATEGORIES.some((category) => category.styleKey === key);
    });
  return [...legacyPairs, ...selectedEntries].join(";");
}

export function deriveAppFinalCoreArtTraits(
  input: AppBlendedSoulTraitInput,
): AppFinalCoreArtTraits {
  const selection = parseAppCoreArtTraitStyleParams(input.styleParams ?? "");
  return {
    palette: selection.palette ?? selectCoreTrait("palette", input),
    mood: selection.mood ?? selectCoreTrait("mood", input),
    form: selection.form ?? selectCoreTrait("form", input),
    background: selection.background ?? selectCoreTrait("background", input),
  };
}

export function deriveAppBlendedSoulTraits(
  input: AppBlendedSoulTraitInput,
): AppBlendedSoulTraitSet {
  return {
    defaults: deriveAppDefaultSoulTraits(input),
    core: deriveAppFinalCoreArtTraits(input),
  };
}

export function deriveAppSoulTraitDisplayGroups(
  input: AppBlendedSoulTraitInput,
): AppSoulTraitDisplayGroups {
  const selection = parseAppCoreArtTraitStyleParamsForDisplay(input.styleParams ?? "");
  const core = deriveAppFinalCoreArtTraits({
    ...input,
    styleParams: encodeAppCoreArtTraitStyleParams(selection, ""),
  });
  const coreTraits = APP_CORE_ART_TRAIT_METADATA_ATTRIBUTE_TYPES.map(
    ({ category, traitType, key }) => ({
      category,
      traitType,
      value: core[key],
      source: selection[category] ? "launch" : "system",
    }),
  ) satisfies AppSoulCoreTrait[];

  return {
    launchGuidedCoreTraits: coreTraits.filter((trait) => trait.source === "launch"),
    systemCoreTraits: coreTraits.filter((trait) => trait.source === "system"),
    generatedTraits: appSoulTraitsToGeneratedTraits(deriveAppDefaultSoulTraits(input)),
  };
}

export function appSoulTraitsToGeneratedTraits(
  traits: AppSoulTraitSet,
): AppSoulGeneratedTrait[] {
  return APP_SOUL_TRAIT_METADATA_ATTRIBUTE_TYPES.map(({ category, traitType, key }) => ({
    category,
    traitType,
    value: traits[key],
  }));
}

export function appSoulGeneratedTraitsFromAttributes(
  attributes: unknown,
): AppSoulGeneratedTrait[] {
  if (!Array.isArray(attributes)) {
    return [];
  }
  return APP_SOUL_TRAIT_METADATA_ATTRIBUTE_TYPES.flatMap(({ category, traitType }) => {
    const value = attributes
      .map((attribute) =>
        isMetadataAttribute(attribute) && attribute.trait_type === traitType
          ? attribute.value
          : null,
      )
      .find((entry): entry is string => typeof entry === "string" && entry.length > 0);
    return value ? [{ category, traitType, value }] : [];
  });
}

function parseAppCoreArtTraitStyleParamsForDisplay(
  styleParams: string | Uint8Array,
): AppCoreArtTraitSelection {
  try {
    return parseAppCoreArtTraitStyleParams(styleParams);
  } catch {
    return {};
  }
}

function isMetadataAttribute(
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

function selectTrait(categoryId: AppSoulTraitCategoryId, input: AppSoulTraitInput): string {
  const category = APP_DEFAULT_SOUL_TRAIT_CATEGORIES.find((entry) => entry.id === categoryId);
  if (!category) {
    throw new Error(`Unknown app Soul trait category: ${categoryId}`);
  }
  const totalWeight = category.options.reduce((sum, option) => sum + option.weight, 0);
  let bucket = Number(traitHash(categoryId, input) % BigInt(totalWeight));
  for (const option of category.options) {
    if (bucket < option.weight) {
      return option.id;
    }
    bucket -= option.weight;
  }
  return category.options[category.options.length - 1].id;
}

function selectCoreTrait<T extends AppCoreArtTraitCategoryId>(
  categoryId: T,
  input: AppSoulTraitInput,
): AppFinalCoreArtTraits[T] {
  const category = APP_CORE_ART_TRAIT_CATEGORIES.find((entry) => entry.id === categoryId);
  if (!category) {
    throw new Error(`Unknown app core art trait category: ${categoryId}`);
  }
  const totalWeight = category.options.reduce((sum, option) => sum + option.weight, 0);
  let bucket = Number(coreTraitHash(categoryId, input) % BigInt(totalWeight));
  for (const option of category.options) {
    if (bucket < option.weight) {
      return option.id as AppFinalCoreArtTraits[T];
    }
    bucket -= option.weight;
  }
  return category.options[category.options.length - 1].id as AppFinalCoreArtTraits[T];
}

function traitHash(categoryId: AppSoulTraitCategoryId, input: AppSoulTraitInput): bigint {
  let hash = FNV_OFFSET_64;
  hash = mixBytes(hash, TRAIT_DOMAIN);
  hash = mixBytes(hash, Uint8Array.of(0xff));
  hash = mixBytes(hash, new TextEncoder().encode(categoryId));
  hash = mixBytes(hash, Uint8Array.of(0xfe));
  hash = mixBytes(hash, new TextEncoder().encode(normalizeTheme(input.theme)));
  hash = mixBytes(hash, Uint8Array.of(normalizeSide(input.provenanceSide)));
  hash = mixBytes(hash, u64Le(input.generation));
  hash = mixBytes(hash, u64Le(input.amount));
  hash = mixBytes(hash, u64Le(input.tokenAmount));
  return mixBytes(hash, normalizeSeed(input.seed));
}

function coreTraitHash(
  categoryId: AppCoreArtTraitCategoryId,
  input: AppSoulTraitInput,
): bigint {
  let hash = FNV_OFFSET_64;
  hash = mixBytes(hash, CORE_TRAIT_DOMAIN);
  hash = mixBytes(hash, Uint8Array.of(0xff));
  hash = mixBytes(hash, new TextEncoder().encode(categoryId));
  hash = mixBytes(hash, Uint8Array.of(0xfe));
  hash = mixBytes(hash, new TextEncoder().encode(normalizeTheme(input.theme)));
  hash = mixBytes(hash, Uint8Array.of(normalizeSide(input.provenanceSide)));
  hash = mixBytes(hash, u64Le(input.generation));
  hash = mixBytes(hash, u64Le(input.amount));
  hash = mixBytes(hash, u64Le(input.tokenAmount));
  return mixBytes(hash, normalizeSeed(input.seed));
}

function isAppCoreArtTraitValue(
  categoryId: AppCoreArtTraitCategoryId,
  value: string,
): value is NonNullable<AppCoreArtTraitSelection[typeof categoryId]> {
  return APP_CORE_ART_TRAIT_CATEGORIES.some(
    (category) =>
      category.id === categoryId &&
      category.options.some((option) => option.id === value),
  );
}

function mixBytes(hash: bigint, bytes: Uint8Array): bigint {
  let mixed = hash;
  for (const byte of bytes) {
    mixed ^= BigInt(byte);
    mixed = (mixed * FNV_PRIME_64) & FNV_MASK_64;
  }
  return mixed;
}

function normalizeSeed(seed: Uint8Array | string): Uint8Array {
  return typeof seed === "string" ? new TextEncoder().encode(seed) : seed;
}

function normalizeTheme(theme: string | undefined): string {
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

function normalizeSide(side: AppSoulTraitInput["provenanceSide"] | undefined): number {
  if (side === 1 || side === "buy") {
    return 1;
  }
  if (side === 2 || side === "sell") {
    return 2;
  }
  return 0;
}

function u64Le(value: AppSoulTraitInput["generation"] | undefined): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt.asUintN(64, toBigInt(value)), true);
  return bytes;
}

function toBigInt(value: AppSoulTraitInput["generation"] | undefined): bigint {
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
