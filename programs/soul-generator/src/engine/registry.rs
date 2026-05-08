use super::{BuiltInRenderer, RenderContext};
use crate::svg::{
    blueprint::{BaseParams, EvolutionState},
    chaos::generate_chaos_svg,
    field::generate_field_svg,
    fractal::{generate_fractal_pixel_svg, generate_fractal_svg},
    harmonic::generate_harmonic_svg,
    lattice::generate_lattice_svg,
    pixel_art::generate_pixel_art_svg,
    symphony::generate_symphony_svg,
    theme::ArtTheme,
    traits::{BlendedSoulTraitSet, FinalCoreTraitSet},
};
use pinocchio::error::ProgramError;

// ── Adapter functions: bridge RenderContext to each renderer's native signature ──

fn fractal_adapter(ctx: &RenderContext, buf: &mut [u8]) -> Result<usize, ProgramError> {
    let params = default_base_params();
    let evolution = EvolutionState::default();
    generate_fractal_svg(ctx.seed, &params, &evolution, buf)
}

fn pixel_fractal_adapter(ctx: &RenderContext, buf: &mut [u8]) -> Result<usize, ProgramError> {
    let params = default_base_params();
    let evolution = EvolutionState::default();
    generate_fractal_pixel_svg(ctx.seed, &params, &evolution, buf)
}

fn pixel_art_adapter(ctx: &RenderContext, buf: &mut [u8]) -> Result<usize, ProgramError> {
    generate_pixel_art_svg(ctx.seed, buf)
}

fn field_adapter(ctx: &RenderContext, buf: &mut [u8]) -> Result<usize, ProgramError> {
    let params = default_base_params();
    let evolution = EvolutionState::default();
    generate_field_svg(ctx.seed, &params, &evolution, buf)
}

fn lattice_adapter(ctx: &RenderContext, buf: &mut [u8]) -> Result<usize, ProgramError> {
    let params = default_base_params();
    let evolution = EvolutionState::default();
    generate_lattice_svg(ctx.seed, &params, &evolution, buf)
}

fn chaos_adapter(ctx: &RenderContext, buf: &mut [u8]) -> Result<usize, ProgramError> {
    let params = default_base_params();
    let evolution = EvolutionState::default();
    generate_chaos_svg(ctx.seed, &params, &evolution, buf)
}

fn harmonic_adapter(ctx: &RenderContext, buf: &mut [u8]) -> Result<usize, ProgramError> {
    let params = default_base_params();
    let evolution = EvolutionState::default();
    generate_harmonic_svg(ctx.seed, &params, &evolution, buf)
}

fn symphony_adapter(ctx: &RenderContext, buf: &mut [u8]) -> Result<usize, ProgramError> {
    generate_symphony_svg(ctx.seed, buf)
}

const fn default_base_params() -> BaseParams {
    BaseParams {
        dimensionality: 30,
        projection: 0,
        depth: 50,
        fundamental: 50,
        overtones: 3,
        decay: 0,
        entropy: 50,
        reserved: 0,
    }
}

// ── Trait-aware dispatch wrapper ──

/// Render with optional trait overlays.
///
/// Built-ins remain deterministic math renderers, but user/system core traits
/// add a bounded visible overlay before the closing `</svg>` so the finalized
/// trait set changes SVG bytes and pixels without any off-chain dependency.
pub fn render_builtin_with_traits(
    theme: ArtTheme,
    ctx: &RenderContext,
    traits: Option<BlendedSoulTraitSet>,
    buf: &mut [u8],
) -> Result<usize, ProgramError> {
    let svg_len = super::render_builtin(theme, ctx, buf)?;
    match traits {
        Some(traits) => append_trait_overlay(buf, svg_len, traits.core),
        None => Ok(svg_len),
    }
}

struct OverlayWriter<'a> {
    buf: &'a mut [u8],
    len: usize,
}

impl<'a> OverlayWriter<'a> {
    fn new(buf: &'a mut [u8], len: usize) -> Self {
        Self { buf, len }
    }

    fn write_str(&mut self, value: &str) -> Result<(), ProgramError> {
        self.write_bytes(value.as_bytes())
    }

    fn write_bytes(&mut self, value: &[u8]) -> Result<(), ProgramError> {
        let end = self
            .len
            .checked_add(value.len())
            .ok_or(ProgramError::ArithmeticOverflow)?;
        if end > self.buf.len() {
            return Err(ProgramError::AccountDataTooSmall);
        }
        self.buf[self.len..end].copy_from_slice(value);
        self.len = end;
        Ok(())
    }
}

fn append_trait_overlay(
    buf: &mut [u8],
    svg_len: usize,
    traits: FinalCoreTraitSet,
) -> Result<usize, ProgramError> {
    const SVG_CLOSE: &[u8] = b"</svg>";
    if svg_len < SVG_CLOSE.len() || &buf[svg_len - SVG_CLOSE.len()..svg_len] != SVG_CLOSE {
        return Ok(svg_len);
    }

    let mut out = OverlayWriter::new(buf, svg_len - SVG_CLOSE.len());
    out.write_str("<g opacity=\"")?;
    out.write_str(mood_opacity(traits.mood))?;
    out.write_str("\"><rect width=\"256\" height=\"256\" fill=\"")?;
    out.write_str(background_fill(traits.background))?;
    out.write_str("\" opacity=\"0.14\"/>")?;
    write_form(&mut out, traits.form, palette_accent(traits.palette))?;
    out.write_str("</g>")?;
    out.write_bytes(SVG_CLOSE)?;
    Ok(out.len)
}

fn write_form(out: &mut OverlayWriter<'_>, form: &str, accent: &str) -> Result<(), ProgramError> {
    match form {
        "wave" => {
            out.write_str("<path d=\"M16 150Q64 92 112 150T208 150\" fill=\"none\" stroke=\"")?;
            out.write_str(accent)?;
            out.write_str("\" stroke-width=\"8\" stroke-linecap=\"round\"/>")
        }
        "crystal" => {
            out.write_str(
                "<polygon points=\"128,34 190,116 158,222 98,222 66,116\" fill=\"none\" stroke=\"",
            )?;
            out.write_str(accent)?;
            out.write_str("\" stroke-width=\"6\"/>")
        }
        "orb" => {
            out.write_str("<circle cx=\"128\" cy=\"128\" r=\"72\" fill=\"none\" stroke=\"")?;
            out.write_str(accent)?;
            out.write_str("\" stroke-width=\"7\"/>")
        }
        _ => {
            out.write_str("<path d=\"M128 42C196 58 202 130 150 146C92 164 72 94 126 88C170 84 178 126 144 132\" fill=\"none\" stroke=\"")?;
            out.write_str(accent)?;
            out.write_str("\" stroke-width=\"7\" stroke-linecap=\"round\"/>")
        }
    }
}

fn palette_accent(palette: &str) -> &'static str {
    match palette {
        "aurora" => "#7cffcb",
        "ember" => "#ff6a3d",
        "mono" => "#f4f4f5",
        _ => "#9945ff",
    }
}

fn background_fill(background: &str) -> &'static str {
    match background {
        "nebula" => "#2d145f",
        "grid" => "#003b3b",
        "eclipse" => "#3f2f05",
        _ => "#020617",
    }
}

fn mood_opacity(mood: &str) -> &'static str {
    match mood {
        "charged" => "0.82",
        "mystic" => "0.70",
        "radiant" => "0.92",
        _ => "0.58",
    }
}

// ── Registry population ──

/// Initialise the static registry slice.
/// Called once at program startup via a `std::sync::Once` equivalent.
/// On SBF this is a compile-time constant, so we use `const` array init.
pub const fn build_registry() -> &'static [BuiltInRenderer] {
    &[
        BuiltInRenderer {
            renderer_id: 0x0000_0000,
            theme: ArtTheme::Fractal,
            name: "fractal",
            render: fractal_adapter,
        },
        BuiltInRenderer {
            renderer_id: 0x0000_0001,
            theme: ArtTheme::Field,
            name: "field",
            render: field_adapter,
        },
        BuiltInRenderer {
            renderer_id: 0x0000_0002,
            theme: ArtTheme::Lattice,
            name: "lattice",
            render: lattice_adapter,
        },
        BuiltInRenderer {
            renderer_id: 0x0000_0003,
            theme: ArtTheme::Chaos,
            name: "chaos",
            render: chaos_adapter,
        },
        BuiltInRenderer {
            renderer_id: 0x0000_0004,
            theme: ArtTheme::Harmonic,
            name: "harmonic",
            render: harmonic_adapter,
        },
        BuiltInRenderer {
            renderer_id: 0x0000_0005,
            theme: ArtTheme::PixelFractal,
            name: "pixelfractal",
            render: pixel_fractal_adapter,
        },
        BuiltInRenderer {
            renderer_id: 0x0000_0006,
            theme: ArtTheme::PixelArt,
            name: "pixelart",
            render: pixel_art_adapter,
        },
        BuiltInRenderer {
            renderer_id: 0x0000_0007,
            theme: ArtTheme::Symphony,
            name: "symphony",
            render: symphony_adapter,
        },
    ]
}
