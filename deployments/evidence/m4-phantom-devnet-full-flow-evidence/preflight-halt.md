# M4 Phantom Devnet Full-Flow Evidence — Preflight Halt

**Feature:** `m4-phantom-devnet-full-flow-evidence`
**Mission:** `28e8c5a1-19eb-4009-90ad-17b50a016960` (raydium-receipt-completion)
**Worker session:** `4b8b54da-2e2a-4f5d-92a9-62328c1ebd98`
**Date:** 2026-05-03
**Outcome:** **HALT — returning to orchestrator. No Phantom signing was attempted; no server/script signer substituted.**

## Required preflight per AGENTS.md (Resumed Session Authorization, 2026-05-03)

> Worker MUST run a preflight check first; if any signing surface fails to present a real Phantom approval prompt (e.g., `WalletNotReadyError`, phantom.com redirect), halt and hand off to orchestrator. Do NOT use server/script signing as substitute.

Per the `phantom-wallet-worker` skill ("Phantom Interactive Preflight"):

> Before running the full Phantom signing flow, verify the browser profile used by agent-browser has Phantom installed, unlocked, set to devnet, funded, and ready to show approval prompts. If clicking Phantom opens phantom.com or reports `WalletNotReadyError`, stop and return to orchestrator; do not substitute a server signer or script signer for required Phantom evidence.

## Preflight steps performed (read-only, no signing prompts attempted)

1. Opened `https://solsoul-devnet.vercel.app/en` in the worker's agent-browser session.
2. Probed wallet provider globals via `agent-browser eval`:
   - `typeof window.phantom` → `"undefined"`
   - `typeof window.solana` → `"undefined"`
   - `window.phantom?.solana?.isPhantom` → `false`
   - `window.phantom?.solana?.isConnected` → `false`
   - Wallet provider keys on `window` → `[]` (empty)
3. Probed runtime: `navigator.userAgent` reports `HeadlessChrome/145.0.7632.6`; `chrome.runtime` is **not present**, confirming the agent-browser profile is a stock headless Chromium with **no installed extensions**, hence no Phantom content script can inject `window.phantom.solana`.
4. Programmatically clicked the visible "Select Wallet" button to confirm the wallet modal renders. The Phantom button is rendered inside the modal, but clicking it would trigger Solana wallet-adapter `WalletNotReadyError` or a phantom.com redirect because no provider is injected. **No click on the Phantom button was performed** — doing so could open phantom.com which itself qualifies as the documented halt condition; the upstream cause (`window.phantom === undefined`) is already definitive.
5. Captured screenshot: `preflight-public-en-modal.png` (Select Wallet modal showing Phantom row on `/en`).

## Conclusion

The browser profile attached to this worker's agent-browser session is **not Phantom-ready**. It is a headless Chromium without extensions, so the Phantom provider is absent (`window.phantom` undefined). Any attempt to invoke a signing prompt for launch / buy / claim / transfer / sell / settlement would either:

- throw `WalletNotReadyError` from `@solana/wallet-adapter-react`, or
- redirect to https://phantom.com/download.

Both are explicit halt conditions in AGENTS.md and the `phantom-wallet-worker` skill.

Per mission policy, **no server signer, script signer, or `/api/devnet-smoke` substitute is permitted** to fulfill VAL-PHANTOM-001..016 / VAL-CROSS-001..008.

## What is required to unblock this feature

The orchestrator (or user) needs to provide an agent-browser profile that has:

1. **Phantom extension installed** (a non-headless Chromium/Brave profile with the Phantom extension MV3 bundle loaded, or a persistent user-data-dir profile with the extension pre-installed and the extension ID whitelisted).
2. **Phantom unlocked** with the test passphrase entered.
3. **Network set to Devnet** in the Phantom extension settings.
4. **Devnet SOL funded** (≥0.5 SOL recommended) on the connected key.
5. **Human approval available** to click "Approve" on each Phantom prompt during the run (launch, buy, claim, transfer, sell, settlement, plus rejection cases).

Once the orchestrator confirms the above and the worker can re-verify `window.phantom.solana.isPhantom === true` from its session, the full evidence run (12 PHANTOM + 8 CROSS assertions, EN + ZH) can proceed.

## Files in this preflight bundle

- `preflight-halt.md` — this report
- `preflight-public-en-modal.png` — public devnet `/en` Select Wallet modal screenshot

No transactions were submitted. No mainnet RPC was contacted. No signers were used. No sensitive material is included.
