use crate::state::{SoulAccount, MEME_SYMBOL_CAPACITY, MIN_CLAIM_BALANCE, SOUL_SEED};
use pinocchio::{
    cpi::{Seed, Signer},
    error::ProgramError,
    sysvars::rent::{ACCOUNT_STORAGE_OVERHEAD, DEFAULT_LAMPORTS_PER_BYTE},
    AccountView, Address, ProgramResult,
};
use pinocchio_system::instructions::{Allocate, Assign, CreateAccount, Transfer};
use shared::amm::TargetAmm;
use shared::geppetto::{
    assert_owned_by, assert_pda, assert_program_id, assert_signer, assert_writable,
};

pub const INITIALIZE_SOUL_CREATED_AT_LEN: usize = 8;
pub const INITIALIZE_SOUL_SYMBOL_LEN_OFFSET: usize = INITIALIZE_SOUL_CREATED_AT_LEN;
const INITIALIZE_SOUL_TARGET_AMM_DEFAULT: u8 = TargetAmm::Raydium as u8;
const MAX_PERMITTED_DATA_LENGTH: u64 = 10 * 1024 * 1024;

pub fn process(
    program_id: &Address,
    accounts: &mut [AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    let args = parse_initialize_args(instruction_data)?;

    if accounts.len() < 4 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }

    let (soul_accounts, rest) = accounts.split_at_mut(1);
    let soul = &mut soul_accounts[0];
    let mint = &rest[0];
    let authority = &rest[1];
    let system_program = &rest[2];

    assert_writable(soul)?;
    assert_pda(soul, &[SOUL_SEED, mint.address().as_ref()], program_id)?;
    assert_writable(authority)?;
    assert_signer(authority)?;
    assert_program_id(system_program, &pinocchio_system::ID)?;

    if soul.data_len() != 0 {
        return Err(ProgramError::AccountAlreadyInitialized);
    }

    let soul_seeds = [Seed::from(SOUL_SEED), Seed::from(mint.address().as_ref())];
    let soul_signers = [Signer::from(&soul_seeds)];
    allocate_pda(soul, SoulAccount::LEN, program_id, authority, &soul_signers)?;

    assert_owned_by(soul, program_id)?;

    let mut data = soul.try_borrow_mut()?;
    let account_data = &mut data[..SoulAccount::LEN];

    if account_data.iter().any(|byte| *byte != 0) {
        return Err(ProgramError::AccountAlreadyInitialized);
    }

    account_data[SoulAccount::MINT_OFFSET..SoulAccount::AUTHORITY_OFFSET]
        .copy_from_slice(mint.address().as_ref());
    account_data[SoulAccount::AUTHORITY_OFFSET..SoulAccount::CREATED_AT_OFFSET]
        .copy_from_slice(authority.address().as_ref());
    account_data[SoulAccount::CREATED_AT_OFFSET..SoulAccount::GENERATION_COUNT_OFFSET]
        .copy_from_slice(&args.created_at);
    account_data[SoulAccount::GENERATION_COUNT_OFFSET..SoulAccount::LAST_SVG_LEN_OFFSET]
        .copy_from_slice(&0u64.to_le_bytes());
    account_data[SoulAccount::LAST_SVG_LEN_OFFSET..SoulAccount::LAST_SVG_OFFSET]
        .copy_from_slice(&0u16.to_le_bytes());
    account_data[SoulAccount::LAST_SVG_OFFSET..SoulAccount::LEN].fill(0);
    account_data[SoulAccount::MIN_CLAIM_BALANCE_OFFSET..SoulAccount::CLAIM_COUNT_OFFSET]
        .copy_from_slice(&MIN_CLAIM_BALANCE.to_le_bytes());
    account_data
        [SoulAccount::MEME_SYMBOL_OFFSET..SoulAccount::MEME_SYMBOL_OFFSET + args.meme_symbol.len()]
        .copy_from_slice(args.meme_symbol);
    account_data[SoulAccount::MEME_SYMBOL_LEN_OFFSET] =
        u8::try_from(args.meme_symbol.len()).map_err(|_| ProgramError::InvalidInstructionData)?;
    account_data[SoulAccount::TARGET_AMM_OFFSET] = args.target_amm;

    Ok(())
}

struct InitializeArgs<'a> {
    created_at: [u8; INITIALIZE_SOUL_CREATED_AT_LEN],
    meme_symbol: &'a [u8],
    target_amm: u8,
}

fn parse_initialize_args(instruction_data: &[u8]) -> Result<InitializeArgs<'_>, ProgramError> {
    if instruction_data.len() == INITIALIZE_SOUL_CREATED_AT_LEN {
        let mut created_at = [0u8; INITIALIZE_SOUL_CREATED_AT_LEN];
        created_at.copy_from_slice(instruction_data);
        return Ok(InitializeArgs {
            created_at,
            meme_symbol: &[],
            target_amm: INITIALIZE_SOUL_TARGET_AMM_DEFAULT,
        });
    }

    if instruction_data.len() < INITIALIZE_SOUL_CREATED_AT_LEN + 1 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let symbol_len = usize::from(instruction_data[INITIALIZE_SOUL_SYMBOL_LEN_OFFSET]);
    let expected_len_without_target = INITIALIZE_SOUL_CREATED_AT_LEN
        .checked_add(1)
        .and_then(|len| len.checked_add(symbol_len))
        .ok_or(ProgramError::ArithmeticOverflow)?;
    let expected_len_with_target = expected_len_without_target
        .checked_add(1)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    if (instruction_data.len() != expected_len_without_target
        && instruction_data.len() != expected_len_with_target)
        || symbol_len > MEME_SYMBOL_CAPACITY
    {
        return Err(ProgramError::InvalidInstructionData);
    }

    let symbol_start = INITIALIZE_SOUL_SYMBOL_LEN_OFFSET + 1;
    let symbol_end = symbol_start
        .checked_add(symbol_len)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    let meme_symbol = &instruction_data[symbol_start..symbol_end];
    if !meme_symbol.iter().all(u8::is_ascii) {
        return Err(ProgramError::InvalidInstructionData);
    }

    let target_amm = if instruction_data.len() == expected_len_with_target {
        let target_amm = instruction_data[symbol_end];
        TargetAmm::try_from(target_amm)?;
        target_amm
    } else {
        INITIALIZE_SOUL_TARGET_AMM_DEFAULT
    };

    let mut created_at = [0u8; INITIALIZE_SOUL_CREATED_AT_LEN];
    created_at.copy_from_slice(&instruction_data[..INITIALIZE_SOUL_CREATED_AT_LEN]);

    Ok(InitializeArgs {
        created_at,
        meme_symbol,
        target_amm,
    })
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
    // Pinocchio 0.11.1's Rent sysvar wrapper exposes only
    // `try_minimum_balance`, but its private field is interpreted as an
    // already-thresholded lamports-per-byte value while the Solana runtime
    // sysvar stores lamports-per-byte-year. Calling it on-chain therefore
    // returns half of `solana_program::rent::Rent::default().minimum_balance`.
    // Compute the default Solana formula directly so CreateAccount receives
    // exactly the runtime rent-exempt balance without doubling an API result.
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
mod tests {
    use super::parse_initialize_args;
    use crate::state::MEME_SYMBOL_CAPACITY;
    use pinocchio::error::ProgramError;
    use shared::amm::TargetAmm;

    #[test]
    fn parse_initialize_args_accepts_legacy_and_symbol_forms() {
        let created_at = 1_714_200_000i64.to_le_bytes();
        let legacy = parse_initialize_args(&created_at).expect("legacy args parse");
        assert_eq!(legacy.created_at, created_at);
        assert!(legacy.meme_symbol.is_empty());
        assert_eq!(legacy.target_amm, TargetAmm::Raydium as u8);

        let mut with_symbol = created_at.to_vec();
        with_symbol.push(4);
        with_symbol.extend_from_slice(b"DOGE");
        let parsed = parse_initialize_args(&with_symbol).expect("symbol args parse");
        assert_eq!(parsed.created_at, created_at);
        assert_eq!(parsed.meme_symbol, b"DOGE");
        assert_eq!(parsed.target_amm, TargetAmm::Raydium as u8);
    }

    #[test]
    fn parse_initialize_args_accepts_optional_target_amm() {
        let created_at = 1_714_200_000i64.to_le_bytes();

        let mut without_symbol = created_at.to_vec();
        without_symbol.push(0);
        without_symbol.push(TargetAmm::Pump as u8);
        let parsed = parse_initialize_args(&without_symbol).expect("target-only args parse");
        assert!(parsed.meme_symbol.is_empty());
        assert_eq!(parsed.target_amm, TargetAmm::Pump as u8);

        let mut with_symbol = created_at.to_vec();
        with_symbol.push(4);
        with_symbol.extend_from_slice(b"DOGE");
        with_symbol.push(TargetAmm::Meteora as u8);
        let parsed = parse_initialize_args(&with_symbol).expect("symbol plus target args parse");
        assert_eq!(parsed.meme_symbol, b"DOGE");
        assert_eq!(parsed.target_amm, TargetAmm::Meteora as u8);
    }

    #[test]
    fn parse_initialize_args_rejects_oversize_or_non_ascii_symbol() {
        let mut oversize = 1_714_200_000i64.to_le_bytes().to_vec();
        oversize.push((MEME_SYMBOL_CAPACITY + 1) as u8);
        oversize.extend_from_slice(&[b'A'; MEME_SYMBOL_CAPACITY + 1]);
        assert_eq!(
            parse_initialize_args(&oversize).map(|_| ()),
            Err(ProgramError::InvalidInstructionData)
        );

        let mut non_ascii = 1_714_200_000i64.to_le_bytes().to_vec();
        non_ascii.push(1);
        non_ascii.push(0xff);
        assert_eq!(
            parse_initialize_args(&non_ascii).map(|_| ()),
            Err(ProgramError::InvalidInstructionData)
        );

        let mut invalid_target = 1_714_200_000i64.to_le_bytes().to_vec();
        invalid_target.push(0);
        invalid_target.push(3);
        assert_eq!(
            parse_initialize_args(&invalid_target).map(|_| ()),
            Err(ProgramError::InvalidArgument)
        );
    }
}
