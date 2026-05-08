use crate::state::{
    ReceiptAccount, ReceiptRegistryAccount, RECEIPT_REGISTRY_SEED, RECEIPT_SEED,
    RECEIPT_STATE_ACTIVE, RECEIPT_STATE_BURNED, RECEIPT_STATE_FORFEITED,
};
use pinocchio::{error::ProgramError, AccountView, Address, ProgramResult};
use shared::{
    boundary::{balance_for_whole_units, crossed_down_boundaries},
    geppetto::{assert_owned_by, assert_signer, assert_writable, GeppettoError},
    programs::BONDING_CURVE_PROGRAM_ID,
};

const SETTLE_ARGS_LEN: usize = 9;
const TOKEN_ACCOUNT_MINT_OFFSET: usize = 0;
const TOKEN_ACCOUNT_OWNER_OFFSET: usize = 32;
const TOKEN_ACCOUNT_AMOUNT_OFFSET: usize = 64;
const TOKEN_ACCOUNT_DELEGATE_OPTION_OFFSET: usize = 72;
const TOKEN_ACCOUNT_STATE_OFFSET: usize = 108;
const TOKEN_ACCOUNT_DELEGATED_AMOUNT_OFFSET: usize = 121;
const TOKEN_ACCOUNT_AMOUNT_END: usize = TOKEN_ACCOUNT_AMOUNT_OFFSET + 8;
const TOKEN_ACCOUNT_DELEGATE_OPTION_END: usize = TOKEN_ACCOUNT_DELEGATE_OPTION_OFFSET + 4;
const TOKEN_ACCOUNT_DELEGATED_AMOUNT_END: usize = TOKEN_ACCOUNT_DELEGATED_AMOUNT_OFFSET + 8;
const TOKEN_ACCOUNT_MIN_LEN: usize = 165;
const TOKEN_ACCOUNT_STATE_INITIALIZED: u8 = 1;
const TOKEN_2022_ID: Address = Address::new_from_array(pinocchio_pubkey::pubkey!(
    "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
));
const INSTRUCTIONS_SYSVAR_ID: Address = Address::new_from_array(pinocchio_pubkey::pubkey!(
    "Sysvar1nstructions1111111111111111111111111"
));
const BONDING_CURVE_ID: Address = Address::new_from_array(BONDING_CURVE_PROGRAM_ID);
/// Local-only bonding-curve program id used by the workspace's bonding-curve
/// crate (its `declare_id!`) and exercised by `solana-program-test`
/// integration scenarios. SEC.A5 / SEC.F5: this id MUST NOT be accepted as a
/// dependent-movement bonding-curve sell program in default or
/// devnet-deployed production-like builds; it is only honored when the
/// soul-generator crate is explicitly built with `--features integration`.
#[cfg(feature = "integration")]
const LOCAL_BONDING_CURVE_ID: Address = Address::new_from_array(pinocchio_pubkey::pubkey!(
    "B6AhJJSYMbnrxLbS6nTBuDowADQJxdF7hQSTrepFFk3C"
));

/// Returns true when `program_id` matches a bonding-curve program that is
/// trusted to emit a dependent SELL movement for receipt settlement. Default
/// builds trust only the canonical configured `BONDING_CURVE_PROGRAM_ID`;
/// the local integration id is only trusted when the crate is built with
/// `--features integration`.
fn is_trusted_bonding_curve_program(program_id: &[u8]) -> bool {
    if program_id == BONDING_CURVE_ID.as_ref() {
        return true;
    }
    #[cfg(feature = "integration")]
    {
        if program_id == LOCAL_BONDING_CURVE_ID.as_ref() {
            return true;
        }
    }
    false
}
const BONDING_CURVE_SELL_DISCRIMINATOR: u8 = 2;
const TOKEN_TRANSFER_CHECKED_DISCRIMINATOR: u8 = 12;
const INSTRUCTION_ACCOUNT_META_LEN: usize = 33;
const INSTRUCTION_ACCOUNT_PUBKEY_OFFSET: usize = 1;

#[repr(u32)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SettlementError {
    InvalidSettlementState = 0x330,
    InvalidSettlementBinding = 0x331,
    InvalidSettlementCount = 0x332,
    DuplicateReceipt = 0x333,
    OutOfOrderReceipt = 0x334,
    InactiveReceipt = 0x335,
    UnauthorizedSettlement = 0x336,
    MissingDependentMovement = 0x337,
    InvalidInstructionsSysvar = 0x338,
}

impl From<SettlementError> for ProgramError {
    fn from(value: SettlementError) -> Self {
        ProgramError::Custom(value as u32)
    }
}

pub fn process(
    program_id: &Address,
    accounts: &mut [AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    if instruction_data.len() != SETTLE_ARGS_LEN {
        return Err(ProgramError::InvalidInstructionData);
    }
    let new_state = instruction_data[0];
    if !matches!(new_state, RECEIPT_STATE_BURNED | RECEIPT_STATE_FORFEITED) {
        return Err(SettlementError::InvalidSettlementState.into());
    }
    let mut movement_amount = [0u8; 8];
    movement_amount.copy_from_slice(&instruction_data[1..SETTLE_ARGS_LEN]);
    let movement_amount = u64::from_le_bytes(movement_amount);

    if accounts.len() < 4 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    let (registry_slice, rest) = accounts.split_at_mut(1);
    let registry = &mut registry_slice[0];
    let (authority_slice, rest) = rest.split_at_mut(1);
    let authority = &authority_slice[0];
    let (token_account_slice, receipts) = rest.split_at_mut(1);
    let token_account = &token_account_slice[0];
    let (instructions_sysvar_slice, receipts) = receipts.split_at_mut(1);
    let instructions_sysvar = &instructions_sysvar_slice[0];

    assert_writable(registry)?;
    assert_signer(authority)?;
    assert_owned_by(registry, program_id)?;
    assert_owned_by(token_account, &TOKEN_2022_ID)?;

    let registry_state = {
        let data = registry.try_borrow()?;
        ReceiptRegistryAccount::unpack(&data)?
    };
    if &registry_state.claimant != authority.address() {
        return Err(SettlementError::UnauthorizedSettlement.into());
    }
    assert_canonical_pda(
        registry,
        &[
            RECEIPT_REGISTRY_SEED,
            registry_state.claimant.as_ref(),
            registry_state.token_mint.as_ref(),
        ],
        program_id,
    )?;

    let pre_balance = validate_token_account_and_read_amount(
        token_account,
        &registry_state.claimant,
        &registry_state.token_mint,
    )?;
    let crossing = crossed_down_boundaries(pre_balance, movement_amount)?;
    let pre_whole_units = crossing.pre_whole_units;
    if registry_state.active_receipts > pre_whole_units {
        return Err(SettlementError::InvalidSettlementBinding.into());
    }
    let required_count = registry_state
        .active_receipts
        .saturating_sub(crossing.post_whole_units);
    if receipts.len()
        != usize::try_from(required_count).map_err(|_| ProgramError::InvalidArgument)?
    {
        return Err(SettlementError::InvalidSettlementCount.into());
    }
    validate_dependent_movement(
        instructions_sysvar,
        token_account.address(),
        &registry_state.claimant,
        &registry_state.token_mint,
        movement_amount,
    )?;

    let post_bound_capacity = balance_for_whole_units(crossing.post_whole_units)?;
    let pre_bound_capacity = balance_for_whole_units(pre_whole_units)?;
    validate_receipts(
        receipts,
        program_id,
        &registry_state.claimant,
        &registry_state.token_mint,
        post_bound_capacity,
        pre_bound_capacity,
        required_count,
    )?;

    let mut next_registry_state = registry_state;
    next_registry_state.active_receipts = next_registry_state
        .active_receipts
        .checked_sub(required_count)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    if new_state == RECEIPT_STATE_BURNED {
        next_registry_state.burned_receipts = next_registry_state
            .burned_receipts
            .checked_add(required_count)
            .ok_or(ProgramError::ArithmeticOverflow)?;
    } else {
        next_registry_state.forfeited_receipts = next_registry_state
            .forfeited_receipts
            .checked_add(required_count)
            .ok_or(ProgramError::ArithmeticOverflow)?;
    }

    for receipt in receipts {
        let mut receipt_state = {
            let data = receipt.try_borrow()?;
            ReceiptAccount::unpack(&data)?
        };
        receipt_state.lifecycle_state = new_state;
        let mut data = receipt.try_borrow_mut()?;
        receipt_state.pack(&mut data[..ReceiptAccount::LEN])?;
    }
    let mut data = registry.try_borrow_mut()?;
    next_registry_state.pack(&mut data[..ReceiptRegistryAccount::LEN])?;

    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn validate_receipts(
    receipts: &[AccountView],
    program_id: &Address,
    claimant: &Address,
    token_mint: &Address,
    post_bound_capacity: u64,
    pre_bound_capacity: u64,
    required_count: u64,
) -> ProgramResult {
    for (index, receipt) in receipts.iter().enumerate() {
        for prior in receipts.iter().take(index) {
            if prior.address() == receipt.address() {
                return Err(SettlementError::DuplicateReceipt.into());
            }
        }
        assert_writable(receipt)?;
        assert_owned_by(receipt, program_id)?;
        let receipt_state = {
            let data = receipt.try_borrow()?;
            ReceiptAccount::unpack(&data)?
        };
        if receipt_state.lifecycle_state != RECEIPT_STATE_ACTIVE {
            return Err(SettlementError::InactiveReceipt.into());
        }
        if &receipt_state.claimant != claimant || &receipt_state.token_mint != token_mint {
            return Err(SettlementError::InvalidSettlementBinding.into());
        }
        if receipt_state.bound_boundary <= post_bound_capacity
            || receipt_state.bound_boundary > pre_bound_capacity
        {
            return Err(SettlementError::InvalidSettlementBinding.into());
        }
        let expected_boundary_index = required_count
            .checked_sub(u64::try_from(index).map_err(|_| ProgramError::InvalidArgument)?)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        let expected_boundary = post_bound_capacity
            .checked_add(balance_for_whole_units(expected_boundary_index)?)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        if receipt_state.bound_boundary != expected_boundary {
            return Err(SettlementError::OutOfOrderReceipt.into());
        }
        let sequence = receipt_state.sequence;
        let sequence_bytes = sequence.to_le_bytes();
        assert_canonical_pda(
            receipt,
            &[RECEIPT_SEED, receipt_state.soul.as_ref(), &sequence_bytes],
            program_id,
        )?;
    }
    Ok(())
}

fn validate_token_account_and_read_amount(
    token_account: &AccountView,
    owner: &Address,
    mint: &Address,
) -> Result<u64, ProgramError> {
    if token_account.data_len() < TOKEN_ACCOUNT_MIN_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }
    let data = token_account.try_borrow()?;
    if &data[TOKEN_ACCOUNT_MINT_OFFSET..TOKEN_ACCOUNT_OWNER_OFFSET] != mint.as_ref()
        || &data[TOKEN_ACCOUNT_OWNER_OFFSET..TOKEN_ACCOUNT_AMOUNT_OFFSET] != owner.as_ref()
    {
        return Err(SettlementError::InvalidSettlementBinding.into());
    }
    if data[TOKEN_ACCOUNT_STATE_OFFSET] != TOKEN_ACCOUNT_STATE_INITIALIZED {
        return Err(SettlementError::InvalidSettlementBinding.into());
    }
    if data[TOKEN_ACCOUNT_DELEGATE_OPTION_OFFSET..TOKEN_ACCOUNT_DELEGATE_OPTION_END] != [0u8; 4]
        || data[TOKEN_ACCOUNT_DELEGATED_AMOUNT_OFFSET..TOKEN_ACCOUNT_DELEGATED_AMOUNT_END]
            != [0u8; 8]
    {
        return Err(SettlementError::InvalidSettlementBinding.into());
    }
    let mut amount = [0u8; 8];
    amount.copy_from_slice(&data[TOKEN_ACCOUNT_AMOUNT_OFFSET..TOKEN_ACCOUNT_AMOUNT_END]);
    Ok(u64::from_le_bytes(amount))
}

fn validate_dependent_movement(
    instructions_sysvar: &AccountView,
    token_account: &Address,
    authority: &Address,
    token_mint: &Address,
    movement_amount: u64,
) -> ProgramResult {
    if instructions_sysvar.address() != &INSTRUCTIONS_SYSVAR_ID {
        return Err(SettlementError::InvalidInstructionsSysvar.into());
    }
    let data = instructions_sysvar.try_borrow()?;
    let instruction_count = read_u16(&data, 0)? as usize;
    let current_index = read_current_instruction_index(&data)? as usize;
    for index in current_index.saturating_add(1)..instruction_count {
        if dependent_instruction_matches(
            &data,
            index,
            token_account,
            authority,
            token_mint,
            movement_amount,
        )? {
            return Ok(());
        }
    }
    Err(SettlementError::MissingDependentMovement.into())
}

fn dependent_instruction_matches(
    data: &[u8],
    index: usize,
    token_account: &Address,
    authority: &Address,
    token_mint: &Address,
    movement_amount: u64,
) -> Result<bool, ProgramError> {
    let instruction = parse_instruction(data, index)?;
    if is_trusted_bonding_curve_program(instruction.program_id) {
        return sell_instruction_matches(
            data,
            instruction,
            token_account,
            authority,
            token_mint,
            movement_amount,
        );
    }
    if instruction.program_id == TOKEN_2022_ID.as_ref() {
        return transfer_checked_instruction_matches(
            data,
            instruction,
            token_account,
            authority,
            token_mint,
            movement_amount,
        );
    }
    Ok(false)
}

fn sell_instruction_matches(
    data: &[u8],
    instruction: ParsedInstruction<'_>,
    token_account: &Address,
    authority: &Address,
    token_mint: &Address,
    movement_amount: u64,
) -> Result<bool, ProgramError> {
    if instruction.account_count < 5
        || instruction.data.len() < 9
        || instruction.data[0] != BONDING_CURVE_SELL_DISCRIMINATOR
        || read_u64(instruction.data, 1)? != movement_amount
    {
        return Ok(false);
    }
    Ok(account_pubkey(data, instruction, 2)? == token_mint.as_ref()
        && account_pubkey(data, instruction, 3)? == token_account.as_ref()
        && account_pubkey(data, instruction, 4)? == authority.as_ref())
}

fn transfer_checked_instruction_matches(
    data: &[u8],
    instruction: ParsedInstruction<'_>,
    token_account: &Address,
    authority: &Address,
    token_mint: &Address,
    movement_amount: u64,
) -> Result<bool, ProgramError> {
    if instruction.account_count < 4
        || instruction.data.len() < 9
        || instruction.data[0] != TOKEN_TRANSFER_CHECKED_DISCRIMINATOR
        || read_u64(instruction.data, 1)? != movement_amount
    {
        return Ok(false);
    }
    let source = account_pubkey(data, instruction, 0)?;
    let destination = account_pubkey(data, instruction, 2)?;
    Ok(source == token_account.as_ref()
        && destination != token_account.as_ref()
        && account_pubkey(data, instruction, 1)? == token_mint.as_ref()
        && account_pubkey(data, instruction, 3)? == authority.as_ref())
}

#[derive(Clone, Copy)]
struct ParsedInstruction<'a> {
    account_start: usize,
    account_count: usize,
    program_id: &'a [u8],
    data: &'a [u8],
}

fn parse_instruction(data: &[u8], index: usize) -> Result<ParsedInstruction<'_>, ProgramError> {
    let instruction_count = read_u16(data, 0)? as usize;
    if index >= instruction_count {
        return Err(ProgramError::InvalidArgument);
    }
    let table_offset = 2usize
        .checked_add(
            index
                .checked_mul(2)
                .ok_or(ProgramError::ArithmeticOverflow)?,
        )
        .ok_or(ProgramError::ArithmeticOverflow)?;
    let instruction_offset = read_u16(data, table_offset)? as usize;
    let account_count = read_u16(data, instruction_offset)? as usize;
    let account_start = instruction_offset
        .checked_add(2)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    let program_id_start = account_start
        .checked_add(
            account_count
                .checked_mul(INSTRUCTION_ACCOUNT_META_LEN)
                .ok_or(ProgramError::ArithmeticOverflow)?,
        )
        .ok_or(ProgramError::ArithmeticOverflow)?;
    let program_id_end = program_id_start
        .checked_add(32)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    let data_len_offset = program_id_end;
    let instruction_data_start = data_len_offset
        .checked_add(2)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    let instruction_data_len = read_u16(data, data_len_offset)? as usize;
    let instruction_data_end = instruction_data_start
        .checked_add(instruction_data_len)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    Ok(ParsedInstruction {
        account_start,
        account_count,
        program_id: checked_slice(data, program_id_start, program_id_end)?,
        data: checked_slice(data, instruction_data_start, instruction_data_end)?,
    })
}

fn account_pubkey<'a>(
    data: &'a [u8],
    instruction: ParsedInstruction<'_>,
    index: usize,
) -> Result<&'a [u8], ProgramError> {
    if index >= instruction.account_count {
        return Err(ProgramError::InvalidArgument);
    }
    let start = instruction
        .account_start
        .checked_add(
            index
                .checked_mul(INSTRUCTION_ACCOUNT_META_LEN)
                .ok_or(ProgramError::ArithmeticOverflow)?,
        )
        .and_then(|offset| offset.checked_add(INSTRUCTION_ACCOUNT_PUBKEY_OFFSET))
        .ok_or(ProgramError::ArithmeticOverflow)?;
    checked_slice(
        data,
        start,
        start
            .checked_add(32)
            .ok_or(ProgramError::ArithmeticOverflow)?,
    )
}

fn read_current_instruction_index(data: &[u8]) -> Result<u16, ProgramError> {
    let offset = data
        .len()
        .checked_sub(2)
        .ok_or(ProgramError::InvalidInstructionData)?;
    read_u16(data, offset)
}

fn read_u16(data: &[u8], offset: usize) -> Result<u16, ProgramError> {
    let bytes = checked_slice(
        data,
        offset,
        offset
            .checked_add(2)
            .ok_or(ProgramError::ArithmeticOverflow)?,
    )?;
    Ok(u16::from_le_bytes(
        bytes
            .try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?,
    ))
}

fn read_u64(data: &[u8], offset: usize) -> Result<u64, ProgramError> {
    let bytes = checked_slice(
        data,
        offset,
        offset
            .checked_add(8)
            .ok_or(ProgramError::ArithmeticOverflow)?,
    )?;
    Ok(u64::from_le_bytes(
        bytes
            .try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?,
    ))
}

fn checked_slice(data: &[u8], start: usize, end: usize) -> Result<&[u8], ProgramError> {
    if start > end || end > data.len() {
        return Err(ProgramError::InvalidInstructionData);
    }
    Ok(&data[start..end])
}

fn assert_canonical_pda<const N: usize>(
    account: &AccountView,
    seeds: &[&[u8]; N],
    program_id: &Address,
) -> ProgramResult {
    let Some((pda, _bump)) = Address::derive_program_address(seeds, program_id) else {
        return Err(GeppettoError::InvalidSeeds.into());
    };
    if account.address() != &pda {
        return Err(GeppettoError::InvalidPda.into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{is_trusted_bonding_curve_program, BONDING_CURVE_ID};

    /// SEC.A5: the canonical configured bonding-curve program id is always
    /// trusted as the dependent-movement settlement authority. This holds for
    /// both default and integration builds.
    #[test]
    fn bonding_curve_authority_defaults_trust_canonical_program_id_for_settlement() {
        assert!(is_trusted_bonding_curve_program(BONDING_CURVE_ID.as_ref()));
    }

    /// SEC.A5: default builds (without the `integration` Cargo feature) MUST
    /// NOT accept the local integration bonding-curve program id as a
    /// dependent-movement settlement authority. This prevents a non-canonical
    /// local integration program from satisfying the receipt SELL-binding
    /// requirement on devnet-deployed / production-like binaries.
    #[cfg(not(feature = "integration"))]
    #[test]
    fn bonding_curve_authority_defaults_reject_local_integration_program_id_for_settlement() {
        let local_integration: [u8; 32] =
            pinocchio_pubkey::pubkey!("B6AhJJSYMbnrxLbS6nTBuDowADQJxdF7hQSTrepFFk3C");
        assert!(
            !is_trusted_bonding_curve_program(&local_integration),
            "default build must NOT trust local integration bonding-curve id for settle_receipts (SEC.A5)"
        );
    }

    /// SEC.A5: integration builds (`--features integration`) explicitly opt
    /// in to honoring the local integration bonding-curve program id so
    /// `solana-program-test` integration scenarios can satisfy the
    /// dependent-movement settlement check via the workspace bonding-curve
    /// crate.
    #[cfg(feature = "integration")]
    #[test]
    fn bonding_curve_authority_integration_feature_accepts_local_integration_id_for_settlement() {
        let local_integration: [u8; 32] =
            pinocchio_pubkey::pubkey!("B6AhJJSYMbnrxLbS6nTBuDowADQJxdF7hQSTrepFFk3C");
        assert!(
            is_trusted_bonding_curve_program(&local_integration),
            "integration-feature build must trust local integration bonding-curve id for settle_receipts"
        );
        assert!(
            is_trusted_bonding_curve_program(BONDING_CURVE_ID.as_ref()),
            "integration-feature build must still trust canonical BONDING_CURVE_PROGRAM_ID for settle_receipts"
        );
    }
}
