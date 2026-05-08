# SolSoul SVG Templates

SolSoul templates are SVG fragments that live fully on chain after upload. The frontend accepts
starter templates up to 5KB for authoring convenience, while the on-chain upload instruction stores
the compact SVG body in the 2048-byte `base_svg_template` field.

## Placeholder grammar

Templates are UTF-8 SVG byte strings stored on chain and must start with `<svg`. The renderer scans for `{{NAME}}` placeholders and leaves unknown names unchanged.

Supported placeholders:

- `{{HUE}}` — seed-derived hue `0..359`.
- `{{ACCENT}}` — complementary hue `(HUE + 180) % 360`.
- `{{SEED_HEX}}` — lowercase hex for the first 8 seed bytes.
- `{{HOLDER_TIER}}` — balance bucket `0..4` (`0`, `<1`, `<10`, `<100`, `>=100` tokens with 6 decimals).

## `style_params` KV format

`style_params` is ASCII key-value text:

```text
style_params := pair (";" pair)* [";"]
pair         := key "=" value
key          := "mode" | "evolution" | unknown-key
mode         := "color" | "hsl" | "pixel"
evolution    := "0" | "1" | "2" | "3"
```

Unknown keys are ignored. Invalid values for known keys reject rendering.

`evolution` stages enable placeholders cumulatively:

- `0`: `{{HUE}}`
- `1`: plus `{{ACCENT}}`
- `2`: plus `{{SEED_HEX}}`
- `3`: plus `{{HOLDER_TIER}}`

`mode` changes the hue derivation palette: `color` uses the raw seed hue, `hsl` uses a rotated seed hue for smoother HSL templates, and `pixel` snaps hue to 30-degree pixel-art buckets.

Recommended defaults:

- `mode=hsl;evolution=3;` for smooth gradients and all placeholder substitutions.
- `mode=pixel;evolution=3;` for templates that use `shape-rendering="crispEdges"`.
- `mode=color;evolution=1;` for simple color swaps that should not expose seed text.

## Included starter templates

The bundled starter library is served from `app/public/templates/` and is available in `/launch`
through the **Pick a starter template** dropdown. Selecting a template fetches the public SVG file
and loads it into the code editor for preview and editing.

| Template | Public path | Placeholder focus | Suggested style_params |
|---|---|---|---|
| Rainbow Unicorn | `/templates/rainbow-unicorn.svg` | `{{HUE}}`, `{{ACCENT}}`, `{{SEED_HEX}}` for gradients plus seed identity | `mode=hsl;evolution=2;` |
| Pixel Cat | `/templates/pixel-cat.svg` | `{{HUE}}`, `{{ACCENT}}`, `{{HOLDER_TIER}}` for pixel-art palette and holder status | `mode=pixel;evolution=3;` |
| Minimal Soul | `/templates/minimal-soul.svg` | `{{ACCENT}}`, `{{SEED_HEX}}`, `{{HOLDER_TIER}}` for a sparse emblem | `mode=color;evolution=3;` |

Each file starts directly with `<svg`, is below the 5KB frontend budget, and avoids external images,
fonts, scripts, stylesheets, or network references.

## Authoring guidelines

1. Keep uploaded SVGs compact. The launch editor validates a 5KB budget, but on-chain storage is
   2048 bytes; remove comments, unused whitespace, and editor metadata before upload.
2. Start the file with `<svg` so the upload instruction and frontend validator can reject non-SVG
   content deterministically.
3. Prefer inline shapes, gradients, text, and `hsl({{HUE}},...,...)` values. Do not reference IPFS,
   Arweave, HTTP URLs, external fonts, images, scripts, or CSS imports.
4. Use only the documented `{{NAME}}` placeholder form. Unknown placeholders stay literal, which is
   useful for drafts but should be avoided in production templates.
5. Choose `style_params` deliberately: `evolution=0` only substitutes hue, while `evolution=3`
   enables all supported placeholders including holder tier.
6. Test in the `/launch` preview iframe, then upload only SVG text that still renders correctly when
   the placeholders are replaced by numeric/string values.
