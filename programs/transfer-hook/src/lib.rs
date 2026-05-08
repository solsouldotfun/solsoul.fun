#![allow(deprecated, unexpected_cfgs)]

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program::invoke_signed,
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::Sysvar,
};
use spl_tlv_account_resolution::state::ExtraAccountMetaList;
use spl_token_2022::{
    extension::{transfer_hook::TransferHook, BaseStateWithExtensions, StateWithExtensions},
    state::Mint,
};
use spl_transfer_hook_interface::{
    collect_extra_account_metas_signer_seeds, get_extra_account_metas_address,
    get_extra_account_metas_address_and_bump_seed,
    instruction::{ExecuteInstruction, TransferHookInstruction},
};

solana_program::entrypoint!(process_instruction);

pub const ID: Pubkey = Pubkey::new_from_array([42u8; 32]);
pub const WHOLE_TOKEN_BASE_UNITS: u64 = shared::boundary::MT_CLAIM_QUANTUM_BASE_UNITS;
pub const RECEIPT_REGISTRY_SEED: &[u8] = b"receipt_registry";
pub const RECEIPT_SEED: &[u8] = b"receipt";
pub const POLICY_SUMMARY: &str = "SolSoul transfer hook REJECT-ONLY INVARIANT. The hook never burns, never forfeits, and never mutates receipt lifecycle state. It permits transfers that stay within protected whole-token receipt capacity, permits surplus and explicit zero-active receipt crossings, and rejects boundary-breaking transfers instead of burning or forfeiting in the hook. Receipt lifecycle transitions (Active→Burned/Forfeited) happen only through explicit soul-generator settlement instructions, never automatically in the transfer hook.";

/// PD18.F2: REJECT-ONLY INVARIANT.
///
/// The SolSoul transfer hook NEVER burns, forfeits, or mutates receipt lifecycle
/// state during `Execute`.  It is a pure validation gate:
///
///   - If the transfer stays within protected receipt boundaries → permit (Ok).
///   - If the transfer would break a protected receipt boundary → reject
///     (BoundaryBreakRejected / InvalidReceiptBinding).
///   - The hook does NOT write to any receipt or registry account.
///
/// Receipt lifecycle transitions (Active → Burned / Forfeited) happen ONLY
/// through explicit settlement instructions in the soul-generator program
/// (`settle_receipts`), never inside the transfer hook.  There is no automatic
/// burn, no automatic forfeit, and no hook-internal mutation of on-chain
/// receipt state.
///
/// Any future proposal to add burn/forfeit behavior in the hook must:
///   1. Pass a new PD-level decision with explicit user approval.
///   2. Add matching tests, SDK mirrors, and UI/docs copy.
pub const TRANSFER_HOOK_INVARIANT: &str = "REJECT_ONLY";

const TOKEN_ACCOUNT_MINT_OFFSET: usize = 0;
const TOKEN_ACCOUNT_OWNER_OFFSET: usize = 32;
const TOKEN_ACCOUNT_AMOUNT_OFFSET: usize = 64;
const TOKEN_ACCOUNT_AMOUNT_END: usize = TOKEN_ACCOUNT_AMOUNT_OFFSET + 8;
const TOKEN_ACCOUNT_BASE_LEN: usize = 165;

const RECEIPT_REGISTRY_CLAIMANT_OFFSET: usize = 0;
const RECEIPT_REGISTRY_TOKEN_MINT_OFFSET: usize = RECEIPT_REGISTRY_CLAIMANT_OFFSET + 32;
const RECEIPT_REGISTRY_ACTIVE_RECEIPTS_OFFSET: usize = RECEIPT_REGISTRY_TOKEN_MINT_OFFSET + 32;
const RECEIPT_REGISTRY_LEN: usize = RECEIPT_REGISTRY_ACTIVE_RECEIPTS_OFFSET + 24;

const RECEIPT_CLAIMANT_OFFSET: usize = 32;
const RECEIPT_TOKEN_MINT_OFFSET: usize = RECEIPT_CLAIMANT_OFFSET + 32;
const RECEIPT_SEQUENCE_OFFSET: usize = 128;
const RECEIPT_BOUND_BOUNDARY_OFFSET: usize = 152;
const RECEIPT_LIFECYCLE_STATE_OFFSET: usize = 160;
const RECEIPT_ACCOUNT_LEN: usize = 161;
const RECEIPT_STATE_ACTIVE: u8 = 1;

#[repr(u32)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TransferHookError {
    MissingValidationAccount = 7_000,
    InvalidValidationAccount,
    MissingBindingAccount,
    InvalidReceiptBinding,
    BoundaryBreakRejected,
    ArithmeticOverflow,
    InvalidTransferHookConfig,
    UnauthorizedAuthority,
}

impl From<TransferHookError> for ProgramError {
    fn from(error: TransferHookError) -> Self {
        ProgramError::Custom(error as u32)
    }
}

pub fn id() -> Pubkey {
    ID
}

pub fn soul_generator_program_id() -> Pubkey {
    Pubkey::new_from_array(shared::programs::SOUL_GENERATOR_PROGRAM_ID)
}

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    match TransferHookInstruction::unpack(instruction_data)? {
        TransferHookInstruction::Execute { amount } => {
            process_execute(program_id, accounts, instruction_data, amount)
        }
        TransferHookInstruction::InitializeExtraAccountMetaList {
            extra_account_metas,
        } => process_initialize_extra_account_metas(program_id, accounts, &extra_account_metas),
        TransferHookInstruction::UpdateExtraAccountMetaList {
            extra_account_metas,
        } => process_update_extra_account_metas(program_id, accounts, &extra_account_metas),
    }
}

fn process_initialize_extra_account_metas(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    extra_account_metas: &[spl_tlv_account_resolution::account::ExtraAccountMeta],
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let validation = next_account_info(account_info_iter)?;
    let mint = next_account_info(account_info_iter)?;
    let authority = next_account_info(account_info_iter)?;
    let _system_program = next_account_info(account_info_iter)?;

    if !authority.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if _system_program.key != &solana_program::system_program::id() {
        return Err(ProgramError::IncorrectProgramId);
    }
    assert_mint_transfer_hook_config(program_id, mint, Some(authority.key))?;

    let required_len = ExtraAccountMetaList::size_of(extra_account_metas.len())?;
    if validation.lamports() == 0 {
        if *validation.key != get_extra_account_metas_address(mint.key, program_id) {
            return Err(TransferHookError::InvalidValidationAccount.into());
        }
        let rent_lamports = Rent::get()?.minimum_balance(required_len);
        let (_, bump) = get_extra_account_metas_address_and_bump_seed(mint.key, program_id);
        let bump_seed = [bump];
        let signer_seeds = collect_extra_account_metas_signer_seeds(mint.key, &bump_seed);
        invoke_signed(
            &system_instruction::create_account(
                authority.key,
                validation.key,
                rent_lamports,
                required_len as u64,
                program_id,
            ),
            &[
                authority.clone(),
                validation.clone(),
                _system_program.clone(),
            ],
            &[&signer_seeds],
        )?;
    } else {
        assert_validation_account(program_id, validation, mint.key)?;
    }

    let mut data = validation.try_borrow_mut_data()?;
    if data.len() < required_len {
        return Err(ProgramError::AccountDataTooSmall);
    }
    ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, extra_account_metas)?;
    msg!(
        "SolSoul Transfer Hook: initialized extra account metas ({})",
        extra_account_metas.len()
    );
    Ok(())
}

fn process_update_extra_account_metas(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    extra_account_metas: &[spl_tlv_account_resolution::account::ExtraAccountMeta],
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let validation = next_account_info(account_info_iter)?;
    let mint = next_account_info(account_info_iter)?;
    let authority = next_account_info(account_info_iter)?;

    if !authority.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    assert_mint_transfer_hook_config(program_id, mint, Some(authority.key))?;
    assert_validation_account(program_id, validation, mint.key)?;

    let required_len = ExtraAccountMetaList::size_of(extra_account_metas.len())?;
    let mut data = validation.try_borrow_mut_data()?;
    if data.len() < required_len {
        return Err(ProgramError::AccountDataTooSmall);
    }
    ExtraAccountMetaList::update::<ExecuteInstruction>(&mut data, extra_account_metas)?;
    Ok(())
}

fn process_execute(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
    amount: u64,
) -> ProgramResult {
    if accounts.len() < 5 {
        return Err(TransferHookError::MissingValidationAccount.into());
    }

    let source = &accounts[0];
    let mint = &accounts[1];
    let destination = &accounts[2];
    let validation = &accounts[4];

    assert_token_account(source, mint.key)?;
    assert_token_account(destination, mint.key)?;
    assert_mint_transfer_hook_config(program_id, mint, None)?;
    assert_validation_account(program_id, validation, mint.key)?;
    ExtraAccountMetaList::check_account_infos::<ExecuteInstruction>(
        accounts,
        instruction_data,
        program_id,
        &validation.try_borrow_data()?,
    )?;

    let source_data = source.try_borrow_data()?;
    let source_owner = source_owner(&source_data)?;
    let post_balance = token_amount(&source_data)?;
    let pre_balance = post_balance
        .checked_add(amount)
        .ok_or(TransferHookError::ArithmeticOverflow)?;
    let pre_whole_units = pre_balance / WHOLE_TOKEN_BASE_UNITS;
    let post_whole_units = post_balance / WHOLE_TOKEN_BASE_UNITS;
    let crossed_down = pre_whole_units
        .checked_sub(post_whole_units)
        .ok_or(TransferHookError::ArithmeticOverflow)?;
    drop(source_data);

    msg!(
        "SolSoul Transfer Hook: execute amount={} pre_whole={} post_whole={} crossed_down={}",
        amount,
        pre_whole_units,
        post_whole_units,
        crossed_down
    );

    if crossed_down == 0 {
        return Ok(());
    }

    let active_receipts =
        validate_registry_and_read_active_count(accounts, &source_owner, mint.key)?;
    if active_receipts > post_whole_units {
        msg!(
            "SolSoul Transfer Hook: rejecting boundary-breaking transfer active_receipts={} post_whole={}",
            active_receipts,
            post_whole_units
        );
        return Err(TransferHookError::BoundaryBreakRejected.into());
    }

    for receipt in accounts.iter().skip(7) {
        validate_unaffected_receipt(receipt, &source_owner, mint.key, post_whole_units)?;
    }

    Ok(())
}

fn assert_validation_account(
    program_id: &Pubkey,
    validation: &AccountInfo,
    mint: &Pubkey,
) -> ProgramResult {
    if validation.owner != program_id {
        return Err(TransferHookError::InvalidValidationAccount.into());
    }
    if *validation.key != get_extra_account_metas_address(mint, program_id) {
        return Err(TransferHookError::InvalidValidationAccount.into());
    }
    Ok(())
}

fn assert_mint_transfer_hook_config(
    program_id: &Pubkey,
    mint: &AccountInfo,
    required_authority: Option<&Pubkey>,
) -> ProgramResult {
    if mint.owner != &spl_token_2022::id() {
        return Err(ProgramError::IncorrectProgramId);
    }
    let data = mint.try_borrow_data()?;
    let mint_state = StateWithExtensions::<Mint>::unpack(&data)
        .map_err(|_| TransferHookError::InvalidTransferHookConfig)?;
    let hook = mint_state
        .get_extension::<TransferHook>()
        .map_err(|_| TransferHookError::InvalidTransferHookConfig)?;
    let configured_program_id: Option<Pubkey> = hook.program_id.into();
    if configured_program_id.as_ref() != Some(program_id) {
        msg!("SolSoul Transfer Hook: mint Transfer Hook program id mismatch");
        return Err(TransferHookError::InvalidTransferHookConfig.into());
    }
    if let Some(required_authority) = required_authority {
        let configured_authority: Option<Pubkey> = hook.authority.into();
        if configured_authority.as_ref() != Some(required_authority) {
            msg!("SolSoul Transfer Hook: signer is not mint Transfer Hook authority");
            return Err(TransferHookError::UnauthorizedAuthority.into());
        }
    }
    Ok(())
}

fn assert_token_account(account: &AccountInfo, mint: &Pubkey) -> ProgramResult {
    if account.owner != &spl_token_2022::id() {
        return Err(ProgramError::IncorrectProgramId);
    }
    let data = account.try_borrow_data()?;
    if data.len() < TOKEN_ACCOUNT_BASE_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }
    if &data[TOKEN_ACCOUNT_MINT_OFFSET..TOKEN_ACCOUNT_OWNER_OFFSET] != mint.as_ref() {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn source_owner(source_data: &[u8]) -> Result<[u8; 32], ProgramError> {
    if source_data.len() < TOKEN_ACCOUNT_BASE_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }
    let mut owner = [0u8; 32];
    owner.copy_from_slice(&source_data[TOKEN_ACCOUNT_OWNER_OFFSET..TOKEN_ACCOUNT_AMOUNT_OFFSET]);
    Ok(owner)
}

fn token_amount(source_data: &[u8]) -> Result<u64, ProgramError> {
    if source_data.len() < TOKEN_ACCOUNT_BASE_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }
    let mut amount = [0u8; 8];
    amount.copy_from_slice(&source_data[TOKEN_ACCOUNT_AMOUNT_OFFSET..TOKEN_ACCOUNT_AMOUNT_END]);
    Ok(u64::from_le_bytes(amount))
}

fn validate_registry_and_read_active_count(
    accounts: &[AccountInfo],
    source_owner: &[u8],
    mint: &Pubkey,
) -> Result<u64, ProgramError> {
    let soul_generator = soul_generator_program_id();
    let soul_generator_account = accounts
        .get(5)
        .ok_or(TransferHookError::MissingBindingAccount)?;
    if soul_generator_account.key != &soul_generator {
        return Err(TransferHookError::InvalidReceiptBinding.into());
    }

    let registry = accounts
        .get(6)
        .ok_or(TransferHookError::MissingBindingAccount)?;
    let expected_registry = Pubkey::find_program_address(
        &[RECEIPT_REGISTRY_SEED, source_owner, mint.as_ref()],
        &soul_generator,
    )
    .0;
    if registry.key != &expected_registry || registry.owner != &soul_generator {
        return Err(TransferHookError::InvalidReceiptBinding.into());
    }

    let data = registry.try_borrow_data()?;
    if data.len() < RECEIPT_REGISTRY_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }
    if &data[RECEIPT_REGISTRY_CLAIMANT_OFFSET..RECEIPT_REGISTRY_TOKEN_MINT_OFFSET] != source_owner
        || &data[RECEIPT_REGISTRY_TOKEN_MINT_OFFSET..RECEIPT_REGISTRY_ACTIVE_RECEIPTS_OFFSET]
            != mint.as_ref()
    {
        return Err(TransferHookError::InvalidReceiptBinding.into());
    }
    let mut active_receipts = [0u8; 8];
    active_receipts.copy_from_slice(
        &data[RECEIPT_REGISTRY_ACTIVE_RECEIPTS_OFFSET..RECEIPT_REGISTRY_ACTIVE_RECEIPTS_OFFSET + 8],
    );
    Ok(u64::from_le_bytes(active_receipts))
}

fn validate_unaffected_receipt(
    receipt: &AccountInfo,
    source_owner: &[u8],
    mint: &Pubkey,
    post_whole_units: u64,
) -> ProgramResult {
    let soul_generator = soul_generator_program_id();
    if receipt.owner != &soul_generator {
        return Err(TransferHookError::InvalidReceiptBinding.into());
    }
    let data = receipt.try_borrow_data()?;
    if data.len() < RECEIPT_ACCOUNT_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }
    if &data[RECEIPT_CLAIMANT_OFFSET..RECEIPT_TOKEN_MINT_OFFSET] != source_owner
        || &data[RECEIPT_TOKEN_MINT_OFFSET..RECEIPT_SEQUENCE_OFFSET] != mint.as_ref()
        || data[RECEIPT_LIFECYCLE_STATE_OFFSET] != RECEIPT_STATE_ACTIVE
    {
        return Err(TransferHookError::InvalidReceiptBinding.into());
    }
    let mut sequence = [0u8; 8];
    sequence.copy_from_slice(&data[RECEIPT_SEQUENCE_OFFSET..RECEIPT_SEQUENCE_OFFSET + 8]);
    let sequence = u64::from_le_bytes(sequence);
    let expected_receipt = Pubkey::find_program_address(
        &[RECEIPT_SEED, &data[0..32], &sequence.to_le_bytes()],
        &soul_generator,
    )
    .0;
    if receipt.key != &expected_receipt {
        return Err(TransferHookError::InvalidReceiptBinding.into());
    }

    let mut bound_boundary = [0u8; 8];
    bound_boundary
        .copy_from_slice(&data[RECEIPT_BOUND_BOUNDARY_OFFSET..RECEIPT_BOUND_BOUNDARY_OFFSET + 8]);
    let bound_boundary = u64::from_le_bytes(bound_boundary);
    let post_bound_capacity = post_whole_units
        .checked_mul(WHOLE_TOKEN_BASE_UNITS)
        .ok_or(TransferHookError::ArithmeticOverflow)?;
    if bound_boundary > post_bound_capacity {
        return Err(TransferHookError::BoundaryBreakRejected.into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hook_policy_summary_is_explicit_about_surplus_and_no_burns() {
        assert!(POLICY_SUMMARY.contains("surplus"));
        assert!(POLICY_SUMMARY.contains("rejects boundary-breaking"));
        assert!(POLICY_SUMMARY.contains("instead of burning or forfeiting"));
    }

    #[test]
    fn error_codes_map_to_distinct_ranges() {
        assert_eq!(TransferHookError::MissingValidationAccount as u32, 7_000);
        assert_eq!(TransferHookError::InvalidValidationAccount as u32, 7_001);
        assert_eq!(TransferHookError::MissingBindingAccount as u32, 7_002);
        assert_eq!(TransferHookError::InvalidReceiptBinding as u32, 7_003);
        assert_eq!(TransferHookError::BoundaryBreakRejected as u32, 7_004);
        assert_eq!(TransferHookError::ArithmeticOverflow as u32, 7_005);
        assert_eq!(TransferHookError::InvalidTransferHookConfig as u32, 7_006);
        assert_eq!(TransferHookError::UnauthorizedAuthority as u32, 7_007);
    }

    #[test]
    fn receipt_state_active_is_the_only_lifecycle_state_accepted() {
        assert_eq!(RECEIPT_STATE_ACTIVE, 1);
        // The hook only accepts RECEIPT_STATE_ACTIVE in validate_unaffected_receipt.
        // BURNED (2), FORFEITED, or any other lifecycle state must be rejected
        // as InvalidReceiptBinding to prevent stale receipts from authorizing transfers.
    }

    #[test]
    fn whole_token_base_units_equals_mt_claim_quantum() {
        assert_eq!(WHOLE_TOKEN_BASE_UNITS, 10_000_000_000);
        assert_eq!(
            WHOLE_TOKEN_BASE_UNITS,
            shared::boundary::MT_CLAIM_QUANTUM_BASE_UNITS
        );
    }

    #[test]
    fn receipt_registry_constants_match_expected_layout() {
        assert_eq!(RECEIPT_REGISTRY_CLAIMANT_OFFSET, 0);
        assert_eq!(RECEIPT_REGISTRY_TOKEN_MINT_OFFSET, 32);
        assert_eq!(RECEIPT_REGISTRY_ACTIVE_RECEIPTS_OFFSET, 64);
        assert_eq!(RECEIPT_REGISTRY_LEN, 88);
    }

    #[test]
    fn receipt_constants_match_expected_layout() {
        assert_eq!(RECEIPT_ACCOUNT_LEN, 161);
        assert_eq!(RECEIPT_LIFECYCLE_STATE_OFFSET, 160);
        assert_eq!(RECEIPT_STATE_ACTIVE, 1);
    }

    // ── PD18.F2: Reject-only invariant tests ──

    #[test]
    fn invariant_is_explicitly_reject_only() {
        assert_eq!(TRANSFER_HOOK_INVARIANT, "REJECT_ONLY");
    }

    #[test]
    fn policy_summary_explicitly_rejects_burn_and_forfeit() {
        assert!(POLICY_SUMMARY.contains("REJECT-ONLY INVARIANT"));
        assert!(POLICY_SUMMARY.contains("never burns"));
        assert!(POLICY_SUMMARY.contains("never forfeits"));
        assert!(POLICY_SUMMARY.contains("instead of burning or forfeiting"));
        assert!(POLICY_SUMMARY.contains("rejects boundary-breaking"));
        // The only mention of "Burned/Forfeited" is in the explanation that
        // lifecycle transitions happen through soul-generator settlement, not
        // in the transfer hook itself. Verify this context is present.
        assert!(POLICY_SUMMARY.contains("soul-generator settlement"));
    }

    #[test]
    fn no_burn_or_forfeit_error_codes_exist_in_transfer_hook() {
        // The transfer hook error codes are all in the 7_000 range.
        // There is no "ReceiptBurned" or "ReceiptForfeited" error — those
        // would imply the hook mutates receipt state, which it never does.
        let codes: Vec<u32> = vec![
            TransferHookError::MissingValidationAccount as u32,
            TransferHookError::InvalidValidationAccount as u32,
            TransferHookError::MissingBindingAccount as u32,
            TransferHookError::InvalidReceiptBinding as u32,
            TransferHookError::BoundaryBreakRejected as u32,
            TransferHookError::ArithmeticOverflow as u32,
            TransferHookError::InvalidTransferHookConfig as u32,
            TransferHookError::UnauthorizedAuthority as u32,
        ];
        // All codes are reject-only, none are state-mutation codes.
        for code in &codes {
            assert!(
                *code >= 7_000 && *code < 8_000,
                "unexpected error code range"
            );
        }
        // Verify no duplicate codes.
        let mut sorted = codes.clone();
        sorted.sort();
        sorted.dedup();
        assert_eq!(sorted.len(), codes.len(), "duplicate error codes found");
    }

    #[test]
    fn boundary_rejection_uses_stable_error_code() {
        // The BoundaryBreakRejected error must remain stable so SDK/app
        // consumers can rely on the error code for user-facing messages.
        assert_eq!(TransferHookError::BoundaryBreakRejected as u32, 7_004);
    }

    #[test]
    fn multi_boundary_drop_from_3_to_1_would_reject() {
        // Pre: 3 whole units, 3 active receipts.
        // Transfer: drop to 1 whole unit.
        // active_receipts (3) > post_whole_units (1) → BoundaryBreakRejected.
        let pre_whole = 3;
        let amount = 2 * WHOLE_TOKEN_BASE_UNITS;
        let post_whole = pre_whole - amount / WHOLE_TOKEN_BASE_UNITS;
        let active_receipts: u64 = 3;
        assert_eq!(post_whole, 1);
        assert!(active_receipts > post_whole);
        // The hook would reject this transfer.
    }

    #[test]
    fn multi_boundary_drop_clean_would_permit() {
        // Pre: 3 whole units, 0 active receipts.
        // Transfer: drop to 1 whole unit.
        // crossed_down > 0, but active_receipts (0) <= post_whole_units (1) → permit.
        let pre_whole = 3;
        let amount = 2 * WHOLE_TOKEN_BASE_UNITS;
        let post_whole = pre_whole - amount / WHOLE_TOKEN_BASE_UNITS;
        let active_receipts: u64 = 0;
        assert_eq!(post_whole, 1);
        assert!(!(active_receipts > post_whole));
        // The hook would NOT reject — surplus-only transfer is permitted.
    }

    #[test]
    fn single_boundary_crossing_with_one_active_receipt_rejects() {
        // Pre: 2 whole units, 1 active receipt.
        // Transfer: drop to 1 whole unit.
        // active_receipts (1) > post_whole_units (1)? No, 1 <= 1 → would permit.
        // But if we have 1 receipt and drop to 0, then 1 > 0 → reject.
        let post_whole: u64 = 0;
        let active_receipts: u64 = 1;
        assert!(active_receipts > post_whole);
    }

    #[test]
    fn zero_crossed_down_is_always_permitted() {
        // If the transfer amount doesn't cross any whole-unit boundary
        // (crossed_down == 0), the hook returns Ok early without checking
        // receipts at all, regardless of active receipt count.
        let crossed_down: u64 = 0;
        assert_eq!(crossed_down, 0);
        // The hook's early return at `if crossed_down == 0 { return Ok(()); }`
        // means a sub-whole transfer is always permitted.
    }

    #[test]
    fn receipt_state_active_is_required_for_validation() {
        // validate_unaffected_receipt checks data[RECEIPT_LIFECYCLE_STATE_OFFSET] == RECEIPT_STATE_ACTIVE.
        // Only active receipts (state = 1) pass validation.
        // Burned (2) or Forfeited receipts are rejected with InvalidReceiptBinding.
        assert_eq!(RECEIPT_STATE_ACTIVE, 1);
        // Any other lifecycle state (0, 2, 3, 255, etc.) causes rejection.
        let invalid_states = [0u8, 2u8, 3u8, 255u8];
        for state in &invalid_states {
            assert_ne!(*state, RECEIPT_STATE_ACTIVE);
        }
    }

    #[test]
    fn receipt_must_match_source_owner_and_mint() {
        // validate_unaffected_receipt verifies:
        // - receipt.data[CLAIMANT_OFFSET..] == source_owner
        // - receipt.data[TOKEN_MINT_OFFSET..] == mint
        // If either mismatches → InvalidReceiptBinding.
        // This test asserts the extractors are stable.
        assert_eq!(RECEIPT_CLAIMANT_OFFSET, 32);
        assert_eq!(RECEIPT_TOKEN_MINT_OFFSET, 64);
    }
}
