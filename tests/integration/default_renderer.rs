#![allow(deprecated, dead_code, unused_imports)]
mod common;

use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, pubkey::Pubkey as ProgramPubkey,
};
use solana_program_test::ProgramTest;
use solana_sdk::{
    account::Account,
    instruction::{AccountMeta, Instruction, InstructionError},
    pubkey::Pubkey,
    rent::Rent,
    signature::{Keypair, Signer},
    system_program, sysvar,
    transaction::{Transaction, TransactionError},
};
use soul_generator::{
    instructions::{
        GENERATE_SOUL_DISCRIMINATOR, INITIALIZE_SOUL_DISCRIMINATOR, UPLOAD_TEMPLATE_DISCRIMINATOR,
    },
    state::{
        render_buffer::{RenderBuffer, RENDER_BUFFER_SEED},
        renderer_registry::{RendererRegistryEntry, RENDERER_REGISTRY_SEED},
        SoulAccount, LAST_SVG_CAPACITY, SOUL_SEED,
    },
};
use std::{env, path::PathBuf};

const GENERATE_SOUL_CU_BUDGET: u64 = 200_000;

fn sdk_pubkey_from_pinocchio(bytes: &[u8]) -> Pubkey {
    Pubkey::new_from_array(bytes.try_into().expect("program id is 32 bytes"))
}

fn derive_unchecked_program_address(seeds: &[&[u8]], program_id: &Pubkey) -> Pubkey {
    let mut hash_inputs = seeds.to_vec();
    hash_inputs.push(program_id.as_ref());
    hash_inputs.push(b"ProgramDerivedAddress");
    Pubkey::new_from_array(solana_program::hash::hashv(&hash_inputs).to_bytes())
}

fn soul_program_id() -> Pubkey {
    sdk_pubkey_from_pinocchio(soul_generator::id().as_ref())
}

fn find_mint_with_no_bump_soul(soul_program_id: &Pubkey) -> (Pubkey, Pubkey) {
    for byte in 1u8..=u8::MAX {
        let mint = Pubkey::new_from_array([byte; 32]);
        if let Ok(soul) =
            Pubkey::create_program_address(&[SOUL_SEED, mint.as_ref()], soul_program_id)
        {
            return (mint, soul);
        }
    }

    panic!("test fixture could not find no-bump soul PDA");
}

fn find_mint_with_no_bump_soul_and_render_buffer(
    soul_program_id: &Pubkey,
    generation: u64,
) -> (Pubkey, Pubkey, Pubkey) {
    let generation_bytes = generation.to_le_bytes();
    for byte in 1u8..=u8::MAX {
        let mint = Pubkey::new_from_array([byte; 32]);
        let Ok(soul) = Pubkey::create_program_address(&[SOUL_SEED, mint.as_ref()], soul_program_id)
        else {
            continue;
        };
        let Ok(render_buffer) = Pubkey::create_program_address(
            &[RENDER_BUFFER_SEED, mint.as_ref(), &generation_bytes],
            soul_program_id,
        ) else {
            continue;
        };
        return (mint, soul, render_buffer);
    }

    panic!("test fixture could not find no-bump soul and render buffer PDAs");
}

fn set_sbf_out_dir() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let sbf_out_dir = manifest_dir.join("target/deploy");
    assert!(
        sbf_out_dir.join("soul_generator.so").exists(),
        "target/deploy/soul_generator.so must exist; run `cargo build-sbf -p soul-generator` before this integration test"
    );
    env::set_var("SBF_OUT_DIR", sbf_out_dir);
}

fn initialize_soul_ix(
    program_id: Pubkey,
    soul: Pubkey,
    mint: Pubkey,
    authority: Pubkey,
    created_at: i64,
) -> Instruction {
    let mut data = Vec::with_capacity(9);
    data.push(INITIALIZE_SOUL_DISCRIMINATOR);
    data.extend_from_slice(&created_at.to_le_bytes());

    Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(soul, false),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new(authority, true),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data,
    }
}

fn generate_soul_ix(
    program_id: Pubkey,
    soul: Pubkey,
    payer: Pubkey,
    swap_amount: u64,
    is_buy: bool,
) -> Instruction {
    let mut data = Vec::with_capacity(10);
    data.push(GENERATE_SOUL_DISCRIMINATOR);
    data.extend_from_slice(&swap_amount.to_le_bytes());
    data.push(u8::from(is_buy));

    Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(soul, false),
            AccountMeta::new_readonly(payer, true),
            AccountMeta::new_readonly(sysvar::slot_hashes::id(), false),
            AccountMeta::new_readonly(common::soul_config_pda(&program_id), false),
        ],
        data,
    }
}

fn generate_community_soul_ix(
    program_id: Pubkey,
    soul: Pubkey,
    payer: Pubkey,
    registry_entry: Pubkey,
    render_buffer: Pubkey,
    renderer_program: Pubkey,
    swap_amount: u64,
    is_buy: bool,
) -> Instruction {
    let mut data = Vec::with_capacity(10);
    data.push(GENERATE_SOUL_DISCRIMINATOR);
    data.extend_from_slice(&swap_amount.to_le_bytes());
    data.push(u8::from(is_buy));

    Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(soul, false),
            AccountMeta::new_readonly(payer, true),
            AccountMeta::new_readonly(sysvar::slot_hashes::id(), false),
            AccountMeta::new_readonly(common::soul_config_pda(&program_id), false),
            AccountMeta::new_readonly(registry_entry, false),
            AccountMeta::new(render_buffer, false),
            AccountMeta::new_readonly(renderer_program, false),
        ],
        data,
    }
}

fn upload_theme_ix(
    program_id: Pubkey,
    soul: Pubkey,
    authority: Pubkey,
    style_params: &[u8],
) -> Instruction {
    let mut data = Vec::with_capacity(1 + 2 + 2 + style_params.len());
    data.push(UPLOAD_TEMPLATE_DISCRIMINATOR);
    data.extend_from_slice(&0u16.to_le_bytes());
    data.extend_from_slice(&(style_params.len() as u16).to_le_bytes());
    data.extend_from_slice(style_params);

    Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(soul, false),
            AccountMeta::new_readonly(authority, true),
            AccountMeta::new_readonly(common::soul_config_pda(&program_id), false),
        ],
        data,
    }
}

fn renderer_registry_pda(program_id: &Pubkey, renderer_id: u32) -> Pubkey {
    derive_unchecked_program_address(
        &[RENDERER_REGISTRY_SEED, &renderer_id.to_le_bytes()],
        program_id,
    )
}

fn active_renderer_registry_account(
    owner: Pubkey,
    renderer_id: u32,
    renderer_program: Pubkey,
    author: Pubkey,
) -> Account {
    let mut data = vec![0u8; RendererRegistryEntry::LEN];
    data[RendererRegistryEntry::RENDERER_ID_OFFSET..RendererRegistryEntry::PROGRAM_ID_OFFSET]
        .copy_from_slice(&renderer_id.to_le_bytes());
    data[RendererRegistryEntry::PROGRAM_ID_OFFSET..RendererRegistryEntry::AUTHOR_OFFSET]
        .copy_from_slice(renderer_program.as_ref());
    data[RendererRegistryEntry::AUTHOR_OFFSET..RendererRegistryEntry::IS_ACTIVE_OFFSET]
        .copy_from_slice(author.as_ref());
    data[RendererRegistryEntry::IS_ACTIVE_OFFSET] = 1;
    data[RendererRegistryEntry::CREATED_AT_OFFSET..RendererRegistryEntry::TOTAL_RENDERS_OFFSET]
        .copy_from_slice(&1_714_200_000i64.to_le_bytes());
    data[RendererRegistryEntry::TOTAL_RENDERS_OFFSET..RendererRegistryEntry::LEN]
        .copy_from_slice(&0u64.to_le_bytes());

    Account {
        lamports: Rent::default().minimum_balance(RendererRegistryEntry::LEN),
        data,
        owner,
        executable: false,
        rent_epoch: 0,
    }
}

fn preloaded_render_buffer_account(
    owner: Pubkey,
    renderer_id: u32,
    generation: u64,
    svg: &[u8],
) -> Account {
    assert!(svg.len() <= LAST_SVG_CAPACITY);
    let mut data = vec![0u8; RenderBuffer::LEN];
    data[RenderBuffer::RENDERER_ID_OFFSET..RenderBuffer::GENERATION_OFFSET]
        .copy_from_slice(&renderer_id.to_le_bytes());
    data[RenderBuffer::GENERATION_OFFSET..RenderBuffer::SVG_LEN_OFFSET]
        .copy_from_slice(&generation.to_le_bytes());
    data[RenderBuffer::SVG_LEN_OFFSET..RenderBuffer::RESERVED_OFFSET]
        .copy_from_slice(&(svg.len() as u16).to_le_bytes());
    data[RenderBuffer::SVG_OFFSET..RenderBuffer::SVG_OFFSET + svg.len()].copy_from_slice(svg);

    Account {
        lamports: Rent::default().minimum_balance(RenderBuffer::LEN),
        data,
        owner,
        executable: false,
        rent_epoch: 0,
    }
}

fn malicious_renderer_noop(
    _program_id: &ProgramPubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    assert_eq!(instruction_data.first().copied(), Some(0));
    assert!(!accounts.is_empty(), "render buffer account is passed");
    Ok(())
}

fn assert_pd14_neonpuff_default_svg(svg: &str, byte_len: usize) {
    assert!(svg.starts_with("<svg"));
    assert!(svg.contains("data-soul=\"pd14-neonpuff\""));
    assert!(svg.contains("data-engine=\"pd16-trait-layer-composer\""));
    assert!(svg.contains("data-style=\"premium-neon-vector\""));
    assert!(svg.contains("data-cue=\"rainbow-horse-solana-puff\""));
    for layer in [
        "id=\"layer-background\"",
        "id=\"layer-aura\"",
        "id=\"neonpuff-unicorn-profile\"",
        "id=\"layer-eyes\"",
        "id=\"layer-expression\"",
        "id=\"layer-outfit\"",
        "id=\"layer-relic\"",
    ] {
        assert!(
            svg.contains(layer),
            "missing trait SVG layer {layer}: {svg}"
        );
    }
    assert!(svg.contains("#9945ff"));
    assert!(svg.contains("#14f195"));
    assert!(svg.contains("<rect"));
    assert!(svg.contains("<path"));
    assert!(
        svg.contains("<animate") || svg.contains("<animateTransform"),
        "default trait SVG should include safe inline animation: {svg}"
    );
    assert!(svg.contains("linearGradient"));
    assert!(byte_len <= LAST_SVG_CAPACITY);
    let lower = svg.to_ascii_lowercase();
    for forbidden in [
        "pixel", "block", "grid", "sprite", "hsl(", "<image", "<script", "<style", "href=",
        "http://", "https://", "ipfs", "arweave", "font",
    ] {
        assert!(
            !lower.contains(forbidden),
            "default PD14 NeonPuff SVG must not contain {forbidden}: {svg}"
        );
    }
    assert!(!lower.contains("url(http"));
    assert!(!lower.contains("url(//"));
}

#[tokio::test]
async fn community_renderer_active_content_is_rejected_after_cpi() {
    set_sbf_out_dir();

    let soul_program_id = soul_program_id();
    let renderer_program_id = Pubkey::new_unique();
    let renderer_id = 0x0001_0001;
    let (mint, soul, render_buffer) =
        find_mint_with_no_bump_soul_and_render_buffer(&soul_program_id, 1);
    let registry_entry = renderer_registry_pda(&soul_program_id, renderer_id);
    let malicious_svg = b"<svg><script>alert(1)</script></svg>";

    let mut program_test = ProgramTest::new("soul_generator", soul_program_id, None);
    program_test.prefer_bpf(false);
    program_test.add_program(
        "malicious_renderer_noop",
        renderer_program_id,
        solana_program_test::processor!(malicious_renderer_noop),
    );
    common::add_unpaused_soul_config(&mut program_test, soul_program_id, Pubkey::new_unique());
    program_test.add_account(
        registry_entry,
        active_renderer_registry_account(
            soul_program_id,
            renderer_id,
            renderer_program_id,
            Pubkey::new_unique(),
        ),
    );
    program_test.add_account(
        render_buffer,
        // The native renderer program returns successfully, and soul-generator
        // then validates the post-CPI RenderBuffer bytes it would consume from
        // a community renderer. Preloading the soul-generator-owned buffer keeps
        // this fixture focused on the end-to-end SBF dispatch/registry/CPI
        // validation boundary without relaxing account ownership semantics.
        preloaded_render_buffer_account(soul_program_id, renderer_id, 1, malicious_svg),
    );

    let context = program_test.start_with_context().await;
    let initialize = initialize_soul_ix(
        soul_program_id,
        soul,
        mint,
        context.payer.pubkey(),
        1_714_200_000,
    );
    let initialize_transaction = Transaction::new_signed_with_payer(
        &[initialize],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        context.last_blockhash,
    );
    context
        .banks_client
        .process_transaction(initialize_transaction)
        .await
        .expect("initialize_soul transaction succeeds");

    let upload_blockhash = context
        .banks_client
        .get_latest_blockhash()
        .await
        .expect("upload blockhash");
    let upload = upload_theme_ix(
        soul_program_id,
        soul,
        context.payer.pubkey(),
        b"renderer_id=0x00010001",
    );
    let upload_transaction = Transaction::new_signed_with_payer(
        &[upload],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        upload_blockhash,
    );
    context
        .banks_client
        .process_transaction(upload_transaction)
        .await
        .expect("community renderer style upload succeeds");

    let generate_blockhash = context
        .banks_client
        .get_latest_blockhash()
        .await
        .expect("generate blockhash");
    let generate = generate_community_soul_ix(
        soul_program_id,
        soul,
        context.payer.pubkey(),
        registry_entry,
        render_buffer,
        renderer_program_id,
        100_000_000,
        true,
    );
    let generate_transaction = Transaction::new_signed_with_payer(
        &[generate],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        generate_blockhash,
    );
    let err = context
        .banks_client
        .process_transaction(generate_transaction)
        .await
        .expect_err("malicious community renderer SVG must be rejected");
    match err {
        solana_program_test::BanksClientError::TransactionError(
            TransactionError::InstructionError(0, InstructionError::InvalidAccountData),
        ) => {}
        other => panic!("expected InvalidAccountData rejection for malicious SVG, got {other:?}"),
    }

    let soul_account = context
        .banks_client
        .get_account(soul)
        .await
        .expect("soul fetch succeeds")
        .expect("soul account exists");
    let soul_state = SoulAccount::unpack(&soul_account.data).expect("soul unpacks");
    let last_svg_len = soul_state.last_svg_len;
    assert_eq!(
        last_svg_len, 0,
        "rejected malicious community renderer output must not persist into the Soul account"
    );
}

#[tokio::test]
async fn default_generate_soul_writes_trait_layered_neonpuff_svg_under_cu_budget() {
    set_sbf_out_dir();

    let soul_program_id = soul_program_id();
    let (mint, soul) = find_mint_with_no_bump_soul(&soul_program_id);

    let mut program_test = ProgramTest::new("soul_generator", soul_program_id, None);
    common::add_unpaused_soul_config(&mut program_test, soul_program_id, Pubkey::new_unique());

    let context = program_test.start_with_context().await;
    let initialize = initialize_soul_ix(
        soul_program_id,
        soul,
        mint,
        context.payer.pubkey(),
        1_714_200_000,
    );
    let initialize_transaction = Transaction::new_signed_with_payer(
        &[initialize],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        context.last_blockhash,
    );
    context
        .banks_client
        .process_transaction(initialize_transaction)
        .await
        .expect("initialize_soul transaction succeeds");

    let latest_blockhash = context
        .banks_client
        .get_latest_blockhash()
        .await
        .expect("latest blockhash");
    let generate = generate_soul_ix(
        soul_program_id,
        soul,
        context.payer.pubkey(),
        100_000_000,
        true,
    );
    let generate_transaction = Transaction::new_signed_with_payer(
        &[generate],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        latest_blockhash,
    );
    let generate_result = context
        .banks_client
        .process_transaction_with_metadata(generate_transaction)
        .await
        .expect("generate_soul metadata result returns");
    generate_result
        .result
        .expect("generate_soul transaction succeeds");
    let compute_units_consumed = generate_result
        .metadata
        .expect("generate_soul metadata is present")
        .compute_units_consumed;
    assert!(
        compute_units_consumed < GENERATE_SOUL_CU_BUDGET,
        "generate_soul consumed {compute_units_consumed} CU, budget is {GENERATE_SOUL_CU_BUDGET}"
    );

    let soul_account = context
        .banks_client
        .get_account(soul)
        .await
        .expect("soul fetch succeeds")
        .expect("soul account exists");
    let soul_state = SoulAccount::unpack(&soul_account.data).expect("soul unpacks");
    let generation_count = soul_state.generation_count;
    let last_svg_len = soul_state.last_svg_len as usize;
    let template_len = soul_state.template_len;
    let svg = std::str::from_utf8(&soul_state.last_svg[..last_svg_len]).expect("utf8 svg");

    // SEC.A1: a public direct generate_soul call (no bonding-curve CPI) is
    // cosmetic-only; it must NOT advance the claim provenance counter.
    assert_eq!(
        generation_count, 0,
        "public direct generate_soul must not advance generation_count (SEC.A1)"
    );
    assert_eq!(template_len, 0, "test must exercise the default renderer");
    assert_pd14_neonpuff_default_svg(svg, last_svg_len);
    println!(
        "PD14 NeonPuff default SVG length: {last_svg_len} bytes; generate_soul CU: {compute_units_consumed}"
    );
}

#[tokio::test]
async fn pd10_builtin_themes_write_distinct_svgs_under_cu_budget() {
    set_sbf_out_dir();

    let soul_program_id = soul_program_id();
    let (mint, soul) = find_mint_with_no_bump_soul(&soul_program_id);

    let mut program_test = ProgramTest::new("soul_generator", soul_program_id, None);
    common::add_unpaused_soul_config(&mut program_test, soul_program_id, Pubkey::new_unique());

    let context = program_test.start_with_context().await;
    let initialize = initialize_soul_ix(
        soul_program_id,
        soul,
        mint,
        context.payer.pubkey(),
        1_714_200_000,
    );
    let initialize_transaction = Transaction::new_signed_with_payer(
        &[initialize],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        context.last_blockhash,
    );
    context
        .banks_client
        .process_transaction(initialize_transaction)
        .await
        .expect("initialize_soul transaction succeeds");

    let fixtures = [
        (
            "neonpuff",
            b"theme=neonpuff".as_slice(),
            "data-soul=\"pd14-neonpuff\"",
        ),
        (
            "monochrome",
            b"theme=monochrome".as_slice(),
            "data-soul=\"pd9-monochrome\"",
        ),
        (
            "hexagram",
            b"theme=hexagram".as_slice(),
            "data-soul=\"pd9-hexagram\"",
        ),
        (
            "signal",
            b"theme=signal".as_slice(),
            "data-soul=\"pd10-signal\"",
        ),
    ];
    let mut rendered_svgs = Vec::new();

    for (index, (theme, style_params, marker)) in fixtures.iter().enumerate() {
        let blockhash = context
            .banks_client
            .get_latest_blockhash()
            .await
            .expect("upload blockhash");
        let upload = upload_theme_ix(soul_program_id, soul, context.payer.pubkey(), style_params);
        let upload_transaction = Transaction::new_signed_with_payer(
            &[upload],
            Some(&context.payer.pubkey()),
            &[&context.payer],
            blockhash,
        );
        context
            .banks_client
            .process_transaction(upload_transaction)
            .await
            .expect("theme style upload succeeds");

        let blockhash = context
            .banks_client
            .get_latest_blockhash()
            .await
            .expect("generate blockhash");
        let generate = generate_soul_ix(
            soul_program_id,
            soul,
            context.payer.pubkey(),
            100_000_000 + index as u64,
            true,
        );
        let generate_transaction = Transaction::new_signed_with_payer(
            &[generate],
            Some(&context.payer.pubkey()),
            &[&context.payer],
            blockhash,
        );
        let generate_result = context
            .banks_client
            .process_transaction_with_metadata(generate_transaction)
            .await
            .expect("generate_soul metadata result returns");
        generate_result
            .result
            .expect("generate_soul transaction succeeds");
        let compute_units_consumed = generate_result
            .metadata
            .expect("generate_soul metadata is present")
            .compute_units_consumed;
        assert!(
            compute_units_consumed < GENERATE_SOUL_CU_BUDGET,
            "{theme} generate_soul consumed {compute_units_consumed} CU, budget is {GENERATE_SOUL_CU_BUDGET}"
        );

        let soul_account = context
            .banks_client
            .get_account(soul)
            .await
            .expect("soul fetch succeeds")
            .expect("soul account exists");
        let soul_state = SoulAccount::unpack(&soul_account.data).expect("soul unpacks");
        let last_svg_len = soul_state.last_svg_len as usize;
        let svg = std::str::from_utf8(&soul_state.last_svg[..last_svg_len]).expect("utf8 svg");
        assert!(last_svg_len <= LAST_SVG_CAPACITY);
        assert!(
            svg.contains(marker),
            "{theme} SVG should contain {marker}: {svg}"
        );
        println!(
            "PD10 {theme} SVG length: {last_svg_len} bytes; generate_soul CU: {compute_units_consumed}"
        );
        rendered_svgs.push(svg.to_owned());
    }

    assert_ne!(rendered_svgs[0], rendered_svgs[1]);
    assert_ne!(rendered_svgs[0], rendered_svgs[2]);
    assert_ne!(rendered_svgs[0], rendered_svgs[3]);
    assert_ne!(rendered_svgs[1], rendered_svgs[2]);
    assert_ne!(rendered_svgs[1], rendered_svgs[3]);
    assert_ne!(rendered_svgs[2], rendered_svgs[3]);
}

#[tokio::test]
async fn soulpuff_builtin_writes_distinct_svg_under_cu_budget() {
    set_sbf_out_dir();

    let soul_program_id = soul_program_id();
    let (mint, soul) = find_mint_with_no_bump_soul(&soul_program_id);

    let mut program_test = ProgramTest::new("soul_generator", soul_program_id, None);
    common::add_unpaused_soul_config(&mut program_test, soul_program_id, Pubkey::new_unique());

    let context = program_test.start_with_context().await;
    let initialize = initialize_soul_ix(
        soul_program_id,
        soul,
        mint,
        context.payer.pubkey(),
        1_714_200_000,
    );
    let initialize_transaction = Transaction::new_signed_with_payer(
        &[initialize],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        context.last_blockhash,
    );
    context
        .banks_client
        .process_transaction(initialize_transaction)
        .await
        .expect("initialize_soul transaction succeeds");

    let upload_blockhash = context
        .banks_client
        .get_latest_blockhash()
        .await
        .expect("upload blockhash");
    let upload = upload_theme_ix(
        soul_program_id,
        soul,
        context.payer.pubkey(),
        b"theme=soulpuff",
    );
    let upload_transaction = Transaction::new_signed_with_payer(
        &[upload],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        upload_blockhash,
    );
    context
        .banks_client
        .process_transaction(upload_transaction)
        .await
        .expect("SoulPuff style upload succeeds");

    let generate_blockhash = context
        .banks_client
        .get_latest_blockhash()
        .await
        .expect("generate blockhash");
    let generate = generate_soul_ix(
        soul_program_id,
        soul,
        context.payer.pubkey(),
        123_456_789,
        true,
    );
    let generate_transaction = Transaction::new_signed_with_payer(
        &[generate],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        generate_blockhash,
    );
    let generate_result = context
        .banks_client
        .process_transaction_with_metadata(generate_transaction)
        .await
        .expect("generate_soul metadata result returns");
    generate_result
        .result
        .expect("SoulPuff generate_soul transaction succeeds");
    let compute_units_consumed = generate_result
        .metadata
        .expect("generate_soul metadata is present")
        .compute_units_consumed;
    assert!(
        compute_units_consumed < GENERATE_SOUL_CU_BUDGET,
        "SoulPuff generate_soul consumed {compute_units_consumed} CU, budget is {GENERATE_SOUL_CU_BUDGET}"
    );

    let soul_account = context
        .banks_client
        .get_account(soul)
        .await
        .expect("soul fetch succeeds")
        .expect("soul account exists");
    let soul_state = SoulAccount::unpack(&soul_account.data).expect("soul unpacks");
    let last_svg_len = soul_state.last_svg_len as usize;
    let svg = std::str::from_utf8(&soul_state.last_svg[..last_svg_len]).expect("utf8 svg");
    assert!(last_svg_len <= LAST_SVG_CAPACITY);
    assert!(svg.contains("data-soul=\"pd12-soulpuff\""), "{svg}");
    assert!(svg.contains("id=\"soulpuff-figure\""), "{svg}");
    assert!(svg.contains("data-accent=\"rainbow-puff\""), "{svg}");
    assert_ne!(
        svg,
        std::str::from_utf8(&rendered_monochrome_fixture()).expect("fixture utf8")
    );
    println!(
        "PD12 SoulPuff SVG length: {last_svg_len} bytes; generate_soul CU: {compute_units_consumed}"
    );
}

fn rendered_monochrome_fixture() -> Vec<u8> {
    let mut buf = [0u8; LAST_SVG_CAPACITY];
    let len = soul_generator::svg::monochrome::generate_monochrome_soul_svg(
        b"pd12-soulpuff-comparison",
        &mut buf,
    )
    .expect("monochrome fixture renders");
    buf[..len].to_vec()
}
