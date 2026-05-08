pub mod global_config;

use crate::math::CurveError;
use pinocchio::{error::ProgramError, Address, ProgramResult};

pub const CURVE_SEED: &[u8] = b"curve";
pub const VAULT_SEED: &[u8] = b"vault";
pub const TREASURY_SEED: &[u8] = b"treasury";
pub const TOKEN_DECIMALS: u8 = 6;
pub type Pubkey = Address;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct BondingCurveAccount {
    pub mint: Pubkey,
    pub cumulative_sol: u64,
    pub total_minted: u64,
    pub self_deprecated: bool,
    pub last_interaction_slot: u64,
}

impl BondingCurveAccount {
    pub const MINT_OFFSET: usize = 0;
    pub const CUMULATIVE_SOL_OFFSET: usize = Self::MINT_OFFSET + 32;
    pub const TOTAL_MINTED_OFFSET: usize = Self::CUMULATIVE_SOL_OFFSET + 8;
    pub const SELF_DEPRECATED_OFFSET: usize = Self::TOTAL_MINTED_OFFSET + 8;
    pub const LAST_INTERACTION_SLOT_OFFSET: usize = Self::SELF_DEPRECATED_OFFSET + 1;
    pub const LEN: usize = Self::LAST_INTERACTION_SLOT_OFFSET + 8;

    pub const fn initialized(mint: Pubkey) -> Self {
        Self {
            mint,
            cumulative_sol: 0,
            total_minted: 0,
            self_deprecated: false,
            last_interaction_slot: 0,
        }
    }

    pub fn unpack(data: &[u8]) -> Result<Self, ProgramError> {
        if data.len() < Self::LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }
        let mut mint = [0u8; 32];
        mint.copy_from_slice(&data[Self::MINT_OFFSET..Self::CUMULATIVE_SOL_OFFSET]);
        let mut cumulative_sol = [0u8; 8];
        cumulative_sol
            .copy_from_slice(&data[Self::CUMULATIVE_SOL_OFFSET..Self::TOTAL_MINTED_OFFSET]);
        let mut total_minted = [0u8; 8];
        total_minted
            .copy_from_slice(&data[Self::TOTAL_MINTED_OFFSET..Self::SELF_DEPRECATED_OFFSET]);
        let self_deprecated = match data[Self::SELF_DEPRECATED_OFFSET] {
            0 => false,
            1 => true,
            _ => return Err(ProgramError::InvalidAccountData),
        };
        let mut last_interaction_slot = [0u8; 8];
        last_interaction_slot.copy_from_slice(&data[Self::LAST_INTERACTION_SLOT_OFFSET..Self::LEN]);
        Ok(Self {
            mint: Pubkey::new_from_array(mint),
            cumulative_sol: u64::from_le_bytes(cumulative_sol),
            total_minted: u64::from_le_bytes(total_minted),
            self_deprecated,
            last_interaction_slot: u64::from_le_bytes(last_interaction_slot),
        })
    }

    pub fn pack(&self, data: &mut [u8]) -> Result<(), ProgramError> {
        if data.len() < Self::LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }
        data[Self::MINT_OFFSET..Self::CUMULATIVE_SOL_OFFSET].copy_from_slice(self.mint.as_ref());
        data[Self::CUMULATIVE_SOL_OFFSET..Self::TOTAL_MINTED_OFFSET]
            .copy_from_slice(&self.cumulative_sol.to_le_bytes());
        data[Self::TOTAL_MINTED_OFFSET..Self::SELF_DEPRECATED_OFFSET]
            .copy_from_slice(&self.total_minted.to_le_bytes());
        data[Self::SELF_DEPRECATED_OFFSET] = u8::from(self.self_deprecated);
        data[Self::LAST_INTERACTION_SLOT_OFFSET..Self::LEN]
            .copy_from_slice(&self.last_interaction_slot.to_le_bytes());
        Ok(())
    }

    pub fn reject_if_self_deprecated(&self) -> ProgramResult {
        if self.self_deprecated {
            return Err(CurveError::SelfDeprecated.into());
        }
        Ok(())
    }

    pub fn record_buy(&mut self, sol_in: u64, token_out: u64) -> ProgramResult {
        self.cumulative_sol = self
            .cumulative_sol
            .checked_add(sol_in)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        self.total_minted = self
            .total_minted
            .checked_add(token_out)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        if self.total_minted >= crate::math::SELF_DEPRECATED_THRESHOLD {
            self.self_deprecated = true;
        }
        Ok(())
    }

    pub fn record_sell(&mut self, sol_out: u64, token_in: u64) -> ProgramResult {
        self.cumulative_sol = self
            .cumulative_sol
            .checked_sub(sol_out)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        self.total_minted = self
            .total_minted
            .checked_sub(token_in)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        Ok(())
    }

    pub fn update_interaction_slot(&mut self, slot: u64) {
        self.last_interaction_slot = slot;
    }
}

pub fn derive_curve_address(mint: &Pubkey, program_id: &Pubkey) -> Pubkey {
    Pubkey::derive_address(&[CURVE_SEED, mint.as_ref()], None, program_id)
}

pub fn derive_vault_address(mint: &Pubkey, program_id: &Pubkey) -> Pubkey {
    Pubkey::derive_address(&[VAULT_SEED, mint.as_ref()], None, program_id)
}

pub fn derive_treasury_address(program_id: &Pubkey) -> Pubkey {
    Pubkey::derive_address(&[TREASURY_SEED], None, program_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::math::SELF_DEPRECATED_THRESHOLD;

    #[test]
    fn layout() {
        assert_eq!(BondingCurveAccount::LEN, 57);
    }

    #[test]
    fn roundtrip() {
        let state = BondingCurveAccount::initialized(Pubkey::new_from_array([3; 32]));
        let mut data = [0u8; BondingCurveAccount::LEN];
        state.pack(&mut data).expect("pack succeeds");
        let unpacked = BondingCurveAccount::unpack(&data).expect("unpack succeeds");
        assert_eq!(unpacked, state);
    }

    #[test]
    fn threshold() {
        let mut state = BondingCurveAccount::initialized(Pubkey::new_from_array([3; 32]));
        state.total_minted = SELF_DEPRECATED_THRESHOLD - 1;
        state.record_buy(1, 2).expect("record succeeds");
        assert!(state.self_deprecated);
    }

    #[test]
    fn deprecated_guard() {
        let mut state = BondingCurveAccount::initialized(Pubkey::new_from_array([3; 32]));
        state.self_deprecated = true;
        assert_eq!(
            state.reject_if_self_deprecated(),
            Err(ProgramError::Custom(CurveError::SelfDeprecated as u32))
        );
    }

    #[test]
    fn sell_reduces() {
        let mut state = BondingCurveAccount::initialized(Pubkey::new_from_array([3; 32]));
        state.cumulative_sol = 1000;
        state.total_minted = 500;
        state.record_sell(100, 50).expect("sell succeeds");
        assert_eq!(state.cumulative_sol, 900);
        assert_eq!(state.total_minted, 450);
    }

    #[test]
    fn pdas() {
        let program_id = Pubkey::new_from_array([9; 32]);
        let mint = Pubkey::new_from_array([11; 32]);
        assert_eq!(
            derive_curve_address(&mint, &program_id),
            Pubkey::derive_address(&[CURVE_SEED, mint.as_ref()], None, &program_id)
        );
        assert_eq!(
            derive_vault_address(&mint, &program_id),
            Pubkey::derive_address(&[VAULT_SEED, mint.as_ref()], None, &program_id)
        );
        assert_eq!(
            derive_treasury_address(&program_id),
            Pubkey::derive_address(&[TREASURY_SEED], None, &program_id)
        );
    }
}
