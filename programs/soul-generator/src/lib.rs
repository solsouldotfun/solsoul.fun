#![no_std]
#![allow(unexpected_cfgs)]

extern crate alloc;
#[cfg(not(target_os = "solana"))]
extern crate std;

pub mod engine;
pub mod entrypoint;
pub mod instructions;
pub mod state;
pub mod svg;
pub mod token_2022;

pub use shared::programs::SOUL_GENERATOR_PROGRAM_ID;

pub const ID: [u8; 32] = SOUL_GENERATOR_PROGRAM_ID;

#[inline]
pub fn check_id(id: &[u8; 32]) -> bool {
    id == &ID
}

#[inline]
pub const fn id() -> [u8; 32] {
    ID
}

#[cfg(test)]
mod tests {
    #[test]
    fn declared_program_id_matches_devnet_deployment() {
        let expected = pinocchio_pubkey::pubkey!("34erFyVvAiLsTwDivcauQCJnVX16ZjEwgJ6tEs5NeaMZ");

        assert_eq!(crate::id(), expected);
    }
}
