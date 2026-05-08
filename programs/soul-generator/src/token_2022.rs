use alloc::vec::Vec;
use pinocchio::{
    cpi::{invoke, invoke_signed, Seed, Signer},
    error::ProgramError,
    instruction::{InstructionAccount, InstructionView},
    AccountView, Address, ProgramResult,
};

pub const TOKEN_2022_ID: Address = Address::new_from_array(pinocchio_pubkey::pubkey!(
    "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
));

const METADATA_POINTER_EXTENSION_INSTRUCTION: u8 = 39;
const METADATA_POINTER_INITIALIZE_INSTRUCTION: u8 = 0;
const TOKEN_METADATA_INITIALIZE_DISCRIMINATOR: [u8; 8] = [210, 225, 30, 162, 88, 184, 77, 141];

pub const EXTENSION_ACCOUNT_BASE_LEN: usize = 166;
pub const TLV_ENTRY_HEADER_LEN: usize = 4;
pub const METADATA_POINTER_EXTENSION_LEN: usize = 64;
pub const TOKEN_METADATA_BASE_PACKED_LEN: usize = 80;

pub struct TokenMetadataInit<'a> {
    pub metadata: &'a AccountView,
    pub update_authority: &'a AccountView,
    pub mint: &'a AccountView,
    pub mint_authority: &'a AccountView,
    pub name: &'a str,
    pub symbol: &'a str,
    pub uri: &'a str,
    pub mint_authority_seeds: &'a [Seed<'a>],
}

pub fn token_metadata_mint_len(name: &str, symbol: &str, uri: &str) -> Result<usize, ProgramError> {
    EXTENSION_ACCOUNT_BASE_LEN
        .checked_add(TLV_ENTRY_HEADER_LEN)
        .and_then(|len| len.checked_add(METADATA_POINTER_EXTENSION_LEN))
        .and_then(|len| len.checked_add(TLV_ENTRY_HEADER_LEN))
        .and_then(|len| len.checked_add(TOKEN_METADATA_BASE_PACKED_LEN))
        .and_then(|len| len.checked_add(name.len()))
        .and_then(|len| len.checked_add(symbol.len()))
        .and_then(|len| len.checked_add(uri.len()))
        .ok_or(ProgramError::ArithmeticOverflow)
}

pub fn initialize_metadata_pointer(
    mint: &AccountView,
    authority: &Address,
    metadata_address: &Address,
) -> ProgramResult {
    let instruction_accounts = [InstructionAccount::writable(mint.address())];
    let mut instruction_data = [0u8; 66];
    instruction_data[0] = METADATA_POINTER_EXTENSION_INSTRUCTION;
    instruction_data[1] = METADATA_POINTER_INITIALIZE_INSTRUCTION;
    instruction_data[2..34].copy_from_slice(authority.as_ref());
    instruction_data[34..66].copy_from_slice(metadata_address.as_ref());

    let instruction = InstructionView {
        program_id: &TOKEN_2022_ID,
        accounts: &instruction_accounts,
        data: &instruction_data,
    };
    let account_views = [mint];

    invoke(&instruction, &account_views)
}

pub fn initialize_token_metadata_signed(params: TokenMetadataInit<'_>) -> ProgramResult {
    let instruction_accounts = [
        InstructionAccount::writable(params.metadata.address()),
        InstructionAccount::readonly(params.update_authority.address()),
        InstructionAccount::readonly(params.mint.address()),
        InstructionAccount::readonly_signer(params.mint_authority.address()),
    ];
    let instruction_data = pack_initialize_token_metadata(params.name, params.symbol, params.uri)?;
    let instruction = InstructionView {
        program_id: &TOKEN_2022_ID,
        accounts: &instruction_accounts,
        data: &instruction_data,
    };
    let account_views = [
        params.metadata,
        params.update_authority,
        params.mint,
        params.mint_authority,
    ];
    let signer = Signer::from(params.mint_authority_seeds);

    invoke_signed(&instruction, &account_views, &[signer])
}

fn pack_initialize_token_metadata(
    name: &str,
    symbol: &str,
    uri: &str,
) -> Result<Vec<u8>, ProgramError> {
    let capacity = TOKEN_METADATA_INITIALIZE_DISCRIMINATOR
        .len()
        .checked_add(4)
        .and_then(|len| len.checked_add(name.len()))
        .and_then(|len| len.checked_add(4))
        .and_then(|len| len.checked_add(symbol.len()))
        .and_then(|len| len.checked_add(4))
        .and_then(|len| len.checked_add(uri.len()))
        .ok_or(ProgramError::ArithmeticOverflow)?;
    let mut data = Vec::with_capacity(capacity);
    data.extend_from_slice(&TOKEN_METADATA_INITIALIZE_DISCRIMINATOR);
    push_borsh_string(&mut data, name)?;
    push_borsh_string(&mut data, symbol)?;
    push_borsh_string(&mut data, uri)?;
    Ok(data)
}

fn push_borsh_string(data: &mut Vec<u8>, value: &str) -> ProgramResult {
    let len = u32::try_from(value.len()).map_err(|_| ProgramError::ArithmeticOverflow)?;
    data.extend_from_slice(&len.to_le_bytes());
    data.extend_from_slice(value.as_bytes());
    Ok(())
}

pub fn initialize_mint2_with_freeze_authority(
    mint: &AccountView,
    decimals: u8,
    mint_authority: &Address,
    freeze_authority: &Address,
) -> ProgramResult {
    let instruction_accounts = [InstructionAccount::writable(mint.address())];
    let mut instruction_data = [0u8; 67];
    instruction_data[0] = 20;
    instruction_data[1] = decimals;
    instruction_data[2..34].copy_from_slice(mint_authority.as_ref());
    instruction_data[34] = 1;
    instruction_data[35..67].copy_from_slice(freeze_authority.as_ref());

    let instruction = InstructionView {
        program_id: &TOKEN_2022_ID,
        accounts: &instruction_accounts,
        data: &instruction_data,
    };
    let account_views = [mint];

    invoke(&instruction, &account_views)
}

pub fn mint_to_signed(
    mint: &AccountView,
    destination: &AccountView,
    authority: &AccountView,
    amount: u64,
    authority_seeds: &[Seed],
) -> ProgramResult {
    if amount == 0 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let instruction_accounts = [
        InstructionAccount::writable(mint.address()),
        InstructionAccount::writable(destination.address()),
        InstructionAccount::readonly_signer(authority.address()),
    ];
    let mut instruction_data = [0u8; 9];
    instruction_data[0] = 7;
    instruction_data[1..9].copy_from_slice(&amount.to_le_bytes());

    let instruction = InstructionView {
        program_id: &TOKEN_2022_ID,
        accounts: &instruction_accounts,
        data: &instruction_data,
    };
    let account_views = [mint, destination, authority];
    let signer = Signer::from(authority_seeds);

    invoke_signed(&instruction, &account_views, &[signer])
}

pub fn freeze_account_signed(
    account: &AccountView,
    mint: &AccountView,
    authority: &AccountView,
    authority_seeds: &[Seed],
) -> ProgramResult {
    let instruction_accounts = [
        InstructionAccount::writable(account.address()),
        InstructionAccount::readonly(mint.address()),
        InstructionAccount::readonly_signer(authority.address()),
    ];
    let instruction_data = [10u8];

    let instruction = InstructionView {
        program_id: &TOKEN_2022_ID,
        accounts: &instruction_accounts,
        data: &instruction_data,
    };
    let account_views = [account, mint, authority];
    let signer = Signer::from(authority_seeds);

    invoke_signed(&instruction, &account_views, &[signer])
}
