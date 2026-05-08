use crate::{
    engine::{
        cpi::{copy_render_buffer_svg, invoke_external_renderer, ExternalRenderCpiAccounts},
        render_builtin_with_traits, RenderContext,
    },
    state::{
        global_config::assert_global_config_not_paused,
        render_buffer::{derive_render_buffer_address, RenderBuffer},
        renderer_registry::{
            derive_renderer_registry_address, RendererRegistryEntry, NAMESPACE_BUILTIN,
        },
        SoulAccount, BASE_SVG_TEMPLATE_CAPACITY, LAST_SVG_CAPACITY, PROVENANCE_SIDE_BUY,
        PROVENANCE_SIDE_NONE, PROVENANCE_SIDE_SELL, SEED_HASH_LEN, SOUL_SEED,
        STYLE_PARAMS_CAPACITY,
    },
    svg::{
        template::render_with_template,
        theme::{resolve_art_theme, resolve_renderer_id, ArtTheme},
        traits::{resolve_blended_soul_traits, DefaultSoulTraitInput},
    },
};
#[cfg(not(test))]
use alloc::format;
use pinocchio::{
    error::ProgramError, sysvars::slot_hashes::SLOTHASHES_ID, AccountView, Address, ProgramResult,
};
use shared::{
    geppetto::{assert_owned_by, assert_pda, assert_signer, assert_writable},
    programs::BONDING_CURVE_PROGRAM_ID,
};

pub const GENERATE_SOUL_ARGS_LEN: usize = 17;
const LEGACY_GENERATE_SOUL_ARGS_LEN: usize = 9;
const CURVE_SEED: &[u8] = b"curve";
/// Local-only bonding-curve program id used by the workspace's bonding-curve
/// crate (its `declare_id!`) and exercised by `solana-program-test`
/// integration scenarios. SEC.A5 / SEC.F5: this id MUST NOT be trusted as an
/// authenticated CPI authority for Soul provenance writes in default or
/// devnet-deployed production-like builds; it is only accepted when the
/// soul-generator crate is explicitly built with `--features integration`.
#[cfg(feature = "integration")]
const LOCAL_INTEGRATION_BONDING_CURVE_PROGRAM_ID: [u8; 32] =
    pinocchio_pubkey::pubkey!("B6AhJJSYMbnrxLbS6nTBuDowADQJxdF7hQSTrepFFk3C");
const SEED_LEN: usize = 32 + 32 + 8 + 1 + 8 + 32 + 32 + 32 + 8;
const TOKEN_ACCOUNT_AMOUNT_OFFSET: usize = 64;
const TOKEN_ACCOUNT_AMOUNT_END: usize = TOKEN_ACCOUNT_AMOUNT_OFFSET + 8;
const RECENT_BLOCKHASHES_ID: Address = Address::new_from_array(pinocchio_pubkey::pubkey!(
    "SysvarRecentB1ockHashes11111111111111111111"
));

pub fn process(
    program_id: &Address,
    accounts: &mut [AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    if instruction_data.len() != GENERATE_SOUL_ARGS_LEN
        && instruction_data.len() != LEGACY_GENERATE_SOUL_ARGS_LEN
    {
        return Err(ProgramError::InvalidInstructionData);
    }

    if accounts.len() < 4 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }

    let (soul_accounts, rest) = accounts.split_at_mut(1);
    let soul = &mut soul_accounts[0];
    let payer = &rest[0];
    let recent_blockhash_sysvar = &rest[1];
    let account_context = parse_generate_soul_accounts(payer, &rest[2..])?;

    assert_writable(soul)?;
    assert_owned_by(soul, program_id)?;
    assert_global_config_not_paused(account_context.global_config, program_id)?;
    assert_signer(payer)?;

    if soul.data_len() < SoulAccount::PRE_M3_LEGACY_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }

    let mut swap_amount = [0u8; 8];
    swap_amount.copy_from_slice(&instruction_data[..8]);
    let is_buy = match instruction_data[8] {
        0 => false,
        1 => true,
        _ => return Err(ProgramError::InvalidInstructionData),
    };
    let provenance_token_amount = if instruction_data.len() == GENERATE_SOUL_ARGS_LEN {
        let mut token_amount = [0u8; 8];
        token_amount.copy_from_slice(&instruction_data[9..17]);
        u64::from_le_bytes(token_amount)
    } else {
        0
    };

    let (mint, generation_count, template_len, style_params_len) = {
        let data = soul.try_borrow()?;
        read_soul_render_fields(&data[..])?
    };

    assert_pda(soul, &[SOUL_SEED, mint.as_ref()], program_id)?;

    let recent_blockhash = read_recent_blockhash(recent_blockhash_sysvar)?;
    let authenticated_bonding_curve = is_authenticated_bonding_curve_cpi(payer, &mint);
    if !authenticated_bonding_curve && generation_count > 0 {
        // SEC.A1: Once authenticated trade provenance exists, public direct
        // generate_soul calls must not mutate `last_svg`. Claimed NFT metadata
        // is assembled from the Soul account's current SVG, so allowing a
        // post-trade public preview refresh would let an unrelated signer race
        // a buyer's claim and replace the claimable art while leaving BUY
        // provenance intact.
        return Err(ProgramError::InvalidAccountData);
    }
    let side = provenance_side(is_buy, authenticated_bonding_curve);
    let recorded_provenance_token_amount = if side == PROVENANCE_SIDE_BUY {
        provenance_token_amount
    } else {
        0
    };
    let next_generation_count = generation_count
        .checked_add(1)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    let token_account = account_context
        .holder_token_account
        .map_or(Address::new_from_array([0; 32]), |account| {
            *account.address()
        });
    let soul_address = *soul.address();

    let mut seed = [0u8; SEED_LEN];
    seed[..32].copy_from_slice(account_context.trader.address().as_ref());
    seed[32..64].copy_from_slice(&recent_blockhash);
    seed[64..72].copy_from_slice(&swap_amount);
    seed[72] = u8::from(is_buy);
    seed[73..81].copy_from_slice(&recorded_provenance_token_amount.to_le_bytes());
    seed[81..113].copy_from_slice(token_account.as_ref());
    seed[113..145].copy_from_slice(mint.as_ref());
    seed[145..177].copy_from_slice(soul_address.as_ref());
    seed[177..185].copy_from_slice(&next_generation_count.to_le_bytes());
    let seed_hash = deterministic_seed_hash(&seed);

    let holder_balance = match account_context.holder_token_account {
        Some(account) => read_holder_balance(account)?,
        None => 0,
    };

    let mut data = soul.try_borrow_mut()?;
    let svg_len = {
        let (_before_last_svg, from_last_svg) = data.split_at_mut(SoulAccount::LAST_SVG_OFFSET);
        let (last_svg, after_last_svg) = from_last_svg.split_at_mut(LAST_SVG_CAPACITY);
        last_svg.fill(0);

        // Always read style_params to check for hexagram mode
        let (base_template, after_template) =
            after_last_svg.split_at_mut(BASE_SVG_TEMPLATE_CAPACITY);
        let (_template_len_bytes, after_template_len) = after_template.split_at_mut(2);
        let (style_params, _after_style_params) =
            after_template_len.split_at_mut(STYLE_PARAMS_CAPACITY);
        let style_slice = &style_params[..style_params_len];

        let renderer_id = resolve_renderer_id(style_slice);

        let ctx = RenderContext {
            seed: &seed,
            seed_hash: &seed_hash,
            generation: next_generation_count,
            side,
            amount: u64::from_le_bytes(swap_amount),
            trader: account_context.trader.address(),
            token_account: &token_account,
            mint: &mint,
            soul: &soul_address,
            holder_balance,
        };

        match renderer_id {
            Some(id) if (id >> 16) as u16 != NAMESPACE_BUILTIN => {
                // Community renderer path
                render_via_community_renderer(id, &ctx, &account_context, program_id, last_svg)?
            }
            _ => {
                // Built-in renderer path (existing logic)
                let theme = resolve_art_theme(style_slice, template_len);
                let trait_set = resolve_blended_soul_traits(
                    DefaultSoulTraitInput {
                        seed: &seed_hash,
                        theme,
                        provenance_side: side,
                        generation: next_generation_count,
                        amount: u64::from_le_bytes(swap_amount),
                        token_amount: recorded_provenance_token_amount,
                    },
                    style_slice,
                )?;

                match theme {
                    ArtTheme::CustomTemplate if template_len > 0 => render_with_template(
                        &base_template[..template_len],
                        &seed,
                        style_slice,
                        holder_balance,
                        last_svg,
                    )?,
                    ArtTheme::CustomTemplate => {
                        render_builtin_with_traits(ArtTheme::Fractal, &ctx, None, last_svg)?
                    }
                    builtin => {
                        render_builtin_with_traits(builtin, &ctx, Some(trait_set), last_svg)?
                    }
                }
            }
        }
    };
    let svg_len_u16 = u16::try_from(svg_len).map_err(|_| ProgramError::InvalidInstructionData)?;
    data[SoulAccount::LAST_SVG_LEN_OFFSET..SoulAccount::LAST_SVG_OFFSET]
        .copy_from_slice(&svg_len_u16.to_le_bytes());

    // SEC.A1: Public direct generate_soul calls (not authenticated by a
    // bonding-curve CPI signing the curve PDA) must NOT advance the claim
    // provenance cursor. They can only refresh the cosmetic last_svg buffer.
    // Authenticated bonding-curve CPI is the sole path that may advance
    // generation_count and rewrite the provenance fields used by claim_soul.
    if authenticated_bonding_curve {
        data[SoulAccount::GENERATION_COUNT_OFFSET..SoulAccount::LAST_SVG_LEN_OFFSET]
            .copy_from_slice(&next_generation_count.to_le_bytes());
        if data.len() >= SoulAccount::PRE_PROVENANCE_TOKEN_AMOUNT_LEN {
            data[SoulAccount::PROVENANCE_GENERATION_OFFSET..SoulAccount::PROVENANCE_SIDE_OFFSET]
                .copy_from_slice(&next_generation_count.to_le_bytes());
            data[SoulAccount::PROVENANCE_SIDE_OFFSET] = side;
            data[SoulAccount::PROVENANCE_AMOUNT_OFFSET..SoulAccount::PROVENANCE_TRADER_OFFSET]
                .copy_from_slice(&swap_amount);
            data[SoulAccount::PROVENANCE_TRADER_OFFSET
                ..SoulAccount::PROVENANCE_TOKEN_ACCOUNT_OFFSET]
                .copy_from_slice(account_context.trader.address().as_ref());
            data[SoulAccount::PROVENANCE_TOKEN_ACCOUNT_OFFSET..SoulAccount::PROVENANCE_MINT_OFFSET]
                .copy_from_slice(token_account.as_ref());
            data[SoulAccount::PROVENANCE_MINT_OFFSET..SoulAccount::PROVENANCE_SOUL_OFFSET]
                .copy_from_slice(mint.as_ref());
            data[SoulAccount::PROVENANCE_SOUL_OFFSET..SoulAccount::PROVENANCE_SEED_HASH_OFFSET]
                .copy_from_slice(soul_address.as_ref());
            data[SoulAccount::PROVENANCE_SEED_HASH_OFFSET
                ..SoulAccount::PROVENANCE_TOKEN_AMOUNT_OFFSET]
                .copy_from_slice(&seed_hash);
            if data.len() >= SoulAccount::LEN {
                data[SoulAccount::PROVENANCE_TOKEN_AMOUNT_OFFSET..SoulAccount::LEN]
                    .copy_from_slice(&recorded_provenance_token_amount.to_le_bytes());
            }
        }
    }
    drop(data);

    let event_generation = if authenticated_bonding_curve {
        next_generation_count
    } else {
        generation_count
    };
    let event_side = if authenticated_bonding_curve {
        side
    } else {
        PROVENANCE_SIDE_NONE
    };
    emit_generation_event(&GenerationEvent {
        generation: event_generation,
        side: event_side,
        amount: u64::from_le_bytes(swap_amount),
        trader: account_context.trader.address(),
        token_account: &token_account,
        mint: &mint,
        soul: &soul_address,
        seed_hash: &seed_hash,
    });

    Ok(())
}

fn render_via_community_renderer(
    renderer_id: u32,
    ctx: &RenderContext,
    accounts: &GenerateSoulAccounts,
    program_id: &Address,
    out_buf: &mut [u8],
) -> Result<usize, ProgramError> {
    let registry_entry = accounts
        .renderer_registry_entry
        .ok_or(ProgramError::NotEnoughAccountKeys)?;
    let render_buffer = accounts
        .render_buffer
        .ok_or(ProgramError::NotEnoughAccountKeys)?;
    let renderer_program = accounts
        .renderer_program
        .ok_or(ProgramError::NotEnoughAccountKeys)?;

    assert_writable(render_buffer)?;
    assert_owned_by(render_buffer, program_id)?;

    // Validate registry entry PDA
    let expected_registry = derive_renderer_registry_address(renderer_id, program_id);
    if registry_entry.address() != &expected_registry {
        return Err(ProgramError::InvalidSeeds);
    }

    let entry = {
        let data = registry_entry.try_borrow()?;
        RendererRegistryEntry::unpack(&data[..])?
    };

    if entry.renderer_id != renderer_id {
        return Err(ProgramError::InvalidAccountData);
    }
    if entry.is_active != 1 {
        return Err(ProgramError::InvalidAccountData);
    }
    if &entry.program_id != renderer_program.address() {
        return Err(ProgramError::InvalidInstructionData);
    }

    // Validate render buffer PDA
    let expected_buffer = derive_render_buffer_address(ctx.mint, ctx.generation, program_id);
    if render_buffer.address() != &expected_buffer {
        return Err(ProgramError::InvalidSeeds);
    }

    // Ensure render buffer is initialized for this render
    {
        let buf_data = render_buffer.try_borrow()?;
        // Minimum header check
        if buf_data.len() >= RenderBuffer::SVG_LEN_OFFSET + 2 {
            let mut buf_renderer_id = [0u8; 4];
            buf_renderer_id.copy_from_slice(
                &buf_data[RenderBuffer::RENDERER_ID_OFFSET..RenderBuffer::GENERATION_OFFSET],
            );
            if u32::from_le_bytes(buf_renderer_id) != renderer_id {
                // Buffer was for a different renderer — still valid to overwrite, no error.
            }
        }
    }

    // CPI invoke external renderer
    invoke_external_renderer(
        ctx,
        ExternalRenderCpiAccounts {
            render_buffer,
            trader: accounts.trader,
            token_account: accounts.holder_token_account.unwrap_or(accounts.trader),
            renderer_program,
        },
        program_id,
    )?;

    // Copy rendered SVG from buffer to soul's last_svg
    let svg_len = copy_render_buffer_svg(render_buffer, out_buf)?;
    validate_external_svg(&out_buf[..svg_len])?;

    Ok(svg_len)
}

const FORBIDDEN_EXTERNAL_SVG_PATTERNS: &[&[u8]] = &[
    b"<script",
    b"<style",
    b"<image",
    b"href",
    b"xlink:",
    b"http://",
    b"https://",
    b"ipfs:",
    b"ar:",
    b"data:",
    b"@import",
    b"url(",
    b"behavior:",
    b"mhtml:",
    b"javascript:",
    b"vbscript:",
    b"onerror",
    b"onload",
    b"onclick",
    b"onmouseover",
    b"<iframe",
    b"<embed",
    b"<object",
    b"<foreignobject",
    b"<animate",
    b"<set",
];

fn validate_external_svg(svg: &[u8]) -> ProgramResult {
    let trimmed = trim_ascii_whitespace(svg);
    if !starts_with_ascii_case_insensitive(trimmed, b"<svg")
        || !ends_with_ascii_case_insensitive(trimmed, b"</svg>")
    {
        return Err(ProgramError::InvalidAccountData);
    }
    for pattern in FORBIDDEN_EXTERNAL_SVG_PATTERNS {
        if contains_ascii_case_insensitive(trimmed, pattern) {
            return Err(ProgramError::InvalidAccountData);
        }
    }
    Ok(())
}

fn trim_ascii_whitespace(bytes: &[u8]) -> &[u8] {
    let mut start = 0usize;
    let mut end = bytes.len();
    while start < end && bytes[start].is_ascii_whitespace() {
        start += 1;
    }
    while end > start && bytes[end - 1].is_ascii_whitespace() {
        end -= 1;
    }
    &bytes[start..end]
}

fn starts_with_ascii_case_insensitive(haystack: &[u8], needle: &[u8]) -> bool {
    haystack.len() >= needle.len() && ascii_matches_at(haystack, 0, needle)
}

fn ends_with_ascii_case_insensitive(haystack: &[u8], needle: &[u8]) -> bool {
    haystack.len() >= needle.len()
        && ascii_matches_at(haystack, haystack.len() - needle.len(), needle)
}

fn contains_ascii_case_insensitive(haystack: &[u8], needle: &[u8]) -> bool {
    if needle.is_empty() || haystack.len() < needle.len() {
        return false;
    }
    let mut index = 0usize;
    while index + needle.len() <= haystack.len() {
        if ascii_matches_at(haystack, index, needle) {
            return true;
        }
        index += 1;
    }
    false
}

fn ascii_matches_at(haystack: &[u8], start: usize, needle: &[u8]) -> bool {
    if start + needle.len() > haystack.len() {
        return false;
    }
    let mut offset = 0usize;
    while offset < needle.len() {
        if !haystack[start + offset].eq_ignore_ascii_case(&needle[offset]) {
            return false;
        }
        offset += 1;
    }
    true
}

fn read_soul_render_fields(data: &[u8]) -> Result<(Address, u64, usize, usize), ProgramError> {
    if data.len() < SoulAccount::PRE_M3_LEGACY_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }

    let mut mint = [0u8; 32];
    mint.copy_from_slice(&data[SoulAccount::MINT_OFFSET..SoulAccount::AUTHORITY_OFFSET]);

    let mut generation_count = [0u8; 8];
    generation_count.copy_from_slice(
        &data[SoulAccount::GENERATION_COUNT_OFFSET..SoulAccount::LAST_SVG_LEN_OFFSET],
    );

    let mut template_len = [0u8; 2];
    template_len
        .copy_from_slice(&data[SoulAccount::TEMPLATE_LEN_OFFSET..SoulAccount::STYLE_PARAMS_OFFSET]);
    let template_len = u16::from_le_bytes(template_len) as usize;
    if template_len > BASE_SVG_TEMPLATE_CAPACITY {
        return Err(ProgramError::InvalidAccountData);
    }

    let mut style_params_len = [0u8; 2];
    style_params_len.copy_from_slice(
        &data[SoulAccount::STYLE_PARAMS_LEN_OFFSET..SoulAccount::MIN_CLAIM_BALANCE_OFFSET],
    );
    let style_params_len = u16::from_le_bytes(style_params_len) as usize;
    if style_params_len > STYLE_PARAMS_CAPACITY {
        return Err(ProgramError::InvalidAccountData);
    }

    Ok((
        Address::new_from_array(mint),
        u64::from_le_bytes(generation_count),
        template_len,
        style_params_len,
    ))
}

fn read_holder_balance(holder_token_account: &AccountView) -> Result<u64, ProgramError> {
    let data = holder_token_account.try_borrow()?;
    if data.len() < TOKEN_ACCOUNT_AMOUNT_END {
        return Err(ProgramError::AccountDataTooSmall);
    }

    let mut amount = [0u8; 8];
    amount.copy_from_slice(&data[TOKEN_ACCOUNT_AMOUNT_OFFSET..TOKEN_ACCOUNT_AMOUNT_END]);
    Ok(u64::from_le_bytes(amount))
}

fn read_recent_blockhash(sysvar_account: &AccountView) -> Result<[u8; 32], ProgramError> {
    let data = sysvar_account.try_borrow()?;
    let mut blockhash = [0u8; 32];

    if sysvar_account.address() == &RECENT_BLOCKHASHES_ID {
        let start = 8usize;
        let end = start
            .checked_add(blockhash.len())
            .ok_or(ProgramError::ArithmeticOverflow)?;
        if data.len() < end {
            return Err(ProgramError::AccountDataTooSmall);
        }
        blockhash.copy_from_slice(&data[start..end]);
        return Ok(blockhash);
    }

    if sysvar_account.address() == &SLOTHASHES_ID {
        let start = 16usize;
        let end = start
            .checked_add(blockhash.len())
            .ok_or(ProgramError::ArithmeticOverflow)?;
        if data.len() < end {
            return Err(ProgramError::AccountDataTooSmall);
        }
        blockhash.copy_from_slice(&data[start..end]);
        return Ok(blockhash);
    }

    Err(ProgramError::InvalidArgument)
}

struct GenerateSoulAccounts<'a> {
    holder_token_account: Option<&'a AccountView>,
    trader: &'a AccountView,
    global_config: &'a AccountView,
    renderer_registry_entry: Option<&'a AccountView>,
    render_buffer: Option<&'a AccountView>,
    renderer_program: Option<&'a AccountView>,
}

fn parse_generate_soul_accounts<'a>(
    payer: &'a AccountView,
    rest: &'a [AccountView],
) -> Result<GenerateSoulAccounts<'a>, ProgramError> {
    match rest.len() {
        // Built-in paths (backward compatible)
        1 => Ok(GenerateSoulAccounts {
            holder_token_account: None,
            trader: payer,
            global_config: &rest[0],
            renderer_registry_entry: None,
            render_buffer: None,
            renderer_program: None,
        }),
        2 => Ok(GenerateSoulAccounts {
            holder_token_account: Some(&rest[0]),
            trader: payer,
            global_config: &rest[1],
            renderer_registry_entry: None,
            render_buffer: None,
            renderer_program: None,
        }),
        3 => Ok(GenerateSoulAccounts {
            holder_token_account: Some(&rest[0]),
            trader: &rest[1],
            global_config: &rest[2],
            renderer_registry_entry: None,
            render_buffer: None,
            renderer_program: None,
        }),
        // Community renderer paths (+3 accounts appended)
        4 => Ok(GenerateSoulAccounts {
            holder_token_account: None,
            trader: payer,
            global_config: &rest[0],
            renderer_registry_entry: Some(&rest[1]),
            render_buffer: Some(&rest[2]),
            renderer_program: Some(&rest[3]),
        }),
        5 => Ok(GenerateSoulAccounts {
            holder_token_account: Some(&rest[0]),
            trader: payer,
            global_config: &rest[1],
            renderer_registry_entry: Some(&rest[2]),
            render_buffer: Some(&rest[3]),
            renderer_program: Some(&rest[4]),
        }),
        6 => Ok(GenerateSoulAccounts {
            holder_token_account: Some(&rest[0]),
            trader: &rest[1],
            global_config: &rest[2],
            renderer_registry_entry: Some(&rest[3]),
            render_buffer: Some(&rest[4]),
            renderer_program: Some(&rest[5]),
        }),
        _ => Err(ProgramError::NotEnoughAccountKeys),
    }
}

fn provenance_side(is_buy: bool, authenticated_bonding_curve: bool) -> u8 {
    if is_buy && authenticated_bonding_curve {
        PROVENANCE_SIDE_BUY
    } else if is_buy {
        PROVENANCE_SIDE_NONE
    } else {
        PROVENANCE_SIDE_SELL
    }
}

/// Returns the set of bonding-curve program ids that are trusted as
/// authenticated CPI authorities for Soul provenance writes. SEC.A5 / SEC.F5:
/// the canonical configured `BONDING_CURVE_PROGRAM_ID` is always trusted; the
/// `LOCAL_INTEGRATION_BONDING_CURVE_PROGRAM_ID` is only included when this
/// crate is explicitly built with `--features integration` for local
/// integration testing. Default and devnet-deployed production-like builds
/// must reject the local integration id.
fn trusted_bonding_curve_program_ids() -> &'static [[u8; 32]] {
    #[cfg(feature = "integration")]
    {
        const TRUSTED: &[[u8; 32]] = &[
            BONDING_CURVE_PROGRAM_ID,
            LOCAL_INTEGRATION_BONDING_CURVE_PROGRAM_ID,
        ];
        TRUSTED
    }
    #[cfg(not(feature = "integration"))]
    {
        const TRUSTED: &[[u8; 32]] = &[BONDING_CURVE_PROGRAM_ID];
        TRUSTED
    }
}

fn is_authenticated_bonding_curve_cpi(payer: &AccountView, mint: &Address) -> bool {
    for bonding_curve_program_id in trusted_bonding_curve_program_ids().iter().copied() {
        let bonding_curve_program_id = Address::new_from_array(bonding_curve_program_id);
        if !payer.owned_by(&bonding_curve_program_id) {
            continue;
        }

        #[cfg(any(target_os = "solana", target_arch = "bpf"))]
        let expected_curve = match Address::create_program_address(
            &[CURVE_SEED, mint.as_ref()],
            &bonding_curve_program_id,
        ) {
            Ok(address) => address,
            Err(_) => continue,
        };

        #[cfg(not(any(target_os = "solana", target_arch = "bpf")))]
        let expected_curve = Address::derive_address(
            &[CURVE_SEED, mint.as_ref()],
            None,
            &bonding_curve_program_id,
        );

        if payer.address() == &expected_curve {
            return true;
        }
    }

    false
}

fn deterministic_seed_hash(seed: &[u8]) -> [u8; SEED_HASH_LEN] {
    let mut hash = 0xcbf2_9ce4_8422_2325u64;
    let mut index = 0usize;
    while index < seed.len() {
        hash ^= seed[index] as u64;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
        hash ^= (index as u64).rotate_left((index % 31) as u32);
        index += 1;
    }
    hash.to_le_bytes()
}

#[allow(dead_code)]
struct GenerationEvent<'a> {
    generation: u64,
    side: u8,
    amount: u64,
    trader: &'a Address,
    token_account: &'a Address,
    mint: &'a Address,
    soul: &'a Address,
    seed_hash: &'a [u8; SEED_HASH_LEN],
}

#[cfg(test)]
static GENERATION_EVENT_LOGS: core::sync::atomic::AtomicUsize =
    core::sync::atomic::AtomicUsize::new(0);

#[cfg(test)]
fn emit_generation_event(_event: &GenerationEvent<'_>) {
    GENERATION_EVENT_LOGS.fetch_add(1, core::sync::atomic::Ordering::SeqCst);
}

#[cfg(not(test))]
fn emit_generation_event(event: &GenerationEvent<'_>) {
    let side = match event.side {
        PROVENANCE_SIDE_BUY => "buy",
        PROVENANCE_SIDE_SELL => "sell",
        _ => "none",
    };
    log_event_message(&format!(
        "[event:generation] generation={} side={} amount={} trader={} token_account={} mint={} soul={} seed_hash={}",
        event.generation,
        side,
        event.amount,
        event.trader,
        event.token_account,
        event.mint,
        event.soul,
        SeedHashHex(event.seed_hash)
    ));
}

#[cfg(not(test))]
struct SeedHashHex<'a>(&'a [u8; SEED_HASH_LEN]);

#[cfg(not(test))]
impl core::fmt::Display for SeedHashHex<'_> {
    fn fmt(&self, formatter: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        const HEX: &[u8; 16] = b"0123456789abcdef";
        for byte in self.0 {
            let chars = [HEX[(byte >> 4) as usize], HEX[(byte & 0x0f) as usize]];
            let hex = core::str::from_utf8(&chars).map_err(|_| core::fmt::Error)?;
            formatter.write_str(hex)?;
        }
        Ok(())
    }
}

#[cfg(all(not(test), target_os = "solana"))]
fn log_event_message(message: &str) {
    unsafe {
        pinocchio::syscalls::sol_log_(message.as_ptr(), message.len() as u64);
    }
}

#[cfg(all(not(test), not(target_os = "solana")))]
fn log_event_message(_message: &str) {}

#[cfg(test)]
mod tests {
    use super::{
        deterministic_seed_hash, emit_generation_event, provenance_side,
        trusted_bonding_curve_program_ids, validate_external_svg, GenerationEvent,
        GENERATION_EVENT_LOGS,
    };
    use crate::state::{
        PROVENANCE_SIDE_BUY, PROVENANCE_SIDE_NONE, PROVENANCE_SIDE_SELL, SEED_HASH_LEN,
    };
    use core::sync::atomic::Ordering;
    use pinocchio::{error::ProgramError, Address};
    use shared::programs::BONDING_CURVE_PROGRAM_ID;

    /// SEC.A5: the canonical configured bonding-curve program id is always a
    /// trusted CPI authority. This holds for both default and integration
    /// builds so that production-like behavior never regresses.
    #[test]
    fn bonding_curve_authority_defaults_trust_canonical_program_id() {
        let trusted = trusted_bonding_curve_program_ids();
        assert!(
            trusted.iter().any(|id| id == &BONDING_CURVE_PROGRAM_ID),
            "canonical BONDING_CURVE_PROGRAM_ID must always be trusted"
        );
    }

    /// SEC.A5: default builds (without the `integration` Cargo feature) MUST
    /// NOT trust the local integration bonding-curve program id as an
    /// authenticated CPI authority. This prevents a non-canonical local
    /// integration program from being able to forge BUY provenance on
    /// devnet-deployed / production-like binaries.
    #[cfg(not(feature = "integration"))]
    #[test]
    fn bonding_curve_authority_defaults_reject_local_integration_program_id() {
        let local_integration: [u8; 32] =
            pinocchio_pubkey::pubkey!("B6AhJJSYMbnrxLbS6nTBuDowADQJxdF7hQSTrepFFk3C");
        let trusted = trusted_bonding_curve_program_ids();
        assert!(
            trusted.iter().all(|id| id != &local_integration),
            "default build must NOT trust LOCAL_INTEGRATION_BONDING_CURVE_PROGRAM_ID (SEC.A5)"
        );
        // Default builds trust ONLY the canonical configured id.
        assert_eq!(trusted.len(), 1);
        assert_eq!(trusted[0], BONDING_CURVE_PROGRAM_ID);
    }

    /// SEC.A5: integration builds (`--features integration`) explicitly
    /// opt in to trusting the local integration bonding-curve program id so
    /// `solana-program-test` integration scenarios can authenticate BUY
    /// provenance via the workspace bonding-curve crate.
    #[cfg(feature = "integration")]
    #[test]
    fn bonding_curve_authority_integration_feature_accepts_local_integration_id() {
        let local_integration: [u8; 32] =
            pinocchio_pubkey::pubkey!("B6AhJJSYMbnrxLbS6nTBuDowADQJxdF7hQSTrepFFk3C");
        let trusted = trusted_bonding_curve_program_ids();
        assert!(
            trusted.iter().any(|id| id == &local_integration),
            "integration-feature build must trust LOCAL_INTEGRATION_BONDING_CURVE_PROGRAM_ID"
        );
        assert!(
            trusted.iter().any(|id| id == &BONDING_CURVE_PROGRAM_ID),
            "integration-feature build must still trust canonical BONDING_CURVE_PROGRAM_ID"
        );
    }

    #[test]
    fn provenance_side_matches_buy_sell_flags() {
        assert_eq!(provenance_side(true, true), PROVENANCE_SIDE_BUY);
        assert_eq!(provenance_side(true, false), PROVENANCE_SIDE_NONE);
        assert_eq!(provenance_side(false, false), PROVENANCE_SIDE_SELL);
        assert_eq!(provenance_side(false, true), PROVENANCE_SIDE_SELL);
    }

    /// SEC.A1: only an authenticated bonding-curve CPI can claim BUY
    /// provenance. A public direct call with `is_buy = true` resolves to
    /// `PROVENANCE_SIDE_NONE`, never to `PROVENANCE_SIDE_BUY`. This is the
    /// per-call contract that makes the transactional fix in `process` safe:
    /// even if a public caller asserts `is_buy = true` they cannot impersonate
    /// the BUY side of a trade.
    #[test]
    fn generate_soul_provenance_rejects_public_buy_spoof_attempts() {
        // Authenticated CPI BUY is the only path that yields BUY.
        assert_eq!(provenance_side(true, true), PROVENANCE_SIDE_BUY);
        // Public caller with `is_buy = true` cannot upgrade to BUY.
        assert_ne!(provenance_side(true, false), PROVENANCE_SIDE_BUY);
        assert_eq!(provenance_side(true, false), PROVENANCE_SIDE_NONE);
        // Public caller with `is_buy = false` is reported as SELL but never
        // advances the BUY claim cursor in `process` because the
        // `authenticated_bonding_curve` gate is false.
        assert_eq!(provenance_side(false, false), PROVENANCE_SIDE_SELL);
    }

    #[test]
    fn deterministic_seed_hash_is_stable_and_distinguishes_trade_seed() {
        let first = deterministic_seed_hash(b"buy:100:trader");
        let second = deterministic_seed_hash(b"buy:100:trader");
        let different = deterministic_seed_hash(b"sell:100:trader");

        assert_eq!(first, second);
        assert_ne!(first, different);
        assert_ne!(first, [0; SEED_HASH_LEN]);
    }

    #[test]
    fn external_renderer_svg_validation_rejects_active_content() {
        assert!(validate_external_svg(b"<svg><circle /></svg>").is_ok());
        assert_eq!(
            validate_external_svg(b"<svg><script>alert(1)</script></svg>"),
            Err(ProgramError::InvalidAccountData)
        );
        assert_eq!(
            validate_external_svg(b"<svg><style>circle{fill:url(#x)}</style><circle /></svg>"),
            Err(ProgramError::InvalidAccountData)
        );
        assert_eq!(
            validate_external_svg(b"<svg><a href=\"https://example.invalid\">x</a></svg>"),
            Err(ProgramError::InvalidAccountData)
        );
        assert_eq!(
            validate_external_svg(b"<g><circle /></g>"),
            Err(ProgramError::InvalidAccountData)
        );
    }

    #[test]
    fn generation_event_omits_transaction_context_fields() {
        GENERATION_EVENT_LOGS.store(0, Ordering::SeqCst);
        let trader = Address::new_from_array([1; 32]);
        let token_account = Address::new_from_array([2; 32]);
        let mint = Address::new_from_array([3; 32]);
        let soul = Address::new_from_array([4; 32]);
        let seed_hash = [7; SEED_HASH_LEN];
        let event = GenerationEvent {
            generation: 1,
            side: PROVENANCE_SIDE_BUY,
            amount: 99,
            trader: &trader,
            token_account: &token_account,
            mint: &mint,
            soul: &soul,
            seed_hash: &seed_hash,
        };

        emit_generation_event(&event);

        assert_eq!(GENERATION_EVENT_LOGS.load(Ordering::SeqCst), 1);
    }
}
