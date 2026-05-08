#![allow(deprecated, dead_code, unused_imports)]
mod common;

use solana_program_option::COption;
use solana_program_pack::Pack;
use solana_program_test::{BanksClientError, ProgramTest};
use solana_sdk::{
    account::Account,
    compute_budget::ComputeBudgetInstruction,
    instruction::{AccountMeta, Instruction, InstructionError},
    pubkey::Pubkey,
    rent::Rent,
    signature::{Keypair, Signer},
    system_instruction, system_program, sysvar,
    transaction::{Transaction, TransactionError},
};
use soul_generator::{
    instructions::{
        claim_soul::{claim_metadata_mint_account_len_for_soul, claim_metadata_uri_for_soul},
        GENERATE_SOUL_DISCRIMINATOR, INITIALIZE_SOUL_DISCRIMINATOR,
    },
    state::{
        ClaimAccount, ReceiptAccount, ReceiptRegistryAccount, SoulAccount, PROVENANCE_SIDE_BUY,
        PROVENANCE_SIDE_SELL, RECEIPT_STATE_ACTIVE, RECEIPT_STATE_BURNED, RECEIPT_STATE_FORFEITED,
        SOUL_SEED,
    },
    svg::neonpuff::generate_neonpuff_svg,
};
use spl_token_2022::extension::{
    metadata_pointer::MetadataPointer, BaseStateWithExtensions, StateWithExtensions,
};
use spl_token_2022::state::{Account as TokenAccount, AccountState, Mint};
use spl_token_metadata_interface::state::TokenMetadata;
use std::{env, path::PathBuf, str::FromStr};

const CLAIM_SOUL_DISCRIMINATOR: u8 = 3;
const RECEIPT_LIFECYCLE_DISCRIMINATOR: u8 = 6;
const SETTLE_RECEIPTS_DISCRIMINATOR: u8 = 7;
const CLAIM_SEED: &[u8] = b"claim";
const RECEIPT_SEED: &[u8] = b"receipt";
const RECEIPT_REGISTRY_SEED: &[u8] = b"receipt_registry";
const NFT_AUTHORITY_SEED: &[u8] = b"nft";
const MEME_BALANCE: u64 = soul_generator::state::MIN_CLAIM_BALANCE;
const MEME_SYMBOL: &str = "DOGE";
const CLAIM_SOUL_COMPUTE_UNIT_LIMIT: u32 = 450_000;

fn sdk_pubkey_from_pinocchio(bytes: &[u8]) -> Pubkey {
    Pubkey::new_from_array(bytes.try_into().expect("program id is 32 bytes"))
}

fn program_id() -> Pubkey {
    sdk_pubkey_from_pinocchio(soul_generator::id().as_ref())
}

fn associated_token_program_id() -> Pubkey {
    Pubkey::from_str("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
        .expect("associated token program id parses")
}

fn associated_token_address(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[owner.as_ref(), spl_token_2022::id().as_ref(), mint.as_ref()],
        &associated_token_program_id(),
    )
    .0
}

fn find_claim_fixture_pdas(program_id: &Pubkey) -> (Pubkey, Pubkey, Pubkey, Pubkey) {
    let sequence = 0u64.to_le_bytes();
    for byte in 1u8..=u8::MAX {
        let mint = Pubkey::new_from_array([byte; 32]);
        let Ok(soul) = Pubkey::create_program_address(&[SOUL_SEED, mint.as_ref()], program_id)
        else {
            continue;
        };
        let Ok(claim) =
            Pubkey::create_program_address(&[CLAIM_SEED, soul.as_ref(), &sequence], program_id)
        else {
            continue;
        };
        let Ok(nft_authority) = Pubkey::create_program_address(
            &[NFT_AUTHORITY_SEED, soul.as_ref(), &sequence],
            program_id,
        ) else {
            continue;
        };
        return (mint, soul, claim, nft_authority);
    }

    panic!("test fixture could not find no-bump claim PDAs");
}

fn reported_public_token_regression_pdas(program_id: &Pubkey) -> (Pubkey, Pubkey, Pubkey, Pubkey) {
    let sequence = 0u64.to_le_bytes();
    for first in 0u8..=u8::MAX {
        for second in 0u8..=u8::MAX {
            let mut mint_bytes = [0u8; 32];
            mint_bytes[0] = first;
            mint_bytes[1] = second;
            let mint = Pubkey::new_from_array(mint_bytes);
            let Ok(soul) = Pubkey::create_program_address(&[SOUL_SEED, mint.as_ref()], program_id)
            else {
                continue;
            };
            if Pubkey::create_program_address(&[CLAIM_SEED, soul.as_ref(), &sequence], program_id)
                .is_ok()
            {
                continue;
            }
            if Pubkey::create_program_address(
                &[NFT_AUTHORITY_SEED, soul.as_ref(), &sequence],
                program_id,
            )
            .is_ok()
            {
                continue;
            }
            let (claim, _claim_bump) =
                Pubkey::find_program_address(&[CLAIM_SEED, soul.as_ref(), &sequence], program_id);
            let (nft_authority, _nft_authority_bump) = Pubkey::find_program_address(
                &[NFT_AUTHORITY_SEED, soul.as_ref(), &sequence],
                program_id,
            );
            return (mint, soul, claim, nft_authority);
        }
    }

    panic!("test fixture could not find bumped claim and nft authority PDAs");
}

fn claim_pda_for_sequence(program_id: &Pubkey, soul: &Pubkey, sequence: u64) -> Pubkey {
    let sequence = sequence.to_le_bytes();
    Pubkey::create_program_address(&[CLAIM_SEED, soul.as_ref(), &sequence], program_id)
        .unwrap_or_else(|_| {
            Pubkey::find_program_address(&[CLAIM_SEED, soul.as_ref(), &sequence], program_id).0
        })
}

fn nft_authority_pda_for_sequence(program_id: &Pubkey, soul: &Pubkey, sequence: u64) -> Pubkey {
    let sequence = sequence.to_le_bytes();
    Pubkey::create_program_address(&[NFT_AUTHORITY_SEED, soul.as_ref(), &sequence], program_id)
        .unwrap_or_else(|_| {
            Pubkey::find_program_address(
                &[NFT_AUTHORITY_SEED, soul.as_ref(), &sequence],
                program_id,
            )
            .0
        })
}

fn receipt_pda_for_sequence(program_id: &Pubkey, soul: &Pubkey, sequence: u64) -> Pubkey {
    let sequence = sequence.to_le_bytes();
    Pubkey::find_program_address(&[RECEIPT_SEED, soul.as_ref(), &sequence], program_id).0
}

fn receipt_registry_pda(program_id: &Pubkey, claimer: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[RECEIPT_REGISTRY_SEED, claimer.as_ref(), mint.as_ref()],
        program_id,
    )
    .0
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

fn token_mint_account(decimals: u8, authority: Pubkey, supply: u64) -> Account {
    let mut data = vec![0u8; Mint::LEN];
    Mint {
        mint_authority: COption::Some(authority),
        supply,
        decimals,
        is_initialized: true,
        freeze_authority: COption::None,
    }
    .pack_into_slice(&mut data);

    Account {
        lamports: Rent::default().minimum_balance(Mint::LEN),
        data,
        owner: spl_token_2022::id(),
        executable: false,
        rent_epoch: 0,
    }
}

fn metadata_pointer_mint_account_len() -> usize {
    spl_token_2022::extension::ExtensionType::try_calculate_account_len::<Mint>(&[
        spl_token_2022::extension::ExtensionType::MetadataPointer,
    ])
    .expect("metadata pointer mint len")
}

fn token_account(mint: Pubkey, owner: Pubkey, amount: u64) -> Account {
    token_account_with_state_and_delegate(
        mint,
        owner,
        amount,
        AccountState::Initialized,
        COption::None,
        0,
    )
}

fn token_account_with_state_and_delegate(
    mint: Pubkey,
    owner: Pubkey,
    amount: u64,
    state: AccountState,
    delegate: COption<Pubkey>,
    delegated_amount: u64,
) -> Account {
    let mut data = vec![0u8; TokenAccount::LEN];
    TokenAccount {
        mint,
        owner,
        amount,
        delegate,
        state,
        is_native: COption::None,
        delegated_amount,
        close_authority: COption::None,
    }
    .pack_into_slice(&mut data);

    Account {
        lamports: Rent::default().minimum_balance(TokenAccount::LEN),
        data,
        owner: spl_token_2022::id(),
        executable: false,
        rent_epoch: 0,
    }
}

fn malformed_token_account() -> Account {
    Account {
        lamports: Rent::default().minimum_balance(32),
        data: vec![0u8; 32],
        owner: spl_token_2022::id(),
        executable: false,
        rent_epoch: 0,
    }
}

fn initialize_ix(
    program_id: Pubkey,
    soul: Pubkey,
    mint: Pubkey,
    authority: Pubkey,
    created_at: i64,
    symbol: &str,
) -> Instruction {
    let mut data = Vec::with_capacity(10 + symbol.len());
    data.push(INITIALIZE_SOUL_DISCRIMINATOR);
    data.extend_from_slice(&created_at.to_le_bytes());
    data.push(symbol.len() as u8);
    data.extend_from_slice(symbol.as_bytes());

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
fn generate_ix(
    program_id: Pubkey,
    soul: Pubkey,
    payer: Pubkey,
    holder_token_account: Pubkey,
    trader: Pubkey,
    swap_amount: u64,
    is_buy: bool,
    provenance_token_amount: u64,
) -> Instruction {
    let mut data = Vec::with_capacity(18);
    data.push(GENERATE_SOUL_DISCRIMINATOR);
    data.extend_from_slice(&swap_amount.to_le_bytes());
    data.push(u8::from(is_buy));
    data.extend_from_slice(&provenance_token_amount.to_le_bytes());

    Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(soul, false),
            AccountMeta::new_readonly(payer, true),
            AccountMeta::new_readonly(sysvar::slot_hashes::id(), false),
            AccountMeta::new_readonly(holder_token_account, false),
            AccountMeta::new_readonly(trader, false),
            AccountMeta::new_readonly(common::soul_config_pda(&program_id), false),
        ],
        data,
    }
}

#[allow(clippy::too_many_arguments)]
fn claim_ix(
    program_id: Pubkey,
    soul: Pubkey,
    claim: Pubkey,
    receipt: Pubkey,
    receipt_registry: Pubkey,
    claimer: Pubkey,
    meme_mint: Pubkey,
    claimer_meme_ata: Pubkey,
    nft_mint: Pubkey,
    nft_token_account: Pubkey,
    nft_authority: Pubkey,
) -> Instruction {
    Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(soul, false),
            AccountMeta::new(claim, false),
            AccountMeta::new(claimer, true),
            AccountMeta::new_readonly(meme_mint, false),
            AccountMeta::new_readonly(claimer_meme_ata, false),
            AccountMeta::new(nft_mint, false),
            AccountMeta::new(nft_token_account, false),
            AccountMeta::new_readonly(nft_authority, false),
            AccountMeta::new_readonly(spl_token_2022::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
            AccountMeta::new(receipt, false),
            AccountMeta::new(receipt_registry, false),
            AccountMeta::new_readonly(common::soul_config_pda(&program_id), false),
        ],
        data: vec![CLAIM_SOUL_DISCRIMINATOR],
    }
}

fn receipt_lifecycle_ix(
    program_id: Pubkey,
    receipt: Pubkey,
    receipt_registry: Pubkey,
    authority: Pubkey,
    state: u8,
) -> Instruction {
    Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(receipt, false),
            AccountMeta::new(receipt_registry, false),
            AccountMeta::new_readonly(authority, true),
        ],
        data: vec![RECEIPT_LIFECYCLE_DISCRIMINATOR, state],
    }
}

fn settle_receipts_ix(
    program_id: Pubkey,
    receipt_registry: Pubkey,
    authority: Pubkey,
    token_account: Pubkey,
    state: u8,
    movement_amount: u64,
    receipts: Vec<Pubkey>,
) -> Instruction {
    let mut data = Vec::with_capacity(10);
    data.push(SETTLE_RECEIPTS_DISCRIMINATOR);
    data.push(state);
    data.extend_from_slice(&movement_amount.to_le_bytes());
    let mut accounts = vec![
        AccountMeta::new(receipt_registry, false),
        AccountMeta::new_readonly(authority, true),
        AccountMeta::new_readonly(token_account, false),
        AccountMeta::new_readonly(sysvar::instructions::id(), false),
    ];
    accounts.extend(
        receipts
            .into_iter()
            .map(|receipt| AccountMeta::new(receipt, false)),
    );
    Instruction {
        program_id,
        accounts,
        data,
    }
}

struct ClaimFixture {
    program_id: Pubkey,
    claimer: Keypair,
    mint: Pubkey,
    soul: Pubkey,
    claim: Pubkey,
    claimer_meme_ata: Pubkey,
    nft_mint_keypair: Keypair,
    nft_mint: Pubkey,
    nft_token_account: Pubkey,
    nft_authority: Pubkey,
    receipt: Pubkey,
    receipt_registry: Pubkey,
}

fn add_claim_fixture(program_test: &mut ProgramTest, meme_balance: u64) -> ClaimFixture {
    let program_id = program_id();
    common::add_unpaused_soul_config(program_test, program_id, Pubkey::new_unique());
    let (mint, soul, claim, nft_authority) = find_claim_fixture_pdas(&program_id);
    add_claim_fixture_with_pdas(
        program_test,
        meme_balance,
        program_id,
        mint,
        soul,
        claim,
        nft_authority,
    )
}

fn add_claim_fixture_with_pdas(
    program_test: &mut ProgramTest,
    meme_balance: u64,
    program_id: Pubkey,
    mint: Pubkey,
    soul: Pubkey,
    claim: Pubkey,
    nft_authority: Pubkey,
) -> ClaimFixture {
    let claimer = Keypair::new();
    let claimer_meme_ata = associated_token_address(&claimer.pubkey(), &mint);
    let nft_mint_keypair = Keypair::new();
    let nft_mint = nft_mint_keypair.pubkey();
    let nft_token_account = associated_token_address(&claimer.pubkey(), &nft_mint);
    let receipt = receipt_pda_for_sequence(&program_id, &soul, 0);
    let receipt_registry = receipt_registry_pda(&program_id, &claimer.pubkey(), &mint);

    program_test.add_account(
        claimer.pubkey(),
        Account {
            lamports: 10_000_000_000,
            data: Vec::new(),
            owner: system_program::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    program_test.add_account(mint, token_mint_account(6, claimer.pubkey(), meme_balance));
    program_test.add_account(
        claimer_meme_ata,
        token_account(mint, claimer.pubkey(), meme_balance),
    );
    program_test.add_account(
        nft_token_account,
        token_account(nft_mint, claimer.pubkey(), 0),
    );

    ClaimFixture {
        program_id,
        claimer,
        mint,
        soul,
        claim,
        claimer_meme_ata,
        nft_mint_keypair,
        nft_mint,
        nft_token_account,
        nft_authority,
        receipt,
        receipt_registry,
    }
}

fn pinocchio_address(pubkey: Pubkey) -> soul_generator::state::Pubkey {
    soul_generator::state::Pubkey::new_from_array(pubkey.to_bytes())
}

fn packed_receipt_account(receipt: ReceiptAccount) -> Account {
    let mut data = vec![0u8; ReceiptAccount::LEN];
    receipt.pack(&mut data).expect("receipt packs");
    Account {
        lamports: Rent::default().minimum_balance(ReceiptAccount::LEN),
        data,
        owner: program_id(),
        executable: false,
        rent_epoch: 0,
    }
}

fn packed_receipt_registry_account(registry: ReceiptRegistryAccount) -> Account {
    let mut data = vec![0u8; ReceiptRegistryAccount::LEN];
    registry.pack(&mut data).expect("registry packs");
    Account {
        lamports: Rent::default().minimum_balance(ReceiptRegistryAccount::LEN),
        data,
        owner: program_id(),
        executable: false,
        rent_epoch: 0,
    }
}

#[allow(clippy::too_many_arguments)]
fn claimable_soul_account(
    fixture: &ClaimFixture,
    authority: Pubkey,
    generation: u64,
    side: u8,
    provenance_token_amount: u64,
    trader: Pubkey,
) -> Account {
    let svg = br#"<svg data-soul="pd9-monochrome"></svg>"#;
    claimable_soul_account_with_svg(
        fixture,
        authority,
        generation,
        side,
        provenance_token_amount,
        trader,
        svg,
        b"",
    )
}

#[allow(clippy::too_many_arguments)]
fn claimable_soul_account_with_svg(
    fixture: &ClaimFixture,
    authority: Pubkey,
    generation: u64,
    side: u8,
    provenance_token_amount: u64,
    trader: Pubkey,
    svg: &[u8],
    style_params: &[u8],
) -> Account {
    let mut last_svg = [0u8; soul_generator::state::LAST_SVG_CAPACITY];
    last_svg[..svg.len()].copy_from_slice(svg);
    let mut packed_style_params = [0u8; soul_generator::state::STYLE_PARAMS_CAPACITY];
    packed_style_params[..style_params.len()].copy_from_slice(style_params);
    let mut meme_symbol = [0u8; soul_generator::state::MEME_SYMBOL_CAPACITY];
    meme_symbol[..MEME_SYMBOL.len()].copy_from_slice(MEME_SYMBOL.as_bytes());
    // Use struct update syntax: AMM selection (Raydium=0) is filled from a
    // zero-initialized base without explicitly naming the packed field.
    let base = SoulAccount::unpack(&[0u8; SoulAccount::LEN]).expect("zeroed soul unpacks");
    let soul_state = SoulAccount {
        mint: pinocchio_address(fixture.mint),
        authority: pinocchio_address(authority),
        created_at: 1_714_200_000,
        generation_count: generation,
        last_svg_len: svg.len() as u16,
        last_svg,
        base_svg_template: [0u8; soul_generator::state::BASE_SVG_TEMPLATE_CAPACITY],
        template_len: 0,
        style_params: packed_style_params,
        style_params_len: style_params.len() as u16,
        min_claim_balance: MEME_BALANCE,
        claim_count: 0,
        meme_symbol,
        meme_symbol_len: MEME_SYMBOL.len() as u8,
        provenance_generation: generation,
        provenance_side: side,
        provenance_amount: 100_000_000,
        provenance_trader: pinocchio_address(trader),
        provenance_token_account: pinocchio_address(fixture.claimer_meme_ata),
        provenance_mint: pinocchio_address(fixture.mint),
        provenance_soul: pinocchio_address(fixture.soul),
        provenance_seed_hash: [0x42; 8],
        provenance_token_amount,
        ..base
    };
    let mut data = vec![0u8; SoulAccount::LEN];
    soul_state.pack(&mut data).expect("soul account packs");
    Account {
        lamports: Rent::default().minimum_balance(SoulAccount::LEN),
        data,
        owner: fixture.program_id,
        executable: false,
        rent_epoch: 0,
    }
}

#[allow(clippy::too_many_arguments)]
async fn initialize_and_generate_with_provenance(
    context: &mut solana_program_test::ProgramTestContext,
    fixture: &ClaimFixture,
    trader: Pubkey,
    is_buy: bool,
    provenance_token_amount: u64,
) {
    let init = initialize_ix(
        fixture.program_id,
        fixture.soul,
        fixture.mint,
        context.payer.pubkey(),
        1_714_200_000,
        MEME_SYMBOL,
    );
    let generate = generate_ix(
        fixture.program_id,
        fixture.soul,
        context.payer.pubkey(),
        fixture.claimer_meme_ata,
        trader,
        100_000_000,
        is_buy,
        provenance_token_amount,
    );
    let transaction = Transaction::new_signed_with_payer(
        &[init, generate],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        context.last_blockhash,
    );
    context
        .banks_client
        .process_transaction(transaction)
        .await
        .expect("initialize and generate succeed");
}

async fn initialize_and_generate(
    context: &mut solana_program_test::ProgramTestContext,
    fixture: &ClaimFixture,
) {
    initialize_and_generate_with_provenance(
        context,
        fixture,
        fixture.claimer.pubkey(),
        true,
        MEME_BALANCE,
    )
    .await;
}

async fn claim_once(
    context: &mut solana_program_test::ProgramTestContext,
    fixture: &ClaimFixture,
) -> Result<(), BanksClientError> {
    claim_once_with_mint_create(context, fixture, true).await
}

async fn claim_once_without_mint_create(
    context: &mut solana_program_test::ProgramTestContext,
    fixture: &ClaimFixture,
) -> Result<(), BanksClientError> {
    claim_once_with_mint_create(context, fixture, false).await
}

async fn claim_once_with_mint_create(
    context: &mut solana_program_test::ProgramTestContext,
    fixture: &ClaimFixture,
    create_mint: bool,
) -> Result<(), BanksClientError> {
    let recent_blockhash = context
        .banks_client
        .get_latest_blockhash()
        .await
        .expect("latest blockhash");
    let mut instructions = vec![ComputeBudgetInstruction::set_compute_unit_limit(
        CLAIM_SOUL_COMPUTE_UNIT_LIMIT,
    )];
    if create_mint {
        let soul_account = context
            .banks_client
            .get_account(fixture.soul)
            .await
            .expect("soul fetch succeeds")
            .expect("soul exists");
        let soul_state = SoulAccount::unpack(&soul_account.data).expect("soul unpacks");
        // SEC.A1: direct/public generate_soul calls no longer advance
        // generation_count, so a Soul that was only produced by an
        // unauthenticated direct call will have generation_count == 0. The
        // claim instruction is expected to reject these attempts; for tests
        // that exercise the rejection path we fall back to sequence 0 here
        // and let the program return an error rather than panicking the
        // helper before we ever submit a transaction.
        let target_sequence = soul_state.generation_count.saturating_sub(1);
        let display_sequence = target_sequence
            .checked_add(1)
            .expect("display sequence does not overflow");
        let final_mint_len =
            claim_metadata_mint_account_len_for_soul(&soul_state, display_sequence)
                .expect("claim metadata mint length matches program path");
        instructions.push(system_instruction::create_account(
            &context.payer.pubkey(),
            &fixture.nft_mint,
            Rent::default().minimum_balance(final_mint_len),
            metadata_pointer_mint_account_len() as u64,
            &spl_token_2022::id(),
        ));
    }
    let soul_account = context
        .banks_client
        .get_account(fixture.soul)
        .await
        .expect("soul fetch succeeds")
        .expect("soul exists");
    let soul_state = SoulAccount::unpack(&soul_account.data).expect("soul unpacks");
    // SEC.A1: see comment above; we tolerate generation_count == 0 so the
    // claim instruction itself can return an error rather than panicking
    // the test helper.
    let target_sequence = soul_state.generation_count.saturating_sub(1);
    let claim_pda = claim_pda_for_sequence(&fixture.program_id, &fixture.soul, target_sequence);
    let receipt_pda = receipt_pda_for_sequence(&fixture.program_id, &fixture.soul, target_sequence);
    let receipt_registry = receipt_registry_pda(
        &fixture.program_id,
        &fixture.claimer.pubkey(),
        &fixture.mint,
    );
    let nft_authority =
        nft_authority_pda_for_sequence(&fixture.program_id, &fixture.soul, target_sequence);
    let claim = claim_ix(
        fixture.program_id,
        fixture.soul,
        claim_pda,
        receipt_pda,
        receipt_registry,
        fixture.claimer.pubkey(),
        fixture.mint,
        fixture.claimer_meme_ata,
        fixture.nft_mint,
        fixture.nft_token_account,
        nft_authority,
    );
    instructions.push(claim);
    let mut signers: Vec<&Keypair> = vec![&context.payer, &fixture.claimer];
    if create_mint {
        signers.push(&fixture.nft_mint_keypair);
    }
    let transaction = Transaction::new_signed_with_payer(
        &instructions,
        Some(&context.payer.pubkey()),
        &signers,
        recent_blockhash,
    );
    context.banks_client.process_transaction(transaction).await
}

#[tokio::test]
async fn holder_claims_soul_and_receives_token_2022_nft() {
    set_sbf_out_dir();

    let mut program_test = ProgramTest::new("soul_generator", program_id(), None);
    let fixture = add_claim_fixture(&mut program_test, MEME_BALANCE);
    program_test.add_account(
        fixture.soul,
        claimable_soul_account(
            &fixture,
            fixture.claimer.pubkey(),
            1,
            PROVENANCE_SIDE_BUY,
            MEME_BALANCE,
            fixture.claimer.pubkey(),
        ),
    );
    let mut context = program_test.start_with_context().await;

    claim_once(&mut context, &fixture)
        .await
        .expect("holder claim succeeds");

    let nft_mint_account = context
        .banks_client
        .get_account(fixture.nft_mint)
        .await
        .expect("nft mint fetch succeeds")
        .expect("nft mint exists");
    let nft_mint_state =
        StateWithExtensions::<Mint>::unpack(&nft_mint_account.data).expect("nft mint unpacks");
    assert_eq!(nft_mint_state.base.decimals, 0);
    assert_eq!(nft_mint_state.base.supply, 1);

    let nft_token_account = context
        .banks_client
        .get_account(fixture.nft_token_account)
        .await
        .expect("nft token account fetch succeeds")
        .expect("nft token account exists");
    let nft_token = TokenAccount::unpack(&nft_token_account.data).expect("nft token unpacks");
    assert_eq!(nft_token.amount, 1);

    let soul_account = context
        .banks_client
        .get_account(fixture.soul)
        .await
        .expect("soul fetch succeeds")
        .expect("soul exists");
    let soul_state = SoulAccount::unpack(&soul_account.data).expect("soul unpacks");
    let claim_count = soul_state.claim_count;
    assert_eq!(claim_count, 1);

    let claim_account = context
        .banks_client
        .get_account(fixture.claim)
        .await
        .expect("claim fetch succeeds")
        .expect("claim exists");
    assert_eq!(claim_account.data.len(), ClaimAccount::LEN);

    let receipt_account = context
        .banks_client
        .get_account(fixture.receipt)
        .await
        .expect("receipt fetch succeeds")
        .expect("receipt exists");
    assert_eq!(receipt_account.data.len(), ReceiptAccount::LEN);
    let receipt_state = ReceiptAccount::unpack(&receipt_account.data).expect("receipt decodes");
    assert_eq!(receipt_state.soul.as_ref(), fixture.soul.as_ref());
    assert_eq!(
        receipt_state.claimant.as_ref(),
        fixture.claimer.pubkey().as_ref()
    );
    assert_eq!(receipt_state.token_mint.as_ref(), fixture.mint.as_ref());
    assert_eq!(receipt_state.nft_mint.as_ref(), fixture.nft_mint.as_ref());
    let sequence = receipt_state.sequence;
    let generation_count = receipt_state.generation_count;
    let bound_quantity = receipt_state.bound_quantity;
    let bound_boundary = receipt_state.bound_boundary;
    assert_eq!(sequence, 0);
    assert_eq!(generation_count, 1);
    assert_eq!(bound_quantity, MEME_BALANCE);
    assert_eq!(bound_boundary, MEME_BALANCE);
    assert_eq!(receipt_state.lifecycle_state, RECEIPT_STATE_ACTIVE);
    assert_ne!(fixture.receipt, fixture.claim);

    let registry_account = context
        .banks_client
        .get_account(fixture.receipt_registry)
        .await
        .expect("registry fetch succeeds")
        .expect("registry exists");
    let registry_state =
        ReceiptRegistryAccount::unpack(&registry_account.data).expect("registry decodes");
    let active_receipts = registry_state.active_receipts;
    let burned_receipts = registry_state.burned_receipts;
    let forfeited_receipts = registry_state.forfeited_receipts;
    assert_eq!(active_receipts, 1);
    assert_eq!(burned_receipts, 0);
    assert_eq!(forfeited_receipts, 0);
}

#[tokio::test]
async fn holder_claims_default_neonpuff_soul_without_heap_regression() {
    use base64::prelude::{Engine, BASE64_STANDARD};

    set_sbf_out_dir();

    let mut program_test = ProgramTest::new("soul_generator", program_id(), None);
    let fixture = add_claim_fixture(&mut program_test, MEME_BALANCE);
    let mut svg = [0u8; soul_generator::state::LAST_SVG_CAPACITY];
    let svg_len =
        generate_neonpuff_svg(b"pd14-claim-regression", &mut svg).expect("NeonPuff SVG renders");
    program_test.add_account(
        fixture.soul,
        claimable_soul_account_with_svg(
            &fixture,
            fixture.claimer.pubkey(),
            1,
            PROVENANCE_SIDE_BUY,
            MEME_BALANCE,
            fixture.claimer.pubkey(),
            &svg[..svg_len],
            b"theme=neonpuff",
        ),
    );
    let mut context = program_test.start_with_context().await;

    claim_once(&mut context, &fixture)
        .await
        .expect("holder claim succeeds with default NeonPuff metadata payload");

    let nft_mint_account = context
        .banks_client
        .get_account(fixture.nft_mint)
        .await
        .expect("nft mint fetch succeeds")
        .expect("nft mint exists");
    let nft_state =
        StateWithExtensions::<Mint>::unpack(&nft_mint_account.data).expect("nft mint unpacks");
    let metadata = nft_state
        .get_variable_len_extension::<TokenMetadata>()
        .expect("token metadata extension exists");
    let encoded_json = metadata
        .uri
        .strip_prefix("data:application/json;base64,")
        .expect("metadata uri is JSON data URI");
    let json_bytes = BASE64_STANDARD
        .decode(encoded_json)
        .expect("metadata JSON base64 decodes");
    let json = String::from_utf8(json_bytes).expect("metadata JSON is UTF-8");
    let metadata_contains_neonpuff = json.contains(r#""artTheme":"NeonPuff Soul""#)
        && json.contains(r#""trait_type":"Art theme","value":"NeonPuff Soul""#);
    assert!(
        metadata_contains_neonpuff,
        "Token-2022 metadata stores NeonPuff theme label: {json}"
    );
}

#[tokio::test]
async fn claimed_soul_nft_transfer_fails_without_orphaning_active_receipt() {
    set_sbf_out_dir();

    let mut program_test = ProgramTest::new("soul_generator", program_id(), None);
    let fixture = add_claim_fixture(&mut program_test, MEME_BALANCE);
    let recipient = Keypair::new();
    let recipient_nft_token_account =
        associated_token_address(&recipient.pubkey(), &fixture.nft_mint);
    program_test.add_account(
        recipient.pubkey(),
        Account {
            lamports: 10_000_000_000,
            data: Vec::new(),
            owner: system_program::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    program_test.add_account(
        recipient_nft_token_account,
        token_account(fixture.nft_mint, recipient.pubkey(), 0),
    );
    program_test.add_account(
        fixture.soul,
        claimable_soul_account(
            &fixture,
            fixture.claimer.pubkey(),
            1,
            PROVENANCE_SIDE_BUY,
            MEME_BALANCE,
            fixture.claimer.pubkey(),
        ),
    );
    let mut context = program_test.start_with_context().await;
    claim_once(&mut context, &fixture)
        .await
        .expect("claim creates active receipt and Soul NFT");

    let transfer = spl_token_2022::instruction::transfer(
        &spl_token_2022::id(),
        &fixture.nft_token_account,
        &recipient_nft_token_account,
        &fixture.claimer.pubkey(),
        &[],
        1,
    )
    .expect("transfer instruction builds");
    let recent_blockhash = context
        .banks_client
        .get_latest_blockhash()
        .await
        .expect("latest blockhash");
    let transfer_tx = Transaction::new_signed_with_payer(
        &[transfer],
        Some(&context.payer.pubkey()),
        &[&context.payer, &fixture.claimer],
        recent_blockhash,
    );
    assert!(
        context
            .banks_client
            .process_transaction(transfer_tx)
            .await
            .is_err(),
        "frozen claimed Soul NFT token account must reject transfer attempts"
    );

    let receipt_account = context
        .banks_client
        .get_account(fixture.receipt)
        .await
        .expect("receipt fetch succeeds")
        .expect("receipt remains");
    let receipt_state = ReceiptAccount::unpack(&receipt_account.data).expect("receipt decodes");
    assert_eq!(receipt_state.lifecycle_state, RECEIPT_STATE_ACTIVE);
    let owner_nft_account = context
        .banks_client
        .get_account(fixture.nft_token_account)
        .await
        .expect("owner NFT account fetch succeeds")
        .expect("owner NFT account remains");
    let owner_nft = TokenAccount::unpack(&owner_nft_account.data).expect("owner NFT token decodes");
    assert_eq!(owner_nft.amount, 1);
    assert_eq!(owner_nft.owner, fixture.claimer.pubkey());
    let recipient_nft_account = context
        .banks_client
        .get_account(recipient_nft_token_account)
        .await
        .expect("recipient NFT account fetch succeeds")
        .expect("recipient NFT account remains");
    let recipient_nft =
        TokenAccount::unpack(&recipient_nft_account.data).expect("recipient NFT token decodes");
    assert_eq!(recipient_nft.amount, 0);
}

#[tokio::test]
async fn claim_rejects_preexisting_duplicate_active_receipt_binding() {
    set_sbf_out_dir();

    let mut program_test = ProgramTest::new("soul_generator", program_id(), None);
    let fixture = add_claim_fixture(&mut program_test, MEME_BALANCE);
    program_test.add_account(
        fixture.soul,
        claimable_soul_account(
            &fixture,
            fixture.claimer.pubkey(),
            1,
            PROVENANCE_SIDE_BUY,
            MEME_BALANCE,
            fixture.claimer.pubkey(),
        ),
    );
    program_test.add_account(
        fixture.receipt,
        packed_receipt_account(ReceiptAccount {
            soul: pinocchio_address(fixture.soul),
            claimant: pinocchio_address(fixture.claimer.pubkey()),
            token_mint: pinocchio_address(fixture.mint),
            nft_mint: pinocchio_address(Pubkey::new_unique()),
            sequence: 0,
            generation_count: 1,
            bound_quantity: MEME_BALANCE,
            bound_boundary: MEME_BALANCE,
            lifecycle_state: RECEIPT_STATE_ACTIVE,
        }),
    );
    let mut context = program_test.start_with_context().await;

    assert!(
        claim_once(&mut context, &fixture).await.is_err(),
        "claim must reject when the receipt PDA is already initialized"
    );
    let existing_receipt = context
        .banks_client
        .get_account(fixture.receipt)
        .await
        .expect("receipt fetch succeeds")
        .expect("receipt remains");
    let receipt_state = ReceiptAccount::unpack(&existing_receipt.data).expect("receipt decodes");
    assert_eq!(receipt_state.lifecycle_state, RECEIPT_STATE_ACTIVE);
}

#[tokio::test]
async fn claim_cannot_over_bind_available_whole_token_capacity() {
    set_sbf_out_dir();

    let mut program_test = ProgramTest::new("soul_generator", program_id(), None);
    let fixture = add_claim_fixture(&mut program_test, MEME_BALANCE);
    program_test.add_account(
        fixture.soul,
        claimable_soul_account(
            &fixture,
            fixture.claimer.pubkey(),
            1,
            PROVENANCE_SIDE_BUY,
            MEME_BALANCE,
            fixture.claimer.pubkey(),
        ),
    );
    program_test.add_account(
        fixture.receipt_registry,
        packed_receipt_registry_account(ReceiptRegistryAccount {
            claimant: pinocchio_address(fixture.claimer.pubkey()),
            token_mint: pinocchio_address(fixture.mint),
            active_receipts: 1,
            burned_receipts: 0,
            forfeited_receipts: 0,
        }),
    );
    let mut context = program_test.start_with_context().await;

    assert!(
        claim_once(&mut context, &fixture).await.is_err(),
        "one whole token cannot back a second active receipt"
    );
    assert!(
        context
            .banks_client
            .get_account(fixture.receipt)
            .await
            .expect("receipt fetch succeeds")
            .is_none(),
        "failed over-capacity claim must not create a receipt"
    );
    let registry_account = context
        .banks_client
        .get_account(fixture.receipt_registry)
        .await
        .expect("registry fetch succeeds")
        .expect("registry exists");
    let registry_state =
        ReceiptRegistryAccount::unpack(&registry_account.data).expect("registry decodes");
    let active_receipts = registry_state.active_receipts;
    assert_eq!(active_receipts, 1);
}

#[tokio::test]
async fn receipt_lifecycle_discriminator_is_disabled_and_preserves_receipt_state() {
    set_sbf_out_dir();

    let mut program_test = ProgramTest::new("soul_generator", program_id(), None);
    let fixture = add_claim_fixture(&mut program_test, MEME_BALANCE);
    let unauthorized = Keypair::new();
    program_test.add_account(
        unauthorized.pubkey(),
        Account {
            lamports: 10_000_000_000,
            data: Vec::new(),
            owner: system_program::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    program_test.add_account(
        fixture.soul,
        claimable_soul_account(
            &fixture,
            fixture.claimer.pubkey(),
            1,
            PROVENANCE_SIDE_BUY,
            MEME_BALANCE,
            fixture.claimer.pubkey(),
        ),
    );
    let mut context = program_test.start_with_context().await;
    claim_once(&mut context, &fixture)
        .await
        .expect("claim creates active receipt");

    let unauthorized_ix = receipt_lifecycle_ix(
        fixture.program_id,
        fixture.receipt,
        fixture.receipt_registry,
        unauthorized.pubkey(),
        RECEIPT_STATE_BURNED,
    );
    let recent_blockhash = context
        .banks_client
        .get_latest_blockhash()
        .await
        .expect("latest blockhash");
    let unauthorized_tx = Transaction::new_signed_with_payer(
        &[unauthorized_ix],
        Some(&context.payer.pubkey()),
        &[&context.payer, &unauthorized],
        recent_blockhash,
    );
    assert!(
        context
            .banks_client
            .process_transaction(unauthorized_tx)
            .await
            .is_err(),
        "unrelated signer cannot deactivate another claimant's receipt"
    );

    let receipt_account = context
        .banks_client
        .get_account(fixture.receipt)
        .await
        .expect("receipt fetch succeeds")
        .expect("receipt exists");
    let receipt_state = ReceiptAccount::unpack(&receipt_account.data).expect("receipt decodes");
    assert_eq!(receipt_state.lifecycle_state, RECEIPT_STATE_ACTIVE);

    let burn_ix = receipt_lifecycle_ix(
        fixture.program_id,
        fixture.receipt,
        fixture.receipt_registry,
        fixture.claimer.pubkey(),
        RECEIPT_STATE_BURNED,
    );
    let recent_blockhash = context
        .banks_client
        .get_latest_blockhash()
        .await
        .expect("latest blockhash");
    let burn_tx = Transaction::new_signed_with_payer(
        &[burn_ix],
        Some(&context.payer.pubkey()),
        &[&context.payer, &fixture.claimer],
        recent_blockhash,
    );
    assert!(
        context
            .banks_client
            .process_transaction(burn_tx)
            .await
            .is_err(),
        "legacy receipt_lifecycle must not let claimant bypass settlement invariants"
    );

    let receipt_account = context
        .banks_client
        .get_account(fixture.receipt)
        .await
        .expect("receipt fetch succeeds")
        .expect("receipt exists");
    let receipt_state = ReceiptAccount::unpack(&receipt_account.data).expect("receipt decodes");
    assert_eq!(receipt_state.lifecycle_state, RECEIPT_STATE_ACTIVE);
    let registry_account = context
        .banks_client
        .get_account(fixture.receipt_registry)
        .await
        .expect("registry fetch succeeds")
        .expect("registry exists");
    let registry_state =
        ReceiptRegistryAccount::unpack(&registry_account.data).expect("registry decodes");
    let active_receipts = registry_state.active_receipts;
    let burned_receipts = registry_state.burned_receipts;
    assert_eq!(active_receipts, 1);
    assert_eq!(burned_receipts, 0);
}

#[tokio::test]
async fn receipt_lifecycle_forfeit_path_is_disabled() {
    set_sbf_out_dir();

    let mut program_test = ProgramTest::new("soul_generator", program_id(), None);
    let fixture = add_claim_fixture(&mut program_test, MEME_BALANCE);
    program_test.add_account(
        fixture.soul,
        claimable_soul_account(
            &fixture,
            fixture.claimer.pubkey(),
            1,
            PROVENANCE_SIDE_BUY,
            MEME_BALANCE,
            fixture.claimer.pubkey(),
        ),
    );
    let mut context = program_test.start_with_context().await;
    claim_once(&mut context, &fixture)
        .await
        .expect("claim creates active receipt");

    let forfeit_ix = receipt_lifecycle_ix(
        fixture.program_id,
        fixture.receipt,
        fixture.receipt_registry,
        fixture.claimer.pubkey(),
        RECEIPT_STATE_FORFEITED,
    );
    let recent_blockhash = context
        .banks_client
        .get_latest_blockhash()
        .await
        .expect("latest blockhash");
    let forfeit_tx = Transaction::new_signed_with_payer(
        &[forfeit_ix],
        Some(&context.payer.pubkey()),
        &[&context.payer, &fixture.claimer],
        recent_blockhash,
    );
    assert!(
        context
            .banks_client
            .process_transaction(forfeit_tx)
            .await
            .is_err(),
        "legacy receipt_lifecycle must not forfeit outside atomic settlement"
    );

    let receipt_account = context
        .banks_client
        .get_account(fixture.receipt)
        .await
        .expect("receipt fetch succeeds")
        .expect("receipt exists");
    let receipt_state = ReceiptAccount::unpack(&receipt_account.data).expect("receipt decodes");
    assert_eq!(receipt_state.lifecycle_state, RECEIPT_STATE_ACTIVE);
    let registry_account = context
        .banks_client
        .get_account(fixture.receipt_registry)
        .await
        .expect("registry fetch succeeds")
        .expect("registry exists");
    let registry_state =
        ReceiptRegistryAccount::unpack(&registry_account.data).expect("registry decodes");
    let active_receipts = registry_state.active_receipts;
    let forfeited_receipts = registry_state.forfeited_receipts;
    assert_eq!(active_receipts, 1);
    assert_eq!(forfeited_receipts, 0);
}

#[tokio::test]
async fn standalone_settlement_rejects_without_dependent_movement() {
    set_sbf_out_dir();

    let mut program_test = ProgramTest::new("soul_generator", program_id(), None);
    let fixture = add_claim_fixture(&mut program_test, MEME_BALANCE * 2);
    let second_receipt = receipt_pda_for_sequence(&fixture.program_id, &fixture.soul, 1);
    program_test.add_account(
        fixture.receipt_registry,
        packed_receipt_registry_account(ReceiptRegistryAccount {
            claimant: pinocchio_address(fixture.claimer.pubkey()),
            token_mint: pinocchio_address(fixture.mint),
            active_receipts: 2,
            burned_receipts: 0,
            forfeited_receipts: 0,
        }),
    );
    program_test.add_account(
        fixture.receipt,
        packed_receipt_account(ReceiptAccount {
            soul: pinocchio_address(fixture.soul),
            claimant: pinocchio_address(fixture.claimer.pubkey()),
            token_mint: pinocchio_address(fixture.mint),
            nft_mint: pinocchio_address(Pubkey::new_unique()),
            sequence: 0,
            generation_count: 1,
            bound_quantity: MEME_BALANCE,
            bound_boundary: MEME_BALANCE,
            lifecycle_state: RECEIPT_STATE_ACTIVE,
        }),
    );
    program_test.add_account(
        second_receipt,
        packed_receipt_account(ReceiptAccount {
            soul: pinocchio_address(fixture.soul),
            claimant: pinocchio_address(fixture.claimer.pubkey()),
            token_mint: pinocchio_address(fixture.mint),
            nft_mint: pinocchio_address(Pubkey::new_unique()),
            sequence: 1,
            generation_count: 2,
            bound_quantity: MEME_BALANCE,
            bound_boundary: MEME_BALANCE * 2,
            lifecycle_state: RECEIPT_STATE_ACTIVE,
        }),
    );
    let context = program_test.start_with_context().await;

    let settle = settle_receipts_ix(
        fixture.program_id,
        fixture.receipt_registry,
        fixture.claimer.pubkey(),
        fixture.claimer_meme_ata,
        RECEIPT_STATE_BURNED,
        MEME_BALANCE + 1,
        vec![second_receipt, fixture.receipt],
    );
    let recent_blockhash = context
        .banks_client
        .get_latest_blockhash()
        .await
        .expect("latest blockhash");
    let tx = Transaction::new_signed_with_payer(
        &[settle],
        Some(&context.payer.pubkey()),
        &[&context.payer, &fixture.claimer],
        recent_blockhash,
    );
    context
        .banks_client
        .process_transaction(tx)
        .await
        .expect_err("standalone settlement must be rejected without same-transaction movement");

    for receipt in [fixture.receipt, second_receipt] {
        let account = context
            .banks_client
            .get_account(receipt)
            .await
            .expect("receipt fetch succeeds")
            .expect("receipt exists");
        let state = ReceiptAccount::unpack(&account.data).expect("receipt decodes");
        assert_eq!(state.lifecycle_state, RECEIPT_STATE_ACTIVE);
    }
    let registry_account = context
        .banks_client
        .get_account(fixture.receipt_registry)
        .await
        .expect("registry fetch succeeds")
        .expect("registry exists");
    let registry_state =
        ReceiptRegistryAccount::unpack(&registry_account.data).expect("registry decodes");
    let active_receipts = registry_state.active_receipts;
    let burned_receipts = registry_state.burned_receipts;
    assert_eq!(active_receipts, 2);
    assert_eq!(burned_receipts, 0);
}

#[tokio::test]
async fn settlement_rejects_unauthorized_partial_over_out_of_order_and_inactive_receipts() {
    set_sbf_out_dir();

    let mut program_test = ProgramTest::new("soul_generator", program_id(), None);
    let fixture = add_claim_fixture(&mut program_test, MEME_BALANCE * 2);
    let second_receipt = receipt_pda_for_sequence(&fixture.program_id, &fixture.soul, 1);
    let wrong_mint_receipt = receipt_pda_for_sequence(&fixture.program_id, &fixture.soul, 2);
    let inactive_receipt = receipt_pda_for_sequence(&fixture.program_id, &fixture.soul, 3);
    let spoofed_receipt = Pubkey::new_unique();
    let unauthorized = Keypair::new();
    program_test.add_account(
        unauthorized.pubkey(),
        Account {
            lamports: 10_000_000_000,
            data: Vec::new(),
            owner: system_program::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    program_test.add_account(
        fixture.receipt_registry,
        packed_receipt_registry_account(ReceiptRegistryAccount {
            claimant: pinocchio_address(fixture.claimer.pubkey()),
            token_mint: pinocchio_address(fixture.mint),
            active_receipts: 2,
            burned_receipts: 0,
            forfeited_receipts: 0,
        }),
    );
    for (receipt, sequence, boundary) in [
        (fixture.receipt, 0, MEME_BALANCE),
        (second_receipt, 1, MEME_BALANCE * 2),
    ] {
        program_test.add_account(
            receipt,
            packed_receipt_account(ReceiptAccount {
                soul: pinocchio_address(fixture.soul),
                claimant: pinocchio_address(fixture.claimer.pubkey()),
                token_mint: pinocchio_address(fixture.mint),
                nft_mint: pinocchio_address(Pubkey::new_unique()),
                sequence,
                generation_count: sequence + 1,
                bound_quantity: MEME_BALANCE,
                bound_boundary: boundary,
                lifecycle_state: RECEIPT_STATE_ACTIVE,
            }),
        );
    }
    program_test.add_account(
        wrong_mint_receipt,
        packed_receipt_account(ReceiptAccount {
            soul: pinocchio_address(fixture.soul),
            claimant: pinocchio_address(fixture.claimer.pubkey()),
            token_mint: pinocchio_address(Pubkey::new_unique()),
            nft_mint: pinocchio_address(Pubkey::new_unique()),
            sequence: 2,
            generation_count: 3,
            bound_quantity: MEME_BALANCE,
            bound_boundary: MEME_BALANCE * 2,
            lifecycle_state: RECEIPT_STATE_ACTIVE,
        }),
    );
    program_test.add_account(
        inactive_receipt,
        packed_receipt_account(ReceiptAccount {
            soul: pinocchio_address(fixture.soul),
            claimant: pinocchio_address(fixture.claimer.pubkey()),
            token_mint: pinocchio_address(fixture.mint),
            nft_mint: pinocchio_address(Pubkey::new_unique()),
            sequence: 3,
            generation_count: 4,
            bound_quantity: MEME_BALANCE,
            bound_boundary: MEME_BALANCE * 2,
            lifecycle_state: RECEIPT_STATE_BURNED,
        }),
    );
    program_test.add_account(
        spoofed_receipt,
        packed_receipt_account(ReceiptAccount {
            soul: pinocchio_address(fixture.soul),
            claimant: pinocchio_address(fixture.claimer.pubkey()),
            token_mint: pinocchio_address(fixture.mint),
            nft_mint: pinocchio_address(Pubkey::new_unique()),
            sequence: 1,
            generation_count: 2,
            bound_quantity: MEME_BALANCE,
            bound_boundary: MEME_BALANCE * 2,
            lifecycle_state: RECEIPT_STATE_ACTIVE,
        }),
    );
    let context = program_test.start_with_context().await;

    for (authority, signers, receipts, label) in [
        (
            unauthorized.pubkey(),
            vec![&context.payer, &unauthorized],
            vec![second_receipt, fixture.receipt],
            "wrong signer",
        ),
        (
            fixture.claimer.pubkey(),
            vec![&context.payer, &fixture.claimer],
            vec![second_receipt],
            "partial settlement",
        ),
        (
            fixture.claimer.pubkey(),
            vec![&context.payer, &fixture.claimer],
            vec![second_receipt, second_receipt],
            "duplicate receipt settlement",
        ),
        (
            fixture.claimer.pubkey(),
            vec![&context.payer, &fixture.claimer],
            vec![second_receipt, fixture.receipt, second_receipt],
            "over settlement",
        ),
        (
            fixture.claimer.pubkey(),
            vec![&context.payer, &fixture.claimer],
            vec![wrong_mint_receipt, fixture.receipt],
            "wrong mint receipt",
        ),
        (
            fixture.claimer.pubkey(),
            vec![&context.payer, &fixture.claimer],
            vec![spoofed_receipt, fixture.receipt],
            "spoofed receipt PDA",
        ),
        (
            fixture.claimer.pubkey(),
            vec![&context.payer, &fixture.claimer],
            vec![fixture.receipt, second_receipt],
            "out-of-order settlement",
        ),
    ] {
        let ix = settle_receipts_ix(
            fixture.program_id,
            fixture.receipt_registry,
            authority,
            fixture.claimer_meme_ata,
            RECEIPT_STATE_FORFEITED,
            MEME_BALANCE + 1,
            receipts,
        );
        let recent_blockhash = context
            .banks_client
            .get_latest_blockhash()
            .await
            .expect("latest blockhash");
        let dependent_transfer = spl_token_2022::instruction::transfer_checked(
            &spl_token_2022::id(),
            &fixture.claimer_meme_ata,
            &fixture.mint,
            &Pubkey::new_unique(),
            &authority,
            &[],
            MEME_BALANCE + 1,
            6,
        )
        .expect("dependent transfer ix builds for settlement introspection");
        let tx = Transaction::new_signed_with_payer(
            &[ix, dependent_transfer],
            Some(&context.payer.pubkey()),
            &signers,
            recent_blockhash,
        );
        assert!(
            context.banks_client.process_transaction(tx).await.is_err(),
            "{label} must be rejected before receipt mutation"
        );
    }

    let first_receipt_account = context
        .banks_client
        .get_account(fixture.receipt)
        .await
        .expect("receipt fetch succeeds")
        .expect("receipt exists");
    let first_state = ReceiptAccount::unpack(&first_receipt_account.data).expect("receipt decodes");
    assert_eq!(first_state.lifecycle_state, RECEIPT_STATE_ACTIVE);

    let replay = settle_receipts_ix(
        fixture.program_id,
        fixture.receipt_registry,
        fixture.claimer.pubkey(),
        fixture.claimer_meme_ata,
        RECEIPT_STATE_FORFEITED,
        MEME_BALANCE + 1,
        vec![inactive_receipt, fixture.receipt],
    );
    let dependent_transfer = spl_token_2022::instruction::transfer_checked(
        &spl_token_2022::id(),
        &fixture.claimer_meme_ata,
        &fixture.mint,
        &Pubkey::new_unique(),
        &fixture.claimer.pubkey(),
        &[],
        MEME_BALANCE + 1,
        6,
    )
    .expect("dependent transfer ix builds for inactive settlement introspection");
    let recent_blockhash = context
        .banks_client
        .get_latest_blockhash()
        .await
        .expect("latest blockhash");
    let replay_tx = Transaction::new_signed_with_payer(
        &[replay, dependent_transfer],
        Some(&context.payer.pubkey()),
        &[&context.payer, &fixture.claimer],
        recent_blockhash,
    );
    assert!(
        context
            .banks_client
            .process_transaction(replay_tx)
            .await
            .is_err(),
        "inactive receipts cannot be selected again"
    );
}

#[tokio::test]
async fn settlement_rejects_non_canonical_token_accounts_before_receipt_mutation() {
    set_sbf_out_dir();

    let mut program_test = ProgramTest::new("soul_generator", program_id(), None);
    let fixture = add_claim_fixture(&mut program_test, MEME_BALANCE);
    let wrong_owner_token_account = Pubkey::new_unique();
    let wrong_mint_token_account = Pubkey::new_unique();
    let frozen_token_account = Pubkey::new_unique();
    let delegated_token_account = Pubkey::new_unique();
    let malformed_token_account_key = Pubkey::new_unique();
    program_test.add_account(
        fixture.receipt_registry,
        packed_receipt_registry_account(ReceiptRegistryAccount {
            claimant: pinocchio_address(fixture.claimer.pubkey()),
            token_mint: pinocchio_address(fixture.mint),
            active_receipts: 1,
            burned_receipts: 0,
            forfeited_receipts: 0,
        }),
    );
    program_test.add_account(
        fixture.receipt,
        packed_receipt_account(ReceiptAccount {
            soul: pinocchio_address(fixture.soul),
            claimant: pinocchio_address(fixture.claimer.pubkey()),
            token_mint: pinocchio_address(fixture.mint),
            nft_mint: pinocchio_address(Pubkey::new_unique()),
            sequence: 0,
            generation_count: 1,
            bound_quantity: MEME_BALANCE,
            bound_boundary: MEME_BALANCE,
            lifecycle_state: RECEIPT_STATE_ACTIVE,
        }),
    );
    program_test.add_account(
        wrong_owner_token_account,
        token_account(fixture.mint, Pubkey::new_unique(), MEME_BALANCE),
    );
    program_test.add_account(
        wrong_mint_token_account,
        token_account(Pubkey::new_unique(), fixture.claimer.pubkey(), MEME_BALANCE),
    );
    program_test.add_account(
        frozen_token_account,
        token_account_with_state_and_delegate(
            fixture.mint,
            fixture.claimer.pubkey(),
            MEME_BALANCE,
            AccountState::Frozen,
            COption::None,
            0,
        ),
    );
    program_test.add_account(
        delegated_token_account,
        token_account_with_state_and_delegate(
            fixture.mint,
            fixture.claimer.pubkey(),
            MEME_BALANCE,
            AccountState::Initialized,
            COption::Some(Pubkey::new_unique()),
            MEME_BALANCE,
        ),
    );
    program_test.add_account(malformed_token_account_key, malformed_token_account());
    let context = program_test.start_with_context().await;

    for (token_account_key, label, expected_error) in [
        (
            wrong_owner_token_account,
            "wrong owner token account",
            TransactionError::InstructionError(0, InstructionError::Custom(0x331)),
        ),
        (
            wrong_mint_token_account,
            "wrong mint token account",
            TransactionError::InstructionError(0, InstructionError::Custom(0x331)),
        ),
        (
            frozen_token_account,
            "frozen token account",
            TransactionError::InstructionError(0, InstructionError::Custom(0x331)),
        ),
        (
            delegated_token_account,
            "delegated token account",
            TransactionError::InstructionError(0, InstructionError::Custom(0x331)),
        ),
        (
            malformed_token_account_key,
            "malformed token account",
            TransactionError::InstructionError(0, InstructionError::AccountDataTooSmall),
        ),
    ] {
        let settle = settle_receipts_ix(
            fixture.program_id,
            fixture.receipt_registry,
            fixture.claimer.pubkey(),
            token_account_key,
            RECEIPT_STATE_BURNED,
            1,
            vec![fixture.receipt],
        );
        let recent_blockhash = context
            .banks_client
            .get_latest_blockhash()
            .await
            .expect("latest blockhash");
        let tx = Transaction::new_signed_with_payer(
            &[settle],
            Some(&context.payer.pubkey()),
            &[&context.payer, &fixture.claimer],
            recent_blockhash,
        );
        let error = context
            .banks_client
            .process_transaction(tx)
            .await
            .expect_err("token-account validation must fail in the settlement instruction itself");
        assert_eq!(
            error.unwrap(),
            expected_error,
            "{label} must be rejected before receipt lifecycle mutation"
        );
        let receipt_account = context
            .banks_client
            .get_account(fixture.receipt)
            .await
            .expect("receipt fetch succeeds")
            .expect("receipt exists");
        let receipt_state = ReceiptAccount::unpack(&receipt_account.data).expect("receipt decodes");
        assert_eq!(
            receipt_state.lifecycle_state, RECEIPT_STATE_ACTIVE,
            "{label} must leave receipt active"
        );
        let registry_account = context
            .banks_client
            .get_account(fixture.receipt_registry)
            .await
            .expect("registry fetch succeeds")
            .expect("registry exists");
        let registry_state =
            ReceiptRegistryAccount::unpack(&registry_account.data).expect("registry decodes");
        let active_receipts = registry_state.active_receipts;
        let burned_receipts = registry_state.burned_receipts;
        assert_eq!(
            active_receipts, 1,
            "{label} must preserve active receipt count"
        );
        assert_eq!(burned_receipts, 0, "{label} must not record a burn");
    }
}

#[tokio::test]
async fn reported_public_token_claim_accepts_bumped_claim_and_nft_authority_pdas() {
    set_sbf_out_dir();

    let mut program_test = ProgramTest::new("soul_generator", program_id(), None);
    let program_id = program_id();
    common::add_unpaused_soul_config(&mut program_test, program_id, Pubkey::new_unique());
    let (mint, soul, claim, nft_authority) = reported_public_token_regression_pdas(&program_id);
    let fixture = add_claim_fixture_with_pdas(
        &mut program_test,
        MEME_BALANCE,
        program_id,
        mint,
        soul,
        claim,
        nft_authority,
    );
    program_test.add_account(
        fixture.soul,
        claimable_soul_account(
            &fixture,
            fixture.claimer.pubkey(),
            1,
            PROVENANCE_SIDE_BUY,
            MEME_BALANCE,
            fixture.claimer.pubkey(),
        ),
    );
    let mut context = program_test.start_with_context().await;

    claim_once(&mut context, &fixture)
        .await
        .expect("reported public token claim succeeds with bumped PDAs");

    let claim_account = context
        .banks_client
        .get_account(fixture.claim)
        .await
        .expect("bumped claim fetch succeeds")
        .expect("bumped claim exists");
    assert_eq!(claim_account.data.len(), ClaimAccount::LEN);
    let mut sequence = [0u8; 8];
    sequence.copy_from_slice(
        &claim_account.data[ClaimAccount::SEQUENCE_OFFSET..ClaimAccount::GENERATION_COUNT_OFFSET],
    );
    assert_eq!(u64::from_le_bytes(sequence), 0);
}

#[tokio::test]
async fn non_holder_claim_fails_for_insufficient_balance() {
    set_sbf_out_dir();

    let mut program_test = ProgramTest::new("soul_generator", program_id(), None);
    let fixture = add_claim_fixture(&mut program_test, 0);
    program_test.add_account(
        fixture.soul,
        claimable_soul_account(
            &fixture,
            Pubkey::new_unique(),
            1,
            PROVENANCE_SIDE_BUY,
            MEME_BALANCE,
            fixture.claimer.pubkey(),
        ),
    );
    let mut context = program_test.start_with_context().await;

    assert!(
        claim_once(&mut context, &fixture).await.is_err(),
        "non-holder claim must fail"
    );
}

#[tokio::test]
async fn sub_one_token_holder_claim_fails_for_insufficient_balance() {
    set_sbf_out_dir();

    let mut program_test = ProgramTest::new("soul_generator", program_id(), None);
    let fixture = add_claim_fixture(&mut program_test, MEME_BALANCE - 1);
    program_test.add_account(
        fixture.soul,
        claimable_soul_account(
            &fixture,
            Pubkey::new_unique(),
            1,
            PROVENANCE_SIDE_BUY,
            MEME_BALANCE,
            fixture.claimer.pubkey(),
        ),
    );
    let mut context = program_test.start_with_context().await;

    assert!(
        claim_once(&mut context, &fixture).await.is_err(),
        "holder with less than one whole 6-decimal meme token must fail"
    );
}

#[tokio::test]
async fn sub_whole_buy_provenance_fails_even_with_current_whole_balance() {
    set_sbf_out_dir();

    let mut program_test = ProgramTest::new("soul_generator", program_id(), None);
    let fixture = add_claim_fixture(&mut program_test, MEME_BALANCE);
    program_test.add_account(
        fixture.soul,
        claimable_soul_account(
            &fixture,
            Pubkey::new_unique(),
            1,
            PROVENANCE_SIDE_BUY,
            MEME_BALANCE - 1,
            fixture.claimer.pubkey(),
        ),
    );
    let mut context = program_test.start_with_context().await;

    let soul_account = context
        .banks_client
        .get_account(fixture.soul)
        .await
        .expect("soul fetch succeeds")
        .expect("soul exists");
    let soul_state = SoulAccount::unpack(&soul_account.data).expect("soul unpacks");
    let provenance_token_amount = soul_state.provenance_token_amount;
    assert_eq!(provenance_token_amount, MEME_BALANCE - 1);

    assert!(
        claim_once(&mut context, &fixture).await.is_err(),
        "sub-whole originating buy must not become claimable from accumulated balance"
    );
    assert!(
        claim_once(&mut context, &fixture).await.is_err(),
        "repeated claim attempts must keep returning the provenance gate failure"
    );
    let soul_account = context
        .banks_client
        .get_account(fixture.soul)
        .await
        .expect("soul fetch succeeds")
        .expect("soul exists after failed claims");
    let soul_state = SoulAccount::unpack(&soul_account.data).expect("soul unpacks");
    let claim_count = soul_state.claim_count;
    assert_eq!(
        claim_count, 0,
        "failed provenance claims must not mutate claim count"
    );
}

#[tokio::test]
async fn skipped_sub_whole_generation_allows_later_qualifying_candidate_claim_once() {
    set_sbf_out_dir();

    let mut program_test = ProgramTest::new("soul_generator", program_id(), None);
    let fixture = add_claim_fixture(&mut program_test, MEME_BALANCE);
    program_test.add_account(
        fixture.soul,
        claimable_soul_account(
            &fixture,
            Pubkey::new_unique(),
            2,
            PROVENANCE_SIDE_BUY,
            MEME_BALANCE,
            fixture.claimer.pubkey(),
        ),
    );
    let mut context = program_test.start_with_context().await;

    claim_once(&mut context, &fixture)
        .await
        .expect("latest qualifying candidate after skipped generation claims");

    let claim_pda = claim_pda_for_sequence(&fixture.program_id, &fixture.soul, 1);
    let claim_account = context
        .banks_client
        .get_account(claim_pda)
        .await
        .expect("claim fetch succeeds")
        .expect("generation-two claim exists");
    let mut sequence = [0u8; 8];
    sequence.copy_from_slice(
        &claim_account.data[ClaimAccount::SEQUENCE_OFFSET..ClaimAccount::GENERATION_COUNT_OFFSET],
    );
    assert_eq!(u64::from_le_bytes(sequence), 1);

    let soul_account = context
        .banks_client
        .get_account(fixture.soul)
        .await
        .expect("soul fetch succeeds")
        .expect("soul exists");
    let soul_state = SoulAccount::unpack(&soul_account.data).expect("soul unpacks");
    let claim_count = soul_state.claim_count;
    assert_eq!(
        claim_count, 2,
        "claim cursor advances to the latest consumed generation"
    );

    assert!(
        claim_once_without_mint_create(&mut context, &fixture)
            .await
            .is_err(),
        "repeat claim for generation two must reject"
    );
}

#[tokio::test]
async fn direct_generate_cannot_spoof_claimable_buy_token_output_provenance() {
    set_sbf_out_dir();

    let mut program_test = ProgramTest::new("soul_generator", program_id(), None);
    let fixture = add_claim_fixture(&mut program_test, MEME_BALANCE);
    let mut context = program_test.start_with_context().await;
    initialize_and_generate_with_provenance(
        &mut context,
        &fixture,
        fixture.claimer.pubkey(),
        true,
        MEME_BALANCE,
    )
    .await;

    let soul_account = context
        .banks_client
        .get_account(fixture.soul)
        .await
        .expect("soul fetch succeeds")
        .expect("soul exists");
    let soul_state = SoulAccount::unpack(&soul_account.data).expect("soul unpacks");
    let provenance_token_amount = soul_state.provenance_token_amount;
    assert_eq!(
        provenance_token_amount, 0,
        "direct generation must not persist claimable buy token output"
    );

    assert!(
        claim_once(&mut context, &fixture).await.is_err(),
        "directly generated spoofed buy provenance must remain non-claimable"
    );
}

#[tokio::test]
async fn sell_generated_soul_is_not_claimable() {
    set_sbf_out_dir();

    let mut program_test = ProgramTest::new("soul_generator", program_id(), None);
    let fixture = add_claim_fixture(&mut program_test, MEME_BALANCE);
    let mut context = program_test.start_with_context().await;
    initialize_and_generate_with_provenance(
        &mut context,
        &fixture,
        fixture.claimer.pubkey(),
        false,
        MEME_BALANCE,
    )
    .await;

    assert!(
        claim_once(&mut context, &fixture).await.is_err(),
        "sell-generated Soul candidates must be rejected by provenance gate"
    );
}

#[tokio::test]
async fn legacy_provenance_without_token_amount_is_readable_but_not_claimable() {
    set_sbf_out_dir();

    let mut program_test = ProgramTest::new("soul_generator", program_id(), None);
    let fixture = add_claim_fixture(&mut program_test, MEME_BALANCE);
    let mut legacy_data = vec![0u8; SoulAccount::PRE_PROVENANCE_TOKEN_AMOUNT_LEN];
    legacy_data[SoulAccount::MINT_OFFSET..SoulAccount::AUTHORITY_OFFSET]
        .copy_from_slice(fixture.mint.as_ref());
    legacy_data[SoulAccount::AUTHORITY_OFFSET..SoulAccount::CREATED_AT_OFFSET]
        .copy_from_slice(Pubkey::new_unique().as_ref());
    legacy_data[SoulAccount::GENERATION_COUNT_OFFSET..SoulAccount::LAST_SVG_LEN_OFFSET]
        .copy_from_slice(&1u64.to_le_bytes());
    legacy_data[SoulAccount::LAST_SVG_LEN_OFFSET..SoulAccount::LAST_SVG_OFFSET]
        .copy_from_slice(&6u16.to_le_bytes());
    legacy_data[SoulAccount::LAST_SVG_OFFSET..SoulAccount::LAST_SVG_OFFSET + 6]
        .copy_from_slice(b"<svg/>");
    legacy_data[SoulAccount::TARGET_AMM_OFFSET] = 0;
    legacy_data[SoulAccount::PROVENANCE_GENERATION_OFFSET..SoulAccount::PROVENANCE_SIDE_OFFSET]
        .copy_from_slice(&1u64.to_le_bytes());
    legacy_data[SoulAccount::PROVENANCE_SIDE_OFFSET] = PROVENANCE_SIDE_BUY;
    legacy_data[SoulAccount::PROVENANCE_AMOUNT_OFFSET..SoulAccount::PROVENANCE_TRADER_OFFSET]
        .copy_from_slice(&100_000_000u64.to_le_bytes());
    legacy_data
        [SoulAccount::PROVENANCE_TRADER_OFFSET..SoulAccount::PROVENANCE_TOKEN_ACCOUNT_OFFSET]
        .copy_from_slice(fixture.claimer.pubkey().as_ref());
    legacy_data[SoulAccount::PROVENANCE_TOKEN_ACCOUNT_OFFSET..SoulAccount::PROVENANCE_MINT_OFFSET]
        .copy_from_slice(fixture.claimer_meme_ata.as_ref());
    legacy_data[SoulAccount::PROVENANCE_MINT_OFFSET..SoulAccount::PROVENANCE_SOUL_OFFSET]
        .copy_from_slice(fixture.mint.as_ref());
    legacy_data[SoulAccount::PROVENANCE_SOUL_OFFSET..SoulAccount::PROVENANCE_SEED_HASH_OFFSET]
        .copy_from_slice(fixture.soul.as_ref());
    legacy_data
        [SoulAccount::PROVENANCE_SEED_HASH_OFFSET..SoulAccount::PROVENANCE_TOKEN_AMOUNT_OFFSET]
        .copy_from_slice(&[0x42; 8]);
    let legacy_state = SoulAccount::unpack(&legacy_data).expect("legacy account stays readable");
    let legacy_token_amount = legacy_state.provenance_token_amount;
    assert_eq!(legacy_token_amount, 0);
    program_test.add_account(
        fixture.soul,
        Account {
            lamports: Rent::default().minimum_balance(legacy_data.len()),
            data: legacy_data,
            owner: fixture.program_id,
            executable: false,
            rent_epoch: 0,
        },
    );
    let mut context = program_test.start_with_context().await;

    assert!(
        claim_once(&mut context, &fixture).await.is_err(),
        "legacy provenance lacking explicit token output must not satisfy claim gate"
    );
}

#[tokio::test]
async fn non_originating_holder_cannot_claim_buy_generated_soul() {
    set_sbf_out_dir();

    let mut program_test = ProgramTest::new("soul_generator", program_id(), None);
    let fixture = add_claim_fixture(&mut program_test, MEME_BALANCE);
    let non_originating_trader = Pubkey::new_unique();
    program_test.add_account(
        fixture.soul,
        claimable_soul_account(
            &fixture,
            Pubkey::new_unique(),
            1,
            PROVENANCE_SIDE_BUY,
            MEME_BALANCE,
            non_originating_trader,
        ),
    );
    let mut context = program_test.start_with_context().await;

    assert!(
        claim_once(&mut context, &fixture).await.is_err(),
        "wallet holding enough tokens but not originating the buy must not claim"
    );
}

#[tokio::test]
async fn qualifying_provenance_cannot_be_reused_for_later_sub_whole_generation() {
    set_sbf_out_dir();

    let mut program_test = ProgramTest::new("soul_generator", program_id(), None);
    let fixture = add_claim_fixture(&mut program_test, MEME_BALANCE);
    program_test.add_account(
        fixture.soul,
        claimable_soul_account(
            &fixture,
            Pubkey::new_unique(),
            1,
            PROVENANCE_SIDE_BUY,
            MEME_BALANCE,
            fixture.claimer.pubkey(),
        ),
    );
    let mut context = program_test.start_with_context().await;

    let generate_later_sub_whole = generate_ix(
        fixture.program_id,
        fixture.soul,
        context.payer.pubkey(),
        fixture.claimer_meme_ata,
        fixture.claimer.pubkey(),
        50_000_000,
        true,
        MEME_BALANCE - 1,
    );
    let recent_blockhash = context
        .banks_client
        .get_latest_blockhash()
        .await
        .expect("latest blockhash");
    let transaction = Transaction::new_signed_with_payer(
        &[generate_later_sub_whole],
        Some(&context.payer.pubkey()),
        &[&context.payer],
        recent_blockhash,
    );
    context
        .banks_client
        .process_transaction(transaction)
        .await
        .expect("later generation succeeds");

    // SEC.A1: a public/direct generate_soul call cannot mutate the provenance
    // cursor anymore. The seeded qualifying provenance therefore remains the
    // single claimable record (claim succeeds exactly once for it) and any
    // sub-whole-amount direct generation on top of it is purely cosmetic —
    // it neither introduces a NEW claimable receipt nor invalidates the
    // existing one. We assert both halves of that invariant: the first claim
    // succeeds, the second is rejected as already-claimed.
    claim_once(&mut context, &fixture)
        .await
        .expect("seeded qualifying provenance remains claimable exactly once");
    assert!(
        claim_once(&mut context, &fixture).await.is_err(),
        "a sub-whole direct generation must not unlock a second claimable receipt"
    );
}

#[tokio::test]
async fn duplicate_claim_for_same_svg_fails() {
    set_sbf_out_dir();

    let mut program_test = ProgramTest::new("soul_generator", program_id(), None);
    let fixture = add_claim_fixture(&mut program_test, MEME_BALANCE);
    program_test.add_account(
        fixture.soul,
        claimable_soul_account(
            &fixture,
            Pubkey::new_unique(),
            1,
            PROVENANCE_SIDE_BUY,
            MEME_BALANCE,
            fixture.claimer.pubkey(),
        ),
    );
    let mut context = program_test.start_with_context().await;

    claim_once(&mut context, &fixture)
        .await
        .expect("first claim succeeds");
    assert!(
        claim_once_without_mint_create(&mut context, &fixture)
            .await
            .is_err(),
        "second claim for same generated SVG must fail"
    );
}

#[tokio::test]
async fn claim_writes_soul_pda_pointing_token_2022_metadata() {
    use base64::prelude::{Engine, BASE64_STANDARD};

    set_sbf_out_dir();

    let mut program_test = ProgramTest::new("soul_generator", program_id(), None);
    let expected_name = format!("{MEME_SYMBOL} Soul #1");
    let expected_symbol = MEME_SYMBOL;
    let fixture = add_claim_fixture(&mut program_test, MEME_BALANCE);
    let authority = fixture.claimer.pubkey();
    program_test.add_account(
        fixture.soul,
        claimable_soul_account(
            &fixture,
            authority,
            1,
            PROVENANCE_SIDE_BUY,
            MEME_BALANCE,
            fixture.claimer.pubkey(),
        ),
    );
    let mut context = program_test.start_with_context().await;

    claim_once(&mut context, &fixture)
        .await
        .expect("holder claim with metadata succeeds");

    let nft_mint_account = context
        .banks_client
        .get_account(fixture.nft_mint)
        .await
        .expect("nft mint fetch succeeds")
        .expect("nft mint exists");
    let nft_state =
        StateWithExtensions::<Mint>::unpack(&nft_mint_account.data).expect("mint with extensions");
    let metadata_pointer = nft_state
        .get_extension::<MetadataPointer>()
        .expect("metadata pointer extension exists");
    let metadata_address: Option<Pubkey> = metadata_pointer.metadata_address.into();
    assert_eq!(metadata_address, Some(fixture.soul));

    let metadata = nft_state
        .get_variable_len_extension::<TokenMetadata>()
        .expect("token metadata extension exists");
    assert_eq!(metadata.name, expected_name);
    assert!(
        metadata.name.starts_with(MEME_SYMBOL),
        "metadata name must use meme symbol, got {}",
        metadata.name
    );
    assert_eq!(metadata.symbol, expected_symbol);
    assert!(metadata.uri.starts_with("data:application/json;base64,"));

    let encoded_json = metadata
        .uri
        .strip_prefix("data:application/json;base64,")
        .expect("metadata uri is JSON data URI");
    let json_bytes = BASE64_STANDARD
        .decode(encoded_json)
        .expect("metadata JSON base64 decodes");
    let json = String::from_utf8(json_bytes).expect("metadata JSON is UTF-8");
    assert!(json.contains(r#""platform":"SolSoul""#), "{json}");
    assert!(
        json.contains(&format!(r#""creator":"{}""#, authority)),
        "metadata JSON should include creator/launcher wallet: {json}"
    );
    assert!(
        json.contains(&format!(r#""associatedTokenMint":"{}""#, fixture.mint)),
        "metadata JSON should include associated token mint: {json}"
    );
    assert!(
        json.contains(r#""associatedTokenSymbol":"DOGE""#),
        "metadata JSON should include associated token symbol: {json}"
    );
    assert!(
        json.contains(r#""artEngine":"SolSoul On-Chain Art Engine""#),
        "metadata JSON should include art engine identity: {json}"
    );
    assert!(
        json.contains(r#""artTheme":"NeonPuff Soul""#),
        "metadata JSON should include default art theme: {json}"
    );
    assert!(
        json.contains(r#""generation":"1""#),
        "metadata JSON should include claimed generation: {json}"
    );
    assert!(
        json.contains(r#""attributes":["#),
        "metadata JSON should include provenance attributes: {json}"
    );
    assert!(
        json.contains(r#""trait_type":"Platform","value":"SolSoul""#),
        "metadata attributes should include platform: {json}"
    );
    assert!(
        json.contains(r#""trait_type":"Art engine","value":"SolSoul On-Chain Art Engine""#),
        "metadata attributes should include art engine: {json}"
    );
    assert!(
        json.contains(r#""trait_type":"Art theme","value":"NeonPuff Soul""#),
        "metadata attributes should include art theme: {json}"
    );
    assert!(
        json.contains(r#""trait_type":"Generation","value":"1""#),
        "metadata JSON should include generation number: {json}"
    );
    assert!(
        json.contains(r#""trait_type":"Trade side","value":"buy""#),
        "metadata JSON should include trade side: {json}"
    );
    assert!(
        json.contains(r#""trait_type":"Trade amount","value":"100000000""#),
        "metadata JSON should include trade amount: {json}"
    );
    assert!(
        json.contains(&format!(
            r#""trait_type":"Trader wallet","value":"{}""#,
            fixture.claimer.pubkey()
        )),
        "metadata JSON should include trader wallet: {json}"
    );
    assert!(
        json.contains(&format!(
            r#""trait_type":"Token mint","value":"{}""#,
            fixture.mint
        )),
        "metadata JSON should include token mint: {json}"
    );
    assert!(
        json.contains(&format!(
            r#""trait_type":"Soul PDA","value":"{}""#,
            fixture.soul
        )),
        "metadata JSON should include Soul PDA: {json}"
    );
    assert!(
        json.contains(r#""trait_type":"Seed hash","value":""#),
        "metadata JSON should include seed hash: {json}"
    );
    assert!(
        !json.contains("signature") && !json.contains("slot") && !json.contains("blockTime"),
        "metadata JSON must not fabricate finalized RPC context: {json}"
    );
    let image_prefix = "\"image\":\"data:image/svg+xml;base64,";
    let image_start = json
        .find(image_prefix)
        .expect("image data URI field exists")
        + image_prefix.len();
    let image_end = json[image_start..]
        .find('"')
        .map(|offset| image_start + offset)
        .expect("image value terminates");
    let svg_bytes = BASE64_STANDARD
        .decode(&json[image_start..image_end])
        .expect("SVG image base64 decodes");
    let svg = String::from_utf8(svg_bytes).expect("SVG bytes are UTF-8");
    assert!(
        svg.starts_with("<svg"),
        "decoded image data URI must start with <svg, got {svg:?}"
    );
    assert!(
        svg.contains(r#"data-soul="pd9-monochrome""#),
        "post-PD9 claim metadata should embed the generated PD9 SVG: {svg}"
    );
    for forbidden in [
        "<script", "<image", "<style", "href=", "xlink:", "url(", "http://", "https://", "ipfs",
        "arweave",
    ] {
        assert!(
            !svg.to_ascii_lowercase().contains(forbidden),
            "claimed PD9 SVG metadata must not contain external/script token {forbidden}: {svg}"
        );
    }

    let soul_account = context
        .banks_client
        .get_account(fixture.soul)
        .await
        .expect("soul fetch succeeds")
        .expect("soul exists");
    let soul_state = SoulAccount::unpack(&soul_account.data).expect("soul unpacks");
    let expected_svg =
        String::from_utf8(soul_state.last_svg[..usize::from(soul_state.last_svg_len)].to_vec())
            .expect("SoulAccount last_svg is UTF-8");
    assert_eq!(
        svg, expected_svg,
        "claim metadata image must exactly mirror SoulAccount.last_svg"
    );
}
