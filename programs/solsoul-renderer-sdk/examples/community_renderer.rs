//! Example external renderer for the SolSoul Engine.
//!
//! This is a minimal standalone Solana program that registers as a
//! community renderer (renderer_id = 0x0001_0001) and produces a
//! deterministic geometric SVG based on the trade seed.
//!
//! Build with:
//!   cargo build-sbf --manifest-path programs/solsoul-renderer-sdk/Cargo.toml
//!
//! Register on-chain via soul-generator's `REGISTER_RENDERER` instruction.

#![no_std]

use pinocchio::{entrypoint, AccountView, Address, ProgramResult};
use solsoul_renderer_sdk::{
    validate_svg, ColorPalette, RenderBufferWriter, RenderContext, SvgWriter,
};

entrypoint!(process_instruction);

pub fn process_instruction(
    _program_id: &Address,
    accounts: &mut [AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    // 1. Parse the RenderContext delivered by soul-generator via CPI.
    let ctx = RenderContext::from_cpi(instruction_data)?;

    // 2. The render_buffer is the first (and only writable) account.
    let render_buffer = &mut accounts[0];

    // 3. Render SVG into a local stack buffer.
    let mut svg_buf = [0u8; solsoul_renderer_sdk::MAX_SVG_CAPACITY];
    let svg_len = render_geometric_soul(&ctx, &mut svg_buf)?;

    // 4. Security: validate output before writing to chain state.
    validate_svg(&svg_buf[..svg_len])?;

    // 5. Write SVG into the RenderBuffer account.
    RenderBufferWriter::write(render_buffer, &svg_buf[..svg_len])
}

fn main() {
    // Stub main for cargo example harness.
    // Real deployment uses the SBF entrypoint above.
}

/// Core rendering logic: deterministic geometric art from trade provenance.
fn render_geometric_soul(
    ctx: &RenderContext,
    buf: &mut [u8],
) -> Result<usize, pinocchio::error::ProgramError> {
    let palette = ColorPalette::from_seed_hash(ctx.seed_hash_u64());
    let hash = ctx.seed_hash_u64();
    let mut w = SvgWriter::new(buf);

    w.open_svg(400, 400)?;

    // Background
    w.rect(0, 0, 400, 400, palette.background_str())?;

    // Deterministic grid of circles
    let grid_size = 4 + ((hash % 5) as u8);
    let cell = 400 / grid_size as u16;
    for row in 0..grid_size {
        for col in 0..grid_size {
            let cx = (col as i64 * cell as i64) + (cell as i64 / 2);
            let cy = (row as i64 * cell as i64) + (cell as i64 / 2);
            let r = (cell as u64 * 3) / 8;
            let color = if (row + col) % 2 == 0 {
                palette.primary_str()
            } else {
                palette.secondary_str()
            };
            w.circle(cx, cy, r, color)?;
        }
    }

    // Accent shape in center
    let cx = 200;
    let cy = 200;
    let r = 30 + (hash % 40) as u64;
    w.circle(cx, cy, r, palette.accent_str())?;

    // Trade provenance metadata as tiny text
    w.text(10, 390, "SolSoul", palette.text_str(), 10)?;

    w.close_svg()?;
    Ok(w.len())
}
