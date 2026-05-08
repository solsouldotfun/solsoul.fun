use pinocchio::{
    cpi::{invoke, invoke_signed, Seed, Signer},
    error::ProgramError,
    instruction::{InstructionAccount, InstructionView},
    AccountView, Address, ProgramResult,
};
use shared::programs::TRANSFER_HOOK_PROGRAM_ID;

pub const TOKEN_2022_ID: Address = Address::new_from_array(pinocchio_pubkey::pubkey!(
    "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
));
pub const TRANSFER_HOOK_ID: Address = Address::new_from_array(TRANSFER_HOOK_PROGRAM_ID);

const MINT_BASE_LEN: usize = 82;
const TOKEN_2022_EXTENDED_ACCOUNT_BASE_LEN: usize = 165;
const TOKEN_2022_ACCOUNT_TYPE_OFFSET: usize = TOKEN_2022_EXTENDED_ACCOUNT_BASE_LEN;
const TOKEN_2022_TLV_START: usize = TOKEN_2022_ACCOUNT_TYPE_OFFSET + 1;
const TOKEN_2022_EXTENSION_HEADER_LEN: usize = 4;
const MINT_ACCOUNT_TYPE_BYTE: u8 = 1;
const TRANSFER_HOOK_EXTENSION_TYPE: u16 = 14;
const TRANSFER_HOOK_EXTENSION_LEN: usize = 64;
const TRANSFER_HOOK_PROGRAM_ID_OFFSET: usize = 32;

pub fn initialize_mint2(
    mint: &AccountView,
    decimals: u8,
    mint_authority: &Address,
) -> ProgramResult {
    let instruction_accounts = [InstructionAccount::writable(mint.address())];
    let mut instruction_data = [0u8; 35];
    instruction_data[0] = 20;
    instruction_data[1] = decimals;
    instruction_data[2..34].copy_from_slice(mint_authority.as_ref());
    instruction_data[34] = 0;

    let instruction = InstructionView {
        program_id: &TOKEN_2022_ID,
        accounts: &instruction_accounts,
        data: &instruction_data,
    };
    let account_views = [mint];

    invoke(&instruction, &account_views)
}

pub fn assert_canonical_transfer_hook_extension(
    mint: &AccountView,
    expected_authority: &Address,
) -> ProgramResult {
    let data = mint.try_borrow()?;
    let (authority, hook_program) = transfer_hook_config(&data)?;
    if authority != *expected_authority {
        return Err(ProgramError::InvalidAccountData);
    }
    if hook_program != TRANSFER_HOOK_ID {
        return Err(ProgramError::InvalidAccountData);
    }

    Ok(())
}

fn transfer_hook_config(data: &[u8]) -> Result<(Address, Address), ProgramError> {
    if data.len() <= TOKEN_2022_TLV_START {
        return Err(ProgramError::InvalidAccountData);
    }
    if data[MINT_BASE_LEN..TOKEN_2022_ACCOUNT_TYPE_OFFSET]
        .iter()
        .any(|byte| *byte != 0)
    {
        return Err(ProgramError::InvalidAccountData);
    }
    if data[TOKEN_2022_ACCOUNT_TYPE_OFFSET] != MINT_ACCOUNT_TYPE_BYTE {
        return Err(ProgramError::InvalidAccountData);
    }

    let mut cursor = TOKEN_2022_TLV_START;
    while cursor < data.len() {
        if cursor + TOKEN_2022_EXTENSION_HEADER_LEN > data.len() {
            return Err(ProgramError::InvalidAccountData);
        }
        let extension_type = u16::from_le_bytes([data[cursor], data[cursor + 1]]);
        let extension_len = u16::from_le_bytes([data[cursor + 2], data[cursor + 3]]) as usize;
        cursor = cursor
            .checked_add(TOKEN_2022_EXTENSION_HEADER_LEN)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        let extension_end = cursor
            .checked_add(extension_len)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        if extension_end > data.len() {
            return Err(ProgramError::InvalidAccountData);
        }

        if extension_type == TRANSFER_HOOK_EXTENSION_TYPE {
            if extension_len != TRANSFER_HOOK_EXTENSION_LEN {
                return Err(ProgramError::InvalidAccountData);
            }
            let mut authority = [0u8; 32];
            authority.copy_from_slice(&data[cursor..cursor + 32]);
            let program_id_start = cursor + TRANSFER_HOOK_PROGRAM_ID_OFFSET;
            let program_id_end = program_id_start
                .checked_add(32)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            let mut program_id = [0u8; 32];
            program_id.copy_from_slice(&data[program_id_start..program_id_end]);
            return Ok((
                Address::new_from_array(authority),
                Address::new_from_array(program_id),
            ));
        }

        cursor = extension_end;
    }

    Err(ProgramError::InvalidAccountData)
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

pub fn burn(
    source: &AccountView,
    mint: &AccountView,
    authority: &AccountView,
    amount: u64,
) -> ProgramResult {
    if amount == 0 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let instruction_accounts = [
        InstructionAccount::writable(source.address()),
        InstructionAccount::writable(mint.address()),
        InstructionAccount::readonly_signer(authority.address()),
    ];
    let mut instruction_data = [0u8; 9];
    instruction_data[0] = 8;
    instruction_data[1..9].copy_from_slice(&amount.to_le_bytes());

    let instruction = InstructionView {
        program_id: &TOKEN_2022_ID,
        accounts: &instruction_accounts,
        data: &instruction_data,
    };
    let account_views = [source, mint, authority];

    invoke(&instruction, &account_views)
}

#[cfg(test)]
mod tests {
    use super::{
        assert_canonical_transfer_hook_extension, transfer_hook_config, MINT_ACCOUNT_TYPE_BYTE,
        MINT_BASE_LEN, TOKEN_2022_ACCOUNT_TYPE_OFFSET, TOKEN_2022_EXTENSION_HEADER_LEN,
        TOKEN_2022_TLV_START, TRANSFER_HOOK_EXTENSION_LEN, TRANSFER_HOOK_EXTENSION_TYPE,
        TRANSFER_HOOK_ID,
    };
    use pinocchio::{
        account::{RuntimeAccount, NOT_BORROWED},
        error::ProgramError,
        AccountView, Address, ProgramResult,
    };
    use std::{mem::size_of, vec, vec::Vec};

    #[test]
    fn transfer_hook_parser_accepts_real_mint_layout_with_canonical_hook() {
        let authority = Address::new_from_array([7; 32]);
        let data = mint_data_with_hook(authority, TRANSFER_HOOK_ID);
        assert_eq!(
            transfer_hook_config(&data),
            Ok((authority, TRANSFER_HOOK_ID))
        );
    }

    #[test]
    fn canonical_assertion_enforces_expected_authority_and_hook_program() {
        let expected_authority = Address::new_from_array([7; 32]);
        let wrong_authority = Address::new_from_array([8; 32]);
        let wrong_program = Address::new_from_array([9; 32]);

        assert_eq!(
            assert_canonical_for_data(
                mint_data_with_hook(expected_authority, TRANSFER_HOOK_ID),
                &expected_authority,
            ),
            Ok(())
        );
        assert_eq!(
            assert_canonical_for_data(
                mint_data_with_hook(wrong_authority, TRANSFER_HOOK_ID),
                &expected_authority,
            ),
            Err(ProgramError::InvalidAccountData)
        );
        assert_eq!(
            assert_canonical_for_data(
                mint_data_with_hook(expected_authority, wrong_program),
                &expected_authority,
            ),
            Err(ProgramError::InvalidAccountData)
        );
    }

    #[test]
    fn transfer_hook_parser_rejects_old_artificial_mint_boundary() {
        let authority = Address::new_from_array([7; 32]);
        let mut data = vec![0u8; TOKEN_2022_TLV_START + TOKEN_2022_EXTENSION_HEADER_LEN];
        data[TOKEN_2022_ACCOUNT_TYPE_OFFSET] = MINT_ACCOUNT_TYPE_BYTE;
        write_transfer_hook_at(&mut data, MINT_BASE_LEN, authority, TRANSFER_HOOK_ID);

        assert_eq!(
            transfer_hook_config(&data),
            Err(ProgramError::InvalidAccountData)
        );
    }

    #[test]
    fn transfer_hook_parser_rejects_missing_or_unrelated_only_tlv() {
        assert_eq!(
            transfer_hook_config(&[0u8; 82]),
            Err(ProgramError::InvalidAccountData)
        );

        let authority = Address::new_from_array([7; 32]);
        let data = mint_data_with_hook(authority, Address::new_from_array([9; 32]));
        assert_eq!(
            transfer_hook_config(&data),
            Ok((authority, Address::new_from_array([9; 32])))
        );

        let data = mint_data_with_tlvs(&[tlv_entry(7, &[1, 2, 3, 4])]);
        assert_eq!(
            transfer_hook_config(&data),
            Err(ProgramError::InvalidAccountData)
        );
    }

    #[test]
    fn transfer_hook_parser_enforces_mint_account_type() {
        let authority = Address::new_from_array([7; 32]);

        for account_type in [0, 2, 255] {
            let mut data = mint_data_with_hook(authority, TRANSFER_HOOK_ID);
            data[TOKEN_2022_ACCOUNT_TYPE_OFFSET] = account_type;
            assert_eq!(
                transfer_hook_config(&data),
                Err(ProgramError::InvalidAccountData),
                "account type {account_type} must be rejected",
            );
        }
    }

    #[test]
    fn transfer_hook_parser_enforces_zero_mint_padding() {
        let authority = Address::new_from_array([7; 32]);

        let data = mint_data_with_hook(authority, TRANSFER_HOOK_ID);
        assert!(data[MINT_BASE_LEN..TOKEN_2022_ACCOUNT_TYPE_OFFSET]
            .iter()
            .all(|byte| *byte == 0));
        assert_eq!(
            transfer_hook_config(&data),
            Ok((authority, TRANSFER_HOOK_ID))
        );

        for offset in [MINT_BASE_LEN, 120, TOKEN_2022_ACCOUNT_TYPE_OFFSET - 1] {
            let mut malformed = mint_data_with_hook(authority, TRANSFER_HOOK_ID);
            malformed[offset] = 1;
            assert_eq!(
                transfer_hook_config(&malformed),
                Err(ProgramError::InvalidAccountData),
                "non-zero padding at offset {offset} must be rejected",
            );
        }
    }

    #[test]
    fn transfer_hook_parser_skips_unrelated_tlv_entries_safely() {
        let authority = Address::new_from_array([7; 32]);
        let data = mint_data_with_tlvs(&[
            tlv_entry(3, &[1, 2, 3]),
            tlv_entry(9, &[]),
            transfer_hook_entry(authority, TRANSFER_HOOK_ID),
        ]);
        assert_eq!(
            transfer_hook_config(&data),
            Ok((authority, TRANSFER_HOOK_ID))
        );
    }

    #[test]
    fn transfer_hook_parser_rejects_malformed_tlv_data() {
        let authority = Address::new_from_array([7; 32]);

        let mut truncated_tail = mint_data_with_tlvs(&[tlv_entry(7, &[1, 2])]);
        truncated_tail.push(0);
        assert_eq!(
            transfer_hook_config(&truncated_tail),
            Err(ProgramError::InvalidAccountData)
        );

        let wrong_len = mint_data_with_tlvs(&[tlv_entry(TRANSFER_HOOK_EXTENSION_TYPE, &[0; 63])]);
        assert_eq!(
            transfer_hook_config(&wrong_len),
            Err(ProgramError::InvalidAccountData)
        );

        let mut truncated_payload = mint_header();
        truncated_payload[TOKEN_2022_TLV_START..TOKEN_2022_TLV_START + 2]
            .copy_from_slice(&TRANSFER_HOOK_EXTENSION_TYPE.to_le_bytes());
        truncated_payload[TOKEN_2022_TLV_START + 2..TOKEN_2022_TLV_START + 4]
            .copy_from_slice(&(TRANSFER_HOOK_EXTENSION_LEN as u16).to_le_bytes());
        truncated_payload.extend_from_slice(authority.as_ref());
        assert_eq!(
            transfer_hook_config(&truncated_payload),
            Err(ProgramError::InvalidAccountData)
        );

        let mut oversized = mint_header();
        oversized[TOKEN_2022_TLV_START..TOKEN_2022_TLV_START + 2]
            .copy_from_slice(&7u16.to_le_bytes());
        oversized[TOKEN_2022_TLV_START + 2..TOKEN_2022_TLV_START + 4]
            .copy_from_slice(&u16::MAX.to_le_bytes());
        assert_eq!(
            transfer_hook_config(&oversized),
            Err(ProgramError::InvalidAccountData)
        );
    }

    fn mint_data_with_hook(authority: Address, program_id: Address) -> Vec<u8> {
        mint_data_with_tlvs(&[transfer_hook_entry(authority, program_id)])
    }

    fn mint_header() -> Vec<u8> {
        let mut data = vec![0u8; TOKEN_2022_TLV_START + TOKEN_2022_EXTENSION_HEADER_LEN];
        data[TOKEN_2022_ACCOUNT_TYPE_OFFSET] = MINT_ACCOUNT_TYPE_BYTE;
        data
    }

    fn mint_data_with_tlvs(entries: &[Vec<u8>]) -> Vec<u8> {
        let payload_len = entries.iter().map(Vec::len).sum::<usize>();
        let mut data = vec![0u8; TOKEN_2022_TLV_START + payload_len];
        data[TOKEN_2022_ACCOUNT_TYPE_OFFSET] = MINT_ACCOUNT_TYPE_BYTE;
        let mut cursor = TOKEN_2022_TLV_START;
        for entry in entries {
            data[cursor..cursor + entry.len()].copy_from_slice(entry);
            cursor += entry.len();
        }
        data
    }

    fn transfer_hook_entry(authority: Address, program_id: Address) -> Vec<u8> {
        let mut entry = vec![0u8; TOKEN_2022_EXTENSION_HEADER_LEN + TRANSFER_HOOK_EXTENSION_LEN];
        entry[0..2].copy_from_slice(&TRANSFER_HOOK_EXTENSION_TYPE.to_le_bytes());
        entry[2..4].copy_from_slice(&(TRANSFER_HOOK_EXTENSION_LEN as u16).to_le_bytes());
        entry[4..36].copy_from_slice(authority.as_ref());
        entry[36..68].copy_from_slice(program_id.as_ref());
        entry
    }

    fn tlv_entry(extension_type: u16, payload: &[u8]) -> Vec<u8> {
        let mut entry = vec![0u8; TOKEN_2022_EXTENSION_HEADER_LEN + payload.len()];
        entry[0..2].copy_from_slice(&extension_type.to_le_bytes());
        entry[2..4].copy_from_slice(&(payload.len() as u16).to_le_bytes());
        entry[4..].copy_from_slice(payload);
        entry
    }

    fn write_transfer_hook_at(
        data: &mut [u8],
        offset: usize,
        authority: Address,
        program_id: Address,
    ) {
        data[offset..offset + 2].copy_from_slice(&TRANSFER_HOOK_EXTENSION_TYPE.to_le_bytes());
        data[offset + 2..offset + 4]
            .copy_from_slice(&(TRANSFER_HOOK_EXTENSION_LEN as u16).to_le_bytes());
        data[offset + 4..offset + 36].copy_from_slice(authority.as_ref());
        data[offset + 36..offset + 68].copy_from_slice(program_id.as_ref());
    }

    fn assert_canonical_for_data(data: Vec<u8>, expected_authority: &Address) -> ProgramResult {
        let (_backing, mint) = account_view_with_data(data);
        assert_canonical_transfer_hook_extension(&mint, expected_authority)
    }

    fn account_view_with_data(data: Vec<u8>) -> (Vec<u64>, AccountView) {
        let header_len = size_of::<RuntimeAccount>();
        let total_len = header_len + data.len();
        let words = total_len.div_ceil(size_of::<u64>());
        let mut backing = vec![0u64; words];
        let raw = backing.as_mut_ptr().cast::<RuntimeAccount>();

        unsafe {
            raw.write(RuntimeAccount {
                borrow_state: NOT_BORROWED,
                is_signer: 0,
                is_writable: 0,
                executable: 0,
                padding: [0; 4],
                address: Address::new_from_array([42; 32]),
                owner: super::TOKEN_2022_ID,
                lamports: 0,
                data_len: data.len() as u64,
            });
            let data_ptr = backing.as_mut_ptr().cast::<u8>().add(header_len);
            data_ptr.copy_from_nonoverlapping(data.as_ptr(), data.len());
            let view = AccountView::new_unchecked(raw);
            (backing, view)
        }
    }
}
