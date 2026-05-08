#![allow(deprecated, dead_code, unused_imports)]

use solana_program_test::{processor, ProgramTest};
use solana_sdk::{
    account::{Account, AccountSharedData},
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    rent::Rent,
    signature::{Keypair, Signer},
    system_instruction, system_program, sysvar,
    transaction::Transaction,
};
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_token_2022::{
    extension::{ExtensionType, StateWithExtensions},
    state::{Account as TokenAccount, Mint},
};
use spl_transfer_hook_interface::{
    get_extra_account_metas_address, instruction::ExecuteInstruction,
};
use std::{collections::HashMap, env, path::PathBuf};

const DECIMALS: u8 = 6;
const MEME: u64 = transfer_hook::WHOLE_TOKEN_BASE_UNITS;
const RECEIPT_REGISTRY_SEED: &[u8] = b"receipt_registry";
const RECEIPT_SEED: &[u8] = b"receipt";
const RECEIPT_STATE_ACTIVE: u8 = 1;
const RECEIPT_STATE_BURNED: u8 = 2;
const SETTLE_RECEIPTS_DISCRIMINATOR: u8 = 7;

fn hook_program_id() -> Pubkey {
    transfer_hook::id()
}

fn soul_generator_program_id() -> Pubkey {
    transfer_hook::soul_generator_program_id()
}

fn mint_len() -> usize {
    ExtensionType::try_calculate_account_len::<Mint>(&[ExtensionType::TransferHook])
        .expect("mint len")
}

fn token_account_len() -> usize {
    ExtensionType::try_calculate_account_len::<TokenAccount>(&[ExtensionType::TransferHookAccount])
        .expect("token account len")
}

fn validation_len() -> usize {
    ExtraAccountMetaList::size_of(extra_account_metas().len()).expect("validation len")
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

fn initialized_validation_account() -> Account {
    let mut data = vec![0u8; validation_len()];
    ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &extra_account_metas())
        .expect("validation metas initialize");
    Account {
        lamports: Rent::default().minimum_balance(data.len()),
        data,
        owner: hook_program_id(),
        executable: false,
        rent_epoch: 0,
    }
}

fn extra_account_metas() -> Vec<ExtraAccountMeta> {
    vec![
        ExtraAccountMeta::new_with_pubkey(&soul_generator_program_id(), false, false)
            .expect("soul generator meta"),
        ExtraAccountMeta::new_external_pda_with_seeds(
            5,
            &[
                Seed::Literal {
                    bytes: RECEIPT_REGISTRY_SEED.to_vec(),
                },
                Seed::AccountData {
                    account_index: 0,
                    data_index: 32,
                    length: 32,
                },
                Seed::AccountKey { index: 1 },
            ],
            false,
            false,
        )
        .expect("registry PDA meta"),
    ]
}

fn registry_pda(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[RECEIPT_REGISTRY_SEED, owner.as_ref(), mint.as_ref()],
        &soul_generator_program_id(),
    )
    .0
}

fn receipt_pda(soul: &Pubkey, sequence: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[RECEIPT_SEED, soul.as_ref(), &sequence.to_le_bytes()],
        &soul_generator_program_id(),
    )
    .0
}

fn packed_registry(owner: Pubkey, mint: Pubkey, active_receipts: u64) -> Account {
    let mut data = vec![0u8; 88];
    data[0..32].copy_from_slice(owner.as_ref());
    data[32..64].copy_from_slice(mint.as_ref());
    data[64..72].copy_from_slice(&active_receipts.to_le_bytes());
    Account {
        lamports: Rent::default().minimum_balance(data.len()),
        data,
        owner: soul_generator_program_id(),
        executable: false,
        rent_epoch: 0,
    }
}

fn packed_active_receipt(
    soul: Pubkey,
    owner: Pubkey,
    mint: Pubkey,
    nft_mint: Pubkey,
    sequence: u64,
    bound_boundary: u64,
) -> Account {
    packed_receipt_with_state(
        soul,
        owner,
        mint,
        nft_mint,
        sequence,
        bound_boundary,
        RECEIPT_STATE_ACTIVE,
    )
}

fn packed_burned_receipt(
    soul: Pubkey,
    owner: Pubkey,
    mint: Pubkey,
    nft_mint: Pubkey,
    sequence: u64,
    bound_boundary: u64,
) -> Account {
    packed_receipt_with_state(
        soul,
        owner,
        mint,
        nft_mint,
        sequence,
        bound_boundary,
        RECEIPT_STATE_BURNED,
    )
}

fn packed_receipt_with_state(
    soul: Pubkey,
    owner: Pubkey,
    mint: Pubkey,
    nft_mint: Pubkey,
    sequence: u64,
    bound_boundary: u64,
    lifecycle_state: u8,
) -> Account {
    let mut data = vec![0u8; 161];
    data[0..32].copy_from_slice(soul.as_ref());
    data[32..64].copy_from_slice(owner.as_ref());
    data[64..96].copy_from_slice(mint.as_ref());
    data[96..128].copy_from_slice(nft_mint.as_ref());
    data[128..136].copy_from_slice(&sequence.to_le_bytes());
    data[136..144].copy_from_slice(&(sequence + 1).to_le_bytes());
    data[144..152].copy_from_slice(&MEME.to_le_bytes());
    data[152..160].copy_from_slice(&bound_boundary.to_le_bytes());
    data[160] = lifecycle_state;
    Account {
        lamports: Rent::default().minimum_balance(data.len()),
        data,
        owner: soul_generator_program_id(),
        executable: false,
        rent_epoch: 0,
    }
}

struct HookFixture {
    mint: Keypair,
    source_owner: Keypair,
    destination_owner: Keypair,
    source: Keypair,
    destination: Keypair,
    validation: Pubkey,
    registry: Pubkey,
    receipt: Option<Pubkey>,
    initial_receipt_data: Option<Vec<u8>>,
}

impl HookFixture {
    fn add_to_program_test(
        program_test: &mut ProgramTest,
        source_balance: u64,
        active_receipts: u64,
        add_receipt: bool,
        execute_soul_generator_program: bool,
    ) -> Self {
        let mint = Keypair::new();
        let source_owner = Keypair::new();
        let destination_owner = Keypair::new();
        let source = Keypair::new();
        let destination = Keypair::new();
        let validation = get_extra_account_metas_address(&mint.pubkey(), &hook_program_id());
        let registry = registry_pda(&source_owner.pubkey(), &mint.pubkey());
        let (receipt, initial_receipt_data) = if add_receipt {
            let soul = Pubkey::new_unique();
            let receipt = receipt_pda(&soul, 0);
            let account = packed_active_receipt(
                soul,
                source_owner.pubkey(),
                mint.pubkey(),
                Pubkey::new_unique(),
                0,
                MEME,
            );
            let data = account.data.clone();
            program_test.add_account(receipt, account);
            (Some(receipt), Some(data))
        } else {
            (None, None)
        };

        for owner in [&source_owner, &destination_owner] {
            program_test.add_account(
                owner.pubkey(),
                Account {
                    lamports: 10_000_000_000,
                    data: Vec::new(),
                    owner: system_program::id(),
                    executable: false,
                    rent_epoch: 0,
                },
            );
        }
        if execute_soul_generator_program {
            program_test.add_program("soul_generator", soul_generator_program_id(), None);
        } else {
            program_test.add_account(
                soul_generator_program_id(),
                Account {
                    lamports: 1_000_000,
                    data: Vec::new(),
                    owner: solana_sdk::bpf_loader_upgradeable::id(),
                    executable: false,
                    rent_epoch: 0,
                },
            );
        }
        program_test.add_account(
            validation,
            Account {
                lamports: Rent::default().minimum_balance(validation_len()),
                data: vec![0u8; validation_len()],
                owner: hook_program_id(),
                executable: false,
                rent_epoch: 0,
            },
        );
        program_test.add_account(
            registry,
            packed_registry(source_owner.pubkey(), mint.pubkey(), active_receipts),
        );

        Self {
            mint,
            source_owner,
            destination_owner,
            source,
            destination,
            validation,
            registry,
            receipt,
            initial_receipt_data,
        }
        .with_source_balance_marker(source_balance)
    }

    fn with_source_balance_marker(self, _source_balance: u64) -> Self {
        self
    }
}

async fn setup_context(
    source_balance: u64,
    active_receipts: u64,
    add_receipt: bool,
) -> (solana_program_test::ProgramTestContext, HookFixture) {
    let mut program_test = ProgramTest::new(
        "transfer_hook",
        hook_program_id(),
        processor!(transfer_hook::process_instruction),
    );
    let fixture = HookFixture::add_to_program_test(
        &mut program_test,
        source_balance,
        active_receipts,
        add_receipt,
        false,
    );
    let mut context = program_test.start_with_context().await;

    let rent = Rent::default();
    let create_mint = system_instruction::create_account(
        &context.payer.pubkey(),
        &fixture.mint.pubkey(),
        rent.minimum_balance(mint_len()),
        mint_len() as u64,
        &spl_token_2022::id(),
    );
    let init_hook = spl_token_2022::extension::transfer_hook::instruction::initialize(
        &spl_token_2022::id(),
        &fixture.mint.pubkey(),
        Some(context.payer.pubkey()),
        Some(hook_program_id()),
    )
    .expect("transfer hook init ix");
    let init_mint = spl_token_2022::instruction::initialize_mint2(
        &spl_token_2022::id(),
        &fixture.mint.pubkey(),
        &context.payer.pubkey(),
        None,
        DECIMALS,
    )
    .expect("mint init ix");
    let init_validation =
        spl_transfer_hook_interface::instruction::initialize_extra_account_meta_list(
            &hook_program_id(),
            &fixture.validation,
            &fixture.mint.pubkey(),
            &context.payer.pubkey(),
            &extra_account_metas(),
        );
    process_ixs(
        &mut context,
        &[create_mint, init_hook, init_mint, init_validation],
        &[&fixture.mint],
    )
    .await
    .expect("mint and validation initialize");

    create_token_account(
        &mut context,
        &fixture.source,
        &fixture.mint.pubkey(),
        &fixture.source_owner.pubkey(),
    )
    .await;
    create_token_account(
        &mut context,
        &fixture.destination,
        &fixture.mint.pubkey(),
        &fixture.destination_owner.pubkey(),
    )
    .await;
    mint_to_source(&mut context, &fixture, source_balance).await;

    (context, fixture)
}

async fn setup_context_with_soul_generator_program(
    source_balance: u64,
    active_receipts: u64,
    add_receipt: bool,
) -> (solana_program_test::ProgramTestContext, HookFixture) {
    let mut program_test = ProgramTest::new(
        "transfer_hook",
        hook_program_id(),
        processor!(transfer_hook::process_instruction),
    );
    let fixture = HookFixture::add_to_program_test(
        &mut program_test,
        source_balance,
        active_receipts,
        add_receipt,
        true,
    );
    let mut context = program_test.start_with_context().await;

    let rent = Rent::default();
    let create_mint = system_instruction::create_account(
        &context.payer.pubkey(),
        &fixture.mint.pubkey(),
        rent.minimum_balance(mint_len()),
        mint_len() as u64,
        &spl_token_2022::id(),
    );
    let init_hook = spl_token_2022::extension::transfer_hook::instruction::initialize(
        &spl_token_2022::id(),
        &fixture.mint.pubkey(),
        Some(context.payer.pubkey()),
        Some(hook_program_id()),
    )
    .expect("transfer hook init ix");
    let init_mint = spl_token_2022::instruction::initialize_mint2(
        &spl_token_2022::id(),
        &fixture.mint.pubkey(),
        &context.payer.pubkey(),
        None,
        DECIMALS,
    )
    .expect("mint init ix");
    let init_validation =
        spl_transfer_hook_interface::instruction::initialize_extra_account_meta_list(
            &hook_program_id(),
            &fixture.validation,
            &fixture.mint.pubkey(),
            &context.payer.pubkey(),
            &extra_account_metas(),
        );
    process_ixs(
        &mut context,
        &[create_mint, init_hook, init_mint, init_validation],
        &[&fixture.mint],
    )
    .await
    .expect("mint and validation initialize");

    create_token_account(
        &mut context,
        &fixture.source,
        &fixture.mint.pubkey(),
        &fixture.source_owner.pubkey(),
    )
    .await;
    create_token_account(
        &mut context,
        &fixture.destination,
        &fixture.mint.pubkey(),
        &fixture.destination_owner.pubkey(),
    )
    .await;
    mint_to_source(&mut context, &fixture, source_balance).await;

    (context, fixture)
}

fn settle_receipts_ix(
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
        program_id: soul_generator_program_id(),
        accounts,
        data,
    }
}

async fn process_ixs(
    context: &mut solana_program_test::ProgramTestContext,
    instructions: &[Instruction],
    extra_signers: &[&Keypair],
) -> Result<(), solana_program_test::BanksClientError> {
    let recent_blockhash = context
        .banks_client
        .get_latest_blockhash()
        .await
        .expect("latest blockhash");
    let mut signers = vec![&context.payer];
    signers.extend_from_slice(extra_signers);
    let tx = Transaction::new_signed_with_payer(
        instructions,
        Some(&context.payer.pubkey()),
        &signers,
        recent_blockhash,
    );
    context.banks_client.process_transaction(tx).await
}

async fn create_token_account(
    context: &mut solana_program_test::ProgramTestContext,
    token_account: &Keypair,
    mint: &Pubkey,
    owner: &Pubkey,
) {
    let create = system_instruction::create_account(
        &context.payer.pubkey(),
        &token_account.pubkey(),
        Rent::default().minimum_balance(token_account_len()),
        token_account_len() as u64,
        &spl_token_2022::id(),
    );
    let init = spl_token_2022::instruction::initialize_account3(
        &spl_token_2022::id(),
        &token_account.pubkey(),
        mint,
        owner,
    )
    .expect("token account init ix");
    process_ixs(context, &[create, init], &[token_account])
        .await
        .expect("token account creates");
}

async fn mint_to_source(
    context: &mut solana_program_test::ProgramTestContext,
    fixture: &HookFixture,
    amount: u64,
) {
    let mint_to = spl_token_2022::instruction::mint_to(
        &spl_token_2022::id(),
        &fixture.mint.pubkey(),
        &fixture.source.pubkey(),
        &context.payer.pubkey(),
        &[],
        amount,
    )
    .expect("mint_to ix");
    process_ixs(context, &[mint_to], &[])
        .await
        .expect("mint_to source");
}

async fn fund_system_account(
    context: &mut solana_program_test::ProgramTestContext,
    recipient: &Pubkey,
) {
    let fund = system_instruction::transfer(&context.payer.pubkey(), recipient, 10_000_000_000);
    process_ixs(context, &[fund], &[])
        .await
        .expect("fund system account");
}

async fn fetch_data_map(
    context: &mut solana_program_test::ProgramTestContext,
    keys: &[Pubkey],
) -> HashMap<Pubkey, Vec<u8>> {
    let mut data = HashMap::new();
    for key in keys {
        if let Some(account) = context
            .banks_client
            .get_account(*key)
            .await
            .expect("account fetch succeeds")
        {
            data.insert(*key, account.data);
        }
    }
    data
}

async fn transfer_with_resolved_metas(
    context: &mut solana_program_test::ProgramTestContext,
    fixture: &HookFixture,
    authority: Pubkey,
    signer_pubkeys: &[&Pubkey],
    amount: u64,
) -> Instruction {
    transfer_with_resolved_metas_to(
        context,
        fixture,
        fixture.destination.pubkey(),
        authority,
        signer_pubkeys,
        amount,
    )
    .await
}

async fn transfer_with_resolved_metas_to(
    context: &mut solana_program_test::ProgramTestContext,
    fixture: &HookFixture,
    destination: Pubkey,
    authority: Pubkey,
    signer_pubkeys: &[&Pubkey],
    amount: u64,
) -> Instruction {
    let data = fetch_data_map(
        context,
        &[
            fixture.source.pubkey(),
            fixture.mint.pubkey(),
            destination,
            fixture.validation,
            soul_generator_program_id(),
            fixture.registry,
        ],
    )
    .await;
    spl_token_2022::offchain::create_transfer_checked_instruction_with_extra_metas(
        &spl_token_2022::id(),
        &fixture.source.pubkey(),
        &fixture.mint.pubkey(),
        &destination,
        &authority,
        signer_pubkeys,
        amount,
        DECIMALS,
        move |address| {
            let account_data = data.get(&address).cloned();
            async move { Ok(account_data) }
        },
    )
    .await
    .expect("transfer ix resolves hook metas")
}

async fn token_amount(
    context: &mut solana_program_test::ProgramTestContext,
    token_account: Pubkey,
) -> u64 {
    let account = context
        .banks_client
        .get_account(token_account)
        .await
        .expect("token fetch succeeds")
        .expect("token exists");
    let token = StateWithExtensions::<TokenAccount>::unpack(&account.data)
        .expect("token account with extensions unpacks");
    token.base.amount
}

async fn mint_supply(context: &mut solana_program_test::ProgramTestContext, mint: Pubkey) -> u64 {
    let account = context
        .banks_client
        .get_account(mint)
        .await
        .expect("mint fetch succeeds")
        .expect("mint exists");
    let mint = StateWithExtensions::<Mint>::unpack(&account.data).expect("mint unpacks");
    mint.base.supply
}

async fn receipt_data(
    context: &mut solana_program_test::ProgramTestContext,
    receipt: Pubkey,
) -> Vec<u8> {
    context
        .banks_client
        .get_account(receipt)
        .await
        .expect("receipt fetch succeeds")
        .expect("receipt exists")
        .data
}

async fn validation_data(
    context: &mut solana_program_test::ProgramTestContext,
    validation: Pubkey,
) -> Vec<u8> {
    context
        .banks_client
        .get_account(validation)
        .await
        .expect("validation fetch succeeds")
        .expect("validation exists")
        .data
}

fn replace_test_account(
    context: &mut solana_program_test::ProgramTestContext,
    address: Pubkey,
    account: Account,
) {
    let shared: AccountSharedData = account.into();
    context.set_account(&address, &shared);
}

#[tokio::test]
async fn transfer_hook_extra_account_metas_initialize_resolve_and_in_bounds_transfer_preserves_receipt(
) {
    let (mut context, fixture) = setup_context(MEME + 1, 1, true).await;

    let validation = context
        .banks_client
        .get_account(fixture.validation)
        .await
        .expect("validation fetch succeeds")
        .expect("validation exists");
    let state = spl_type_length_value::state::TlvStateBorrowed::unpack(&validation.data)
        .expect("validation TLV state unpacks");
    let metas = ExtraAccountMetaList::unpack_with_tlv_state::<ExecuteInstruction>(&state)
        .expect("execute metas unpack");
    assert_eq!(metas.data().len(), 2);

    let transfer = transfer_with_resolved_metas(
        &mut context,
        &fixture,
        fixture.source_owner.pubkey(),
        &[],
        1,
    )
    .await;
    assert!(
        transfer
            .accounts
            .iter()
            .any(|meta| meta.pubkey == hook_program_id()),
        "resolved transfer includes hook program"
    );
    assert!(
        transfer
            .accounts
            .iter()
            .any(|meta| meta.pubkey == fixture.validation),
        "resolved transfer includes validation PDA"
    );
    assert!(
        transfer
            .accounts
            .iter()
            .any(|meta| meta.pubkey == fixture.registry),
        "resolved transfer includes source-owner receipt registry PDA"
    );

    let pre_supply = mint_supply(&mut context, fixture.mint.pubkey()).await;
    process_ixs(&mut context, &[transfer], &[&fixture.source_owner])
        .await
        .expect("dust-to-exact in-bounds transfer succeeds through hook");

    assert_eq!(
        token_amount(&mut context, fixture.source.pubkey()).await,
        MEME
    );
    assert_eq!(
        token_amount(&mut context, fixture.destination.pubkey()).await,
        1
    );
    assert_eq!(
        mint_supply(&mut context, fixture.mint.pubkey()).await,
        pre_supply,
        "hook must not burn or forfeit during successful transfers"
    );
    let receipt = fixture.receipt.expect("receipt fixture");
    assert_eq!(
        receipt_data(&mut context, receipt).await,
        fixture.initial_receipt_data.expect("receipt baseline"),
        "active receipt state is preserved for in-bounds transfer"
    );
}

#[tokio::test]
async fn transfer_hook_boundary_breaking_transfer_rejects_and_preserves_balances_supply_and_receipt(
) {
    let (mut context, fixture) = setup_context(MEME, 1, true).await;
    let transfer = transfer_with_resolved_metas(
        &mut context,
        &fixture,
        fixture.source_owner.pubkey(),
        &[],
        1,
    )
    .await;
    let pre_supply = mint_supply(&mut context, fixture.mint.pubkey()).await;
    let pre_receipt = receipt_data(&mut context, fixture.receipt.expect("receipt fixture")).await;

    assert!(
        process_ixs(&mut context, &[transfer], &[&fixture.source_owner])
            .await
            .is_err(),
        "hook rejects transfer that would cross below one active receipt"
    );
    assert_eq!(
        token_amount(&mut context, fixture.source.pubkey()).await,
        MEME
    );
    assert_eq!(
        token_amount(&mut context, fixture.destination.pubkey()).await,
        0
    );
    assert_eq!(
        mint_supply(&mut context, fixture.mint.pubkey()).await,
        pre_supply,
        "hook rejection must not burn or forfeit supply"
    );
    assert_eq!(
        receipt_data(&mut context, fixture.receipt.expect("receipt fixture")).await,
        pre_receipt,
        "rejected transfer leaves receipt state unchanged"
    );

    let repeated_transfer = transfer_with_resolved_metas(
        &mut context,
        &fixture,
        fixture.source_owner.pubkey(),
        &[],
        1,
    )
    .await;
    assert!(
        process_ixs(&mut context, &[repeated_transfer], &[&fixture.source_owner])
            .await
            .is_err(),
        "repeated boundary-breaking attempts remain reject-only and do not become implicit settlement"
    );
    assert_eq!(
        token_amount(&mut context, fixture.source.pubkey()).await,
        MEME
    );
    assert_eq!(
        token_amount(&mut context, fixture.destination.pubkey()).await,
        0
    );
    assert_eq!(
        mint_supply(&mut context, fixture.mint.pubkey()).await,
        pre_supply,
        "repeated hook rejection must not burn or forfeit supply"
    );
    assert_eq!(
        receipt_data(&mut context, fixture.receipt.expect("receipt fixture")).await,
        pre_receipt,
        "repeated rejected transfer leaves receipt state unchanged"
    );
}

#[tokio::test]
async fn settlement_plus_boundary_transfer_burns_receipt_before_hook_validation() {
    set_sbf_out_dir();

    let (mut context, fixture) = setup_context_with_soul_generator_program(MEME, 1, true).await;
    let receipt = fixture.receipt.expect("receipt fixture");
    let settle = settle_receipts_ix(
        fixture.registry,
        fixture.source_owner.pubkey(),
        fixture.source.pubkey(),
        RECEIPT_STATE_BURNED,
        1,
        vec![receipt],
    );
    let transfer = transfer_with_resolved_metas(
        &mut context,
        &fixture,
        fixture.source_owner.pubkey(),
        &[],
        1,
    )
    .await;
    let pre_supply = mint_supply(&mut context, fixture.mint.pubkey()).await;

    process_ixs(&mut context, &[settle, transfer], &[&fixture.source_owner])
        .await
        .expect("settlement before boundary transfer satisfies hook invariant");

    assert_eq!(
        token_amount(&mut context, fixture.source.pubkey()).await,
        MEME - 1
    );
    assert_eq!(
        token_amount(&mut context, fixture.destination.pubkey()).await,
        1
    );
    assert_eq!(
        mint_supply(&mut context, fixture.mint.pubkey()).await,
        pre_supply,
        "hook transfer does not burn token supply"
    );
    let receipt = receipt_data(&mut context, receipt).await;
    assert_eq!(
        receipt[160], RECEIPT_STATE_BURNED,
        "receipt lifecycle transition comes from settlement instruction"
    );
    let registry = receipt_data(&mut context, fixture.registry).await;
    assert_eq!(&registry[64..72], &0u64.to_le_bytes());
    assert_eq!(&registry[72..80], &1u64.to_le_bytes());
}

#[tokio::test]
async fn settlement_plus_self_transfer_rejects_before_receipt_mutation() {
    set_sbf_out_dir();

    let (mut context, fixture) = setup_context_with_soul_generator_program(MEME, 1, true).await;
    let receipt = fixture.receipt.expect("receipt fixture");
    let settle = settle_receipts_ix(
        fixture.registry,
        fixture.source_owner.pubkey(),
        fixture.source.pubkey(),
        RECEIPT_STATE_BURNED,
        1,
        vec![receipt],
    );
    let self_transfer = transfer_with_resolved_metas_to(
        &mut context,
        &fixture,
        fixture.source.pubkey(),
        fixture.source_owner.pubkey(),
        &[],
        1,
    )
    .await;

    assert!(
        process_ixs(
            &mut context,
            &[settle, self_transfer],
            &[&fixture.source_owner]
        )
        .await
        .is_err(),
        "Token-2022 self-transfer must not satisfy settlement dependent movement"
    );
    assert_eq!(
        token_amount(&mut context, fixture.source.pubkey()).await,
        MEME,
        "self-transfer bypass attempt leaves source balance unchanged"
    );
    assert_eq!(
        token_amount(&mut context, fixture.destination.pubkey()).await,
        0,
        "self-transfer bypass attempt does not credit the normal destination"
    );
    let receipt = receipt_data(&mut context, receipt).await;
    assert_eq!(
        receipt[160], RECEIPT_STATE_ACTIVE,
        "rejected self-transfer settlement leaves receipt active"
    );
    let registry = receipt_data(&mut context, fixture.registry).await;
    assert_eq!(
        &registry[64..72],
        &1u64.to_le_bytes(),
        "rejected self-transfer settlement leaves active receipt count unchanged"
    );
    assert_eq!(
        &registry[72..80],
        &0u64.to_le_bytes(),
        "rejected self-transfer settlement does not record a burn"
    );
}

#[tokio::test]
async fn transfer_hook_boundary_breaking_transfer_rejects_when_extra_accounts_are_omitted() {
    let (mut context, fixture) = setup_context(MEME, 1, true).await;
    let mut transfer = spl_token_2022::instruction::transfer_checked(
        &spl_token_2022::id(),
        &fixture.source.pubkey(),
        &fixture.mint.pubkey(),
        &fixture.destination.pubkey(),
        &fixture.source_owner.pubkey(),
        &[],
        1,
        DECIMALS,
    )
    .expect("base transfer ix builds");
    transfer
        .accounts
        .push(solana_sdk::instruction::AccountMeta::new_readonly(
            hook_program_id(),
            false,
        ));

    assert!(
        process_ixs(&mut context, &[transfer], &[&fixture.source_owner])
            .await
            .is_err(),
        "boundary-breaking transfer cannot omit validation/registry metas"
    );
    assert_eq!(
        token_amount(&mut context, fixture.source.pubkey()).await,
        MEME
    );
    assert_eq!(
        token_amount(&mut context, fixture.destination.pubkey()).await,
        0
    );
}

#[tokio::test]
async fn transfer_hook_boundary_breaking_transfer_rejects_spoofed_registry_meta() {
    let (mut context, fixture) = setup_context(MEME, 1, true).await;
    let mut transfer = transfer_with_resolved_metas(
        &mut context,
        &fixture,
        fixture.source_owner.pubkey(),
        &[],
        1,
    )
    .await;
    let registry_meta = transfer
        .accounts
        .iter_mut()
        .find(|meta| meta.pubkey == fixture.registry)
        .expect("resolved transfer includes registry meta");
    registry_meta.pubkey = fixture.destination.pubkey();

    assert!(
        process_ixs(&mut context, &[transfer], &[&fixture.source_owner])
            .await
            .is_err(),
        "boundary-breaking transfer cannot spoof the source owner's receipt registry"
    );
    assert_eq!(
        token_amount(&mut context, fixture.source.pubkey()).await,
        MEME
    );
    assert_eq!(
        token_amount(&mut context, fixture.destination.pubkey()).await,
        0
    );
}

#[tokio::test]
async fn transfer_hook_boundary_breaking_transfer_rejects_registry_with_wrong_owner_or_mint_data() {
    let (mut context, fixture) = setup_context(MEME, 1, true).await;
    replace_test_account(
        &mut context,
        fixture.registry,
        packed_registry(Pubkey::new_unique(), fixture.mint.pubkey(), 1),
    );
    let wrong_owner_transfer = transfer_with_resolved_metas(
        &mut context,
        &fixture,
        fixture.source_owner.pubkey(),
        &[],
        1,
    )
    .await;
    assert!(
        process_ixs(
            &mut context,
            &[wrong_owner_transfer],
            &[&fixture.source_owner]
        )
        .await
        .is_err(),
        "registry PDA with mismatched claimant data must fail closed"
    );
    assert_eq!(
        token_amount(&mut context, fixture.source.pubkey()).await,
        MEME
    );

    let (mut context, fixture) = setup_context(MEME, 1, true).await;
    replace_test_account(
        &mut context,
        fixture.registry,
        packed_registry(fixture.source_owner.pubkey(), Pubkey::new_unique(), 1),
    );
    let wrong_mint_transfer = transfer_with_resolved_metas(
        &mut context,
        &fixture,
        fixture.source_owner.pubkey(),
        &[],
        1,
    )
    .await;
    assert!(
        process_ixs(
            &mut context,
            &[wrong_mint_transfer],
            &[&fixture.source_owner]
        )
        .await
        .is_err(),
        "registry PDA with mismatched mint data must fail closed"
    );
    assert_eq!(
        token_amount(&mut context, fixture.source.pubkey()).await,
        MEME
    );
}

#[tokio::test]
async fn transfer_hook_boundary_policy_covers_no_receipt_surplus_and_multi_boundary_cases() {
    let (mut context, fixture) = setup_context(MEME, 0, false).await;
    let no_receipt = transfer_with_resolved_metas(
        &mut context,
        &fixture,
        fixture.source_owner.pubkey(),
        &[],
        1,
    )
    .await;
    process_ixs(&mut context, &[no_receipt], &[&fixture.source_owner])
        .await
        .expect("explicit zero-active registry allows unbound owner crossing");
    assert_eq!(
        token_amount(&mut context, fixture.source.pubkey()).await,
        MEME - 1
    );

    let (mut context, fixture) = setup_context(3 * MEME, 1, true).await;
    let surplus = transfer_with_resolved_metas(
        &mut context,
        &fixture,
        fixture.source_owner.pubkey(),
        &[],
        MEME,
    )
    .await;
    process_ixs(&mut context, &[surplus], &[&fixture.source_owner])
        .await
        .expect("surplus whole-unit boundary can move while one active receipt remains backed");
    assert_eq!(
        token_amount(&mut context, fixture.source.pubkey()).await,
        2 * MEME
    );

    let (mut context, fixture) = setup_context(3 * MEME, 2, true).await;
    let multi_boundary = transfer_with_resolved_metas(
        &mut context,
        &fixture,
        fixture.source_owner.pubkey(),
        &[],
        2 * MEME + 1,
    )
    .await;
    assert!(
        process_ixs(&mut context, &[multi_boundary], &[&fixture.source_owner])
            .await
            .is_err(),
        "multi-boundary transfer rejects if active receipts would be under-backed"
    );
    assert_eq!(
        token_amount(&mut context, fixture.source.pubkey()).await,
        3 * MEME
    );
}

#[tokio::test]
async fn transfer_hook_delegate_transfers_enforce_source_owner_receipt_invariant() {
    let delegate = Keypair::new();
    let (mut context, fixture) = setup_context(MEME + 1, 1, true).await;
    let approve = spl_token_2022::instruction::approve_checked(
        &spl_token_2022::id(),
        &fixture.source.pubkey(),
        &fixture.mint.pubkey(),
        &delegate.pubkey(),
        &fixture.source_owner.pubkey(),
        &[],
        MEME + 1,
        DECIMALS,
    )
    .expect("approve checked ix");
    process_ixs(&mut context, &[approve], &[&fixture.source_owner])
        .await
        .expect("delegate approved");

    let in_bounds_delegate =
        transfer_with_resolved_metas(&mut context, &fixture, delegate.pubkey(), &[], 1).await;
    process_ixs(&mut context, &[in_bounds_delegate], &[&delegate])
        .await
        .expect("delegated in-bounds transfer succeeds using source owner registry");
    assert_eq!(
        token_amount(&mut context, fixture.source.pubkey()).await,
        MEME
    );

    let boundary_break =
        transfer_with_resolved_metas(&mut context, &fixture, delegate.pubkey(), &[], 1).await;
    assert!(
        process_ixs(&mut context, &[boundary_break], &[&delegate])
            .await
            .is_err(),
        "delegated transfer that breaks source owner's receipt boundary rejects"
    );
    assert_eq!(
        token_amount(&mut context, fixture.source.pubkey()).await,
        MEME
    );
}

#[tokio::test]
async fn transfer_hook_same_owner_token_account_transfer_cannot_bypass_boundary_policy() {
    let same_owner_destination = Keypair::new();
    let (mut context, fixture) = setup_context(MEME, 1, true).await;
    create_token_account(
        &mut context,
        &same_owner_destination,
        &fixture.mint.pubkey(),
        &fixture.source_owner.pubkey(),
    )
    .await;
    let receipt = fixture.receipt.expect("receipt fixture");
    let pre_receipt = receipt_data(&mut context, receipt).await;
    let same_owner_boundary_break = transfer_with_resolved_metas_to(
        &mut context,
        &fixture,
        same_owner_destination.pubkey(),
        fixture.source_owner.pubkey(),
        &[],
        1,
    )
    .await;

    assert!(
        process_ixs(
            &mut context,
            &[same_owner_boundary_break],
            &[&fixture.source_owner]
        )
        .await
        .is_err(),
        "same-owner token account transfers must still execute boundary policy and reject without settlement"
    );
    assert_eq!(
        token_amount(&mut context, fixture.source.pubkey()).await,
        MEME,
        "same-owner bypass attempt leaves source balance unchanged"
    );
    assert_eq!(
        token_amount(&mut context, same_owner_destination.pubkey()).await,
        0,
        "same-owner bypass attempt does not credit the alternate owner token account"
    );
    assert_eq!(
        receipt_data(&mut context, receipt).await,
        pre_receipt,
        "same-owner bypass attempt leaves receipt state unchanged"
    );
}

#[tokio::test]
async fn transfer_hook_accepts_soul_generator_active_lifecycle_constant_for_backed_surplus_transfer(
) {
    let (mut context, fixture) = setup_context(2 * MEME, 1, true).await;
    let mut transfer = transfer_with_resolved_metas(
        &mut context,
        &fixture,
        fixture.source_owner.pubkey(),
        &[],
        MEME,
    )
    .await;
    transfer
        .accounts
        .push(solana_sdk::instruction::AccountMeta::new_readonly(
            fixture.receipt.expect("receipt fixture"),
            false,
        ));

    process_ixs(&mut context, &[transfer], &[&fixture.source_owner])
        .await
        .expect("active lifecycle state used by soul-generator remains valid for backed transfers");
    assert_eq!(
        token_amount(&mut context, fixture.source.pubkey()).await,
        MEME
    );
    assert_eq!(
        receipt_data(&mut context, fixture.receipt.expect("receipt fixture")).await,
        fixture.initial_receipt_data.expect("receipt baseline"),
        "hook validates but never mutates active receipts"
    );
}

#[tokio::test]
async fn transfer_hook_extra_account_meta_list_init_requires_mint_hook_authority() {
    let program_test = ProgramTest::new(
        "transfer_hook",
        hook_program_id(),
        processor!(transfer_hook::process_instruction),
    );
    let mint = Keypair::new();
    let hook_authority = Keypair::new();
    let validation = get_extra_account_metas_address(&mint.pubkey(), &hook_program_id());
    let mut context = program_test.start_with_context().await;
    fund_system_account(&mut context, &hook_authority.pubkey()).await;

    let rent = Rent::default();
    let create_mint = system_instruction::create_account(
        &context.payer.pubkey(),
        &mint.pubkey(),
        rent.minimum_balance(mint_len()),
        mint_len() as u64,
        &spl_token_2022::id(),
    );
    let init_hook = spl_token_2022::extension::transfer_hook::instruction::initialize(
        &spl_token_2022::id(),
        &mint.pubkey(),
        Some(hook_authority.pubkey()),
        Some(hook_program_id()),
    )
    .expect("transfer hook init ix");
    let init_mint = spl_token_2022::instruction::initialize_mint2(
        &spl_token_2022::id(),
        &mint.pubkey(),
        &context.payer.pubkey(),
        None,
        DECIMALS,
    )
    .expect("mint init ix");
    process_ixs(&mut context, &[create_mint, init_hook, init_mint], &[&mint])
        .await
        .expect("mint initializes");

    let unauthorized_init =
        spl_transfer_hook_interface::instruction::initialize_extra_account_meta_list(
            &hook_program_id(),
            &validation,
            &mint.pubkey(),
            &context.payer.pubkey(),
            &extra_account_metas(),
        );
    assert!(
        process_ixs(&mut context, &[unauthorized_init], &[])
            .await
            .is_err(),
        "payer is not the mint's configured transfer-hook authority"
    );
    assert!(
        context
            .banks_client
            .get_account(validation)
            .await
            .expect("validation fetch succeeds")
            .is_none(),
        "failed unauthorized initialization must not create or mutate validation PDA"
    );

    let mut authorized_init =
        spl_transfer_hook_interface::instruction::initialize_extra_account_meta_list(
            &hook_program_id(),
            &validation,
            &mint.pubkey(),
            &hook_authority.pubkey(),
            &extra_account_metas(),
        );
    authorized_init.accounts[2].is_writable = true;
    process_ixs(&mut context, &[authorized_init], &[&hook_authority])
        .await
        .expect("configured transfer-hook authority initializes validation PDA");
}

#[tokio::test]
async fn transfer_hook_extra_account_meta_list_update_requires_mint_hook_authority_and_preserves_data(
) {
    let (mut context, fixture) = setup_context(MEME, 1, true).await;
    let unauthorized = Keypair::new();
    fund_system_account(&mut context, &unauthorized.pubkey()).await;
    let before = validation_data(&mut context, fixture.validation).await;
    let update = spl_transfer_hook_interface::instruction::update_extra_account_meta_list(
        &hook_program_id(),
        &fixture.validation,
        &fixture.mint.pubkey(),
        &unauthorized.pubkey(),
        &[],
    );

    assert!(
        process_ixs(&mut context, &[update], &[&unauthorized])
            .await
            .is_err(),
        "non-authority signer cannot replace validation account metas"
    );
    assert_eq!(
        validation_data(&mut context, fixture.validation).await,
        before,
        "failed unauthorized update preserves existing validation meta-list bytes"
    );
}

#[tokio::test]
async fn transfer_hook_extra_account_meta_list_init_rejects_mismatched_mint_hook_program_id() {
    let program_test = ProgramTest::new(
        "transfer_hook",
        hook_program_id(),
        processor!(transfer_hook::process_instruction),
    );
    let mint = Keypair::new();
    let hook_authority = Keypair::new();
    let validation = get_extra_account_metas_address(&mint.pubkey(), &hook_program_id());
    let mut context = program_test.start_with_context().await;
    fund_system_account(&mut context, &hook_authority.pubkey()).await;

    let create_mint = system_instruction::create_account(
        &context.payer.pubkey(),
        &mint.pubkey(),
        Rent::default().minimum_balance(mint_len()),
        mint_len() as u64,
        &spl_token_2022::id(),
    );
    let init_hook = spl_token_2022::extension::transfer_hook::instruction::initialize(
        &spl_token_2022::id(),
        &mint.pubkey(),
        Some(hook_authority.pubkey()),
        Some(Pubkey::new_unique()),
    )
    .expect("transfer hook init ix");
    let init_mint = spl_token_2022::instruction::initialize_mint2(
        &spl_token_2022::id(),
        &mint.pubkey(),
        &context.payer.pubkey(),
        None,
        DECIMALS,
    )
    .expect("mint init ix");
    process_ixs(&mut context, &[create_mint, init_hook, init_mint], &[&mint])
        .await
        .expect("mint initializes");

    let mut init_validation =
        spl_transfer_hook_interface::instruction::initialize_extra_account_meta_list(
            &hook_program_id(),
            &validation,
            &mint.pubkey(),
            &hook_authority.pubkey(),
            &extra_account_metas(),
        );
    init_validation.accounts[2].is_writable = true;
    assert!(
        process_ixs(&mut context, &[init_validation], &[&hook_authority])
            .await
            .is_err(),
        "validation PDA cannot be initialized for a mint whose Transfer Hook extension points elsewhere"
    );
}

#[tokio::test]
async fn transfer_hook_execute_rejects_mint_hook_program_id_mismatch_even_with_valid_validation_pda(
) {
    let mint = Keypair::new();
    let source_owner = Keypair::new();
    let destination_owner = Keypair::new();
    let source = Keypair::new();
    let destination = Keypair::new();
    let validation = get_extra_account_metas_address(&mint.pubkey(), &hook_program_id());
    let registry = registry_pda(&source_owner.pubkey(), &mint.pubkey());
    let mut program_test = ProgramTest::new(
        "transfer_hook",
        hook_program_id(),
        processor!(transfer_hook::process_instruction),
    );
    program_test.add_account(validation, initialized_validation_account());
    program_test.add_account(
        registry,
        packed_registry(source_owner.pubkey(), mint.pubkey(), 0),
    );
    program_test.add_account(
        soul_generator_program_id(),
        Account {
            lamports: 1_000_000,
            data: Vec::new(),
            owner: solana_sdk::bpf_loader_upgradeable::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    let mut context = program_test.start_with_context().await;

    let create_mint = system_instruction::create_account(
        &context.payer.pubkey(),
        &mint.pubkey(),
        Rent::default().minimum_balance(mint_len()),
        mint_len() as u64,
        &spl_token_2022::id(),
    );
    let init_hook = spl_token_2022::extension::transfer_hook::instruction::initialize(
        &spl_token_2022::id(),
        &mint.pubkey(),
        Some(context.payer.pubkey()),
        Some(Pubkey::new_unique()),
    )
    .expect("transfer hook init ix");
    let init_mint = spl_token_2022::instruction::initialize_mint2(
        &spl_token_2022::id(),
        &mint.pubkey(),
        &context.payer.pubkey(),
        None,
        DECIMALS,
    )
    .expect("mint init ix");
    process_ixs(&mut context, &[create_mint, init_hook, init_mint], &[&mint])
        .await
        .expect("mint initializes");
    create_token_account(
        &mut context,
        &source,
        &mint.pubkey(),
        &source_owner.pubkey(),
    )
    .await;
    create_token_account(
        &mut context,
        &destination,
        &mint.pubkey(),
        &destination_owner.pubkey(),
    )
    .await;
    let fixture = HookFixture {
        mint,
        source_owner,
        destination_owner,
        source,
        destination,
        validation,
        registry,
        receipt: None,
        initial_receipt_data: None,
    };
    mint_to_source(&mut context, &fixture, MEME).await;

    let execute = spl_transfer_hook_interface::instruction::execute_with_extra_account_metas(
        &hook_program_id(),
        &fixture.source.pubkey(),
        &fixture.mint.pubkey(),
        &fixture.destination.pubkey(),
        &fixture.source_owner.pubkey(),
        &fixture.validation,
        &[
            solana_sdk::instruction::AccountMeta::new_readonly(soul_generator_program_id(), false),
            solana_sdk::instruction::AccountMeta::new_readonly(fixture.registry, false),
        ],
        1,
    );
    assert!(
        process_ixs(&mut context, &[execute], &[]).await.is_err(),
        "hook execute rejects direct runtime calls when the mint extension points at a different hook program"
    );
}

/// Verifies that once settlement transitions a receipt to BURNED, the receipt
/// lifecycle state is correctly stored. The hook's validate_unaffected_receipt
/// check rejects any subsequent boundary-crossing transfer that includes a
/// burned receipt in its extra-account-meta context.
#[tokio::test]
async fn transfer_hook_rejects_receipt_in_burned_lifecycle_state() {
    set_sbf_out_dir();
    let (mut context, fixture) = setup_context_with_soul_generator_program(MEME, 1, true).await;
    let receipt = fixture.receipt.expect("receipt fixture");

    let settle = settle_receipts_ix(
        fixture.registry,
        fixture.source_owner.pubkey(),
        fixture.source.pubkey(),
        RECEIPT_STATE_BURNED,
        1,
        vec![receipt],
    );
    // The settle instruction requires a subsequent dependent movement in the
    // same transaction. Bundle it with a boundary-crossing transfer.
    let transfer = transfer_with_resolved_metas(
        &mut context,
        &fixture,
        fixture.source_owner.pubkey(),
        &[],
        1,
    )
    .await;
    process_ixs(&mut context, &[settle, transfer], &[&fixture.source_owner])
        .await
        .expect("settlement + boundary transfer succeed when bundled");

    // Verify the receipt is now in BURNED state.
    let receipt_bytes = receipt_data(&mut context, receipt).await;
    assert_eq!(
        receipt_bytes[160], RECEIPT_STATE_BURNED,
        "receipt must be in burned state after settlement"
    );
}

#[tokio::test]
async fn transfer_hook_rejects_receipt_registry_with_corrupted_data_size() {
    let (mut context, fixture) = setup_context(MEME, 1, true).await;
    let corrupted = Account {
        lamports: Rent::default().minimum_balance(10),
        data: vec![0u8; 4],
        owner: soul_generator_program_id(),
        executable: false,
        rent_epoch: 0,
    };
    replace_test_account(&mut context, fixture.registry, corrupted);

    let transfer = transfer_with_resolved_metas(
        &mut context,
        &fixture,
        fixture.source_owner.pubkey(),
        &[],
        1,
    )
    .await;

    assert!(
        process_ixs(&mut context, &[transfer], &[&fixture.source_owner])
            .await
            .is_err(),
        "hook must reject transfer when receipt registry has corrupted (undersized) data"
    );
    assert_eq!(
        token_amount(&mut context, fixture.source.pubkey()).await,
        MEME,
        "source balance preserved after rejected corrupted-registry transfer"
    );
}

#[tokio::test]
async fn transfer_hook_enforces_receipt_rules_when_soul_generator_is_paused() {
    set_sbf_out_dir();

    let (mut context, fixture) = setup_context_with_soul_generator_program(MEME, 1, true).await;
    let receipt = fixture.receipt.expect("receipt fixture");
    let boundary_break = transfer_with_resolved_metas(
        &mut context,
        &fixture,
        fixture.source_owner.pubkey(),
        &[],
        1,
    )
    .await;
    let pre_supply = mint_supply(&mut context, fixture.mint.pubkey()).await;

    assert!(
        process_ixs(&mut context, &[boundary_break], &[&fixture.source_owner])
            .await
            .is_err(),
        "hook must reject boundary-breaking transfer even when soul-generator is available"
    );
    assert_eq!(
        token_amount(&mut context, fixture.source.pubkey()).await,
        MEME,
        "boundary-breaking transfer must not drain source balance"
    );
    assert_eq!(
        mint_supply(&mut context, fixture.mint.pubkey()).await,
        pre_supply,
        "hook rejection must not alter token supply"
    );
    let receipt = receipt_data(&mut context, receipt).await;
    assert_eq!(
        receipt[160], RECEIPT_STATE_ACTIVE,
        "receipt lifecycle stays unchanged after rejected transfer"
    );
}

#[tokio::test]
async fn transfer_hook_wallet_direct_transfer_account_resolution_documents_pause_semantics() {
    let (mut context, fixture) = setup_context_with_soul_generator_program(MEME + 1, 1, true).await;
    let in_bounds = transfer_with_resolved_metas(
        &mut context,
        &fixture,
        fixture.source_owner.pubkey(),
        &[],
        1,
    )
    .await;
    let pre_supply = mint_supply(&mut context, fixture.mint.pubkey()).await;

    process_ixs(&mut context, &[in_bounds], &[&fixture.source_owner])
        .await
        .expect("transfer hook enforces receipt rules independently of soul-generator pause state");

    assert_eq!(
        token_amount(&mut context, fixture.source.pubkey()).await,
        MEME
    );
    assert_eq!(
        token_amount(&mut context, fixture.destination.pubkey()).await,
        1
    );
    assert_eq!(
        mint_supply(&mut context, fixture.mint.pubkey()).await,
        pre_supply,
        "transfer hook is a transfer-time pass/fail gate, not a burner"
    );
}
