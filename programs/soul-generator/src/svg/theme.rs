use super::traits::BlendedSoulTraitSet;
use crate::engine::{render_builtin, render_builtin_with_traits, RenderContext};
use pinocchio::error::ProgramError;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ArtTheme {
    Fractal,
    Field,
    Lattice,
    Chaos,
    Harmonic,
    PixelFractal,
    PixelArt,
    Symphony,
    CustomTemplate,
}

/// Parse a community renderer_id from style_params.
///
/// Accepts decimal (`renderer_id=65537`) or hex (`renderer_id=0x00010001`).
/// Returns `None` if no renderer_id key is found.
pub fn resolve_renderer_id(style_params: &[u8]) -> Option<u32> {
    let mut pair_start = 0usize;
    while pair_start <= style_params.len() {
        let pair_end = find_byte(style_params, pair_start, b';').unwrap_or(style_params.len());
        if pair_end > pair_start {
            let pair = &style_params[pair_start..pair_end];
            if let Some(equals) = find_byte(pair, 0, b'=') {
                if equals > 0 && equals + 1 < pair.len() {
                    let key = &pair[..equals];
                    let value = &pair[equals + 1..];
                    if key == b"renderer_id" {
                        return parse_u32(value);
                    }
                }
            }
        }
        if pair_end == style_params.len() {
            break;
        }
        if let Some(next) = pair_end.checked_add(1) {
            pair_start = next;
        } else {
            break;
        }
    }
    None
}

fn parse_u32(bytes: &[u8]) -> Option<u32> {
    if bytes.is_empty() {
        return None;
    }
    if bytes.len() >= 3 && bytes[0] == b'0' && (bytes[1] == b'x' || bytes[1] == b'X') {
        // Hex
        let mut val: u32 = 0;
        for &b in &bytes[2..] {
            let digit = match b {
                b'0'..=b'9' => b - b'0',
                b'a'..=b'f' => b - b'a' + 10,
                b'A'..=b'F' => b - b'A' + 10,
                _ => return None,
            };
            val = val.checked_mul(16)?.checked_add(digit as u32)?;
        }
        Some(val)
    } else {
        // Decimal
        let mut val: u32 = 0;
        for &b in bytes {
            let digit = b.checked_sub(b'0')?;
            if digit > 9 {
                return None;
            }
            val = val.checked_mul(10)?.checked_add(digit as u32)?;
        }
        Some(val)
    }
}

pub fn resolve_art_theme(style_params: &[u8], template_len: usize) -> ArtTheme {
    if template_len > 0 {
        return ArtTheme::CustomTemplate;
    }

    let mut explicit_theme = None;
    let mut pair_start = 0usize;
    while pair_start <= style_params.len() {
        let pair_end = find_byte(style_params, pair_start, b';').unwrap_or(style_params.len());
        if pair_end > pair_start {
            let pair = &style_params[pair_start..pair_end];
            if let Some(equals) = find_byte(pair, 0, b'=') {
                if equals > 0 && equals + 1 < pair.len() {
                    let key = &pair[..equals];
                    let value = &pair[equals + 1..];
                    if key == b"theme" {
                        explicit_theme = match value {
                            b"fractal" => Some(ArtTheme::Fractal),
                            b"pixelfractal" => Some(ArtTheme::PixelFractal),
                            b"pixelart" => Some(ArtTheme::PixelArt),
                            b"field" => Some(ArtTheme::Field),
                            b"lattice" => Some(ArtTheme::Lattice),
                            b"chaos" => Some(ArtTheme::Chaos),
                            b"harmonic" => Some(ArtTheme::Harmonic),
                            b"symphony" => Some(ArtTheme::Symphony),
                            b"custom" => Some(ArtTheme::CustomTemplate),
                            _ => explicit_theme,
                        };
                    }
                }
            }
        }
        if pair_end == style_params.len() {
            break;
        }
        if let Some(next) = pair_end.checked_add(1) {
            pair_start = next;
        } else {
            break;
        }
    }

    explicit_theme.unwrap_or(ArtTheme::Fractal)
}

/// Render a built-in theme through the Soul Engine.
///
/// This delegates to the engine's built-in renderer registry. To add a new
/// built-in algorithm, register it in `engine/registry.rs` — no changes to
/// this file are required.
pub fn render_builtin_art_theme(
    theme: ArtTheme,
    seed: &[u8],
    buf: &mut [u8],
) -> Result<usize, ProgramError> {
    let ctx = RenderContext {
        seed,
        seed_hash: &default_seed_hash(seed),
        generation: 0,
        side: 0,
        amount: 0,
        trader: &pinocchio::Address::new_from_array([0; 32]),
        token_account: &pinocchio::Address::new_from_array([0; 32]),
        mint: &pinocchio::Address::new_from_array([0; 32]),
        soul: &pinocchio::Address::new_from_array([0; 32]),
        holder_balance: 0,
    };
    render_builtin(theme, &ctx, buf)
}

pub fn render_builtin_art_theme_with_traits(
    theme: ArtTheme,
    seed: &[u8],
    traits: BlendedSoulTraitSet,
    buf: &mut [u8],
) -> Result<usize, ProgramError> {
    let ctx = RenderContext {
        seed,
        seed_hash: &default_seed_hash(seed),
        generation: 0,
        side: 0,
        amount: 0,
        trader: &pinocchio::Address::new_from_array([0; 32]),
        token_account: &pinocchio::Address::new_from_array([0; 32]),
        mint: &pinocchio::Address::new_from_array([0; 32]),
        soul: &pinocchio::Address::new_from_array([0; 32]),
        holder_balance: 0,
    };
    render_builtin_with_traits(theme, &ctx, Some(traits), buf)
}

pub fn has_standard_svg_root_attrs(svg: &str) -> bool {
    let Some(root_tag) = svg_root_tag(svg) else {
        return false;
    };
    root_tag.contains(r#"xmlns="http://www.w3.org/2000/svg""#)
        && root_tag.contains(r#"viewBox="0 0 256 256""#)
        && root_tag.contains(r#"width="256""#)
        && root_tag.contains(r#"height="256""#)
}

fn svg_root_tag(svg: &str) -> Option<&str> {
    if !svg.starts_with("<svg") {
        return None;
    }
    let after_name = svg.as_bytes().get(4).copied();
    if !matches!(after_name, Some(b' ' | b'\t' | b'\n' | b'\r' | b'>')) {
        return None;
    }
    svg.find('>').map(|end| &svg[..=end])
}

fn default_seed_hash(seed: &[u8]) -> [u8; 8] {
    let mut hash = 0xcbf2_9ce4_8422_2325u64;
    let mut index = 0usize;
    while index < seed.len() {
        hash ^= seed[index] as u64;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
        hash ^= (index as u64).rotate_left((index % 31) as u32);
        index += 1;
    }
    hash.to_le_bytes()
}

fn find_byte(bytes: &[u8], start: usize, target: u8) -> Option<usize> {
    let mut index = start;
    while index < bytes.len() {
        if bytes[index] == target {
            return Some(index);
        }
        index += 1;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::{
        has_standard_svg_root_attrs, render_builtin_art_theme,
        render_builtin_art_theme_with_traits, resolve_art_theme, ArtTheme,
    };
    use crate::state::LAST_SVG_CAPACITY;
    use crate::svg::traits::{resolve_blended_soul_traits, DefaultSoulTraitInput};
    use std::{str, vec::Vec};

    fn render(theme: ArtTheme, seed: &[u8]) -> Vec<u8> {
        let mut buf = [0u8; LAST_SVG_CAPACITY];
        let len = render_builtin_art_theme(theme, seed, &mut buf).expect("theme renders");
        buf[..len].to_vec()
    }

    const BUILT_IN_THEMES: [ArtTheme; 8] = [
        ArtTheme::Fractal,
        ArtTheme::Field,
        ArtTheme::Lattice,
        ArtTheme::Chaos,
        ArtTheme::Harmonic,
        ArtTheme::PixelFractal,
        ArtTheme::PixelArt,
        ArtTheme::Symphony,
    ];

    fn render_with_style(theme: ArtTheme, seed: &[u8], style_params: &[u8]) -> Vec<u8> {
        render_with_trait_input(theme, seed, style_params, 1, 100, 200)
    }

    fn render_with_trait_input(
        theme: ArtTheme,
        seed: &[u8],
        style_params: &[u8],
        generation: u64,
        amount: u64,
        token_amount: u64,
    ) -> Vec<u8> {
        let traits = resolve_blended_soul_traits(
            DefaultSoulTraitInput {
                seed,
                theme,
                provenance_side: 1,
                generation,
                amount,
                token_amount,
            },
            style_params,
        )
        .expect("traits resolve");
        let mut buf = [0u8; LAST_SVG_CAPACITY];
        let len = render_builtin_art_theme_with_traits(theme, seed, traits, &mut buf)
            .unwrap_or_else(|err| panic!("{theme:?} theme with traits renders: {err:?}"));
        buf[..len].to_vec()
    }

    fn assert_safe_inline_svg(svg: &str) {
        let lower = svg.to_ascii_lowercase();
        let lower_without_namespace = lower.replace(r#"xmlns="http://www.w3.org/2000/svg""#, "");
        for forbidden in [
            "<animate",
            "<foreignobject",
            "<iframe",
            "<image",
            "<script",
            "<style",
            "href=",
            "xlink:",
            "http://",
            "https://",
            "ipfs:",
            "ar:",
            "data:",
            "font",
            "javascript:",
            " on",
            "url(",
        ] {
            assert!(
                !lower_without_namespace.contains(forbidden),
                "built-in theme SVG must not contain unsafe token {forbidden}: {svg}"
            );
        }
    }

    fn count_visible_primitives(svg: &str) -> usize {
        svg.matches("<circle").count()
            + svg.matches("<path").count()
            + svg.matches("<polygon").count()
            + svg.matches("<line").count()
            + svg.matches("<rect").count().saturating_sub(1)
    }

    fn assert_standard_visible_svg(theme: ArtTheme, rendered: &[u8]) {
        assert!(
            rendered.len() < LAST_SVG_CAPACITY,
            "{theme:?} SVG must stay under LAST_SVG_CAPACITY/4096 bytes, got {}",
            rendered.len()
        );
        let svg = str::from_utf8(rendered).expect("valid utf8");
        assert!(
            svg.starts_with("<svg"),
            "{theme:?} must start with svg root"
        );
        assert!(svg.ends_with("</svg>"), "{theme:?} must close svg root");
        assert!(
            has_standard_svg_root_attrs(svg),
            "{theme:?} root <svg> must declare xmlns, canonical viewBox, and 256x256 dimensions: {svg}"
        );
        assert_safe_inline_svg(svg);
        assert!(
            count_visible_primitives(svg) > 0,
            "{theme:?} must emit non-background visible primitives: {svg}"
        );
        for non_standard in ["<svg v=", " s-r=", " f=", "<g f=", " w=", " h="] {
            assert!(
                !svg.contains(non_standard),
                "{theme:?} must not use compact/non-standard SVG token {non_standard}: {svg}"
            );
        }
        if theme == ArtTheme::Field {
            assert!(
                !svg.contains("opacity=\"0\""),
                "field primitives must not serialize as fully transparent: {svg}"
            );
        }
    }

    #[test]
    fn standard_svg_root_attrs_are_checked_on_root_tag_only() {
        assert!(!has_standard_svg_root_attrs(
            r#"<svg><g xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"></g></svg>"#
        ));
        assert!(!has_standard_svg_root_attrs(
            r#"<svg viewBox="0 0 256 256" width="256" height="256"><rect xmlns="http://www.w3.org/2000/svg"/></svg>"#
        ));
        assert!(has_standard_svg_root_attrs(
            r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><rect width="256" height="256"/></svg>"#
        ));
    }

    #[test]
    fn theme_resolver_maps_empty_and_explicit_fields_to_expected_themes() {
        assert_eq!(resolve_art_theme(b"", 0), ArtTheme::Fractal);
        assert_eq!(resolve_art_theme(b"theme=fractal", 0), ArtTheme::Fractal);
        assert_eq!(resolve_art_theme(b"theme=field", 0), ArtTheme::Field);
        assert_eq!(resolve_art_theme(b"theme=lattice", 0), ArtTheme::Lattice);
        assert_eq!(resolve_art_theme(b"theme=chaos", 0), ArtTheme::Chaos);
        assert_eq!(resolve_art_theme(b"theme=harmonic", 0), ArtTheme::Harmonic);
        assert_eq!(
            resolve_art_theme(b"theme=pixelfractal", 0),
            ArtTheme::PixelFractal
        );
        assert_eq!(resolve_art_theme(b"theme=pixelart", 0), ArtTheme::PixelArt);
        assert_eq!(resolve_art_theme(b"theme=symphony", 0), ArtTheme::Symphony);
    }

    #[test]
    fn fractal_theme_resolves_to_default_identity() {
        assert_eq!(resolve_art_theme(b"theme=fractal", 0), ArtTheme::Fractal);
    }

    #[test]
    fn theme_resolver_prefers_custom_templates_over_built_in_params() {
        assert_eq!(resolve_art_theme(b"", 1), ArtTheme::CustomTemplate);
        assert_eq!(
            resolve_art_theme(b"theme=fractal;mode=custom", 42),
            ArtTheme::CustomTemplate
        );
        assert_eq!(
            resolve_art_theme(b"theme=custom", 0),
            ArtTheme::CustomTemplate
        );
    }

    #[test]
    fn built_in_theme_renderers_are_deterministic_distinct_and_bounded() {
        let seed = b"pd10-theme-fixture-seed";
        let fractal = render(ArtTheme::Fractal, seed);
        let field = render(ArtTheme::Field, seed);
        let lattice = render(ArtTheme::Lattice, seed);
        let chaos = render(ArtTheme::Chaos, seed);
        let harmonic = render(ArtTheme::Harmonic, seed);
        let pixel_fractal = render(ArtTheme::PixelFractal, seed);
        let pixel_art = render(ArtTheme::PixelArt, seed);
        let symphony = render(ArtTheme::Symphony, seed);

        assert_eq!(fractal, render(ArtTheme::Fractal, seed));
        assert_eq!(field, render(ArtTheme::Field, seed));
        assert_eq!(lattice, render(ArtTheme::Lattice, seed));
        assert_eq!(chaos, render(ArtTheme::Chaos, seed));
        assert_eq!(harmonic, render(ArtTheme::Harmonic, seed));
        assert_eq!(pixel_fractal, render(ArtTheme::PixelFractal, seed));
        assert_eq!(pixel_art, render(ArtTheme::PixelArt, seed));
        assert_eq!(symphony, render(ArtTheme::Symphony, seed));
        assert_ne!(fractal, field);
        assert_ne!(fractal, lattice);
        assert_ne!(fractal, chaos);
        assert_ne!(fractal, harmonic);
        assert_ne!(fractal, pixel_fractal);
        assert_ne!(fractal, pixel_art);
        assert_ne!(field, lattice);
        assert_ne!(field, chaos);
        assert_ne!(field, harmonic);
        assert_ne!(field, pixel_fractal);
        assert_ne!(field, pixel_art);
        assert_ne!(lattice, chaos);
        assert_ne!(lattice, harmonic);
        assert_ne!(lattice, pixel_fractal);
        assert_ne!(lattice, pixel_art);
        assert_ne!(chaos, harmonic);
        assert_ne!(chaos, pixel_fractal);
        assert_ne!(chaos, pixel_art);
        assert_ne!(harmonic, pixel_fractal);
        assert_ne!(harmonic, pixel_art);
        assert_ne!(harmonic, symphony);
        assert_ne!(pixel_fractal, pixel_art);
        assert_ne!(pixel_fractal, symphony);
        assert_ne!(pixel_art, symphony);

        for rendered in [
            &fractal,
            &field,
            &lattice,
            &chaos,
            &harmonic,
            &pixel_fractal,
            &pixel_art,
            &symphony,
        ] {
            assert_standard_visible_svg(
                BUILT_IN_THEMES
                    .iter()
                    .copied()
                    .find(|theme| render(*theme, seed) == **rendered)
                    .expect("rendered output maps to a built-in theme"),
                rendered,
            );
        }
    }

    #[test]
    fn every_builtin_renderer_is_standard_visible_bounded_and_input_sensitive() {
        let seeds = [
            b"artqa-seed-00".as_slice(),
            b"artqa-seed-01".as_slice(),
            b"artqa-seed-02".as_slice(),
            b"artqa-seed-03".as_slice(),
            b"artqa-seed-04".as_slice(),
            b"artqa-seed-05".as_slice(),
            b"artqa-seed-06".as_slice(),
            b"artqa-seed-07".as_slice(),
        ];

        for theme in BUILT_IN_THEMES {
            let baseline = render(theme, seeds[0]);
            assert_standard_visible_svg(theme, &baseline);
            assert_eq!(
                baseline,
                render(theme, seeds[0]),
                "{theme:?} must be byte-stable for identical context"
            );

            let mut unique_count = 1usize;
            let mut previous = baseline;
            for seed in &seeds[1..] {
                let rendered = render(theme, seed);
                assert_standard_visible_svg(theme, &rendered);
                if rendered != previous {
                    unique_count += 1;
                }
                previous = rendered;
            }
            assert!(
                unique_count >= 6,
                "{theme:?} should change output for most seed changes; unique transitions {unique_count}"
            );

            let generation_one = render_with_trait_input(theme, seeds[0], b"", 1, 100, 200);
            let generation_two = render_with_trait_input(theme, seeds[0], b"", 3, 100, 200);
            assert_standard_visible_svg(theme, &generation_one);
            assert_standard_visible_svg(theme, &generation_two);
            assert_ne!(
                generation_one, generation_two,
                "{theme:?} should change when finalized generation-derived traits change"
            );
        }
    }

    #[test]
    fn built_in_static_soul_svgs_contain_no_animation_or_remote_asset_surfaces() {
        for theme in BUILT_IN_THEMES {
            let rendered = render_with_trait_input(
                theme,
                b"animated-preview-static-guardrail-seed",
                b"trait_palette=solana;trait_mood=radiant;trait_form=orb",
                11,
                1_000_000,
                10_000_000,
            );
            let svg = str::from_utf8(&rendered).expect("built-in SVG is UTF-8");
            let lower = svg.to_ascii_lowercase();
            let lower_without_namespace =
                lower.replace(r#"xmlns="http://www.w3.org/2000/svg""#, "");

            for forbidden in [
                "<animate", "<set", "<style", "<script", "<image", "href=", "xlink:", "http://",
                "https://", "ipfs:", "ar:", "data:", "url(",
            ] {
                assert!(
                    !lower_without_namespace.contains(forbidden),
                    "{theme:?} static/on-chain SVG must not contain animation or remote asset token {forbidden}: {svg}"
                );
            }
            assert_standard_visible_svg(theme, &rendered);
        }
    }

    #[test]
    fn built_in_renderer_visibly_uses_final_trait_overlay() {
        let seed = b"pd19-trait-render-seed";
        let ember = render_with_style(
            ArtTheme::Fractal,
            seed,
            b"trait_palette=ember;trait_mood=radiant;trait_form=crystal",
        );
        let solana = render_with_style(
            ArtTheme::Fractal,
            seed,
            b"trait_palette=solana;trait_mood=radiant;trait_form=crystal",
        );
        let ember_again = render_with_style(
            ArtTheme::Fractal,
            seed,
            b"trait_palette=ember;trait_mood=radiant;trait_form=crystal",
        );

        assert_eq!(ember, ember_again);
        assert_ne!(ember, solana);
        let ember_svg = str::from_utf8(&ember).expect("valid utf8");
        let solana_svg = str::from_utf8(&solana).expect("valid utf8");
        assert!(ember_svg.contains("#ff6a3d"));
        assert!(solana_svg.contains("#9945ff"));
        assert!(ember_svg.contains("<polygon"));
    }

    #[test]
    fn system_filled_core_traits_can_change_output_without_user_selection() {
        let seed = b"pd19-same-render-seed";
        let first_traits = resolve_blended_soul_traits(
            DefaultSoulTraitInput {
                seed,
                theme: ArtTheme::Fractal,
                provenance_side: 1,
                generation: 1,
                amount: 100,
                token_amount: 200,
            },
            b"",
        )
        .expect("first traits resolve");
        let second_traits = resolve_blended_soul_traits(
            DefaultSoulTraitInput {
                seed,
                theme: ArtTheme::Fractal,
                provenance_side: 1,
                generation: 3,
                amount: 100,
                token_amount: 200,
            },
            b"",
        )
        .expect("second traits resolve");
        assert_ne!(first_traits.core, second_traits.core);

        let mut first_buf = [0u8; LAST_SVG_CAPACITY];
        let first_len = render_builtin_art_theme_with_traits(
            ArtTheme::Fractal,
            seed,
            first_traits,
            &mut first_buf,
        )
        .expect("first render succeeds");
        let mut second_buf = [0u8; LAST_SVG_CAPACITY];
        let second_len = render_builtin_art_theme_with_traits(
            ArtTheme::Fractal,
            seed,
            second_traits,
            &mut second_buf,
        )
        .expect("second render succeeds");

        assert_ne!(&first_buf[..first_len], &second_buf[..second_len]);
    }
}
