use libm::log2;
use pinocchio::error::ProgramError;

pub const FAMILY_FRACTAL: u8 = 0;
pub const FAMILY_FIELD: u8 = 1;
pub const FAMILY_LATTICE: u8 = 2;
pub const FAMILY_CHAOS: u8 = 3;
pub const FAMILY_HARMONIC: u8 = 4;
pub const FAMILY_COUNT: u8 = 5;

pub const PROJECTION_ORTHOGRAPHIC: u8 = 0;
pub const PROJECTION_PERSPECTIVE: u8 = 1;
pub const PROJECTION_HYPERBOLIC: u8 = 2;

pub const DECAY_EXPONENTIAL: u8 = 0;
pub const DECAY_LINEAR: u8 = 1;
pub const DECAY_NONE: u8 = 2;

pub const BLUEPRINT_VERSION: u8 = 1;

#[repr(C, packed)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RenderBlueprint {
    pub version: u8,
    pub family: u8,
    pub generation: u64,
    pub birth_timestamp: i64,
    pub provenance_seed_hash: [u8; 8],
    pub base_params: BaseParams,
    pub evolution_state: EvolutionState,
}

#[repr(C, packed)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct BaseParams {
    pub dimensionality: u8,
    pub projection: u8,
    pub depth: u8,
    pub fundamental: u8,
    pub overtones: u8,
    pub decay: u8,
    pub entropy: u8,
    pub reserved: u8,
}

#[repr(C, packed)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct EvolutionState {
    pub xp: u64,
    pub level: u8,
    pub trade_count: u32,
    pub total_hold_days: u32,
    pub milestone_flags: u32,
    pub reserved: [u8; 4],
}

pub const MILESTONE_GENESIS: u32 = 1 << 0;
pub const MILESTONE_FIRST_BLOOD: u32 = 1 << 1;
pub const MILESTONE_HODLER: u32 = 1 << 2;
pub const MILESTONE_VETERAN: u32 = 1 << 3;
pub const MILESTONE_WHALE: u32 = 1 << 4;
pub const MILESTONE_DEGEN: u32 = 1 << 5;
pub const MILESTONE_LP_KING: u32 = 1 << 6;
pub const MILESTONE_CENTURY: u32 = 1 << 7;
pub const MILESTONE_MILLENNIUM: u32 = 1 << 8;

impl RenderBlueprint {
    pub const VERSION_OFFSET: usize = 0;
    pub const FAMILY_OFFSET: usize = Self::VERSION_OFFSET + 1;
    pub const GENERATION_OFFSET: usize = Self::FAMILY_OFFSET + 1;
    pub const BIRTH_TIMESTAMP_OFFSET: usize = Self::GENERATION_OFFSET + 8;
    pub const PROVENANCE_SEED_HASH_OFFSET: usize = Self::BIRTH_TIMESTAMP_OFFSET + 8;
    pub const BASE_PARAMS_OFFSET: usize = Self::PROVENANCE_SEED_HASH_OFFSET + 8;
    pub const EVOLUTION_STATE_OFFSET: usize = Self::BASE_PARAMS_OFFSET + 8;
    pub const LEN: usize = Self::EVOLUTION_STATE_OFFSET + 25;

    pub fn derive(generation: u64, birth_timestamp: i64, provenance_seed_hash: [u8; 8]) -> Self {
        let family = derive_family(&provenance_seed_hash);
        let base_params = derive_base_params(&provenance_seed_hash);

        Self {
            version: BLUEPRINT_VERSION,
            family,
            generation,
            birth_timestamp,
            provenance_seed_hash,
            base_params,
            evolution_state: EvolutionState::default(),
        }
    }

    pub fn pack(&self, data: &mut [u8]) -> Result<(), ProgramError> {
        if data.len() < Self::LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }

        data[Self::VERSION_OFFSET] = self.version;
        data[Self::FAMILY_OFFSET] = self.family;
        data[Self::GENERATION_OFFSET..Self::BIRTH_TIMESTAMP_OFFSET]
            .copy_from_slice(&self.generation.to_le_bytes());
        data[Self::BIRTH_TIMESTAMP_OFFSET..Self::PROVENANCE_SEED_HASH_OFFSET]
            .copy_from_slice(&self.birth_timestamp.to_le_bytes());
        data[Self::PROVENANCE_SEED_HASH_OFFSET..Self::BASE_PARAMS_OFFSET]
            .copy_from_slice(&self.provenance_seed_hash);
        data[Self::BASE_PARAMS_OFFSET] = self.base_params.dimensionality;
        data[Self::BASE_PARAMS_OFFSET + 1] = self.base_params.projection;
        data[Self::BASE_PARAMS_OFFSET + 2] = self.base_params.depth;
        data[Self::BASE_PARAMS_OFFSET + 3] = self.base_params.fundamental;
        data[Self::BASE_PARAMS_OFFSET + 4] = self.base_params.overtones;
        data[Self::BASE_PARAMS_OFFSET + 5] = self.base_params.decay;
        data[Self::BASE_PARAMS_OFFSET + 6] = self.base_params.entropy;
        data[Self::BASE_PARAMS_OFFSET + 7] = self.base_params.reserved;
        data[Self::EVOLUTION_STATE_OFFSET..Self::EVOLUTION_STATE_OFFSET + 8]
            .copy_from_slice(&self.evolution_state.xp.to_le_bytes());
        data[Self::EVOLUTION_STATE_OFFSET + 8] = self.evolution_state.level;
        data[Self::EVOLUTION_STATE_OFFSET + 9..Self::EVOLUTION_STATE_OFFSET + 13]
            .copy_from_slice(&self.evolution_state.trade_count.to_le_bytes());
        data[Self::EVOLUTION_STATE_OFFSET + 13..Self::EVOLUTION_STATE_OFFSET + 17]
            .copy_from_slice(&self.evolution_state.total_hold_days.to_le_bytes());
        data[Self::EVOLUTION_STATE_OFFSET + 17..Self::EVOLUTION_STATE_OFFSET + 21]
            .copy_from_slice(&self.evolution_state.milestone_flags.to_le_bytes());
        data[Self::EVOLUTION_STATE_OFFSET + 21..Self::EVOLUTION_STATE_OFFSET + 25]
            .copy_from_slice(&self.evolution_state.reserved);

        Ok(())
    }

    pub fn unpack(data: &[u8]) -> Result<Self, ProgramError> {
        if data.len() < Self::LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }

        let version = data[Self::VERSION_OFFSET];
        let family = data[Self::FAMILY_OFFSET];

        if version != BLUEPRINT_VERSION {
            return Err(ProgramError::InvalidAccountData);
        }
        if family >= FAMILY_COUNT {
            return Err(ProgramError::InvalidAccountData);
        }

        let mut generation = [0u8; 8];
        generation.copy_from_slice(&data[Self::GENERATION_OFFSET..Self::BIRTH_TIMESTAMP_OFFSET]);

        let mut birth_timestamp = [0u8; 8];
        birth_timestamp.copy_from_slice(
            &data[Self::BIRTH_TIMESTAMP_OFFSET..Self::PROVENANCE_SEED_HASH_OFFSET],
        );

        let mut provenance_seed_hash = [0u8; 8];
        provenance_seed_hash
            .copy_from_slice(&data[Self::PROVENANCE_SEED_HASH_OFFSET..Self::BASE_PARAMS_OFFSET]);

        let base_params = BaseParams {
            dimensionality: data[Self::BASE_PARAMS_OFFSET],
            projection: data[Self::BASE_PARAMS_OFFSET + 1],
            depth: data[Self::BASE_PARAMS_OFFSET + 2],
            fundamental: data[Self::BASE_PARAMS_OFFSET + 3],
            overtones: data[Self::BASE_PARAMS_OFFSET + 4],
            decay: data[Self::BASE_PARAMS_OFFSET + 5],
            entropy: data[Self::BASE_PARAMS_OFFSET + 6],
            reserved: data[Self::BASE_PARAMS_OFFSET + 7],
        };

        let mut xp = [0u8; 8];
        xp.copy_from_slice(&data[Self::EVOLUTION_STATE_OFFSET..Self::EVOLUTION_STATE_OFFSET + 8]);

        let mut trade_count = [0u8; 4];
        trade_count.copy_from_slice(
            &data[Self::EVOLUTION_STATE_OFFSET + 9..Self::EVOLUTION_STATE_OFFSET + 13],
        );

        let mut total_hold_days = [0u8; 4];
        total_hold_days.copy_from_slice(
            &data[Self::EVOLUTION_STATE_OFFSET + 13..Self::EVOLUTION_STATE_OFFSET + 17],
        );

        let mut milestone_flags = [0u8; 4];
        milestone_flags.copy_from_slice(
            &data[Self::EVOLUTION_STATE_OFFSET + 17..Self::EVOLUTION_STATE_OFFSET + 21],
        );

        let mut reserved = [0u8; 4];
        reserved.copy_from_slice(
            &data[Self::EVOLUTION_STATE_OFFSET + 21..Self::EVOLUTION_STATE_OFFSET + 25],
        );

        Ok(Self {
            version,
            family,
            generation: u64::from_le_bytes(generation),
            birth_timestamp: i64::from_le_bytes(birth_timestamp),
            provenance_seed_hash,
            base_params,
            evolution_state: EvolutionState {
                xp: u64::from_le_bytes(xp),
                level: data[Self::EVOLUTION_STATE_OFFSET + 8],
                trade_count: u32::from_le_bytes(trade_count),
                total_hold_days: u32::from_le_bytes(total_hold_days),
                milestone_flags: u32::from_le_bytes(milestone_flags),
                reserved,
            },
        })
    }
}

impl Default for EvolutionState {
    fn default() -> Self {
        Self {
            xp: 0,
            level: 1,
            trade_count: 0,
            total_hold_days: 0,
            milestone_flags: MILESTONE_GENESIS,
            reserved: [0; 4],
        }
    }
}

fn derive_family(seed_hash: &[u8; 8]) -> u8 {
    seed_hash[0] % FAMILY_COUNT
}

fn derive_base_params(seed_hash: &[u8; 8]) -> BaseParams {
    BaseParams {
        dimensionality: 20 + (seed_hash[1] % 31),
        projection: seed_hash[2] % 3,
        depth: seed_hash[3],
        fundamental: 1 + (seed_hash[4] % 100),
        overtones: seed_hash[5] % 8,
        decay: seed_hash[6] % 3,
        entropy: seed_hash[7],
        reserved: 0,
    }
}

pub fn calculate_level(xp: u64) -> u8 {
    if xp == 0 {
        return 1;
    }
    let level: f64 = 1.0 + log2((xp as f64) / 100.0);
    let level = if level < 1.0 { 1.0f64 } else { level };
    if level > 100.0 {
        100u8
    } else {
        level as u8
    }
}

pub fn calculate_trade_xp(volume_usd: u64, is_first_buy: bool) -> u64 {
    let base = 10 * volume_usd;
    if is_first_buy {
        base * 2
    } else {
        base
    }
}

pub fn calculate_hold_xp(days_held: u32) -> u64 {
    u64::from(days_held)
}

pub fn check_milestones(
    current_flags: u32,
    trade_count: u32,
    total_hold_days: u32,
    max_trade_volume_usd: u64,
    lp_contribution_usd: u64,
) -> u32 {
    let mut new_flags = current_flags;

    if trade_count >= 1 && (current_flags & MILESTONE_FIRST_BLOOD) == 0 {
        new_flags |= MILESTONE_FIRST_BLOOD;
    }
    if total_hold_days >= 30 && (current_flags & MILESTONE_HODLER) == 0 {
        new_flags |= MILESTONE_HODLER;
    }
    if total_hold_days >= 365 && (current_flags & MILESTONE_VETERAN) == 0 {
        new_flags |= MILESTONE_VETERAN;
    }
    if max_trade_volume_usd >= 10_000 && (current_flags & MILESTONE_WHALE) == 0 {
        new_flags |= MILESTONE_WHALE;
    }
    if trade_count >= 100 && (current_flags & MILESTONE_CENTURY) == 0 {
        new_flags |= MILESTONE_CENTURY;
    }
    if trade_count >= 1000 && (current_flags & MILESTONE_MILLENNIUM) == 0 {
        new_flags |= MILESTONE_MILLENNIUM;
    }
    if lp_contribution_usd >= 50_000 && (current_flags & MILESTONE_LP_KING) == 0 {
        new_flags |= MILESTONE_LP_KING;
    }

    new_flags
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blueprint_derives_family_from_seed() {
        let seed1 = [0u8; 8];
        let seed2 = [1u8; 8];
        let seed3 = [5u8; 8];

        assert_eq!(derive_family(&seed1), FAMILY_FRACTAL);
        assert_eq!(derive_family(&seed2), FAMILY_FIELD);
        assert_eq!(derive_family(&seed3), FAMILY_FRACTAL);
    }

    #[test]
    fn blueprint_derives_base_params_in_ranges() {
        let seed = [0xABu8; 8];
        let params = derive_base_params(&seed);

        assert!(params.dimensionality >= 20 && params.dimensionality <= 50);
        assert!(params.projection < 3);
        assert!(params.fundamental >= 1 && params.fundamental <= 100);
        assert!(params.overtones < 8);
        assert!(params.decay < 3);
    }

    #[test]
    fn blueprint_pack_unpack_roundtrip() {
        let blueprint = RenderBlueprint::derive(42, 1_714_200_000, [0xc6; 8]);

        let mut data = [0u8; RenderBlueprint::LEN];
        blueprint.pack(&mut data).expect("pack succeeds");

        let unpacked = RenderBlueprint::unpack(&data).expect("unpack succeeds");
        let generation = { unpacked.generation };
        let birth_timestamp = { unpacked.birth_timestamp };
        let provenance_seed_hash = { unpacked.provenance_seed_hash };
        let dimensionality = { unpacked.base_params.dimensionality };
        let level = { unpacked.evolution_state.level };
        let milestone_flags = { unpacked.evolution_state.milestone_flags };

        assert_eq!(unpacked.version, BLUEPRINT_VERSION);
        assert_eq!(generation, 42);
        assert_eq!(birth_timestamp, 1_714_200_000);
        assert_eq!(provenance_seed_hash, [0xc6; 8]);
        assert_eq!(dimensionality, blueprint.base_params.dimensionality);
        assert_eq!(level, 1);
        assert_eq!(milestone_flags, MILESTONE_GENESIS);
    }

    #[test]
    fn level_calculation_follows_logarithmic_curve() {
        assert_eq!(calculate_level(0), 1);
        assert_eq!(calculate_level(100), 1);
        assert_eq!(calculate_level(300), 2);
        assert_eq!(calculate_level(700), 3);
        assert_eq!(calculate_level(100_000), 10);
    }

    #[test]
    fn trade_xp_scales_with_volume() {
        assert_eq!(calculate_trade_xp(100, false), 1000);
        assert_eq!(calculate_trade_xp(100, true), 2000);
    }

    #[test]
    fn milestone_check_triggers_correctly() {
        let flags = check_milestones(MILESTONE_GENESIS, 1, 0, 0, 0);
        assert!(flags & MILESTONE_FIRST_BLOOD != 0);

        let flags = check_milestones(MILESTONE_GENESIS, 0, 30, 0, 0);
        assert!(flags & MILESTONE_HODLER != 0);

        let flags = check_milestones(MILESTONE_GENESIS, 0, 0, 10_000, 0);
        assert!(flags & MILESTONE_WHALE != 0);

        let flags = check_milestones(MILESTONE_GENESIS, 100, 0, 0, 0);
        assert!(flags & MILESTONE_CENTURY != 0);
    }

    #[test]
    fn blueprint_size_is_small() {
        assert_eq!(RenderBlueprint::LEN, 59);
    }
}
