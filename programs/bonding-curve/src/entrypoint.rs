use pinocchio::{AccountView, Address, ProgramResult};

#[cfg(target_os = "solana")]
pinocchio::default_allocator!();

#[cfg(target_os = "solana")]
pinocchio::nostd_panic_handler!();

#[cfg(target_os = "solana")]
pinocchio::program_entrypoint!(process_instruction);

#[inline(never)]
pub fn process_instruction(
    program_id: &Address,
    accounts: &mut [AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    crate::instructions::dispatch(program_id, accounts, instruction_data)
}
