#![allow(deprecated, dead_code, unused_imports)]
mod common;

use solana_program_test::ProgramTest;
use solana_sdk::{
    account::Account,
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    rent::Rent,
    signature::Signer,
    system_program,
    transaction::Transaction,
};
use soul_generator::{
    instructions::{
        GENERATE_SOUL_DISCRIMINATOR, INITIALIZE_SOUL_DISCRIMINATOR, UPLOAD_TEMPLATE_DISCRIMINATOR,
    },
    state::{SoulAccount, SOUL_SEED},
};
use std::{env, path::PathBuf};

fn sdk_pubkey_from_pinocchio(bytes: &[u8]) -> Pubkey {
    Pubkey::new_from_array(bytes.try_into().expect("program id is 32 bytes"))
}

fn program_id() -> Pubkey {
    sdk_pubkey_from_pinocchio(soul_generator::id().as_ref())
}

fn find_mint_with_no_bump_soul_pda(program_id: &Pubkey) -> (Pubkey, Pubkey) {
    for byte in 1u8..=u8::MAX {
        let mint = Pubkey::new_from_array([byte; 32]);
        if let Ok(soul) = Pubkey::create_program_address(&[SOUL_SEED, mint.as_ref()], program_id) {
            return (mint, soul);
        }
    }

    panic!("test fixture could not find an off-curve soul PDA without a bump");
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

fn initialize_ix(
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

fn upload_template_ix(
    program_id: Pubkey,
    soul: Pubkey,
    authority: Pubkey,
    template: &[u8],
    style_params: &[u8],
) -> Instruction {
    let template_len = u16::try_from(template.len()).expect("template test fixture fits u16");
    let style_params_len =
        u16::try_from(style_params.len()).expect("style params test fixture fits u16");
    let mut data = Vec::with_capacity(1 + 2 + template.len() + 2 + style_params.len());
    data.push(UPLOAD_TEMPLATE_DISCRIMINATOR);
    data.extend_from_slice(&template_len.to_le_bytes());
    data.extend_from_slice(template);
    data.extend_from_slice(&style_params_len.to_le_bytes());
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

fn generate_ix(program_id: Pubkey, soul: Pubkey, payer: Pubkey) -> Instruction {
    let mut data = Vec::with_capacity(10);
    data.push(GENERATE_SOUL_DISCRIMINATOR);
    data.extend_from_slice(&100_000_000u64.to_le_bytes());
    data.push(1);

    Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(soul, false),
            AccountMeta::new_readonly(payer, true),
            AccountMeta::new_readonly(solana_sdk::sysvar::slot_hashes::id(), false),
            AccountMeta::new_readonly(common::soul_config_pda(&program_id), false),
        ],
        data,
    }
}

#[tokio::test]
async fn upload_template_persists_template_and_style_bytes() {
    set_sbf_out_dir();

    let program_id = program_id();
    let (mint, soul) = find_mint_with_no_bump_soul_pda(&program_id);
    let template = b"<svg><rect fill=\"{{HUE}}\" /></svg>";
    let style_params = b"mode=hsl;evolution=3";

    let mut program_test = ProgramTest::new("soul_generator", program_id, None);
    common::add_unpaused_soul_config(&mut program_test, program_id, Pubkey::new_unique());
    program_test.add_account(
        mint,
        Account {
            lamports: Rent::default().minimum_balance(0).max(1),
            data: Vec::new(),
            owner: solana_sdk::system_program::id(),
            executable: false,
            rent_epoch: 0,
        },
    );

    let context = program_test.start_with_context().await;
    let init = initialize_ix(
        program_id,
        soul,
        mint,
        context.payer.pubkey(),
        1_714_200_000,
    );
    let init_transaction = Transaction::new_signed_with_payer(
        &[init],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        context.last_blockhash,
    );
    context
        .banks_client
        .process_transaction(init_transaction)
        .await
        .expect("initialize_soul transaction succeeds");

    let recent_blockhash = context
        .banks_client
        .get_latest_blockhash()
        .await
        .expect("latest blockhash");
    let upload = upload_template_ix(
        program_id,
        soul,
        context.payer.pubkey(),
        template,
        style_params,
    );
    let upload_transaction = Transaction::new_signed_with_payer(
        &[upload],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        recent_blockhash,
    );
    context
        .banks_client
        .process_transaction(upload_transaction)
        .await
        .expect("upload_template transaction succeeds");

    let soul_account = context
        .banks_client
        .get_account(soul)
        .await
        .expect("account fetch succeeds")
        .expect("soul account exists");
    let state = SoulAccount::unpack(&soul_account.data).expect("soul account unpacks");
    let template_len = usize::from(state.template_len);
    let style_params_len = usize::from(state.style_params_len);

    assert_eq!(template_len, template.len());
    assert_eq!(
        &state.base_svg_template[..template_len],
        template.as_slice()
    );
    assert_eq!(style_params_len, style_params.len());
    assert_eq!(
        &state.style_params[..style_params_len],
        style_params.as_slice()
    );

    let recent_blockhash = context
        .banks_client
        .get_latest_blockhash()
        .await
        .expect("latest blockhash for generation");
    let generate = generate_ix(program_id, soul, context.payer.pubkey());
    let generate_transaction = Transaction::new_signed_with_payer(
        &[generate],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        recent_blockhash,
    );
    context
        .banks_client
        .process_transaction(generate_transaction)
        .await
        .expect("generate_soul transaction succeeds with uploaded template");

    let soul_account = context
        .banks_client
        .get_account(soul)
        .await
        .expect("account fetch after generation succeeds")
        .expect("soul account still exists");
    let state = SoulAccount::unpack(&soul_account.data).expect("soul account unpacks");
    let svg = std::str::from_utf8(&state.last_svg[..usize::from(state.last_svg_len)])
        .expect("generated svg utf8");
    assert!(svg.contains("<rect fill=\""));
    assert!(!svg.contains("{{HUE}}"));
}

#[tokio::test]
async fn upload_template_rejects_external_svg_references() {
    set_sbf_out_dir();

    let program_id = program_id();
    let (mint, soul) = find_mint_with_no_bump_soul_pda(&program_id);
    let mut program_test = ProgramTest::new("soul_generator", program_id, None);
    common::add_unpaused_soul_config(&mut program_test, program_id, Pubkey::new_unique());
    program_test.add_account(
        mint,
        Account {
            lamports: Rent::default().minimum_balance(0).max(1),
            data: Vec::new(),
            owner: solana_sdk::system_program::id(),
            executable: false,
            rent_epoch: 0,
        },
    );

    let context = program_test.start_with_context().await;
    let init = initialize_ix(
        program_id,
        soul,
        mint,
        context.payer.pubkey(),
        1_714_200_000,
    );
    let init_transaction = Transaction::new_signed_with_payer(
        &[init],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        context.last_blockhash,
    );
    context
        .banks_client
        .process_transaction(init_transaction)
        .await
        .expect("initialize_soul transaction succeeds");

    let recent_blockhash = context
        .banks_client
        .get_latest_blockhash()
        .await
        .expect("latest blockhash");
    let upload = upload_template_ix(
        program_id,
        soul,
        context.payer.pubkey(),
        br#"<svg><image href="https://example.invalid/soul.png" /></svg>"#,
        b"",
    );
    let upload_transaction = Transaction::new_signed_with_payer(
        &[upload],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        recent_blockhash,
    );
    let err = context
        .banks_client
        .process_transaction(upload_transaction)
        .await
        .expect_err("external references are rejected before storage");
    let text = format!("{err:?}");
    assert!(text.contains("InvalidInstructionData"));
}
