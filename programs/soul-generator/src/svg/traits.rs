use super::theme::ArtTheme;
use pinocchio::error::ProgramError;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct TraitOption {
    pub id: &'static str,
    pub weight: u16,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct TraitCategory {
    pub id: &'static str,
    pub options: &'static [TraitOption],
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct UserCoreTraitSelection {
    pub palette: Option<&'static str>,
    pub mood: Option<&'static str>,
    pub form: Option<&'static str>,
    pub background: Option<&'static str>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct FinalCoreTraitSet {
    pub palette: &'static str,
    pub mood: &'static str,
    pub form: &'static str,
    pub background: &'static str,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct BlendedSoulTraitSet {
    pub defaults: DefaultSoulTraitSet,
    pub core: FinalCoreTraitSet,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DefaultSoulTraitInput<'a> {
    pub seed: &'a [u8],
    pub theme: ArtTheme,
    pub provenance_side: u8,
    pub generation: u64,
    pub amount: u64,
    pub token_amount: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DefaultSoulTraitSet {
    pub character_archetype: &'static str,
    pub goggles_eyes: &'static str,
    pub expression: &'static str,
    pub gas_aura_cloud: &'static str,
    pub background: &'static str,
    pub outfit: &'static str,
    pub relic: &'static str,
    pub animation_behavior: &'static str,
    pub gas_level: &'static str,
}

const CHARACTER_ARCHETYPE: &[TraitOption] = &[
    TraitOption {
        id: "neonpuff_unicorn",
        weight: 4_800,
    },
    TraitOption {
        id: "rainbow_pegasus",
        weight: 1_800,
    },
    TraitOption {
        id: "solana_dragon",
        weight: 1_300,
    },
    TraitOption {
        id: "vapor_fox",
        weight: 900,
    },
    TraitOption {
        id: "gas_goblin",
        weight: 700,
    },
    TraitOption {
        id: "oracle_cat",
        weight: 350,
    },
    TraitOption {
        id: "mythic_star_horse",
        weight: 150,
    },
];
const GOGGLES_EYES: &[TraitOption] = &[
    TraitOption {
        id: "rainbow_goggles",
        weight: 3_600,
    },
    TraitOption {
        id: "laser_lenses",
        weight: 2_100,
    },
    TraitOption {
        id: "starry_eyes",
        weight: 1_700,
    },
    TraitOption {
        id: "sleepy_lids",
        weight: 1_100,
    },
    TraitOption {
        id: "monocle_scope",
        weight: 800,
    },
    TraitOption {
        id: "hologram_visor",
        weight: 500,
    },
    TraitOption {
        id: "cosmic_third_eye",
        weight: 200,
    },
];
const EXPRESSION: &[TraitOption] = &[
    TraitOption {
        id: "zen_smirk",
        weight: 3_200,
    },
    TraitOption {
        id: "diamond_grin",
        weight: 2_400,
    },
    TraitOption {
        id: "surprised_puff",
        weight: 1_600,
    },
    TraitOption {
        id: "battle_squint",
        weight: 1_200,
    },
    TraitOption {
        id: "meme_cackle",
        weight: 1_000,
    },
    TraitOption {
        id: "oracle_focus",
        weight: 450,
    },
    TraitOption {
        id: "legendary_wink",
        weight: 150,
    },
];
const GAS_AURA_CLOUD: &[TraitOption] = &[
    TraitOption {
        id: "green_gas_puff",
        weight: 3_400,
    },
    TraitOption {
        id: "rainbow_aura",
        weight: 2_300,
    },
    TraitOption {
        id: "solana_mist",
        weight: 1_500,
    },
    TraitOption {
        id: "neon_cloud",
        weight: 1_200,
    },
    TraitOption {
        id: "spark_burst",
        weight: 900,
    },
    TraitOption {
        id: "plasma_halo",
        weight: 500,
    },
    TraitOption {
        id: "golden_fog",
        weight: 200,
    },
];
const BACKGROUND: &[TraitOption] = &[
    TraitOption {
        id: "midnight_gradient",
        weight: 3_000,
    },
    TraitOption {
        id: "solana_sky",
        weight: 2_400,
    },
    TraitOption {
        id: "checker_stars",
        weight: 1_600,
    },
    TraitOption {
        id: "meme_wall",
        weight: 1_200,
    },
    TraitOption {
        id: "nebula_ring",
        weight: 1_000,
    },
    TraitOption {
        id: "aurora_grid",
        weight: 600,
    },
    TraitOption {
        id: "eclipse_gold",
        weight: 200,
    },
];
const OUTFIT: &[TraitOption] = &[
    TraitOption {
        id: "hoodie",
        weight: 3_000,
    },
    TraitOption {
        id: "space_jacket",
        weight: 2_200,
    },
    TraitOption {
        id: "raydium_racer",
        weight: 1_600,
    },
    TraitOption {
        id: "puffer_vest",
        weight: 1_300,
    },
    TraitOption {
        id: "wizard_cape",
        weight: 900,
    },
    TraitOption {
        id: "gold_chain",
        weight: 700,
    },
    TraitOption {
        id: "king_robes",
        weight: 300,
    },
];
const RELIC: &[TraitOption] = &[
    TraitOption {
        id: "none",
        weight: 3_800,
    },
    TraitOption {
        id: "solana_coin",
        weight: 1_900,
    },
    TraitOption {
        id: "raydium_orb",
        weight: 1_500,
    },
    TraitOption {
        id: "tiny_launcher",
        weight: 1_100,
    },
    TraitOption {
        id: "neon_carrot",
        weight: 800,
    },
    TraitOption {
        id: "gas_canister",
        weight: 600,
    },
    TraitOption {
        id: "ancient_receipt",
        weight: 300,
    },
];
const ANIMATION_BEHAVIOR: &[TraitOption] = &[
    TraitOption {
        id: "gentle_gas_drift",
        weight: 3_200,
    },
    TraitOption {
        id: "lens_shine",
        weight: 2_300,
    },
    TraitOption {
        id: "aura_flow",
        weight: 1_800,
    },
    TraitOption {
        id: "background_pulse",
        weight: 1_300,
    },
    TraitOption {
        id: "sparkle_pop",
        weight: 900,
    },
    TraitOption {
        id: "rainbow_orbit",
        weight: 400,
    },
    TraitOption {
        id: "mythic_prism_bloom",
        weight: 100,
    },
];
const GAS_LEVEL: &[TraitOption] = &[
    TraitOption {
        id: "level_1",
        weight: 2_400,
    },
    TraitOption {
        id: "level_2",
        weight: 2_200,
    },
    TraitOption {
        id: "level_3",
        weight: 1_900,
    },
    TraitOption {
        id: "level_4",
        weight: 1_500,
    },
    TraitOption {
        id: "level_5",
        weight: 1_000,
    },
    TraitOption {
        id: "level_6",
        weight: 650,
    },
    TraitOption {
        id: "level_7",
        weight: 250,
    },
    TraitOption {
        id: "level_8",
        weight: 100,
    },
];

pub const MAX_USER_CORE_TRAIT_SELECTIONS: u8 = 3;

const CORE_PALETTE: &[TraitOption] = &[
    TraitOption {
        id: "solana",
        weight: 2_500,
    },
    TraitOption {
        id: "aurora",
        weight: 2_500,
    },
    TraitOption {
        id: "ember",
        weight: 2_500,
    },
    TraitOption {
        id: "mono",
        weight: 2_500,
    },
];
const CORE_MOOD: &[TraitOption] = &[
    TraitOption {
        id: "serene",
        weight: 2_500,
    },
    TraitOption {
        id: "charged",
        weight: 2_500,
    },
    TraitOption {
        id: "mystic",
        weight: 2_500,
    },
    TraitOption {
        id: "radiant",
        weight: 2_500,
    },
];
const CORE_FORM: &[TraitOption] = &[
    TraitOption {
        id: "spiral",
        weight: 2_500,
    },
    TraitOption {
        id: "wave",
        weight: 2_500,
    },
    TraitOption {
        id: "crystal",
        weight: 2_500,
    },
    TraitOption {
        id: "orb",
        weight: 2_500,
    },
];
const CORE_BACKGROUND: &[TraitOption] = &[
    TraitOption {
        id: "midnight",
        weight: 2_500,
    },
    TraitOption {
        id: "nebula",
        weight: 2_500,
    },
    TraitOption {
        id: "grid",
        weight: 2_500,
    },
    TraitOption {
        id: "eclipse",
        weight: 2_500,
    },
];

pub const DEFAULT_SOUL_TRAIT_CATEGORIES: &[TraitCategory] = &[
    TraitCategory {
        id: "character_archetype",
        options: CHARACTER_ARCHETYPE,
    },
    TraitCategory {
        id: "goggles_eyes",
        options: GOGGLES_EYES,
    },
    TraitCategory {
        id: "expression",
        options: EXPRESSION,
    },
    TraitCategory {
        id: "gas_aura_cloud",
        options: GAS_AURA_CLOUD,
    },
    TraitCategory {
        id: "background",
        options: BACKGROUND,
    },
    TraitCategory {
        id: "outfit",
        options: OUTFIT,
    },
    TraitCategory {
        id: "relic",
        options: RELIC,
    },
    TraitCategory {
        id: "animation_behavior",
        options: ANIMATION_BEHAVIOR,
    },
    TraitCategory {
        id: "gas_level",
        options: GAS_LEVEL,
    },
];

pub const CORE_ART_TRAIT_CATEGORIES: &[TraitCategory] = &[
    TraitCategory {
        id: "palette",
        options: CORE_PALETTE,
    },
    TraitCategory {
        id: "mood",
        options: CORE_MOOD,
    },
    TraitCategory {
        id: "form",
        options: CORE_FORM,
    },
    TraitCategory {
        id: "background",
        options: CORE_BACKGROUND,
    },
];

const FNV_OFFSET_64: u64 = 0xcbf2_9ce4_8422_2325;
const FNV_PRIME_64: u64 = 0x0000_0100_0000_01b3;
const TRAIT_ENGINE_DOMAIN: &[u8] = b"solsoul:traits:v1";
const CORE_TRAIT_ENGINE_DOMAIN: &[u8] = b"solsoul:core_traits:v1";

pub fn resolve_default_soul_traits(input: DefaultSoulTraitInput<'_>) -> DefaultSoulTraitSet {
    DefaultSoulTraitSet {
        character_archetype: select_trait(CHARACTER_ARCHETYPE, b"character_archetype", input),
        goggles_eyes: select_trait(GOGGLES_EYES, b"goggles_eyes", input),
        expression: select_trait(EXPRESSION, b"expression", input),
        gas_aura_cloud: select_trait(GAS_AURA_CLOUD, b"gas_aura_cloud", input),
        background: select_trait(BACKGROUND, b"background", input),
        outfit: select_trait(OUTFIT, b"outfit", input),
        relic: select_trait(RELIC, b"relic", input),
        animation_behavior: select_trait(ANIMATION_BEHAVIOR, b"animation_behavior", input),
        gas_level: select_trait(GAS_LEVEL, b"gas_level", input),
    }
}

pub fn validate_user_core_trait_style_params(style_params: &[u8]) -> Result<(), ProgramError> {
    parse_user_core_traits(style_params).map(|_| ())
}

pub fn parse_user_core_traits(style_params: &[u8]) -> Result<UserCoreTraitSelection, ProgramError> {
    let mut selection = UserCoreTraitSelection {
        palette: None,
        mood: None,
        form: None,
        background: None,
    };
    let mut selected_count = 0u8;
    let mut pair_start = 0usize;
    while pair_start <= style_params.len() {
        let pair_end = find_byte(style_params, pair_start, b';').unwrap_or(style_params.len());
        if pair_end > pair_start {
            let pair = &style_params[pair_start..pair_end];
            if let Some(equals) = find_byte(pair, 0, b'=') {
                let key = &pair[..equals];
                let value = if equals + 1 < pair.len() {
                    &pair[equals + 1..]
                } else {
                    &[]
                };
                if parse_core_trait_pair(&mut selection, key, value, &mut selected_count)?
                    && selected_count > MAX_USER_CORE_TRAIT_SELECTIONS
                {
                    return Err(ProgramError::InvalidInstructionData);
                }
            }
        }
        if pair_end == style_params.len() {
            break;
        }
        if let Some(next) = pair_end.checked_add(1) {
            pair_start = next;
        } else {
            break;
        }
    }
    Ok(selection)
}

pub fn resolve_blended_soul_traits(
    input: DefaultSoulTraitInput<'_>,
    style_params: &[u8],
) -> Result<BlendedSoulTraitSet, ProgramError> {
    let user_selection = parse_user_core_traits(style_params)?;
    Ok(BlendedSoulTraitSet {
        defaults: resolve_default_soul_traits(input),
        core: resolve_final_core_traits(input, user_selection),
    })
}

pub fn resolve_final_core_traits(
    input: DefaultSoulTraitInput<'_>,
    user_selection: UserCoreTraitSelection,
) -> FinalCoreTraitSet {
    FinalCoreTraitSet {
        palette: user_selection
            .palette
            .unwrap_or_else(|| select_core_trait(CORE_PALETTE, b"palette", input)),
        mood: user_selection
            .mood
            .unwrap_or_else(|| select_core_trait(CORE_MOOD, b"mood", input)),
        form: user_selection
            .form
            .unwrap_or_else(|| select_core_trait(CORE_FORM, b"form", input)),
        background: user_selection
            .background
            .unwrap_or_else(|| select_core_trait(CORE_BACKGROUND, b"background", input)),
    }
}

fn parse_core_trait_pair(
    selection: &mut UserCoreTraitSelection,
    key: &[u8],
    value: &[u8],
    selected_count: &mut u8,
) -> Result<bool, ProgramError> {
    match key {
        b"trait_palette" => {
            set_selection_slot(&mut selection.palette, parse_core_palette(value)?)?;
            *selected_count = selected_count.saturating_add(1);
            Ok(true)
        }
        b"trait_mood" => {
            set_selection_slot(&mut selection.mood, parse_core_mood(value)?)?;
            *selected_count = selected_count.saturating_add(1);
            Ok(true)
        }
        b"trait_form" => {
            set_selection_slot(&mut selection.form, parse_core_form(value)?)?;
            *selected_count = selected_count.saturating_add(1);
            Ok(true)
        }
        b"trait_background" => {
            set_selection_slot(&mut selection.background, parse_core_background(value)?)?;
            *selected_count = selected_count.saturating_add(1);
            Ok(true)
        }
        _ => Ok(false),
    }
}

fn set_selection_slot(
    slot: &mut Option<&'static str>,
    value: &'static str,
) -> Result<(), ProgramError> {
    if slot.is_some() {
        return Err(ProgramError::InvalidInstructionData);
    }
    *slot = Some(value);
    Ok(())
}

fn parse_core_palette(value: &[u8]) -> Result<&'static str, ProgramError> {
    match value {
        b"solana" => Ok("solana"),
        b"aurora" => Ok("aurora"),
        b"ember" => Ok("ember"),
        b"mono" => Ok("mono"),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

fn parse_core_mood(value: &[u8]) -> Result<&'static str, ProgramError> {
    match value {
        b"serene" => Ok("serene"),
        b"charged" => Ok("charged"),
        b"mystic" => Ok("mystic"),
        b"radiant" => Ok("radiant"),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

fn parse_core_form(value: &[u8]) -> Result<&'static str, ProgramError> {
    match value {
        b"spiral" => Ok("spiral"),
        b"wave" => Ok("wave"),
        b"crystal" => Ok("crystal"),
        b"orb" => Ok("orb"),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

fn parse_core_background(value: &[u8]) -> Result<&'static str, ProgramError> {
    match value {
        b"midnight" => Ok("midnight"),
        b"nebula" => Ok("nebula"),
        b"grid" => Ok("grid"),
        b"eclipse" => Ok("eclipse"),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

fn select_trait(
    options: &'static [TraitOption],
    category_id: &[u8],
    input: DefaultSoulTraitInput<'_>,
) -> &'static str {
    let total_weight = total_weight(options);
    let mut cursor = (trait_hash(category_id, input) % u64::from(total_weight)) as u32;
    let mut index = 0usize;
    while index < options.len() {
        let weight = u32::from(options[index].weight);
        if cursor < weight {
            return options[index].id;
        }
        cursor -= weight;
        index += 1;
    }
    options[options.len() - 1].id
}

fn select_core_trait(
    options: &'static [TraitOption],
    category_id: &[u8],
    input: DefaultSoulTraitInput<'_>,
) -> &'static str {
    let total_weight = total_weight(options);
    let mut cursor = (core_trait_hash(category_id, input) % u64::from(total_weight)) as u32;
    let mut index = 0usize;
    while index < options.len() {
        let weight = u32::from(options[index].weight);
        if cursor < weight {
            return options[index].id;
        }
        cursor -= weight;
        index += 1;
    }
    options[options.len() - 1].id
}

fn total_weight(options: &[TraitOption]) -> u32 {
    let mut total = 0u32;
    let mut index = 0usize;
    while index < options.len() {
        total += u32::from(options[index].weight);
        index += 1;
    }
    total
}

fn trait_hash(category_id: &[u8], input: DefaultSoulTraitInput<'_>) -> u64 {
    let mut hash = FNV_OFFSET_64;
    hash = mix_bytes(hash, TRAIT_ENGINE_DOMAIN);
    hash = mix_bytes(hash, &[0xff]);
    hash = mix_bytes(hash, category_id);
    hash = mix_bytes(hash, &[0xfe]);
    hash = mix_bytes(hash, theme_id(input.theme).as_bytes());
    hash = mix_bytes(hash, &[input.provenance_side]);
    hash = mix_bytes(hash, &input.generation.to_le_bytes());
    hash = mix_bytes(hash, &input.amount.to_le_bytes());
    hash = mix_bytes(hash, &input.token_amount.to_le_bytes());
    mix_bytes(hash, input.seed)
}

fn core_trait_hash(category_id: &[u8], input: DefaultSoulTraitInput<'_>) -> u64 {
    let mut hash = FNV_OFFSET_64;
    hash = mix_bytes(hash, CORE_TRAIT_ENGINE_DOMAIN);
    hash = mix_bytes(hash, &[0xff]);
    hash = mix_bytes(hash, category_id);
    hash = mix_bytes(hash, &[0xfe]);
    hash = mix_bytes(hash, theme_id(input.theme).as_bytes());
    hash = mix_bytes(hash, &[input.provenance_side]);
    hash = mix_bytes(hash, &input.generation.to_le_bytes());
    hash = mix_bytes(hash, &input.amount.to_le_bytes());
    hash = mix_bytes(hash, &input.token_amount.to_le_bytes());
    mix_bytes(hash, input.seed)
}

fn find_byte(bytes: &[u8], start: usize, target: u8) -> Option<usize> {
    let mut index = start;
    while index < bytes.len() {
        if bytes[index] == target {
            return Some(index);
        }
        index += 1;
    }
    None
}

fn mix_bytes(mut hash: u64, bytes: &[u8]) -> u64 {
    let mut index = 0usize;
    while index < bytes.len() {
        hash ^= u64::from(bytes[index]);
        hash = hash.wrapping_mul(FNV_PRIME_64);
        index += 1;
    }
    hash
}

fn theme_id(theme: ArtTheme) -> &'static str {
    match theme {
        ArtTheme::Fractal => "fractal",
        ArtTheme::Field => "field",
        ArtTheme::Lattice => "lattice",
        ArtTheme::Chaos => "chaos",
        ArtTheme::Harmonic => "harmonic",
        ArtTheme::PixelFractal => "pixelfractal",
        ArtTheme::PixelArt => "pixelart",
        ArtTheme::Symphony => "symphony",
        ArtTheme::CustomTemplate => "custom",
    }
}

#[cfg(test)]
mod tests {
    use super::{
        parse_user_core_traits, resolve_blended_soul_traits, resolve_default_soul_traits,
        validate_user_core_trait_style_params, DefaultSoulTraitInput, DefaultSoulTraitSet,
        CORE_ART_TRAIT_CATEGORIES, DEFAULT_SOUL_TRAIT_CATEGORIES, MAX_USER_CORE_TRAIT_SELECTIONS,
    };
    use crate::{
        state::{PROVENANCE_SIDE_BUY, SEED_HASH_LEN},
        svg::theme::ArtTheme,
    };
    use std::{collections::BTreeSet, vec::Vec};

    fn fixture(seed: &[u8]) -> DefaultSoulTraitInput<'_> {
        DefaultSoulTraitInput {
            seed,
            theme: ArtTheme::Fractal,
            provenance_side: PROVENANCE_SIDE_BUY,
            generation: 7,
            amount: 123_456_789,
            token_amount: 2_000_000,
        }
    }

    #[test]
    fn trait_weights_are_nonzero_and_bounded_per_category() {
        assert_eq!(DEFAULT_SOUL_TRAIT_CATEGORIES.len(), 9);
        for category in DEFAULT_SOUL_TRAIT_CATEGORIES {
            assert!(!category.id.is_empty());
            assert!(category.options.len() >= 7);
            let total: u32 = category
                .options
                .iter()
                .map(|option| {
                    assert!(!option.id.is_empty());
                    assert!(option.id.is_ascii());
                    assert!(option.weight > 0);
                    u32::from(option.weight)
                })
                .sum();
            assert_eq!(total, 10_000, "category {} weight total", category.id);
        }
    }

    #[test]
    fn core_trait_schema_validates_allowed_values_and_selection_limit() {
        assert_eq!(CORE_ART_TRAIT_CATEGORIES.len(), 4);
        assert_eq!(MAX_USER_CORE_TRAIT_SELECTIONS, 3);
        for category in CORE_ART_TRAIT_CATEGORIES {
            let total: u32 = category
                .options
                .iter()
                .map(|option| {
                    assert!(option.id.is_ascii());
                    assert!(option.weight > 0);
                    u32::from(option.weight)
                })
                .sum();
            assert_eq!(total, 10_000, "core category {} weight total", category.id);
        }

        let parsed = parse_user_core_traits(
            b"theme=fractal;trait_palette=aurora;trait_mood=serene;trait_form=wave",
        )
        .expect("valid core style params parse");
        assert_eq!(parsed.palette, Some("aurora"));
        assert_eq!(parsed.mood, Some("serene"));
        assert_eq!(parsed.form, Some("wave"));
        assert_eq!(parsed.background, None);

        assert!(validate_user_core_trait_style_params(b"theme=fractal;legacy=1").is_ok());
        assert_eq!(
            validate_user_core_trait_style_params(b"trait_palette=unknown"),
            Err(pinocchio::error::ProgramError::InvalidInstructionData)
        );
        assert_eq!(
            validate_user_core_trait_style_params(
                b"trait_palette=aurora;trait_mood=serene;trait_form=wave;trait_background=grid"
            ),
            Err(pinocchio::error::ProgramError::InvalidInstructionData)
        );
        assert_eq!(
            validate_user_core_trait_style_params(b"trait_palette=aurora;trait_palette=ember"),
            Err(pinocchio::error::ProgramError::InvalidInstructionData)
        );
    }

    #[test]
    fn blended_traits_preserve_user_choices_and_fill_unselected_from_seed() {
        let first = resolve_blended_soul_traits(
            fixture(b"pd16-fixture-alpha"),
            b"trait_palette=ember;trait_form=crystal",
        )
        .expect("first blend resolves");
        let repeat = resolve_blended_soul_traits(
            fixture(b"pd16-fixture-alpha"),
            b"trait_palette=ember;trait_form=crystal",
        )
        .expect("repeat blend resolves");

        assert_eq!(first, repeat);
        assert_eq!(first.core.palette, "ember");
        assert_eq!(first.core.form, "crystal");
        let mut filled_pairs = BTreeSet::new();
        for index in 0u8..16 {
            let seed = [index; 16];
            let resolved = resolve_blended_soul_traits(
                fixture(&seed),
                b"trait_palette=ember;trait_form=crystal",
            )
            .expect("swept blend resolves");
            assert_eq!(resolved.core.palette, "ember");
            assert_eq!(resolved.core.form, "crystal");
            filled_pairs.insert((resolved.core.mood, resolved.core.background));
        }
        assert!(filled_pairs.len() > 1, "filled pairs: {filled_pairs:?}");
    }

    #[test]
    fn same_seed_theme_and_provenance_produce_identical_trait_ids() {
        let first = resolve_default_soul_traits(fixture(b"pd16-fixture-alpha"));
        let second = resolve_default_soul_traits(fixture(b"pd16-fixture-alpha"));

        assert_eq!(first, second);
        assert_eq!(
            first,
            DefaultSoulTraitSet {
                character_archetype: "neonpuff_unicorn",
                goggles_eyes: "starry_eyes",
                expression: "battle_squint",
                gas_aura_cloud: "green_gas_puff",
                background: "solana_sky",
                outfit: "hoodie",
                relic: "none",
                animation_behavior: "background_pulse",
                gas_level: "level_1",
            }
        );
    }

    #[test]
    fn different_seeds_produce_varied_weighted_traits() {
        let first = resolve_default_soul_traits(fixture(b"pd16-fixture-alpha"));
        let second = resolve_default_soul_traits(fixture(b"pd16-fixture-beta"));

        assert_ne!(first, second);
    }

    #[test]
    fn seed_snapshot_has_locale_independent_ids_for_every_category() {
        let traits = (0u8..32).collect::<Vec<_>>();
        let resolved = resolve_default_soul_traits(DefaultSoulTraitInput {
            seed: &traits,
            theme: ArtTheme::Chaos,
            provenance_side: 2,
            generation: 42,
            amount: 555,
            token_amount: 0,
        });

        for id in [
            resolved.character_archetype,
            resolved.goggles_eyes,
            resolved.expression,
            resolved.gas_aura_cloud,
            resolved.background,
            resolved.outfit,
            resolved.relic,
            resolved.animation_behavior,
            resolved.gas_level,
        ] {
            assert!(id.is_ascii());
            assert!(id
                .chars()
                .all(|ch| ch.is_ascii_lowercase() || ch == '_' || ch.is_ascii_digit()));
        }
        assert_eq!(resolved.expression, "battle_squint");
    }

    #[test]
    fn small_seed_sweep_exercises_multiple_weighted_values() {
        let mut archetypes = BTreeSet::new();
        let mut relics = BTreeSet::new();
        let mut animations = BTreeSet::new();
        for index in 0u8..64 {
            let seed = [index; 16];
            let resolved = resolve_default_soul_traits(fixture(&seed));
            archetypes.insert(resolved.character_archetype);
            relics.insert(resolved.relic);
            animations.insert(resolved.animation_behavior);
        }

        assert!(archetypes.len() >= 4, "archetypes: {archetypes:?}");
        assert!(relics.len() >= 4, "relics: {relics:?}");
        assert!(animations.len() >= 4, "animations: {animations:?}");
    }

    /// PD16-Followup parity guard: the only field that survives a trade
    /// is the on-chain 8-byte `provenance_seed_hash`. Reconstruction
    /// from that persisted seed-hash plus the persisted provenance
    /// fields MUST yield the same `DefaultSoulTraitSet` IDs forever.
    /// This Rust snapshot is mirrored byte-for-byte by:
    ///   - sdk/src/trait.test.ts  (deriveDefaultSoulTraits)
    ///   - app/src/lib/soulTraits.test.ts  (deriveAppDefaultSoulTraits)
    ///     Bumping any value here is a parity break — update all three.
    pub(crate) const PERSISTED_SEED_HASH: [u8; SEED_HASH_LEN] =
        [0xc6, 0x13, 0xe0, 0x2a, 0xa4, 0x84, 0x60, 0xb1];

    #[test]
    fn persisted_seed_hash_reconstruction_yields_stable_trait_set() {
        let reconstructed = resolve_default_soul_traits(DefaultSoulTraitInput {
            seed: &PERSISTED_SEED_HASH,
            theme: ArtTheme::Fractal,
            provenance_side: PROVENANCE_SIDE_BUY,
            generation: 7,
            amount: 123_456_789,
            token_amount: 2_000_000,
        });

        // Cross-layer parity snapshot — see sdk/app mirrors above.
        // Bumping any of these IDs is a parity break and must be
        // mirrored in sdk/src/trait.test.ts and
        // app/src/lib/soulTraits.test.ts in the same commit.
        assert_eq!(reconstructed.character_archetype, "solana_dragon");
        assert_eq!(reconstructed.goggles_eyes, "rainbow_goggles");
        assert_eq!(reconstructed.expression, "diamond_grin");
        assert_eq!(reconstructed.gas_aura_cloud, "rainbow_aura");
        assert_eq!(reconstructed.background, "midnight_gradient");
        assert_eq!(reconstructed.outfit, "wizard_cape");
        assert_eq!(reconstructed.relic, "raydium_orb");
        assert_eq!(reconstructed.animation_behavior, "lens_shine");
        assert_eq!(reconstructed.gas_level, "level_3");
    }
}
