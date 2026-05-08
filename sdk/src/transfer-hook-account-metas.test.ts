import { describe, expect, it, vi } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  ACCOUNT_SIZE,
  AccountLayout,
  AccountState,
  ExtensionType,
  getExtraAccountMetaAddress,
  getMintLen,
  MINT_SIZE,
  MintLayout,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TransferHookLayout,
} from "@solana/spl-token";
import * as sdk from "./index.js";

describe("transfer hook account metas", () => {
  it("documents supported wallet direct-transfer resolution and historical/deferred Raydium swap-path scope", () => {
    expect(sdk.TRANSFER_HOOK_COMPATIBILITY_SCOPE.activeAmm).toBe("none_current_curve_only");
    expect(sdk.TRANSFER_HOOK_COMPATIBILITY_SCOPE.legacyTargetAmm).toBe("raydium");
    expect(sdk.TRANSFER_HOOK_COMPATIBILITY_SCOPE.walletDirectTransfer.status).toBe("supported");
    expect(sdk.TRANSFER_HOOK_COMPATIBILITY_SCOPE.walletDirectTransfer.accountResolution).toEqual(
      expect.arrayContaining([
        "token2022_transfer_checked_base_accounts",
        "extra_account_meta_validation_pda",
        "soul_generator_program",
        "source_owner_receipt_registry_pda",
      ]),
    );
    expect(sdk.TRANSFER_HOOK_COMPATIBILITY_SCOPE.raydiumSwapPath.status).toBe(
      "unsupported_bounded",
    );
    expect(sdk.TRANSFER_HOOK_COMPATIBILITY_SCOPE.raydiumSwapPath.warningCodes).toEqual(
      expect.arrayContaining([
        "post_graduation_raydium_receipt_paths_bounded",
        "raydium_transfer_hook_mints_unsupported",
      ]),
    );
    expect(sdk.TRANSFER_HOOK_COMPATIBILITY_SCOPE.raydiumSwapPath.enforcement).toContain(
      "must not be presented as receipt-protected",
    );
  });

  it("fails boundary-crossing wallet transfers before signing when registry account resolution is unsafe", async () => {
    const hookProgram = testPublicKey();
    const soulGenerator = testPublicKey();
    const mint = testPublicKey();
    const source = testPublicKey();
    const destination = testPublicKey();
    const sourceOwner = testPublicKey();
    const validation = getExtraAccountMetaAddress(mint, hookProgram);
    const receiptRegistry = sdk.deriveReceiptRegistryPda(sourceOwner, mint, soulGenerator);
    const baseAccounts = {
      [mint.toBase58()]: tokenAccountInfo(
        TOKEN_2022_PROGRAM_ID,
        mintAccountData({ hookProgram }),
      ),
      [source.toBase58()]: tokenAccountInfo(
        TOKEN_2022_PROGRAM_ID,
        tokenAccountData({ mint, owner: sourceOwner, amount: sdk.MIN_CLAIM_BALANCE }),
      ),
      [validation.toBase58()]: tokenAccountInfo(
        hookProgram,
        extraAccountMetaData([soulGenerator, receiptRegistry]),
      ),
    };
    const registryData = (owner: PublicKey, registryMint: PublicKey) =>
      receiptRegistryAccountData({
        claimant: owner,
        tokenMint: registryMint,
        activeReceipts: 1n,
      });
    const cases: Array<{
      name: string;
      account?: ReturnType<typeof tokenAccountInfo>;
      expected: RegExp;
    }> = [
      {
        name: "missing registry",
        expected: /receipt registry account is missing/,
      },
      {
        name: "wrong registry program owner",
        account: tokenAccountInfo(hookProgram, registryData(sourceOwner, mint)),
        expected: /receipt registry owner mismatch/,
      },
      {
        name: "wrong registry claimant",
        account: tokenAccountInfo(soulGenerator, registryData(testPublicKey(), mint)),
        expected: /claimant mismatch/,
      },
      {
        name: "wrong registry mint",
        account: tokenAccountInfo(soulGenerator, registryData(sourceOwner, testPublicKey())),
        expected: /mint mismatch/,
      },
      {
        name: "malformed registry",
        account: tokenAccountInfo(soulGenerator, Buffer.alloc(4)),
        expected: /malformed receipt registry/,
      },
    ];

    for (const testCase of cases) {
      const accounts = {
        ...baseAccounts,
        ...(testCase.account ? { [receiptRegistry.toBase58()]: testCase.account } : {}),
      };
      await expect(
        sdk.buildHookAwareTransferCheckedIx({
          connection: mockAccountInfoConnection(accounts) as never,
          source,
          mint,
          destination,
          authority: sourceOwner,
          amount: 1n,
          decimals: 6,
          transferHookProgramId: hookProgram,
          programIds: { soulGenerator },
        }),
      ).rejects.toThrow(testCase.expected);
    }
  });

  it("classifies RPC failures while resolving boundary registry accounts as account-resolution failures", async () => {
    const hookProgram = testPublicKey();
    const soulGenerator = testPublicKey();
    const mint = testPublicKey();
    const source = testPublicKey();
    const destination = testPublicKey();
    const sourceOwner = testPublicKey();
    const validation = getExtraAccountMetaAddress(mint, hookProgram);
    const receiptRegistry = sdk.deriveReceiptRegistryPda(sourceOwner, mint, soulGenerator);
    const accounts = {
      [mint.toBase58()]: tokenAccountInfo(
        TOKEN_2022_PROGRAM_ID,
        mintAccountData({ hookProgram }),
      ),
      [source.toBase58()]: tokenAccountInfo(
        TOKEN_2022_PROGRAM_ID,
        tokenAccountData({ mint, owner: sourceOwner, amount: sdk.MIN_CLAIM_BALANCE }),
      ),
      [validation.toBase58()]: tokenAccountInfo(
        hookProgram,
        extraAccountMetaData([soulGenerator, receiptRegistry]),
      ),
    };
    const connection = mockAccountInfoConnection(accounts);
    connection.getAccountInfo.mockImplementation(async (address: PublicKey) => {
      if (address.equals(receiptRegistry)) {
        throw new Error("RPC 429 while fetching receipt registry");
      }
      return accounts[address.toBase58()] ?? null;
    });

    await expect(
      sdk.buildHookAwareTransferCheckedIx({
        connection: connection as never,
        source,
        mint,
        destination,
        authority: sourceOwner,
        amount: 1n,
        decimals: 6,
        transferHookProgramId: hookProgram,
        programIds: { soulGenerator },
      }),
    ).rejects.toThrow(/failed to resolve receipt registry account[\s\S]*RPC 429/);
  });
});

function tokenAccountInfo(owner: PublicKey, data: Buffer) {
  return {
    data,
    executable: false,
    lamports: 1_000_000,
    owner,
    rentEpoch: 0,
  };
}

function testPublicKey(): PublicKey {
  return Keypair.generate().publicKey;
}

function mockAccountInfoConnection(accounts: Record<string, ReturnType<typeof tokenAccountInfo>>) {
  return {
    getAccountInfo: vi.fn(async (address: PublicKey) => accounts[address.toBase58()] ?? null),
  };
}

function mintAccountData({ hookProgram }: { hookProgram: PublicKey | null }): Buffer {
  const data = Buffer.alloc(hookProgram ? getMintLen([ExtensionType.TransferHook]) : MINT_SIZE);
  MintLayout.encode(
    {
      mintAuthorityOption: 0,
      mintAuthority: PublicKey.default,
      supply: 2_000_000n,
      decimals: 6,
      isInitialized: true,
      freezeAuthorityOption: 0,
      freezeAuthority: PublicKey.default,
    },
    data,
  );

  if (hookProgram) {
    data[ACCOUNT_SIZE] = 1;
    const extensionOffset = ACCOUNT_SIZE + 1;
    data.writeUInt16LE(ExtensionType.TransferHook, extensionOffset);
    data.writeUInt16LE(TransferHookLayout.span, extensionOffset + 2);
    TransferHookLayout.encode(
      {
        authority: testPublicKey(),
        programId: hookProgram,
      },
      data,
      extensionOffset + 4,
    );
  }

  return data;
}

function tokenAccountData({
  mint,
  owner,
  amount,
}: {
  mint: PublicKey;
  owner: PublicKey;
  amount: bigint;
}): Buffer {
  const data = Buffer.alloc(ACCOUNT_SIZE);
  AccountLayout.encode(
    {
      mint,
      owner,
      amount,
      delegateOption: 0,
      delegate: PublicKey.default,
      state: AccountState.Initialized,
      isNativeOption: 0,
      isNative: 0n,
      delegatedAmount: 0n,
      closeAuthorityOption: 0,
      closeAuthority: PublicKey.default,
    },
    data,
  );
  return data;
}

function receiptRegistryAccountData({
  claimant,
  tokenMint,
  activeReceipts,
  burnedReceipts = 0n,
  forfeitedReceipts = 0n,
}: {
  claimant: PublicKey;
  tokenMint: PublicKey;
  activeReceipts: bigint;
  burnedReceipts?: bigint;
  forfeitedReceipts?: bigint;
}): Buffer {
  const data = Buffer.alloc(sdk.RECEIPT_REGISTRY_ACCOUNT_SIZE);
  claimant.toBuffer().copy(data, sdk.RECEIPT_REGISTRY_CLAIMANT_OFFSET);
  tokenMint.toBuffer().copy(data, sdk.RECEIPT_REGISTRY_TOKEN_MINT_OFFSET);
  data.writeBigUInt64LE(activeReceipts, sdk.RECEIPT_REGISTRY_ACTIVE_RECEIPTS_OFFSET);
  data.writeBigUInt64LE(burnedReceipts, sdk.RECEIPT_REGISTRY_BURNED_RECEIPTS_OFFSET);
  data.writeBigUInt64LE(forfeitedReceipts, sdk.RECEIPT_REGISTRY_FORFEITED_RECEIPTS_OFFSET);
  return data;
}

function extraAccountMetaData(pubkeys: PublicKey[]): Buffer {
  const data = Buffer.alloc(16 + pubkeys.length * 35);
  data.writeBigUInt64LE(0n, 0);
  data.writeUInt32LE(4 + pubkeys.length * 35, 8);
  data.writeUInt32LE(pubkeys.length, 12);
  pubkeys.forEach((pubkey, index) => {
    const offset = 16 + index * 35;
    data[offset] = 0;
    pubkey.toBuffer().copy(data, offset + 1);
    data[offset + 33] = 0;
    data[offset + 34] = 0;
  });
  return data;
}
