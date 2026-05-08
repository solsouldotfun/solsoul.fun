use super::theme::{render_builtin_art_theme, ArtTheme};
use pinocchio::error::ProgramError;

/// Compatibility entrypoint for legacy integration fixtures that still import
/// the removed NeonPuff module. The active renderer registry remains
/// mathematical-only; this shim delegates to the current default Fractal theme.
pub fn generate_neonpuff_svg(seed: &[u8], buf: &mut [u8]) -> Result<usize, ProgramError> {
    render_builtin_art_theme(ArtTheme::Fractal, seed, buf)
}
