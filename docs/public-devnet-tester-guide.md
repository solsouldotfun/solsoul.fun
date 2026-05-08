# Public Devnet Tester Guide / 公开 Devnet 测试指南

## English

### 1. What you are testing

SolSoul.fun public devnet is available at <https://solsoul-devnet.vercel.app>. The site and programs use Solana **devnet** only. The top banner says `DEVNET TESTNET`; funds and tokens are not real.

SolSoul's lifecycle is intentionally not a standalone NFT mint or a traditional NFT drop. You launch and trade a Token-2022 meme token; each trade can generate a changing, fully on-chain SVG Soul candidate. A generated Soul can be claimed only by a wallet holding at least **1 whole meme token** (`1.000000` token / `1_000_000` base units). It is also not a pump.fun-style token-only flow: the token lifecycle, trade-generated art, and holder-gated Soul claims are all part of the test.

### 2. Get devnet SOL

1. Open the Solana faucet: <https://faucet.solana.com/>.
2. Paste your wallet address.
3. Select **Devnet** and request a small amount of SOL.
4. Keep every new transaction small. Public testing should stay below **0.5 SOL** total for any new on-chain instruction flow. Screenshots and `--verify-trace` checks are read-only and free.

### 3. Switch your wallet to devnet

#### Phantom

1. Open Phantom.
2. Go to **Settings**.
3. Open **Developer Settings**.
4. Enable testnet mode if needed.
5. Set **Change Network** to **Devnet**.
6. Return to the site and use the **Connect Wallet / Select Wallet** button.

#### Solflare

1. Open Solflare.
2. Go to **Settings**.
3. Open **Network** or **Developer Settings**.
4. Choose **Devnet**.
5. Return to the site and connect with **Connect Wallet / Select Wallet**.

### 4. Core scenarios

#### Scenario 1 — Connect wallet

1. Open <https://solsoul-devnet.vercel.app>.
2. Confirm the `DEVNET TESTNET` banner is visible at the top.
3. Click **Connect Wallet / Select Wallet**.
4. Pick Phantom or Solflare and approve the devnet connection.

#### Scenario 2 — Launch a token

1. Open `/launch`.
2. Fill in **Name**, **Ticker**, and **Description**.
   SolSoul shows its platform branding as a display badge and metadata field;
   it does **not** append a forced suffix to your chosen name or ticker.
3. Choose a starter SVG template or keep the default.
4. Click **Preview** to check the starting Soul SVG template. This does not mint an NFT.
5. Accept the risk disclaimer checkbox.
6. Submit **Launch token** and approve the wallet transaction. This creates the token launch; claimable Soul NFTs appear only after token trades generate candidates and an eligible holder claims one.

#### Scenario 3 — Buy

1. Open the launched token page.
2. Enter a small devnet SOL buy amount.
3. Approve the wallet transaction.
4. Confirm the page updates token/Soul state after confirmation.
   A fresh launch has no claimable Soul yet; the buy/generate event creates the
   latest changing on-chain SVG Soul candidate shown on the token page.

#### Scenario 4 — Sell

1. On the token page, enter a token sell amount that your wallet holds.
2. Approve the wallet transaction.
3. Confirm the SOL/token balances update after confirmation.

#### Scenario 5 — Claim Soul

1. Hold at least **1 whole meme token** (`1.000000` token, or
   `1_000_000` base units with 6 decimals) as required by the token page.
   Holding less than 1 token disables claim with a clear reason.
2. Click **Claim Soul**.
3. Approve the wallet transaction.
4. Open the gallery and confirm the Soul NFT appears.

There is no active graduation or AMM migration in the current public product. Historical Raydium
devnet traces are retained only in read-only `--verify-trace` mode for legacy evidence.

### 5. Known limitations

- **AMM scope:** AMM migration is not active for public testing. Raydium, Meteora, and PumpSwap notes are deferred research / historical validation, not active public test flows.
- **Audit deferred:** SolSoul is not audited. Do not use real funds or mainnet wallets for public devnet testing.
- **Sample indexer:** The public Railway indexer is a smoke-test service and may not provide complete historical backfill.

---

## 中文

### 1. 测试内容

SolSoul.fun 公开 devnet 地址是 <https://solsoul-devnet.vercel.app>。网站和链上程序都只连接 Solana **devnet**。页面顶部会显示 `DEVNET TESTNET` 横幅；这里的 SOL、代币和 NFT 都不是实物资产。

SolSoul 的生命周期刻意不是独立 NFT mint，也不是传统 NFT drop。你发射并交易的是 Token-2022 meme token；每次交易都可能生成不断变化、完全链上的 SVG Soul 候选。已生成的 Soul 只能由至少持有 **1 个完整 meme token**（`1.000000` token / `1_000_000` base units）的钱包 claim。它也不是 pump.fun 式的纯代币流程：代币生命周期、交易生成的艺术和持有人门槛 Soul claim 都是本次测试的一部分。

### 2. 获取 devnet SOL

1. 打开 Solana 水龙头：<https://faucet.solana.com/>。
2. 粘贴你的钱包地址。
3. 选择 **Devnet**，领取少量 SOL。
4. 每次新链上操作都应保持很小金额。公开测试中的任何新指令流程总预算应低于 **0.5 SOL**。截图和 `--verify-trace` 检查是只读操作，不消耗 SOL。

### 3. 将钱包切换到 devnet

#### Phantom

1. 打开 Phantom。
2. 进入 **Settings（设置）**。
3. 打开 **Developer Settings（开发者设置）**。
4. 如有需要，启用测试网模式。
5. 将 **Change Network（切换网络）** 设置为 **Devnet**。
6. 回到网站，点击 **Connect Wallet / Select Wallet（连接钱包 / 选择钱包）**。

#### Solflare

1. 打开 Solflare。
2. 进入 **Settings（设置）**。
3. 打开 **Network（网络）** 或 **Developer Settings（开发者设置）**。
4. 选择 **Devnet**。
5. 回到网站，点击 **Connect Wallet / Select Wallet（连接钱包 / 选择钱包）**。

### 4. 核心测试场景

#### 场景 1 — 连接钱包

1. 打开 <https://solsoul-devnet.vercel.app>。
2. 确认页面顶部显示 `DEVNET TESTNET` 横幅。
3. 点击 **Connect Wallet / Select Wallet（连接钱包 / 选择钱包）**。
4. 选择 Phantom 或 Solflare，并批准 devnet 连接。

#### 场景 2 — 发射代币

1. 打开 `/launch` 页面。
2. 填写 **Name（名称）**、**Ticker（代码）** 和 **Description（描述）**。
   SolSoul 会通过展示徽章和元数据字段呈现平台品牌；它**不会**给你选择的名称或 ticker 强制追加后缀。
3. 选择一个 SVG 初始模板，或保留默认模板。
4. 点击 **Preview（预览）** 检查初始 Soul SVG 模板。这一步不会 mint NFT。
5. 勾选风险提示确认框。
6. 点击 **Launch token（发射代币）**，并在钱包中批准交易。这会创建代币发射；只有代币交易生成候选、且符合条件的持有人 claim 后，才会出现可持有的 Soul NFT。

#### 场景 3 — 买入

1. 打开发射后的代币页面。
2. 输入一个很小的 devnet SOL 买入金额。
3. 在钱包中批准交易。
4. 交易确认后，检查页面上的代币 / Soul 状态是否更新。新发射的代币一开始没有可 claim 的 Soul；
   买入 / 生成事件会创建最新的、不断变化的链上 SVG Soul 候选，并显示在代币页面。

#### 场景 4 — 卖出

1. 在代币页面输入你钱包持有范围内的卖出数量。
2. 在钱包中批准交易。
3. 交易确认后，检查 SOL / 代币余额是否更新。

#### 场景 5 — Claim Soul

1. 确保钱包至少持有 **1 个完整 meme token**（`1.000000` token，
   即 6 位小数下的 `1_000_000` base units）。少于 1 个 token 时，Claim 会被禁用并显示原因。
2. 点击 **Claim Soul**。
3. 在钱包中批准交易。
4. 打开 gallery，确认 Soul NFT 已出现。

当前公开产品没有活跃的毕业或 AMM 迁移路径。历史 Raydium devnet trace 仅保留在只读 `--verify-trace` 模式中，用于 legacy evidence 验证。

### 5. 已知限制

- **AMM 范围：** AMM 迁移不属于当前公开测试范围。Raydium、Meteora 和 PumpSwap 说明属于延后研究 / 历史验证，不是当前公开测试流程。
- **审计延后：** SolSoul 尚未完成审计。不要把真实资金或 mainnet 钱包用于公开 devnet 测试。
- **示例 indexer：** 公开 Railway indexer 是冒烟测试服务，不保证完整历史回填。
