#![no_std]
#![allow(unexpected_cfgs)]

extern crate alloc;

#[cfg(not(target_os = "solana"))]
extern crate std;

pub mod entrypoint;
pub mod instructions;
pub mod math;
mod soul_generator_cpi;
pub mod state;
mod token_2022;

pub use shared::programs::SOUL_GENERATOR_PROGRAM_ID;

pinocchio_pubkey::declare_id!("B6AhJJSYMbnrxLbS6nTBuDowADQJxdF7hQSTrepFFk3C");

// Mainnet binary gate sentinel — present in all canonical builds.
// scripts/check-mainnet-build.sh greps for this string in the .so.
// Do NOT remove or rename; the CI gate depends on it.
#[used]
static EXP_CURVE_SENTINEL: &[u8] = b"EXP_CURVE_V1_K_21M_S_500SOL";
