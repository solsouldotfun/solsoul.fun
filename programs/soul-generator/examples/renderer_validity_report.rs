use soul_generator::{
    state::LAST_SVG_CAPACITY,
    svg::{
        theme::{
            has_standard_svg_root_attrs, render_builtin_art_theme,
            render_builtin_art_theme_with_traits, ArtTheme,
        },
        traits::{resolve_blended_soul_traits, DefaultSoulTraitInput},
    },
};
use std::{
    env, fs,
    path::{Path, PathBuf},
};

const THEMES: [(ArtTheme, &str); 8] = [
    (ArtTheme::Fractal, "fractal"),
    (ArtTheme::Field, "field"),
    (ArtTheme::Lattice, "lattice"),
    (ArtTheme::Chaos, "chaos"),
    (ArtTheme::Harmonic, "harmonic"),
    (ArtTheme::PixelFractal, "pixelfractal"),
    (ArtTheme::PixelArt, "pixelart"),
    (ArtTheme::Symphony, "symphony"),
];

fn render(theme: ArtTheme, seed: &[u8]) -> Vec<u8> {
    let mut buf = [0u8; LAST_SVG_CAPACITY];
    let len = render_builtin_art_theme(theme, seed, &mut buf).expect("built-in renderer succeeds");
    buf[..len].to_vec()
}

fn render_with_traits(theme: ArtTheme, seed: &[u8]) -> Vec<u8> {
    let traits = resolve_blended_soul_traits(
        DefaultSoulTraitInput {
            seed,
            theme,
            provenance_side: 1,
            generation: 3,
            amount: 100,
            token_amount: 200,
        },
        b"",
    )
    .expect("traits resolve");
    let mut buf = [0u8; LAST_SVG_CAPACITY];
    let len = render_builtin_art_theme_with_traits(theme, seed, traits, &mut buf)
        .expect("trait-aware built-in renderer succeeds");
    buf[..len].to_vec()
}

fn fnv64(bytes: &[u8]) -> u64 {
    let mut hash = 0xcbf2_9ce4_8422_2325u64;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

fn count_visible_primitives(svg: &str) -> usize {
    svg.matches("<circle").count()
        + svg.matches("<path").count()
        + svg.matches("<polygon").count()
        + svg.matches("<line").count()
        + svg.matches("<rect").count().saturating_sub(1)
}

fn is_safe_standard_svg(theme: ArtTheme, svg: &str, len: usize) -> bool {
    let lower = svg.to_ascii_lowercase();
    let forbidden = [
        "<animate",
        "<foreignobject",
        "<iframe",
        "<image",
        "<script",
        "href=",
        "xlink:",
        "ipfs:",
        "ar:",
        "data:",
        "font",
        "javascript:",
        " on",
        "url(http",
        "url(//",
    ];
    let compact_attrs = ["<svg v=", " s-r=", " f=", "<g f=", " w=", " h="];
    len < LAST_SVG_CAPACITY
        && svg.starts_with("<svg")
        && svg.ends_with("</svg>")
        && has_standard_svg_root_attrs(svg)
        && count_visible_primitives(svg) > 0
        && !forbidden.iter().any(|token| lower.contains(token))
        && !compact_attrs.iter().any(|token| svg.contains(token))
        && (theme != ArtTheme::Field || !svg.contains("opacity=\"0\""))
}

fn write_sample(out_dir: &Path, name: &str, svg: &[u8]) -> PathBuf {
    let sample_dir = out_dir.join("renderer-validity-samples");
    fs::create_dir_all(&sample_dir).expect("sample directory");
    let path = sample_dir.join(format!("{name}.svg"));
    fs::write(&path, svg).expect("write sample");
    path
}

fn main() {
    let out_dir = env::args()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("evidence/art-qa"));
    fs::create_dir_all(&out_dir).expect("output directory");

    let seed = b"artqa-renderer-validity-mainnet";
    let mut report = String::from(
        "{\n  \"feature\": \"artqa-renderer-validity-and-tuning\",\n  \"capacityBytes\": 4096,\n  \"seed\": \"artqa-renderer-validity-mainnet\",\n  \"renderers\": [\n",
    );

    for (index, (theme, name)) in THEMES.iter().enumerate() {
        let base = render(*theme, seed);
        let trait_svg = render_with_traits(*theme, seed);
        let base_str = std::str::from_utf8(&base).expect("base svg utf8");
        let trait_str = std::str::from_utf8(&trait_svg).expect("trait svg utf8");
        let sample_path = write_sample(&out_dir, name, &base);
        let base_ok = is_safe_standard_svg(*theme, base_str, base.len());
        let trait_ok = is_safe_standard_svg(*theme, trait_str, trait_svg.len());
        assert!(base_ok, "{name} base renderer failed validity heuristics");
        assert!(trait_ok, "{name} trait renderer failed validity heuristics");

        report.push_str("    {\n");
        report.push_str(&format!("      \"theme\": \"{name}\",\n"));
        report.push_str(&format!("      \"baseBytes\": {},\n", base.len()));
        report.push_str(&format!("      \"traitBytes\": {},\n", trait_svg.len()));
        report.push_str(&format!(
            "      \"baseHashFnv64\": \"{:016x}\",\n",
            fnv64(&base)
        ));
        report.push_str(&format!(
            "      \"traitHashFnv64\": \"{:016x}\",\n",
            fnv64(&trait_svg)
        ));
        report.push_str(&format!(
            "      \"visiblePrimitives\": {},\n",
            count_visible_primitives(base_str)
        ));
        report.push_str("      \"standardSafeVisibleUnderCap\": true,\n");
        report.push_str(&format!(
            "      \"samplePath\": \"{}\"\n",
            sample_path.display()
        ));
        report.push_str("    }");
        if index + 1 != THEMES.len() {
            report.push(',');
        }
        report.push('\n');
    }

    report.push_str("  ],\n  \"overall\": \"pass\"\n}\n");
    fs::write(out_dir.join("renderer-validity-summary.json"), report).expect("write report");
}
