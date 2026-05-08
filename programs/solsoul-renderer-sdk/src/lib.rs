//! # SolSoul Renderer SDK
//!
//! Build external renderer programs for the SolSoul Engine without
//! recompiling the core soul-generator program.

#![cfg_attr(target_os = "solana", no_std)]
#![allow(unexpected_cfgs)]

#[cfg(target_os = "solana")]
pinocchio::default_allocator!();

#[cfg(target_os = "solana")]
pinocchio::nostd_panic_handler!();

// Provide `alloc` when building for the SBF target (no_std).
#[cfg(target_os = "solana")]
extern crate alloc;

pub mod color;
pub mod context;
pub mod render_buffer;
pub mod svg_writer;
pub mod validation;

pub use color::ColorPalette;
pub use context::RenderContext;
pub use render_buffer::RenderBufferWriter;
pub use svg_writer::SvgWriter;
pub use validation::validate_svg;

/// Maximum SVG output size in bytes.
pub const MAX_SVG_CAPACITY: usize = 4096;

/// External renderer instruction discriminator.
pub const RENDER_DISCRIMINATOR: u8 = 0;

/// RenderBuffer layout constants (must match soul-generator).
pub mod layout {
    pub const RENDERER_ID_OFFSET: usize = 0;
    pub const GENERATION_OFFSET: usize = 4;
    pub const SVG_LEN_OFFSET: usize = 12;
    pub const RESERVED_OFFSET: usize = 14;
    pub const SVG_OFFSET: usize = 36;
    pub const RENDER_BUFFER_LEN: usize = SVG_OFFSET + super::MAX_SVG_CAPACITY;
}
