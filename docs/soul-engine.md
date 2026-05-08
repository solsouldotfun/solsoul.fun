# Soul Engine Technical Specification

The Soul Engine is SolSoul's extensible on-chain SVG rendering system. It transforms trade entropy into deterministic mathematical art through a three-layer architecture that supports both built-in and community-contributed renderers.

---

## 1. Design Philosophy

**Mathematical aesthetics only.** The engine enforces a strict boundary between algorithmic art (beauty emerging from math) and illustrative art (human-designed imagery). Only mathematical renderers are accepted as built-ins; community renderers are validated for algorithmic purity at registration time.

**Determinism.** Given the same `RenderContext`, a renderer must always produce the same SVG bytes. This enables verifiable provenance: anyone can replay a transaction and verify the Soul art.

**SBF stack safety.** Each external renderer runs in its own 4KB SBF stack frame via CPI, eliminating the stack overflow risk that plagues monolithic renderer programs.

---

## 2. Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Algorithm Registry                                  │
│ ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│ │ Built-in    │  │ Community   │  │ Custom Template     │  │
│ │ (0x0000)    │  │ (0x0001+)   │  │ (user-uploaded SVG) │  │
│ └─────────────┘  └─────────────┘  └─────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│ Layer 2: Engine Core (soul-generator program)               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Seed derivation → Renderer dispatch → SVG assembly      │ │
│ │                                                         │ │
│ │ 1. Derive deterministic seed from trade entropy        │ │
│ │ 2. Resolve renderer_id from style_params               │ │
│ │ 3. Dispatch to built-in function OR CPI to external    │ │
│ │ 4. Assemble final SVG (template + rendered fragment)   │ │
│ │ 5. Write to SoulAccount buffer                         │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Layer 1: Renderer Programs                                   │
│ ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│ │ Built-in    │  │ External    │  │ RenderBuffer PDA    │  │
│ │ functions   │  │ programs    │  │ (4096 bytes)        │  │
│ │ (in-program)│  │ (CPI call)  │  │                     │  │
│ └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Seed Derivation

The deterministic seed is computed in `generate_soul`:

```rust
fn derive_seed(
    signer: &Pubkey,
    slot_hashes: &SlotHashes,
    swap_amount: u64,
    is_buy: bool,
    token_mint: &Pubkey,
    generation: u32,
) -> [u8; 32] {
    let mut hasher = Hasher::default();
    hasher.hash(signer.as_ref());
    hasher.hash(slot_hashes.recent_slot_hash().as_ref());
    hasher.hash(&swap_amount.to_le_bytes());
    hasher.hash(&[is_buy as u8]);
    hasher.hash(token_mint.as_ref());
    hasher.hash(&generation.to_le_bytes());
    hasher.result().to_bytes()
}
```

**Properties:**
- `signer`: Trader's wallet pubkey
- `slot_hashes.recent_slot_hash()`: First entry from SlotHashes sysvar
- `swap_amount`: Net SOL amount (buy) or token amount (sell)
- `is_buy`: Direction flag
- `token_mint`: The meme token mint address
- `generation`: Monotonically increasing Soul generation counter

The seed is then expanded into renderer-specific parameters through deterministic pseudo-random generation.

---

## 4. Built-in Renderer Registry

Built-in renderers are direct function calls within the `soul-generator` program, bypassing CPI overhead.

### 4.1 Registry Table

| ID | Name | Function | Size Budget | Stack Usage |
|----|------|----------|-------------|-------------|
| `0x0000_0000` | Fractal Structure | `generate_fractal_svg` | ~2.5KB SVG | ~1.2KB stack |
| `0x0000_0001` | Vector Field | `generate_field_svg` | ~2.0KB SVG | ~1.0KB stack |
| `0x0000_0002` | Crystal Lattice | `generate_lattice_svg` | ~2.2KB SVG | ~1.1KB stack |
| `0x0000_0003` | Strange Attractor | `generate_chaos_svg` | ~2.8KB SVG | ~1.5KB stack |
| `0x0000_0004` | Harmonic Wave | `generate_harmonic_svg` | ~1.8KB SVG | ~0.9KB stack |
| `0x0000_0005` | Pixel Fractal | `generate_fractal_pixel_svg` | ~3.2KB SVG | ~1.8KB stack |
| `0x0000_0006` | Pixel Art | `generate_pixel_art_svg` | ~2.0KB SVG | ~1.0KB stack |

### 4.2 Renderer Interface

All built-in renderers conform to:

```rust
fn renderer_name(
    ctx: &RenderContext,
    buf: &mut [u8],
) -> Result<usize, ProgramError>
```

Where `RenderContext` contains:
- `seed: [u8; 32]` — Deterministic seed
- `width: u16`, `height: u16` — Canvas dimensions (default 512×512)
- `generation: u32` — Soul generation number
- `style_params: &[u8]` — Optional style overrides from SoulAccount

The function writes UTF-8 SVG bytes into `buf` and returns the byte length.

### 4.3 Trait Layer (Deterministic Rarity)

Each Soul has deterministic traits derived from the seed:

```rust
pub struct SoulTraits {
    pub art_theme: ArtTheme,        // Which renderer was used
    pub generation_band: GenerationBand,  // Genesis, Early, Established, Deep
    pub trade_signal: TradeSignal,  // Buy-generated or Sell-generated
    pub seed_source: SeedSource,    // On-chain hash or metadata fallback
    pub gas_level: GasLevel,        // 1-10 derived from seed entropy
    pub character_archetype: &'static str,  // Deterministic archetype label
}
```

Trait hashes are computed with domain-separated BLAKE3 to prevent collision attacks.

---

## 5. Community Renderer System

### 5.1 Registration

External developers register renderers through `register_renderer`:

```rust
pub struct RegisterRendererArgs {
    pub renderer_id: u32,           // Must be ≥ 0x0000_0001
    pub program_id: Pubkey,         // The renderer program address
    pub name: [u8; 32],             // Human-readable name
    pub description_hash: [u8; 32], // Hash of description document
}
```

**Requirements:**
- Registration fee: 0.1 SOL (sent to renderer registry PDA)
- `renderer_id` must not collide with existing entries
- Program must be deployed and executable
- Admin approval required (renderer registry is admin-gated)

### 5.2 Renderer Program Interface

Community renderer programs must implement:

```rust
/// Instruction discriminant: 0x00 = render
/// Accounts:
///   0. RenderBuffer PDA (writable)
///   1. RendererRegistryEntry PDA (readonly)
///   2. Clock sysvar (readonly)
/// Data: 164-byte RenderContext header + variable seed bytes
pub fn process_render(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    // 1. Validate accounts
    // 2. Deserialize RenderContext from instruction_data
    // 3. Render SVG into RenderBuffer
    // 4. Return Ok(())
}
```

### 5.3 CPI Flow

When `generate_soul` resolves a community renderer:

```rust
// 1. Look up renderer in registry
let entry = RendererRegistryEntry::try_from_account(accounts.renderer_registry)?;

// 2. Validate renderer is active
if !entry.is_active {
    return Err(SoulGeneratorError::RendererInactive.into());
}

// 3. Prepare RenderBuffer PDA
let render_buffer = find_render_buffer_pda(soul_account.key, renderer_id);

// 4. Build CPI instruction
let cpi_instruction = build_renderer_cpi(
    &entry.program_id,
    &render_buffer,
    &entry.key(),
    &RenderContext::new(seed, generation, style_params),
)?;

// 5. Invoke with signed seeds
invoke_signed(
    &cpi_instruction,
    &[
        render_buffer_account.clone(),
        renderer_registry_account.clone(),
        clock_account.clone(),
    ],
    &[signer_seeds],  // Soul PDA seeds
)?;

// 6. Copy rendered SVG from buffer to SoulAccount
let svg_len = copy_render_buffer_svg(&render_buffer_account, &mut soul_account.svg_buffer)?;
```

### 5.4 RenderBuffer PDA

```rust
pub struct RenderBuffer {
    pub soul: Pubkey,           // Associated Soul account
    pub renderer_id: u32,       // Which renderer wrote this buffer
    pub svg_len: u32,           // Actual SVG byte length
    pub svg_data: [u8; 4096],   // SVG output buffer
}
```

The RenderBuffer is ephemeral — it is overwritten on each generation. Only the SoulAccount persists the final SVG.

---

## 6. Custom Templates

Launchers can upload custom SVG templates that wrap the rendered fragment:

```rust
pub fn upload_template(
    ctx: Context<UploadTemplate>,
    template_bytes: Vec<u8>,
    style_params: Vec<u8>,
) -> Result<()> {
    let soul = &mut ctx.accounts.soul_account;
    soul.base_svg_template = template_bytes;
    soul.style_params = style_params;
    Ok(())
}
```

**Template format:** A valid SVG document with a `{RENDERED_FRAGMENT}` placeholder:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <filter id="glow">...</filter>
  </defs>
  <rect width="512" height="512" fill="#0a0a0a"/>
  {RENDERED_FRAGMENT}
  <text x="256" y="480" text-anchor="middle" fill="#fff" font-size="14">
    Soul #{GENERATION} — {SYMBOL}
  </text>
</svg>
```

The engine substitutes `{RENDERED_FRAGMENT}` with the renderer output and `{GENERATION}`, `{SYMBOL}` with on-chain values.

---

## 7. Renderer SDK (`solsoul-renderer-sdk`)

The `solsoul-renderer-sdk` crate provides utilities for building community renderers:

### 7.1 Core Types

```rust
pub struct RenderContext {
    pub seed: [u8; 32],
    pub width: u16,
    pub height: u16,
    pub generation: u32,
    pub style_params: Vec<u8>,
}

pub struct SvgWriter<'a> {
    buf: &'a mut [u8],
    pos: usize,
}

pub struct ColorPalette {
    pub colors: [(u8, u8, u8); 16],
}
```

### 7.2 Utilities

| Utility | Purpose |
|---------|---------|
| `SvgWriter` | Zero-allocation SVG string building |
| `ColorPalette` | Deterministic color schemes from seed |
| `RenderBufferWriter` | Write into RenderBuffer PDA accounts |
| `validate_svg` | Runtime SVG well-formedness check |
| `exp_neg_fixed` | Fixed-point exponential (8-term Taylor) |
| `solve_exp_inverse` | Binary-search ln for curve math |

### 7.3 Example Community Renderer

```rust
use solsoul_renderer_sdk::*;

entrypoint!(process_instruction);

fn process_instruction(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let ctx = RenderContext::from_bytes(instruction_data)?;
    let mut buf = RenderBufferWriter::from_account(&accounts[0])?;
    let mut svg = SvgWriter::new(buf.as_mut());

    // Deterministic random from seed
    let mut rng = DeterministicRng::new(&ctx.seed);
    let hue = rng.u16_in(0, 360);

    svg.open_tag("svg", &[("viewBox", "0 0 512 512")])?;
    svg.write_circle(256, 256, 200, &[
        ("fill", "none"),
        ("stroke", &format!("hsl({}, 80%, 60%)", hue)),
        ("stroke-width", "3"),
    ])?;
    svg.close_tag("svg")?;

    buf.commit(svg.len())?;
    Ok(())
}
```

---

## 8. Performance Budgets

### 8.1 Compute Unit Limits

| Operation | CU Budget | Typical Usage |
|-----------|-----------|---------------|
| Built-in renderer (fractal) | 50,000 | ~35,000 |
| Built-in renderer (chaos) | 80,000 | ~60,000 |
| Built-in renderer (harmonic) | 30,000 | ~20,000 |
| External renderer CPI | 100,000 | ~70,000 + renderer CU |
| SVG assembly + write | 10,000 | ~5,000 |
| **Total per generation** | **200,000** | **~120,000** |

### 8.2 Account Size Budgets

| Account | Size | Budget |
|---------|------|--------|
| SoulAccount SVG buffer | 4,096 bytes | Fixed |
| SoulAccount template buffer | 2,048 bytes | Fixed |
| RenderBuffer SVG buffer | 4,096 bytes | Fixed |
| ClaimAccount | 128 bytes | Fixed |
| Receipt | 161 bytes | Fixed |
| ReceiptRegistry | 88 bytes | Fixed |

### 8.3 Stack Safety

| Context | Stack Limit | Typical Usage |
|---------|-------------|---------------|
| Built-in renderer | 4,096 bytes | ~2,500 bytes (fractal) |
| External renderer CPI | 4,096 bytes (independent) | ~3,000 bytes |
| Soul generator main | 4,096 bytes | ~2,000 bytes |

The community renderer CPI pattern is the key stack safety mechanism: each renderer gets its own 4KB frame.

---

## 9. Security Considerations

### 9.1 Renderer Sandbox

Community renderers are sandboxed by design:
- Cannot modify SoulAccount directly (only write to RenderBuffer)
- Cannot access unauthorized accounts (CPI signer seeds control access)
- Cannot exceed compute budget (Solana runtime enforces CU limits)
- Cannot produce invalid SVG (`validate_svg` check in engine)

### 9.2 Determinism Verification

The engine verifies determinism by:
1. Recording `seed_hash` in SoulAccount
2. Storing `renderer_id` and `style_params` on-chain
3. Anyone can re-derive the seed and verify the SVG matches

### 9.3 SVG Injection Prevention

The engine sanitizes renderer output:
- Rejects `<script>` tags
- Rejects `javascript:` URLs
- Rejects external resource references (`href` to non-data URIs)
- Validates XML well-formedness before writing to SoulAccount

---

## 10. References

- `programs/soul-generator/src/engine/` — Engine implementation
- `programs/soul-generator/src/engine/registry.rs` — Built-in renderer registry
- `programs/soul-generator/src/engine/cpi.rs` — External renderer CPI
- `programs/soul-generator/src/instructions/register_renderer.rs` — Registration instruction
- `programs/solsoul-renderer-sdk/` — Renderer SDK crate
- `programs/soul-generator/src/svg/` — Built-in renderer implementations

---

*Document version: 2026-05-04*
