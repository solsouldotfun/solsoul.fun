use pinocchio::{error::ProgramError, Address, ProgramResult};
use shared::amm::{is_valid_amm, TargetAmm};

#[path = "state/global_config.rs"]
pub mod global_config;
#[path = "state/render_buffer.rs"]
pub mod render_buffer;
#[path = "state/renderer_registry.rs"]
pub mod renderer_registry;

macro_rules! msg {
    ($message:literal) => {
        emit_msg($message)
    };
}

pub const SOUL_SEED: &[u8] = b"soul";
pub const CLAIM_SEED: &[u8] = b"claim";
pub const RECEIPT_SEED: &[u8] = b"receipt";
pub const RECEIPT_REGISTRY_SEED: &[u8] = b"receipt_registry";
pub const NFT_AUTHORITY_SEED: &[u8] = b"nft";
pub const MIN_CLAIM_BALANCE: u64 = shared::boundary::MT_CLAIM_QUANTUM_BASE_UNITS;
pub const MAX_SOUL_NFT_CLAIMS: u64 = shared::boundary::MAX_MT_SOUL_NFT_CLAIMS;
pub const LAST_SVG_CAPACITY: usize = 4096;
pub const BASE_SVG_TEMPLATE_CAPACITY: usize = 2048;
pub const STYLE_PARAMS_CAPACITY: usize = 256;
pub const MEME_SYMBOL_CAPACITY: usize = 16;
pub const SEED_HASH_LEN: usize = 8;

pub type Pubkey = Address;

pub const PROVENANCE_SIDE_NONE: u8 = 0;
pub const PROVENANCE_SIDE_BUY: u8 = 1;
pub const PROVENANCE_SIDE_SELL: u8 = 2;

pub const RECEIPT_STATE_ACTIVE: u8 = 1;
pub const RECEIPT_STATE_BURNED: u8 = 2;
pub const RECEIPT_STATE_FORFEITED: u8 = 3;

#[repr(C, packed)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SoulAccount {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub created_at: i64,
    pub generation_count: u64,
    pub last_svg_len: u16,
    pub last_svg: [u8; LAST_SVG_CAPACITY],
    pub base_svg_template: [u8; BASE_SVG_TEMPLATE_CAPACITY],
    pub template_len: u16,
    pub style_params: [u8; STYLE_PARAMS_CAPACITY],
    pub style_params_len: u16,
    pub min_claim_balance: u64,
    pub claim_count: u64,
    pub meme_symbol: [u8; MEME_SYMBOL_CAPACITY],
    pub meme_symbol_len: u8,
    pub target_amm: u8,
    pub provenance_generation: u64,
    pub provenance_side: u8,
    pub provenance_amount: u64,
    pub provenance_trader: Pubkey,
    pub provenance_token_account: Pubkey,
    pub provenance_mint: Pubkey,
    pub provenance_soul: Pubkey,
    pub provenance_seed_hash: [u8; SEED_HASH_LEN],
    pub provenance_token_amount: u64,
}

impl SoulAccount {
    pub const MINT_OFFSET: usize = 0;
    pub const AUTHORITY_OFFSET: usize = Self::MINT_OFFSET + 32;
    pub const CREATED_AT_OFFSET: usize = Self::AUTHORITY_OFFSET + 32;
    pub const GENERATION_COUNT_OFFSET: usize = Self::CREATED_AT_OFFSET + 8;
    pub const LAST_SVG_LEN_OFFSET: usize = Self::GENERATION_COUNT_OFFSET + 8;
    pub const LAST_SVG_OFFSET: usize = Self::LAST_SVG_LEN_OFFSET + 2;
    pub const LAST_SVG_END_OFFSET: usize = Self::LAST_SVG_OFFSET + LAST_SVG_CAPACITY;
    pub const BASE_SVG_TEMPLATE_OFFSET: usize = Self::LAST_SVG_END_OFFSET;
    pub const TEMPLATE_LEN_OFFSET: usize =
        Self::BASE_SVG_TEMPLATE_OFFSET + BASE_SVG_TEMPLATE_CAPACITY;
    pub const STYLE_PARAMS_OFFSET: usize = Self::TEMPLATE_LEN_OFFSET + 2;
    pub const STYLE_PARAMS_LEN_OFFSET: usize = Self::STYLE_PARAMS_OFFSET + STYLE_PARAMS_CAPACITY;
    pub const MIN_CLAIM_BALANCE_OFFSET: usize = Self::STYLE_PARAMS_LEN_OFFSET + 2;
    pub const CLAIM_COUNT_OFFSET: usize = Self::MIN_CLAIM_BALANCE_OFFSET + 8;
    pub const CLAIM_COUNT_END_OFFSET: usize = Self::CLAIM_COUNT_OFFSET + 8;
    pub const PRE_M3_LEGACY_LEN: usize = Self::CLAIM_COUNT_END_OFFSET;
    pub const MEME_SYMBOL_OFFSET: usize = Self::CLAIM_COUNT_END_OFFSET;
    pub const MEME_SYMBOL_LEN_OFFSET: usize = Self::MEME_SYMBOL_OFFSET + MEME_SYMBOL_CAPACITY;
    pub const LEGACY_LEN: usize = Self::MEME_SYMBOL_LEN_OFFSET + 1;
    pub const TARGET_AMM_OFFSET: usize = Self::LEGACY_LEN;
    pub const PRE_PD7_LEGACY_LEN: usize = Self::TARGET_AMM_OFFSET + 1;
    pub const PROVENANCE_GENERATION_OFFSET: usize = Self::PRE_PD7_LEGACY_LEN;
    pub const PROVENANCE_SIDE_OFFSET: usize = Self::PROVENANCE_GENERATION_OFFSET + 8;
    pub const PROVENANCE_AMOUNT_OFFSET: usize = Self::PROVENANCE_SIDE_OFFSET + 1;
    pub const PROVENANCE_TRADER_OFFSET: usize = Self::PROVENANCE_AMOUNT_OFFSET + 8;
    pub const PROVENANCE_TOKEN_ACCOUNT_OFFSET: usize = Self::PROVENANCE_TRADER_OFFSET + 32;
    pub const PROVENANCE_MINT_OFFSET: usize = Self::PROVENANCE_TOKEN_ACCOUNT_OFFSET + 32;
    pub const PROVENANCE_SOUL_OFFSET: usize = Self::PROVENANCE_MINT_OFFSET + 32;
    pub const PROVENANCE_SEED_HASH_OFFSET: usize = Self::PROVENANCE_SOUL_OFFSET + 32;
    pub const PROVENANCE_TOKEN_AMOUNT_OFFSET: usize =
        Self::PROVENANCE_SEED_HASH_OFFSET + SEED_HASH_LEN;
    pub const PRE_PROVENANCE_TOKEN_AMOUNT_LEN: usize = Self::PROVENANCE_TOKEN_AMOUNT_OFFSET;
    pub const LEN: usize = Self::PROVENANCE_TOKEN_AMOUNT_OFFSET + 8;

    pub fn unpack(data: &[u8]) -> Result<Self, ProgramError> {
        if data.len() < Self::PRE_M3_LEGACY_LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }

        let mut mint = [0u8; 32];
        mint.copy_from_slice(&data[Self::MINT_OFFSET..Self::AUTHORITY_OFFSET]);

        let mut authority = [0u8; 32];
        authority.copy_from_slice(&data[Self::AUTHORITY_OFFSET..Self::CREATED_AT_OFFSET]);

        let mut created_at = [0u8; 8];
        created_at.copy_from_slice(&data[Self::CREATED_AT_OFFSET..Self::GENERATION_COUNT_OFFSET]);

        let mut generation_count = [0u8; 8];
        generation_count
            .copy_from_slice(&data[Self::GENERATION_COUNT_OFFSET..Self::LAST_SVG_LEN_OFFSET]);

        let mut last_svg_len = [0u8; 2];
        last_svg_len.copy_from_slice(&data[Self::LAST_SVG_LEN_OFFSET..Self::LAST_SVG_OFFSET]);
        let last_svg_len = u16::from_le_bytes(last_svg_len);
        if usize::from(last_svg_len) > LAST_SVG_CAPACITY {
            return Err(ProgramError::InvalidAccountData);
        }

        let mut last_svg = [0u8; LAST_SVG_CAPACITY];
        last_svg.copy_from_slice(&data[Self::LAST_SVG_OFFSET..Self::LAST_SVG_END_OFFSET]);

        let mut base_svg_template = [0u8; BASE_SVG_TEMPLATE_CAPACITY];
        base_svg_template
            .copy_from_slice(&data[Self::BASE_SVG_TEMPLATE_OFFSET..Self::TEMPLATE_LEN_OFFSET]);

        let mut template_len = [0u8; 2];
        template_len.copy_from_slice(&data[Self::TEMPLATE_LEN_OFFSET..Self::STYLE_PARAMS_OFFSET]);
        let template_len = u16::from_le_bytes(template_len);
        if usize::from(template_len) > BASE_SVG_TEMPLATE_CAPACITY {
            return Err(ProgramError::InvalidAccountData);
        }

        let mut style_params = [0u8; STYLE_PARAMS_CAPACITY];
        style_params
            .copy_from_slice(&data[Self::STYLE_PARAMS_OFFSET..Self::STYLE_PARAMS_LEN_OFFSET]);

        let mut style_params_len = [0u8; 2];
        style_params_len
            .copy_from_slice(&data[Self::STYLE_PARAMS_LEN_OFFSET..Self::MIN_CLAIM_BALANCE_OFFSET]);
        let style_params_len = u16::from_le_bytes(style_params_len);
        if usize::from(style_params_len) > STYLE_PARAMS_CAPACITY {
            return Err(ProgramError::InvalidAccountData);
        }

        let mut min_claim_balance = [0u8; 8];
        min_claim_balance
            .copy_from_slice(&data[Self::MIN_CLAIM_BALANCE_OFFSET..Self::CLAIM_COUNT_OFFSET]);

        let mut claim_count = [0u8; 8];
        claim_count.copy_from_slice(&data[Self::CLAIM_COUNT_OFFSET..Self::CLAIM_COUNT_END_OFFSET]);

        let mut meme_symbol = [0u8; MEME_SYMBOL_CAPACITY];
        let meme_symbol_len = if data.len() >= Self::LEGACY_LEN {
            meme_symbol
                .copy_from_slice(&data[Self::MEME_SYMBOL_OFFSET..Self::MEME_SYMBOL_LEN_OFFSET]);
            let len = data[Self::MEME_SYMBOL_LEN_OFFSET];
            if usize::from(len) > MEME_SYMBOL_CAPACITY
                || !meme_symbol[..usize::from(len)].iter().all(u8::is_ascii)
            {
                return Err(ProgramError::InvalidAccountData);
            }
            len
        } else {
            0
        };
        let target_amm = if data.len() >= Self::PRE_PD7_LEGACY_LEN {
            let target = data[Self::TARGET_AMM_OFFSET];
            if !is_valid_amm(target) {
                return Err(ProgramError::InvalidArgument);
            }
            target
        } else {
            msg!("[soul] legacy SoulAccount read: default target_amm=0 (Raydium)");
            TargetAmm::Raydium as u8
        };
        let (
            provenance_generation,
            provenance_side,
            provenance_amount,
            provenance_trader,
            provenance_token_account,
            provenance_mint,
            provenance_soul,
            provenance_seed_hash,
            provenance_token_amount,
        ) = if data.len() >= Self::PRE_PROVENANCE_TOKEN_AMOUNT_LEN {
            let mut generation = [0u8; 8];
            generation.copy_from_slice(
                &data[Self::PROVENANCE_GENERATION_OFFSET..Self::PROVENANCE_SIDE_OFFSET],
            );
            let side = data[Self::PROVENANCE_SIDE_OFFSET];
            if side > PROVENANCE_SIDE_SELL {
                return Err(ProgramError::InvalidAccountData);
            }
            let mut amount = [0u8; 8];
            amount.copy_from_slice(
                &data[Self::PROVENANCE_AMOUNT_OFFSET..Self::PROVENANCE_TRADER_OFFSET],
            );
            let mut trader = [0u8; 32];
            trader.copy_from_slice(
                &data[Self::PROVENANCE_TRADER_OFFSET..Self::PROVENANCE_TOKEN_ACCOUNT_OFFSET],
            );
            let mut token_account = [0u8; 32];
            token_account.copy_from_slice(
                &data[Self::PROVENANCE_TOKEN_ACCOUNT_OFFSET..Self::PROVENANCE_MINT_OFFSET],
            );
            let mut provenance_mint = [0u8; 32];
            provenance_mint
                .copy_from_slice(&data[Self::PROVENANCE_MINT_OFFSET..Self::PROVENANCE_SOUL_OFFSET]);
            let mut provenance_soul = [0u8; 32];
            provenance_soul.copy_from_slice(
                &data[Self::PROVENANCE_SOUL_OFFSET..Self::PROVENANCE_SEED_HASH_OFFSET],
            );
            let mut seed_hash = [0u8; SEED_HASH_LEN];
            seed_hash.copy_from_slice(
                &data[Self::PROVENANCE_SEED_HASH_OFFSET..Self::PROVENANCE_TOKEN_AMOUNT_OFFSET],
            );
            let token_amount = if data.len() >= Self::LEN {
                let mut token_amount = [0u8; 8];
                token_amount
                    .copy_from_slice(&data[Self::PROVENANCE_TOKEN_AMOUNT_OFFSET..Self::LEN]);
                u64::from_le_bytes(token_amount)
            } else {
                0
            };
            (
                u64::from_le_bytes(generation),
                side,
                u64::from_le_bytes(amount),
                Pubkey::new_from_array(trader),
                Pubkey::new_from_array(token_account),
                Pubkey::new_from_array(provenance_mint),
                Pubkey::new_from_array(provenance_soul),
                seed_hash,
                token_amount,
            )
        } else {
            (
                0,
                PROVENANCE_SIDE_NONE,
                0,
                Pubkey::new_from_array([0; 32]),
                Pubkey::new_from_array([0; 32]),
                Pubkey::new_from_array([0; 32]),
                Pubkey::new_from_array([0; 32]),
                [0; SEED_HASH_LEN],
                0,
            )
        };

        Ok(Self {
            mint: Pubkey::new_from_array(mint),
            authority: Pubkey::new_from_array(authority),
            created_at: i64::from_le_bytes(created_at),
            generation_count: u64::from_le_bytes(generation_count),
            last_svg_len,
            last_svg,
            base_svg_template,
            template_len,
            style_params,
            style_params_len,
            min_claim_balance: u64::from_le_bytes(min_claim_balance),
            claim_count: u64::from_le_bytes(claim_count),
            meme_symbol,
            meme_symbol_len,
            target_amm,
            provenance_generation,
            provenance_side,
            provenance_amount,
            provenance_trader,
            provenance_token_account,
            provenance_mint,
            provenance_soul,
            provenance_seed_hash,
            provenance_token_amount,
        })
    }

    pub fn pack(&self, data: &mut [u8]) -> ProgramResult {
        if data.len() < Self::LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }

        let last_svg_len = self.last_svg_len;
        if usize::from(last_svg_len) > LAST_SVG_CAPACITY {
            return Err(ProgramError::InvalidAccountData);
        }
        let template_len = self.template_len;
        if usize::from(template_len) > BASE_SVG_TEMPLATE_CAPACITY {
            return Err(ProgramError::InvalidAccountData);
        }
        let style_params_len = self.style_params_len;
        if usize::from(style_params_len) > STYLE_PARAMS_CAPACITY {
            return Err(ProgramError::InvalidAccountData);
        }
        let meme_symbol_len = self.meme_symbol_len;
        if usize::from(meme_symbol_len) > MEME_SYMBOL_CAPACITY
            || !self.meme_symbol[..usize::from(meme_symbol_len)]
                .iter()
                .all(u8::is_ascii)
        {
            return Err(ProgramError::InvalidAccountData);
        }
        if !is_valid_amm(self.target_amm) {
            return Err(ProgramError::InvalidArgument);
        }
        if self.provenance_side > PROVENANCE_SIDE_SELL {
            return Err(ProgramError::InvalidAccountData);
        }

        data[..Self::LEN].fill(0);

        let mint = self.mint;
        data[Self::MINT_OFFSET..Self::AUTHORITY_OFFSET].copy_from_slice(mint.as_ref());
        let authority = self.authority;
        data[Self::AUTHORITY_OFFSET..Self::CREATED_AT_OFFSET].copy_from_slice(authority.as_ref());
        let created_at = self.created_at;
        data[Self::CREATED_AT_OFFSET..Self::GENERATION_COUNT_OFFSET]
            .copy_from_slice(&created_at.to_le_bytes());
        let generation_count = self.generation_count;
        data[Self::GENERATION_COUNT_OFFSET..Self::LAST_SVG_LEN_OFFSET]
            .copy_from_slice(&generation_count.to_le_bytes());
        data[Self::LAST_SVG_LEN_OFFSET..Self::LAST_SVG_OFFSET]
            .copy_from_slice(&last_svg_len.to_le_bytes());
        let last_svg = self.last_svg;
        data[Self::LAST_SVG_OFFSET..Self::LAST_SVG_END_OFFSET].copy_from_slice(&last_svg);
        let base_svg_template = self.base_svg_template;
        data[Self::BASE_SVG_TEMPLATE_OFFSET..Self::TEMPLATE_LEN_OFFSET]
            .copy_from_slice(&base_svg_template);
        data[Self::TEMPLATE_LEN_OFFSET..Self::STYLE_PARAMS_OFFSET]
            .copy_from_slice(&template_len.to_le_bytes());
        let style_params = self.style_params;
        data[Self::STYLE_PARAMS_OFFSET..Self::STYLE_PARAMS_LEN_OFFSET]
            .copy_from_slice(&style_params);
        data[Self::STYLE_PARAMS_LEN_OFFSET..Self::MIN_CLAIM_BALANCE_OFFSET]
            .copy_from_slice(&style_params_len.to_le_bytes());
        let min_claim_balance = self.min_claim_balance;
        data[Self::MIN_CLAIM_BALANCE_OFFSET..Self::CLAIM_COUNT_OFFSET]
            .copy_from_slice(&min_claim_balance.to_le_bytes());
        let claim_count = self.claim_count;
        data[Self::CLAIM_COUNT_OFFSET..Self::CLAIM_COUNT_END_OFFSET]
            .copy_from_slice(&claim_count.to_le_bytes());
        let meme_symbol = self.meme_symbol;
        data[Self::MEME_SYMBOL_OFFSET..Self::MEME_SYMBOL_LEN_OFFSET].copy_from_slice(&meme_symbol);
        data[Self::MEME_SYMBOL_LEN_OFFSET] = meme_symbol_len;
        data[Self::TARGET_AMM_OFFSET] = self.target_amm;
        let provenance_generation = self.provenance_generation;
        data[Self::PROVENANCE_GENERATION_OFFSET..Self::PROVENANCE_SIDE_OFFSET]
            .copy_from_slice(&provenance_generation.to_le_bytes());
        data[Self::PROVENANCE_SIDE_OFFSET] = self.provenance_side;
        let provenance_amount = self.provenance_amount;
        data[Self::PROVENANCE_AMOUNT_OFFSET..Self::PROVENANCE_TRADER_OFFSET]
            .copy_from_slice(&provenance_amount.to_le_bytes());
        let provenance_trader = self.provenance_trader;
        data[Self::PROVENANCE_TRADER_OFFSET..Self::PROVENANCE_TOKEN_ACCOUNT_OFFSET]
            .copy_from_slice(provenance_trader.as_ref());
        let provenance_token_account = self.provenance_token_account;
        data[Self::PROVENANCE_TOKEN_ACCOUNT_OFFSET..Self::PROVENANCE_MINT_OFFSET]
            .copy_from_slice(provenance_token_account.as_ref());
        let provenance_mint = self.provenance_mint;
        data[Self::PROVENANCE_MINT_OFFSET..Self::PROVENANCE_SOUL_OFFSET]
            .copy_from_slice(provenance_mint.as_ref());
        let provenance_soul = self.provenance_soul;
        data[Self::PROVENANCE_SOUL_OFFSET..Self::PROVENANCE_SEED_HASH_OFFSET]
            .copy_from_slice(provenance_soul.as_ref());
        let provenance_seed_hash = self.provenance_seed_hash;
        data[Self::PROVENANCE_SEED_HASH_OFFSET..Self::PROVENANCE_TOKEN_AMOUNT_OFFSET]
            .copy_from_slice(&provenance_seed_hash);
        let provenance_token_amount = self.provenance_token_amount;
        data[Self::PROVENANCE_TOKEN_AMOUNT_OFFSET..Self::LEN]
            .copy_from_slice(&provenance_token_amount.to_le_bytes());

        Ok(())
    }
}

#[cfg(test)]
static LEGACY_TARGET_AMM_MIGRATION_LOGS: core::sync::atomic::AtomicUsize =
    core::sync::atomic::AtomicUsize::new(0);

#[cfg(test)]
static LEGACY_TARGET_AMM_MIGRATION_LOGS_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[cfg(test)]
fn emit_msg(_message: &str) {
    LEGACY_TARGET_AMM_MIGRATION_LOGS.fetch_add(1, core::sync::atomic::Ordering::SeqCst);
}

#[cfg(all(not(test), target_os = "solana"))]
fn emit_msg(message: &str) {
    unsafe {
        pinocchio::syscalls::sol_log_(message.as_ptr(), message.len() as u64);
    }
}

#[cfg(all(not(test), not(target_os = "solana")))]
fn emit_msg(_message: &str) {}

pub fn derive_soul_address(mint: &Pubkey, program_id: &Pubkey) -> Pubkey {
    Pubkey::derive_address(&[SOUL_SEED, mint.as_ref()], None, program_id)
}

#[repr(C, packed)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ClaimAccount {
    pub soul: Pubkey,
    pub claimer: Pubkey,
    pub nft_mint: Pubkey,
    pub sequence: u64,
    pub generation_count: u64,
}

impl ClaimAccount {
    pub const SOUL_OFFSET: usize = 0;
    pub const CLAIMER_OFFSET: usize = Self::SOUL_OFFSET + 32;
    pub const NFT_MINT_OFFSET: usize = Self::CLAIMER_OFFSET + 32;
    pub const SEQUENCE_OFFSET: usize = Self::NFT_MINT_OFFSET + 32;
    pub const GENERATION_COUNT_OFFSET: usize = Self::SEQUENCE_OFFSET + 8;
    pub const LEN: usize = Self::GENERATION_COUNT_OFFSET + 8;

    pub fn pack(&self, data: &mut [u8]) -> ProgramResult {
        if data.len() < Self::LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }

        data[..Self::LEN].fill(0);
        let soul = self.soul;
        data[Self::SOUL_OFFSET..Self::CLAIMER_OFFSET].copy_from_slice(soul.as_ref());
        let claimer = self.claimer;
        data[Self::CLAIMER_OFFSET..Self::NFT_MINT_OFFSET].copy_from_slice(claimer.as_ref());
        let nft_mint = self.nft_mint;
        data[Self::NFT_MINT_OFFSET..Self::SEQUENCE_OFFSET].copy_from_slice(nft_mint.as_ref());
        let sequence = self.sequence;
        data[Self::SEQUENCE_OFFSET..Self::GENERATION_COUNT_OFFSET]
            .copy_from_slice(&sequence.to_le_bytes());
        let generation_count = self.generation_count;
        data[Self::GENERATION_COUNT_OFFSET..Self::LEN]
            .copy_from_slice(&generation_count.to_le_bytes());
        Ok(())
    }
}

#[repr(C, packed)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ReceiptAccount {
    pub soul: Pubkey,
    pub claimant: Pubkey,
    pub token_mint: Pubkey,
    pub nft_mint: Pubkey,
    pub sequence: u64,
    pub generation_count: u64,
    pub bound_quantity: u64,
    pub bound_boundary: u64,
    pub lifecycle_state: u8,
}

impl ReceiptAccount {
    pub const SOUL_OFFSET: usize = 0;
    pub const CLAIMANT_OFFSET: usize = Self::SOUL_OFFSET + 32;
    pub const TOKEN_MINT_OFFSET: usize = Self::CLAIMANT_OFFSET + 32;
    pub const NFT_MINT_OFFSET: usize = Self::TOKEN_MINT_OFFSET + 32;
    pub const SEQUENCE_OFFSET: usize = Self::NFT_MINT_OFFSET + 32;
    pub const GENERATION_COUNT_OFFSET: usize = Self::SEQUENCE_OFFSET + 8;
    pub const BOUND_QUANTITY_OFFSET: usize = Self::GENERATION_COUNT_OFFSET + 8;
    pub const BOUND_BOUNDARY_OFFSET: usize = Self::BOUND_QUANTITY_OFFSET + 8;
    pub const LIFECYCLE_STATE_OFFSET: usize = Self::BOUND_BOUNDARY_OFFSET + 8;
    pub const LEN: usize = Self::LIFECYCLE_STATE_OFFSET + 1;

    pub fn unpack(data: &[u8]) -> Result<Self, ProgramError> {
        if data.len() < Self::LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }

        let mut soul = [0u8; 32];
        soul.copy_from_slice(&data[Self::SOUL_OFFSET..Self::CLAIMANT_OFFSET]);
        let mut claimant = [0u8; 32];
        claimant.copy_from_slice(&data[Self::CLAIMANT_OFFSET..Self::TOKEN_MINT_OFFSET]);
        let mut token_mint = [0u8; 32];
        token_mint.copy_from_slice(&data[Self::TOKEN_MINT_OFFSET..Self::NFT_MINT_OFFSET]);
        let mut nft_mint = [0u8; 32];
        nft_mint.copy_from_slice(&data[Self::NFT_MINT_OFFSET..Self::SEQUENCE_OFFSET]);
        let mut sequence = [0u8; 8];
        sequence.copy_from_slice(&data[Self::SEQUENCE_OFFSET..Self::GENERATION_COUNT_OFFSET]);
        let mut generation_count = [0u8; 8];
        generation_count
            .copy_from_slice(&data[Self::GENERATION_COUNT_OFFSET..Self::BOUND_QUANTITY_OFFSET]);
        let mut bound_quantity = [0u8; 8];
        bound_quantity
            .copy_from_slice(&data[Self::BOUND_QUANTITY_OFFSET..Self::BOUND_BOUNDARY_OFFSET]);
        let mut bound_boundary = [0u8; 8];
        bound_boundary
            .copy_from_slice(&data[Self::BOUND_BOUNDARY_OFFSET..Self::LIFECYCLE_STATE_OFFSET]);
        let lifecycle_state = data[Self::LIFECYCLE_STATE_OFFSET];
        if !matches!(
            lifecycle_state,
            RECEIPT_STATE_ACTIVE | RECEIPT_STATE_BURNED | RECEIPT_STATE_FORFEITED
        ) {
            return Err(ProgramError::InvalidAccountData);
        }

        Ok(Self {
            soul: Pubkey::new_from_array(soul),
            claimant: Pubkey::new_from_array(claimant),
            token_mint: Pubkey::new_from_array(token_mint),
            nft_mint: Pubkey::new_from_array(nft_mint),
            sequence: u64::from_le_bytes(sequence),
            generation_count: u64::from_le_bytes(generation_count),
            bound_quantity: u64::from_le_bytes(bound_quantity),
            bound_boundary: u64::from_le_bytes(bound_boundary),
            lifecycle_state,
        })
    }

    pub fn pack(&self, data: &mut [u8]) -> ProgramResult {
        if data.len() < Self::LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }

        data[..Self::LEN].fill(0);
        let soul = self.soul;
        data[Self::SOUL_OFFSET..Self::CLAIMANT_OFFSET].copy_from_slice(soul.as_ref());
        let claimant = self.claimant;
        data[Self::CLAIMANT_OFFSET..Self::TOKEN_MINT_OFFSET].copy_from_slice(claimant.as_ref());
        let token_mint = self.token_mint;
        data[Self::TOKEN_MINT_OFFSET..Self::NFT_MINT_OFFSET].copy_from_slice(token_mint.as_ref());
        let nft_mint = self.nft_mint;
        data[Self::NFT_MINT_OFFSET..Self::SEQUENCE_OFFSET].copy_from_slice(nft_mint.as_ref());
        let sequence = self.sequence;
        data[Self::SEQUENCE_OFFSET..Self::GENERATION_COUNT_OFFSET]
            .copy_from_slice(&sequence.to_le_bytes());
        let generation_count = self.generation_count;
        data[Self::GENERATION_COUNT_OFFSET..Self::BOUND_QUANTITY_OFFSET]
            .copy_from_slice(&generation_count.to_le_bytes());
        let bound_quantity = self.bound_quantity;
        data[Self::BOUND_QUANTITY_OFFSET..Self::BOUND_BOUNDARY_OFFSET]
            .copy_from_slice(&bound_quantity.to_le_bytes());
        let bound_boundary = self.bound_boundary;
        data[Self::BOUND_BOUNDARY_OFFSET..Self::LIFECYCLE_STATE_OFFSET]
            .copy_from_slice(&bound_boundary.to_le_bytes());
        data[Self::LIFECYCLE_STATE_OFFSET] = self.lifecycle_state;
        Ok(())
    }
}

#[repr(C, packed)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ReceiptRegistryAccount {
    pub claimant: Pubkey,
    pub token_mint: Pubkey,
    pub active_receipts: u64,
    pub burned_receipts: u64,
    pub forfeited_receipts: u64,
}

impl ReceiptRegistryAccount {
    pub const CLAIMANT_OFFSET: usize = 0;
    pub const TOKEN_MINT_OFFSET: usize = Self::CLAIMANT_OFFSET + 32;
    pub const ACTIVE_RECEIPTS_OFFSET: usize = Self::TOKEN_MINT_OFFSET + 32;
    pub const BURNED_RECEIPTS_OFFSET: usize = Self::ACTIVE_RECEIPTS_OFFSET + 8;
    pub const FORFEITED_RECEIPTS_OFFSET: usize = Self::BURNED_RECEIPTS_OFFSET + 8;
    pub const LEN: usize = Self::FORFEITED_RECEIPTS_OFFSET + 8;

    pub fn unpack(data: &[u8]) -> Result<Self, ProgramError> {
        if data.len() < Self::LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }

        let mut claimant = [0u8; 32];
        claimant.copy_from_slice(&data[Self::CLAIMANT_OFFSET..Self::TOKEN_MINT_OFFSET]);
        let mut token_mint = [0u8; 32];
        token_mint.copy_from_slice(&data[Self::TOKEN_MINT_OFFSET..Self::ACTIVE_RECEIPTS_OFFSET]);
        let mut active_receipts = [0u8; 8];
        active_receipts
            .copy_from_slice(&data[Self::ACTIVE_RECEIPTS_OFFSET..Self::BURNED_RECEIPTS_OFFSET]);
        let mut burned_receipts = [0u8; 8];
        burned_receipts
            .copy_from_slice(&data[Self::BURNED_RECEIPTS_OFFSET..Self::FORFEITED_RECEIPTS_OFFSET]);
        let mut forfeited_receipts = [0u8; 8];
        forfeited_receipts.copy_from_slice(&data[Self::FORFEITED_RECEIPTS_OFFSET..Self::LEN]);

        Ok(Self {
            claimant: Pubkey::new_from_array(claimant),
            token_mint: Pubkey::new_from_array(token_mint),
            active_receipts: u64::from_le_bytes(active_receipts),
            burned_receipts: u64::from_le_bytes(burned_receipts),
            forfeited_receipts: u64::from_le_bytes(forfeited_receipts),
        })
    }

    pub fn pack(&self, data: &mut [u8]) -> ProgramResult {
        if data.len() < Self::LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }

        data[..Self::LEN].fill(0);
        let claimant = self.claimant;
        data[Self::CLAIMANT_OFFSET..Self::TOKEN_MINT_OFFSET].copy_from_slice(claimant.as_ref());
        let token_mint = self.token_mint;
        data[Self::TOKEN_MINT_OFFSET..Self::ACTIVE_RECEIPTS_OFFSET]
            .copy_from_slice(token_mint.as_ref());
        let active_receipts = self.active_receipts;
        data[Self::ACTIVE_RECEIPTS_OFFSET..Self::BURNED_RECEIPTS_OFFSET]
            .copy_from_slice(&active_receipts.to_le_bytes());
        let burned_receipts = self.burned_receipts;
        data[Self::BURNED_RECEIPTS_OFFSET..Self::FORFEITED_RECEIPTS_OFFSET]
            .copy_from_slice(&burned_receipts.to_le_bytes());
        let forfeited_receipts = self.forfeited_receipts;
        data[Self::FORFEITED_RECEIPTS_OFFSET..Self::LEN]
            .copy_from_slice(&forfeited_receipts.to_le_bytes());
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{
        derive_soul_address, ClaimAccount, Pubkey, ReceiptAccount, ReceiptRegistryAccount,
        SoulAccount, BASE_SVG_TEMPLATE_CAPACITY, LAST_SVG_CAPACITY,
        LEGACY_TARGET_AMM_MIGRATION_LOGS, LEGACY_TARGET_AMM_MIGRATION_LOGS_LOCK,
        MAX_SOUL_NFT_CLAIMS, MEME_SYMBOL_CAPACITY, MIN_CLAIM_BALANCE, PROVENANCE_SIDE_BUY,
        PROVENANCE_SIDE_NONE, PROVENANCE_SIDE_SELL, RECEIPT_STATE_ACTIVE, RECEIPT_STATE_BURNED,
        RECEIPT_STATE_FORFEITED, SEED_HASH_LEN, SOUL_SEED, STYLE_PARAMS_CAPACITY,
    };
    use core::mem::size_of;
    use core::sync::atomic::Ordering;
    use pinocchio::error::ProgramError;
    use shared::amm::TargetAmm;
    use std::vec;

    fn reset_legacy_target_amm_migration_logs() -> std::sync::MutexGuard<'static, ()> {
        let guard = LEGACY_TARGET_AMM_MIGRATION_LOGS_LOCK
            .lock()
            .expect("legacy migration log counter lock is not poisoned");
        LEGACY_TARGET_AMM_MIGRATION_LOGS.store(0, Ordering::SeqCst);
        guard
    }

    #[test]
    fn soul_account_layout_has_expected_packed_size() {
        assert_eq!(
            SoulAccount::LEN,
            32 + 32
                + 8
                + 8
                + 2
                + LAST_SVG_CAPACITY
                + BASE_SVG_TEMPLATE_CAPACITY
                + 2
                + STYLE_PARAMS_CAPACITY
                + 2
                + 8
                + 8
                + MEME_SYMBOL_CAPACITY
                + 1
                + 1
                + 8
                + 1
                + 8
                + 32
                + 32
                + 32
                + 32
                + SEED_HASH_LEN
                + 8
        );
        assert_eq!(size_of::<SoulAccount>(), SoulAccount::LEN);
        assert_eq!(SoulAccount::LAST_SVG_OFFSET, 82);
        assert_eq!(
            SoulAccount::BASE_SVG_TEMPLATE_OFFSET,
            SoulAccount::LAST_SVG_OFFSET + LAST_SVG_CAPACITY
        );
        assert_eq!(
            SoulAccount::TEMPLATE_LEN_OFFSET,
            SoulAccount::BASE_SVG_TEMPLATE_OFFSET + BASE_SVG_TEMPLATE_CAPACITY
        );
        assert_eq!(
            SoulAccount::STYLE_PARAMS_OFFSET,
            SoulAccount::TEMPLATE_LEN_OFFSET + 2
        );
        assert_eq!(
            SoulAccount::STYLE_PARAMS_LEN_OFFSET,
            SoulAccount::STYLE_PARAMS_OFFSET + STYLE_PARAMS_CAPACITY
        );
        assert_eq!(
            SoulAccount::MIN_CLAIM_BALANCE_OFFSET,
            SoulAccount::STYLE_PARAMS_LEN_OFFSET + 2
        );
        assert_eq!(
            SoulAccount::CLAIM_COUNT_OFFSET,
            SoulAccount::MIN_CLAIM_BALANCE_OFFSET + 8
        );
        assert_eq!(
            SoulAccount::MEME_SYMBOL_OFFSET,
            SoulAccount::CLAIM_COUNT_OFFSET + 8
        );
        assert_eq!(
            SoulAccount::MEME_SYMBOL_LEN_OFFSET,
            SoulAccount::MEME_SYMBOL_OFFSET + MEME_SYMBOL_CAPACITY
        );
        assert_eq!(SoulAccount::TARGET_AMM_OFFSET, SoulAccount::LEGACY_LEN);
        assert_eq!(
            SoulAccount::PROVENANCE_GENERATION_OFFSET,
            SoulAccount::PRE_PD7_LEGACY_LEN
        );
        assert_eq!(
            SoulAccount::PROVENANCE_SEED_HASH_OFFSET,
            SoulAccount::PROVENANCE_SOUL_OFFSET + 32
        );
        assert_eq!(
            SoulAccount::LEN,
            SoulAccount::PRE_PD7_LEGACY_LEN + 8 + 1 + 8 + 32 + 32 + 32 + 32 + SEED_HASH_LEN + 8
        );
    }

    #[test]
    fn mt_claim_constants_are_canonical_protocol_values() {
        assert_eq!(MIN_CLAIM_BALANCE, 10_000_000_000);
        assert_eq!(MAX_SOUL_NFT_CLAIMS, 2_100);
        assert_eq!(
            crate::state::MIN_CLAIM_BALANCE,
            shared::boundary::MT_CLAIM_QUANTUM_BASE_UNITS
        );
        assert_eq!(
            crate::state::MAX_SOUL_NFT_CLAIMS,
            shared::boundary::MAX_MT_SOUL_NFT_CLAIMS
        );
    }

    #[test]
    fn soul_account_layout_reserves_template_and_style_bytes() {
        let expected_base_template_offset = SoulAccount::LAST_SVG_END_OFFSET;
        let expected_template_len_offset =
            expected_base_template_offset + BASE_SVG_TEMPLATE_CAPACITY;
        let expected_style_params_offset = expected_template_len_offset + 2;
        let expected_style_params_len_offset = expected_style_params_offset + STYLE_PARAMS_CAPACITY;
        let expected_min_claim_balance_offset = expected_style_params_len_offset + 2;
        let expected_claim_count_offset = expected_min_claim_balance_offset + 8;
        let expected_meme_symbol_offset = expected_claim_count_offset + 8;
        let expected_meme_symbol_len_offset = expected_meme_symbol_offset + MEME_SYMBOL_CAPACITY;
        let expected_legacy_len = expected_meme_symbol_len_offset + 1;
        let expected_pre_pd7_legacy_len = expected_legacy_len + 1;
        let expected_len =
            expected_pre_pd7_legacy_len + 8 + 1 + 8 + 32 + 32 + 32 + 32 + SEED_HASH_LEN + 8;

        assert_eq!(
            SoulAccount::PRE_M3_LEGACY_LEN,
            expected_claim_count_offset + 8
        );
        assert_eq!(SoulAccount::LEGACY_LEN, expected_legacy_len);
        assert_eq!(SoulAccount::PRE_PD7_LEGACY_LEN, expected_pre_pd7_legacy_len);
        assert_eq!(SoulAccount::LEN, expected_len);
    }

    #[test]
    fn soul_account_unpack_rejects_oversized_template_lengths() {
        let mut data = vec![0u8; SoulAccount::LEN];
        data[SoulAccount::TEMPLATE_LEN_OFFSET..SoulAccount::STYLE_PARAMS_OFFSET]
            .copy_from_slice(&((BASE_SVG_TEMPLATE_CAPACITY as u16) + 1).to_le_bytes());
        assert_eq!(
            SoulAccount::unpack(&data),
            Err(ProgramError::InvalidAccountData)
        );

        data[SoulAccount::TEMPLATE_LEN_OFFSET..SoulAccount::STYLE_PARAMS_OFFSET]
            .copy_from_slice(&(BASE_SVG_TEMPLATE_CAPACITY as u16).to_le_bytes());
        data[SoulAccount::STYLE_PARAMS_LEN_OFFSET..SoulAccount::MIN_CLAIM_BALANCE_OFFSET]
            .copy_from_slice(&((STYLE_PARAMS_CAPACITY as u16) + 1).to_le_bytes());
        assert_eq!(
            SoulAccount::unpack(&data),
            Err(ProgramError::InvalidAccountData)
        );
    }

    #[test]
    fn soul_account_serialization_roundtrip_preserves_template_fields() {
        let svg = b"<svg><circle /></svg>";
        let mut last_svg = [0u8; LAST_SVG_CAPACITY];
        last_svg[..svg.len()].copy_from_slice(svg);
        let mut base_svg_template = [0u8; BASE_SVG_TEMPLATE_CAPACITY];
        let template = b"<svg fill=\"{{HUE}}\"></svg>";
        base_svg_template[..template.len()].copy_from_slice(template);
        let mut style_params = [0u8; STYLE_PARAMS_CAPACITY];
        let params = b"mode=hsl;evolution=2;pad=";
        style_params[..params.len()].copy_from_slice(params);
        let mut meme_symbol = [0u8; MEME_SYMBOL_CAPACITY];
        meme_symbol[..4].copy_from_slice(b"DOGE");

        let account = SoulAccount {
            mint: Pubkey::new_from_array([1; 32]),
            authority: Pubkey::new_from_array([2; 32]),
            created_at: 1_714_200_000,
            generation_count: 42,
            last_svg_len: svg.len() as u16,
            last_svg,
            base_svg_template,
            template_len: template.len() as u16,
            style_params,
            style_params_len: params.len() as u16,
            min_claim_balance: 7,
            claim_count: 3,
            meme_symbol,
            meme_symbol_len: 4,
            target_amm: TargetAmm::Meteora as u8,
            provenance_generation: 42,
            provenance_side: PROVENANCE_SIDE_BUY,
            provenance_amount: 99_000_000,
            provenance_trader: Pubkey::new_from_array([3; 32]),
            provenance_token_account: Pubkey::new_from_array([4; 32]),
            provenance_mint: Pubkey::new_from_array([1; 32]),
            provenance_soul: Pubkey::new_from_array([5; 32]),
            provenance_seed_hash: [9; SEED_HASH_LEN],
            provenance_token_amount: MIN_CLAIM_BALANCE,
        };

        let mut data = vec![0u8; SoulAccount::LEN];
        account.pack(&mut data).expect("pack succeeds");
        let unpacked = SoulAccount::unpack(&data).expect("unpack succeeds");

        assert_eq!(unpacked, account);
    }

    #[test]
    fn soul_account_target_amm_roundtrips_all_supported_values() {
        for target_amm in [
            TargetAmm::Raydium as u8,
            TargetAmm::Pump as u8,
            TargetAmm::Meteora as u8,
        ] {
            let account = SoulAccount {
                mint: Pubkey::new_from_array([1; 32]),
                authority: Pubkey::new_from_array([2; 32]),
                created_at: 1_714_200_000,
                generation_count: 42,
                last_svg_len: 0,
                last_svg: [0u8; LAST_SVG_CAPACITY],
                base_svg_template: [0u8; BASE_SVG_TEMPLATE_CAPACITY],
                template_len: 0,
                style_params: [0u8; STYLE_PARAMS_CAPACITY],
                style_params_len: 0,
                min_claim_balance: 7,
                claim_count: 3,
                meme_symbol: [0u8; MEME_SYMBOL_CAPACITY],
                meme_symbol_len: 0,
                target_amm,
                provenance_generation: 0,
                provenance_side: PROVENANCE_SIDE_NONE,
                provenance_amount: 0,
                provenance_trader: Pubkey::new_from_array([0; 32]),
                provenance_token_account: Pubkey::new_from_array([0; 32]),
                provenance_mint: Pubkey::new_from_array([0; 32]),
                provenance_soul: Pubkey::new_from_array([0; 32]),
                provenance_seed_hash: [0; SEED_HASH_LEN],
                provenance_token_amount: 0,
            };
            let mut data = vec![0u8; SoulAccount::LEN];

            account.pack(&mut data).expect("pack succeeds");
            let unpacked = SoulAccount::unpack(&data).expect("unpack succeeds");

            assert_eq!(unpacked.target_amm, target_amm);
            assert_eq!(unpacked, account);
        }
    }

    #[test]
    fn soul_account_unpack_accepts_legacy_accounts_without_symbol() {
        let _migration_log_guard = reset_legacy_target_amm_migration_logs();
        let mut data = vec![0u8; SoulAccount::PRE_M3_LEGACY_LEN];
        let mint = [1u8; 32];
        let authority = [2u8; 32];
        data[SoulAccount::MINT_OFFSET..SoulAccount::AUTHORITY_OFFSET].copy_from_slice(&mint);
        data[SoulAccount::AUTHORITY_OFFSET..SoulAccount::CREATED_AT_OFFSET]
            .copy_from_slice(&authority);

        let unpacked = SoulAccount::unpack(&data).expect("legacy account unpacks");

        assert_eq!(unpacked.meme_symbol_len, 0);
        assert_eq!(unpacked.meme_symbol, [0u8; MEME_SYMBOL_CAPACITY]);
        assert_eq!(unpacked.target_amm, TargetAmm::Raydium as u8);
        assert_eq!(unpacked.provenance_side, PROVENANCE_SIDE_NONE);
        let provenance_generation = unpacked.provenance_generation;
        assert_eq!(provenance_generation, 0);
        assert_eq!(LEGACY_TARGET_AMM_MIGRATION_LOGS.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn soul_account_legacy_len_defaults_target_amm_and_logs_migration() {
        let _migration_log_guard = reset_legacy_target_amm_migration_logs();
        let mut data = vec![0u8; SoulAccount::LEGACY_LEN];
        data[SoulAccount::MEME_SYMBOL_OFFSET..SoulAccount::MEME_SYMBOL_OFFSET + 4]
            .copy_from_slice(b"DOGE");
        data[SoulAccount::MEME_SYMBOL_LEN_OFFSET] = 4;

        let unpacked = SoulAccount::unpack(&data).expect("legacy account unpacks");

        assert_eq!(unpacked.meme_symbol_len, 4);
        assert_eq!(&unpacked.meme_symbol[..4], b"DOGE");
        assert_eq!(unpacked.target_amm, TargetAmm::Raydium as u8);
        assert_eq!(unpacked.provenance_side, PROVENANCE_SIDE_NONE);
        let provenance_generation = unpacked.provenance_generation;
        assert_eq!(provenance_generation, 0);
        assert_eq!(LEGACY_TARGET_AMM_MIGRATION_LOGS.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn soul_account_pre_pd7_legacy_len_preserves_existing_fields_without_provenance() {
        let _migration_log_guard = reset_legacy_target_amm_migration_logs();
        let mut data = vec![0u8; SoulAccount::PRE_PD7_LEGACY_LEN];
        data[SoulAccount::GENERATION_COUNT_OFFSET..SoulAccount::LAST_SVG_LEN_OFFSET]
            .copy_from_slice(&7u64.to_le_bytes());
        data[SoulAccount::LAST_SVG_LEN_OFFSET..SoulAccount::LAST_SVG_OFFSET]
            .copy_from_slice(&4u16.to_le_bytes());
        data[SoulAccount::LAST_SVG_OFFSET..SoulAccount::LAST_SVG_OFFSET + 4]
            .copy_from_slice(b"<svg");
        data[SoulAccount::CLAIM_COUNT_OFFSET..SoulAccount::CLAIM_COUNT_END_OFFSET]
            .copy_from_slice(&2u64.to_le_bytes());
        data[SoulAccount::MEME_SYMBOL_OFFSET..SoulAccount::MEME_SYMBOL_OFFSET + 4]
            .copy_from_slice(b"DOGE");
        data[SoulAccount::MEME_SYMBOL_LEN_OFFSET] = 4;
        data[SoulAccount::TARGET_AMM_OFFSET] = TargetAmm::Pump as u8;

        let unpacked = SoulAccount::unpack(&data).expect("pre-PD7 account unpacks");

        let generation_count = unpacked.generation_count;
        assert_eq!(generation_count, 7);
        let last_svg_len = unpacked.last_svg_len;
        assert_eq!(last_svg_len, 4);
        assert_eq!(&unpacked.last_svg[..4], b"<svg");
        let claim_count = unpacked.claim_count;
        assert_eq!(claim_count, 2);
        assert_eq!(&unpacked.meme_symbol[..4], b"DOGE");
        assert_eq!(unpacked.target_amm, TargetAmm::Pump as u8);
        let provenance_generation = unpacked.provenance_generation;
        assert_eq!(provenance_generation, 0);
        assert_eq!(unpacked.provenance_side, PROVENANCE_SIDE_NONE);
        let provenance_amount = unpacked.provenance_amount;
        assert_eq!(provenance_amount, 0);
    }

    #[test]
    fn soul_account_unpack_rejects_invalid_target_amm() {
        let mut data = vec![0u8; SoulAccount::LEN];

        for target_amm in 3..=u8::MAX {
            data[SoulAccount::TARGET_AMM_OFFSET] = target_amm;
            assert_eq!(
                SoulAccount::unpack(&data),
                Err(ProgramError::InvalidArgument)
            );
        }
    }

    #[test]
    fn soul_account_pack_rejects_invalid_target_amm_values() {
        let mut account = SoulAccount {
            mint: Pubkey::new_from_array([1; 32]),
            authority: Pubkey::new_from_array([2; 32]),
            created_at: 1_714_200_000,
            generation_count: 42,
            last_svg_len: 0,
            last_svg: [0u8; LAST_SVG_CAPACITY],
            base_svg_template: [0u8; BASE_SVG_TEMPLATE_CAPACITY],
            template_len: 0,
            style_params: [0u8; STYLE_PARAMS_CAPACITY],
            style_params_len: 0,
            min_claim_balance: 7,
            claim_count: 3,
            meme_symbol: [0u8; MEME_SYMBOL_CAPACITY],
            meme_symbol_len: 0,
            target_amm: TargetAmm::Raydium as u8,
            provenance_generation: 0,
            provenance_side: PROVENANCE_SIDE_NONE,
            provenance_amount: 0,
            provenance_trader: Pubkey::new_from_array([0; 32]),
            provenance_token_account: Pubkey::new_from_array([0; 32]),
            provenance_mint: Pubkey::new_from_array([0; 32]),
            provenance_soul: Pubkey::new_from_array([0; 32]),
            provenance_seed_hash: [0; SEED_HASH_LEN],
            provenance_token_amount: 0,
        };
        let mut data = vec![0u8; SoulAccount::LEN];

        for target_amm in 3..=u8::MAX {
            account.target_amm = target_amm;
            assert_eq!(account.pack(&mut data), Err(ProgramError::InvalidArgument));
        }
    }

    #[test]
    fn soul_account_pack_rejects_invalid_provenance_side() {
        let account = SoulAccount {
            mint: Pubkey::new_from_array([1; 32]),
            authority: Pubkey::new_from_array([2; 32]),
            created_at: 1_714_200_000,
            generation_count: 42,
            last_svg_len: 0,
            last_svg: [0u8; LAST_SVG_CAPACITY],
            base_svg_template: [0u8; BASE_SVG_TEMPLATE_CAPACITY],
            template_len: 0,
            style_params: [0u8; STYLE_PARAMS_CAPACITY],
            style_params_len: 0,
            min_claim_balance: 7,
            claim_count: 3,
            meme_symbol: [0u8; MEME_SYMBOL_CAPACITY],
            meme_symbol_len: 0,
            target_amm: TargetAmm::Raydium as u8,
            provenance_generation: 1,
            provenance_side: PROVENANCE_SIDE_SELL + 1,
            provenance_amount: 10,
            provenance_trader: Pubkey::new_from_array([3; 32]),
            provenance_token_account: Pubkey::new_from_array([4; 32]),
            provenance_mint: Pubkey::new_from_array([1; 32]),
            provenance_soul: Pubkey::new_from_array([5; 32]),
            provenance_seed_hash: [9; SEED_HASH_LEN],
            provenance_token_amount: MIN_CLAIM_BALANCE,
        };
        let mut data = vec![0u8; SoulAccount::LEN];

        assert_eq!(
            account.pack(&mut data),
            Err(ProgramError::InvalidAccountData)
        );
    }

    #[test]
    fn soul_pda_derivation_uses_mint_seed() {
        let program_id = Pubkey::new_from_array([7; 32]);
        let mint = Pubkey::new_from_array([11; 32]);
        let expected = Pubkey::derive_address(&[SOUL_SEED, mint.as_ref()], None, &program_id);

        assert_eq!(derive_soul_address(&mint, &program_id), expected);
    }

    #[test]
    fn claim_account_layout_has_expected_packed_size() {
        assert_eq!(ClaimAccount::LEN, 32 + 32 + 32 + 8 + 8);
        assert_eq!(size_of::<ClaimAccount>(), ClaimAccount::LEN);
    }

    #[test]
    fn receipt_account_layout_has_expected_packed_size_and_roundtrips_states() {
        assert_eq!(ReceiptAccount::LEN, (32 * 4) + (8 * 4) + 1);
        assert_eq!(size_of::<ReceiptAccount>(), ReceiptAccount::LEN);

        for state in [
            RECEIPT_STATE_ACTIVE,
            RECEIPT_STATE_BURNED,
            RECEIPT_STATE_FORFEITED,
        ] {
            let receipt = ReceiptAccount {
                soul: Pubkey::new_from_array([1; 32]),
                claimant: Pubkey::new_from_array([2; 32]),
                token_mint: Pubkey::new_from_array([3; 32]),
                nft_mint: Pubkey::new_from_array([4; 32]),
                sequence: 5,
                generation_count: 6,
                bound_quantity: 1,
                bound_boundary: MIN_CLAIM_BALANCE,
                lifecycle_state: state,
            };
            let mut data = vec![0u8; ReceiptAccount::LEN];
            receipt.pack(&mut data).expect("receipt packs");
            let decoded = ReceiptAccount::unpack(&data).expect("receipt unpacks");
            assert_eq!(decoded, receipt);
        }
    }

    #[test]
    fn receipt_account_unpack_rejects_unknown_lifecycle_state() {
        let receipt = ReceiptAccount {
            soul: Pubkey::new_from_array([1; 32]),
            claimant: Pubkey::new_from_array([2; 32]),
            token_mint: Pubkey::new_from_array([3; 32]),
            nft_mint: Pubkey::new_from_array([4; 32]),
            sequence: 5,
            generation_count: 6,
            bound_quantity: 1,
            bound_boundary: MIN_CLAIM_BALANCE,
            lifecycle_state: RECEIPT_STATE_ACTIVE,
        };
        let mut data = vec![0u8; ReceiptAccount::LEN];
        receipt.pack(&mut data).expect("receipt packs");
        data[ReceiptAccount::LIFECYCLE_STATE_OFFSET] = 99;

        assert_eq!(
            ReceiptAccount::unpack(&data),
            Err(ProgramError::InvalidAccountData)
        );
    }

    #[test]
    fn receipt_registry_layout_tracks_lifecycle_counts_without_claim_account_changes() {
        assert_eq!(ReceiptRegistryAccount::LEN, 32 + 32 + 8 + 8 + 8);
        assert_eq!(
            size_of::<ReceiptRegistryAccount>(),
            ReceiptRegistryAccount::LEN
        );
        assert_eq!(ClaimAccount::LEN, 32 + 32 + 32 + 8 + 8);

        let registry = ReceiptRegistryAccount {
            claimant: Pubkey::new_from_array([9; 32]),
            token_mint: Pubkey::new_from_array([8; 32]),
            active_receipts: 3,
            burned_receipts: 2,
            forfeited_receipts: 1,
        };
        let mut data = vec![0u8; ReceiptRegistryAccount::LEN];
        registry.pack(&mut data).expect("registry packs");
        let decoded = ReceiptRegistryAccount::unpack(&data).expect("registry unpacks");
        assert_eq!(decoded, registry);
    }
}
