import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  ACCOUNT_SIZE,
  AccountLayout,
  AccountState,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  ExtensionType,
  getExtraAccountMetaAddress,
  getMintLen,
  MINT_SIZE,
  MintLayout,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TransferHookLayout,
} from "@solana/spl-token";

import * as sdk from "./index.js";

describe("SolSoul SDK exports", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("exposes PDA helpers, instruction builders, high-level helpers, and decoders", () => {
    expect(typeof sdk.deriveSoulPda).toBe("function");
    expect(typeof sdk.deriveClaimPda).toBe("function");
    expect(typeof sdk.deriveNftAuthorityPda).toBe("function");
    expect(typeof sdk.deriveCurvePda).toBe("function");
    expect(typeof sdk.deriveVaultPda).toBe("function");
    expect(typeof sdk.deriveTreasuryPda).toBe("function");
    expect(typeof sdk.deriveLpLockPda).toBe("function");
    expect(typeof sdk.deriveRaydiumCpSwapPdas).toBe("function");
    expect(typeof sdk.raydiumCpSwapRemainingAccounts).toBe("function");
    expect(typeof sdk.createTokenIx).toBe("function");
    expect(typeof sdk.buyIx).toBe("function");
    expect(typeof sdk.sellIx).toBe("function");
    expect(typeof sdk.migrateIx).toBe("function");
    expect(typeof sdk.releaseLpIx).toBe("function");
    expect(typeof sdk.initializeSoulIx).toBe("function");
    expect(typeof sdk.generateSoulIx).toBe("function");
    expect(typeof sdk.uploadTemplateIx).toBe("function");
    expect(typeof sdk.claimSoulIx).toBe("function");
    expect(typeof sdk.createToken).toBe("function");
    expect(typeof sdk.buy).toBe("function");
    expect(typeof sdk.buyAndAutoClaimSoul).toBe("function");
    expect(typeof sdk.sell).toBe("function");
    expect(typeof sdk.migrate).toBe("function");
    expect(typeof sdk.generateSoul).toBe("function");
    expect(typeof sdk.uploadTemplate).toBe("function");
    expect(typeof sdk.fetchSoul).toBe("function");
    expect(typeof sdk.fetchBondingCurve).toBe("function");
    expect(typeof sdk.decodeBondingCurveAccount).toBe("function");
    expect(typeof sdk.claimSoul).toBe("function");
    expect(typeof sdk.buildSoulNftMetadata).toBe("function");
    expect(typeof sdk.getSoulClaimEligibility).toBe("function");
    expect(typeof sdk.decodeClaimAccount).toBe("function");
    expect(typeof sdk.decodeReceiptAccount).toBe("function");
    expect(typeof sdk.decodeReceiptRegistryAccount).toBe("function");
    expect(typeof sdk.deriveReceiptPda).toBe("function");
    expect(typeof sdk.deriveReceiptRegistryPda).toBe("function");
    expect(typeof sdk.detectTransferHookExtension).toBe("function");
    expect(typeof sdk.buildHookAwareTransferCheckedIx).toBe("function");
    expect(typeof sdk.preflightHookAwareTransferChecked).toBe("function");
    expect(typeof sdk.transferCheckedWithHook).toBe("function");
    expect(typeof sdk.receiptLifecycleIx).toBe("function");
    expect(typeof sdk.computeRequiredReceiptSettlement).toBe("function");
    expect(typeof sdk.selectSettlementReceipts).toBe("function");
    expect(typeof sdk.fetchSettlementReceiptCandidates).toBe("function");
    expect(typeof sdk.fetchReceiptRegistryAccount).toBe("function");
    expect(typeof sdk.settleReceiptsIx).toBe("function");
    expect(typeof sdk.buildSettlementSellTransaction).toBe("function");
    expect(typeof sdk.buildSettlementTransferTransaction).toBe("function");
    expect(typeof sdk.listClaimedSoulNfts).toBe("function");
    expect(typeof sdk.listClaimedSoulNftsByMint).toBe("function");
    expect(typeof sdk.listClaimedSoulNftsByClaimer).toBe("function");
    expect(typeof sdk.listClaimedSoulNftsByNftMints).toBe("function");
    expect(typeof sdk.launchTokenWithWallet).toBe("function");
    expect(sdk.CLAIM_SOUL_COMPUTE_UNIT_LIMIT).toBe(700_000);
  });

  it("detects Token-2022 Transfer Hook support before direct transfer construction", async () => {
    const hookProgram = testPublicKey();
    const otherHookProgram = testPublicKey();
    const hookMint = testPublicKey();
    const noHookMint = testPublicKey();
    const legacyMint = testPublicKey();
    const mismatchedMint = testPublicKey();
    const connection = mockAccountInfoConnection({
      [hookMint.toBase58()]: tokenAccountInfo(
        TOKEN_2022_PROGRAM_ID,
        mintAccountData({ hookProgram }),
      ),
      [noHookMint.toBase58()]: tokenAccountInfo(
        TOKEN_2022_PROGRAM_ID,
        mintAccountData({ hookProgram: null }),
      ),
      [legacyMint.toBase58()]: tokenAccountInfo(
        TOKEN_PROGRAM_ID,
        legacyMintAccountData(),
      ),
      [mismatchedMint.toBase58()]: tokenAccountInfo(
        TOKEN_2022_PROGRAM_ID,
        mintAccountData({ hookProgram: otherHookProgram }),
      ),
    });

    await expect(
      sdk.detectTransferHookExtension({
        connection: connection as never,
        mint: hookMint,
        transferHookProgramId: hookProgram,
      }),
    ).resolves.toMatchObject({
      status: "hookEnabled",
      transferHookProgramId: hookProgram,
      validationAccount: getExtraAccountMetaAddress(hookMint, hookProgram),
    });
    await expect(
      sdk.detectTransferHookExtension({
        connection: connection as never,
        mint: noHookMint,
        transferHookProgramId: hookProgram,
      }),
    ).resolves.toMatchObject({ status: "token2022WithoutHook" });
    await expect(
      sdk.detectTransferHookExtension({
        connection: connection as never,
        mint: legacyMint,
        transferHookProgramId: hookProgram,
      }),
    ).resolves.toMatchObject({ status: "legacySplToken" });
    await expect(
      sdk.detectTransferHookExtension({
        connection: connection as never,
        mint: mismatchedMint,
        transferHookProgramId: hookProgram,
      }),
    ).resolves.toMatchObject({
      status: "unsupportedHookProgram",
      configuredProgramId: otherHookProgram,
      expectedProgramId: hookProgram,
    });
  });

  it("builds hook-aware transfer_checked with source-owner registry metas for delegates", async () => {
    const hookProgram = testPublicKey();
    const soulGenerator = testPublicKey();
    const mint = testPublicKey();
    const source = testPublicKey();
    const destination = testPublicKey();
    const sourceOwner = testPublicKey();
    const delegateAuthority = testPublicKey();
    const validation = getExtraAccountMetaAddress(mint, hookProgram);
    const receiptRegistry = sdk.deriveReceiptRegistryPda(sourceOwner, mint, soulGenerator);
    const authorityRegistry = sdk.deriveReceiptRegistryPda(delegateAuthority, mint, soulGenerator);
    const connection = mockAccountInfoConnection({
      [mint.toBase58()]: tokenAccountInfo(
        TOKEN_2022_PROGRAM_ID,
        mintAccountData({ hookProgram }),
      ),
      [source.toBase58()]: tokenAccountInfo(
        TOKEN_2022_PROGRAM_ID,
        tokenAccountData({ mint, owner: sourceOwner, amount: 2_000_001n }),
      ),
      [validation.toBase58()]: tokenAccountInfo(
        hookProgram,
        extraAccountMetaData([soulGenerator, receiptRegistry]),
      ),
      [receiptRegistry.toBase58()]: tokenAccountInfo(
        soulGenerator,
        receiptRegistryAccountData({
          claimant: sourceOwner,
          tokenMint: mint,
          activeReceipts: 1n,
        }),
      ),
    });

    const resolution = await sdk.buildHookAwareTransferCheckedIx({
      connection: connection as never,
      source,
      mint,
      destination,
      authority: delegateAuthority,
      amount: 1n,
      decimals: 6,
      transferHookProgramId: hookProgram,
      programIds: { soulGenerator },
    });

    expect(resolution.sourceOwner.equals(sourceOwner)).toBe(true);
    expect(resolution.receiptRegistry.equals(receiptRegistry)).toBe(true);
    expect(resolution.receiptRegistry.equals(authorityRegistry)).toBe(false);
    expect(resolution.validationAccount.equals(validation)).toBe(true);
    expect(resolution.instruction.programId.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
    expect(resolution.instruction.keys.slice(0, 4).map((meta) => meta.pubkey.toBase58())).toEqual([
      source.toBase58(),
      mint.toBase58(),
      destination.toBase58(),
      delegateAuthority.toBase58(),
    ]);
    expect(readU64LE(resolution.instruction.data, 1)).toBe(1n);
    expect(resolution.instruction.data[9]).toBe(6);

    const orderedKeys = resolution.instruction.keys.map((meta) => meta.pubkey.toBase58());
    expect(orderedKeys).toContain(hookProgram.toBase58());
    expect(orderedKeys).toContain(validation.toBase58());
    expect(orderedKeys).toContain(soulGenerator.toBase58());
    expect(orderedKeys).toContain(receiptRegistry.toBase58());
    expect(orderedKeys.indexOf(receiptRegistry.toBase58())).toBeGreaterThan(3);
  });

  it("surfaces missing validation metas and missing receipt registry without partial transfer fallback", async () => {
    const hookProgram = testPublicKey();
    const soulGenerator = testPublicKey();
    const mint = testPublicKey();
    const source = testPublicKey();
    const destination = testPublicKey();
    const sourceOwner = testPublicKey();
    const validation = getExtraAccountMetaAddress(mint, hookProgram);

    await expect(
      sdk.buildHookAwareTransferCheckedIx({
        connection: mockAccountInfoConnection({
          [mint.toBase58()]: tokenAccountInfo(
            TOKEN_2022_PROGRAM_ID,
            mintAccountData({ hookProgram }),
          ),
          [source.toBase58()]: tokenAccountInfo(
            TOKEN_2022_PROGRAM_ID,
            tokenAccountData({ mint, owner: sourceOwner, amount: 2_000_000n }),
          ),
        }) as never,
        source,
        mint,
        destination,
        authority: sourceOwner,
        amount: 1n,
        decimals: 6,
        transferHookProgramId: hookProgram,
        programIds: { soulGenerator },
      }),
    ).rejects.toThrow("Transfer Hook validation account is missing");

    await expect(
      sdk.buildHookAwareTransferCheckedIx({
        connection: mockAccountInfoConnection({
          [mint.toBase58()]: tokenAccountInfo(
            TOKEN_2022_PROGRAM_ID,
            mintAccountData({ hookProgram }),
          ),
          [source.toBase58()]: tokenAccountInfo(
            TOKEN_2022_PROGRAM_ID,
            tokenAccountData({ mint, owner: sourceOwner, amount: 2_000_000n }),
          ),
          [validation.toBase58()]: tokenAccountInfo(
            hookProgram,
            extraAccountMetaData([soulGenerator]),
          ),
        }) as never,
        source,
        mint,
        destination,
        authority: sourceOwner,
        amount: 1n,
        decimals: 6,
        transferHookProgramId: hookProgram,
        programIds: { soulGenerator },
      }),
    ).rejects.toThrow("receipt registry meta");
  });

  it("preserves simulation logs and custom Transfer Hook codes in preflight errors", async () => {
    const hookProgram = testPublicKey();
    const soulGenerator = testPublicKey();
    const mint = testPublicKey();
    const source = testPublicKey();
    const destination = testPublicKey();
    const sourceOwner = testPublicKey();
    const validation = getExtraAccountMetaAddress(mint, hookProgram);
    const receiptRegistry = sdk.deriveReceiptRegistryPda(sourceOwner, mint, soulGenerator);
    const connection = {
      ...mockAccountInfoConnection({
        [mint.toBase58()]: tokenAccountInfo(
          TOKEN_2022_PROGRAM_ID,
          mintAccountData({ hookProgram }),
        ),
        [source.toBase58()]: tokenAccountInfo(
          TOKEN_2022_PROGRAM_ID,
          tokenAccountData({ mint, owner: sourceOwner, amount: 2_000_000n }),
        ),
        [validation.toBase58()]: tokenAccountInfo(
          hookProgram,
          extraAccountMetaData([soulGenerator, receiptRegistry]),
        ),
        [receiptRegistry.toBase58()]: tokenAccountInfo(
          soulGenerator,
          receiptRegistryAccountData({
            claimant: sourceOwner,
            tokenMint: mint,
            activeReceipts: 1n,
          }),
        ),
      }),
      getLatestBlockhash: vi.fn(async () => ({
        blockhash: "11111111111111111111111111111111",
        lastValidBlockHeight: 123,
      })),
      simulateTransaction: vi.fn(async () => ({
        value: {
          err: { InstructionError: [0, { Custom: 7004 }] },
          logs: [
            "Program log: SolSoul Transfer Hook: rejecting boundary-breaking transfer active_receipts=1 post_whole=0",
            "Program log: custom program error: 0x1b5c",
          ],
        },
      })),
    };

    await expect(
      sdk.preflightHookAwareTransferChecked({
        connection: connection as never,
        source,
        mint,
        destination,
        authority: sourceOwner,
        amount: 1_000_000n,
        decimals: 6,
        transferHookProgramId: hookProgram,
        programIds: { soulGenerator },
      }),
    ).rejects.toThrow(/Custom.*7004[\s\S]*boundary-breaking transfer[\s\S]*0x1b5c/);
  });

  it("launches a token through wallet-adapter sendTransaction with the fixed Raydium target", async () => {
    const payer = Keypair.generate().publicKey;
    const mint = sdk.findFreshLaunchKeypair().mint;
    const connection = {
      getMinimumBalanceForRentExemption: vi.fn(async () => 1_461_600),
      getLatestBlockhash: vi.fn(async () => ({
        blockhash: "11111111111111111111111111111111",
        lastValidBlockHeight: 123,
      })),
      confirmTransaction: vi.fn(async () => ({ value: { err: null } })),
    };
    const sendTransaction = vi.fn(async () => "LaunchSig111111111111111111111111111111111111");

    const result = await sdk.launchTokenWithWallet({
      connection: connection as never,
      payer,
      mint,
      sendTransaction,
      symbol: "WALLET",
      targetAmm: sdk.TARGET_AMM.Raydium,
      now: () => 1_714_200_000_000,
    });

    expect(sendTransaction).toHaveBeenCalledOnce();
    const [transaction, sentConnection, options] = sendTransaction.mock
      .calls[0] as unknown as [
      Transaction,
      typeof connection,
      { signers: [Keypair] },
    ];
    expect(sentConnection).toBe(connection);
    expect(options).toEqual({ signers: [mint] });
    expect(connection.getMinimumBalanceForRentExemption).toHaveBeenCalledWith(
      sdk.LAUNCHED_TOKEN_MINT_ACCOUNT_SIZE,
      undefined,
    );
    expect(transaction.instructions).toHaveLength(4);
    expect(transaction.instructions[0]?.programId.equals(SystemProgram.programId)).toBe(true);
    expect(transaction.instructions[1]?.programId.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
    expect(transaction.instructions[2]?.programId.toBase58()).toBe(
      sdk.PROGRAM_IDS.soulGenerator,
    );
    expect(transaction.instructions[3]?.programId.toBase58()).toBe(
      sdk.PROGRAM_IDS.bondingCurve,
    );
    expect(connection.confirmTransaction).toHaveBeenCalledWith(
      {
        signature: "LaunchSig111111111111111111111111111111111111",
        blockhash: "11111111111111111111111111111111",
        lastValidBlockHeight: 123,
      },
      "finalized",
    );
    expect(result).toMatchObject({
      signature: "LaunchSig111111111111111111111111111111111111",
      mint: mint.publicKey,
      targetAmm: sdk.TARGET_AMM.Raydium,
      symbol: "WALLET",
    });
  });

  it("rejects non-Raydium launch targets before building a wallet transaction", async () => {
    const connection = {
      getMinimumBalanceForRentExemption: vi.fn(async () => 1_461_600),
      getLatestBlockhash: vi.fn(async () => ({
        blockhash: "11111111111111111111111111111111",
        lastValidBlockHeight: 123,
      })),
      confirmTransaction: vi.fn(async () => ({ value: { err: null } })),
    };
    const sendTransaction = vi.fn(async () => "LaunchSig111111111111111111111111111111111111");

    await expect(
      sdk.launchTokenWithWallet({
        connection: connection as never,
        payer: PublicKey.unique(),
        mint: sdk.findFreshLaunchKeypair().mint,
        sendTransaction,
        symbol: "PUMP",
        targetAmm: sdk.TARGET_AMM.Pump,
      }),
    ).rejects.toThrow("Only the fixed legacy Raydium target_amm is accepted");

    expect(sendTransaction).not.toHaveBeenCalled();
    expect(connection.getMinimumBalanceForRentExemption).not.toHaveBeenCalled();
  });

  it("uploads a template through wallet-adapter sendTransaction without server signers", async () => {
    const payer = Keypair.generate().publicKey;
    const { mint, soul } = sdk.findMintWithNoBumpPdas();
    const template = '<svg data-kind="pd9"><rect fill="{{HUE}}" /></svg>';
    const styleParams = "mode=hsl;evolution=3";
    const connection = {
      getLatestBlockhash: vi.fn(async () => ({
        blockhash: "11111111111111111111111111111111",
        lastValidBlockHeight: 321,
      })),
      confirmTransaction: vi.fn(async () => ({ value: { err: null } })),
    };
    const sendTransaction = vi.fn(async () => "TemplateSig1111111111111111111111111111111111");

    const signature = await sdk.uploadTemplate({
      connection: connection as never,
      payer,
      mint,
      template,
      styleParams,
      sendTransaction,
      commitment: "finalized",
    });

    expect(signature).toBe("TemplateSig1111111111111111111111111111111111");
    expect(sendTransaction).toHaveBeenCalledOnce();
    const [transaction, sentConnection, options] = sendTransaction.mock
      .calls[0] as unknown as [Transaction, typeof connection, { signers?: Keypair[] }];
    expect(sentConnection).toBe(connection);
    expect(options).toBeUndefined();
    expect(transaction.instructions).toHaveLength(1);
    expect(transaction.instructions[0]?.programId.toBase58()).toBe(
      sdk.PROGRAM_IDS.soulGenerator,
    );
    expect(transaction.instructions[0]?.keys.map((key) => key.pubkey.toBase58())).toEqual([
      soul.toBase58(),
      payer.toBase58(),
      sdk.deriveSoulConfigPda(sdk.PROGRAM_IDS.soulGenerator).toBase58(),
    ]);
    expect(transaction.instructions[0]?.keys[1]?.isSigner).toBe(true);
    expect(transaction.instructions[0]?.data[0]).toBe(sdk.UPLOAD_TEMPLATE_DISCRIMINATOR);
    expect(connection.confirmTransaction).toHaveBeenCalledWith(
      {
        signature: "TemplateSig1111111111111111111111111111111111",
        blockhash: "11111111111111111111111111111111",
        lastValidBlockHeight: 321,
      },
      "finalized",
    );
  });

  it("rejects invalid, oversize, style-oversize, and external-reference templates before upload", () => {
    expect(() =>
      sdk.uploadTemplateIx({
        mint: sdk.findMintWithNoBumpPdas().mint,
        authority: PublicKey.unique(),
        template: "<html></html>",
      }),
    ).toThrow("Template SVG must start with <svg");

    expect(() =>
      sdk.uploadTemplateIx({
        mint: sdk.findMintWithNoBumpPdas().mint,
        authority: PublicKey.unique(),
        template: `<svg>${"x".repeat(sdk.BASE_SVG_TEMPLATE_CAPACITY)}</svg>`,
      }),
    ).toThrow("Template SVG must fit on-chain capacity");

    expect(() =>
      sdk.uploadTemplateIx({
        mint: sdk.findMintWithNoBumpPdas().mint,
        authority: PublicKey.unique(),
        template: "<svg><image href=\"https://example.invalid/soul.png\" /></svg>",
      }),
    ).toThrow("external references");

    expect(() =>
      sdk.uploadTemplateIx({
        mint: sdk.findMintWithNoBumpPdas().mint,
        authority: PublicKey.unique(),
        template: "<svg></svg>",
        styleParams: "x".repeat(sdk.STYLE_PARAMS_CAPACITY + 1),
      }),
    ).toThrow("Template style params must fit");
  });

  it("rejects normalized external-reference SVG bypass variants before upload", () => {
    const variants = [
      "<svg><ScRiPt>alert(1)</ScRiPt></svg>",
      "<svg><IMAGE\nHREF = 'https://example.invalid/soul.png' /></svg>",
      "<svg><use\nxlink:href = '#local-symbol' /></svg>",
      "<svg><a\tHREF=https://example.invalid>bad</a></svg>",
      "<svg><rect fill=\"url(  ' ipfs://bafybad'  )\" /></svg>",
      "<svg><rect stroke=\"url(\n\tHTTPS://example.invalid/paint )\" /></svg>",
      "<svg><text>https://example.invalid/raw</text></svg>",
      "<svg><text>data:text/plain,remote</text></svg>",
      "<svg><text>ar://remote-id</text></svg>",
    ];

    for (const template of variants) {
      expect(() =>
        sdk.validateTemplateUploadInput({
          template,
        }),
      ).toThrow("external references");
    }
  });

  it("rejects protocol-relative external CSS url(...) references before upload", () => {
    const variants = [
      "<svg><rect fill=\"url( //example.invalid/pattern.svg#p)\" /></svg>",
      "<svg><rect fill=\"URL(//example.invalid/pattern.svg#p)\" /></svg>",
      "<svg><rect fill=\"url(  '//example.invalid/pattern.svg#p'  )\" /></svg>",
      "<svg><rect fill='url(\n\t\"//example.invalid/pattern.svg#p\" )' /></svg>",
    ];

    for (const template of variants) {
      expect(() =>
        sdk.validateTemplateUploadInput({
          template,
        }),
      ).toThrow("external references");
    }
  });

  it("allows local fragment CSS url(...) references before upload", () => {
    for (const template of [
      "<svg><defs><linearGradient id=\"p\" /></defs><rect fill=\"url(#p)\" /></svg>",
      "<svg><defs><linearGradient id=\"p\" /></defs><rect fill=\"url( '#p' )\" /></svg>",
    ]) {
      expect(() =>
        sdk.validateTemplateUploadInput({
          template,
        }),
      ).not.toThrow();
    }
  });

  it("rejects malformed SVG when a DOMParser-compatible parser is available", () => {
    vi.stubGlobal(
      "DOMParser",
      class {
        parseFromString() {
          return {
            getElementsByTagName: (tagName: string) =>
              tagName === "parsererror" ? [{}] : [],
          };
        }
      },
    );

    expect(() =>
      sdk.validateTemplateUploadInput({
        template: "<svg><g></svg>",
      }),
    ).toThrow("Template SVG must parse as XML");

    vi.unstubAllGlobals();
  });

  it("buys through wallet-adapter sendTransaction and finalized confirmation", async () => {
    const payer = Keypair.generate().publicKey;
    const { mint } = sdk.findMintWithNoBumpPdas();
    const connection = {
      getLatestBlockhash: vi.fn(async () => ({
        blockhash: "11111111111111111111111111111111",
        lastValidBlockHeight: 456,
      })),
      confirmTransaction: vi.fn(async () => ({ value: { err: null } })),
    };
    const sendTransaction = vi.fn(async () => "BuySig111111111111111111111111111111111111111");

    const signature = await sdk.buy({
      connection: connection as never,
      payer,
      mint,
      sendTransaction,
      solIn: 100_000_000n,
      minAmountOut: 3_000_000_000_000n,
      commitment: "finalized",
    });

    expect(signature).toBe("BuySig111111111111111111111111111111111111111");
    expect(sendTransaction).toHaveBeenCalledOnce();
    const [transaction, sentConnection, options] = sendTransaction.mock
      .calls[0] as unknown as [Transaction, typeof connection, { signers?: Keypair[] }];
    expect(sentConnection).toBe(connection);
    expect(options).toBeUndefined();
    expect(transaction.feePayer?.equals(payer)).toBe(true);
    expect(transaction.recentBlockhash).toBe("11111111111111111111111111111111");
    expect(transaction.instructions).toHaveLength(2);
    expect(transaction.instructions[0]?.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)).toBe(true);
    expect(transaction.instructions[1]?.programId.toBase58()).toBe(
      sdk.PROGRAM_IDS.bondingCurve,
    );
    expect(transaction.instructions[1]?.keys[4]?.pubkey.equals(payer)).toBe(true);
    expect(transaction.instructions[1]?.keys[4]?.isSigner).toBe(true);
    expect(transaction.instructions[1]?.keys[5]?.pubkey.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
    expect(connection.confirmTransaction).toHaveBeenCalledWith(
      {
        signature: "BuySig111111111111111111111111111111111111111",
        blockhash: "11111111111111111111111111111111",
        lastValidBlockHeight: 456,
      },
      "finalized",
    );
  });

  it("returns buy generation provenance when wallet callers request it", async () => {
    const payer = PublicKey.unique();
    const { mint, soul } = sdk.findMintWithNoBumpPdas();
    const data = soulData({ mint, authority: payer });
    const view = new DataView(data.buffer);
    const buyerTokenAccount = PublicKey.unique();
    view.setBigUint64(sdk.SOUL_PROVENANCE_GENERATION_OFFSET, 5n, true);
    data[sdk.SOUL_PROVENANCE_SIDE_OFFSET] = sdk.SOUL_PROVENANCE_SIDE.Buy;
    view.setBigUint64(sdk.SOUL_PROVENANCE_AMOUNT_OFFSET, 99_000_000n, true);
    data.set(payer.toBytes(), sdk.SOUL_PROVENANCE_TRADER_OFFSET);
    data.set(buyerTokenAccount.toBytes(), sdk.SOUL_PROVENANCE_TOKEN_ACCOUNT_OFFSET);
    data.set(mint.toBytes(), sdk.SOUL_PROVENANCE_MINT_OFFSET);
    data.set(soul.toBytes(), sdk.SOUL_PROVENANCE_SOUL_OFFSET);
    data.set(new Uint8Array([0xca, 0xfe, 0xba, 0xbe, 0, 1, 2, 3]), sdk.SOUL_PROVENANCE_SEED_HASH_OFFSET);
    const connection = {
      getLatestBlockhash: vi.fn(async () => ({
        blockhash: "11111111111111111111111111111111",
        lastValidBlockHeight: 456,
      })),
      confirmTransaction: vi.fn(async () => ({ value: { err: null } })),
      getAccountInfo: vi.fn(async () => ({ data })),
      getTransaction: vi.fn(async () => ({ slot: 1234, blockTime: 1777420000, meta: { err: null } })),
    };
    const sendTransaction = vi.fn(async () => "BuySig111111111111111111111111111111111111111");

    const result = await sdk.buy({
      connection: connection as never,
      payer,
      mint,
      sendTransaction,
      solIn: 100_000_000n,
      minAmountOut: 3_000_000_000_000n,
      buyerTokenAccount,
      commitment: "finalized",
      includeGenerationProvenance: true,
    });

    expect(result.signature).toBe("BuySig111111111111111111111111111111111111111");
    expect(result.generationProvenance).toMatchObject({
      generation: 5n,
      side: "buy",
      amount: 99_000_000n,
      seedHash: "cafebabe00010203",
      signature: "BuySig111111111111111111111111111111111111111",
      slot: 1234,
      blockTime: 1777420000,
    });
    expect(result.generationProvenance?.trader.equals(payer)).toBe(true);
    expect(result.generationProvenance?.tokenMint.equals(mint)).toBe(true);
    expect(result.generationProvenance?.soul.equals(soul)).toBe(true);
    expect(result.generationProvenance?.explorerUrl).toBe(
      "https://explorer.solana.com/tx/BuySig111111111111111111111111111111111111111?cluster=devnet",
    );
  });

  it("builds official buy + automatic Soul NFT issuance as one wallet transaction", async () => {
    const payer = Keypair.generate().publicKey;
    const { mint, soul } = sdk.findMintWithNoBumpPdas();
    const data = soulData({ mint, authority: payer });
    const view = new DataView(data.buffer);
    const buyerTokenAccount = PublicKey.unique();
    view.setBigUint64(72, 1n, true);
    view.setBigUint64(sdk.CLAIM_COUNT_OFFSET, 0n, true);
    view.setBigUint64(sdk.SOUL_PROVENANCE_GENERATION_OFFSET, 1n, true);
    data[sdk.SOUL_PROVENANCE_SIDE_OFFSET] = sdk.SOUL_PROVENANCE_SIDE.Buy;
    view.setBigUint64(sdk.SOUL_PROVENANCE_AMOUNT_OFFSET, 99_000_000n, true);
    data.set(payer.toBytes(), sdk.SOUL_PROVENANCE_TRADER_OFFSET);
    data.set(buyerTokenAccount.toBytes(), sdk.SOUL_PROVENANCE_TOKEN_ACCOUNT_OFFSET);
    data.set(mint.toBytes(), sdk.SOUL_PROVENANCE_MINT_OFFSET);
    data.set(soul.toBytes(), sdk.SOUL_PROVENANCE_SOUL_OFFSET);
    const nftMint = Keypair.generate();
    const connection = {
      getAccountInfo: vi.fn(async () => ({ data })),
      getMinimumBalanceForRentExemption: vi.fn(async () => 123_456),
      getLatestBlockhash: vi.fn(async () => ({
        blockhash: "11111111111111111111111111111111",
        lastValidBlockHeight: 456,
      })),
      confirmTransaction: vi.fn(async () => ({ value: { err: null } })),
      getTransaction: vi.fn(async () => ({ slot: 1234, blockTime: 1777420000, meta: { err: null } })),
    };
    const sendTransaction = vi.fn(async () => "BuyAutoClaimSig1111111111111111111111111111111");

    const result = await sdk.buyAndAutoClaimSoul({
      connection: connection as never,
      payer,
      mint,
      buyerTokenAccount,
      nftMint,
      sendTransaction,
      solIn: 100_000_000n,
      minAmountOut: 3_000_000_000_000n,
      commitment: "finalized",
      generationApiBaseUrl: "/",
    });

    expect(result.signature).toBe("BuyAutoClaimSig1111111111111111111111111111111");
    expect(result.nftMint.equals(nftMint.publicKey)).toBe(true);
    const [transaction, sentConnection, options] = sendTransaction.mock
      .calls[0] as unknown as [Transaction, typeof connection, { signers?: Keypair[] }];
    expect(sentConnection).toBe(connection);
    expect(options.signers).toEqual([nftMint]);
    expect(transaction.instructions).toHaveLength(5);
    expect(transaction.instructions[0]?.programId.equals(ComputeBudgetProgram.programId)).toBe(true);
    expect(transaction.instructions[1]?.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)).toBe(true);
    expect(transaction.instructions[2]?.programId.equals(SystemProgram.programId)).toBe(true);
    expect(transaction.instructions[3]?.programId.toBase58()).toBe(sdk.PROGRAM_IDS.bondingCurve);
    expect(transaction.instructions[4]?.programId.toBase58()).toBe(sdk.PROGRAM_IDS.soulGenerator);
    expect(transaction.instructions[4]?.keys[4]?.pubkey.equals(buyerTokenAccount)).toBe(true);
    expect(connection.getMinimumBalanceForRentExemption).toHaveBeenCalled();
  });

  it("rejects stale wallet buy provenance that does not match the submitted trade amount", async () => {
    const payer = Keypair.generate().publicKey;
    const { mint, soul } = sdk.findMintWithNoBumpPdas();
    const data = soulData({ mint, authority: payer });
    const view = new DataView(data.buffer);
    const buyerTokenAccount = PublicKey.unique();
    view.setBigUint64(sdk.SOUL_PROVENANCE_GENERATION_OFFSET, 5n, true);
    data[sdk.SOUL_PROVENANCE_SIDE_OFFSET] = sdk.SOUL_PROVENANCE_SIDE.Buy;
    view.setBigUint64(sdk.SOUL_PROVENANCE_AMOUNT_OFFSET, 97_000_000n, true);
    data.set(payer.toBytes(), sdk.SOUL_PROVENANCE_TRADER_OFFSET);
    data.set(buyerTokenAccount.toBytes(), sdk.SOUL_PROVENANCE_TOKEN_ACCOUNT_OFFSET);
    data.set(mint.toBytes(), sdk.SOUL_PROVENANCE_MINT_OFFSET);
    data.set(soul.toBytes(), sdk.SOUL_PROVENANCE_SOUL_OFFSET);
    const connection = {
      getLatestBlockhash: vi.fn(async () => ({
        blockhash: "11111111111111111111111111111111",
        lastValidBlockHeight: 456,
      })),
      confirmTransaction: vi.fn(async () => ({ value: { err: null } })),
      getAccountInfo: vi.fn(async () => ({ data })),
      getTransaction: vi.fn(),
    };
    const sendTransaction = vi.fn(async () => "BuySig111111111111111111111111111111111111111");

    const result = await sdk.buy({
      connection: connection as never,
      payer,
      mint,
      sendTransaction,
      solIn: 100_000_000n,
      buyerTokenAccount,
      commitment: "finalized",
      includeGenerationProvenance: true,
    });

    expect(result.generationProvenance).toBeNull();
    expect(connection.getTransaction).not.toHaveBeenCalled();
  });

  it("sells through wallet-adapter sendTransaction and finalized confirmation", async () => {
    const payer = PublicKey.unique();
    const { mint } = sdk.findMintWithNoBumpPdas();
    const sellerTokenAccount = PublicKey.unique();
    const connection = {
      getLatestBlockhash: vi.fn(async () => ({
        blockhash: "11111111111111111111111111111111",
        lastValidBlockHeight: 789,
      })),
      confirmTransaction: vi.fn(async () => ({ value: { err: null } })),
    };
    const sendTransaction = vi.fn(async () => "SellSig11111111111111111111111111111111111111");

    const signature = await sdk.sell({
      connection: connection as never,
      payer,
      mint,
      sellerTokenAccount,
      sendTransaction,
      tokenIn: 1_000_000n,
      minAmountOut: 1_000n,
      commitment: "finalized",
    });

    expect(signature).toBe("SellSig11111111111111111111111111111111111111");
    expect(sendTransaction).toHaveBeenCalledOnce();
    const [transaction, sentConnection, options] = sendTransaction.mock
      .calls[0] as unknown as [Transaction, typeof connection, { signers?: Keypair[] }];
    expect(sentConnection).toBe(connection);
    expect(options).toBeUndefined();
    expect(transaction.feePayer?.equals(payer)).toBe(true);
    expect(transaction.recentBlockhash).toBe("11111111111111111111111111111111");
    expect(transaction.instructions).toHaveLength(1);
    expect(transaction.instructions[0]?.programId.toBase58()).toBe(
      sdk.PROGRAM_IDS.bondingCurve,
    );
    expect(transaction.instructions[0]?.keys[3]?.pubkey.equals(sellerTokenAccount)).toBe(true);
    expect(transaction.instructions[0]?.keys[4]?.pubkey.equals(payer)).toBe(true);
    expect(transaction.instructions[0]?.keys[4]?.isSigner).toBe(true);
    expect(transaction.instructions[0]?.keys[5]?.pubkey.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
    expect(transaction.instructions[0]?.keys[6]?.pubkey.equals(SystemProgram.programId)).toBe(true);
    expect(transaction.instructions[0]?.keys[8]?.pubkey.equals(sdk.deriveSoulPda(mint))).toBe(true);
    expect(transaction.instructions[0]?.keys[9]?.pubkey.toBase58()).toBe(
      sdk.PROGRAM_IDS.soulGenerator,
    );
    expect(connection.confirmTransaction).toHaveBeenCalledWith(
      {
        signature: "SellSig11111111111111111111111111111111111111",
        blockhash: "11111111111111111111111111111111",
        lastValidBlockHeight: 789,
      },
      "finalized",
    );
  });

  it("returns sell generation provenance from the public API when SoulAccount lookup is unavailable", async () => {
    const payer = PublicKey.unique();
    const { mint } = sdk.findMintWithNoBumpPdas();
    const sellerTokenAccount = PublicKey.unique();
    const signature = "SellSig11111111111111111111111111111111111111";
    const fetchImpl = vi.fn(async (_url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({
        generations: [
          {
            id: "generation:token:soul:6",
            tokenMint: mint.toBase58(),
            soul: sdk.deriveSoulPda(mint).toBase58(),
            generation: 6,
            side: "sell",
            amount: "1000000",
            trader: payer.toBase58(),
            tokenAccount: sellerTokenAccount.toBase58(),
            seedHash: "0102030405060708",
            signature,
            slot: 4567,
            blockTime: 1777421111,
            source: "finalized-rpc-logs",
          },
        ],
      }),
    }));
    const connection = {
      getLatestBlockhash: vi.fn(async () => ({
        blockhash: "11111111111111111111111111111111",
        lastValidBlockHeight: 789,
      })),
      confirmTransaction: vi.fn(async () => ({ value: { err: null } })),
      getAccountInfo: vi.fn(async () => null),
      getTransaction: vi.fn(async () => ({ slot: 4567, blockTime: 1777421111, meta: { err: null } })),
    };
    const sendTransaction = vi.fn(async () => signature);

    const result = await sdk.sell({
      connection: connection as never,
      payer,
      mint,
      sellerTokenAccount,
      sendTransaction,
      tokenIn: 1_000_000n,
      minAmountOut: 1_000n,
      commitment: "finalized",
      includeGenerationProvenance: true,
      generationApiBaseUrl: "https://example.test/",
      provenanceFetch: fetchImpl,
    });

    expect(result.generationProvenance).toMatchObject({
      generation: 6n,
      side: "sell",
      amount: 1_000_000n,
      seedHash: "0102030405060708",
      signature,
      slot: 4567,
      blockTime: 1777421111,
      source: "finalized-rpc-logs",
    });
    expect(result.generationProvenance?.trader.equals(payer)).toBe(true);
    expect(result.generationProvenance?.tokenAccount.equals(sellerTokenAccount)).toBe(true);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      `https://example.test/api/token/${mint.toBase58()}/generations?limit=100`,
    );
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      `https://example.test/api/token/${mint.toBase58()}/generations/6`,
    );
  });

  it("fetches historical token and Soul generation provenance from the public API", async () => {
    const mint = sdk.DEVNET_PROGRAM_IDS.bondingCurve;
    const soul = sdk.DEVNET_PROGRAM_IDS.soulGenerator;
    const fetchImpl = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        generations: [
          {
            id: "generation:token:soul:7",
            tokenMint: mint,
            soul,
            generation: 7,
            side: "sell",
            amount: "321000000",
            trader: "8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i",
            tokenAccount: "8uAPC2UxiBjKmUksVVwUA6q4RctiXkgSAsovBR39cd1i",
            seedHash: "abcdef0123456789",
            signature: "5SeededFinalizedSig111111111111111111111111111111",
            slot: 9876,
            blockTime: 1800000987,
            source: "finalized-rpc-logs",
          },
        ],
        source: { heuristicAccountSignatures: false },
      }),
    }));

    const rows = await sdk.fetchTokenGenerationProvenance({
      mint,
      generation: 7,
      apiBaseUrl: "https://example.test/",
      fetch: fetchImpl,
    });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://example.test/api/token/CoL4Sti1wZbv8tJSYXC6pLSzhwj9eeArw9mdAbsS69un/generations/7",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      generation: 7n,
      side: "sell",
      amount: 321000000n,
      seedHash: "abcdef0123456789",
      signature: "5SeededFinalizedSig111111111111111111111111111111",
      slot: 9876,
      blockTime: 1800000987,
      source: "finalized-rpc-logs",
    });

    await sdk.fetchSoulGenerationProvenance({
      soul,
      apiBaseUrl: "https://example.test",
      fetch: fetchImpl,
    });
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      "https://example.test/api/soul/34erFyVvAiLsTwDivcauQCJnVX16ZjEwgJ6tEs5NeaMZ/generations?limit=100",
    );

    const accountData = soulData({
      mint: new PublicKey(mint),
      authority: PublicKey.unique(),
    });
    const fetchedSoul = await sdk.fetchSoul(
      { getAccountInfo: vi.fn(async () => ({ data: accountData })) } as never,
      mint,
      {
        soul,
        includeGenerationHistory: true,
        generationApiBaseUrl: "https://example.test",
        provenanceFetch: fetchImpl,
      },
    );
    expect(fetchedSoul.historicalGenerationProvenance).toHaveLength(1);
    expect(fetchedSoul.historicalGenerationProvenance?.[0]?.generation).toBe(7n);
    expect(fetchImpl.mock.calls[2]?.[0]).toBe(
      "https://example.test/api/soul/34erFyVvAiLsTwDivcauQCJnVX16ZjEwgJ6tEs5NeaMZ/generations?limit=100",
    );
  });

  it("rejects legacy LP release instruction builders as unsupported", () => {
    const { curve } = sdk.findMintWithNoBumpPdas();
    const lbPair = PublicKey.unique();
    const admin = PublicKey.unique();
    const lpLockTokenAccount = PublicKey.unique();
    const adminLpTokenAccount = PublicKey.unique();

    expect(() =>
      sdk.releaseLpIx({
        curve,
        lbPair,
        admin,
        lpLockTokenAccount,
        adminLpTokenAccount,
      }),
    ).toThrow(sdk.UNSUPPORTED_MIGRATION_ERROR);
  });

  it("defaults public program IDs to the current devnet deployments outside production", () => {
    expect(sdk.PROGRAM_IDS.bondingCurve).toBe(sdk.DEVNET_PROGRAM_IDS.bondingCurve);
    expect(sdk.PROGRAM_IDS.soulGenerator).toBe(sdk.DEVNET_PROGRAM_IDS.soulGenerator);
  });

  it("defaults public program IDs to devnet deployments during production builds", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_BONDING_CURVE_PROGRAM_ID", "");
    vi.stubEnv("NEXT_PUBLIC_SOUL_GENERATOR_PROGRAM_ID", "");
    vi.resetModules();

    const freshSdk: typeof sdk = await import("./index.js");

    expect(freshSdk.PROGRAM_IDS.bondingCurve).toBe(
      freshSdk.DEVNET_PROGRAM_IDS.bondingCurve,
    );
    expect(freshSdk.PROGRAM_IDS.soulGenerator).toBe(
      freshSdk.DEVNET_PROGRAM_IDS.soulGenerator,
    );
  });

  it("prefers explicit public program ID env overrides", async () => {
    const bondingCurve = PublicKey.unique().toBase58();
    const soulGenerator = PublicKey.unique().toBase58();

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_BONDING_CURVE_PROGRAM_ID", bondingCurve);
    vi.stubEnv("NEXT_PUBLIC_SOUL_GENERATOR_PROGRAM_ID", soulGenerator);
    vi.resetModules();

    const freshSdk: typeof sdk = await import("./index.js");

    expect(freshSdk.PROGRAM_IDS.bondingCurve).toBe(bondingCurve);
    expect(freshSdk.PROGRAM_IDS.soulGenerator).toBe(soulGenerator);
  });

  it("builds createToken accounts and rejects removed migration instructions", async () => {
    const { mint, curve, vault } = sdk.findMintWithNoBumpPdas();
    const payer = PublicKey.unique();
    const migrationTarget = PublicKey.unique();
    const migrationTokenAccount = PublicKey.unique();
    const treasury = sdk.deriveTreasuryPda();

    const createIx = sdk.createTokenIx({
      mint,
      payer,
    });
    expect(sdk.LAUNCH_FEE_LAMPORTS).toBe(30_000_000n);
    expect(createIx.keys.map((key) => key.pubkey.toBase58())).toEqual([
      curve.toBase58(),
      vault.toBase58(),
      treasury.toBase58(),
      sdk.deriveGlobalConfigPda().toBase58(),
      mint.toBase58(),
      payer.toBase58(),
      TOKEN_2022_PROGRAM_ID.toBase58(),
      SystemProgram.programId.toBase58(),
    ]);

    expect(() =>
      sdk.migrateIx({
        mint,
        migrationTarget,
        migrationTokenAccount,
      }),
    ).toThrow(sdk.UNSUPPORTED_MIGRATION_ERROR);
    await expect(
      sdk.migrate({
        connection: {} as never,
        payer: Keypair.generate(),
        mint,
        migrationTarget,
        migrationTokenAccount,
      }),
    ).rejects.toThrow(sdk.UNSUPPORTED_MIGRATION_ERROR);
  });

  it("builds Raydium CP-Swap remaining accounts for migrate in program order", () => {
    const { mint } = sdk.findMintWithNoBumpPdas();
    const creator = Keypair.generate().publicKey;
    const pdas = sdk.deriveRaydiumCpSwapPdas(mint);
    const remaining = sdk.raydiumCpSwapRemainingAccounts({ creator, memeMint: mint });

    expect(remaining).toHaveLength(21);
    expect(remaining.map((key) => key.pubkey.toBase58())).toEqual([
      creator.toBase58(),
      pdas.ammConfig.toBase58(),
      pdas.authority.toBase58(),
      pdas.poolState.toBase58(),
      pdas.token0Mint.toBase58(),
      pdas.token1Mint.toBase58(),
      pdas.lpMint.toBase58(),
      sdk
        .raydiumCpSwapRemainingAccounts({ creator, memeMint: mint })[7]!
        .pubkey.toBase58(),
      sdk
        .raydiumCpSwapRemainingAccounts({ creator, memeMint: mint })[8]!
        .pubkey.toBase58(),
      sdk
        .raydiumCpSwapRemainingAccounts({ creator, memeMint: mint })[9]!
        .pubkey.toBase58(),
      pdas.token0Vault.toBase58(),
      pdas.token1Vault.toBase58(),
      sdk.RAYDIUM_CREATE_POOL_FEE_RECEIVER_DEVNET,
      pdas.observationState.toBase58(),
      TOKEN_PROGRAM_ID.toBase58(),
      pdas.nativeIsToken0 ? TOKEN_PROGRAM_ID.toBase58() : TOKEN_2022_PROGRAM_ID.toBase58(),
      pdas.nativeIsToken0 ? TOKEN_2022_PROGRAM_ID.toBase58() : TOKEN_PROGRAM_ID.toBase58(),
      ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
      SystemProgram.programId.toBase58(),
      SYSVAR_RENT_PUBKEY.toBase58(),
      sdk.RAYDIUM_CP_SWAP_DEVNET_PROGRAM_ID,
    ]);
    expect(pdas.token0Mint.equals(NATIVE_MINT) || pdas.token1Mint.equals(NATIVE_MINT)).toBe(true);
    expect(remaining[0]).toMatchObject({ isSigner: true, isWritable: true });
    expect(remaining[3]?.isWritable).toBe(true);
    expect(remaining[14]?.pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true);

    expect(() =>
      sdk.migrateIx({
        mint,
        migrationTarget: creator,
        migrationTokenAccount: PublicKey.unique(),
        raydiumAccounts: { creator },
      }),
    ).toThrow(sdk.UNSUPPORTED_MIGRATION_ERROR);

  });

  it("resolves Raydium CP-Swap launched-token vault balances with deterministic mint checks", () => {
    const { mint } = sdk.findMintWithNoBumpPdas();
    const pdas = sdk.deriveRaydiumCpSwapPdas(mint);
    const memeIsToken0 = pdas.token0Mint.equals(mint);
    const token0Amount = memeIsToken0 ? 45_678_901n : 9_000_000_000n;
    const token1Amount = memeIsToken0 ? 9_000_000_000n : 45_678_901n;

    const resolved = sdk.resolveRaydiumCpSwapVaultBalance({
      memeMint: mint,
      poolStateAccount: tokenAccountInfo(new PublicKey(sdk.RAYDIUM_CP_SWAP_DEVNET_PROGRAM_ID), Buffer.alloc(8)),
      token0VaultAccount: tokenAccountInfo(
        pdas.token0Mint.equals(mint) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
        tokenAccountData({ mint: pdas.token0Mint, owner: pdas.authority, amount: token0Amount }),
      ),
      token1VaultAccount: tokenAccountInfo(
        pdas.token1Mint.equals(mint) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
        tokenAccountData({ mint: pdas.token1Mint, owner: pdas.authority, amount: token1Amount }),
      ),
      slot: 459_177_356,
      commitment: "confirmed",
    });

    expect(resolved).toMatchObject({
      verified: true,
      warnings: [],
      activeLiquidityBaseUnits: 45_678_901n,
      slot: 459_177_356,
      commitment: "confirmed",
    });
    expect(resolved.poolState.equals(pdas.poolState)).toBe(true);
    expect(resolved.selectedVault?.equals(memeIsToken0 ? pdas.token0Vault : pdas.token1Vault)).toBe(true);
    expect(resolved.nonSelectedVault?.equals(memeIsToken0 ? pdas.token1Vault : pdas.token0Vault)).toBe(true);

    const mismatched = sdk.resolveRaydiumCpSwapVaultBalance({
      memeMint: mint,
      poolStateAccount: null,
      token0VaultAccount: tokenAccountInfo(
        TOKEN_PROGRAM_ID,
        tokenAccountData({ mint: PublicKey.unique(), owner: pdas.authority, amount: 1n }),
      ),
      token1VaultAccount: null,
    });

    expect(mismatched.verified).toBe(false);
    expect(mismatched.activeLiquidityBaseUnits).toBeNull();
    expect(mismatched.warnings).toEqual(
      expect.arrayContaining([
        "raydium_pool_missing",
        "raydium_vault_missing",
        "raydium_vault_mint_mismatch",
        "raydium_vault_unverified",
      ]),
    );
  });

  it("derives claim PDAs and builds claim instruction accounts", () => {
    const sequence = 0n;
    let mint: PublicKey | undefined;
    let soul: PublicKey | undefined;
    let claim: PublicKey | undefined;
    let nftAuthority: PublicKey | undefined;
    for (let byte = 1; byte <= 255; byte += 1) {
      const candidateMint = new PublicKey(new Uint8Array(32).fill(byte));
      try {
        const candidateSoul = sdk.deriveSoulPda(candidateMint);
        mint = candidateMint;
        soul = candidateSoul;
        claim = sdk.deriveClaimPda(candidateSoul, sequence);
        nftAuthority = sdk.deriveNftAuthorityPda(candidateSoul, sequence);
        break;
      } catch {
        // Keep scanning until the no-bump soul, claim, and NFT authority PDAs are off-curve.
      }
    }
    expect(mint).toBeDefined();
    expect(soul).toBeDefined();
    expect(claim).toBeDefined();
    expect(nftAuthority).toBeDefined();
    const claimer = PublicKey.unique();
    const nftMint = PublicKey.unique();
    const claimerMemeAta = PublicKey.unique();
    const nftTokenAccount = PublicKey.unique();
    const receipt = sdk.deriveReceiptPda(soul!, sequence);
    const receiptRegistry = sdk.deriveReceiptRegistryPda(claimer, mint!);

    const ix = sdk.claimSoulIx({
      mint: mint!,
      claimer,
      claimerMemeAta,
      nftMint,
      nftTokenAccount,
      sequence,
      soul: soul!,
      claim: claim!,
      receipt,
      receiptRegistry,
      nftAuthority: nftAuthority!,
    });

    expect(Array.from(ix.data)).toEqual([sdk.CLAIM_SOUL_DISCRIMINATOR]);
    expect(ix.keys.map((key) => key.pubkey.toBase58())).toEqual([
      soul!.toBase58(),
      claim!.toBase58(),
      claimer.toBase58(),
      mint!.toBase58(),
      claimerMemeAta.toBase58(),
      nftMint.toBase58(),
      nftTokenAccount.toBase58(),
      nftAuthority!.toBase58(),
      TOKEN_2022_PROGRAM_ID.toBase58(),
      SystemProgram.programId.toBase58(),
      ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
      receipt.toBase58(),
      receiptRegistry.toBase58(),
      sdk.deriveSoulConfigPda(sdk.PROGRAM_IDS.soulGenerator).toBase58(),
    ]);
  });

  it("decodes active, burned, and forfeited receipt binding accounts", () => {
    const soul = PublicKey.unique();
    const claimant = PublicKey.unique();
    const tokenMint = PublicKey.unique();
    const nftMint = PublicKey.unique();

    for (const [rawState, lifecycleState] of [
      [sdk.RECEIPT_LIFECYCLE_STATE.Active, "active"],
      [sdk.RECEIPT_LIFECYCLE_STATE.Burned, "burned"],
      [sdk.RECEIPT_LIFECYCLE_STATE.Forfeited, "forfeited"],
    ] as const) {
      const data = new Uint8Array(sdk.RECEIPT_ACCOUNT_SIZE);
      data.set(soul.toBytes(), sdk.RECEIPT_SOUL_OFFSET);
      data.set(claimant.toBytes(), sdk.RECEIPT_CLAIMANT_OFFSET);
      data.set(tokenMint.toBytes(), sdk.RECEIPT_TOKEN_MINT_OFFSET);
      data.set(nftMint.toBytes(), sdk.RECEIPT_NFT_MINT_OFFSET);
      const view = new DataView(data.buffer);
      view.setBigUint64(sdk.RECEIPT_SEQUENCE_OFFSET, 7n, true);
      view.setBigUint64(sdk.RECEIPT_GENERATION_COUNT_OFFSET, 8n, true);
      view.setBigUint64(sdk.RECEIPT_BOUND_QUANTITY_OFFSET, sdk.MIN_CLAIM_BALANCE, true);
      view.setBigUint64(sdk.RECEIPT_BOUND_BOUNDARY_OFFSET, 2_000_000n, true);
      data[sdk.RECEIPT_LIFECYCLE_STATE_OFFSET] = rawState;

      expect(sdk.decodeReceiptAccount(data)).toMatchObject({
        soul,
        claimant,
        tokenMint,
        nftMint,
        sequence: 7n,
        generationCount: 8n,
        boundQuantity: sdk.MIN_CLAIM_BALANCE,
        boundBoundary: 2_000_000n,
        lifecycleState,
      });
    }
  });

  it("rejects unknown receipt lifecycle bytes instead of treating them as active protection", () => {
    const data = new Uint8Array(sdk.RECEIPT_ACCOUNT_SIZE);
    data.set(PublicKey.unique().toBytes(), sdk.RECEIPT_SOUL_OFFSET);
    data.set(PublicKey.unique().toBytes(), sdk.RECEIPT_CLAIMANT_OFFSET);
    data.set(PublicKey.unique().toBytes(), sdk.RECEIPT_TOKEN_MINT_OFFSET);
    data.set(PublicKey.unique().toBytes(), sdk.RECEIPT_NFT_MINT_OFFSET);
    data[sdk.RECEIPT_LIFECYCLE_STATE_OFFSET] = 9;

    expect(() => sdk.decodeReceiptAccount(data)).toThrow(
      "Unknown receipt lifecycle state",
    );
  });

  it("decodes receipt registry counters and builds lifecycle instruction data", () => {
    const claimant = PublicKey.unique();
    const tokenMint = PublicKey.unique();
    const receipt = PublicKey.unique();
    const receiptRegistry = sdk.deriveReceiptRegistryPda(claimant, tokenMint);
    const data = new Uint8Array(sdk.RECEIPT_REGISTRY_ACCOUNT_SIZE);
    data.set(claimant.toBytes(), sdk.RECEIPT_REGISTRY_CLAIMANT_OFFSET);
    data.set(tokenMint.toBytes(), sdk.RECEIPT_REGISTRY_TOKEN_MINT_OFFSET);
    const view = new DataView(data.buffer);
    view.setBigUint64(sdk.RECEIPT_REGISTRY_ACTIVE_RECEIPTS_OFFSET, 3n, true);
    view.setBigUint64(sdk.RECEIPT_REGISTRY_BURNED_RECEIPTS_OFFSET, 2n, true);
    view.setBigUint64(sdk.RECEIPT_REGISTRY_FORFEITED_RECEIPTS_OFFSET, 1n, true);

    expect(sdk.decodeReceiptRegistryAccount(data)).toMatchObject({
      claimant,
      tokenMint,
      activeReceipts: 3n,
      burnedReceipts: 2n,
      forfeitedReceipts: 1n,
    });

    const ix = sdk.receiptLifecycleIx({
      receipt,
      receiptRegistry,
      authority: claimant,
      state: "forfeited",
    });
    expect(Array.from(ix.data)).toEqual([
      sdk.RECEIPT_LIFECYCLE_DISCRIMINATOR,
      sdk.RECEIPT_LIFECYCLE_STATE.Forfeited,
    ]);
    expect(ix.keys.map((key) => key.pubkey.toBase58())).toEqual([
      receipt.toBase58(),
      receiptRegistry.toBase58(),
      claimant.toBase58(),
    ]);
    expect(ix.keys[0]).toMatchObject({ isWritable: true, isSigner: false });
    expect(ix.keys[2]).toMatchObject({ isWritable: false, isSigner: true });
  });

  it("computes required boundary settlement and selects receipts deterministically", () => {
    const owner = PublicKey.unique();
    const mint = PublicKey.unique();
    const soul = PublicKey.unique();
    const receiptFor = (sequence: bigint, boundary: bigint): sdk.SettlementReceiptCandidate => {
      const receiptAccount = sdk.deriveReceiptPda(soul, sequence);
      const data = receiptData({ soul, claimant: owner, tokenMint: mint, nftMint: PublicKey.unique(), sequence });
      const view = new DataView(data.buffer);
      view.setBigUint64(sdk.RECEIPT_BOUND_BOUNDARY_OFFSET, boundary, true);
      return {
        receiptAccount,
        receipt: sdk.decodeReceiptAccount(data),
      };
    };
    const candidates = [
      receiptFor(1n, sdk.MIN_CLAIM_BALANCE),
      receiptFor(3n, 3n * sdk.MIN_CLAIM_BALANCE),
      receiptFor(2n, 2n * sdk.MIN_CLAIM_BALANCE),
    ];

    expect(
      sdk.computeRequiredReceiptSettlement({
        currentBalance: 35_000_000_000n,
        movementAmount: 21_000_000_000n,
        activeReceiptCount: 3n,
      }),
    ).toMatchObject({
      preWholeUnits: 3n,
      postWholeUnits: 1n,
      crossedDown: 2n,
      requiredCount: 2n,
      preBoundCapacity: 3n * sdk.MIN_CLAIM_BALANCE,
      postBoundCapacity: sdk.MIN_CLAIM_BALANCE,
    });

    const selected = sdk.selectSettlementReceipts({
      owner,
      mint,
      currentBalance: 35_000_000_000n,
      movementAmount: 21_000_000_000n,
      activeReceiptCount: 3n,
      candidates: [...candidates].reverse(),
    });

    expect(selected.selectedReceipts.map((receipt) => receipt.receipt.boundBoundary)).toEqual([
      3n * sdk.MIN_CLAIM_BALANCE,
      2n * sdk.MIN_CLAIM_BALANCE,
    ]);
    expect(() =>
      sdk.selectSettlementReceipts({
        owner,
        mint,
        currentBalance: 35_000_000_000n,
        movementAmount: 21_000_000_000n,
        activeReceiptCount: 3n,
        candidates: [candidates[0]!],
      }),
    ).toThrow("Under-settled boundary movement");
  });

  it("excludes inactive and mismatched receipt candidates from deterministic settlement selection", () => {
    const owner = PublicKey.unique();
    const mint = PublicKey.unique();
    const soul = PublicKey.unique();
    const receiptFor = ({
      sequence,
      boundary,
      claimant = owner,
      tokenMint = mint,
      lifecycleState = "active",
    }: {
      sequence: bigint;
      boundary: bigint;
      claimant?: PublicKey;
      tokenMint?: PublicKey;
      lifecycleState?: sdk.ReceiptLifecycleState;
    }): sdk.SettlementReceiptCandidate => {
      const receiptAccount = sdk.deriveReceiptPda(soul, sequence);
      const data = receiptData({
        soul,
        claimant,
        tokenMint,
        nftMint: PublicKey.unique(),
        sequence,
        lifecycleState,
      });
      const view = new DataView(data.buffer);
      view.setBigUint64(sdk.RECEIPT_BOUND_BOUNDARY_OFFSET, boundary, true);
      return {
        receiptAccount,
        receipt: sdk.decodeReceiptAccount(data),
      };
    };
    const selected = receiptFor({ sequence: 2n, boundary: 2n * sdk.MIN_CLAIM_BALANCE });

    const result = sdk.selectSettlementReceipts({
      owner,
      mint,
      currentBalance: 2n * sdk.MIN_CLAIM_BALANCE,
      movementAmount: 1n,
      activeReceiptCount: 2n,
      candidates: [
        receiptFor({
          sequence: 5n,
          boundary: 2n * sdk.MIN_CLAIM_BALANCE,
          lifecycleState: "burned",
        }),
        receiptFor({
          sequence: 6n,
          boundary: 2n * sdk.MIN_CLAIM_BALANCE,
          claimant: PublicKey.unique(),
        }),
        receiptFor({
          sequence: 7n,
          boundary: 2n * sdk.MIN_CLAIM_BALANCE,
          tokenMint: PublicKey.unique(),
        }),
        selected,
      ],
    });

    expect(result.selectedReceipts.map((receipt) => receipt.receiptAccount.toBase58())).toEqual([
      selected.receiptAccount.toBase58(),
    ]);
  });

  it("builds settlement and atomic settlement-plus-sell instruction order", () => {
    const owner = PublicKey.unique();
    const mint = PublicKey.unique();
    const tokenAccount = PublicKey.unique();
    const receiptRegistry = sdk.deriveReceiptRegistryPda(owner, mint);
    const receipt = PublicKey.unique();

    const settle = sdk.settleReceiptsIx({
      authority: owner,
      tokenAccount,
      tokenMint: mint,
      receipts: [receipt],
      state: "forfeited",
      movementAmount: 1_000_000n,
    });
    expect(Array.from(settle.data)).toEqual([
      sdk.SETTLE_RECEIPTS_DISCRIMINATOR,
      sdk.RECEIPT_LIFECYCLE_STATE.Forfeited,
      0x40,
      0x42,
      0x0f,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
    ]);
    expect(settle.keys.map((key) => key.pubkey.toBase58())).toEqual([
      receiptRegistry.toBase58(),
      owner.toBase58(),
      tokenAccount.toBase58(),
      SYSVAR_INSTRUCTIONS_PUBKEY.toBase58(),
      receipt.toBase58(),
    ]);
    expect(settle.keys[0]).toMatchObject({ isWritable: true, isSigner: false });
    expect(settle.keys[1]).toMatchObject({ isWritable: false, isSigner: true });
    expect(settle.keys[3]).toMatchObject({ isWritable: false, isSigner: false });
    expect(settle.keys[4]).toMatchObject({ isWritable: true, isSigner: false });

    const tx = sdk.buildSettlementSellTransaction({
      settlement: {
        authority: owner,
        tokenAccount,
        tokenMint: mint,
        receipts: [receipt],
        state: "burned",
        movementAmount: 1_000_000n,
      },
      sell: {
        mint,
        seller: owner,
        sellerTokenAccount: tokenAccount,
        curve: PublicKey.unique(),
        vault: PublicKey.unique(),
        soul: PublicKey.unique(),
        tokenIn: 1_000_000n,
        minAmountOut: 1n,
      },
    });
    expect(tx.instructions).toHaveLength(2);
    expect(tx.instructions[0]?.programId.toBase58()).toBe(sdk.PROGRAM_IDS.soulGenerator);
    expect(tx.instructions[1]?.programId.toBase58()).toBe(sdk.PROGRAM_IDS.bondingCurve);
    expect(tx.instructions[1]?.keys.map((key) => key.pubkey.toBase58())).toContain(
      receiptRegistry.toBase58(),
    );
  });

  it("derives bumped claim PDAs for the reported public token regression", () => {
    const legacyProgramIds = {
      soulGenerator: "5wGUMWySAafwgTpGNgSaTMh1kiejnEGVTZj9x7wWJftk",
    };
    const mint = new PublicKey("FeAjpw28hwpfjrVbHFWUWyb7UDsEgcaxJyphUFezUPpZ");
    const soul = new PublicKey("B6sZafXSmD6eisWtUkAeejZEc9kbbk9EMW8KYKtK9upc");
    const expectedClaim = new PublicKey("Q14ZZxVpo7e4irQdq1LBmGhw7kFsWUJfRMVGEjs7DBD");
    const expectedNftAuthority = new PublicKey(
      "4GsCLNeF5cXPWJR9TENkEnQT5bNFj84ggNdAbBCff1U5",
    );
    const claimer = PublicKey.unique();
    const nftMint = PublicKey.unique();
    const claimerMemeAta = PublicKey.unique();
    const nftTokenAccount = PublicKey.unique();

    expect(
      sdk.deriveSoulPda(mint, legacyProgramIds.soulGenerator).equals(soul),
    ).toBe(true);
    expect(
      sdk
        .deriveClaimPda(soul, 0n, legacyProgramIds.soulGenerator)
        .equals(expectedClaim),
    ).toBe(true);
    expect(
      sdk
        .deriveNftAuthorityPda(soul, 0n, legacyProgramIds.soulGenerator)
        .equals(expectedNftAuthority),
    ).toBe(true);
    expect(() =>
      sdk.claimSoulIx({
        mint,
        soul,
        claimer,
        claimerMemeAta,
        nftMint,
        nftTokenAccount,
        sequence: 0n,
        programIds: legacyProgramIds,
      }),
    ).not.toThrow("Invalid seeds, address must fall off the curve");

    const ix = sdk.claimSoulIx({
      mint,
      soul,
      claimer,
      claimerMemeAta,
      nftMint,
      nftTokenAccount,
      sequence: 0n,
      programIds: legacyProgramIds,
    });
    expect(ix.keys[1]?.pubkey.equals(expectedClaim)).toBe(true);
    expect(ix.keys[7]?.pubkey.equals(expectedNftAuthority)).toBe(true);
  });

  it("derives no-bump PDAs and builds buy instruction data/accounts", () => {
    const { mint, curve, vault, soul } = sdk.findMintWithNoBumpPdas();
    expect(sdk.deriveCurvePda(mint).equals(curve)).toBe(true);
    expect(sdk.deriveVaultPda(mint).equals(vault)).toBe(true);
    expect(sdk.deriveSoulPda(mint).equals(soul)).toBe(true);

    const buyer = PublicKey.unique();
    const buyerTokenAccount = PublicKey.unique();
    const ix = sdk.buyIx({
      mint,
      buyer,
      buyerTokenAccount,
      solIn: 100_000_000n,
      minAmountOut: 1n,
    });

    expect(ix.programId.toBase58()).toBe(sdk.PROGRAM_IDS.bondingCurve);
    expect(Array.from(ix.data)).toEqual([
      1, 0, 225, 245, 5, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(ix.keys.map((key) => key.pubkey.toBase58())).toEqual([
      curve.toBase58(),
      vault.toBase58(),
      mint.toBase58(),
      buyerTokenAccount.toBase58(),
      buyer.toBase58(),
      TOKEN_2022_PROGRAM_ID.toBase58(),
      SystemProgram.programId.toBase58(),
      soul.toBase58(),
      sdk.PROGRAM_IDS.soulGenerator,
      sdk.RECENT_BLOCKHASHES_SYSVAR_ID.toBase58(),
      sdk.deriveSoulConfigPda(sdk.PROGRAM_IDS.soulGenerator).toBase58(),
      sdk.deriveGlobalConfigPda().toBase58(),
    ]);
  });

  it("rejects unsafe numeric amount inputs before instruction construction", () => {
    const { mint } = sdk.findMintWithNoBumpPdas();

    expect(() =>
      sdk.buyIx({
        mint,
        buyer: PublicKey.unique(),
        buyerTokenAccount: PublicKey.unique(),
        solIn: Number.MAX_SAFE_INTEGER + 1,
        minAmountOut: 1n,
      }),
    ).toThrow("safe integer");
  });

  it("derives no-bump PDAs and builds sell instruction data/accounts with Soul generation CPI accounts", () => {
    const { mint, curve, vault, soul } = sdk.findMintWithNoBumpPdas();
    const seller = PublicKey.unique();
    const sellerTokenAccount = PublicKey.unique();
    const ix = sdk.sellIx({
      mint,
      seller,
      sellerTokenAccount,
      tokenIn: 1_000_000n,
      minAmountOut: 1n,
      soul,
    });

    expect(ix.programId.toBase58()).toBe(sdk.PROGRAM_IDS.bondingCurve);
    expect(Array.from(ix.data)).toEqual([
      2, 64, 66, 15, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(ix.keys.map((key) => key.pubkey.toBase58())).toEqual([
      curve.toBase58(),
      vault.toBase58(),
      mint.toBase58(),
      sellerTokenAccount.toBase58(),
      seller.toBase58(),
      TOKEN_2022_PROGRAM_ID.toBase58(),
      SystemProgram.programId.toBase58(),
      sdk.deriveGlobalConfigPda().toBase58(),
      soul.toBase58(),
      sdk.PROGRAM_IDS.soulGenerator,
      sdk.RECENT_BLOCKHASHES_SYSVAR_ID.toBase58(),
      sdk.deriveSoulConfigPda(sdk.PROGRAM_IDS.soulGenerator).toBase58(),
      sdk.deriveReceiptRegistryPda(seller, mint).toBase58(),
    ]);
  });

  it("builds initializeSoul with optional ASCII meme symbol", () => {
    const { mint, soul } = sdk.findMintWithNoBumpPdas();
    const authority = PublicKey.unique();
    const ix = sdk.initializeSoulIx({
      mint,
      authority,
      createdAt: 1_714_200_000n,
      symbol: "DOGE",
    });

    expect(Array.from(ix.data.slice(0, 10))).toEqual([
      sdk.INITIALIZE_SOUL_DISCRIMINATOR,
      192,
      157,
      44,
      102,
      0,
      0,
      0,
      0,
      4,
    ]);
    expect(Buffer.from(ix.data.slice(10)).toString("ascii")).toBe("DOGE");
    expect(ix.keys.map((key) => key.pubkey.toBase58())).toEqual([
      soul.toBase58(),
      mint.toBase58(),
      authority.toBase58(),
      SystemProgram.programId.toBase58(),
    ]);
  });

  it("builds initializeSoul with optional fixed Raydium target AMM", () => {
    const { mint } = sdk.findMintWithNoBumpPdas();
    const authority = PublicKey.unique();

    const withTarget = sdk.initializeSoulIx({
      mint,
      authority,
      createdAt: 1_714_200_000n,
      symbol: "DOGE",
      targetAmm: sdk.TARGET_AMM.Raydium,
    });
    expect(Buffer.from(withTarget.data.slice(10, 14)).toString("ascii")).toBe("DOGE");
    expect(withTarget.data[14]).toBe(sdk.TARGET_AMM.Raydium);

    const withoutSymbol = sdk.initializeSoulIx({
      mint,
      authority,
      createdAt: 1_714_200_000n,
      targetAmm: sdk.TARGET_AMM.Raydium,
    });
    expect(Array.from(withoutSymbol.data.slice(9))).toEqual([
      0,
      sdk.TARGET_AMM.Raydium,
    ]);

    expect(() =>
      sdk.initializeSoulIx({
        mint,
        authority,
        createdAt: 1_714_200_000n,
        targetAmm: 3 as sdk.TargetAmm,
      }),
    ).toThrow("Invalid initializeSoul target_amm: 3");
    expect(() =>
      sdk.initializeSoulIx({
        mint,
        authority,
        createdAt: 1_714_200_000n,
        targetAmm: sdk.TARGET_AMM.Meteora,
      }),
    ).toThrow("Only the fixed legacy Raydium target_amm is accepted");
  });

  it("decodes SoulAccount bytes into a trimmed SVG string", () => {
    const { mint, soul } = sdk.findMintWithNoBumpPdas();
    const authority = PublicKey.unique();
    const svg = "<svg><circle /></svg>";
    const template = '<svg fill="{{HUE}}"></svg>';
    const styleParams = "mode=hsl;evolution=2";
    const data = new Uint8Array(sdk.SOUL_ACCOUNT_SIZE);
    const view = new DataView(data.buffer);
    data.set(mint.toBytes(), 0);
    data.set(authority.toBytes(), 32);
    new DataView(data.buffer).setBigInt64(64, 1_714_200_000n, true);
    new DataView(data.buffer).setBigUint64(72, 2n, true);
    new DataView(data.buffer).setUint16(80, svg.length, true);
    new DataView(data.buffer).setUint16(
      sdk.TEMPLATE_LEN_OFFSET,
      template.length,
      true,
    );
    new DataView(data.buffer).setUint16(
      sdk.STYLE_PARAMS_LEN_OFFSET,
      styleParams.length,
      true,
    );
    new DataView(data.buffer).setBigUint64(sdk.MIN_CLAIM_BALANCE_OFFSET, 7n, true);
    new DataView(data.buffer).setBigUint64(sdk.CLAIM_COUNT_OFFSET, 1n, true);
    data.set(new TextEncoder().encode("DOGE"), sdk.MEME_SYMBOL_OFFSET);
    data[sdk.MEME_SYMBOL_LEN_OFFSET] = 4;
    data.set(new TextEncoder().encode(svg), sdk.LAST_SVG_OFFSET);
    data.set(new TextEncoder().encode(template), sdk.BASE_SVG_TEMPLATE_OFFSET);
    data.set(new TextEncoder().encode(styleParams), sdk.STYLE_PARAMS_OFFSET);
    data[sdk.SOUL_TARGET_AMM_OFFSET] = sdk.TARGET_AMM.Meteora;
    view.setBigUint64(sdk.SOUL_PROVENANCE_GENERATION_OFFSET, 2n, true);
    data[sdk.SOUL_PROVENANCE_SIDE_OFFSET] = sdk.SOUL_PROVENANCE_SIDE.Buy;
    view.setBigUint64(sdk.SOUL_PROVENANCE_AMOUNT_OFFSET, 99_000_000n, true);
    view.setBigUint64(sdk.SOUL_PROVENANCE_TOKEN_AMOUNT_OFFSET, 1_234_567n, true);
    const trader = PublicKey.unique();
    const tokenAccount = PublicKey.unique();
    data.set(trader.toBytes(), sdk.SOUL_PROVENANCE_TRADER_OFFSET);
    data.set(tokenAccount.toBytes(), sdk.SOUL_PROVENANCE_TOKEN_ACCOUNT_OFFSET);
    data.set(mint.toBytes(), sdk.SOUL_PROVENANCE_MINT_OFFSET);
    data.set(soul.toBytes(), sdk.SOUL_PROVENANCE_SOUL_OFFSET);
    data.set([1, 2, 3, 4, 5, 6, 7, 8], sdk.SOUL_PROVENANCE_SEED_HASH_OFFSET);

    expect(sdk.decodeSoulAccount(data)).toMatchObject({
      mint,
      authority,
      createdAt: 1_714_200_000n,
      generationCount: 2n,
      lastSvg: svg,
      baseSvgTemplate: template,
      styleParams,
      minClaimBalance: 7n,
      claimCount: 1n,
      memeSymbol: "DOGE",
      memeSymbolLen: 4,
      targetAmm: sdk.TARGET_AMM.Meteora,
      provenanceGeneration: 2n,
      provenanceSide: sdk.SOUL_PROVENANCE_SIDE.Buy,
      provenanceAmount: 99_000_000n,
      provenanceTokenAmount: 1_234_567n,
      provenanceTrader: trader,
      provenanceTokenAccount: tokenAccount,
      provenanceMint: mint,
      provenanceSoul: soul,
      provenanceSeedHashHex: "0102030405060708",
    });
  });

  it("exports MT scarcity constants without conflating fungible supply and claim cap", () => {
    expect(sdk.FUNGIBLE_TOKEN_DECIMALS).toBe(6);
    expect(sdk.FUNGIBLE_TOKEN_BASE_UNITS).toBe(1_000_000n);
    expect(sdk.FUNGIBLE_CURVE_CAP_TOKENS).toBe(21_000_000n);
    expect(sdk.FUNGIBLE_TOKEN_SUPPLY_BASE_UNITS).toBe(21_000_000_000_000n);
    expect(sdk.MT_CLAIM_QUANTUM_TOKENS).toBe(10_000n);
    expect(sdk.MT_CLAIM_QUANTUM_BASE_UNITS).toBe(10_000_000_000n);
    expect(sdk.MAX_MT_SOUL_NFT_CLAIMS).toBe(2_100n);
    expect(sdk.MIN_CLAIM_BALANCE).toBe(sdk.MT_CLAIM_QUANTUM_BASE_UNITS);
  });

  it("classifies claim eligibility from single-buy token-output provenance", () => {
    const mint = PublicKey.unique();
    const trader = PublicKey.unique();
    const baseSoul = {
      mint,
      authority: PublicKey.unique(),
      createdAt: 1n,
      generationCount: 3n,
      lastSvgLen: 11,
      lastSvg: "<svg></svg>",
      lastSvgBytes: new TextEncoder().encode("<svg></svg>"),
      templateLen: 0,
      baseSvgTemplate: "",
      baseSvgTemplateBytes: new Uint8Array(),
      styleParamsLen: 0,
      styleParams: "",
      styleParamsBytes: new Uint8Array(),
      minClaimBalance: 0n,
      claimCount: 2n,
      memeSymbol: "BONK",
      memeSymbolBytes: new TextEncoder().encode("BONK"),
      memeSymbolLen: 4,
      targetAmm: sdk.TARGET_AMM.Raydium,
      provenanceGeneration: 3n,
      provenanceSide: sdk.SOUL_PROVENANCE_SIDE.Buy,
      provenanceAmount: 5_000_000_000n,
      provenanceTokenAmount: sdk.MIN_CLAIM_BALANCE,
      provenanceTrader: trader,
      provenanceTokenAccount: PublicKey.unique(),
      provenanceMint: mint,
      provenanceSoul: PublicKey.unique(),
      provenanceSeedHash: new Uint8Array(sdk.SOUL_PROVENANCE_SEED_HASH_LEN),
      provenanceSeedHashHex: "0000000000000000",
    } satisfies sdk.SoulAccount;

    expect(
      sdk.getSoulClaimEligibility({
        soul: baseSoul,
        wallet: trader,
        walletTokenBalanceBaseUnits: sdk.MIN_CLAIM_BALANCE,
      }),
    ).toMatchObject({
      claimable: true,
      reason: null,
      hasQualifyingProvenance: true,
      provenanceTokenAmount: sdk.MIN_CLAIM_BALANCE,
      requiredBalance: sdk.MIN_CLAIM_BALANCE,
    });

    expect(
      sdk.getSoulClaimEligibility({
        soul: { ...baseSoul, provenanceTokenAmount: sdk.MIN_CLAIM_BALANCE - 1n },
        wallet: trader,
        walletTokenBalanceBaseUnits: sdk.MIN_CLAIM_BALANCE,
      }),
    ).toMatchObject({
      claimable: false,
      reason: "subWholeProvenance",
      hasQualifyingProvenance: false,
      provenanceTokenAmount: sdk.MIN_CLAIM_BALANCE - 1n,
    });

    expect(
      sdk.getSoulClaimEligibility({
        soul: {
          ...baseSoul,
          minClaimBalance: 1_000_000n,
          provenanceTokenAmount: 1_000_000n,
        },
        wallet: trader,
        walletTokenBalanceBaseUnits: sdk.MIN_CLAIM_BALANCE,
      }),
    ).toMatchObject({
      claimable: false,
      reason: "subWholeProvenance",
      requiredBalance: sdk.MIN_CLAIM_BALANCE,
    });

    expect(
      sdk.getSoulClaimEligibility({
        soul: {
          ...baseSoul,
          provenanceAmount: 5_000_000_000n,
          provenanceTokenAmount: sdk.MIN_CLAIM_BALANCE - 1n,
        },
        wallet: trader,
        walletTokenBalanceBaseUnits: 10_000_000n,
      }),
    ).toMatchObject({
      claimable: false,
      reason: "subWholeProvenance",
      hasQualifyingProvenance: false,
      provenanceTokenAmount: sdk.MIN_CLAIM_BALANCE - 1n,
    });

    expect(
      sdk.getSoulClaimEligibility({
        soul: { ...baseSoul, provenanceSide: sdk.SOUL_PROVENANCE_SIDE.Sell },
        wallet: trader,
        walletTokenBalanceBaseUnits: sdk.MIN_CLAIM_BALANCE,
      }),
    ).toMatchObject({
      claimable: false,
      reason: "sellGenerated",
      hasQualifyingProvenance: false,
    });
  });

  it("keeps legacy Souls readable but claim-ineligible without provenance", () => {
    const data = new Uint8Array(sdk.SOUL_ACCOUNT_PRE_PD7_LEGACY_SIZE);
    const view = new DataView(data.buffer);
    view.setBigUint64(72, 1n, true);
    view.setUint16(80, 11, true);
    data.set(new TextEncoder().encode("<svg></svg>"), sdk.LAST_SVG_OFFSET);
    const decodedLegacy = sdk.decodeSoulAccount(data);

    expect(decodedLegacy.provenanceAmount).toBe(0n);
    expect(decodedLegacy.provenanceTokenAmount).toBe(0n);
    expect(sdk.getSoulClaimEligibility({ soul: decodedLegacy })).toMatchObject({
      claimable: false,
      reason: "missingProvenance",
      hasQualifyingProvenance: false,
      provenanceTokenAmount: 0n,
    });
  });

  it("decodes appended-token-amount legacy provenance as readable but claim-ineligible", () => {
    const { mint, soul } = sdk.findMintWithNoBumpPdas();
    const trader = PublicKey.unique();
    const data = new Uint8Array(sdk.SOUL_ACCOUNT_PRE_PROVENANCE_TOKEN_AMOUNT_SIZE);
    const view = new DataView(data.buffer);
    data.set(mint.toBytes(), 0);
    view.setBigUint64(72, 1n, true);
    view.setUint16(80, 11, true);
    data.set(new TextEncoder().encode("<svg></svg>"), sdk.LAST_SVG_OFFSET);
    data[sdk.SOUL_TARGET_AMM_OFFSET] = sdk.TARGET_AMM.Raydium;
    view.setBigUint64(sdk.SOUL_PROVENANCE_GENERATION_OFFSET, 1n, true);
    data[sdk.SOUL_PROVENANCE_SIDE_OFFSET] = sdk.SOUL_PROVENANCE_SIDE.Buy;
    view.setBigUint64(sdk.SOUL_PROVENANCE_AMOUNT_OFFSET, 5_000_000_000n, true);
    data.set(trader.toBytes(), sdk.SOUL_PROVENANCE_TRADER_OFFSET);
    data.set(mint.toBytes(), sdk.SOUL_PROVENANCE_MINT_OFFSET);
    data.set(soul.toBytes(), sdk.SOUL_PROVENANCE_SOUL_OFFSET);

    const decodedLegacy = sdk.decodeSoulAccount(data);

    expect(decodedLegacy.provenanceAmount).toBe(5_000_000_000n);
    expect(decodedLegacy.provenanceTokenAmount).toBe(0n);
    expect(sdk.getSoulClaimEligibility({ soul: decodedLegacy, wallet: trader })).toMatchObject({
      claimable: false,
      reason: "subWholeProvenance",
      hasQualifyingProvenance: false,
      provenanceTokenAmount: 0n,
    });
  });

  it("decodes legacy SoulAccount bytes with Raydium target AMM fallback", () => {
    const data = new Uint8Array(sdk.SOUL_ACCOUNT_LEGACY_SIZE);

    expect(sdk.decodeSoulAccount(data)).toMatchObject({
      targetAmm: sdk.TARGET_AMM.Raydium,
      provenanceSide: sdk.SOUL_PROVENANCE_SIDE.None,
      provenanceGeneration: 0n,
      artTheme: {
        id: "fractal",
        label: "Fractal Structure",
        renderer: "built-in",
      },
    });
  });

  it("theme resolver maps empty, Rust-supported, legacy-labeled, and custom Soul styles", () => {
    expect(sdk.resolveSoulTheme({ templateLen: 0, styleParams: "" })).toEqual({
      id: "fractal",
      label: "Fractal Structure",
      renderer: "built-in",
    });
    for (const styleParams of [
      "theme=neonpuff",
      "mode=hexagram",
      "theme=hexagram",
      "theme=signal",
      "theme=unipeg",
      "theme=pixel_fractal",
      "theme=pixel_art",
    ]) {
      expect(sdk.resolveSoulTheme({ templateLen: 0, styleParams })).toEqual({
        id: "legacy",
        label: "Legacy / unknown art theme",
        renderer: "built-in",
      });
    }
    expect(sdk.resolveSoulTheme({ templateLen: 0, styleParams: "theme=pixelfractal" })).toEqual({
      id: "pixel_fractal",
      label: "Pixel Fractal",
      renderer: "built-in",
    });
    expect(sdk.resolveSoulTheme({ templateLen: 0, styleParams: "theme=pixelart" })).toEqual({
      id: "pixel_art",
      label: "Pixel Art",
      renderer: "built-in",
    });
    expect(sdk.resolveSoulTheme({ templateLen: 0, styleParams: "theme=symphony" })).toEqual({
      id: "symphony",
      label: "Symphony",
      renderer: "built-in",
    });
    expect(sdk.resolveSoulTheme({ templateLen: 0, styleParams: "theme=unknown" })).toEqual({
      id: "legacy",
      label: "Legacy / unknown art theme",
      renderer: "built-in",
    });
    expect(sdk.resolveSoulTheme({ templateLen: 12, styleParams: "theme=hexagram" })).toEqual({
      id: "custom",
      label: "Custom Template",
      renderer: "custom-template",
    });
    expect(sdk.resolveSoulTheme({ templateLen: 0, styleParams: "theme=custom" })).toEqual({
      id: "custom",
      label: "Custom Template",
      renderer: "custom-template",
    });
  });

  it("decodes pre-PD7 SoulAccount bytes without corrupting latest SVG or claim fields", () => {
    const data = new Uint8Array(sdk.SOUL_ACCOUNT_PRE_PD7_LEGACY_SIZE);
    const view = new DataView(data.buffer);
    view.setBigUint64(72, 7n, true);
    view.setUint16(80, 4, true);
    data.set(new TextEncoder().encode("<svg"), sdk.LAST_SVG_OFFSET);
    view.setBigUint64(sdk.CLAIM_COUNT_OFFSET, 2n, true);
    data[sdk.SOUL_TARGET_AMM_OFFSET] = sdk.TARGET_AMM.Pump;

    expect(sdk.decodeSoulAccount(data)).toMatchObject({
      generationCount: 7n,
      lastSvg: "<svg",
      claimCount: 2n,
      targetAmm: sdk.TARGET_AMM.Pump,
      provenanceSide: sdk.SOUL_PROVENANCE_SIDE.None,
      provenanceGeneration: 0n,
      provenanceAmount: 0n,
      provenanceTokenAmount: 0n,
    });
  });

  it("rejects invalid SoulAccount target AMM values", () => {
    const data = new Uint8Array(sdk.SOUL_ACCOUNT_SIZE);
    data[sdk.SOUL_TARGET_AMM_OFFSET] = 3;

    expect(() => sdk.decodeSoulAccount(data)).toThrow(
      "Invalid SoulAccount target_amm: 3",
    );
  });

  it("rejects invalid SoulAccount provenance side values", () => {
    const data = new Uint8Array(sdk.SOUL_ACCOUNT_SIZE);
    data[sdk.SOUL_TARGET_AMM_OFFSET] = sdk.TARGET_AMM.Raydium;
    data[sdk.SOUL_PROVENANCE_SIDE_OFFSET] = 3;

    expect(() => sdk.decodeSoulAccount(data)).toThrow(
      "Invalid SoulAccount provenance side: 3",
    );
  });

  it("decodes BondingCurveAccount bytes with new exponential-curve layout", () => {
    const mint = PublicKey.unique();
    const data = new Uint8Array(sdk.BONDING_CURVE_ACCOUNT_SIZE);
    const view = new DataView(data.buffer);
    data.set(mint.toBytes(), 0);
    view.setBigUint64(sdk.CURVE_CUMULATIVE_SOL_OFFSET, 85_000_000_000n, true);
    view.setBigUint64(sdk.CURVE_TOTAL_MINTED_OFFSET, 1_073_000_000_000_000n, true);
    data[sdk.CURVE_SELF_DEPRECATED_OFFSET] = 1;
    view.setBigUint64(sdk.CURVE_LAST_INTERACTION_SLOT_OFFSET, 1_800_000_000n, true);

    expect(sdk.decodeBondingCurveAccount(data)).toMatchObject({
      mint,
      cumulativeSol: 85_000_000_000n,
      totalMinted: 1_073_000_000_000_000n,
      selfDeprecated: true,
      lastInteractionSlot: 1_800_000_000n,
    });
  });

  it("rejects invalid BondingCurveAccount selfDeprecated flag values", () => {
    const data = new Uint8Array(sdk.BONDING_CURVE_ACCOUNT_SIZE);
    data[sdk.CURVE_SELF_DEPRECATED_OFFSET] = 2;

    expect(() => sdk.decodeBondingCurveAccount(data)).toThrow(
      "Invalid BondingCurveAccount selfDeprecated flag: 2",
    );
  });

  it("builds self-contained Token-2022 NFT metadata and mint sizing", () => {
    const svg = "<svg><path /></svg>";
    const soul = {
      mint: PublicKey.unique(),
      authority: PublicKey.unique(),
      createdAt: 1n,
      generationCount: 1n,
      lastSvgLen: svg.length,
      lastSvg: svg,
      lastSvgBytes: new TextEncoder().encode(svg),
      templateLen: 0,
      baseSvgTemplate: "",
      baseSvgTemplateBytes: new Uint8Array(),
      styleParamsLen: 0,
      styleParams: "",
      styleParamsBytes: new Uint8Array(),
      minClaimBalance: 0n,
      claimCount: 3n,
      memeSymbol: "BONK",
      memeSymbolBytes: new TextEncoder().encode("BONK"),
      memeSymbolLen: 4,
      targetAmm: sdk.TARGET_AMM.Raydium,
      provenanceGeneration: 0n,
      provenanceSide: sdk.SOUL_PROVENANCE_SIDE.None,
      provenanceAmount: 0n,
      provenanceTokenAmount: 0n,
      provenanceTrader: PublicKey.default,
      provenanceTokenAccount: PublicKey.default,
      provenanceMint: PublicKey.default,
      provenanceSoul: PublicKey.default,
      provenanceSeedHash: new Uint8Array(sdk.SOUL_PROVENANCE_SEED_HASH_LEN),
      provenanceSeedHashHex: "0000000000000000",
    } satisfies sdk.SoulAccount;

    const metadata = sdk.buildSoulNftMetadata(soul);
    expect(metadata.name).toBe("BONK Soul #4");
    expect(metadata.symbol).toBe("BONK");
    expect(metadata.mintAccountSize).toBe(sdk.NFT_MINT_ACCOUNT_SIZE);
    expect(metadata.mintRentExemptionSize).toBeGreaterThan(metadata.mintAccountSize);

    const json = JSON.parse(
      Buffer.from(
        metadata.uri.replace("data:application/json;base64,", ""),
        "base64",
      ).toString("utf8"),
    ) as {
      name: string;
      symbol: string;
      image: string;
      platform: string;
      creator: string;
      launcher: string;
      associatedTokenMint?: string;
      associatedTokenSymbol?: string;
      artEngine?: string;
      artTheme?: string;
      generation?: string;
      attributes?: Array<{ trait_type: string; value: string }>;
    };
    expect(json.name).toBe(metadata.name);
    expect(json.symbol).toBe(metadata.symbol);
    expect(json.platform).toBe("SolSoul");
    expect(json.creator).toBe(soul.authority.toBase58());
    expect(json.launcher).toBe(soul.authority.toBase58());
    expect(json.associatedTokenMint).toBe(soul.mint.toBase58());
    expect(json.associatedTokenSymbol).toBe("BONK");
    expect(json.artEngine).toBe("SolSoul On-Chain Art Engine");
    expect(json.artTheme).toBe("Fractal Structure");
    expect(json.generation).toBe("1");
    expect(json.attributes).toEqual([
      { trait_type: "Platform", value: "SolSoul" },
      { trait_type: "Creator", value: soul.authority.toBase58() },
      { trait_type: "Launcher", value: soul.authority.toBase58() },
      { trait_type: "Associated token mint", value: soul.mint.toBase58() },
      { trait_type: "Associated token symbol", value: "BONK" },
      { trait_type: "Art engine", value: "SolSoul On-Chain Art Engine" },
      { trait_type: "Art theme", value: "Fractal Structure" },
      { trait_type: "Generation", value: "1" },
    ]);
    expect(json.name).not.toContain("SolSoul");
    expect(json.symbol).not.toContain("SolSoul");
    expect(Buffer.from(json.image.replace("data:image/svg+xml;base64,", ""), "base64").toString("utf8")).toBe(svg);
  });

  it("embeds exact PD9 SVG bytes as the claimed NFT image data URI", () => {
    const pd9Svg =
      '<svg viewBox="0 0 256 256" data-soul="pd9-monochrome" data-bg="2"><rect width="256" height="256" fill="#f7f7f2"/><path d="M64 200 C86 142 108 90 128 72 C148 90 170 142 192 200 Z" fill="#050505"/><circle cx="128" cy="110" r="32" stroke="#050505" stroke-width="6" fill="#f7f7f2"/></svg>';
    const soul = {
      mint: PublicKey.unique(),
      authority: PublicKey.unique(),
      createdAt: 1n,
      generationCount: 1n,
      lastSvgLen: pd9Svg.length,
      lastSvg: pd9Svg,
      lastSvgBytes: new TextEncoder().encode(pd9Svg),
      templateLen: 0,
      baseSvgTemplate: "",
      baseSvgTemplateBytes: new Uint8Array(),
      styleParamsLen: 0,
      styleParams: "",
      styleParamsBytes: new Uint8Array(),
      minClaimBalance: 0n,
      claimCount: 0n,
      memeSymbol: "PD9",
      memeSymbolBytes: new TextEncoder().encode("PD9"),
      memeSymbolLen: 3,
      targetAmm: sdk.TARGET_AMM.Raydium,
      provenanceGeneration: 1n,
      provenanceSide: sdk.SOUL_PROVENANCE_SIDE.Buy,
      provenanceAmount: 100_000_000n,
      provenanceTokenAmount: 1_000_000n,
      provenanceTrader: PublicKey.unique(),
      provenanceTokenAccount: PublicKey.default,
      provenanceMint: PublicKey.unique(),
      provenanceSoul: PublicKey.unique(),
      provenanceSeedHash: Uint8Array.from([0xde, 0xad, 0xbe, 0xef, 0xca, 0xfe, 0xba, 0xbe]),
      provenanceSeedHashHex: "deadbeefcafebabe",
    } satisfies sdk.SoulAccount;

    const metadata = sdk.buildSoulNftMetadata(soul);
    const json = JSON.parse(
      Buffer.from(
        metadata.uri.replace("data:application/json;base64,", ""),
        "base64",
      ).toString("utf8"),
    ) as { image: string; name: string; symbol: string };
    const decodedSvg = Buffer.from(
      json.image.replace("data:image/svg+xml;base64,", ""),
      "base64",
    ).toString("utf8");

    expect(json.name).toBe("PD9 Soul #1");
    expect(json.symbol).toBe("PD9");
    expect(json.image).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(decodedSvg).toBe(pd9Svg);
    expect(decodedSvg).toContain('data-soul="pd9-monochrome"');
    expect(decodedSvg).not.toContain("http://");
    expect(decodedSvg).not.toContain("https://");
    expect(decodedSvg).not.toContain("<script");
  });

  it("keeps marketplace metadata static without animated media or remote asset fields", () => {
    const staticSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><rect width="256" height="256" fill="#050505"/><circle cx="128" cy="128" r="44" fill="#14f195"/></svg>';
    const soul = {
      mint: PublicKey.unique(),
      authority: PublicKey.unique(),
      createdAt: 1n,
      generationCount: 9n,
      lastSvgLen: staticSvg.length,
      lastSvg: staticSvg,
      lastSvgBytes: new TextEncoder().encode(staticSvg),
      templateLen: 0,
      baseSvgTemplate: "",
      baseSvgTemplateBytes: new Uint8Array(),
      styleParamsLen: 0,
      styleParams: "",
      styleParamsBytes: new Uint8Array(),
      minClaimBalance: 0n,
      claimCount: 0n,
      memeSymbol: "ANIM",
      memeSymbolBytes: new TextEncoder().encode("ANIM"),
      memeSymbolLen: 4,
      targetAmm: sdk.TARGET_AMM.Raydium,
      provenanceGeneration: 9n,
      provenanceSide: sdk.SOUL_PROVENANCE_SIDE.Buy,
      provenanceAmount: 1_000_000n,
      provenanceTokenAmount: sdk.MIN_CLAIM_BALANCE,
      provenanceTrader: PublicKey.unique(),
      provenanceTokenAccount: PublicKey.default,
      provenanceMint: PublicKey.unique(),
      provenanceSoul: PublicKey.unique(),
      provenanceSeedHash: Uint8Array.from([0x99, 0x99, 0x99, 0x99, 0x99, 0x99, 0x99, 0x99]),
      provenanceSeedHashHex: "9999999999999999",
    } satisfies sdk.SoulAccount;

    const metadata = sdk.buildSoulNftMetadata(soul);
    const jsonText = Buffer.from(
      metadata.uri.replace("data:application/json;base64,", ""),
      "base64",
    ).toString("utf8");
    const json = JSON.parse(jsonText) as Record<string, unknown>;

    for (const forbiddenKey of [
      "animation_url",
      "external_url",
      "animation",
      "canvas",
      "executable",
      "formula",
      "media",
      "processing",
      "properties",
      "files",
      "scene",
      "shader",
      "three",
      "three_scene",
      "video",
      "webgl",
    ]) {
      expect(Object.prototype.hasOwnProperty.call(json, forbiddenKey)).toBe(false);
    }
    expect(jsonText.toLowerCase()).not.toContain('"animation_url"');
    expect(jsonText.toLowerCase()).not.toContain('"external_url"');
    expect(jsonText.toLowerCase()).not.toContain('"properties"');
    expect(jsonText.toLowerCase()).not.toContain('"files"');
    expect(jsonText.toLowerCase()).not.toContain('"canvas"');
    expect(jsonText.toLowerCase()).not.toContain('"formula"');
    expect(jsonText.toLowerCase()).not.toContain('"processing"');
    expect(jsonText.toLowerCase()).not.toContain('"scene"');
    expect(jsonText.toLowerCase()).not.toContain('"shader"');
    expect(jsonText.toLowerCase()).not.toContain('"three"');
    expect(jsonText.toLowerCase()).not.toContain('"webgl"');
    expect(jsonText.toLowerCase()).not.toContain('"video"');
    expect(jsonText.toLowerCase()).not.toContain("flowprofile");
    expect(jsonText.toLowerCase()).not.toContain("flow_profile");
    expect(jsonText.toLowerCase()).not.toContain("p5");
    expect(jsonText.toLowerCase()).not.toContain("http://");
    expect(jsonText.toLowerCase()).not.toContain("https://");

    expect(json.image).toEqual(expect.stringMatching(/^data:image\/svg\+xml;base64,/));
    const decodedSvg = Buffer.from(
      String(json.image).replace("data:image/svg+xml;base64,", ""),
      "base64",
    ).toString("utf8");
    expect(decodedSvg).toBe(staticSvg);

    const decodedWithoutNamespace = decodedSvg
      .toLowerCase()
      .replace('xmlns="http://www.w3.org/2000/svg"', "");
    for (const forbiddenSvgToken of [
      "<animate",
      "<set",
      "<style",
      "<script",
      "<image",
      "href=",
      "xlink:",
      "http://",
      "https://",
      "ipfs:",
      "ar:",
      "url(",
      "canvas",
      "processing",
      "p5",
      "scene",
      "shader",
      "three",
      "webgl",
    ]) {
      expect(decodedWithoutNamespace).not.toContain(forbiddenSvgToken);
    }
  });

  it("builds claim NFT metadata provenance attributes without fabricated tx context", () => {
    const svg = "<svg><path /></svg>";
    const mint = PublicKey.unique();
    const soulPda = PublicKey.unique();
    const trader = PublicKey.unique();
    const tokenAccount = PublicKey.unique();
    const soul = {
      mint,
      authority: PublicKey.unique(),
      createdAt: 1n,
      generationCount: 2n,
      lastSvgLen: svg.length,
      lastSvg: svg,
      lastSvgBytes: new TextEncoder().encode(svg),
      templateLen: 0,
      baseSvgTemplate: "",
      baseSvgTemplateBytes: new Uint8Array(),
      styleParamsLen: 0,
      styleParams: "",
      styleParamsBytes: new Uint8Array(),
      minClaimBalance: 0n,
      claimCount: 0n,
      memeSymbol: "BONK",
      memeSymbolBytes: new TextEncoder().encode("BONK"),
      memeSymbolLen: 4,
      targetAmm: sdk.TARGET_AMM.Raydium,
      provenanceGeneration: 2n,
      provenanceSide: sdk.SOUL_PROVENANCE_SIDE.Buy,
      provenanceAmount: 990000n,
      provenanceTokenAmount: 1_000_000n,
      provenanceTrader: trader,
      provenanceTokenAccount: tokenAccount,
      provenanceMint: mint,
      provenanceSoul: soulPda,
      provenanceSeedHash: Uint8Array.from([0xc6, 0x13, 0xe0, 0x2a, 0xa4, 0x84, 0x60, 0xb1]),
      provenanceSeedHashHex: "c613e02aa48460b1",
    } satisfies sdk.SoulAccount;

    const metadata = sdk.buildSoulNftMetadata(soul);
    const jsonText = Buffer.from(
      metadata.uri.replace("data:application/json;base64,", ""),
      "base64",
    ).toString("utf8");
    const json = JSON.parse(jsonText) as {
      attributes: Array<{ trait_type: string; value: string }>;
    };
    const generatedTraitAttributes = sdk.soulGeneratedTraitMetadataAttributes(soul).map(
      ({ traitType, value }) => ({ trait_type: traitType, value }),
    );
    const metadataRarity = sdk.deriveSoulMetadataRarity(soul, {
      generation: "2",
      artTheme: "Fractal Structure",
    });

    expect(json.attributes).toEqual([
      { trait_type: "Platform", value: "SolSoul" },
      { trait_type: "Creator", value: soul.authority.toBase58() },
      { trait_type: "Launcher", value: soul.authority.toBase58() },
      { trait_type: "Associated token mint", value: mint.toBase58() },
      { trait_type: "Associated token symbol", value: "BONK" },
      { trait_type: "Art engine", value: "SolSoul On-Chain Art Engine" },
      { trait_type: "Art theme", value: "Fractal Structure" },
      { trait_type: "Generation", value: "2" },
      ...generatedTraitAttributes,
      { trait_type: "Rarity tier", value: metadataRarity.tier },
      { trait_type: "Soul Score", value: metadataRarity.score.toString() },
      { trait_type: "Trade side", value: "buy" },
      { trait_type: "Trade amount", value: "990000" },
      { trait_type: "Trade token output", value: "1000000" },
      { trait_type: "Trader wallet", value: trader.toBase58() },
      { trait_type: "Trader token account", value: tokenAccount.toBase58() },
      { trait_type: "Seed hash", value: "c613e02aa48460b1" },
      { trait_type: "Token mint", value: mint.toBase58() },
      { trait_type: "Soul PDA", value: soulPda.toBase58() },
    ]);
    expect(jsonText).not.toContain("signature");
    expect(jsonText).not.toContain("slot");
    expect(jsonText).not.toContain("blockTime");
    expect(metadata.mintRentExemptionSize).toBeGreaterThan(metadata.mintAccountSize);
  });

  it("lists claimed Soul NFTs for a mint by Soul PDA with sequence DESC paging", async () => {
    const { mint, soul } = sdk.findMintWithNoBumpPdas();
    const validSequences = Array.from({ length: 25 }, (_, index) => BigInt(index));
    const accounts = validSequences.map((sequence) => {
      const data = receiptData({
        soul,
        claimant: PublicKey.unique(),
        tokenMint: mint,
        nftMint: PublicKey.unique(),
        sequence,
      });
      return {
        pubkey: PublicKey.unique(),
        account: { data: Buffer.from(data) },
        sequence,
      };
    });
    const connection = {
      getProgramAccounts: async (_programId: PublicKey, config: unknown) => {
        expect(config).toMatchObject({
          filters: [
            { dataSize: sdk.RECEIPT_ACCOUNT_SIZE },
            { memcmp: { offset: sdk.RECEIPT_SOUL_OFFSET, bytes: soul.toBase58() } },
          ],
        });
        return accounts;
      },
    } as unknown as Parameters<typeof sdk.listClaimedSoulNftsByMint>[0];

    const page = await sdk.listClaimedSoulNftsByMint(connection, mint, {
      fetchMetadata: false,
      page: 1,
      pageSize: 24,
    });

    expect(page.total).toBe(25);
    expect(page.hasNextPage).toBe(true);
    expect(page.items).toHaveLength(24);
    expect(page.items[0]?.sequence).toBe(validSequences[24]);
    expect(page.items[23]?.sequence).toBe(validSequences[1]);
    expect(page.items[0]?.soul.equals(soul)).toBe(true);
    expect(page.items[0]?.tokenMint?.equals(mint)).toBe(true);
  });

  it("lists claimed Soul NFTs for a claimer as a primary source and keeps partial claim records", async () => {
    const { soul } = sdk.findMintWithNoBumpPdas();
    const claimer = PublicKey.unique();
    const otherClaimer = PublicKey.unique();
    const sequences = [0n, 3n, 1n];
    const accounts = [
      ...sequences.map((sequence) => ({
        pubkey: PublicKey.unique(),
        account: {
          data: Buffer.from(
            receiptData({
              soul,
              claimant: claimer,
              tokenMint: PublicKey.unique(),
              nftMint: PublicKey.unique(),
              sequence,
            }),
          ),
        },
      })),
      {
        pubkey: PublicKey.unique(),
        account: {
          data: Buffer.from(
            receiptData({
              soul,
              claimant: otherClaimer,
              tokenMint: PublicKey.unique(),
              nftMint: PublicKey.unique(),
              sequence: 9n,
            }),
          ),
        },
      },
    ];
    const connection = {
      getProgramAccounts: vi.fn(async (_programId: PublicKey, config: unknown) => {
        expect(config).toMatchObject({
          filters: [
            { dataSize: sdk.RECEIPT_ACCOUNT_SIZE },
            { memcmp: { offset: sdk.RECEIPT_CLAIMANT_OFFSET, bytes: claimer.toBase58() } },
          ],
        });
        return accounts.filter((account) =>
          sdk.decodeReceiptAccount(account.account.data).claimant.equals(claimer),
        );
      }),
      getAccountInfo: vi.fn(async () => null),
    } as unknown as Parameters<typeof sdk.listClaimedSoulNftsByClaimer>[0];

    const page = await sdk.listClaimedSoulNftsByClaimer(connection, claimer, {
      fetchMetadata: true,
      page: 1,
      pageSize: 2,
    });

    expect(page.total).toBe(3);
    expect(page.hasNextPage).toBe(true);
    expect(page.items.map((item) => item.sequence)).toEqual([3n, 1n]);
    expect(page.items.every((item) => item.claimer.equals(claimer))).toBe(true);
    expect(page.items.every((item) => item.tokenMint !== null)).toBe(true);
    expect(page.items.every((item) => item.metadata === null)).toBe(true);
  });

  it("includes claims whose NFT authority uses the bumped PDA fallback", async () => {
    const legacyProgramIds = {
      soulGenerator: "5wGUMWySAafwgTpGNgSaTMh1kiejnEGVTZj9x7wWJftk",
    };
    const mint = new PublicKey("FeAjpw28hwpfjrVbHFWUWyb7UDsEgcaxJyphUFezUPpZ");
    const soul = new PublicKey("B6sZafXSmD6eisWtUkAeejZEc9kbbk9EMW8KYKtK9upc");
    const bumpedSequence = 0n;
    const sequences = [0n, 1n, 2n];

    const accounts = sequences.map((sequence) => {
      const data = receiptData({
        soul,
        claimant: PublicKey.unique(),
        tokenMint: mint,
        nftMint: PublicKey.unique(),
        sequence,
      });
      return { pubkey: PublicKey.unique(), account: { data: Buffer.from(data) } };
    });
    const connection = {
      getProgramAccounts: async () => accounts,
    } as unknown as Parameters<typeof sdk.listClaimedSoulNftsByMint>[0];

    const page = await sdk.listClaimedSoulNftsByMint(connection, mint, {
      fetchMetadata: false,
      pageSize: 3,
      programIds: legacyProgramIds,
    });

    expect(page.total).toBe(3);
    expect(page.items.map((item) => item.sequence)).toEqual([2n, 1n, 0n]);
    expect(page.items.find((item) => item.sequence === bumpedSequence)?.metadataAuthority.toBase58()).toBe(
      "4GsCLNeF5cXPWJR9TENkEnQT5bNFj84ggNdAbBCff1U5",
    );
  });

  it("lists public Soul NFTs with token association resolved from SoulAccount", async () => {
    const { mint: tokenMint, soul } = sdk.findMintWithNoBumpPdas();
    const sequence = validNftAuthoritySequence(soul);
    const claimer = PublicKey.unique();
    const nftMint = PublicKey.unique();
    const data = receiptData({ soul, claimant: claimer, tokenMint, nftMint, sequence });
    const connection = {
      getProgramAccounts: vi.fn(async (_programId: PublicKey, config: unknown) => {
        expect(config).toMatchObject({ filters: [{ dataSize: sdk.RECEIPT_ACCOUNT_SIZE }] });
        return [{ pubkey: PublicKey.unique(), account: { data: Buffer.from(data) } }];
      }),
      getAccountInfo: vi.fn(async (address: PublicKey) => {
        expect(address.equals(soul)).toBe(true);
        return { data: Buffer.from(soulData({ mint: tokenMint })) };
      }),
    } as unknown as Parameters<typeof sdk.listClaimedSoulNfts>[0];

    const page = await sdk.listClaimedSoulNfts(connection, {
      fetchMetadata: false,
      pageSize: 24,
    });

    expect(page.total).toBe(1);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.tokenMint?.equals(tokenMint)).toBe(true);
    expect(page.items[0]?.nftMint.equals(nftMint)).toBe(true);
  });

  it("resolves wallet NFT mints back to claimed Souls and associated token mints", async () => {
    const { mint: tokenMint, soul } = sdk.findMintWithNoBumpPdas();
    const sequence = validNftAuthoritySequence(soul);
    const nftMint = PublicKey.unique();
    const receiptAccount = PublicKey.unique();
    const data = receiptData({
      soul,
      claimant: PublicKey.unique(),
      tokenMint,
      nftMint,
      sequence,
    });
    const connection = {
      getProgramAccounts: vi.fn(async (_programId: PublicKey, config: unknown) => {
        expect(config).toMatchObject({
          filters: [
            { dataSize: sdk.RECEIPT_ACCOUNT_SIZE },
            { memcmp: { offset: sdk.RECEIPT_NFT_MINT_OFFSET, bytes: nftMint.toBase58() } },
          ],
        });
        return [{ pubkey: receiptAccount, account: { data: Buffer.from(data) } }];
      }),
      getAccountInfo: vi.fn(async () => ({ data: Buffer.from(soulData({ mint: tokenMint })) })),
    } as unknown as Parameters<typeof sdk.listClaimedSoulNftsByNftMints>[0];

    const claimsByNftMint = await sdk.listClaimedSoulNftsByNftMints(connection, [nftMint], {
      fetchMetadata: false,
    });

    expect(claimsByNftMint.get(nftMint.toBase58())).toMatchObject({
      receiptAccount,
      tokenMint,
    });
  });

  it("lists bonding-curve launched tokens ordered by recent Soul creation before claims exist", async () => {
    const older = sdk.findFreshLaunchKeypair();
    const newer = sdk.findFreshLaunchKeypair();
    const olderCurveData = curveData({ mint: older.mint.publicKey, cumulativeSol: 1_000n });
    const newerCurveData = curveData({ mint: newer.mint.publicKey, cumulativeSol: 2_000n });
    const olderSoulData = soulData({
      mint: older.mint.publicKey,
      authority: PublicKey.unique(),
      createdAt: 10n,
      symbol: "OLD",
    });
    const newerSoulData = soulData({
      mint: newer.mint.publicKey,
      authority: PublicKey.unique(),
      createdAt: 20n,
      symbol: "NEW",
    });
    const curveAccounts = [
      { pubkey: older.curve, account: { data: Buffer.from(olderCurveData) } },
      { pubkey: newer.curve, account: { data: Buffer.from(newerCurveData) } },
    ];
    const connection = {
      getProgramAccounts: vi.fn(async (_programId: PublicKey, config: unknown) => {
        const dataSize = (config as { filters?: Array<{ dataSize?: number }> }).filters?.[0]?.dataSize;
        return dataSize === sdk.BONDING_CURVE_ACCOUNT_SIZE ? curveAccounts : [];
      }),
      getMultipleAccountsInfo: vi.fn(async (addresses: PublicKey[]) => {
        expect(addresses.map((address) => address.toBase58())).toEqual([
          older.soul.toBase58(),
          newer.soul.toBase58(),
        ]);
        return [
          { data: Buffer.from(olderSoulData) },
          { data: Buffer.from(newerSoulData) },
        ];
      }),
    } as unknown as Parameters<typeof sdk.listBondingCurveTokens>[0];

    const page = await sdk.listBondingCurveTokens(connection, { page: 1, pageSize: 1 });

    expect(page.total).toBe(2);
    expect(page.hasNextPage).toBe(true);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.mint.equals(newer.mint.publicKey)).toBe(true);
    expect(page.items[0]?.curve.equals(newer.curve)).toBe(true);
    expect(page.items[0]?.soul.equals(newer.soul)).toBe(true);
    expect(page.items[0]?.soulAccount?.memeSymbol).toBe("NEW");
    expect(page.items[0]?.createdAt).toBe(20n);
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

function legacyMintAccountData(): Buffer {
  return mintAccountData({ hookProgram: null });
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

function readU64LE(data: Buffer, offset: number): bigint {
  let value = 0n;
  for (let i = 0; i < 8; i += 1) {
    value |= BigInt(data[offset + i] ?? 0) << (BigInt(i) * 8n);
  }
  return value;
}

function writeU64ForTest(data: Uint8Array, value: bigint, offset: number): void {
  for (let i = 0; i < 8; i += 1) {
    data[offset + i] = Number((value >> (BigInt(i) * 8n)) & 0xffn);
  }
}

function claimData({
  soul,
  claimer,
  nftMint,
  sequence,
}: {
  soul: PublicKey;
  claimer: PublicKey;
  nftMint: PublicKey;
  sequence: bigint;
}): Uint8Array {
  const data = new Uint8Array(sdk.CLAIM_ACCOUNT_SIZE);
  data.set(soul.toBytes(), sdk.CLAIM_SOUL_OFFSET);
  data.set(claimer.toBytes(), sdk.CLAIM_CLAIMER_OFFSET);
  data.set(nftMint.toBytes(), sdk.CLAIM_NFT_MINT_OFFSET);
  writeU64ForTest(data, sequence, sdk.CLAIM_SEQUENCE_OFFSET);
  writeU64ForTest(data, sequence + 1n, sdk.CLAIM_GENERATION_COUNT_OFFSET);
  return data;
}

function receiptData({
  soul,
  claimant,
  tokenMint,
  nftMint,
  sequence,
  lifecycleState = "active",
}: {
  soul: PublicKey;
  claimant: PublicKey;
  tokenMint: PublicKey;
  nftMint: PublicKey;
  sequence: bigint;
  lifecycleState?: sdk.ReceiptLifecycleState;
}): Uint8Array {
  const data = new Uint8Array(sdk.RECEIPT_ACCOUNT_SIZE);
  data.set(soul.toBytes(), sdk.RECEIPT_SOUL_OFFSET);
  data.set(claimant.toBytes(), sdk.RECEIPT_CLAIMANT_OFFSET);
  data.set(tokenMint.toBytes(), sdk.RECEIPT_TOKEN_MINT_OFFSET);
  data.set(nftMint.toBytes(), sdk.RECEIPT_NFT_MINT_OFFSET);
  writeU64ForTest(data, sequence, sdk.RECEIPT_SEQUENCE_OFFSET);
  writeU64ForTest(data, sequence + 1n, sdk.RECEIPT_GENERATION_COUNT_OFFSET);
  writeU64ForTest(data, sdk.MIN_CLAIM_BALANCE, sdk.RECEIPT_BOUND_QUANTITY_OFFSET);
  writeU64ForTest(data, sequence + 1n, sdk.RECEIPT_BOUND_BOUNDARY_OFFSET);
  data[sdk.RECEIPT_LIFECYCLE_STATE_OFFSET] =
    lifecycleState === "active"
      ? sdk.RECEIPT_LIFECYCLE_STATE.Active
      : lifecycleState === "burned"
        ? sdk.RECEIPT_LIFECYCLE_STATE.Burned
        : sdk.RECEIPT_LIFECYCLE_STATE.Forfeited;
  return data;
}

function curveData({
  mint,
  cumulativeSol = 0n,
  totalMinted = 0n,
  selfDeprecated = false,
  lastInteractionSlot = 0n,
}: {
  mint: PublicKey;
  cumulativeSol?: bigint;
  totalMinted?: bigint;
  selfDeprecated?: boolean;
  lastInteractionSlot?: bigint;
}): Uint8Array {
  const data = new Uint8Array(sdk.BONDING_CURVE_ACCOUNT_SIZE);
  const view = new DataView(data.buffer);
  data.set(mint.toBytes(), 0);
  view.setBigUint64(sdk.CURVE_CUMULATIVE_SOL_OFFSET, cumulativeSol, true);
  view.setBigUint64(sdk.CURVE_TOTAL_MINTED_OFFSET, totalMinted, true);
  data[sdk.CURVE_SELF_DEPRECATED_OFFSET] = selfDeprecated ? 1 : 0;
  view.setBigUint64(sdk.CURVE_LAST_INTERACTION_SLOT_OFFSET, lastInteractionSlot, true);
  return data;
}

function soulData({
  mint,
  authority = PublicKey.unique(),
  createdAt = 0n,
  symbol = "",
}: {
  mint: PublicKey;
  authority?: PublicKey;
  createdAt?: bigint;
  symbol?: string;
}): Uint8Array {
  const data = new Uint8Array(sdk.SOUL_ACCOUNT_SIZE);
  const view = new DataView(data.buffer);
  data.set(mint.toBytes(), 0);
  data.set(authority.toBytes(), 32);
  view.setBigInt64(64, createdAt, true);
  if (symbol) {
    const symbolBytes = new TextEncoder().encode(symbol);
    data.set(symbolBytes, sdk.MEME_SYMBOL_OFFSET);
    data[sdk.MEME_SYMBOL_LEN_OFFSET] = symbolBytes.length;
  }
  return data;
}

function validNftAuthoritySequence(soul: PublicKey): bigint {
  expect(sdk.deriveNftAuthorityPda(soul, 0n)).toBeInstanceOf(PublicKey);
  return 0n;
}
