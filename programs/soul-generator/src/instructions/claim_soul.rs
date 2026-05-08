use crate::{
    state::{
        global_config::assert_global_config_not_paused, ClaimAccount, ReceiptAccount,
        ReceiptRegistryAccount, SoulAccount, CLAIM_SEED, MAX_SOUL_NFT_CLAIMS, MIN_CLAIM_BALANCE,
        NFT_AUTHORITY_SEED, PROVENANCE_SIDE_BUY, PROVENANCE_SIDE_SELL, RECEIPT_REGISTRY_SEED,
        RECEIPT_SEED, RECEIPT_STATE_ACTIVE, SEED_HASH_LEN, SOUL_SEED,
    },
    svg::{
        theme::{resolve_art_theme, ArtTheme},
        traits::{resolve_blended_soul_traits, BlendedSoulTraitSet, DefaultSoulTraitInput},
    },
    token_2022::{
        freeze_account_signed, initialize_metadata_pointer, initialize_mint2_with_freeze_authority,
        initialize_token_metadata_signed, mint_to_signed, token_metadata_mint_len,
        TokenMetadataInit, EXTENSION_ACCOUNT_BASE_LEN, METADATA_POINTER_EXTENSION_LEN,
        TLV_ENTRY_HEADER_LEN, TOKEN_2022_ID,
    },
};
use alloc::{
    format,
    string::{String, ToString},
    vec::Vec,
};
use pinocchio::{
    cpi::{invoke, Seed, Signer},
    error::ProgramError,
    instruction::{InstructionAccount, InstructionView},
    sysvars::rent::{ACCOUNT_STORAGE_OVERHEAD, DEFAULT_LAMPORTS_PER_BYTE},
    AccountView, Address, ProgramResult,
};
use pinocchio_system::instructions::{Allocate, Assign, CreateAccount, Transfer};
use shared::geppetto::{
    assert_owned_by, assert_pda, assert_program_id, assert_signer, assert_writable, GeppettoError,
};

const MAX_PERMITTED_DATA_LENGTH: u64 = 10 * 1024 * 1024;
const ASSOCIATED_TOKEN_PROGRAM_ID: Address = Address::new_from_array(pinocchio_pubkey::pubkey!(
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
));
const TOKEN_ACCOUNT_MINT_OFFSET: usize = 0;
const TOKEN_ACCOUNT_OWNER_OFFSET: usize = 32;
const TOKEN_ACCOUNT_AMOUNT_OFFSET: usize = 64;
const TOKEN_ACCOUNT_AMOUNT_END: usize = TOKEN_ACCOUNT_AMOUNT_OFFSET + 8;
const TOKEN_ACCOUNT_MIN_LEN: usize = 165;
const DEFAULT_NFT_METADATA_SYMBOL: &str = "SOUL";
const JSON_DATA_URI_PREFIX: &str = "data:application/json;base64,";
const SVG_DATA_URI_PREFIX: &str = "data:image/svg+xml;base64,";
const SOLSOUL_ART_ENGINE_LABEL: &str = "SolSoul On-Chain Art Engine";
const BASE64_ALPHABET: &[u8; 64] =
    b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

#[repr(u32)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ClaimSoulError {
    NoGeneratedSoul = 0x300,
    SoulAlreadyClaimed = 0x301,
    InsufficientClaimBalance = 0x302,
    InsufficientClaimProvenance = 0x303,
    ReceiptAlreadyBound = 0x304,
    ReceiptCapacityExceeded = 0x305,
    InvalidReceiptBinding = 0x306,
    SoulNftHardCapExceeded = 0x307,
}

impl From<ClaimSoulError> for ProgramError {
    fn from(value: ClaimSoulError) -> Self {
        ProgramError::Custom(value as u32)
    }
}

struct ClaimFields {
    mint: Address,
    authority: Address,
    generation_count: u64,
    last_svg_len: u16,
    template_len: u16,
    style_params: Vec<u8>,
    min_claim_balance: u64,
    claim_count: u64,
    meme_symbol: String,
    last_svg: Vec<u8>,
    provenance: Option<ClaimProvenance>,
}

struct ClaimMetadataContext<'a> {
    creator: Address,
    token_mint: Address,
    token_symbol: &'a str,
    art_theme_id: ArtTheme,
    art_theme: &'static str,
    generation: u64,
    style_params: &'a [u8],
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct ClaimProvenance {
    generation: u64,
    side: u8,
    amount: u64,
    trader: Address,
    token_account: Address,
    mint: Address,
    soul: Address,
    seed_hash: [u8; SEED_HASH_LEN],
    token_amount: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ClaimPdaSigner {
    Legacy,
    Bumped(u8),
}

pub fn process(
    program_id: &Address,
    accounts: &mut [AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    if !instruction_data.is_empty() {
        return Err(ProgramError::InvalidInstructionData);
    }

    if accounts.len() < 13 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }

    let (soul_accounts, rest) = accounts.split_at_mut(2);
    let (soul_slice, claim_slice) = soul_accounts.split_at_mut(1);
    let soul = &mut soul_slice[0];
    let claim = &mut claim_slice[0];
    let (fixed_rest, tail) = rest.split_at_mut(8);
    let claimer = &fixed_rest[0];
    let meme_mint = &fixed_rest[1];
    let claimer_meme_ata = &fixed_rest[2];
    let nft_mint = &fixed_rest[3];
    let nft_token_account = &fixed_rest[4];
    let nft_authority = &fixed_rest[5];
    let token_program = &fixed_rest[6];
    let system_program = &fixed_rest[7];
    let (associated_token_program, receipt, receipt_registry, global_config) = match tail.len() {
        3 => {
            let (receipt_slice, tail) = tail.split_at_mut(1);
            let (registry_slice, config_slice) = tail.split_at_mut(1);
            (
                None,
                &mut receipt_slice[0],
                &mut registry_slice[0],
                &config_slice[0],
            )
        }
        4 => {
            let (associated_slice, tail) = tail.split_at_mut(1);
            let (receipt_slice, tail) = tail.split_at_mut(1);
            let (registry_slice, config_slice) = tail.split_at_mut(1);
            (
                Some(&associated_slice[0]),
                &mut receipt_slice[0],
                &mut registry_slice[0],
                &config_slice[0],
            )
        }
        1 | 2 => return Err(ProgramError::NotEnoughAccountKeys),
        _ => return Err(ProgramError::InvalidArgument),
    };

    assert_writable(soul)?;
    assert_owned_by(soul, program_id)?;
    assert_global_config_not_paused(global_config, program_id)?;
    assert_writable(claim)?;
    assert_writable(claimer)?;
    assert_signer(claimer)?;
    assert_owned_by(meme_mint, &TOKEN_2022_ID)?;
    assert_owned_by(claimer_meme_ata, &TOKEN_2022_ID)?;
    assert_writable(nft_mint)?;
    assert_owned_by(nft_mint, &TOKEN_2022_ID)?;
    assert_writable(nft_token_account)?;
    assert_writable(receipt)?;
    assert_writable(receipt_registry)?;
    assert_program_id(token_program, &TOKEN_2022_ID)?;
    assert_program_id(system_program, &pinocchio_system::ID)?;
    if let Some(program) = associated_token_program {
        assert_program_id(program, &ASSOCIATED_TOKEN_PROGRAM_ID)?;
    } else {
        assert_owned_by(nft_token_account, &TOKEN_2022_ID)?;
    }

    if soul.data_len() < SoulAccount::PRE_M3_LEGACY_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }

    let mut claim_fields = {
        let data = soul.try_borrow()?;
        read_claim_fields(&data)?
    };

    assert_pda(soul, &[SOUL_SEED, claim_fields.mint.as_ref()], program_id)?;
    if meme_mint.address() != &claim_fields.mint {
        return Err(ProgramError::InvalidAccountData);
    }
    let sequence = claim_sequence(
        claim_fields.generation_count,
        claim_fields.claim_count,
        claim_fields.last_svg_len,
    )?;
    let sequence_bytes = sequence.to_le_bytes();
    let claim_pda_signer = assert_legacy_or_bumped_claim_pda(
        claim,
        CLAIM_SEED,
        soul.address(),
        &sequence_bytes,
        program_id,
    )?;
    let nft_authority_pda_signer = assert_legacy_or_bumped_claim_pda(
        nft_authority,
        NFT_AUTHORITY_SEED,
        soul.address(),
        &sequence_bytes,
        program_id,
    )?;
    let receipt_bump = assert_canonical_pda(
        receipt,
        &[RECEIPT_SEED, soul.address().as_ref(), &sequence_bytes],
        program_id,
    )?;
    let receipt_registry_bump = assert_canonical_pda(
        receipt_registry,
        &[
            RECEIPT_REGISTRY_SEED,
            claimer.address().as_ref(),
            claim_fields.mint.as_ref(),
        ],
        program_id,
    )?;
    if claim.data_len() != 0 {
        return Err(ClaimSoulError::SoulAlreadyClaimed.into());
    }
    if receipt.data_len() != 0 {
        return Err(ClaimSoulError::ReceiptAlreadyBound.into());
    }
    if receipt_registry.data_len() != 0 {
        assert_owned_by(receipt_registry, program_id)?;
    }

    assert_associated_token_address(claimer_meme_ata, claimer.address(), &claim_fields.mint)?;
    assert_token_account(claimer_meme_ata, &claim_fields.mint, claimer.address())?;
    let balance = read_token_amount(claimer_meme_ata)?;
    assert_sufficient_balance(balance, claim_fields.min_claim_balance)?;
    let effective_bound_quantity = required_claim_balance(claim_fields.min_claim_balance);
    assert_claim_provenance(
        claim_fields.provenance.as_ref(),
        claim_fields.generation_count,
        sequence,
        claimer.address(),
        claimer_meme_ata.address(),
        &claim_fields.mint,
        soul.address(),
    )?;
    let mut registry_state = if receipt_registry.data_len() == 0 {
        ReceiptRegistryAccount {
            claimant: *claimer.address(),
            token_mint: claim_fields.mint,
            active_receipts: 0,
            burned_receipts: 0,
            forfeited_receipts: 0,
        }
    } else {
        let registry_data = receipt_registry.try_borrow()?;
        let registry = ReceiptRegistryAccount::unpack(&registry_data)?;
        if &registry.claimant != claimer.address() || registry.token_mint != claim_fields.mint {
            return Err(ClaimSoulError::InvalidReceiptBinding.into());
        }
        registry
    };
    let whole_capacity = balance
        .checked_div(effective_bound_quantity)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    if registry_state.active_receipts >= whole_capacity {
        return Err(ClaimSoulError::ReceiptCapacityExceeded.into());
    }
    let next_active_receipts = registry_state
        .active_receipts
        .checked_add(1)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    let bound_boundary = next_active_receipts
        .checked_mul(effective_bound_quantity)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    assert_associated_token_address(nft_token_account, claimer.address(), nft_mint.address())?;
    if associated_token_program.is_none() {
        assert_token_account(nft_token_account, nft_mint.address(), claimer.address())?;
    }

    let metadata_symbol = claim_fields.meme_symbol.as_str();
    // D.A4 requires a one-based display ordinal and a soul_pda metadata pointer;
    // the previous zero-based, self-pointing mint shape was only a placeholder.
    let display_sequence = sequence
        .checked_add(1)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    let metadata_name = format!("{metadata_symbol} Soul #{display_sequence}");
    let art_theme_id = resolve_art_theme(
        &claim_fields.style_params,
        usize::from(claim_fields.template_len),
    );
    let art_theme = theme_label(art_theme_id);
    let metadata_context = ClaimMetadataContext {
        creator: claim_fields.authority,
        token_mint: claim_fields.mint,
        token_symbol: metadata_symbol,
        art_theme_id,
        art_theme,
        generation: claim_fields
            .provenance
            .as_ref()
            .map(|provenance| provenance.generation)
            .unwrap_or(claim_fields.generation_count),
        style_params: &claim_fields.style_params,
    };
    let metadata_uri = metadata_uri(
        &metadata_name,
        metadata_symbol,
        &claim_fields.last_svg,
        &metadata_context,
        claim_fields.provenance.as_ref(),
    )?;
    claim_fields.last_svg = Vec::new();
    claim_fields.style_params = Vec::new();
    let required_mint_len =
        token_metadata_mint_len(&metadata_name, metadata_symbol, &metadata_uri)?;
    let required_mint_lamports = rent_exempt_lamports(required_mint_len)?;
    if nft_mint.lamports() < required_mint_lamports {
        return Err(ProgramError::InsufficientFunds);
    }
    let metadata_pointer_mint_len = EXTENSION_ACCOUNT_BASE_LEN
        .checked_add(TLV_ENTRY_HEADER_LEN)
        .and_then(|len| len.checked_add(METADATA_POINTER_EXTENSION_LEN))
        .ok_or(ProgramError::ArithmeticOverflow)?;
    if nft_mint.data_len() < metadata_pointer_mint_len {
        return Err(ProgramError::AccountDataTooSmall);
    }

    match claim_pda_signer {
        ClaimPdaSigner::Legacy => {
            let claim_seeds = [
                Seed::from(CLAIM_SEED),
                Seed::from(soul.address().as_ref()),
                Seed::from(&sequence_bytes),
            ];
            let claim_signers = [Signer::from(&claim_seeds)];
            allocate_pda(
                claim,
                ClaimAccount::LEN,
                program_id,
                claimer,
                &claim_signers,
            )?;
        }
        ClaimPdaSigner::Bumped(bump) => {
            let bump_seed = [bump];
            let claim_seeds = [
                Seed::from(CLAIM_SEED),
                Seed::from(soul.address().as_ref()),
                Seed::from(&sequence_bytes),
                Seed::from(&bump_seed),
            ];
            let claim_signers = [Signer::from(&claim_seeds)];
            allocate_pda(
                claim,
                ClaimAccount::LEN,
                program_id,
                claimer,
                &claim_signers,
            )?;
        }
    }

    {
        let claim_state = ClaimAccount {
            soul: *soul.address(),
            claimer: *claimer.address(),
            nft_mint: *nft_mint.address(),
            sequence,
            generation_count: claim_fields.generation_count,
        };
        let mut claim_data = claim.try_borrow_mut()?;
        claim_state.pack(&mut claim_data[..ClaimAccount::LEN])?;
    }
    {
        let receipt_bump_seed = [receipt_bump];
        let receipt_seeds = [
            Seed::from(RECEIPT_SEED),
            Seed::from(soul.address().as_ref()),
            Seed::from(&sequence_bytes),
            Seed::from(&receipt_bump_seed),
        ];
        let receipt_signers = [Signer::from(&receipt_seeds)];
        allocate_pda(
            receipt,
            ReceiptAccount::LEN,
            program_id,
            claimer,
            &receipt_signers,
        )?;
        let receipt_state = ReceiptAccount {
            soul: *soul.address(),
            claimant: *claimer.address(),
            token_mint: claim_fields.mint,
            nft_mint: *nft_mint.address(),
            sequence,
            generation_count: claim_fields.generation_count,
            bound_quantity: effective_bound_quantity,
            bound_boundary,
            lifecycle_state: RECEIPT_STATE_ACTIVE,
        };
        let mut receipt_data = receipt.try_borrow_mut()?;
        receipt_state.pack(&mut receipt_data[..ReceiptAccount::LEN])?;
    }
    {
        if receipt_registry.data_len() == 0 {
            let registry_bump_seed = [receipt_registry_bump];
            let registry_seeds = [
                Seed::from(RECEIPT_REGISTRY_SEED),
                Seed::from(claimer.address().as_ref()),
                Seed::from(claim_fields.mint.as_ref()),
                Seed::from(&registry_bump_seed),
            ];
            let registry_signers = [Signer::from(&registry_seeds)];
            allocate_pda(
                receipt_registry,
                ReceiptRegistryAccount::LEN,
                program_id,
                claimer,
                &registry_signers,
            )?;
        }
        registry_state.active_receipts = next_active_receipts;
        let mut registry_data = receipt_registry.try_borrow_mut()?;
        registry_state.pack(&mut registry_data[..ReceiptRegistryAccount::LEN])?;
    }

    initialize_metadata_pointer(nft_mint, nft_authority.address(), soul.address())?;
    initialize_mint2_with_freeze_authority(
        nft_mint,
        0,
        nft_authority.address(),
        nft_authority.address(),
    )?;
    match nft_authority_pda_signer {
        ClaimPdaSigner::Legacy => {
            let nft_authority_seeds = [
                Seed::from(NFT_AUTHORITY_SEED),
                Seed::from(soul.address().as_ref()),
                Seed::from(&sequence_bytes),
            ];
            initialize_token_metadata_signed(TokenMetadataInit {
                metadata: nft_mint,
                update_authority: nft_authority,
                mint: nft_mint,
                mint_authority: nft_authority,
                name: &metadata_name,
                symbol: metadata_symbol,
                uri: &metadata_uri,
                mint_authority_seeds: &nft_authority_seeds,
            })?;
            if let Some(program) = associated_token_program {
                create_associated_token_account_idempotent(
                    program,
                    claimer,
                    nft_token_account,
                    nft_mint,
                    token_program,
                    system_program,
                )?;
                assert_owned_by(nft_token_account, &TOKEN_2022_ID)?;
                assert_token_account(nft_token_account, nft_mint.address(), claimer.address())?;
            }
            mint_to_signed(
                nft_mint,
                nft_token_account,
                nft_authority,
                1,
                &nft_authority_seeds,
            )?;
            freeze_account_signed(
                nft_token_account,
                nft_mint,
                nft_authority,
                &nft_authority_seeds,
            )?;
        }
        ClaimPdaSigner::Bumped(bump) => {
            let bump_seed = [bump];
            let nft_authority_seeds = [
                Seed::from(NFT_AUTHORITY_SEED),
                Seed::from(soul.address().as_ref()),
                Seed::from(&sequence_bytes),
                Seed::from(&bump_seed),
            ];
            initialize_token_metadata_signed(TokenMetadataInit {
                metadata: nft_mint,
                update_authority: nft_authority,
                mint: nft_mint,
                mint_authority: nft_authority,
                name: &metadata_name,
                symbol: metadata_symbol,
                uri: &metadata_uri,
                mint_authority_seeds: &nft_authority_seeds,
            })?;
            if let Some(program) = associated_token_program {
                create_associated_token_account_idempotent(
                    program,
                    claimer,
                    nft_token_account,
                    nft_mint,
                    token_program,
                    system_program,
                )?;
                assert_owned_by(nft_token_account, &TOKEN_2022_ID)?;
                assert_token_account(nft_token_account, nft_mint.address(), claimer.address())?;
            }
            mint_to_signed(
                nft_mint,
                nft_token_account,
                nft_authority,
                1,
                &nft_authority_seeds,
            )?;
            freeze_account_signed(
                nft_token_account,
                nft_mint,
                nft_authority,
                &nft_authority_seeds,
            )?;
        }
    }

    let next_claim_count = claim_fields.generation_count;
    {
        let mut data = soul.try_borrow_mut()?;
        data[SoulAccount::CLAIM_COUNT_OFFSET..SoulAccount::CLAIM_COUNT_END_OFFSET]
            .copy_from_slice(&next_claim_count.to_le_bytes());
    }
    emit_claim_event(soul.address(), nft_mint.address(), claimer.address());

    Ok(())
}

fn assert_legacy_or_bumped_claim_pda(
    account: &AccountView,
    seed: &[u8],
    soul: &Address,
    sequence_bytes: &[u8; 8],
    program_id: &Address,
) -> Result<ClaimPdaSigner, ProgramError> {
    let base_seeds = [seed, soul.as_ref(), sequence_bytes.as_ref()];

    if let Some(legacy_pda) = legacy_no_bump_pda(&base_seeds, program_id) {
        if account.address() == &legacy_pda {
            return Ok(ClaimPdaSigner::Legacy);
        }
    }

    let Some((bumped_pda, bump)) = Address::derive_program_address(&base_seeds, program_id) else {
        return Err(GeppettoError::InvalidSeeds.into());
    };
    if account.address() != &bumped_pda {
        return Err(GeppettoError::InvalidPda.into());
    }

    Ok(ClaimPdaSigner::Bumped(bump))
}

fn assert_canonical_pda<const N: usize>(
    account: &AccountView,
    seeds: &[&[u8]; N],
    program_id: &Address,
) -> Result<u8, ProgramError> {
    let Some((pda, bump)) = Address::derive_program_address(seeds, program_id) else {
        return Err(GeppettoError::InvalidSeeds.into());
    };
    if account.address() != &pda {
        return Err(GeppettoError::InvalidPda.into());
    }
    Ok(bump)
}

#[cfg(any(target_os = "solana", target_arch = "bpf"))]
fn legacy_no_bump_pda(seeds: &[&[u8]; 3], program_id: &Address) -> Option<Address> {
    Address::create_program_address(seeds, program_id).ok()
}

#[cfg(not(any(target_os = "solana", target_arch = "bpf")))]
fn legacy_no_bump_pda(seeds: &[&[u8]; 3], program_id: &Address) -> Option<Address> {
    Some(Address::derive_address(seeds, None, program_id))
}

fn read_claim_fields(data: &[u8]) -> Result<ClaimFields, ProgramError> {
    if data.len() < SoulAccount::PRE_M3_LEGACY_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }

    let mut mint = [0u8; 32];
    mint.copy_from_slice(&data[SoulAccount::MINT_OFFSET..SoulAccount::AUTHORITY_OFFSET]);
    let mut authority = [0u8; 32];
    authority.copy_from_slice(&data[SoulAccount::AUTHORITY_OFFSET..SoulAccount::CREATED_AT_OFFSET]);

    let mut generation_count = [0u8; 8];
    generation_count.copy_from_slice(
        &data[SoulAccount::GENERATION_COUNT_OFFSET..SoulAccount::LAST_SVG_LEN_OFFSET],
    );

    let mut last_svg_len = [0u8; 2];
    last_svg_len
        .copy_from_slice(&data[SoulAccount::LAST_SVG_LEN_OFFSET..SoulAccount::LAST_SVG_OFFSET]);
    let last_svg_len = u16::from_le_bytes(last_svg_len);
    if usize::from(last_svg_len) > crate::state::LAST_SVG_CAPACITY {
        return Err(ProgramError::InvalidAccountData);
    }
    let last_svg_end = SoulAccount::LAST_SVG_OFFSET
        .checked_add(usize::from(last_svg_len))
        .ok_or(ProgramError::ArithmeticOverflow)?;
    let last_svg = data[SoulAccount::LAST_SVG_OFFSET..last_svg_end].to_vec();

    let mut template_len = [0u8; 2];
    template_len
        .copy_from_slice(&data[SoulAccount::TEMPLATE_LEN_OFFSET..SoulAccount::STYLE_PARAMS_OFFSET]);
    let template_len = u16::from_le_bytes(template_len);
    if usize::from(template_len) > crate::state::BASE_SVG_TEMPLATE_CAPACITY {
        return Err(ProgramError::InvalidAccountData);
    }

    let mut style_params_len = [0u8; 2];
    style_params_len.copy_from_slice(
        &data[SoulAccount::STYLE_PARAMS_LEN_OFFSET..SoulAccount::MIN_CLAIM_BALANCE_OFFSET],
    );
    let style_params_len = u16::from_le_bytes(style_params_len);
    if usize::from(style_params_len) > crate::state::STYLE_PARAMS_CAPACITY {
        return Err(ProgramError::InvalidAccountData);
    }
    let style_params_end = SoulAccount::STYLE_PARAMS_OFFSET
        .checked_add(usize::from(style_params_len))
        .ok_or(ProgramError::ArithmeticOverflow)?;
    let style_params = data[SoulAccount::STYLE_PARAMS_OFFSET..style_params_end].to_vec();

    let mut min_claim_balance = [0u8; 8];
    min_claim_balance.copy_from_slice(
        &data[SoulAccount::MIN_CLAIM_BALANCE_OFFSET..SoulAccount::CLAIM_COUNT_OFFSET],
    );

    let mut claim_count = [0u8; 8];
    claim_count.copy_from_slice(
        &data[SoulAccount::CLAIM_COUNT_OFFSET..SoulAccount::CLAIM_COUNT_END_OFFSET],
    );

    let meme_symbol = if data.len() >= SoulAccount::LEGACY_LEN {
        let symbol_len = usize::from(data[SoulAccount::MEME_SYMBOL_LEN_OFFSET]);
        if symbol_len > crate::state::MEME_SYMBOL_CAPACITY {
            return Err(ProgramError::InvalidAccountData);
        }
        let symbol_end = SoulAccount::MEME_SYMBOL_OFFSET
            .checked_add(symbol_len)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        let symbol_bytes = &data[SoulAccount::MEME_SYMBOL_OFFSET..symbol_end];
        if symbol_len == 0 {
            String::from(DEFAULT_NFT_METADATA_SYMBOL)
        } else if symbol_bytes.iter().all(u8::is_ascii) {
            String::from_utf8(symbol_bytes.to_vec())
                .map_err(|_| ProgramError::InvalidAccountData)?
        } else {
            return Err(ProgramError::InvalidAccountData);
        }
    } else {
        String::from(DEFAULT_NFT_METADATA_SYMBOL)
    };

    let provenance = if data.len() >= SoulAccount::PRE_PROVENANCE_TOKEN_AMOUNT_LEN {
        read_claim_provenance(data)?
    } else {
        None
    };

    Ok(ClaimFields {
        mint: Address::new_from_array(mint),
        authority: Address::new_from_array(authority),
        generation_count: u64::from_le_bytes(generation_count),
        last_svg_len,
        template_len,
        style_params,
        min_claim_balance: u64::from_le_bytes(min_claim_balance),
        claim_count: u64::from_le_bytes(claim_count),
        meme_symbol,
        last_svg,
        provenance,
    })
}

fn read_claim_provenance(data: &[u8]) -> Result<Option<ClaimProvenance>, ProgramError> {
    let side = data[SoulAccount::PROVENANCE_SIDE_OFFSET];
    if side == 0 {
        return Ok(None);
    }
    if side != PROVENANCE_SIDE_BUY && side != PROVENANCE_SIDE_SELL {
        return Err(ProgramError::InvalidAccountData);
    }

    let mut generation = [0u8; 8];
    generation.copy_from_slice(
        &data[SoulAccount::PROVENANCE_GENERATION_OFFSET..SoulAccount::PROVENANCE_SIDE_OFFSET],
    );
    let generation = u64::from_le_bytes(generation);
    if generation == 0 {
        return Ok(None);
    }

    let mut amount = [0u8; 8];
    amount.copy_from_slice(
        &data[SoulAccount::PROVENANCE_AMOUNT_OFFSET..SoulAccount::PROVENANCE_TRADER_OFFSET],
    );
    let mut trader = [0u8; 32];
    trader.copy_from_slice(
        &data[SoulAccount::PROVENANCE_TRADER_OFFSET..SoulAccount::PROVENANCE_TOKEN_ACCOUNT_OFFSET],
    );
    let mut token_account = [0u8; 32];
    token_account.copy_from_slice(
        &data[SoulAccount::PROVENANCE_TOKEN_ACCOUNT_OFFSET..SoulAccount::PROVENANCE_MINT_OFFSET],
    );
    let mut mint = [0u8; 32];
    mint.copy_from_slice(
        &data[SoulAccount::PROVENANCE_MINT_OFFSET..SoulAccount::PROVENANCE_SOUL_OFFSET],
    );
    let mut soul = [0u8; 32];
    soul.copy_from_slice(
        &data[SoulAccount::PROVENANCE_SOUL_OFFSET..SoulAccount::PROVENANCE_SEED_HASH_OFFSET],
    );
    let mut seed_hash = [0u8; SEED_HASH_LEN];
    seed_hash.copy_from_slice(
        &data
            [SoulAccount::PROVENANCE_SEED_HASH_OFFSET..SoulAccount::PROVENANCE_TOKEN_AMOUNT_OFFSET],
    );
    let token_amount = if data.len() >= SoulAccount::LEN {
        let mut token_amount = [0u8; 8];
        token_amount
            .copy_from_slice(&data[SoulAccount::PROVENANCE_TOKEN_AMOUNT_OFFSET..SoulAccount::LEN]);
        u64::from_le_bytes(token_amount)
    } else {
        0
    };

    Ok(Some(ClaimProvenance {
        generation,
        side,
        amount: u64::from_le_bytes(amount),
        trader: Address::new_from_array(trader),
        token_account: Address::new_from_array(token_account),
        mint: Address::new_from_array(mint),
        soul: Address::new_from_array(soul),
        seed_hash,
        token_amount,
    }))
}

fn claim_sequence(
    generation_count: u64,
    claim_count: u64,
    last_svg_len: u16,
) -> Result<u64, ProgramError> {
    if last_svg_len == 0 || generation_count == 0 {
        return Err(ClaimSoulError::NoGeneratedSoul.into());
    }
    if claim_count >= generation_count {
        return Err(ClaimSoulError::SoulAlreadyClaimed.into());
    }
    let sequence = generation_count
        .checked_sub(1)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    if sequence >= MAX_SOUL_NFT_CLAIMS {
        return Err(ClaimSoulError::SoulNftHardCapExceeded.into());
    }
    Ok(sequence)
}

fn required_claim_balance(min_claim_balance: u64) -> u64 {
    if min_claim_balance < MIN_CLAIM_BALANCE {
        MIN_CLAIM_BALANCE
    } else {
        min_claim_balance
    }
}

fn assert_sufficient_balance(balance: u64, min_claim_balance: u64) -> ProgramResult {
    if balance < required_claim_balance(min_claim_balance) {
        return Err(ClaimSoulError::InsufficientClaimBalance.into());
    }
    Ok(())
}

fn assert_claim_provenance(
    provenance: Option<&ClaimProvenance>,
    generation_count: u64,
    sequence: u64,
    claimer: &Address,
    claimer_meme_ata: &Address,
    meme_mint: &Address,
    soul: &Address,
) -> ProgramResult {
    let provenance = provenance.ok_or(ClaimSoulError::InsufficientClaimProvenance)?;
    let expected_generation = sequence
        .checked_add(1)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    if provenance.side != PROVENANCE_SIDE_BUY
        || provenance.generation != generation_count
        || provenance.generation != expected_generation
        || provenance.token_amount < MIN_CLAIM_BALANCE
        || &provenance.trader != claimer
        || &provenance.token_account != claimer_meme_ata
        || &provenance.mint != meme_mint
        || &provenance.soul != soul
    {
        return Err(ClaimSoulError::InsufficientClaimProvenance.into());
    }
    Ok(())
}

fn assert_associated_token_address(
    token_account: &AccountView,
    owner: &Address,
    mint: &Address,
) -> ProgramResult {
    let (expected_ata, _bump) = Address::derive_program_address(
        &[owner.as_ref(), TOKEN_2022_ID.as_ref(), mint.as_ref()],
        &ASSOCIATED_TOKEN_PROGRAM_ID,
    )
    .ok_or(ProgramError::InvalidSeeds)?;
    if token_account.address() != &expected_ata {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn assert_token_account(
    token_account: &AccountView,
    expected_mint: &Address,
    expected_owner: &Address,
) -> ProgramResult {
    let data = token_account.try_borrow()?;
    if data.len() < TOKEN_ACCOUNT_MIN_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }
    if &data[TOKEN_ACCOUNT_MINT_OFFSET..TOKEN_ACCOUNT_OWNER_OFFSET] != expected_mint.as_ref() {
        return Err(ProgramError::InvalidAccountData);
    }
    if &data[TOKEN_ACCOUNT_OWNER_OFFSET..TOKEN_ACCOUNT_AMOUNT_OFFSET] != expected_owner.as_ref() {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn create_associated_token_account_idempotent(
    associated_token_program: &AccountView,
    payer: &AccountView,
    token_account: &AccountView,
    mint: &AccountView,
    token_program: &AccountView,
    system_program: &AccountView,
) -> ProgramResult {
    let instruction_accounts = [
        InstructionAccount::writable_signer(payer.address()),
        InstructionAccount::writable(token_account.address()),
        InstructionAccount::readonly(payer.address()),
        InstructionAccount::readonly(mint.address()),
        InstructionAccount::readonly(system_program.address()),
        InstructionAccount::readonly(token_program.address()),
    ];
    let instruction_data = [1u8];
    let instruction = InstructionView {
        program_id: associated_token_program.address(),
        accounts: &instruction_accounts,
        data: &instruction_data,
    };
    let account_views = [
        payer,
        token_account,
        payer,
        mint,
        system_program,
        token_program,
    ];

    invoke(&instruction, &account_views)
}

fn read_token_amount(token_account: &AccountView) -> Result<u64, ProgramError> {
    let data = token_account.try_borrow()?;
    if data.len() < TOKEN_ACCOUNT_AMOUNT_END {
        return Err(ProgramError::AccountDataTooSmall);
    }

    let mut amount = [0u8; 8];
    amount.copy_from_slice(&data[TOKEN_ACCOUNT_AMOUNT_OFFSET..TOKEN_ACCOUNT_AMOUNT_END]);
    Ok(u64::from_le_bytes(amount))
}

fn metadata_uri(
    name: &str,
    symbol: &str,
    svg: &[u8],
    context: &ClaimMetadataContext,
    provenance: Option<&ClaimProvenance>,
) -> Result<String, ProgramError> {
    let creator = context.creator.to_string();
    let token_mint = context.token_mint.to_string();
    let generation = context.generation.to_string();
    let image_len = SVG_DATA_URI_PREFIX
        .len()
        .checked_add(base64_encoded_len(svg.len())?)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    let mut json_capacity =
        br#"{"name":"","symbol":"","image":"","platform":"SolSoul","creator":"","launcher":"","associatedTokenMint":"","associatedTokenSymbol":"","artEngine":"","artTheme":"","generation":"","attributes":[]}"#
            .len();
    json_capacity = checked_add_json_content_len(json_capacity, name)?;
    json_capacity = checked_add_json_content_len(json_capacity, symbol)?;
    json_capacity = json_capacity
        .checked_add(image_len)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    let creator_json_len = escaped_json_string_content_len(&creator)?;
    json_capacity = json_capacity
        .checked_add(
            creator_json_len
                .checked_mul(2)
                .ok_or(ProgramError::ArithmeticOverflow)?,
        )
        .ok_or(ProgramError::ArithmeticOverflow)?;
    json_capacity = checked_add_json_content_len(json_capacity, &token_mint)?;
    json_capacity = checked_add_json_content_len(json_capacity, context.token_symbol)?;
    json_capacity = checked_add_json_content_len(json_capacity, SOLSOUL_ART_ENGINE_LABEL)?;
    json_capacity = checked_add_json_content_len(json_capacity, context.art_theme)?;
    json_capacity = checked_add_json_content_len(json_capacity, &generation)?;
    json_capacity = json_capacity
        .checked_add(512)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    let mut json = Vec::with_capacity(json_capacity);
    json.extend_from_slice(b"{\"name\":");
    append_json_string(&mut json, name)?;
    json.extend_from_slice(b",\"symbol\":");
    append_json_string(&mut json, symbol)?;
    json.extend_from_slice(b",\"image\":\"");
    json.extend_from_slice(SVG_DATA_URI_PREFIX.as_bytes());
    push_base64_encoded(&mut json, svg)?;
    json.push(b'"');
    json.extend_from_slice(b",\"platform\":");
    append_json_string(&mut json, "SolSoul")?;
    json.extend_from_slice(b",\"creator\":");
    append_json_string(&mut json, &creator)?;
    json.extend_from_slice(b",\"launcher\":");
    append_json_string(&mut json, &creator)?;
    json.extend_from_slice(b",\"associatedTokenMint\":");
    append_json_string(&mut json, &token_mint)?;
    json.extend_from_slice(b",\"associatedTokenSymbol\":");
    append_json_string(&mut json, context.token_symbol)?;
    json.extend_from_slice(b",\"artEngine\":");
    append_json_string(&mut json, SOLSOUL_ART_ENGINE_LABEL)?;
    json.extend_from_slice(b",\"artTheme\":");
    append_json_string(&mut json, context.art_theme)?;
    json.extend_from_slice(b",\"generation\":");
    append_json_string(&mut json, &generation)?;
    append_metadata_attributes(&mut json, context, provenance)?;
    json.extend_from_slice(br#"}"#);

    let uri_capacity = JSON_DATA_URI_PREFIX
        .len()
        .checked_add(base64_encoded_len(json.len())?)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    let mut uri = String::with_capacity(uri_capacity);
    uri.push_str(JSON_DATA_URI_PREFIX);
    push_base64_encoded_string(&mut uri, &json)?;
    Ok(uri)
}

/// Build the on-chain claim metadata URI for a `SoulAccount` exactly as the
/// `claim_soul` instruction would emit it for `display_sequence`. Test fixtures
/// rely on this helper to size the NFT mint account so it remains rent-exempt
/// against the program's authoritative URI shape (including trait, rarity, and
/// provenance attributes) without forking the URI-builder logic.
pub fn claim_metadata_uri_for_soul(
    soul: &SoulAccount,
    display_sequence: u64,
) -> Result<String, ProgramError> {
    let symbol_len = usize::from(soul.meme_symbol_len);
    let symbol_bytes = soul
        .meme_symbol
        .get(..symbol_len)
        .ok_or(ProgramError::InvalidAccountData)?;
    let symbol_str =
        core::str::from_utf8(symbol_bytes).map_err(|_| ProgramError::InvalidAccountData)?;
    let svg_len = usize::from(soul.last_svg_len);
    let svg_bytes = soul
        .last_svg
        .get(..svg_len)
        .ok_or(ProgramError::InvalidAccountData)?;
    let style_len = usize::from(soul.style_params_len);
    let style_bytes = soul
        .style_params
        .get(..style_len)
        .ok_or(ProgramError::InvalidAccountData)?;
    let template_len = usize::from(soul.template_len);

    let metadata_name = format!("{symbol_str} Soul #{display_sequence}");
    let art_theme_id = resolve_art_theme(style_bytes, template_len);
    let art_theme = theme_label(art_theme_id);

    let provenance = if soul.provenance_side != 0 && soul.provenance_generation > 0 {
        Some(ClaimProvenance {
            generation: soul.provenance_generation,
            side: soul.provenance_side,
            amount: soul.provenance_amount,
            trader: soul.provenance_trader,
            token_account: soul.provenance_token_account,
            mint: soul.provenance_mint,
            soul: soul.provenance_soul,
            seed_hash: soul.provenance_seed_hash,
            token_amount: soul.provenance_token_amount,
        })
    } else {
        None
    };

    let context = ClaimMetadataContext {
        creator: soul.authority,
        token_mint: soul.mint,
        token_symbol: symbol_str,
        art_theme_id,
        art_theme,
        generation: provenance
            .as_ref()
            .map(|provenance| provenance.generation)
            .unwrap_or(soul.generation_count),
        style_params: style_bytes,
    };

    metadata_uri(
        &metadata_name,
        symbol_str,
        svg_bytes,
        &context,
        provenance.as_ref(),
    )
}

/// Compute the rent-exempt mint account length the `claim_soul` instruction
/// would require for `soul` at `display_sequence`. Test fixtures use this to
/// fund the NFT mint account so it does not under-allocate against the program
/// path's `token_metadata_mint_len` invariant.
pub fn claim_metadata_mint_account_len_for_soul(
    soul: &SoulAccount,
    display_sequence: u64,
) -> Result<usize, ProgramError> {
    let symbol_len = usize::from(soul.meme_symbol_len);
    let symbol_bytes = soul
        .meme_symbol
        .get(..symbol_len)
        .ok_or(ProgramError::InvalidAccountData)?;
    let symbol_str =
        core::str::from_utf8(symbol_bytes).map_err(|_| ProgramError::InvalidAccountData)?;
    let metadata_name = format!("{symbol_str} Soul #{display_sequence}");
    let metadata_uri = claim_metadata_uri_for_soul(soul, display_sequence)?;
    token_metadata_mint_len(&metadata_name, symbol_str, &metadata_uri)
}

fn escaped_json_string_content_len(value: &str) -> Result<usize, ProgramError> {
    let mut len = 0usize;
    for byte in value.bytes() {
        let escaped_len = match byte {
            b'"' | b'\\' | b'\n' | b'\r' | b'\t' | 0x08 | 0x0c => 2,
            0x00..=0x1f => 6,
            _ => 1,
        };
        len = len
            .checked_add(escaped_len)
            .ok_or(ProgramError::ArithmeticOverflow)?;
    }
    Ok(len)
}

fn checked_add_json_content_len(total: usize, value: &str) -> Result<usize, ProgramError> {
    total
        .checked_add(escaped_json_string_content_len(value)?)
        .ok_or(ProgramError::ArithmeticOverflow)
}

fn append_json_string(json: &mut Vec<u8>, value: &str) -> ProgramResult {
    const HEX: &[u8; 16] = b"0123456789abcdef";

    json.push(b'"');
    for byte in value.bytes() {
        match byte {
            b'"' => json.extend_from_slice(br#"\""#),
            b'\\' => json.extend_from_slice(br#"\\"#),
            b'\n' => json.extend_from_slice(br#"\n"#),
            b'\r' => json.extend_from_slice(br#"\r"#),
            b'\t' => json.extend_from_slice(br#"\t"#),
            0x08 => json.extend_from_slice(br#"\b"#),
            0x0c => json.extend_from_slice(br#"\f"#),
            0x00..=0x1f => {
                json.extend_from_slice(br#"\u00"#);
                json.push(HEX[(byte >> 4) as usize]);
                json.push(HEX[(byte & 0x0f) as usize]);
            }
            _ => json.push(byte),
        }
    }
    json.push(b'"');
    Ok(())
}

fn append_metadata_attributes(
    json: &mut Vec<u8>,
    context: &ClaimMetadataContext,
    provenance: Option<&ClaimProvenance>,
) -> ProgramResult {
    let creator = context.creator.to_string();
    let token_mint = context.token_mint.to_string();
    let generation = context.generation.to_string();
    json.extend_from_slice(br#","attributes":["#);
    let mut first = true;
    append_attribute(json, &mut first, "Platform", "SolSoul")?;
    append_attribute(json, &mut first, "Creator", &creator)?;
    append_attribute(json, &mut first, "Launcher", &creator)?;
    append_attribute(json, &mut first, "Associated token mint", &token_mint)?;
    append_attribute(
        json,
        &mut first,
        "Associated token symbol",
        context.token_symbol,
    )?;
    append_attribute(json, &mut first, "Art engine", SOLSOUL_ART_ENGINE_LABEL)?;
    append_attribute(json, &mut first, "Art theme", context.art_theme)?;
    append_attribute(json, &mut first, "Generation", &generation)?;
    if let Some(provenance) = provenance {
        let traits = resolve_blended_soul_traits(
            DefaultSoulTraitInput {
                seed: &provenance.seed_hash,
                theme: context.art_theme_id,
                provenance_side: provenance.side,
                generation: provenance.generation,
                amount: provenance.amount,
                token_amount: provenance.token_amount,
            },
            context.style_params,
        )?;
        append_generated_trait_attributes(json, &mut first, traits)?;
        let rarity = derive_metadata_rarity(context, provenance);
        append_attribute(json, &mut first, "Rarity tier", rarity.tier)?;
        append_attribute(json, &mut first, "Soul Score", &rarity.score.to_string())?;
        append_provenance_attributes(json, &mut first, provenance)?;
    }
    json.extend_from_slice(br#"]"#);
    Ok(())
}

fn append_generated_trait_attributes(
    json: &mut Vec<u8>,
    first: &mut bool,
    traits: BlendedSoulTraitSet,
) -> ProgramResult {
    append_attribute(json, first, "Palette", traits.core.palette)?;
    append_attribute(json, first, "Mood", traits.core.mood)?;
    append_attribute(json, first, "Form", traits.core.form)?;
    append_attribute(json, first, "Background Style", traits.core.background)?;
    append_attribute(
        json,
        first,
        "Character",
        traits.defaults.character_archetype,
    )?;
    append_attribute(json, first, "Goggles/Eyes", traits.defaults.goggles_eyes)?;
    append_attribute(json, first, "Expression", traits.defaults.expression)?;
    append_attribute(json, first, "Gas/Aura", traits.defaults.gas_aura_cloud)?;
    append_attribute(json, first, "Background", traits.defaults.background)?;
    append_attribute(json, first, "Outfit", traits.defaults.outfit)?;
    append_attribute(json, first, "Relic", traits.defaults.relic)?;
    append_attribute(json, first, "Animation", traits.defaults.animation_behavior)?;
    append_attribute(json, first, "Gas Level", traits.defaults.gas_level)?;
    Ok(())
}

struct MetadataRarity {
    tier: &'static str,
    score: u16,
}

fn derive_metadata_rarity(
    context: &ClaimMetadataContext,
    provenance: &ClaimProvenance,
) -> MetadataRarity {
    let mut hash = 0xcbf2_9ce4_8422_2325u64;
    hash = mix_metadata_rarity(hash, context.token_mint.as_ref());
    hash = mix_metadata_rarity(hash, context.art_theme.as_bytes());
    hash = mix_metadata_rarity(hash, &context.generation.to_le_bytes());
    hash = mix_metadata_rarity(hash, &provenance.seed_hash);
    hash = mix_metadata_rarity(hash, provenance.mint.as_ref());
    hash = mix_metadata_rarity(hash, provenance.soul.as_ref());
    hash = mix_metadata_rarity(hash, provenance.trader.as_ref());
    hash = mix_metadata_rarity(hash, &[provenance.side]);
    hash = mix_metadata_rarity(hash, &provenance.amount.to_le_bytes());
    hash = mix_metadata_rarity(hash, &provenance.token_amount.to_le_bytes());

    let percentile = hash % 1000;
    let score = 100 + ((percentile * 900) / 999) as u16;
    MetadataRarity {
        tier: rarity_tier(percentile),
        score,
    }
}

fn mix_metadata_rarity(mut hash: u64, bytes: &[u8]) -> u64 {
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

fn rarity_tier(percentile: u64) -> &'static str {
    if percentile >= 995 {
        "mythic"
    } else if percentile >= 970 {
        "legendary"
    } else if percentile >= 900 {
        "epic"
    } else if percentile >= 750 {
        "rare"
    } else if percentile >= 500 {
        "uncommon"
    } else {
        "common"
    }
}

fn append_provenance_attributes(
    json: &mut Vec<u8>,
    first: &mut bool,
    provenance: &ClaimProvenance,
) -> ProgramResult {
    let side = match provenance.side {
        PROVENANCE_SIDE_BUY => "buy",
        PROVENANCE_SIDE_SELL => "sell",
        _ => return Err(ProgramError::InvalidAccountData),
    };
    append_attribute(json, first, "Trade side", side)?;
    append_attribute(json, first, "Trade amount", &provenance.amount.to_string())?;
    append_attribute(
        json,
        first,
        "Trade token output",
        &provenance.token_amount.to_string(),
    )?;
    append_attribute(json, first, "Trader wallet", &provenance.trader.to_string())?;
    if !is_zero_address(&provenance.token_account) {
        append_attribute(
            json,
            first,
            "Trader token account",
            &provenance.token_account.to_string(),
        )?;
    }
    append_attribute(
        json,
        first,
        "Seed hash",
        &seed_hash_hex(&provenance.seed_hash)?,
    )?;
    append_attribute(json, first, "Token mint", &provenance.mint.to_string())?;
    append_attribute(json, first, "Soul PDA", &provenance.soul.to_string())?;
    Ok(())
}

fn theme_label(theme: ArtTheme) -> &'static str {
    match theme {
        ArtTheme::Fractal => "Fractal Structure",
        ArtTheme::Field => "Vector Field",
        ArtTheme::Lattice => "Crystal Lattice",
        ArtTheme::Chaos => "Strange Attractor",
        ArtTheme::Harmonic => "Harmonic Wave",
        ArtTheme::PixelFractal => "Pixel Fractal",
        ArtTheme::PixelArt => "Pixel Art",
        ArtTheme::Symphony => "Symphony",
        ArtTheme::CustomTemplate => "Custom Template",
    }
}

fn append_attribute(
    json: &mut Vec<u8>,
    first: &mut bool,
    trait_type: &str,
    value: &str,
) -> ProgramResult {
    if !*first {
        json.extend_from_slice(br#","#);
    }
    *first = false;
    json.extend_from_slice(b"{\"trait_type\":");
    append_json_string(json, trait_type)?;
    json.extend_from_slice(b",\"value\":");
    append_json_string(json, value)?;
    json.extend_from_slice(b"}");
    Ok(())
}

fn is_zero_address(address: &Address) -> bool {
    address.as_ref().iter().all(|byte| *byte == 0)
}

fn seed_hash_hex(seed_hash: &[u8; SEED_HASH_LEN]) -> Result<String, ProgramError> {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = Vec::with_capacity(SEED_HASH_LEN * 2);
    for byte in seed_hash {
        output.push(HEX[(byte >> 4) as usize]);
        output.push(HEX[(byte & 0x0f) as usize]);
    }
    String::from_utf8(output).map_err(|_| ProgramError::InvalidAccountData)
}

fn base64_encoded_len(input_len: usize) -> Result<usize, ProgramError> {
    input_len
        .checked_add(2)
        .and_then(|len| len.checked_div(3))
        .and_then(|chunks| chunks.checked_mul(4))
        .ok_or(ProgramError::ArithmeticOverflow)
}

fn push_base64_encoded(output: &mut Vec<u8>, input: &[u8]) -> ProgramResult {
    let mut index = 0usize;
    while index < input.len() {
        let b0 = input[index];
        let b1 = if index + 1 < input.len() {
            input[index + 1]
        } else {
            0
        };
        let b2 = if index + 2 < input.len() {
            input[index + 2]
        } else {
            0
        };

        output.push(BASE64_ALPHABET[(b0 >> 2) as usize]);
        output.push(BASE64_ALPHABET[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize]);
        if index + 1 < input.len() {
            output.push(BASE64_ALPHABET[(((b1 & 0x0f) << 2) | (b2 >> 6)) as usize]);
        } else {
            output.push(b'=');
        }
        if index + 2 < input.len() {
            output.push(BASE64_ALPHABET[(b2 & 0x3f) as usize]);
        } else {
            output.push(b'=');
        }

        index = index
            .checked_add(3)
            .ok_or(ProgramError::ArithmeticOverflow)?;
    }

    Ok(())
}

fn push_base64_encoded_string(output: &mut String, input: &[u8]) -> ProgramResult {
    let mut index = 0usize;
    while index < input.len() {
        let b0 = input[index];
        let b1 = if index + 1 < input.len() {
            input[index + 1]
        } else {
            0
        };
        let b2 = if index + 2 < input.len() {
            input[index + 2]
        } else {
            0
        };

        output.push(char::from(BASE64_ALPHABET[(b0 >> 2) as usize]));
        output.push(char::from(
            BASE64_ALPHABET[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize],
        ));
        if index + 1 < input.len() {
            output.push(char::from(
                BASE64_ALPHABET[(((b1 & 0x0f) << 2) | (b2 >> 6)) as usize],
            ));
        } else {
            output.push('=');
        }
        if index + 2 < input.len() {
            output.push(char::from(BASE64_ALPHABET[(b2 & 0x3f) as usize]));
        } else {
            output.push('=');
        }

        index = index
            .checked_add(3)
            .ok_or(ProgramError::ArithmeticOverflow)?;
    }
    Ok(())
}

fn allocate_pda(
    account: &mut AccountView,
    space: usize,
    owner: &Address,
    payer: &AccountView,
    signers: &[Signer],
) -> ProgramResult {
    let lamports = rent_exempt_lamports(space)?;

    if account.lamports() == 0 {
        return CreateAccount {
            from: payer,
            to: account,
            lamports,
            space: space as u64,
            owner,
        }
        .invoke_signed(signers);
    }

    let required_lamports = lamports.saturating_sub(account.lamports());
    if required_lamports > 0 {
        Transfer {
            from: payer,
            to: account,
            lamports: required_lamports,
        }
        .invoke()?;
    }
    Allocate {
        account,
        space: space as u64,
    }
    .invoke_signed(signers)?;
    Assign { account, owner }.invoke_signed(signers)
}

fn rent_exempt_lamports(space: usize) -> Result<u64, ProgramError> {
    let space = u64::try_from(space).map_err(|_| ProgramError::ArithmeticOverflow)?;
    if space > MAX_PERMITTED_DATA_LENGTH {
        return Err(ProgramError::InvalidArgument);
    }

    space
        .checked_add(ACCOUNT_STORAGE_OVERHEAD)
        .and_then(|bytes| bytes.checked_mul(DEFAULT_LAMPORTS_PER_BYTE))
        .ok_or(ProgramError::ArithmeticOverflow)
}

#[cfg(test)]
static CLAIM_EVENT_LOGS: core::sync::atomic::AtomicUsize = core::sync::atomic::AtomicUsize::new(0);

#[cfg(test)]
fn emit_claim_event(_soul: &Address, _nft_mint: &Address, _claimer: &Address) {
    CLAIM_EVENT_LOGS.fetch_add(1, core::sync::atomic::Ordering::SeqCst);
}

#[cfg(not(test))]
fn emit_claim_event(soul: &Address, nft_mint: &Address, claimer: &Address) {
    log_event_message(&format!(
        "[event:claim] soul={} nft_mint={} claimer={}",
        soul, nft_mint, claimer
    ));
}

#[cfg(all(not(test), target_os = "solana"))]
fn log_event_message(message: &str) {
    unsafe {
        pinocchio::syscalls::sol_log_(message.as_ptr(), message.len() as u64);
    }
}

#[cfg(all(not(test), not(target_os = "solana")))]
fn log_event_message(_message: &str) {}

#[cfg(test)]
mod tests {
    use super::{
        assert_sufficient_balance, claim_sequence, emit_claim_event, metadata_uri,
        read_claim_fields, required_claim_balance, ClaimMetadataContext, ClaimProvenance,
        ClaimSoulError, CLAIM_EVENT_LOGS, JSON_DATA_URI_PREFIX,
    };
    use crate::{
        state::{
            SoulAccount, LAST_SVG_CAPACITY, MAX_SOUL_NFT_CLAIMS, MIN_CLAIM_BALANCE,
            PROVENANCE_SIDE_BUY, PROVENANCE_SIDE_SELL, SEED_HASH_LEN,
        },
        svg::{
            blueprint::{BaseParams, EvolutionState},
            fractal::generate_fractal_svg,
            theme::ArtTheme,
        },
    };
    use alloc::string::{String, ToString};
    use base64::Engine;
    use core::sync::atomic::Ordering;
    use pinocchio::error::ProgramError;
    use pinocchio::Address;

    #[test]
    fn read_claim_fields_returns_claim_overrides_and_counts() {
        let mut data = [0u8; SoulAccount::LEN];
        data[SoulAccount::GENERATION_COUNT_OFFSET..SoulAccount::LAST_SVG_LEN_OFFSET]
            .copy_from_slice(&5u64.to_le_bytes());
        data[SoulAccount::LAST_SVG_LEN_OFFSET..SoulAccount::LAST_SVG_OFFSET]
            .copy_from_slice(&12u16.to_le_bytes());
        data[SoulAccount::MIN_CLAIM_BALANCE_OFFSET..SoulAccount::CLAIM_COUNT_OFFSET]
            .copy_from_slice(&7u64.to_le_bytes());
        data[SoulAccount::CLAIM_COUNT_OFFSET..SoulAccount::CLAIM_COUNT_END_OFFSET]
            .copy_from_slice(&2u64.to_le_bytes());

        let fields = read_claim_fields(&data).expect("claim fields decode");

        assert_eq!(fields.generation_count, 5);
        assert_eq!(fields.last_svg_len, 12);
        assert_eq!(fields.last_svg.len(), 12);
        assert_eq!(fields.min_claim_balance, 7);
        assert_eq!(fields.claim_count, 2);
        assert_eq!(fields.meme_symbol, "SOUL");
        assert_eq!(fields.provenance, None);
    }

    #[test]
    fn claim_soul_error_codes_are_stable() {
        assert_eq!(ClaimSoulError::NoGeneratedSoul as u32, 0x300);
        assert_eq!(ClaimSoulError::SoulAlreadyClaimed as u32, 0x301);
        assert_eq!(ClaimSoulError::InsufficientClaimBalance as u32, 0x302);
        assert_eq!(ClaimSoulError::InsufficientClaimProvenance as u32, 0x303);
        assert_eq!(ClaimSoulError::ReceiptAlreadyBound as u32, 0x304);
        assert_eq!(ClaimSoulError::ReceiptCapacityExceeded as u32, 0x305);
        assert_eq!(ClaimSoulError::InvalidReceiptBinding as u32, 0x306);
        assert_eq!(ClaimSoulError::SoulNftHardCapExceeded as u32, 0x307);
    }

    #[test]
    fn happy_path_mt_claim_sequence_and_balance_pass() {
        assert_eq!(claim_sequence(1, 0, 12), Ok(0));
        assert_eq!(claim_sequence(2, 0, 12), Ok(1));
        assert_eq!(assert_sufficient_balance(MIN_CLAIM_BALANCE, 0), Ok(()));
        assert_eq!(assert_sufficient_balance(MIN_CLAIM_BALANCE, 7), Ok(()));
        assert_eq!(
            required_claim_balance(1_000_000),
            MIN_CLAIM_BALANCE,
            "legacy lower claim thresholds are upgraded to the canonical MT quantum"
        );
    }

    #[test]
    fn insufficient_balance_unit_rejects_less_than_one_mt_quantum_default_and_override() {
        assert_eq!(
            assert_sufficient_balance(MIN_CLAIM_BALANCE - 1, 0),
            Err(ProgramError::Custom(
                ClaimSoulError::InsufficientClaimBalance as u32
            ))
        );
        assert_eq!(
            assert_sufficient_balance(MIN_CLAIM_BALANCE - 1, 7),
            Err(ProgramError::Custom(
                ClaimSoulError::InsufficientClaimBalance as u32
            ))
        );
    }

    #[test]
    fn double_claim_unit_rejects_when_claim_count_caught_up() {
        assert_eq!(
            claim_sequence(1, 1, 12),
            Err(ProgramError::Custom(
                ClaimSoulError::SoulAlreadyClaimed as u32
            ))
        );
    }

    #[test]
    fn mt_soul_hard_cap_allows_2100th_and_rejects_2101st_claim() {
        assert_eq!(MAX_SOUL_NFT_CLAIMS, 2_100);
        assert_eq!(
            claim_sequence(MAX_SOUL_NFT_CLAIMS, MAX_SOUL_NFT_CLAIMS - 1, 12),
            Ok(MAX_SOUL_NFT_CLAIMS - 1)
        );
        assert_eq!(
            claim_sequence(MAX_SOUL_NFT_CLAIMS + 1, MAX_SOUL_NFT_CLAIMS, 12),
            Err(ProgramError::Custom(
                ClaimSoulError::SoulNftHardCapExceeded as u32
            ))
        );
    }

    #[test]
    fn claim_success_path_emits_indexer_event() {
        CLAIM_EVENT_LOGS.store(0, Ordering::SeqCst);

        emit_claim_event(
            &Address::new_from_array([1u8; 32]),
            &Address::new_from_array([2u8; 32]),
            &Address::new_from_array([3u8; 32]),
        );

        assert_eq!(CLAIM_EVENT_LOGS.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn metadata_uri_includes_platform_fields_without_mutating_name_or_symbol() {
        let name = "BONK Soul #1";
        let symbol = "BONK";
        let svg = b"<svg/>";
        let context = metadata_context(symbol, 4, "Monochrome Soul");
        let uri = metadata_uri(name, symbol, svg, &context, None).expect("metadata uri");
        let json = metadata_json(&uri);

        assert!(json.contains(r#""name":"BONK Soul #1""#), "{json}");
        assert!(json.contains(r#""symbol":"BONK""#), "{json}");
        assert!(
            json.contains(r#""image":"data:image/svg+xml;base64,"#),
            "{json}"
        );
        assert!(json.contains(r#""platform":"SolSoul""#), "{json}");
        assert!(json.contains(r#""creator":""#), "{json}");
        assert!(json.contains(r#""associatedTokenSymbol":"BONK""#), "{json}");
        assert!(
            json.contains(r#""artEngine":"SolSoul On-Chain Art Engine""#),
            "{json}"
        );
        assert!(json.contains(r#""artTheme":"Monochrome Soul""#), "{json}");
        assert!(json.contains(r#""generation":"4""#), "{json}");
        assert!(
            json.contains(r#""trait_type":"Associated token mint""#),
            "{json}"
        );
        assert!(
            json.contains(r#""trait_type":"Art theme","value":"Monochrome Soul""#),
            "{json}"
        );
        assert!(!name.contains("SolSoul"));
        assert!(!symbol.contains("SolSoul"));
    }

    #[test]
    fn metadata_uri_includes_claim_provenance_attributes_without_fake_tx_context() {
        let name = "BONK Soul #1";
        let symbol = "BONK";
        let svg = b"<svg/>";
        let trader = Address::new_from_array([1u8; 32]);
        let token_account = Address::new_from_array([2u8; 32]);
        let mint = Address::new_from_array([3u8; 32]);
        let soul = Address::new_from_array([4u8; 32]);
        let seed_hash = [0xab; SEED_HASH_LEN];
        let provenance = ClaimProvenance {
            generation: 7,
            side: PROVENANCE_SIDE_SELL,
            amount: 1_234_567,
            trader,
            token_account,
            mint,
            soul,
            seed_hash,
            token_amount: MIN_CLAIM_BALANCE,
        };
        let context = metadata_context(symbol, 7, "Hexagram Oracle");
        let uri =
            metadata_uri(name, symbol, svg, &context, Some(&provenance)).expect("metadata uri");
        let json = metadata_json(&uri);

        assert!(json.contains(r#""attributes":["#), "{json}");
        assert!(json.contains(r#""trait_type":"Generation""#), "{json}");
        assert!(json.contains(r#""trait_type":"Trade side""#), "{json}");
        assert!(json.contains(r#""trait_type":"Trade amount""#), "{json}");
        assert!(json.contains(r#""trait_type":"Trader wallet""#), "{json}");
        assert!(json.contains(r#""trait_type":"Seed hash""#), "{json}");
        assert!(json.contains(r#""trait_type":"Token mint""#), "{json}");
        assert!(json.contains(r#""trait_type":"Soul PDA""#), "{json}");
        assert!(json.contains(r#""trait_type":"Character""#), "{json}");
        assert!(json.contains(r#""trait_type":"Goggles/Eyes""#), "{json}");
        assert!(json.contains(r#""trait_type":"Expression""#), "{json}");
        assert!(json.contains(r#""trait_type":"Gas/Aura""#), "{json}");
        assert!(json.contains(r#""trait_type":"Background""#), "{json}");
        assert!(json.contains(r#""trait_type":"Outfit""#), "{json}");
        assert!(json.contains(r#""trait_type":"Relic""#), "{json}");
        assert!(json.contains(r#""trait_type":"Animation""#), "{json}");
        assert!(json.contains(r#""trait_type":"Gas Level""#), "{json}");
        assert!(json.contains(r#""trait_type":"Rarity tier""#), "{json}");
        assert!(json.contains(r#""trait_type":"Soul Score""#), "{json}");
        assert!(
            json.contains(r#""artEngine":"SolSoul On-Chain Art Engine""#),
            "{json}"
        );
        assert!(json.contains(r#""trait_type":"Art theme""#), "{json}");
        assert!(json.contains(r#""artTheme":"Hexagram Oracle""#), "{json}");
        assert!(json.contains(r#""value":"7""#), "{json}");
        assert!(json.contains(r#""value":"sell""#), "{json}");
        assert!(json.contains(r#""value":"1234567""#), "{json}");
        assert!(json.contains(r#""value":"abababababababab""#), "{json}");
        assert!(!json.contains("signature"), "{json}");
        assert!(!json.contains("slot"), "{json}");
        assert!(!json.contains("blockTime"), "{json}");
    }

    #[test]
    fn metadata_uri_accepts_trait_layer_fractal_svg_without_external_refs() {
        let mut svg = [0u8; LAST_SVG_CAPACITY];
        let params = BaseParams {
            dimensionality: 30,
            projection: 0,
            depth: 50,
            fundamental: 50,
            overtones: 3,
            decay: 0,
            entropy: 50,
            reserved: 0,
        };
        let evolution = EvolutionState::default();
        let svg_len =
            generate_fractal_svg(b"pd16-live-claim-regression", &params, &evolution, &mut svg)
                .expect("trait-layer Fractal SVG renders");
        let context = metadata_context("PD16", 1, "Fractal Structure");
        let provenance = ClaimProvenance {
            generation: 1,
            side: PROVENANCE_SIDE_BUY,
            amount: 99_000_000,
            trader: Address::new_from_array([5u8; 32]),
            token_account: Address::new_from_array([6u8; 32]),
            mint: Address::new_from_array([7u8; 32]),
            soul: Address::new_from_array([8u8; 32]),
            seed_hash: [0x42; SEED_HASH_LEN],
            token_amount: MIN_CLAIM_BALANCE,
        };
        let uri = metadata_uri(
            "PD16 Soul #1",
            "PD16",
            &svg[..svg_len],
            &context,
            Some(&provenance),
        )
        .expect("metadata uri");
        let json = metadata_json(&uri);
        let parsed: serde_json::Value =
            serde_json::from_str(&json).expect("decoded metadata JSON parses");
        let image = parsed["image"].as_str().expect("image string");
        let image_payload = image
            .strip_prefix("data:image/svg+xml;base64,")
            .expect("inline SVG image data URI");
        let decoded_svg = String::from_utf8(
            base64::engine::general_purpose::STANDARD
                .decode(image_payload)
                .expect("image SVG base64 decodes"),
        )
        .expect("image SVG is UTF-8");

        assert!(
            json.contains(r#""image":"data:image/svg+xml;base64,"#),
            "{json}"
        );
        assert!(decoded_svg.contains("<circle"), "{decoded_svg}");
        assert!(json.contains(r#""trait_type":"Character""#), "{json}");
        assert!(json.contains(r#""trait_type":"Rarity tier""#), "{json}");
        assert!(
            !json.contains("http://") && !json.contains("https://"),
            "{json}"
        );
    }

    #[test]
    fn marketplace_metadata_uri_has_no_animated_media_or_remote_asset_fields() {
        let static_svg = br##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><rect width="256" height="256" fill="#050505"/><circle cx="128" cy="128" r="44" fill="#14f195"/></svg>"##;
        let context = metadata_context("ANIM", 9, "Fractal Structure");
        let provenance = ClaimProvenance {
            generation: 9,
            side: PROVENANCE_SIDE_BUY,
            amount: 1_000_000,
            trader: Address::new_from_array([9u8; 32]),
            token_account: Address::new_from_array([10u8; 32]),
            mint: Address::new_from_array([11u8; 32]),
            soul: Address::new_from_array([12u8; 32]),
            seed_hash: [0x99; SEED_HASH_LEN],
            token_amount: MIN_CLAIM_BALANCE,
        };
        let uri = metadata_uri(
            "ANIM Soul #1",
            "ANIM",
            static_svg,
            &context,
            Some(&provenance),
        )
        .expect("metadata uri");
        let json = metadata_json(&uri);
        let parsed: serde_json::Value =
            serde_json::from_str(&json).expect("decoded metadata JSON parses");
        let object = parsed.as_object().expect("metadata JSON object");

        for forbidden_key in [
            "animation_url",
            "external_url",
            "animation",
            "canvas",
            "executable",
            "formula",
            "media",
            "processing",
            "properties",
            "files",
            "scene",
            "shader",
            "three",
            "three_scene",
            "video",
            "webgl",
        ] {
            assert!(
                !object.contains_key(forbidden_key),
                "marketplace metadata must not expose animated/remote media field {forbidden_key}: {json}"
            );
        }
        assert_eq!(
            parsed["image"].as_str().expect("image string").find(','),
            Some(25)
        );
        let image = parsed["image"].as_str().expect("image string");
        let image_payload = image
            .strip_prefix("data:image/svg+xml;base64,")
            .expect("metadata image remains an inline SVG data URI");
        let decoded_svg = String::from_utf8(
            base64::engine::general_purpose::STANDARD
                .decode(image_payload)
                .expect("image SVG base64 decodes"),
        )
        .expect("image SVG is UTF-8");
        assert_eq!(decoded_svg.as_bytes(), &static_svg[..]);

        let lower_svg = decoded_svg.to_ascii_lowercase();
        let lower_without_namespace =
            lower_svg.replace(r#"xmlns="http://www.w3.org/2000/svg""#, "");
        for forbidden in [
            "<animate",
            "<set",
            "<style",
            "<script",
            "<image",
            "href=",
            "xlink:",
            "https://",
            "http://",
            "ipfs:",
            "ar:",
            "url(",
            "canvas",
            "processing",
            "p5",
            "scene",
            "shader",
            "three",
            "webgl",
        ] {
            assert!(
                !lower_without_namespace.contains(forbidden),
                "metadata image SVG must stay static and self-contained; found {forbidden}: {decoded_svg}"
            );
        }
        let lower_json = json.to_ascii_lowercase();
        for forbidden_field in [
            r#""animation_url""#,
            r#""external_url""#,
            r#""properties""#,
            r#""files""#,
            r#""canvas""#,
            r#""formula""#,
            r#""processing""#,
            r#""scene""#,
            r#""shader""#,
            r#""three""#,
            r#""video""#,
            r#""webgl""#,
        ] {
            assert!(
                !lower_json.contains(forbidden_field),
                "metadata JSON must not contain animated/remote media field {forbidden_field}: {json}"
            );
        }
        assert!(
            !lower_json.contains("http://") && !lower_json.contains("https://"),
            "metadata JSON must not include remote URLs outside base64 image data: {json}"
        );
    }

    #[test]
    fn metadata_uri_omits_provenance_attributes_when_unavailable() {
        let context = metadata_context("BONK", 1, "Custom Template");
        let uri =
            metadata_uri("BONK Soul #1", "BONK", b"<svg/>", &context, None).expect("metadata uri");
        let json = metadata_json(&uri);

        assert!(json.contains(r#""name":"BONK Soul #1""#), "{json}");
        assert!(json.contains(r#""symbol":"BONK""#), "{json}");
        assert!(
            json.contains(r#""image":"data:image/svg+xml;base64,"#),
            "{json}"
        );
        assert!(json.contains(r#""attributes":["#), "{json}");
        assert!(json.contains(r#""artTheme":"Custom Template""#), "{json}");
        assert!(json.contains(r#""trait_type":"Generation""#), "{json}");
        assert!(!json.contains(r#""trait_type":"Trade side""#), "{json}");
    }

    #[test]
    fn metadata_uri_escapes_quotes_and_backslashes_in_ascii_symbol_values() {
        let symbol = r#"Q"\X"#;
        let name = r#"Q"\X Soul #2"#;
        let context = metadata_context(symbol, 2, "Harmonic Wave");
        let uri = metadata_uri(name, symbol, b"<svg/>", &context, None).expect("metadata uri");
        let json_text = metadata_json(&uri);

        let parsed: serde_json::Value =
            serde_json::from_str(&json_text).expect("decoded metadata JSON parses");
        assert_eq!(parsed["name"], name);
        assert_eq!(parsed["symbol"], symbol);
        assert_eq!(parsed["associatedTokenSymbol"], symbol);
        assert_eq!(parsed["platform"], "SolSoul");
        assert_eq!(parsed["creator"], context.creator.to_string());
        assert_eq!(parsed["launcher"], context.creator.to_string());
        assert_eq!(parsed["artEngine"], "SolSoul On-Chain Art Engine");
        assert_eq!(parsed["artTheme"], "Harmonic Wave");

        let attributes = parsed["attributes"]
            .as_array()
            .expect("attributes array exists");
        assert!(attributes.iter().any(|attribute| {
            attribute["trait_type"] == "Associated token symbol" && attribute["value"] == symbol
        }));
        assert!(attributes.iter().all(|attribute| {
            attribute["trait_type"].as_str().is_some() && attribute["value"].as_str().is_some()
        }));
        assert!(
            json_text.contains(r#""name":"Q\"\\X Soul #2""#),
            "{json_text}"
        );
        assert!(
            json_text.contains(r#""associatedTokenSymbol":"Q\"\\X""#),
            "{json_text}"
        );
    }

    fn metadata_context<'a>(
        token_symbol: &'a str,
        generation: u64,
        art_theme: &'static str,
    ) -> ClaimMetadataContext<'a> {
        let art_theme_id = match art_theme {
            "Fractal Structure" => ArtTheme::Fractal,
            "Vector Field" => ArtTheme::Field,
            "Crystal Lattice" => ArtTheme::Lattice,
            "Strange Attractor" => ArtTheme::Chaos,
            "Harmonic Wave" => ArtTheme::Harmonic,
            "Pixel Fractal" => ArtTheme::PixelFractal,
            "Pixel Art" => ArtTheme::PixelArt,
            "Custom Template" => ArtTheme::CustomTemplate,
            _ => ArtTheme::Fractal,
        };
        ClaimMetadataContext {
            creator: Address::new_from_array([9u8; 32]),
            token_mint: Address::new_from_array([3u8; 32]),
            token_symbol,
            art_theme_id,
            art_theme,
            generation,
            style_params: b"",
        }
    }

    fn metadata_json(uri: &str) -> String {
        let encoded_json = uri
            .strip_prefix(JSON_DATA_URI_PREFIX)
            .expect("metadata uri is JSON data URI");
        String::from_utf8(
            base64::prelude::BASE64_STANDARD
                .decode(encoded_json)
                .expect("metadata JSON base64 decodes"),
        )
        .expect("metadata JSON is UTF-8")
    }

    #[test]
    fn read_claim_fields_decodes_pd7_provenance_for_claim_metadata() {
        let mut data = [0u8; SoulAccount::LEN];
        data[SoulAccount::GENERATION_COUNT_OFFSET..SoulAccount::LAST_SVG_LEN_OFFSET]
            .copy_from_slice(&9u64.to_le_bytes());
        data[SoulAccount::LAST_SVG_LEN_OFFSET..SoulAccount::LAST_SVG_OFFSET]
            .copy_from_slice(&6u16.to_le_bytes());
        data[SoulAccount::LAST_SVG_OFFSET..SoulAccount::LAST_SVG_OFFSET + 6]
            .copy_from_slice(b"<svg/>");
        data[SoulAccount::PROVENANCE_GENERATION_OFFSET..SoulAccount::PROVENANCE_SIDE_OFFSET]
            .copy_from_slice(&9u64.to_le_bytes());
        data[SoulAccount::PROVENANCE_SIDE_OFFSET] = PROVENANCE_SIDE_BUY;
        data[SoulAccount::PROVENANCE_AMOUNT_OFFSET..SoulAccount::PROVENANCE_TRADER_OFFSET]
            .copy_from_slice(&42u64.to_le_bytes());
        data[SoulAccount::PROVENANCE_TRADER_OFFSET..SoulAccount::PROVENANCE_TOKEN_ACCOUNT_OFFSET]
            .copy_from_slice(Address::new_from_array([1u8; 32]).as_ref());
        data[SoulAccount::PROVENANCE_TOKEN_ACCOUNT_OFFSET..SoulAccount::PROVENANCE_MINT_OFFSET]
            .copy_from_slice(Address::new_from_array([2u8; 32]).as_ref());
        data[SoulAccount::PROVENANCE_MINT_OFFSET..SoulAccount::PROVENANCE_SOUL_OFFSET]
            .copy_from_slice(Address::new_from_array([3u8; 32]).as_ref());
        data[SoulAccount::PROVENANCE_SOUL_OFFSET..SoulAccount::PROVENANCE_SEED_HASH_OFFSET]
            .copy_from_slice(Address::new_from_array([4u8; 32]).as_ref());
        data[SoulAccount::PROVENANCE_SEED_HASH_OFFSET..SoulAccount::PROVENANCE_TOKEN_AMOUNT_OFFSET]
            .copy_from_slice(&[0xcd; SEED_HASH_LEN]);
        data[SoulAccount::PROVENANCE_TOKEN_AMOUNT_OFFSET..SoulAccount::LEN]
            .copy_from_slice(&MIN_CLAIM_BALANCE.to_le_bytes());

        let fields = read_claim_fields(&data).expect("claim fields decode");
        let provenance = fields.provenance.expect("provenance exists");

        assert_eq!(provenance.generation, 9);
        assert_eq!(provenance.side, PROVENANCE_SIDE_BUY);
        assert_eq!(provenance.amount, 42);
        assert_eq!(provenance.seed_hash, [0xcd; SEED_HASH_LEN]);
        assert_eq!(provenance.token_amount, MIN_CLAIM_BALANCE);
    }
}
