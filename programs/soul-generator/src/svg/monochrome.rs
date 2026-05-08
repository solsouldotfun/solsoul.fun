use super::theme::{render_builtin_art_theme, ArtTheme};
use pinocchio::error::ProgramError;

/// Compatibility entrypoint for legacy integration fixtures that still import
/// the removed Monochrome module. The active renderer registry remains
/// mathematical-only; this shim delegates to a current bounded built-in theme.
pub fn generate_monochrome_soul_svg(seed: &[u8], buf: &mut [u8]) -> Result<usize, ProgramError> {
    render_builtin_art_theme(ArtTheme::PixelArt, seed, buf)
}
