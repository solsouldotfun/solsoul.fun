#![allow(deprecated, dead_code, unused_imports)]
mod common;

use bonding_curve::{
    instructions::{BUY_DISCRIMINATOR, CREATE_TOKEN_DISCRIMINATOR, SELL_DISCRIMINATOR},
    math::{calculate_lock_fee, quote_buy, quote_sell},
    state::{BondingCurveAccount, CURVE_SEED, TREASURY_SEED, VAULT_SEED},
};
use solana_program_option::COption;
use solana_program_pack::Pack;
use solana_program_test::ProgramTest;
use solana_sdk::{
    account::Account,
    compute_budget::ComputeBudgetInstruction,
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    rent::Rent,
    signature::{Keypair, Signer},
    system_instruction, system_program, sysvar,
    transaction::Transaction,
};
use soul_generator::{
    instructions::{INITIALIZE_SOUL_DISCRIMINATOR, UPLOAD_TEMPLATE_DISCRIMINATOR},
    state::{SoulAccount, PROVENANCE_SIDE_BUY, PROVENANCE_SIDE_SELL, SOUL_SEED},
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
        "target/deploy/bonding_curve.so must exist; run `cargo build-sbf -p bonding-curve` before this integration test"
    );
    assert!(
        sbf_out_dir.join("soul_generator.so").exists(),
        "target/deploy/soul_generator.so must exist; run `cargo build-sbf -p soul-generator` before this integration test"
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

fn upload_template_ix(
    program_id: Pubkey,
    soul: Pubkey,
    authority: Pubkey,
    template: &[u8],
    style_params: &[u8],
) -> Instruction {
    let template_len = u16::try_from(template.len()).expect("template fixture fits u16");
    let style_params_len =
        u16::try_from(style_params.len()).expect("style params fixture fits u16");
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

fn sell_ix(
    curve: Pubkey,
    vault: Pubkey,
    mint: Pubkey,
    seller_token_account: Pubkey,
    seller: Pubkey,
    token_in: u64,
    min_amount_out: u64,
) -> Instruction {
    let mut data = Vec::with_capacity(17);
    data.push(SELL_DISCRIMINATOR);
    data.extend_from_slice(&token_in.to_le_bytes());
    data.extend_from_slice(&min_amount_out.to_le_bytes());

    Instruction {
        program_id: bonding_program_id(),
        accounts: vec![
            AccountMeta::new(curve, false),
            AccountMeta::new(vault, false),
            AccountMeta::new(mint, false),
            AccountMeta::new(seller_token_account, false),
            AccountMeta::new(seller, true),
            AccountMeta::new_readonly(spl_token_2022::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
            AccountMeta::new_readonly(common::bonding_config_pda(&bonding_program_id()), false),
        ],
        data,
    }
}

#[tokio::test]
async fn buy_cpis_generate_soul_after_minting_tokens() {
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

    let mut context = program_test.start_with_context().await;
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

    let mint_account = context
        .banks_client
        .get_account(mint)
        .await
        .expect("mint fetch succeeds")
        .expect("mint account exists");
    let mint_state = Mint::unpack(&mint_account.data).expect("mint unpacks");
    assert_eq!(mint_state.mint_authority, COption::Some(curve));

    let curve_account = context
        .banks_client
        .get_account(curve)
        .await
        .expect("curve fetch succeeds")
        .expect("curve account exists");
    assert_eq!(curve_account.owner, bonding_program_id);
    assert_eq!(curve_account.data.len(), BondingCurveAccount::LEN);
    assert_eq!(
        curve_account.lamports,
        Rent::default().minimum_balance(BondingCurveAccount::LEN),
        "curve PDA must be funded with exactly the rent-exempt minimum"
    );

    let vault_account = context
        .banks_client
        .get_account(vault)
        .await
        .expect("vault fetch succeeds")
        .expect("vault account exists");
    assert_eq!(vault_account.owner, system_program::id());
    assert_eq!(vault_account.data.len(), 0);
    assert_eq!(
        vault_account.lamports,
        Rent::default().minimum_balance(0),
        "vault PDA must be funded with exactly the rent-exempt minimum"
    );

    let initialize_soul = initialize_soul_ix(
        soul_program_id,
        soul,
        mint,
        context.payer.pubkey(),
        1_714_200_000,
    );
    let latest_blockhash = context
        .banks_client
        .get_latest_blockhash()
        .await
        .expect("latest blockhash");
    let initialize_soul_transaction = Transaction::new_signed_with_payer(
        &[initialize_soul],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        latest_blockhash,
    );
    context
        .banks_client
        .process_transaction(initialize_soul_transaction)
        .await
        .expect("initialize_soul transaction succeeds");

    let custom_template =
        br#"<svg viewBox="0 0 10 10"><g id="custom-soul"><rect width="10" height="10" fill="hsl({{HUE}},80%,60%)"/></g></svg>"#;
    let custom_style_params = b"mode=hsl;evolution=3";
    let latest_blockhash = context
        .banks_client
        .get_latest_blockhash()
        .await
        .expect("latest blockhash");
    let upload_template = upload_template_ix(
        soul_program_id,
        soul,
        context.payer.pubkey(),
        custom_template,
        custom_style_params,
    );
    let upload_template_transaction = Transaction::new_signed_with_payer(
        &[upload_template],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        latest_blockhash,
    );
    context
        .banks_client
        .process_transaction(upload_template_transaction)
        .await
        .expect("upload_template transaction succeeds");

    let soul_account = context
        .banks_client
        .get_account(soul)
        .await
        .expect("soul fetch succeeds")
        .expect("soul account exists");
    assert_eq!(soul_account.owner, soul_program_id);
    assert_eq!(soul_account.data.len(), SoulAccount::LEN);
    assert_eq!(
        soul_account.lamports,
        Rent::default().minimum_balance(SoulAccount::LEN),
        "soul PDA must be funded with exactly the rent-exempt minimum"
    );

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
    let latest_blockhash = context
        .banks_client
        .get_latest_blockhash()
        .await
        .expect("latest blockhash");
    let token_account_transaction = Transaction::new_signed_with_payer(
        &[create_token_account, initialize_token_account],
        Some(&context.payer.pubkey()),
        &[&context.payer, &buyer_token_account],
        latest_blockhash,
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
    let latest_blockhash = context
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
        latest_blockhash,
    );
    context
        .banks_client
        .process_transaction(buy_transaction)
        .await
        .expect("buy transaction succeeds");

    let buyer_token_account_data = context
        .banks_client
        .get_account(buyer_token_account.pubkey())
        .await
        .expect("token account fetch succeeds")
        .expect("token account exists")
        .data;
    let token_state = TokenAccount::unpack(&buyer_token_account_data).expect("token unpacks");
    assert_eq!(token_state.amount, buy_quote.token_out);

    let soul_account = context
        .banks_client
        .get_account(soul)
        .await
        .expect("soul fetch succeeds")
        .expect("soul account exists");
    let soul_state = SoulAccount::unpack(&soul_account.data).expect("soul unpacks");
    let generation_count = soul_state.generation_count;
    let last_svg_len = soul_state.last_svg_len as usize;

    assert_eq!(generation_count, 1);
    assert!(last_svg_len > 0);
    assert!(soul_state.last_svg[..last_svg_len].starts_with(b"<svg"));
    let svg = std::str::from_utf8(&soul_state.last_svg[..last_svg_len]).expect("utf8 svg");
    assert!(
        svg.contains(r#"<g id="custom-soul">"#),
        "rendered SVG should preserve custom template structure: {svg}"
    );
    assert!(
        svg.contains(r#"fill="hsl("#) && svg.contains(",80%,60%)"),
        "rendered SVG should preserve hsl wrapper and substitute hue: {svg}"
    );
    assert!(
        !svg.contains("{{HUE}}"),
        "rendered SVG should substitute template HUE placeholder: {svg}"
    );
    let provenance_generation = soul_state.provenance_generation;
    let provenance_amount = soul_state.provenance_amount;
    let provenance_trader = soul_state.provenance_trader;
    let provenance_token_account = soul_state.provenance_token_account;
    let provenance_mint = soul_state.provenance_mint;
    let provenance_soul = soul_state.provenance_soul;
    let provenance_seed_hash = soul_state.provenance_seed_hash;
    let provenance_token_amount = soul_state.provenance_token_amount;
    assert_eq!(provenance_generation, 1);
    assert_eq!(soul_state.provenance_side, PROVENANCE_SIDE_BUY);
    assert_eq!(provenance_amount, net_sol_in);
    assert_eq!(
        provenance_token_amount, buy_quote.token_out,
        "buy provenance token amount must record exact token_out"
    );
    assert_eq!(provenance_trader.as_ref(), context.payer.pubkey().as_ref());
    assert_eq!(
        provenance_token_account.as_ref(),
        buyer_token_account.pubkey().as_ref()
    );
    assert_eq!(provenance_mint.as_ref(), mint.as_ref());
    assert_eq!(provenance_soul.as_ref(), soul.as_ref());
    assert_ne!(
        provenance_seed_hash, [0; 8],
        "buy provenance must include deterministic nonzero seed hash"
    );

    // Advance the slot so sell doesn't collide with buy (SameSlotArbitrage guard).
    context
        .warp_to_slot(100)
        .expect("warp to slot 100 for sell");
    let token_in = buy_quote.token_out % soul_generator::state::MIN_CLAIM_BALANCE;
    let sell_quote = quote_sell(
        buy_quote.cumulative_sol_after,
        buy_quote.total_minted_after,
        token_in,
        1,
    )
    .expect("sell quote succeeds");
    let latest_blockhash = context
        .banks_client
        .get_latest_blockhash()
        .await
        .expect("latest blockhash");
    let sell = sell_ix(
        curve,
        vault,
        mint,
        buyer_token_account.pubkey(),
        context.payer.pubkey(),
        token_in,
        sell_quote.sol_out.saturating_sub(1),
    );
    // quote_sell uses a 30-iteration binary search (ln_inv) which is CU-heavy;
    // request 400k CUs to cover it comfortably.
    let set_cu = ComputeBudgetInstruction::set_compute_unit_limit(400_000);
    let sell_transaction = Transaction::new_signed_with_payer(
        &[set_cu, sell],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        latest_blockhash,
    );
    context
        .banks_client
        .process_transaction(sell_transaction)
        .await
        .expect("sell transaction succeeds");

    // Verify sell burned tokens from buyer account.
    let buyer_token_data = context
        .banks_client
        .get_account(buyer_token_account.pubkey())
        .await
        .expect("token fetch")
        .expect("token exists")
        .data;
    let token_state = TokenAccount::unpack(&buyer_token_data).expect("unpack token");
    assert_eq!(
        token_state.amount,
        buy_quote.token_out - token_in,
        "sell must burn exactly token_in tokens from buyer account"
    );

    // Soul generation count stays at 1 (sell instruction passes no soul accounts
    // in this test to avoid CU pressure; the exponential-curve sell-ratio cap
    // invariant is tested in curve_e2e.rs).
    let soul_account = context
        .banks_client
        .get_account(soul)
        .await
        .expect("soul fetch")
        .expect("soul exists")
        .data;
    let soul_state = SoulAccount::unpack(&soul_account).expect("soul unpacks");
    let gen_count = soul_state.generation_count;
    assert_eq!(
        gen_count, 1,
        "generation count unchanged by sell without soul CPI"
    );
}
