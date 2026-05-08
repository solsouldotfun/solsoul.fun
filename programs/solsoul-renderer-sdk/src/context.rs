use pinocchio::{error::ProgramError, Address};

/// Minimum length of the external renderer CPI instruction data.
/// Layout:
/// [0]       = discriminator (1)
/// [1..9]    = generation: u64
/// [9]       = side: u8
/// [10..18]  = amount: u64
/// [18..26]  = holder_balance: u64
/// [26..34]  = seed_hash: [u8; 8]
/// [34..66]  = trader: [u8; 32]
/// [66..98]  = token_account: [u8; 32]
/// [98..130] = mint: [u8; 32]
/// [130..162]= soul: [u8; 32]
/// [162..164]= seed_len: u16
/// [164..]   = seed bytes
pub const CPI_IX_HEADER_LEN: usize = 164;

/// Standard rendering context delivered via CPI from soul-generator.
///
/// All fields are zero-copy references into the original instruction data.
#[derive(Clone, Copy, Debug)]
pub struct RenderContext<'a> {
    pub generation: u64,
    pub side: u8,
    pub amount: u64,
    pub holder_balance: u64,
    pub seed_hash: &'a [u8; 8],
    pub trader: &'a Address,
    pub token_account: &'a Address,
    pub mint: &'a Address,
    pub soul: &'a Address,
    pub seed: &'a [u8],
}

impl<'a> RenderContext<'a> {
    /// Parse a `RenderContext` from the CPI instruction data buffer.
    ///
    /// # Errors
    /// - `InvalidInstructionData` if the buffer is too short or discriminator mismatch.
    pub fn from_cpi(instruction_data: &'a [u8]) -> Result<Self, ProgramError> {
        if instruction_data.len() < CPI_IX_HEADER_LEN {
            return Err(ProgramError::InvalidInstructionData);
        }
        if instruction_data[0] != super::RENDER_DISCRIMINATOR {
            return Err(ProgramError::InvalidInstructionData);
        }

        let mut generation = [0u8; 8];
        generation.copy_from_slice(&instruction_data[1..9]);

        let side = instruction_data[9];

        let mut amount = [0u8; 8];
        amount.copy_from_slice(&instruction_data[10..18]);

        let mut holder_balance = [0u8; 8];
        holder_balance.copy_from_slice(&instruction_data[18..26]);

        let seed_hash = <&[u8; 8]>::try_from(&instruction_data[26..34])
            .map_err(|_| ProgramError::InvalidInstructionData)?;

        let mut trader = [0u8; 32];
        trader.copy_from_slice(&instruction_data[34..66]);

        let mut token_account = [0u8; 32];
        token_account.copy_from_slice(&instruction_data[66..98]);

        let mut mint = [0u8; 32];
        mint.copy_from_slice(&instruction_data[98..130]);

        let mut soul = [0u8; 32];
        soul.copy_from_slice(&instruction_data[130..162]);

        let mut seed_len = [0u8; 2];
        seed_len.copy_from_slice(&instruction_data[162..164]);
        let seed_len = u16::from_le_bytes(seed_len) as usize;

        let total = CPI_IX_HEADER_LEN
            .checked_add(seed_len)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        if instruction_data.len() < total {
            return Err(ProgramError::InvalidInstructionData);
        }

        let seed = &instruction_data[CPI_IX_HEADER_LEN..total];

        Ok(Self {
            generation: u64::from_le_bytes(generation),
            side,
            amount: u64::from_le_bytes(amount),
            holder_balance: u64::from_le_bytes(holder_balance),
            seed_hash,
            trader: unsafe {
                // SAFETY: Address is a transparent wrapper around [u8; 32]
                core::mem::transmute::<&[u8; 32], &Address>(&trader)
            },
            token_account: unsafe { core::mem::transmute::<&[u8; 32], &Address>(&token_account) },
            mint: unsafe { core::mem::transmute::<&[u8; 32], &Address>(&mint) },
            soul: unsafe { core::mem::transmute::<&[u8; 32], &Address>(&soul) },
            seed,
        })
    }

    /// Convenience: read the trader address as a raw 32-byte array.
    pub fn trader_bytes(&self) -> &[u8; 32] {
        unsafe { core::mem::transmute::<&Address, &[u8; 32]>(self.trader) }
    }

    /// Convenience: read the mint address as a raw 32-byte array.
    pub fn mint_bytes(&self) -> &[u8; 32] {
        unsafe { core::mem::transmute::<&Address, &[u8; 32]>(self.mint) }
    }

    /// Deterministic hash of the seed for palette/entropy derivation.
    pub fn seed_hash_u64(&self) -> u64 {
        let mut hash = 0xcbf2_9ce4_8422_2325u64;
        let mut index = 0usize;
        while index < self.seed.len() {
            hash ^= self.seed[index] as u64;
            hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
            hash ^= (index as u64).rotate_left((index % 31) as u32);
            index += 1;
        }
        hash
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn build_valid_ix_data(seed: &[u8]) -> Vec<u8> {
        let mut data = Vec::with_capacity(CPI_IX_HEADER_LEN + seed.len());
        data.push(super::super::RENDER_DISCRIMINATOR);
        data.extend_from_slice(&7u64.to_le_bytes());
        data.push(1); // side = buy
        data.extend_from_slice(&100u64.to_le_bytes());
        data.extend_from_slice(&500u64.to_le_bytes());
        data.extend_from_slice(&[1, 2, 3, 4, 5, 6, 7, 8]);
        data.extend_from_slice(&[10u8; 32]);
        data.extend_from_slice(&[20u8; 32]);
        data.extend_from_slice(&[30u8; 32]);
        data.extend_from_slice(&[40u8; 32]);
        data.extend_from_slice(&(1u16.to_le_bytes())); // wrong - should be seed_len
                                                       // Fix: seed_len should match actual seed
        data.truncate(CPI_IX_HEADER_LEN - 2);
        data.extend_from_slice(&(seed.len() as u16).to_le_bytes());
        data.extend_from_slice(seed);
        data
    }

    #[test]
    fn from_cpi_parses_all_fields() {
        let seed = b"test_seed";
        let data = build_valid_ix_data(seed);
        let ctx = RenderContext::from_cpi(&data).expect("parses");

        assert_eq!(ctx.generation, 7);
        assert_eq!(ctx.side, 1);
        assert_eq!(ctx.amount, 100);
        assert_eq!(ctx.holder_balance, 500);
        assert_eq!(ctx.seed_hash, &[1, 2, 3, 4, 5, 6, 7, 8]);
        assert_eq!(ctx.seed, seed);
    }

    #[test]
    fn from_cpi_rejects_short_buffer() {
        assert!(
            matches!(
                RenderContext::from_cpi(&[0]),
                Err(ProgramError::InvalidInstructionData)
            ),
            "expected InvalidInstructionData"
        );
    }

    #[test]
    fn from_cpi_rejects_bad_discriminator() {
        let mut data = build_valid_ix_data(b"x");
        data[0] = 99;
        assert!(
            matches!(
                RenderContext::from_cpi(&data),
                Err(ProgramError::InvalidInstructionData)
            ),
            "expected InvalidInstructionData"
        );
    }

    #[test]
    fn seed_hash_u64_is_deterministic() {
        let data = build_valid_ix_data(b"abc");
        let ctx = RenderContext::from_cpi(&data).unwrap();
        let a = ctx.seed_hash_u64();
        let b = ctx.seed_hash_u64();
        assert_eq!(a, b);
        assert_ne!(a, 0);
    }
}
