use pinocchio::{
    cpi::{invoke_signed, Seed, Signer},
    instruction::{InstructionAccount, InstructionView},
    AccountView, Address, ProgramResult,
};

/// Discriminator for the external renderer `Render` instruction.
pub const EXTERNAL_RENDER_DISCRIMINATOR: u8 = 0;

/// Fixed header length of the serialized external render instruction data.
/// Layout after discriminator:
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
/// [164..]   = seed bytes (variable)
pub const EXTERNAL_RENDER_IX_HEADER_LEN: usize = 164;

/// Maximum instruction data size for external renderer CPI.
/// 164 header + 256 seed (generous upper bound).
pub const EXTERNAL_RENDER_IX_DATA_CAP: usize = 420;

/// Accounts required by an external renderer program.
pub struct ExternalRenderCpiAccounts<'a> {
    pub render_buffer: &'a AccountView,
    pub trader: &'a AccountView,
    pub token_account: &'a AccountView,
    pub renderer_program: &'a AccountView,
}

/// Serialize `RenderContext` into external renderer instruction data.
///
/// Returns the populated sub-slice of `buf`.
pub fn build_external_render_ix_data<'buf>(
    ctx: &super::RenderContext,
    buf: &'buf mut [u8; EXTERNAL_RENDER_IX_DATA_CAP],
) -> Result<&'buf [u8], pinocchio::error::ProgramError> {
    let seed_len = ctx.seed.len();
    let total = EXTERNAL_RENDER_IX_HEADER_LEN
        .checked_add(seed_len)
        .ok_or(pinocchio::error::ProgramError::ArithmeticOverflow)?;
    if total > buf.len() {
        return Err(pinocchio::error::ProgramError::AccountDataTooSmall);
    }

    buf[0] = EXTERNAL_RENDER_DISCRIMINATOR;
    buf[1..9].copy_from_slice(&ctx.generation.to_le_bytes());
    buf[9] = ctx.side;
    buf[10..18].copy_from_slice(&ctx.amount.to_le_bytes());
    buf[18..26].copy_from_slice(&ctx.holder_balance.to_le_bytes());
    buf[26..34].copy_from_slice(ctx.seed_hash);
    buf[34..66].copy_from_slice(ctx.trader.as_ref());
    buf[66..98].copy_from_slice(ctx.token_account.as_ref());
    buf[98..130].copy_from_slice(ctx.mint.as_ref());
    buf[130..162].copy_from_slice(ctx.soul.as_ref());
    buf[162..164].copy_from_slice(&(seed_len as u16).to_le_bytes());
    buf[164..164 + seed_len].copy_from_slice(ctx.seed);

    Ok(&buf[..total])
}

/// CPI invoke an external renderer program.
///
/// The render_buffer PDA is signed via `invoke_signed` so the external
/// program can verify it was created by soul-generator.
pub fn invoke_external_renderer(
    ctx: &super::RenderContext,
    cpi_accounts: ExternalRenderCpiAccounts,
    _program_id: &Address,
) -> ProgramResult {
    let mut ix_data_buf = [0u8; EXTERNAL_RENDER_IX_DATA_CAP];
    let ix_data = build_external_render_ix_data(ctx, &mut ix_data_buf)?;

    let accounts = [
        InstructionAccount::writable(cpi_accounts.render_buffer.address()),
        InstructionAccount::readonly(cpi_accounts.trader.address()),
        InstructionAccount::readonly(cpi_accounts.token_account.address()),
    ];

    let instruction = InstructionView {
        program_id: cpi_accounts.renderer_program.address(),
        data: ix_data,
        accounts: &accounts,
    };

    let account_views = [
        cpi_accounts.render_buffer,
        cpi_accounts.trader,
        cpi_accounts.token_account,
    ];

    let generation_bytes = ctx.generation.to_le_bytes();
    let seeds = [
        Seed::from(crate::state::render_buffer::RENDER_BUFFER_SEED),
        Seed::from(ctx.mint.as_ref()),
        Seed::from(&generation_bytes),
    ];
    let signers = [Signer::from(&seeds)];

    invoke_signed::<3, _>(&instruction, &account_views, &signers)
}

/// Read the SVG length from a render buffer account after CPI returns.
pub fn read_render_buffer_svg_len(
    render_buffer: &AccountView,
) -> Result<usize, pinocchio::error::ProgramError> {
    let data = render_buffer.try_borrow()?;
    if data.len() < crate::state::render_buffer::RenderBuffer::SVG_LEN_OFFSET + 2 {
        return Err(pinocchio::error::ProgramError::AccountDataTooSmall);
    }
    let mut svg_len = [0u8; 2];
    svg_len.copy_from_slice(
        &data[crate::state::render_buffer::RenderBuffer::SVG_LEN_OFFSET
            ..crate::state::render_buffer::RenderBuffer::SVG_LEN_OFFSET + 2],
    );
    let svg_len = u16::from_le_bytes(svg_len) as usize;
    if svg_len > crate::state::LAST_SVG_CAPACITY {
        return Err(pinocchio::error::ProgramError::InvalidAccountData);
    }
    Ok(svg_len)
}

/// Copy SVG bytes from render buffer into the provided output slice.
pub fn copy_render_buffer_svg(
    render_buffer: &AccountView,
    out: &mut [u8],
) -> Result<usize, pinocchio::error::ProgramError> {
    let svg_len = read_render_buffer_svg_len(render_buffer)?;
    if out.len() < svg_len {
        return Err(pinocchio::error::ProgramError::AccountDataTooSmall);
    }
    let data = render_buffer.try_borrow()?;
    let svg_offset = crate::state::render_buffer::RenderBuffer::SVG_OFFSET;
    if data.len() < svg_offset + svg_len {
        return Err(pinocchio::error::ProgramError::AccountDataTooSmall);
    }
    out[..svg_len].copy_from_slice(&data[svg_offset..svg_offset + svg_len]);
    Ok(svg_len)
}
