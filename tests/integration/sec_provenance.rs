#![allow(deprecated, dead_code, unused_imports)]

//! SEC.A1 — Public direct `generate_soul` calls must not overwrite, advance,
//! or spoof the authenticated BUY provenance cursor used by `claim_soul`.
//!
//! This file exercises the `process` entrypoint of `soul_generator` against a
//! real `solana-program-test` runtime so the assertions hold for the BPF
//! binary rather than only for in-process Rust unit tests.

mod common;

use bonding_curve::{
    instructions::{BUY_DISCRIMINATOR, CREATE_TOKEN_DISCRIMINATOR},
    math::{calculate_lock_fee, quote_buy},
    state::{CURVE_SEED, TREASURY_SEED, VAULT_SEED},
};
use solana_program_pack::Pack;
use solana_program_test::ProgramTest;
use solana_sdk::{
    account::Account,
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    rent::Rent,
    signature::{Keypair, Signer},
    system_instruction, system_program, sysvar,
    transaction::Transaction,
};
use soul_generator::{
    instructions::{GENERATE_SOUL_DISCRIMINATOR, INITIALIZE_SOUL_DISCRIMINATOR},
    state::{SoulAccount, PROVENANCE_SIDE_BUY, PROVENANCE_SIDE_NONE, SOUL_SEED},
};
use spl_token_2022::state::{Account as TokenAccount, Mint};
use std::{env, path::PathBuf};

fn sdk_pubkey_from_pinocchio(bytes: &[u8]) -> Pubkey {
    Pubkey::new_from_array(bytes.try_into().expect("program id is 32 bytes"))
}

fn bonding_program_id() -> Pubkey {
    sdk_pubkey_from_pinocchio(bonding_curve::id().as_ref())
}

fn soul_program_id() -> Pubkey {
    sdk_pubkey_from_pinocchio(soul_generator::id().as_ref())
}

fn find_mint_with_no_bump_soul_pda(soul_program_id: &Pubkey) -> (Pubkey, Pubkey) {
    for byte in 1u8..=u8::MAX {
        let mint = Pubkey::new_from_array([byte; 32]);
        if let Ok(soul) =
            Pubkey::create_program_address(&[SOUL_SEED, mint.as_ref()], soul_program_id)
        {
            return (mint, soul);
        }
    }
    panic!("could not find no-bump soul PDA");
}

fn find_mint_with_no_bump_pdas(
    bonding_program_id: &Pubkey,
    soul_program_id: &Pubkey,
) -> (Pubkey, Pubkey, Pubkey, Pubkey, Pubkey) {
    let treasury = Pubkey::create_program_address(&[TREASURY_SEED], bonding_program_id)
        .expect("treasury PDA must be off-curve for fixed program id");
    for byte in 1u8..=u8::MAX {
        let mint = Pubkey::new_from_array([byte; 32]);
        let curve =
            Pubkey::create_program_address(&[CURVE_SEED, mint.as_ref()], bonding_program_id);
        let vault =
            Pubkey::create_program_address(&[VAULT_SEED, mint.as_ref()], bonding_program_id);
        let soul = Pubkey::create_program_address(&[SOUL_SEED, mint.as_ref()], soul_program_id);
        if let (Ok(curve), Ok(vault), Ok(soul)) = (curve, vault, soul) {
            return (mint, curve, vault, treasury, soul);
        }
    }

    panic!("test fixture could not find no-bump curve, vault, and soul PDAs");
}

fn set_sbf_out_dir() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let sbf_out_dir = manifest_dir.join("target/deploy");
    assert!(
        sbf_out_dir.join("bonding_curve.so").exists(),
        "target/deploy/bonding_curve.so must exist; run `cargo build-sbf -p bonding-curve` first"
    );
    assert!(
        sbf_out_dir.join("soul_generator.so").exists(),
        "target/deploy/soul_generator.so must exist; run `cargo build-sbf -p soul-generator` first"
    );
    env::set_var("SBF_OUT_DIR", sbf_out_dir);
}

fn create_token_ix(
    program_id: Pubkey,
    curve: Pubkey,
    vault: Pubkey,
    treasury: Pubkey,
    mint: Pubkey,
    payer: Pubkey,
) -> Instruction {
    Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(curve, false),
            AccountMeta::new(vault, false),
            AccountMeta::new(treasury, false),
            AccountMeta::new_readonly(common::bonding_config_pda(&program_id), false),
            AccountMeta::new(mint, false),
            AccountMeta::new(payer, true),
            AccountMeta::new_readonly(spl_token_2022::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: vec![CREATE_TOKEN_DISCRIMINATOR],
    }
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

#[allow(clippy::too_many_arguments)]
fn buy_ix(
    _program_id: Pubkey,
    curve: Pubkey,
    vault: Pubkey,
    mint: Pubkey,
    buyer_token_account: Pubkey,
    buyer: Pubkey,
    soul: Pubkey,
    soul_program_id: Pubkey,
    sol_in: u64,
    min_amount_out: u64,
) -> Instruction {
    let mut data = Vec::with_capacity(17);
    data.push(BUY_DISCRIMINATOR);
    data.extend_from_slice(&sol_in.to_le_bytes());
    data.extend_from_slice(&min_amount_out.to_le_bytes());

    Instruction {
        program_id: bonding_program_id(),
        accounts: vec![
            AccountMeta::new(curve, false),                              // 0
            AccountMeta::new(vault, false),                              // 1
            AccountMeta::new(mint, false),                               // 2
            AccountMeta::new(buyer_token_account, false),                // 3
            AccountMeta::new(buyer, true),                               // 4
            AccountMeta::new_readonly(spl_token_2022::id(), false),      // 5
            AccountMeta::new_readonly(system_program::id(), false),      // 6
            AccountMeta::new(soul, false),                               // 7
            AccountMeta::new_readonly(soul_program_id, false),           // 8
            AccountMeta::new_readonly(sysvar::slot_hashes::id(), false), // 9
            AccountMeta::new_readonly(common::soul_config_pda(&soul_program_id), false), // 10
            AccountMeta::new_readonly(common::bonding_config_pda(&bonding_program_id()), false), // 11
        ],
        data,
    }
}

fn public_generate_soul_ix(
    soul_program_id: Pubkey,
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
        program_id: soul_program_id,
        accounts: vec![
            AccountMeta::new(soul, false),
            AccountMeta::new_readonly(payer, true),
            AccountMeta::new_readonly(sysvar::slot_hashes::id(), false),
            AccountMeta::new_readonly(common::soul_config_pda(&soul_program_id), false),
        ],
        data,
    }
}

/// SEC.A5: under the `--features integration` opt-in, the local integration
/// bonding-curve program id (the workspace `bonding-curve` crate's
/// `declare_id!`) is trusted as an authenticated CPI authority for Soul
/// provenance writes. This test is the integration-feature-gated equivalent
/// of the soul-generator unit test
/// `bonding_curve_authority_integration_feature_accepts_local_integration_id`,
/// and runs against the real `solana-program-test` SBF runtime so workers
/// have an SBF-level signal that the integration gate works end-to-end.
///
/// The default (non-integration) SBF binary rejects the same authority and
/// would fail this test; the existence of the test under the
/// `--features integration` gate is the explicit opt-in surface required by
/// SEC.F5.
#[tokio::test]
async fn local_integration_bonding_curve_authority_records_buy_provenance_via_cpi() {
    set_sbf_out_dir();

    let bonding_program_id = bonding_program_id();
    let soul_program_id = soul_program_id();
    let (mint, curve, vault, treasury, soul) =
        find_mint_with_no_bump_pdas(&bonding_program_id, &soul_program_id);

    let mut program_test = ProgramTest::new("bonding_curve", bonding_program_id, None);
    program_test.add_program("soul_generator", soul_program_id, None);
    common::add_unpaused_bonding_config(
        &mut program_test,
        bonding_program_id,
        Pubkey::new_unique(),
    );
    common::add_unpaused_soul_config(&mut program_test, soul_program_id, Pubkey::new_unique());
    program_test.add_account(
        mint,
        Account {
            lamports: 1_000_000_000,
            data: vec![0; Mint::LEN],
            owner: spl_token_2022::id(),
            executable: false,
            rent_epoch: 0,
        },
    );

    let context = program_test.start_with_context().await;

    let create = create_token_ix(
        bonding_program_id,
        curve,
        vault,
        treasury,
        mint,
        context.payer.pubkey(),
    );
    let create_transaction = Transaction::new_signed_with_payer(
        &[create],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        context.last_blockhash,
    );
    context
        .banks_client
        .process_transaction(create_transaction)
        .await
        .expect("create_token transaction succeeds");

    let initialize_soul = initialize_soul_ix(
        soul_program_id,
        soul,
        mint,
        context.payer.pubkey(),
        1_714_200_000,
    );
    let blockhash = context
        .banks_client
        .get_latest_blockhash()
        .await
        .expect("latest blockhash");
    let initialize_soul_transaction = Transaction::new_signed_with_payer(
        &[initialize_soul],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        blockhash,
    );
    context
        .banks_client
        .process_transaction(initialize_soul_transaction)
        .await
        .expect("initialize_soul transaction succeeds");

    // Buyer token account (Token-2022).
    let buyer_token_account = Keypair::new();
    let rent = Rent::default();
    let create_token_account = system_instruction::create_account(
        &context.payer.pubkey(),
        &buyer_token_account.pubkey(),
        rent.minimum_balance(TokenAccount::LEN),
        TokenAccount::LEN as u64,
        &spl_token_2022::id(),
    );
    let initialize_token_account = spl_token_2022::instruction::initialize_account3(
        &spl_token_2022::id(),
        &buyer_token_account.pubkey(),
        &mint,
        &context.payer.pubkey(),
    )
    .expect("initialize_account3 instruction builds");
    let blockhash = context
        .banks_client
        .get_latest_blockhash()
        .await
        .expect("latest blockhash");
    let token_account_transaction = Transaction::new_signed_with_payer(
        &[create_token_account, initialize_token_account],
        Some(&context.payer.pubkey()),
        &[&context.payer, &buyer_token_account],
        blockhash,
    );
    context
        .banks_client
        .process_transaction(token_account_transaction)
        .await
        .expect("buyer token account initializes");

    let sol_in = 100_000_000u64;
    let lock_fee = calculate_lock_fee(sol_in).expect("lock fee math succeeds");
    let net_sol_in = sol_in.checked_sub(lock_fee).expect("net buy amount fits");
    let buy_quote = quote_buy(0, 0, net_sol_in, 1).expect("buy quote succeeds");
    let blockhash = context
        .banks_client
        .get_latest_blockhash()
        .await
        .expect("latest blockhash");
    let buy = buy_ix(
        bonding_program_id,
        curve,
        vault,
        mint,
        buyer_token_account.pubkey(),
        context.payer.pubkey(),
        soul,
        soul_program_id,
        sol_in,
        buy_quote.token_out,
    );
    let buy_transaction = Transaction::new_signed_with_payer(
        &[buy],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        blockhash,
    );
    context
        .banks_client
        .process_transaction(buy_transaction)
        .await
        .expect("buy via local integration bonding-curve authority succeeds under --features integration");

    let soul_account = context
        .banks_client
        .get_account(soul)
        .await
        .expect("soul fetch succeeds")
        .expect("soul account exists after integration buy");
    let after_buy = SoulAccount::unpack(&soul_account.data).expect("soul unpacks after buy");
    let generation_count = after_buy.generation_count;
    let provenance_side = after_buy.provenance_side;
    let provenance_amount = after_buy.provenance_amount;
    let provenance_trader = after_buy.provenance_trader;
    // The local integration bonding-curve ID is the only authority the buy
    // CPI used; under `--features integration` it must be trusted, so BUY
    // provenance is recorded and generation_count is advanced.
    assert_eq!(
        generation_count, 1,
        "integration-feature CPI from local bonding-curve id MUST advance generation_count (SEC.A5)"
    );
    assert_eq!(
        provenance_side, PROVENANCE_SIDE_BUY,
        "integration-feature CPI from local bonding-curve id MUST record BUY provenance (SEC.A5)"
    );
    assert_eq!(provenance_amount, net_sol_in);
    assert_eq!(provenance_trader.as_ref(), context.payer.pubkey().as_ref());
}

/// SEC.A1: a wallet-signed BUY (CPI from bonding-curve) creates claimable BUY
/// provenance; a subsequent direct public `generate_soul` call must NOT
/// overwrite, advance, invalidate, or spoof that provenance.
#[tokio::test]
async fn public_generate_soul_after_buy_must_not_overwrite_buy_provenance() {
    set_sbf_out_dir();

    let bonding_program_id = bonding_program_id();
    let soul_program_id = soul_program_id();
    let (mint, curve, vault, treasury, soul) =
        find_mint_with_no_bump_pdas(&bonding_program_id, &soul_program_id);

    let mut program_test = ProgramTest::new("bonding_curve", bonding_program_id, None);
    program_test.add_program("soul_generator", soul_program_id, None);
    common::add_unpaused_bonding_config(
        &mut program_test,
        bonding_program_id,
        Pubkey::new_unique(),
    );
    common::add_unpaused_soul_config(&mut program_test, soul_program_id, Pubkey::new_unique());
    program_test.add_account(
        mint,
        Account {
            lamports: 1_000_000_000,
            data: vec![0; Mint::LEN],
            owner: spl_token_2022::id(),
            executable: false,
            rent_epoch: 0,
        },
    );

    let context = program_test.start_with_context().await;

    let create = create_token_ix(
        bonding_program_id,
        curve,
        vault,
        treasury,
        mint,
        context.payer.pubkey(),
    );
    let create_transaction = Transaction::new_signed_with_payer(
        &[create],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        context.last_blockhash,
    );
    context
        .banks_client
        .process_transaction(create_transaction)
        .await
        .expect("create_token transaction succeeds");

    let initialize_soul = initialize_soul_ix(
        soul_program_id,
        soul,
        mint,
        context.payer.pubkey(),
        1_714_200_000,
    );
    let blockhash = context
        .banks_client
        .get_latest_blockhash()
        .await
        .expect("latest blockhash");
    let initialize_soul_transaction = Transaction::new_signed_with_payer(
        &[initialize_soul],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        blockhash,
    );
    context
        .banks_client
        .process_transaction(initialize_soul_transaction)
        .await
        .expect("initialize_soul transaction succeeds");

    // Buyer token account (Token-2022).
    let buyer_token_account = Keypair::new();
    let rent = Rent::default();
    let create_token_account = system_instruction::create_account(
        &context.payer.pubkey(),
        &buyer_token_account.pubkey(),
        rent.minimum_balance(TokenAccount::LEN),
        TokenAccount::LEN as u64,
        &spl_token_2022::id(),
    );
    let initialize_token_account = spl_token_2022::instruction::initialize_account3(
        &spl_token_2022::id(),
        &buyer_token_account.pubkey(),
        &mint,
        &context.payer.pubkey(),
    )
    .expect("initialize_account3 instruction builds");
    let blockhash = context
        .banks_client
        .get_latest_blockhash()
        .await
        .expect("latest blockhash");
    let token_account_transaction = Transaction::new_signed_with_payer(
        &[create_token_account, initialize_token_account],
        Some(&context.payer.pubkey()),
        &[&context.payer, &buyer_token_account],
        blockhash,
    );
    context
        .banks_client
        .process_transaction(token_account_transaction)
        .await
        .expect("buyer token account initializes");

    // Authenticated BUY via bonding-curve CPI.
    let sol_in = 100_000_000u64;
    let lock_fee = calculate_lock_fee(sol_in).expect("lock fee math succeeds");
    let net_sol_in = sol_in.checked_sub(lock_fee).expect("net buy amount fits");
    let buy_quote = quote_buy(0, 0, net_sol_in, 1).expect("buy quote succeeds");
    let blockhash = context
        .banks_client
        .get_latest_blockhash()
        .await
        .expect("latest blockhash");
    let buy = buy_ix(
        bonding_program_id,
        curve,
        vault,
        mint,
        buyer_token_account.pubkey(),
        context.payer.pubkey(),
        soul,
        soul_program_id,
        sol_in,
        buy_quote.token_out,
    );
    let buy_transaction = Transaction::new_signed_with_payer(
        &[buy],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        blockhash,
    );
    context
        .banks_client
        .process_transaction(buy_transaction)
        .await
        .expect("buy transaction succeeds");

    let soul_account = context
        .banks_client
        .get_account(soul)
        .await
        .expect("soul fetch succeeds")
        .expect("soul account exists");
    let after_buy = SoulAccount::unpack(&soul_account.data).expect("soul unpacks");
    let buy_generation = after_buy.generation_count;
    let buy_provenance_generation = after_buy.provenance_generation;
    let buy_provenance_amount = after_buy.provenance_amount;
    let buy_provenance_side = after_buy.provenance_side;
    let after_buy_seed_hash = after_buy.provenance_seed_hash;
    let after_buy_provenance_token_amount = after_buy.provenance_token_amount;
    let after_buy_provenance_trader = after_buy.provenance_trader;
    assert_eq!(buy_generation, 1);
    assert_eq!(buy_provenance_generation, 1);
    assert_eq!(buy_provenance_side, PROVENANCE_SIDE_BUY);
    assert_eq!(buy_provenance_amount, net_sol_in);
    assert_eq!(
        after_buy_provenance_trader.as_ref(),
        context.payer.pubkey().as_ref()
    );
    let after_buy_svg_len = after_buy.last_svg_len as usize;
    let after_buy_svg = after_buy.last_svg[..after_buy_svg_len].to_vec();

    // Now the attacker / unrelated public caller invokes generate_soul directly,
    // claiming a buy with an attacker-controlled trader and a different swap
    // amount. Once authenticated BUY provenance exists, public preview refreshes
    // must be rejected so the mutable last_svg buffer cannot be raced into
    // claim metadata.
    let attacker = Keypair::new();
    let blockhash = context
        .banks_client
        .get_latest_blockhash()
        .await
        .expect("latest blockhash");
    let fund_attacker =
        system_instruction::transfer(&context.payer.pubkey(), &attacker.pubkey(), 1_000_000_000);
    let fund_transaction = Transaction::new_signed_with_payer(
        &[fund_attacker],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        blockhash,
    );
    context
        .banks_client
        .process_transaction(fund_transaction)
        .await
        .expect("attacker funded");

    let blockhash = context
        .banks_client
        .get_latest_blockhash()
        .await
        .expect("latest blockhash");
    let public_generate =
        public_generate_soul_ix(soul_program_id, soul, attacker.pubkey(), 424_242, true);
    let public_generate_transaction = Transaction::new_signed_with_payer(
        &[public_generate],
        Some(&attacker.pubkey()),
        &[&attacker],
        blockhash,
    );
    let public_generate_error = context
        .banks_client
        .process_transaction(public_generate_transaction)
        .await
        .expect_err("public direct generate_soul after BUY provenance is rejected");
    assert!(
        public_generate_error
            .to_string()
            .contains("InvalidAccountData"),
        "unexpected public generate_soul rejection: {public_generate_error:?}"
    );

    let soul_after_public = context
        .banks_client
        .get_account(soul)
        .await
        .expect("soul fetch succeeds")
        .expect("soul account exists after public generate");
    let after_public =
        SoulAccount::unpack(&soul_after_public.data).expect("soul unpacks after public generate");
    let after_public_generation = after_public.generation_count;
    let after_public_provenance_generation = after_public.provenance_generation;
    let after_public_provenance_amount = after_public.provenance_amount;
    let after_public_provenance_side = after_public.provenance_side;
    let after_public_provenance_seed_hash = after_public.provenance_seed_hash;
    let after_public_provenance_trader = after_public.provenance_trader;
    let after_public_provenance_token_amount = after_public.provenance_token_amount;
    assert_eq!(
        after_public_generation, buy_generation,
        "public direct generate_soul must NOT advance generation_count (SEC.A1)"
    );
    assert_eq!(
        after_public_provenance_generation, buy_provenance_generation,
        "public direct generate_soul must NOT advance provenance_generation (SEC.A1)"
    );
    assert_eq!(
        after_public_provenance_side, PROVENANCE_SIDE_BUY,
        "public direct generate_soul must NOT downgrade provenance_side from BUY (SEC.A1)"
    );
    assert_eq!(
        after_public_provenance_amount, buy_provenance_amount,
        "public direct generate_soul must NOT overwrite provenance_amount (SEC.A1)"
    );
    assert_eq!(
        after_public_provenance_trader.as_ref(),
        context.payer.pubkey().as_ref(),
        "public direct generate_soul must NOT spoof provenance_trader (SEC.A1)"
    );
    assert_ne!(
        after_public_provenance_trader.as_ref(),
        attacker.pubkey().as_ref(),
        "public direct generate_soul must NOT replace trader with the public caller (SEC.A1)"
    );
    assert_eq!(
        after_public_provenance_seed_hash, after_buy_seed_hash,
        "public direct generate_soul must NOT rewrite provenance_seed_hash (SEC.A1)"
    );
    assert_eq!(
        after_public_provenance_token_amount, after_buy_provenance_token_amount,
        "public direct generate_soul must NOT rewrite provenance_token_amount (SEC.A1)"
    );

    let after_public_svg_len = after_public.last_svg_len as usize;
    assert_eq!(
        after_public_svg_len, after_buy_svg_len,
        "rejected public direct generate_soul must not change last_svg_len"
    );
    assert_eq!(
        &after_public.last_svg[..after_public_svg_len],
        after_buy_svg.as_slice(),
        "rejected public direct generate_soul must not mutate claimable last_svg"
    );
}

/// SEC.A1: a direct public `generate_soul` call alone (no prior authenticated
/// buy) must NOT create claimable BUY provenance. The provenance fields stay
/// at their initialized zero state and the claim cursor stays at zero.
#[tokio::test]
async fn public_generate_soul_alone_does_not_create_claimable_buy_provenance() {
    set_sbf_out_dir();

    let soul_program_id = soul_program_id();
    let (mint, soul) = find_mint_with_no_bump_soul_pda(&soul_program_id);

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

    let blockhash = context
        .banks_client
        .get_latest_blockhash()
        .await
        .expect("latest blockhash");
    let public_generate =
        public_generate_soul_ix(soul_program_id, soul, context.payer.pubkey(), 99_999, true);
    let public_generate_transaction = Transaction::new_signed_with_payer(
        &[public_generate],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        blockhash,
    );
    context
        .banks_client
        .process_transaction(public_generate_transaction)
        .await
        .expect("public generate_soul succeeds (cosmetic-only)");

    let soul_account = context
        .banks_client
        .get_account(soul)
        .await
        .expect("soul fetch succeeds")
        .expect("soul account exists");
    let state = SoulAccount::unpack(&soul_account.data).expect("soul unpacks");

    let generation_count = state.generation_count;
    let provenance_generation = state.provenance_generation;
    let provenance_amount = state.provenance_amount;
    let provenance_token_amount = state.provenance_token_amount;
    let provenance_side = state.provenance_side;
    let provenance_seed_hash = state.provenance_seed_hash;
    let provenance_trader = state.provenance_trader;
    let provenance_token_account = state.provenance_token_account;
    let provenance_mint = state.provenance_mint;
    let provenance_soul = state.provenance_soul;
    let claim_count = state.claim_count;
    assert_eq!(
        generation_count, 0,
        "public-only generation must not advance generation_count"
    );
    assert_eq!(
        provenance_generation, 0,
        "public-only generation must not write provenance_generation"
    );
    assert_eq!(
        provenance_side, PROVENANCE_SIDE_NONE,
        "public-only generation must not record a BUY/SELL provenance side"
    );
    assert_eq!(provenance_amount, 0);
    assert_eq!(provenance_token_amount, 0);
    assert_eq!(provenance_trader.as_ref(), &[0u8; 32]);
    assert_eq!(provenance_token_account.as_ref(), &[0u8; 32]);
    assert_eq!(provenance_mint.as_ref(), &[0u8; 32]);
    assert_eq!(provenance_soul.as_ref(), &[0u8; 32]);
    assert_eq!(provenance_seed_hash, [0u8; 8]);
    assert_eq!(claim_count, 0);
}
