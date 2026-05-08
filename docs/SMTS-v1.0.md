# SolSoul Mathematical Trait Standard (SMTS) v1.0

## 设计哲学

受 Pixel Symphony 的 "The Shape of Time" 启发，我们将 NFT 视为**时间的形状**——不是静态图像，而是数学过程的痕迹。每个 NFT 都是一个确定性算法的唯一实例，该算法将区块链活动（交易、持有、流动性）转化为视觉特征。

**核心原则：**
- **数学即美学**：trait 不是随机标签，而是数学函数的输出
- **时间即结构**：NFT 随时间进化，记录其链上历史
- **确定性**：相同的输入始终产生相同的输出，确保可验证性
- **分层进化**：基础形态稳定，进化层动态叠加

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                    NFT Trait Architecture                    │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Evolution Overlays (动态)                          │
│  ├── Temporal Resonance (时间共振)                            │
│  ├── Transaction Topology (交易拓扑)                          │
│  ├── Liquidity Field (流动性场)                               │
│  └── Provenance Depth (溯源深度)                              │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Base Traits (静态，mint 时确定)                      │
│  ├── Mathematical Family (数学家族)                           │
│  ├── Generative Seed (生成种子)                               │
│  ├── Dimensional Signature (维度签名)                         │
│  ├── Harmonic Profile (谐波轮廓)                              │
│  └── Entropy Class (熵类别)                                   │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Core Identity (链上存储)                            │
│  ├── Token Mint Address                                       │
│  ├── Generation Number                                        │
│  ├── Birth Timestamp                                          │
│  └── Provenance Seed Hash                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Core Identity

链上存储的不可变核心数据：

```rust
struct SoulCore {
    token_mint: Pubkey,           // NFT 代币地址
    generation: u64,              // 代数（创世=0）
    birth_timestamp: i64,         // 创建时间戳
    provenance_seed: [u8; 32],    // 溯源种子（交易哈希派生）
    mathematical_family: u8,      // 数学家族 ID
}
```

---

## Layer 2: Base Traits (静态)

Mint 时通过确定性算法生成，终身不变。基于 **Layer 1** 的核心数据计算。

### 2.1 Mathematical Family (数学家族)

将 NFT 分类到 5 个数学家族，每个家族代表一种生成范式：

| Family ID | Name | Mathematical Foundation | Visual Character |
|-----------|------|------------------------|------------------|
| 0 | **Fractal** (分形) | 迭代函数系统 (IFS), L-系统 | 自相似，无限细节 |
| 1 | **Field** (场论) | 向量场，Perlin 噪声 | 流动，有机 |
| 2 | **Lattice** (格点) | 晶体学，密铺理论 | 几何，秩序 |
| 3 | **Chaos** (混沌) | 奇异吸引子，分岔 | 动态，不可预测 |
| 4 | **Harmonic** (谐波) | 傅里叶级数，波形 | 周期，音乐性 |

**选择算法**：`family = provenance_seed[0] % 5`

### 2.2 Generative Seed (生成种子)

256-bit 种子，派生所有视觉参数：

```typescript
function deriveGenerativeSeed(core: SoulCore): bigint {
  const input = `${core.token_mint}${core.provenance_seed}${core.generation}`;
  return fnv1a64(input);  // 64-bit FNV-1a
}
```

### 2.3 Dimensional Signature (维度签名)

控制 NFT 的"维度感"——从 2D 平面到高维投影：

| Trait | Range | Mathematical Meaning |
|-------|-------|---------------------|
| **Dimensionality** | 2.0 - 5.0 | 分形维度 (Hausdorff dimension) |
| **Projection** | orthographic/perspective/hyperbolic | 投影方式 |
| **Depth** | 0-100 | Z轴深度层次 |

**计算**：
```typescript
dimensionality = 2.0 + (seed % 300) / 100  // 2.0 - 5.0
projection = PROJECTIONS[seed % 3]
depth = seed % 101
```

### 2.4 Harmonic Profile (谐波轮廓)

基于傅里叶分析的视觉节奏：

| Trait | Range | Meaning |
|-------|-------|---------|
| **Fundamental** | 1-100 | 基频 (控制整体节奏) |
| **Overtones** | 0-7 | 泛音数量 (复杂度) |
| **Decay** | exponential/linear/none | 振幅衰减曲线 |

**计算**：
```typescript
fundamental = 1 + (seed % 100)
overtones = seed % 8
decay = DECAY_CURVES[seed % 3]
```

### 2.5 Entropy Class (熵类别)

衡量 NFT 的"有序度"：

| Class | Range | Character |
|-------|-------|-----------|
| **Crystalline** | 0-20 | 高度有序，对称 |
| **Structured** | 21-50 | 部分有序，模式 |
| **Organic** | 51-80 | 自然，流动 |
| **Chaotic** | 81-100 | 随机，不可预测 |

**计算**：`entropy = seed % 101`

---

## Layer 3: Evolution Overlays (动态)

基于链上活动实时计算的进化层。这些不是存储的 trait，而是**派生属性**。

### 3.1 Temporal Resonance (时间共振)

衡量 NFT 的"时间积累"：

```typescript
interface TemporalResonance {
  age_days: number;           // 存在天数
  hold_time_avg: number;      // 平均持有时间
  velocity: number;           // 交易频率 (0-100)
  rhythm: 'staccato' | 'legato' | 'adagio';  // 交易节奏
}

// 计算
age_days = (current_time - birth_timestamp) / 86400
hold_time_avg = total_hold_time / transfer_count
velocity = Math.min(100, transfer_count * 10 / age_days)
rhythm = velocity > 70 ? 'staccato' : velocity > 30 ? 'legato' : 'adagio'
```

**视觉影响**：
- 高 velocity → 尖锐、快速的视觉元素
- 低 velocity → 平滑、缓慢流动的形态
- age_days → 颜色饱和度随时间增加

### 3.2 Transaction Topology (交易拓扑)

分析 NFT 的交易图结构：

```typescript
interface TransactionTopology {
  degree: number;             // 交易对手数量
  clustering: number;         // 聚类系数 (0-1)
  centrality: number;         // 中心性 (0-100)
  path_length_avg: number;    // 平均路径长度
}
```

**视觉影响**：
- 高度数 → 复杂、多分支结构
- 高聚类 → 紧密、团状形态
- 高中心性 → 辐射状、星形

### 3.3 Liquidity Field (流动性场)

基于代币流动性的场强：

```typescript
interface LiquidityField {
  field_strength: number;     // 场强 (0-100)
  flow_direction: number;     // 流向角度 (0-360)
  turbulence: number;         // 湍流度 (0-100)
}
```

**视觉影响**：
- 场强 → 线条密度
- 流向 → 整体构图方向
- 湍流 → 随机扰动程度

### 3.4 Provenance Depth (溯源深度)

基于交易历史的深度计算：

```typescript
interface ProvenanceDepth {
  depth: number;              // 交易链深度
  rarity_path: number;        // 路径稀有度 (0-100)
  convergence: number;        // 收敛度 (0-1)
}
```

**视觉影响**：
- 深度 → 层次数量
- 稀有路径 → 特殊颜色标记
- 收敛 → 向心/离心构图

---

## 进化机制

### 经验值系统 (XP)

每个 NFT 积累经验值，触发进化：

```typescript
interface EvolutionState {
  xp: number;                 // 总经验值
  level: number;              // 当前等级 (1-100)
  milestones: Milestone[];    // 已达成的里程碑
}

// XP 获取规则
function calculateXP(event: ChainEvent): number {
  switch (event.type) {
    case 'trade':
      return 10 * event.volume_usd * (event.is_first_buy ? 2 : 1);
    case 'hold':
      return 1 * event.days_held;  // 每天 1 XP
    case 'liquidity_add':
      return 50 * event.amount_usd;
    case 'stake':
      return 5 * event.days_staked;
    default:
      return 0;
  }
}

// 等级计算 (对数曲线，越往后越难升级)
function calculateLevel(xp: number): number {
  return Math.floor(1 + Math.log2(1 + xp / 100));
}
```

### 里程碑系统

特定条件触发视觉里程碑：

| Milestone | Condition | Visual Effect |
|-----------|-----------|---------------|
| **Genesis** | Mint | 基础形态 |
| **First Blood** | 首次交易 | 添加交易标记 |
| **HODLer** | 持有 30 天 | 金色边框 |
| **Veteran** | 持有 365 天 | 时间纹理 |
| **Whale** | 单笔交易 > $10K | 放大效果 |
| **Degen** | 7 天内 10+ 交易 | 闪烁效果 |
| **LP King** | 提供流动性 > $50K | 光环效果 |
| **Century** | 100 笔交易 | 特殊徽章 |

---

## SVG 渲染架构

### 渲染蓝图 (Render Blueprint)

链上存储紧凑的渲染指令，而非完整 SVG：

```typescript
interface RenderBlueprint {
  version: number;            // 蓝图版本
  family: number;             // 数学家族
  seed: bigint;               // 生成种子
  base_params: BaseParams;    // 基础参数
  evolution_state: EvolutionState;  // 进化状态
  // 不存储完整 SVG，只存储参数
}

// 基础参数 (约 200 bytes)
interface BaseParams {
  dimensionality: number;     // 2.0-5.0
  projection: number;         // 0-2
  depth: number;              // 0-100
  fundamental: number;        // 1-100
  overtones: number;          // 0-7
  decay: number;              // 0-2
  entropy: number;            // 0-100
}
```

### 渲染流程

```
链上蓝图 (200 bytes)
    ↓
渲染引擎 (链下)
    ↓
数学计算
    ↓
SVG 生成
    ↓
可选：链上验证哈希
```

### 数学渲染器

每个数学家族有专门的渲染器：

#### Fractal Renderer (分形)
```typescript
function renderFractal(params: BaseParams, evolution: EvolutionState): SVG {
  // 使用 IFS (迭代函数系统)
  const transforms = generateIFSTransforms(params.seed);
  const points = iterateIFS(transforms, 10000);
  return pointsToSVG(points, params);
}
```

#### Field Renderer (场论)
```typescript
function renderField(params: BaseParams, evolution: EvolutionState): SVG {
  // 使用 Perlin 噪声 + 向量场
  const field = generateVectorField(params.seed, params.dimensionality);
  const streamlines = traceStreamlines(field, 1000);
  return streamlinesToSVG(streamlines, params);
}
```

#### Lattice Renderer (格点)
```typescript
function renderLattice(params: BaseParams, evolution: EvolutionState): SVG {
  // 使用晶体学群
  const symmetry = getWallpaperGroup(params.seed);
  const motif = generateMotif(params.seed);
  return tilingToSVG(symmetry, motif, params);
}
```

#### Chaos Renderer (混沌)
```typescript
function renderChaos(params: BaseParams, evolution: EvolutionState): SVG {
  // 使用奇异吸引子
  const attractor = selectAttractor(params.seed);
  const orbit = iterateAttractor(attractor, 50000);
  return orbitToSVG(orbit, params);
}
```

#### Harmonic Renderer (谐波)
```typescript
function renderHarmonic(params: BaseParams, evolution: EvolutionState): SVG {
  // 使用傅里叶级数
  const harmonics = generateHarmonics(params.seed, params.overtones);
  const waveform = composeWaveform(harmonics, params.fundamental);
  return waveformToSVG(waveform, params);
}
```

---

## SVG API 设计

### REST API

```
POST /api/v1/render
Content-Type: application/json

{
  "blueprint": {
    "version": 1,
    "family": 0,
    "seed": "1234567890abcdef",
    "base_params": {
      "dimensionality": 3.5,
      "projection": 1,
      "depth": 50,
      "fundamental": 42,
      "overtones": 5,
      "decay": 0,
      "entropy": 75
    },
    "evolution_state": {
      "xp": 1500,
      "level": 5,
      "milestones": ["genesis", "first_blood", "hodler"]
    }
  },
  "format": "svg",  // svg | png | json
  "size": 1024      // 输出尺寸
}

Response:
{
  "svg": "<svg>...</svg>",
  "hash": "sha256:abc123...",
  "render_time_ms": 45
}
```

### WASM 客户端模块

```typescript
import { SoulRenderer } from '@solsoul/renderer-wasm';

const renderer = await SoulRenderer.init();

// 客户端渲染
const svg = renderer.render({
  family: 'fractal',
  seed: '1234567890abcdef',
  params: { dimensionality: 3.5, ... },
  evolution: { xp: 1500, level: 5 }
});

// 验证链上蓝图
const isValid = renderer.verifyBlueprint(blueprint, onChainHash);
```

### SDK

```typescript
import { SolSoul } from '@solsoul/sdk';

const solsoul = new SolSoul(connection);

// 获取 NFT 渲染蓝图
const blueprint = await solsoul.getRenderBlueprint(nftMint);

// 渲染 SVG
const svg = await solsoul.renderSVG(blueprint);

// 监听进化事件
solsoul.onEvolution(nftMint, (evolution) => {
  console.log(`NFT leveled up to ${evolution.level}!`);
});
```

---

## 链上验证

确保链下渲染与链上数据一致：

```rust
// 链上程序验证渲染哈希
fn verify_render_hash(
    blueprint: &RenderBlueprint,
    claimed_hash: &[u8; 32]
) -> Result<bool, ProgramError> {
    let computed_hash = hash_blueprint(blueprint);
    Ok(computed_hash == claimed_hash)
}
```

---

## 实现路线图

### Phase 1: 基础架构 (2-3 周)
- [ ] 定义 RenderBlueprint 数据结构
- [ ] 实现 5 个数学家族的渲染器原型
- [ ] 创建链上蓝图存储
- [ ] 实现基础 trait 生成算法

### Phase 2: 进化系统 (2-3 周)
- [ ] 实现 XP 计算和等级系统
- [ ] 设计里程碑触发器
- [ ] 创建进化状态存储
- [ ] 实现链上事件监听

### Phase 3: SVG API (2 周)
- [ ] 构建 REST API 服务
- [ ] 实现 WASM 渲染模块
- [ ] 创建 TypeScript SDK
- [ ] 添加缓存和 CDN 支持

### Phase 4: 集成与优化 (2 周)
- [ ] 集成到现有 Soul 合约
- [ ] 优化渲染性能
- [ ] 添加验证机制
- [ ] 文档和示例

---

## 与现有系统的兼容性

### 迁移策略

1. **现有 NFT**：保持当前系统，可选升级
2. **新 NFT**：默认使用新数学 trait 系统
3. **混合模式**：允许用户选择 "经典" 或 "数学" 风格

### 数据映射

| 旧系统 | 新系统 |
|--------|--------|
| character_archetype | mathematical_family |
| background | entropy_class + dimensionality |
| gas_aura_cloud | liquidity_field |
| animation_behavior | temporal_resonance |
| gas_level | evolution_level |

---

## 示例

### 示例 1: 创世 NFT

```typescript
const core = {
  token_mint: "<TOKEN_MINT_PUBKEY_BASE58>",
  generation: 0,
  birth_timestamp: 1704067200,
  provenance_seed: [0xc6, 0x13, 0xe0, 0x2a, ...],
};

// Base Traits
const base = deriveBaseTraits(core);
// {
//   family: "fractal",
//   dimensionality: 3.14,
//   projection: "hyperbolic",
//   fundamental: 42,
//   overtones: 5,
//   entropy: 73
// }

// Evolution (初始状态)
const evolution = {
  xp: 0,
  level: 1,
  milestones: ["genesis"]
};
```

### 示例 2: 进化后的 NFT

```typescript
// 经过 100 笔交易，持有 1 年
const evolution = {
  xp: 15000,
  level: 12,
  milestones: ["genesis", "first_blood", "hodler", "veteran", "century"]
};

// Temporal Resonance
const temporal = {
  age_days: 365,
  hold_time_avg: 30,
  velocity: 25,
  rhythm: 'legato'
};

// 视觉表现：
// - 基础分形结构保留
// - 添加时间纹理（年轮效果）
// - 金色边框（HODLer 里程碑）
// - 特殊徽章（Century 里程碑）
// - 颜色饱和度增加（age_days）
```

---

## 技术规格

### 链上存储需求

| 组件 | 大小 | 存储位置 |
|------|------|----------|
| SoulCore | 73 bytes | 链上账户 |
| RenderBlueprint | ~200 bytes | 链上账户 |
| EvolutionState | ~100 bytes | 链上账户 |
| **总计** | **~373 bytes** | - |

### 渲染性能

| 操作 | 时间 | 说明 |
|------|------|------|
| 蓝图解析 | < 1ms | 简单反序列化 |
| 数学计算 | 10-50ms | 取决于复杂度 |
| SVG 生成 | 5-20ms | 字符串拼接 |
| **总计** | **15-70ms** | 单次渲染 |

### API 速率限制

| 层级 | 请求/分钟 | 适用场景 |
|------|-----------|----------|
| 免费 | 60 | 开发测试 |
| 基础 | 600 | 小型项目 |
| 专业 | 6000 | 大型应用 |
| 企业 | 无限制 | 自定义部署 |

---

## 总结

SolSoul Mathematical Trait Standard (SMTS) 将 NFT 从静态收藏品转变为**活的数学对象**：

1. **基础层**：确定性数学算法生成独特身份
2. **进化层**：链上活动实时影响视觉表现
3. **开放层**：SVG API 允许任何人集成和扩展

这不是简单的"特征随机组合"，而是**基于数学真理的生成艺术**——每个 NFT 都是时间、交易和数学的函数。

**下一步**：开始 Phase 1 实现，先构建 Fractal 和 Field 两个渲染器原型。