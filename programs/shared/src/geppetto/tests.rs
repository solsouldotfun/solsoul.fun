use super::{
    assert_owned_by, assert_pda, assert_program_id, assert_signer, assert_writable, AccountInfo,
    GeppettoError, Pubkey,
};
use pinocchio::account::{RuntimeAccount, NOT_BORROWED};
use std::boxed::Box;

fn key(byte: u8) -> Pubkey {
    Pubkey::new_from_array([byte; 32])
}

fn account(
    address: Pubkey,
    owner: Pubkey,
    is_signer: bool,
    is_writable: bool,
    executable: bool,
) -> (Box<RuntimeAccount>, AccountInfo) {
    let mut raw = Box::new(RuntimeAccount {
        borrow_state: NOT_BORROWED,
        is_signer: u8::from(is_signer),
        is_writable: u8::from(is_writable),
        executable: u8::from(executable),
        padding: [0; 4],
        address,
        owner,
        lamports: 0,
        data_len: 0,
    });
    let view = unsafe { AccountInfo::new_unchecked(raw.as_mut()) };

    (raw, view)
}

#[test]
fn assert_signer_accepts_signer() {
    let (_raw, signer) = account(key(1), key(2), true, false, false);

    assert_eq!(assert_signer(&signer), Ok(()));
}

#[test]
fn assert_signer_rejects_non_signer() {
    let (_raw, non_signer) = account(key(1), key(2), false, false, false);

    assert_eq!(
        assert_signer(&non_signer),
        Err(GeppettoError::MissingRequiredSignature.into())
    );
}

#[test]
fn assert_writable_accepts_writable_account() {
    let (_raw, writable) = account(key(3), key(4), false, true, false);

    assert_eq!(assert_writable(&writable), Ok(()));
}

#[test]
fn assert_writable_rejects_readonly_account() {
    let (_raw, readonly) = account(key(3), key(4), false, false, false);

    assert_eq!(
        assert_writable(&readonly),
        Err(GeppettoError::AccountNotWritable.into())
    );
}

#[test]
fn assert_owned_by_accepts_expected_owner() {
    let owner = key(5);
    let (_raw, owned) = account(key(6), owner, false, false, false);

    assert_eq!(assert_owned_by(&owned, &owner), Ok(()));
}

#[test]
fn assert_owned_by_rejects_unexpected_owner() {
    let (_raw, owned) = account(key(6), key(5), false, false, false);

    assert_eq!(
        assert_owned_by(&owned, &key(7)),
        Err(GeppettoError::InvalidOwner.into())
    );
}

#[test]
fn assert_pda_accepts_derived_pda() {
    let program_id = key(8);
    let mint = key(9);
    let bump = [254_u8];
    let seeds: &[&[u8]; 3] = &[b"soul", mint.as_ref(), bump.as_ref()];
    let pda = Pubkey::derive_address(seeds, None, &program_id);
    let (_raw, pda_account) = account(pda, program_id, false, false, false);

    assert_eq!(assert_pda(&pda_account, seeds, &program_id), Ok(()));
}

#[test]
fn assert_pda_rejects_wrong_address() {
    let program_id = key(10);
    let mint = key(11);
    let seeds: &[&[u8]; 2] = &[b"soul", mint.as_ref()];
    let (_raw, wrong_account) = account(key(12), program_id, false, false, false);

    assert_eq!(
        assert_pda(&wrong_account, seeds, &program_id),
        Err(GeppettoError::InvalidPda.into())
    );
}

#[test]
fn assert_pda_rejects_invalid_seed_length() {
    let program_id = key(13);
    let long_seed = [14_u8; 33];
    let seeds: &[&[u8]; 1] = &[long_seed.as_ref()];
    let (_raw, pda_account) = account(key(15), program_id, false, false, false);

    assert_eq!(
        assert_pda(&pda_account, seeds, &program_id),
        Err(GeppettoError::InvalidSeeds.into())
    );
}

#[test]
fn assert_program_id_accepts_expected_program_account() {
    let program_id = key(16);
    let (_raw, program) = account(program_id, key(17), false, false, true);

    assert_eq!(assert_program_id(&program, &program_id), Ok(()));
}

#[test]
fn assert_program_id_rejects_unexpected_program_account() {
    let (_raw, program) = account(key(18), key(19), false, false, true);

    assert_eq!(
        assert_program_id(&program, &key(20)),
        Err(GeppettoError::IncorrectProgramId.into())
    );
}
