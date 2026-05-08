#![no_std]
#![allow(unexpected_cfgs)]

#[cfg(not(target_os = "solana"))]
extern crate std;

/// Shared SolSoul program primitives.
pub const SOLSOUL_SHARED_VERSION: &str = "0.1.0";

pub mod amm;
pub mod boundary;
pub mod geppetto;
pub mod pause;
pub mod programs;
