use serde_json::{json, Value};
use soul_generator::{
    state::{LAST_SVG_CAPACITY, PROVENANCE_SIDE_BUY, PROVENANCE_SIDE_SELL},
    svg::{
        theme::{has_standard_svg_root_attrs, render_builtin_art_theme_with_traits, ArtTheme},
        traits::{
            resolve_blended_soul_traits, BlendedSoulTraitSet, DefaultSoulTraitInput,
            CORE_ART_TRAIT_CATEGORIES,
        },
    },
};
use std::{
    collections::BTreeMap,
    env, fs,
    path::{Path, PathBuf},
    process,
};

const DEFAULT_SAMPLE_COUNT: usize = 240;
const MIN_SAMPLE_COUNT: usize = 200;
const THEME_MIN_FRACTION_DIVISOR: usize = 16;
const TRAIT_MIN_FRACTION_DIVISOR: usize = 10;

const THEMES: [(ArtTheme, &str, &str); 8] = [
    (ArtTheme::Fractal, "fractal", "fractal"),
    (ArtTheme::Field, "field", "field"),
    (ArtTheme::Lattice, "lattice", "lattice"),
    (ArtTheme::Chaos, "chaos", "chaos"),
    (ArtTheme::Harmonic, "harmonic", "harmonic"),
    (ArtTheme::PixelFractal, "pixelfractal", "pixel_fractal"),
    (ArtTheme::PixelArt, "pixelart", "pixel_art"),
    (ArtTheme::Symphony, "symphony", "symphony"),
];

const CORE_VALUE_KEYS: [(&str, &str, [&str; 4]); 4] = [
    (
        "palette",
        "trait_palette",
        ["solana", "aurora", "ember", "mono"],
    ),
    (
        "mood",
        "trait_mood",
        ["serene", "charged", "mystic", "radiant"],
    ),
    ("form", "trait_form", ["spiral", "wave", "crystal", "orb"]),
    (
        "background",
        "trait_background",
        ["midnight", "nebula", "grid", "eclipse"],
    ),
];

#[derive(Debug)]
struct Config {
    out_dir: PathBuf,
    sample_count: usize,
}

#[derive(Debug)]
struct SampleMetrics {
    id: String,
    theme: &'static str,
    theme_display: &'static str,
    seed: String,
    style_params: String,
    path: String,
    hash: String,
    byte_len: usize,
    visible_primitives: usize,
    rects: usize,
    circles: usize,
    paths: usize,
    polygons: usize,
    lines: usize,
    opacity_zero_count: usize,
    safe_standard_visible: bool,
    traits: BlendedSoulTraitSet,
}

fn main() {
    let config = parse_args();
    if config.sample_count < MIN_SAMPLE_COUNT {
        eprintln!(
            "Art QA batch requires at least {MIN_SAMPLE_COUNT} samples, got {}",
            config.sample_count
        );
        process::exit(2);
    }

    if let Err(err) = generate(config) {
        eprintln!("Art QA batch sample generation failed: {err}");
        process::exit(1);
    }
}

fn parse_args() -> Config {
    let mut out_dir = PathBuf::from("evidence/art-qa");
    let mut sample_count = DEFAULT_SAMPLE_COUNT;
    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--out" => {
                let value = args.next().unwrap_or_else(|| {
                    eprintln!("--out requires a directory argument");
                    process::exit(2);
                });
                out_dir = PathBuf::from(value);
            }
            "--samples" => {
                let value = args.next().unwrap_or_else(|| {
                    eprintln!("--samples requires a numeric argument");
                    process::exit(2);
                });
                sample_count = value.parse::<usize>().unwrap_or_else(|_| {
                    eprintln!("--samples must be an integer, got {value}");
                    process::exit(2);
                });
            }
            "--help" | "-h" => {
                println!(
                    "Usage: cargo run -p soul-generator --example art_qa_batch_sample -- [--samples N] [--out evidence/art-qa]"
                );
                process::exit(0);
            }
            other => {
                eprintln!("Unknown argument: {other}");
                process::exit(2);
            }
        }
    }
    Config {
        out_dir,
        sample_count,
    }
}

fn generate(config: Config) -> Result<(), String> {
    fs::create_dir_all(&config.out_dir).map_err(|err| err.to_string())?;
    let sample_dir = config.out_dir.join("batch-samples");
    if sample_dir.exists() {
        fs::remove_dir_all(&sample_dir).map_err(|err| err.to_string())?;
    }
    fs::create_dir_all(&sample_dir).map_err(|err| err.to_string())?;

    let mut samples = Vec::with_capacity(config.sample_count);
    let mut exact_svg_groups: BTreeMap<String, Vec<String>> = BTreeMap::new();

    for index in 0..config.sample_count {
        let (theme, theme_name, theme_display) = THEMES[index % THEMES.len()];
        let id = format!("sample-{index:03}-{theme_name}");
        let seed = format!("solsoul-artqa-batch-v1:{index:03}:{theme_name}");
        let style_params = style_params_for(index, theme_name);
        let provenance_side = if index % 5 == 4 {
            PROVENANCE_SIDE_SELL
        } else {
            PROVENANCE_SIDE_BUY
        };
        let generation = 1 + index as u64;
        let amount = 10_000 + (index as u64 * 97);
        let token_amount = 1_000_000 + (index as u64 * 37_777);
        let trait_input = DefaultSoulTraitInput {
            seed: seed.as_bytes(),
            theme,
            provenance_side,
            generation,
            amount,
            token_amount,
        };
        let traits = resolve_blended_soul_traits(trait_input, style_params.as_bytes())
            .map_err(|err| format!("{id}: trait resolution failed: {err:?}"))?;
        let svg = render_svg(theme, seed.as_bytes(), traits)
            .map_err(|err| format!("{id}: renderer failed: {err:?}"))?;
        let svg_text =
            std::str::from_utf8(&svg).map_err(|err| format!("{id}: invalid utf8: {err}"))?;
        let path = sample_dir.join(format!("{id}.svg"));
        fs::write(&path, &svg).map_err(|err| format!("write {}: {err}", path.display()))?;
        exact_svg_groups
            .entry(svg_text.to_owned())
            .or_default()
            .push(id.clone());
        samples.push(SampleMetrics {
            id,
            theme: theme_name,
            theme_display,
            seed,
            style_params,
            path: make_relative_path(&config.out_dir, &path),
            hash: format!("{:016x}", fnv64(&svg)),
            byte_len: svg.len(),
            visible_primitives: count_visible_primitives(svg_text),
            rects: svg_text.matches("<rect").count(),
            circles: svg_text.matches("<circle").count(),
            paths: svg_text.matches("<path").count(),
            polygons: svg_text.matches("<polygon").count(),
            lines: svg_text.matches("<line").count(),
            opacity_zero_count: svg_text.matches("opacity=\"0\"").count(),
            safe_standard_visible: is_safe_standard_visible(theme, svg_text, svg.len()),
            traits,
        });
    }

    let duplicate_groups: Vec<Vec<String>> = exact_svg_groups
        .values()
        .filter(|ids| ids.len() > 1)
        .cloned()
        .collect();
    let exact_duplicate_count: usize = duplicate_groups
        .iter()
        .map(|ids| ids.len().saturating_sub(1))
        .sum();

    let sample_index_path = config.out_dir.join("sample-index.json");
    let hashes_path = config.out_dir.join("hashes.tsv");
    let contact_sheet_path = config.out_dir.join("contact-sheet.html");
    let report_path = config.out_dir.join("report.json");

    write_sample_index(&sample_index_path, &samples)?;
    write_hashes(&hashes_path, &samples)?;
    write_contact_sheet(&contact_sheet_path, &samples)?;

    let report = build_report(
        &config,
        &samples,
        exact_duplicate_count,
        &duplicate_groups,
        &sample_index_path,
        &hashes_path,
        &contact_sheet_path,
    );
    fs::write(
        &report_path,
        serde_json::to_string_pretty(&report).map_err(|err| err.to_string())?,
    )
    .map_err(|err| format!("write {}: {err}", report_path.display()))?;

    let blockers = report
        .get("blockers")
        .and_then(Value::as_array)
        .map_or(0, Vec::len);
    println!(
        "Generated {} Art QA samples in {}",
        samples.len(),
        config.out_dir.display()
    );
    println!("Report: {}", report_path.display());
    println!("Contact sheet: {}", contact_sheet_path.display());
    println!("Exact duplicate count: {exact_duplicate_count}");

    if blockers > 0 {
        Err(format!(
            "{blockers} Art QA blocker(s) recorded in report.json"
        ))
    } else {
        Ok(())
    }
}

fn style_params_for(index: usize, theme_name: &str) -> String {
    let omitted_category = index % CORE_VALUE_KEYS.len();
    let theme_index = index % THEMES.len();
    let mut parts = vec![format!("theme={theme_name}")];
    for (category_index, (_category, style_key, values)) in CORE_VALUE_KEYS.iter().enumerate() {
        if category_index == omitted_category {
            continue;
        }
        let value = values[(index / CORE_VALUE_KEYS.len() + category_index + theme_index) % 4];
        parts.push(format!("{style_key}={value}"));
    }
    parts.join(";")
}

fn render_svg(
    theme: ArtTheme,
    seed: &[u8],
    traits: BlendedSoulTraitSet,
) -> Result<Vec<u8>, pinocchio::error::ProgramError> {
    let mut buf = [0u8; LAST_SVG_CAPACITY];
    let len = render_builtin_art_theme_with_traits(theme, seed, traits, &mut buf)?;
    Ok(buf[..len].to_vec())
}

fn build_report(
    config: &Config,
    samples: &[SampleMetrics],
    exact_duplicate_count: usize,
    duplicate_groups: &[Vec<String>],
    sample_index_path: &Path,
    hashes_path: &Path,
    contact_sheet_path: &Path,
) -> Value {
    let mut blockers = Vec::new();
    if samples.len() < MIN_SAMPLE_COUNT {
        blockers.push(format!(
            "sample_count_below_minimum: {} < {MIN_SAMPLE_COUNT}",
            samples.len()
        ));
    }
    if exact_duplicate_count != 0 {
        blockers.push(format!(
            "normal_seed_sweep_exact_duplicates: {exact_duplicate_count}"
        ));
    }
    if let Some(sample) = samples.iter().find(|sample| !sample.safe_standard_visible) {
        blockers.push(format!(
            "unsafe_or_invisible_svg: {} ({})",
            sample.id, sample.path
        ));
    }
    if let Some(sample) = samples
        .iter()
        .find(|sample| sample.byte_len >= LAST_SVG_CAPACITY)
    {
        blockers.push(format!(
            "svg_over_storage_cap: {} has {} bytes",
            sample.id, sample.byte_len
        ));
    }

    let theme_counts = theme_counts(samples);
    let min_theme_count = samples.len() / THEME_MIN_FRACTION_DIVISOR;
    for (_, theme_name, _) in THEMES {
        if theme_counts.get(theme_name).copied().unwrap_or_default() < min_theme_count {
            blockers.push(format!(
                "theme_coverage_below_threshold: {theme_name} has {}, threshold {min_theme_count}",
                theme_counts.get(theme_name).copied().unwrap_or_default()
            ));
        }
    }

    let trait_distribution = trait_distribution(samples);
    let min_trait_value_count = samples.len() / TRAIT_MIN_FRACTION_DIVISOR;
    for (category, values) in &trait_distribution {
        for value in expected_core_values(category) {
            if values.get(value).copied().unwrap_or_default() < min_trait_value_count {
                blockers.push(format!(
                    "trait_distribution_below_threshold: {category}.{value} has {}, threshold {min_trait_value_count}",
                    values.get(value).copied().unwrap_or_default()
                ));
            }
        }
    }

    let byte_lengths: Vec<usize> = samples.iter().map(|sample| sample.byte_len).collect();
    let primitive_counts: Vec<usize> = samples
        .iter()
        .map(|sample| sample.visible_primitives)
        .collect();
    let mut representative_paths = BTreeMap::new();
    for (_, theme_name, _) in THEMES {
        if let Some(sample) = samples.iter().find(|sample| sample.theme == theme_name) {
            representative_paths.insert(theme_name, sample.path.clone());
        }
    }

    json!({
        "feature": "artqa-batch-sample-metrics",
        "generator": "cargo run -p soul-generator --example art_qa_batch_sample -- --samples 240 --out evidence/art-qa",
        "determinism": {
            "randomness": "none",
            "seedScheme": "solsoul-artqa-batch-v1:{index}:{theme}",
            "generatedAt": "deterministic-artqa-v1"
        },
        "sampleCount": samples.len(),
        "minimumSampleCount": MIN_SAMPLE_COUNT,
        "overall": if blockers.is_empty() { "pass" } else { "blocker" },
        "blockers": blockers,
        "thresholds": {
            "minSamples": MIN_SAMPLE_COUNT,
            "byteCapExclusive": LAST_SVG_CAPACITY,
            "exactDuplicateCount": 0,
            "minThemeCount": min_theme_count,
            "minCoreTraitValueCount": min_trait_value_count,
            "visiblePrimitiveCount": "> 0",
            "themeTolerance": format!("each built-in theme must appear at least floor(sampleCount/{THEME_MIN_FRACTION_DIVISOR}) times"),
            "traitDistributionTolerance": format!("each final core trait value must appear at least floor(sampleCount/{TRAIT_MIN_FRACTION_DIVISOR}) times")
        },
        "artifacts": {
            "report": make_relative_path(&config.out_dir, &config.out_dir.join("report.json")),
            "sampleIndex": make_relative_path(&config.out_dir, sample_index_path),
            "contactSheet": make_relative_path(&config.out_dir, contact_sheet_path),
            "hashes": make_relative_path(&config.out_dir, hashes_path),
            "sampleDirectory": "batch-samples"
        },
        "themeCoverage": {
            "expectedThemes": THEMES.iter().map(|(_, name, _)| *name).collect::<Vec<_>>(),
            "counts": theme_counts,
            "representativeArtifactPaths": representative_paths
        },
        "coreTraitDistribution": trait_distribution,
        "duplicateMetrics": {
            "exactDuplicateCount": exact_duplicate_count,
            "uniqueSvgCount": samples.len().saturating_sub(exact_duplicate_count),
            "duplicateGroups": duplicate_groups
        },
        "byteLengths": summarize_usize(&byte_lengths),
        "primitiveVisibilityMetrics": {
            "visiblePrimitiveCounts": summarize_usize(&primitive_counts),
            "samplesWithZeroVisiblePrimitives": samples.iter().filter(|sample| sample.visible_primitives == 0).count(),
            "samplesWithOpacityZero": samples.iter().filter(|sample| sample.opacity_zero_count > 0).count(),
            "samplesFailingStandardVisibleHeuristic": samples.iter().filter(|sample| !sample.safe_standard_visible).count()
        },
        "samples": samples.iter().map(sample_json).collect::<Vec<_>>()
    })
}

fn write_sample_index(path: &Path, samples: &[SampleMetrics]) -> Result<(), String> {
    let index = json!({
        "feature": "artqa-batch-sample-metrics",
        "sampleCount": samples.len(),
        "samples": samples.iter().map(sample_json).collect::<Vec<_>>()
    });
    fs::write(
        path,
        serde_json::to_string_pretty(&index).map_err(|err| err.to_string())?,
    )
    .map_err(|err| format!("write {}: {err}", path.display()))
}

fn write_hashes(path: &Path, samples: &[SampleMetrics]) -> Result<(), String> {
    let mut hashes = String::from("id\ttheme\thash_fnv64\tbyte_length\tpath\n");
    for sample in samples {
        hashes.push_str(&format!(
            "{}\t{}\t{}\t{}\t{}\n",
            sample.id, sample.theme, sample.hash, sample.byte_len, sample.path
        ));
    }
    fs::write(path, hashes).map_err(|err| format!("write {}: {err}", path.display()))
}

fn write_contact_sheet(path: &Path, samples: &[SampleMetrics]) -> Result<(), String> {
    let mut html = String::from(
        r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SolSoul Art QA Contact Sheet</title>
  <style>
    :root { color-scheme: dark; background: #050505; color: #f5f5f0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; padding: 24px; background: radial-gradient(circle at top left, rgba(20, 241, 149, 0.12), transparent 35%), #050505; }
    header { max-width: 980px; margin-bottom: 24px; }
    h1 { margin: 0 0 8px; font-size: clamp(28px, 4vw, 48px); letter-spacing: -0.04em; }
    p { color: #b8b8ad; line-height: 1.5; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(164px, 1fr)); gap: 14px; }
    figure { margin: 0; border: 1px solid rgba(255,255,255,0.1); border-radius: 18px; overflow: hidden; background: rgba(255,255,255,0.04); box-shadow: 0 16px 44px rgba(0,0,0,0.24); }
    img { display: block; width: 100%; aspect-ratio: 1 / 1; object-fit: contain; background: #050505; }
    figcaption { padding: 10px 12px 12px; font-size: 11px; color: #d8d8cf; display: grid; gap: 3px; }
    code { color: #14f195; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
    .muted { color: #8f8f85; }
  </style>
</head>
<body>
  <header>
    <h1>SolSoul Art QA Contact Sheet</h1>
    <p>Deterministic batch samples across every built-in theme, seed sweep, and core trait category. Open the linked SVGs directly for detailed inspection; metrics live in <code>report.json</code>.</p>
  </header>
  <main class="grid">
"#,
    );
    for sample in samples {
        html.push_str("    <figure>\n");
        html.push_str(&format!(
            "      <img src=\"{}\" alt=\"{} {} sample\">\n",
            html_escape(&sample.path),
            html_escape(sample.theme_display),
            html_escape(&sample.id)
        ));
        html.push_str("      <figcaption>\n");
        html.push_str(&format!(
            "        <strong>{}</strong><span>{}</span>\n",
            html_escape(sample.theme_display),
            html_escape(&sample.id)
        ));
        html.push_str(&format!(
            "        <span class=\"muted\">{} bytes · {} primitives</span>\n",
            sample.byte_len, sample.visible_primitives
        ));
        html.push_str(&format!(
            "        <code>{}</code>\n",
            html_escape(&sample.hash)
        ));
        html.push_str("      </figcaption>\n");
        html.push_str("    </figure>\n");
    }
    html.push_str("  </main>\n</body>\n</html>\n");
    fs::write(path, html).map_err(|err| format!("write {}: {err}", path.display()))
}

fn sample_json(sample: &SampleMetrics) -> Value {
    json!({
        "id": sample.id,
        "theme": sample.theme,
        "seed": sample.seed,
        "styleParams": sample.style_params,
        "path": sample.path,
        "hashFnv64": sample.hash,
        "byteLength": sample.byte_len,
        "visiblePrimitives": sample.visible_primitives,
        "primitiveCounts": {
            "rect": sample.rects,
            "circle": sample.circles,
            "path": sample.paths,
            "polygon": sample.polygons,
            "line": sample.lines
        },
        "visibilityHeuristics": {
            "safeStandardVisible": sample.safe_standard_visible,
            "opacityZeroCount": sample.opacity_zero_count
        },
        "finalCoreTraits": {
            "palette": sample.traits.core.palette,
            "mood": sample.traits.core.mood,
            "form": sample.traits.core.form,
            "background": sample.traits.core.background
        },
        "generatedDefaultTraits": {
            "characterArchetype": sample.traits.defaults.character_archetype,
            "gogglesEyes": sample.traits.defaults.goggles_eyes,
            "expression": sample.traits.defaults.expression,
            "gasAuraCloud": sample.traits.defaults.gas_aura_cloud,
            "background": sample.traits.defaults.background,
            "outfit": sample.traits.defaults.outfit,
            "relic": sample.traits.defaults.relic,
            "animationBehavior": sample.traits.defaults.animation_behavior,
            "gasLevel": sample.traits.defaults.gas_level
        }
    })
}

fn theme_counts(samples: &[SampleMetrics]) -> BTreeMap<&'static str, usize> {
    let mut counts = BTreeMap::new();
    for (_, theme_name, _) in THEMES {
        counts.insert(theme_name, 0);
    }
    for sample in samples {
        *counts.entry(sample.theme).or_insert(0) += 1;
    }
    counts
}

fn trait_distribution(
    samples: &[SampleMetrics],
) -> BTreeMap<&'static str, BTreeMap<&'static str, usize>> {
    let mut distribution = BTreeMap::new();
    for category in CORE_ART_TRAIT_CATEGORIES {
        let mut counts = BTreeMap::new();
        for option in category.options {
            counts.insert(option.id, 0);
        }
        distribution.insert(category.id, counts);
    }
    for sample in samples {
        *distribution
            .get_mut("palette")
            .expect("palette distribution")
            .entry(sample.traits.core.palette)
            .or_insert(0) += 1;
        *distribution
            .get_mut("mood")
            .expect("mood distribution")
            .entry(sample.traits.core.mood)
            .or_insert(0) += 1;
        *distribution
            .get_mut("form")
            .expect("form distribution")
            .entry(sample.traits.core.form)
            .or_insert(0) += 1;
        *distribution
            .get_mut("background")
            .expect("background distribution")
            .entry(sample.traits.core.background)
            .or_insert(0) += 1;
    }
    distribution
}

fn expected_core_values(category: &str) -> &'static [&'static str; 4] {
    CORE_VALUE_KEYS
        .iter()
        .find(|(id, _, _)| *id == category)
        .map(|(_, _, values)| values)
        .expect("known core trait category")
}

fn summarize_usize(values: &[usize]) -> Value {
    if values.is_empty() {
        return json!({
            "min": 0,
            "max": 0,
            "average": 0.0,
            "p50": 0,
            "p95": 0
        });
    }
    let mut sorted = values.to_vec();
    sorted.sort_unstable();
    let sum: usize = sorted.iter().sum();
    json!({
        "min": sorted[0],
        "max": sorted[sorted.len() - 1],
        "average": sum as f64 / sorted.len() as f64,
        "p50": percentile(&sorted, 50),
        "p95": percentile(&sorted, 95)
    })
}

fn percentile(sorted: &[usize], percentile: usize) -> usize {
    let index = ((sorted.len().saturating_sub(1)) * percentile) / 100;
    sorted[index]
}

fn count_visible_primitives(svg: &str) -> usize {
    svg.matches("<circle").count()
        + svg.matches("<path").count()
        + svg.matches("<polygon").count()
        + svg.matches("<line").count()
        + svg.matches("<rect").count().saturating_sub(1)
}

fn is_safe_standard_visible(theme: ArtTheme, svg: &str, len: usize) -> bool {
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

fn fnv64(bytes: &[u8]) -> u64 {
    let mut hash = 0xcbf2_9ce4_8422_2325u64;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

fn make_relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn html_escape(input: &str) -> String {
    let mut escaped = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&#39;"),
            _ => escaped.push(ch),
        }
    }
    escaped
}
