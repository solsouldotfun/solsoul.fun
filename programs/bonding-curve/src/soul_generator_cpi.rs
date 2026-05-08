use pinocchio::{
    cpi::{invoke_signed, Seed, Signer},
    instruction::{InstructionAccount, InstructionView},
    AccountView, Address, ProgramResult,
};
use shared::programs::SOUL_GENERATOR_PROGRAM_ID;

pub const SOUL_GENERATOR_ID: Address = Address::new_from_array(SOUL_GENERATOR_PROGRAM_ID);
pub const SOUL_SEED: &[u8] = b"soul";

const GENERATE_SOUL_DISCRIMINATOR: u8 = 1;
const GENERATE_SOUL_IX_LEN: usize = 18;

#[allow(clippy::too_many_arguments)]
pub fn generate_soul_signed(
    soul: &AccountView,
    payer_authority: &AccountView,
    recent_blockhash_sysvar: &AccountView,
    holder_token_account: &AccountView,
    trader_wallet: &AccountView,
    swap_amount: u64,
    provenance_token_amount: u64,
    is_buy: bool,
    global_config: &AccountView,
    payer_authority_seeds: &[Seed],
) -> ProgramResult {
    let instruction_accounts = [
        InstructionAccount::writable(soul.address()),
        InstructionAccount::readonly_signer(payer_authority.address()),
        InstructionAccount::readonly(recent_blockhash_sysvar.address()),
        InstructionAccount::readonly(holder_token_account.address()),
        InstructionAccount::readonly(trader_wallet.address()),
        InstructionAccount::readonly(global_config.address()),
    ];
    let mut instruction_data = [0u8; GENERATE_SOUL_IX_LEN];
    instruction_data[0] = GENERATE_SOUL_DISCRIMINATOR;
    instruction_data[1..9].copy_from_slice(&swap_amount.to_le_bytes());
    instruction_data[9] = u8::from(is_buy);
    instruction_data[10..18].copy_from_slice(&provenance_token_amount.to_le_bytes());

    let instruction = InstructionView {
        program_id: &SOUL_GENERATOR_ID,
        accounts: &instruction_accounts,
        data: &instruction_data,
    };
    let account_views = [
        soul,
        payer_authority,
        recent_blockhash_sysvar,
        holder_token_account,
        trader_wallet,
        global_config,
    ];
    let signer = Signer::from(payer_authority_seeds);

    invoke_signed(&instruction, &account_views, &[signer])
}

#[cfg(test)]
mod tests {
    use super::SOUL_GENERATOR_ID;
    use pinocchio::Address;

    #[test]
    fn cpi_program_id_matches_devnet_soul_generator() {
        let expected = Address::new_from_array(pinocchio_pubkey::pubkey!(
            "34erFyVvAiLsTwDivcauQCJnVX16ZjEwgJ6tEs5NeaMZ"
        ));

        assert_eq!(SOUL_GENERATOR_ID, expected);
    }
}
