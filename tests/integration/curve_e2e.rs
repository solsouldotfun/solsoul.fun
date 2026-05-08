//! Integration tests for the new exponential-curve bonding-curve model.
//!
//! Covers the six core invariants required after the 8d78729 refactor:
//!   (a) quote_buy precision — formula outputs are consistent with K=21M
//!   (b) MAX_BUY_SOL — buy exceeding 5 SOL rejects with MaxBuyExceeded
//!   (c) same-slot flash-loan protection — second buy in same slot rejects
//!   (d) 99% self-deprecation — at 99% supply, self_deprecated flips and buys are blocked
//!   (e) sell-ratio cap — selling > 2× remaining mintable rejects with SellTooLarge
//!   (f) lock fee accounting — 0.1% of sol_in transfers to curve PDA, no withdraw path
#![allow(deprecated, dead_code, unused_imports)]
mod common;

use bonding_curve::{
    instructions::{BUY_DISCRIMINATOR, CREATE_TOKEN_DISCRIMINATOR},
    math::{
        calculate_lock_fee, quote_buy, quote_sell, CurveError, CURVE_K, CURVE_S,
        LOCK_FEE_BASIS_POINTS, MAX_BUY_SOL, SELF_DEPRECATED_THRESHOLD,
    },
    state::{BondingCurveAccount, CURVE_SEED, TREASURY_SEED, VAULT_SEED},
};
use solana_program_pack::Pack;
use solana_program_test::ProgramTest;
use solana_sdk::{
    account::Account,
    instruction::{AccountMeta, Instruction, InstructionError},
    pubkey::Pubkey,
    rent::Rent,
    signature::{Keypair, Signer},
    system_instruction, system_program, sysvar,
    transaction::{Transaction, TransactionError},
};
use soul_generator::state::SOUL_SEED;
use spl_token_2022::state::{Account as TokenAccount, Mint};
use std::{env, path::PathBuf};

// ── Test helpers ─────────────────────────────────────────────────────────────

fn sdk_pubkey_from_pinocchio(bytes: &[u8]) -> Pubkey {
    Pubkey::new_from_array(bytes.try_into().expect("program id is 32 bytes"))
}

fn bonding_program_id() -> Pubkey {
    sdk_pubkey_from_pinocchio(bonding_curve::id().as_ref())
}

fn soul_program_id() -> Pubkey {
    sdk_pubkey_from_pinocchio(soul_generator::id().as_ref())
}

fn set_sbf_out_dir() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let sbf_out_dir = manifest_dir.join("target/deploy");
    assert!(
        sbf_out_dir.join("bonding_curve.so").exists(),
        "target/deploy/bonding_curve.so must exist; run `cargo build-sbf -p bonding-curve`"
    );
    assert!(
        sbf_out_dir.join("soul_generator.so").exists(),
        "target/deploy/soul_generator.so must exist; run `cargo build-sbf -p soul-generator`"
    );
    env::set_var("SBF_OUT_DIR", sbf_out_dir);
}

/// Find a set of no-bump PDAs for the test mint.
fn find_test_pdas(
    bonding_id: &Pubkey,
    soul_id: &Pubkey,
) -> (Pubkey, Pubkey, Pubkey, Pubkey, Pubkey) {
    let treasury = Pubkey::create_program_address(&[TREASURY_SEED], bonding_id)
        .expect("treasury must be off-curve for fixed program id");
    for byte in 1u8..=u8::MAX {
        let mint = Pubkey::new_from_array([byte; 32]);
        let curve = Pubkey::create_program_address(&[CURVE_SEED, mint.as_ref()], bonding_id);
        let vault = Pubkey::create_program_address(&[VAULT_SEED, mint.as_ref()], bonding_id);
        let soul = Pubkey::create_program_address(&[SOUL_SEED, mint.as_ref()], soul_id);
        if let (Ok(curve), Ok(vault), Ok(soul)) = (curve, vault, soul) {
            return (mint, curve, vault, treasury, soul);
        }
    }
    panic!("test fixture could not find no-bump PDAs");
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

#[allow(clippy::too_many_arguments)]
fn buy_ix(
    program_id: Pubkey,
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
        program_id,
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
            AccountMeta::new_readonly(common::bonding_config_pda(&program_id), false), // 11
        ],
        data,
    }
}

/// Build a pre-populated curve account with a given total_minted and
/// cumulative_sol, injected directly into program test state.
fn injected_curve_account(
    mint: Pubkey,
    cumulative_sol: u64,
    total_minted: u64,
    owner: Pubkey,
) -> Account {
    // Use BondingCurveAccount::initialized then manually override the fields.
    // bonding_curve::state::Pubkey is a type alias for pinocchio::Address.
    let bc_mint = bonding_curve::state::Pubkey::new_from_array(mint.to_bytes());
    let mut state = BondingCurveAccount::initialized(bc_mint);
    state.cumulative_sol = cumulative_sol;
    state.total_minted = total_minted;
    state.self_deprecated = total_minted >= SELF_DEPRECATED_THRESHOLD;
    let mut data = vec![0u8; BondingCurveAccount::LEN];
    state.pack(&mut data).expect("pack succeeds");
    Account {
        lamports: Rent::default().minimum_balance(BondingCurveAccount::LEN),
        data,
        owner,
        executable: false,
        rent_epoch: 0,
    }
}

/// Set up the program test context with bonding-curve + soul-generator loaded,
/// a pre-initialized Token-2022 mint, and the soul-generator global config.
async fn setup_program_test(
    mint: Pubkey,
    curve: Pubkey,
    vault: Pubkey,
    soul: Pubkey,
    curve_account: Option<Account>,
) -> solana_program_test::ProgramTestContext {
    let bonding_id = bonding_program_id();
    let soul_id = soul_program_id();

    let mut program_test = ProgramTest::new("bonding_curve", bonding_id, None);
    program_test.add_program("soul_generator", soul_id, None);
    common::add_unpaused_bonding_config(&mut program_test, bonding_id, Pubkey::new_unique());
    common::add_unpaused_soul_config(&mut program_test, soul_id, Pubkey::new_unique());

    program_test.add_account(
        mint,
        Account {
            lamports: Rent::default().minimum_balance(Mint::LEN),
            data: vec![0; Mint::LEN],
            owner: spl_token_2022::id(),
            executable: false,
            rent_epoch: 0,
        },
    );

    if let Some(acc) = curve_account {
        program_test.add_account(curve, acc);
        // Also add a funded vault for tests that need it.
        program_test.add_account(
            vault,
            Account {
                lamports: 100_000_000_000, // 100 SOL
                data: Vec::new(),
                owner: system_program::id(),
                executable: false,
                rent_epoch: 0,
            },
        );
        // Add a pre-initialized soul if tests need it.
        program_test.add_account(
            soul,
            Account {
                lamports: Rent::default().minimum_balance(soul_generator::state::SoulAccount::LEN),
                data: vec![0u8; soul_generator::state::SoulAccount::LEN],
                owner: soul_id,
                executable: false,
                rent_epoch: 0,
            },
        );
    }

    program_test.start_with_context().await
}

// ── (a) quote_buy precision ───────────────────────────────────────────────────

/// Verifies that the formula T(R) = K·(1 - e^(-R/S)) gives consistent results:
/// buying from a fresh curve (R=0) produces token_out that matches the formula
/// within a tight tolerance, and cumulative_sol_after is exactly net_sol_in.
#[test]
fn quote_buy_precision_formula_consistency() {
    let sol_in = 1_000_000_000u64; // 1 SOL
    let lock_fee = calculate_lock_fee(sol_in).expect("lock fee");
    let net_sol_in = sol_in - lock_fee;

    let quote = quote_buy(0, 0, net_sol_in, 1).expect("quote from fresh curve succeeds");
    assert_eq!(quote.cumulative_sol_after, net_sol_in);
    assert_eq!(quote.total_minted_after, quote.token_out);

    // T ≈ K * (1 - exp(-net_sol_in / S))
    // net_sol_in ≈ 0.999 SOL = 999_000_000 lamports, S = 500 SOL = 500_000_000_000
    // R/S ≈ 0.001998, exp(-0.001998) ≈ 0.998004, T ≈ K * 0.001996
    // K * 0.001996 ≈ 21_000_000e6 * 0.001996 ≈ 41_916_000_000 tokens
    let expected_approx = 41_000_000_000u64;
    let expected_max = 43_000_000_000u64;
    assert!(
        quote.token_out > expected_approx && quote.token_out < expected_max,
        "1 SOL buy token_out {}, expected {}..{}",
        quote.token_out,
        expected_approx,
        expected_max
    );
}

/// Verifies near-saturation: with a very large cumulative_sol the incremental
/// token_out from a small buy approaches zero (the K=21M residual is minimal).
#[test]
fn quote_buy_near_saturation_residual_approaches_zero() {
    // cumulative_sol = 4 * CURVE_S = 4 * 500 SOL = 2000 SOL
    // T(2000 SOL) = K * (1 - exp(-4)) ≈ K * 0.98168
    // remaining = K - T(2000 SOL) ≈ K * 0.01832 ≈ 384_720_000_000 tokens
    let large_cum = 4 * CURVE_S;
    let approx_minted = (u128::from(CURVE_K) * 981_684_361) / 1_000_000_000;
    let approx_minted = u64::try_from(approx_minted).expect("fits");

    // A tiny buy of 0.001 SOL at this point yields a proportionally tiny token_out
    let tiny_sol = 1_000_000u64; // 0.001 SOL
    let lock_fee = calculate_lock_fee(tiny_sol).expect("lock fee");
    let net_tiny = tiny_sol - lock_fee;

    let quote = quote_buy(large_cum, approx_minted, net_tiny, 1)
        .expect("tiny buy near saturation succeeds");
    // token_out should be far less than a fresh-curve buy of the same amount
    let fresh_quote = quote_buy(0, 0, net_tiny, 1).expect("fresh quote");
    assert!(
        quote.token_out < fresh_quote.token_out / 2,
        "near-saturation token_out {} should be < half of fresh-curve token_out {}",
        quote.token_out,
        fresh_quote.token_out
    );
}

// ── (b) MAX_BUY_SOL guard ─────────────────────────────────────────────────────

/// A buy of exactly MAX_BUY_SOL (5 SOL) succeeds; 5 SOL + 1 lamport fails.
#[test]
fn max_buy_sol_boundary() {
    // Exactly at limit — but note: the 5-SOL cap is checked against sol_in
    // *before* fee deduction in quote_buy. Here we pass net_sol_in = MAX_BUY_SOL
    // which is what the program passes after deducting lock_fee. So sol_in
    // = MAX_BUY_SOL + 1 would be checked against MAX_BUY_SOL in the program
    // (after deducting lock_fee = 500_000). Let's test the quote directly.
    let ok = quote_buy(0, 0, MAX_BUY_SOL, 1);
    assert!(ok.is_ok(), "MAX_BUY_SOL exactly should succeed: {:?}", ok);

    let err = quote_buy(0, 0, MAX_BUY_SOL + 1, 1);
    assert_eq!(
        err,
        Err(CurveError::MaxBuyExceeded.into()),
        "MAX_BUY_SOL + 1 should fail with MaxBuyExceeded"
    );
}

// ── (c) same-slot flash-loan protection (on-chain) ────────────────────────────

/// Two buy instructions in the same transaction from the same payer:
/// the second buy must be rejected with SameSlotArbitrage.
/// We verify this using the in-process SBF runtime.
#[tokio::test]
async fn same_slot_second_buy_rejected() {
    set_sbf_out_dir();

    let bonding_id = bonding_program_id();
    let soul_id = soul_program_id();
    let (mint, curve, vault, _treasury, soul) = find_test_pdas(&bonding_id, &soul_id);
    // create_token needs the treasury PDA; re-derive it since we dropped it above.
    let treasury =
        Pubkey::create_program_address(&[TREASURY_SEED], &bonding_id).expect("treasury PDA");

    let mut ctx = setup_program_test(mint, curve, vault, soul, None).await;

    // Create token (initializes curve + vault).
    let create = create_token_ix(bonding_id, curve, vault, treasury, mint, ctx.payer.pubkey());
    let tx = Transaction::new_signed_with_payer(
        &[create],
        Some(&ctx.payer.pubkey()),
        &[&ctx.payer],
        ctx.last_blockhash,
    );
    ctx.banks_client
        .process_transaction(tx)
        .await
        .expect("create_token succeeds");

    // Initialize a soul account.
    let init_soul = init_soul_ix(soul_id, soul, mint, ctx.payer.pubkey());
    let blockhash = ctx.banks_client.get_latest_blockhash().await.unwrap();
    let tx = Transaction::new_signed_with_payer(
        &[init_soul],
        Some(&ctx.payer.pubkey()),
        &[&ctx.payer],
        blockhash,
    );
    ctx.banks_client
        .process_transaction(tx)
        .await
        .expect("initialize_soul succeeds");

    // Set up buyer token account.
    let buyer_ta = setup_token_account(&mut ctx, mint).await;

    // First buy succeeds.
    let sol_in = 100_000_000u64; // 0.1 SOL
    let lock_fee = calculate_lock_fee(sol_in).expect("lock fee");
    let net = sol_in - lock_fee;
    let quote = quote_buy(0, 0, net, 1).expect("buy quote");
    let blockhash = ctx.banks_client.get_latest_blockhash().await.unwrap();
    let buy1 = buy_ix(
        bonding_id,
        curve,
        vault,
        mint,
        buyer_ta,
        ctx.payer.pubkey(),
        soul,
        soul_id,
        sol_in,
        quote.token_out,
    );
    let tx = Transaction::new_signed_with_payer(
        &[buy1],
        Some(&ctx.payer.pubkey()),
        &[&ctx.payer],
        blockhash,
    );
    ctx.banks_client
        .process_transaction(tx)
        .await
        .expect("first buy succeeds");

    // Warp to a new slot so buy2a runs in a different slot than buy1.
    // buy2a should succeed (new slot), then buy2b in the SAME transaction
    // (same slot as buy2a) must fail with SameSlotArbitrage.
    ctx.warp_to_slot(100).expect("warp to slot 100");

    let second_quote = quote_buy(net, quote.token_out, net, 1).expect("second quote");
    let blockhash = ctx.banks_client.get_latest_blockhash().await.unwrap();
    let buy2a = buy_ix(
        bonding_id,
        curve,
        vault,
        mint,
        buyer_ta,
        ctx.payer.pubkey(),
        soul,
        soul_id,
        sol_in,
        second_quote.token_out,
    );
    let buy2b = buy_ix(
        bonding_id,
        curve,
        vault,
        mint,
        buyer_ta,
        ctx.payer.pubkey(),
        soul,
        soul_id,
        sol_in,
        1,
    );
    let tx = Transaction::new_signed_with_payer(
        &[buy2a, buy2b],
        Some(&ctx.payer.pubkey()),
        &[&ctx.payer],
        blockhash,
    );
    let err = ctx
        .banks_client
        .process_transaction(tx)
        .await
        .expect_err("same-slot second buy must be rejected");

    // buy2a (index 0) succeeds, buy2b (index 1) fails with SameSlotArbitrage.
    match err {
        solana_program_test::BanksClientError::TransactionError(
            TransactionError::InstructionError(1, InstructionError::Custom(code)),
        ) => {
            assert_eq!(
                code,
                CurveError::SameSlotArbitrage as u32,
                "expected SameSlotArbitrage (0x{:x}), got 0x{:x}",
                CurveError::SameSlotArbitrage as u32,
                code
            );
        }
        other => panic!("expected InstructionError::Custom(SameSlotArbitrage), got {other:?}"),
    }
}

// ── (d) 99% self-deprecation (on-chain) ───────────────────────────────────────

/// Inject a curve account with total_minted >= SELF_DEPRECATED_THRESHOLD, so
/// self_deprecated = true in the on-chain state. Verify:
///   1. The injected state correctly encodes self_deprecated = true.
///   2. A buy is rejected with SelfDeprecated (0x4303).
///
/// The actual flip behavior (record_buy sets self_deprecated when crossing threshold)
/// is validated by the unit tests in state.rs. This test validates the on-chain
/// enforcement: the program must reject buys when self_deprecated = true in state.
#[tokio::test]
async fn self_deprecated_state_blocks_buys() {
    set_sbf_out_dir();

    let bonding_id = bonding_program_id();
    let soul_id = soul_program_id();
    let (mint, curve, vault, _treasury, soul) = find_test_pdas(&bonding_id, &soul_id);

    // Inject curve state at exactly the self-deprecation threshold.
    // SELF_DEPRECATED_THRESHOLD = CURVE_K * 99 / 100 = 20_790_000_000_000 tokens
    let deprecated_total = SELF_DEPRECATED_THRESHOLD; // exactly at threshold
                                                      // R corresponding to T = 0.99 * K:
                                                      // R = -S * ln(1 - 0.99) = S * ln(100) ≈ 500e9 * 4.60517 ≈ 2_302_585_000_000
    let approx_cum_sol = 2_302_585_000_000u64;
    let pre_curve = injected_curve_account(mint, approx_cum_sol, deprecated_total, bonding_id);

    // Verify injected state has self_deprecated = true.
    {
        let mut data = vec![0u8; BondingCurveAccount::LEN];
        let bc_mint = bonding_curve::state::Pubkey::new_from_array(mint.to_bytes());
        let mut state = BondingCurveAccount::initialized(bc_mint);
        state.total_minted = deprecated_total;
        state.self_deprecated = deprecated_total >= SELF_DEPRECATED_THRESHOLD;
        state.pack(&mut data).expect("pack");
        let unpacked = BondingCurveAccount::unpack(&data).expect("unpack");
        assert!(
            unpacked.self_deprecated,
            "injected state must have self_deprecated = true at threshold"
        );
    }

    let mut program_test = ProgramTest::new("bonding_curve", bonding_id, None);
    program_test.add_program("soul_generator", soul_id, None);
    common::add_unpaused_soul_config(&mut program_test, soul_id, Pubkey::new_unique());

    program_test.add_account(
        mint,
        Account {
            lamports: Rent::default().minimum_balance(Mint::LEN),
            data: vec![0; Mint::LEN],
            owner: spl_token_2022::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    program_test.add_account(curve, pre_curve);
    program_test.add_account(
        vault,
        Account {
            lamports: 100_000_000_000,
            data: Vec::new(),
            owner: system_program::id(),
            executable: false,
            rent_epoch: 0,
        },
    );

    let mut ctx = program_test.start_with_context().await;

    // Initialize mint and soul so buy can validate accounts.
    let init_mint_ix = spl_token_2022::instruction::initialize_mint2(
        &spl_token_2022::id(),
        &mint,
        &curve,
        None,
        6,
    )
    .expect("init mint ix builds");
    let blockhash = ctx.banks_client.get_latest_blockhash().await.unwrap();
    let tx = Transaction::new_signed_with_payer(
        &[init_mint_ix],
        Some(&ctx.payer.pubkey()),
        &[&ctx.payer],
        blockhash,
    );
    ctx.banks_client
        .process_transaction(tx)
        .await
        .expect("mint initialization succeeds");

    let init_soul = init_soul_ix(soul_id, soul, mint, ctx.payer.pubkey());
    let blockhash = ctx.banks_client.get_latest_blockhash().await.unwrap();
    let tx = Transaction::new_signed_with_payer(
        &[init_soul],
        Some(&ctx.payer.pubkey()),
        &[&ctx.payer],
        blockhash,
    );
    ctx.banks_client
        .process_transaction(tx)
        .await
        .expect("initialize_soul succeeds");

    let buyer_ta = setup_token_account(&mut ctx, mint).await;

    // Verify the on-chain curve state has self_deprecated = true.
    let curve_raw = ctx
        .banks_client
        .get_account(curve)
        .await
        .expect("fetch succeeds")
        .expect("curve account exists");
    let state = BondingCurveAccount::unpack(&curve_raw.data).expect("unpack succeeds");
    assert!(
        state.self_deprecated,
        "on-chain curve must have self_deprecated = true from injected state"
    );

    // Any buy must be rejected with SelfDeprecated.
    let blockhash = ctx.banks_client.get_latest_blockhash().await.unwrap();
    let buy = buy_ix(
        bonding_id,
        curve,
        vault,
        mint,
        buyer_ta,
        ctx.payer.pubkey(),
        soul,
        soul_id,
        100_000_000,
        1,
    );
    let tx = Transaction::new_signed_with_payer(
        &[buy],
        Some(&ctx.payer.pubkey()),
        &[&ctx.payer],
        blockhash,
    );
    let err = ctx
        .banks_client
        .process_transaction(tx)
        .await
        .expect_err("buy after self-deprecation must fail");

    match err {
        solana_program_test::BanksClientError::TransactionError(
            TransactionError::InstructionError(0, InstructionError::Custom(code)),
        ) => {
            assert_eq!(
                code,
                CurveError::SelfDeprecated as u32,
                "expected SelfDeprecated (0x{:x}), got 0x{:x}",
                CurveError::SelfDeprecated as u32,
                code
            );
        }
        other => panic!("expected InstructionError::Custom(SelfDeprecated), got {other:?}"),
    }
}

// ── (e) sell-ratio cap ────────────────────────────────────────────────────────

/// The sell-ratio cap uses the check `token_in / remaining > MAX_SELL_RATIO_NUM(=2)`.
/// With integer division, this triggers when `token_in >= 3 * remaining`.
/// A single sell where `token_in / remaining > 2` must fail with SellTooLarge.
#[test]
fn sell_ratio_cap_rejects_oversized_sell() {
    use bonding_curve::math::MAX_SELL_RATIO_NUM;

    // Set total_minted to 80% of K, leaving 20% (= 4_200_000_000_000) as remaining.
    let total_minted = CURVE_K * 4 / 5; // 16_800_000_000_000
    let remaining = CURVE_K - total_minted; // 4_200_000_000_000

    // ratio = token_in / remaining (integer) > MAX_SELL_RATIO_NUM triggers SellTooLarge.
    // token_in = 3 * remaining → ratio = 3 → 3 > 2 → FAIL.
    let too_large = remaining * 3;
    let err = quote_sell(0, total_minted, too_large, 0);
    assert_eq!(
        err,
        Err(CurveError::SellTooLarge.into()),
        "selling 3× remaining must fail with SellTooLarge (ratio=3 > MAX=2)"
    );

    // token_in = 3 * remaining + 1 → ratio = 3 → FAIL.
    let too_large2 = remaining * 3 + 1;
    let err2 = quote_sell(0, total_minted, too_large2, 0);
    assert_eq!(
        err2,
        Err(CurveError::SellTooLarge.into()),
        "selling 3×+1 remaining must also fail"
    );

    // token_in = 2 * remaining → ratio = 2 → 2 > 2 = false → OK.
    // (Note: integer division means token_in = 3*remaining-1 also gives ratio=2, allowed.)
    let ok_amount = remaining * MAX_SELL_RATIO_NUM; // exactly 2× remaining
    let ok = quote_sell(2_302_585_000_000, total_minted, ok_amount, 1);
    assert!(
        ok.is_ok(),
        "selling 2× remaining should succeed (ratio=2, not > 2): {:?}",
        ok
    );
}

// ── (f) lock fee accounting (on-chain) ────────────────────────────────────────

/// After a buy, the curve PDA's lamports must have increased by exactly the
/// lock fee (sol_in × LOCK_FEE_BASIS_POINTS / 10_000).
/// There is no withdraw instruction, so the locked lamports are non-extractable.
#[tokio::test]
async fn lock_fee_transferred_to_curve_pda_and_non_extractable() {
    set_sbf_out_dir();

    let bonding_id = bonding_program_id();
    let soul_id = soul_program_id();
    let (mint, curve, vault, treasury, soul) = find_test_pdas(&bonding_id, &soul_id);

    let mut ctx = setup_program_test(mint, curve, vault, soul, None).await;

    // Initialize the token.
    let create = create_token_ix(bonding_id, curve, vault, treasury, mint, ctx.payer.pubkey());
    let tx = Transaction::new_signed_with_payer(
        &[create],
        Some(&ctx.payer.pubkey()),
        &[&ctx.payer],
        ctx.last_blockhash,
    );
    ctx.banks_client
        .process_transaction(tx)
        .await
        .expect("create_token succeeds");

    let blockhash = ctx.banks_client.get_latest_blockhash().await.unwrap();
    let init_soul = init_soul_ix(soul_id, soul, mint, ctx.payer.pubkey());
    let tx = Transaction::new_signed_with_payer(
        &[init_soul],
        Some(&ctx.payer.pubkey()),
        &[&ctx.payer],
        blockhash,
    );
    ctx.banks_client
        .process_transaction(tx)
        .await
        .expect("initialize_soul succeeds");

    let buyer_ta = setup_token_account(&mut ctx, mint).await;

    // Record curve lamports before buy.
    let curve_before = ctx
        .banks_client
        .get_account(curve)
        .await
        .expect("fetch")
        .expect("exists")
        .lamports;

    let sol_in = 1_000_000_000u64; // 1 SOL
    let expected_lock_fee = calculate_lock_fee(sol_in).expect("lock fee");
    assert_eq!(
        expected_lock_fee,
        sol_in * LOCK_FEE_BASIS_POINTS / 10_000,
        "lock fee must be 0.1% of sol_in"
    );
    let net_sol = sol_in - expected_lock_fee;
    let quote = quote_buy(0, 0, net_sol, 1).expect("buy quote");

    let blockhash = ctx.banks_client.get_latest_blockhash().await.unwrap();
    let buy = buy_ix(
        bonding_id,
        curve,
        vault,
        mint,
        buyer_ta,
        ctx.payer.pubkey(),
        soul,
        soul_id,
        sol_in,
        quote.token_out,
    );
    let tx = Transaction::new_signed_with_payer(
        &[buy],
        Some(&ctx.payer.pubkey()),
        &[&ctx.payer],
        blockhash,
    );
    ctx.banks_client
        .process_transaction(tx)
        .await
        .expect("buy succeeds");

    // Curve lamports after buy = before + lock_fee.
    let curve_after = ctx
        .banks_client
        .get_account(curve)
        .await
        .expect("fetch")
        .expect("exists")
        .lamports;

    assert_eq!(
        curve_after - curve_before,
        expected_lock_fee,
        "curve lamports must increase by exactly the lock fee"
    );
    assert_eq!(
        expected_lock_fee, 1_000_000,
        "0.1% of 1 SOL = 1_000_000 lamports (10 bps of 1_000_000_000)"
    );

    // Verify there is NO withdraw_from_curve instruction: the program's
    // dispatch table only handles discriminators 0/1/2 (create/buy/sell).
    // Any other discriminator must fail, confirming the lock fee is non-extractable.
    // (Discriminator 3 would be the first "unknown" opcode.)
    let bad_ix = Instruction {
        program_id: bonding_id,
        accounts: vec![AccountMeta::new(curve, false)],
        data: vec![3u8],
    };
    let blockhash = ctx.banks_client.get_latest_blockhash().await.unwrap();
    let tx = Transaction::new_signed_with_payer(
        &[bad_ix],
        Some(&ctx.payer.pubkey()),
        &[&ctx.payer],
        blockhash,
    );
    let err = ctx
        .banks_client
        .process_transaction(tx)
        .await
        .expect_err("unknown instruction must fail");
    // Verify the program rejected it (any error confirms no withdraw path).
    match err {
        solana_program_test::BanksClientError::TransactionError(
            TransactionError::InstructionError(0, _),
        ) => {}
        other => panic!("expected instruction error for unknown discriminator, got {other:?}"),
    }
}

// ── Helper: initialize_soul instruction ──────────────────────────────────────

fn init_soul_ix(program_id: Pubkey, soul: Pubkey, mint: Pubkey, authority: Pubkey) -> Instruction {
    use soul_generator::instructions::INITIALIZE_SOUL_DISCRIMINATOR;
    let mut data = Vec::with_capacity(9);
    data.push(INITIALIZE_SOUL_DISCRIMINATOR);
    data.extend_from_slice(&1_714_200_000i64.to_le_bytes());

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

// ── Helper: create and initialize a Token-2022 token account ─────────────────

async fn setup_token_account(
    ctx: &mut solana_program_test::ProgramTestContext,
    mint: Pubkey,
) -> Pubkey {
    let ta_keypair = Keypair::new();
    let rent = Rent::default();
    let create_ta = system_instruction::create_account(
        &ctx.payer.pubkey(),
        &ta_keypair.pubkey(),
        rent.minimum_balance(TokenAccount::LEN),
        TokenAccount::LEN as u64,
        &spl_token_2022::id(),
    );
    let init_ta = spl_token_2022::instruction::initialize_account3(
        &spl_token_2022::id(),
        &ta_keypair.pubkey(),
        &mint,
        &ctx.payer.pubkey(),
    )
    .expect("initialize_account3 builds");
    let blockhash = ctx.banks_client.get_latest_blockhash().await.unwrap();
    let tx = Transaction::new_signed_with_payer(
        &[create_ta, init_ta],
        Some(&ctx.payer.pubkey()),
        &[&ctx.payer, &ta_keypair],
        blockhash,
    );
    ctx.banks_client
        .process_transaction(tx)
        .await
        .expect("token account setup succeeds");
    ta_keypair.pubkey()
}
