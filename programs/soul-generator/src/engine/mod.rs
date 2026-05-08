pub mod cpi;
mod registry;

use crate::{state::renderer_registry::NAMESPACE_BUILTIN, svg::theme::ArtTheme};
use pinocchio::{error::ProgramError, Address};

/// Standard rendering context passed to all renderers (built-in and external).
pub struct RenderContext<'a> {
    /// Full trade seed (deterministic per trade context)
    pub seed: &'a [u8],
    /// 8-byte seed hash (fast lookup / palette derivation)
    pub seed_hash: &'a [u8; 8],
    /// Generation number
    pub generation: u64,
    /// Provenance side: buy / sell / none
    pub side: u8,
    /// Trade amount (SOL or token base units)
    pub amount: u64,
    /// Trader wallet address
    pub trader: &'a Address,
    /// Trader's token account address
    pub token_account: &'a Address,
    /// Token mint address
    pub mint: &'a Address,
    /// Soul PDA address
    pub soul: &'a Address,
    /// Holder balance (for boundary-aware rendering)
    pub holder_balance: u64,
}

/// Built-in renderer function pointer type.
pub type RenderFn = for<'a> fn(&RenderContext<'a>, &mut [u8]) -> Result<usize, ProgramError>;

/// Entry in the built-in renderer registry.
pub struct BuiltInRenderer {
    pub renderer_id: u32,
    pub theme: ArtTheme,
    pub name: &'static str,
    pub render: RenderFn,
}

/// The built-in renderer registry.
static BUILT_IN_REGISTRY: &[BuiltInRenderer] = registry::build_registry();

/// Map a built-in ArtTheme to its canonical renderer_id.
/// Built-in namespace is 0x0000; local IDs are sequential.
pub const fn theme_to_renderer_id(theme: ArtTheme) -> u32 {
    match theme {
        ArtTheme::Fractal => 0x0000_0000,
        ArtTheme::Field => 0x0000_0001,
        ArtTheme::Lattice => 0x0000_0002,
        ArtTheme::Chaos => 0x0000_0003,
        ArtTheme::Harmonic => 0x0000_0004,
        ArtTheme::PixelFractal => 0x0000_0005,
        ArtTheme::PixelArt => 0x0000_0006,
        ArtTheme::Symphony => 0x0000_0007,
        // CustomTemplate is not a built-in renderer; it uses the template path.
        ArtTheme::CustomTemplate => 0x0000_FFFF,
    }
}

/// Map a built-in renderer_id back to ArtTheme.
pub fn renderer_id_to_theme(renderer_id: u32) -> Option<ArtTheme> {
    if (renderer_id >> 16) as u16 != NAMESPACE_BUILTIN {
        return None;
    }
    match renderer_id {
        0x0000_0000 => Some(ArtTheme::Fractal),
        0x0000_0001 => Some(ArtTheme::Field),
        0x0000_0002 => Some(ArtTheme::Lattice),
        0x0000_0003 => Some(ArtTheme::Chaos),
        0x0000_0004 => Some(ArtTheme::Harmonic),
        0x0000_0005 => Some(ArtTheme::PixelFractal),
        0x0000_0006 => Some(ArtTheme::PixelArt),
        0x0000_0007 => Some(ArtTheme::Symphony),
        _ => None,
    }
}

/// Lookup a built-in renderer by its renderer_id.
pub fn lookup_builtin_by_id(renderer_id: u32) -> Option<&'static BuiltInRenderer> {
    BUILT_IN_REGISTRY
        .iter()
        .find(|&entry| entry.renderer_id == renderer_id)
        .map(|v| v as _)
}

/// Lookup a built-in renderer by theme.
pub fn lookup_builtin(theme: ArtTheme) -> Option<&'static BuiltInRenderer> {
    let id = theme_to_renderer_id(theme);
    lookup_builtin_by_id(id)
}

/// Main engine dispatch for **built-in** renderers only.
///
/// Community renderers require explicit CPI handling by the caller
/// (see `cpi::invoke_external_renderer`).
pub fn dispatch_builtin(
    renderer_id: u32,
    ctx: &RenderContext,
    buf: &mut [u8],
) -> Result<usize, ProgramError> {
    let namespace = (renderer_id >> 16) as u16;
    if namespace != NAMESPACE_BUILTIN {
        return Err(ProgramError::InvalidInstructionData);
    }
    let renderer = lookup_builtin_by_id(renderer_id).ok_or(ProgramError::InvalidInstructionData)?;
    (renderer.render)(ctx, buf)
}

/// Render using the built-in registry (convenience wrapper).
pub fn render_builtin(
    theme: ArtTheme,
    ctx: &RenderContext,
    buf: &mut [u8],
) -> Result<usize, ProgramError> {
    let renderer_id = theme_to_renderer_id(theme);
    dispatch_builtin(renderer_id, ctx, buf)
}

/// Re-export trait-aware dispatch from registry.
pub use registry::render_builtin_with_traits;
