use super::blueprint::{BaseParams, EvolutionState};
use alloc::vec::Vec;
use libm::{cos, sin};
use pinocchio::error::ProgramError;

struct SvgWriter<'a> {
    buf: &'a mut [u8],
    len: usize,
}

impl<'a> SvgWriter<'a> {
    fn new(buf: &'a mut [u8]) -> Self {
        Self { buf, len: 0 }
    }

    fn write_str(&mut self, value: &str) -> Result<(), ProgramError> {
        self.write_bytes(value.as_bytes())
    }

    fn write_bytes(&mut self, value: &[u8]) -> Result<(), ProgramError> {
        let end = self
            .len
            .checked_add(value.len())
            .ok_or(ProgramError::ArithmeticOverflow)?;
        if end > self.buf.len() {
            return Err(ProgramError::AccountDataTooSmall);
        }
        self.buf[self.len..end].copy_from_slice(value);
        self.len = end;
        Ok(())
    }

    fn write_u16(&mut self, value: u16) -> Result<(), ProgramError> {
        if value == 0 {
            return self.write_bytes(b"0");
        }
        let mut digits = [0u8; 5];
        let mut cursor = digits.len();
        let mut remaining = value;
        while remaining > 0 {
            cursor -= 1;
            digits[cursor] = b'0' + (remaining % 10) as u8;
            remaining /= 10;
        }
        self.write_bytes(&digits[cursor..])
    }
}

fn seed_hash(seed: &[u8]) -> u64 {
    let mut hash = 0xcbf2_9ce4_8422_2325u64;
    let mut index = 0usize;
    while index < seed.len() {
        hash ^= seed[index] as u64;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
        hash ^= (index as u64).rotate_left((index % 31) as u32);
        index += 1;
    }
    hash
}

fn palette_from_seed(seed: &[u8]) -> (&'static str, &'static str, &'static str) {
    let hash = seed_hash(seed);
    let palettes: [(&str, &str, &str); 4] = [
        ("#020617", "#e5e7eb", "#14f195"),
        ("#050816", "#c4b5fd", "#9945ff"),
        ("#09090b", "#ecfeff", "#00d9ff"),
        ("#08111f", "#f8fafc", "#22c55e"),
    ];
    palettes[(hash % 4) as usize]
}

fn pixel_fractal_palette(hash: u64) -> (&'static str, &'static str, &'static str, &'static str) {
    const PALETTES: [(&str, &str, &str, &str); 4] = [
        ("#050816", "#e9d5ff", "#14f195", "#2563eb"),
        ("#020617", "#ccfbf1", "#9945ff", "#0891b2"),
        ("#09090b", "#f8fafc", "#00d9ff", "#7c3aed"),
        ("#08111f", "#ecfeff", "#ff6a3d", "#22c55e"),
    ];
    PALETTES[(hash % PALETTES.len() as u64) as usize]
}

fn generate_ifs_transforms(hash: u64) -> [(f64, f64, f64, f64, f64, f64); 4] {
    let scale = 0.4 + ((hash % 20) as f64 / 100.0);
    let rotation = ((hash >> 8) % 360) as f64 * core::f64::consts::PI / 180.0;
    let cos_r = cos(rotation) * scale;
    let sin_r = sin(rotation) * scale;

    [
        (cos_r, -sin_r, sin_r, cos_r, 0.0, 0.0),
        (cos_r, sin_r, -sin_r, cos_r, 128.0, 0.0),
        (cos_r, -sin_r, sin_r, cos_r, 64.0, 128.0),
        (scale, 0.0, 0.0, scale, 128.0, 128.0),
    ]
}

fn iterate_ifs(
    transforms: &[(f64, f64, f64, f64, f64, f64); 4],
    iterations: usize,
    hash: u64,
) -> Vec<(f64, f64)> {
    let mut points = Vec::with_capacity(iterations);
    let mut x = 0.0;
    let mut y = 0.0;

    let mut rng = hash;

    for _ in 0..iterations {
        rng = rng
            .wrapping_mul(0x0000_0100_0000_01b3)
            .wrapping_add(0xcbf2_9ce4_8422_2325);
        let transform = &transforms[(rng % 4) as usize];

        let new_x = transform.0 * x + transform.1 * y + transform.4;
        let new_y = transform.2 * x + transform.3 * y + transform.5;

        x = new_x;
        y = new_y;

        if x.is_finite() && y.is_finite() {
            points.push((x, y));
        }
    }

    points
}

fn normalize_points(points: &[(f64, f64)]) -> Vec<(u16, u16)> {
    if points.is_empty() {
        return Vec::new();
    }

    let min_x = points.iter().map(|p| p.0).fold(f64::INFINITY, f64::min);
    let max_x = points.iter().map(|p| p.0).fold(f64::NEG_INFINITY, f64::max);
    let min_y = points.iter().map(|p| p.1).fold(f64::INFINITY, f64::min);
    let max_y = points.iter().map(|p| p.1).fold(f64::NEG_INFINITY, f64::max);

    let range_x = max_x - min_x;
    let range_y = max_y - min_y;
    let range = range_x.max(range_y).max(1.0);

    let offset_x = (256.0 - (range_x / range) * 240.0) / 2.0;
    let offset_y = (256.0 - (range_y / range) * 240.0) / 2.0;

    points
        .iter()
        .map(|(x, y)| {
            let nx = ((*x - min_x) / range * 240.0 + offset_x) as u16;
            let ny = ((*y - min_y) / range * 240.0 + offset_y) as u16;
            (nx.min(255), ny.min(255))
        })
        .collect()
}

pub fn generate_fractal_svg(
    seed: &[u8],
    _params: &BaseParams,
    _evolution: &EvolutionState,
    buf: &mut [u8],
) -> Result<usize, ProgramError> {
    const MAX_POINTS: usize = 44;
    const CONTOUR_LINES: usize = 6;

    let hash = seed_hash(seed);
    let (bg, fg, accent) = palette_from_seed(seed);
    let transforms = generate_ifs_transforms(hash);
    let points = iterate_ifs(&transforms, 3000, hash);
    let normalized = normalize_points(&points);

    let mut out = SvgWriter::new(buf);

    out.write_str("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" width=\"256\" height=\"256\">")?;
    out.write_str("<rect width=\"256\" height=\"256\" fill=\"")?;
    out.write_str(bg)?;
    out.write_str("\"/>")?;

    // Compact interior glow keeps dark-dominant seeds from reading as flat
    // black panels while remaining deterministic and byte-light.
    out.write_str("<circle cx=\"128\" cy=\"128\" r=\"")?;
    out.write_u16(62 + ((hash >> 16) % 18) as u16)?;
    out.write_str("\" fill=\"")?;
    out.write_str(accent)?;
    out.write_str("\" opacity=\"0.18\"/>")?;

    // Select a deterministic spread of unique attractor points instead of the
    // first converged IFS samples, which often collapse into duplicate edge
    // dots. These points become both visible particles and contour anchors.
    let mut selected = [(0u16, 0u16); MAX_POINTS];
    let mut selected_count = 0usize;
    let mut attempt = 0usize;
    let start = (hash as usize) % normalized.len().max(1);
    while attempt < normalized.len() && selected_count < MAX_POINTS {
        let index = (start + attempt * 73) % normalized.len();
        let (x, y) = normalized[index];
        let mut distinct = true;
        let mut previous = 0usize;
        while previous < selected_count {
            let (px, py) = selected[previous];
            let dx = x.abs_diff(px);
            let dy = y.abs_diff(py);
            if dx + dy < 5 {
                distinct = false;
                break;
            }
            previous += 1;
        }
        if distinct {
            selected[selected_count] = (x, y);
            selected_count += 1;
        }
        attempt += 1;
    }
    while selected_count < 18 {
        let angle =
            ((hash >> 8) as f64 + (selected_count as f64 * 137.5)) * core::f64::consts::PI / 180.0;
        let radius = 34.0 + ((hash >> (selected_count % 24)) % 44) as f64;
        let x = (128.0 + cos(angle) * radius).clamp(12.0, 244.0) as u16;
        let y = (128.0 + sin(angle) * radius).clamp(12.0, 244.0) as u16;
        selected[selected_count] = (x, y);
        selected_count += 1;
    }

    if selected_count >= 2 {
        let mut line = 0usize;
        while line < CONTOUR_LINES && line + 1 < selected_count {
            let a = (line * 7) % selected_count;
            let b = (a + selected_count / 2 + line) % selected_count;
            let (x1, y1) = selected[a];
            let (x2, y2) = selected[b];
            out.write_str("<line x1=\"")?;
            out.write_u16(x1)?;
            out.write_str("\" y1=\"")?;
            out.write_u16(y1)?;
            out.write_str("\" x2=\"")?;
            out.write_u16(x2)?;
            out.write_str("\" y2=\"")?;
            out.write_u16(y2)?;
            out.write_str("\" stroke=\"")?;
            out.write_str(accent)?;
            out.write_str("\" stroke-width=\"1\" opacity=\"0.5\"/>")?;
            line += 1;
        }
    }

    let mut i = 0usize;
    while i < selected_count {
        let (x, y) = selected[i];
        let size = if i.is_multiple_of(11) { 2u16 } else { 1u16 };
        let color = if i.is_multiple_of(5) { accent } else { fg };

        out.write_str("<circle cx=\"")?;
        out.write_u16(x)?;
        out.write_str("\" cy=\"")?;
        out.write_u16(y)?;
        out.write_str("\" r=\"")?;
        out.write_u16(size)?;
        out.write_str("\" fill=\"")?;
        out.write_str(color)?;
        out.write_str("\"/>")?;

        i += 1;
    }

    out.write_str("</svg>")?;

    Ok(out.len)
}

fn add_pixel_fractal_score(grid: &mut [[u16; 32]; 32], gx: i16, gy: i16, value: u16) {
    if (0..32).contains(&gx) && (0..32).contains(&gy) {
        let cell = &mut grid[gy as usize][gx as usize];
        *cell = cell.saturating_add(value);
    }
}

/// Pixel-art variant of the IFS fractal.
/// Same deterministic IFS math, but renders as 8×8 pixel blocks aligned to a grid.
pub fn generate_fractal_pixel_svg(
    seed: &[u8],
    _params: &BaseParams,
    _evolution: &EvolutionState,
    buf: &mut [u8],
) -> Result<usize, ProgramError> {
    const GRID_SIZE: u16 = 32; // 32×32 pixel grid
    const PIXEL_SIZE: u16 = 8; // each cell is 8×8 (32*8 = 256)
    const VIEWBOX: u16 = 256;
    const MAX_RENDERED_CELLS: usize = 58;

    let hash = seed_hash(seed);
    let (bg, fg, accent, glow) = pixel_fractal_palette(hash);
    let transforms = generate_ifs_transforms(hash);
    let points = iterate_ifs(&transforms, 3000, hash);
    let normalized = normalize_points(&points);

    // Bucket points into a scored 32×32 grid, then add deterministic neighboring
    // contour weight. The original one-bit occupancy often left only a handful
    // of isolated blocks; the score field keeps the same IFS attractor while
    // adding premium pixel-glow density and visible interior structure.
    let mut grid = [[0u16; GRID_SIZE as usize]; GRID_SIZE as usize];
    for (nx, ny) in normalized {
        let gx = (nx / PIXEL_SIZE).min(GRID_SIZE - 1) as i16;
        let gy = (ny / PIXEL_SIZE).min(GRID_SIZE - 1) as i16;
        add_pixel_fractal_score(&mut grid, gx, gy, 8);
        add_pixel_fractal_score(&mut grid, gx - 1, gy, 3);
        add_pixel_fractal_score(&mut grid, gx + 1, gy, 3);
        add_pixel_fractal_score(&mut grid, gx, gy - 1, 3);
        add_pixel_fractal_score(&mut grid, gx, gy + 1, 3);
        add_pixel_fractal_score(&mut grid, gx - 1, gy - 1, 1);
        add_pixel_fractal_score(&mut grid, gx + 1, gy - 1, 1);
        add_pixel_fractal_score(&mut grid, gx - 1, gy + 1, 1);
        add_pixel_fractal_score(&mut grid, gx + 1, gy + 1, 1);

        // Low-weight mirrored echoes turn edge-heavy attractors into a balanced
        // premium pixel field instead of leaving large blank quadrants.
        let mx = (GRID_SIZE - 1) as i16 - gx;
        let my = (GRID_SIZE - 1) as i16 - gy;
        add_pixel_fractal_score(&mut grid, mx, my, 2);
        add_pixel_fractal_score(&mut grid, mx, gy, 1);
        add_pixel_fractal_score(&mut grid, gx, my, 1);
    }

    let mut out = SvgWriter::new(buf);
    out.write_str("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 ")?;
    out.write_u16(VIEWBOX)?;
    out.write_str(" ")?;
    out.write_u16(VIEWBOX)?;
    out.write_str("\" width=\"")?;
    out.write_u16(VIEWBOX)?;
    out.write_str("\" height=\"")?;
    out.write_u16(VIEWBOX)?;
    out.write_str("\" shape-rendering=\"crispEdges\">")?;

    // Background
    out.write_str("<rect width=\"")?;
    out.write_u16(VIEWBOX)?;
    out.write_str("\" height=\"")?;
    out.write_u16(VIEWBOX)?;
    out.write_str("\" fill=\"")?;
    out.write_str(bg)?;
    out.write_str("\"/>")?;

    // Pixel blocks. Iterate from a seed-derived offset so the byte-stable cap
    // does not bias every dense attractor toward the top-left of the grid.
    let mut rendered = [[false; GRID_SIZE as usize]; GRID_SIZE as usize];
    let start = (hash % 1024) as usize;
    let thresholds = [9u16, 6, 3, 1];
    let mut threshold_index = 0usize;
    let mut drawn = 0usize;
    while threshold_index < thresholds.len() && drawn < MAX_RENDERED_CELLS {
        let threshold = thresholds[threshold_index];
        let mut step = 0usize;
        while step < 1024 && drawn < MAX_RENDERED_CELLS {
            let index = (start + step * 37) % 1024;
            let gx = index % GRID_SIZE as usize;
            let gy = index / GRID_SIZE as usize;
            let score = grid[gy][gx];
            if score >= threshold && !rendered[gy][gx] {
                rendered[gy][gx] = true;
                drawn += 1;

                let cell_hash = hash
                    .wrapping_add((gx as u64).wrapping_mul(31))
                    .wrapping_add((gy as u64).wrapping_mul(97));
                let color = if score >= 18 || cell_hash.is_multiple_of(11) {
                    accent
                } else if score >= 9 {
                    fg
                } else {
                    glow
                };

                let x = (gx as u16) * PIXEL_SIZE;
                let y = (gy as u16) * PIXEL_SIZE;
                out.write_str("<rect x=\"")?;
                out.write_u16(x)?;
                out.write_str("\" y=\"")?;
                out.write_u16(y)?;
                out.write_str("\" width=\"")?;
                out.write_u16(PIXEL_SIZE)?;
                out.write_str("\" height=\"")?;
                out.write_u16(PIXEL_SIZE)?;
                out.write_str("\" fill=\"")?;
                out.write_str(color)?;
                out.write_str("\"/>")?;
            }
            step += 1;
        }
        threshold_index += 1;
    }

    out.write_str("</svg>")?;
    Ok(out.len)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::LAST_SVG_CAPACITY;
    use std::{str, vec::Vec};

    fn render(seed: &[u8]) -> Vec<u8> {
        let mut buf = [0u8; LAST_SVG_CAPACITY];
        let params = BaseParams {
            dimensionality: 30,
            projection: 0,
            depth: 50,
            fundamental: 50,
            overtones: 3,
            decay: 0,
            entropy: 50,
            reserved: 0,
        };
        let evolution = EvolutionState::default();
        let len =
            generate_fractal_svg(seed, &params, &evolution, &mut buf).expect("fractal renders");
        buf[..len].to_vec()
    }

    #[test]
    fn same_seed_produces_same_fractal_svg() {
        assert_eq!(render(b"fractal-test-seed"), render(b"fractal-test-seed"));
    }

    #[test]
    fn different_seeds_produce_different_fractal_svgs() {
        let first = render(b"fractal-seed-a");
        let second = render(b"fractal-seed-b");
        assert_ne!(first, second);
    }

    #[test]
    fn fractal_svg_is_valid_and_bounded() {
        let rendered = render(b"fractal-budget-test");
        let svg = str::from_utf8(&rendered).expect("valid utf8");

        assert!(svg.starts_with("<svg"));
        assert!(svg.ends_with("</svg>"));
        assert!(svg.contains("<circle"));
        assert!(rendered.len() <= LAST_SVG_CAPACITY);
        let lower = svg.to_ascii_lowercase();
        assert!(!lower.contains("url("));
        assert!(!lower.contains("<script"));
        assert!(!lower.contains("<image"));
    }

    #[test]
    fn fractal_weak_review_samples_have_premium_dark_structure() {
        for seed in [
            b"solsoul-artqa-batch-v1:000:fractal".as_slice(),
            b"solsoul-artqa-batch-v1:072:fractal".as_slice(),
            b"solsoul-artqa-batch-v1:160:fractal".as_slice(),
        ] {
            let rendered = render(seed);
            let svg = str::from_utf8(&rendered).expect("valid utf8");

            assert!(
                !svg.contains("fill=\"#f5f5f0\""),
                "fractal should keep a black-gallery background instead of light flat forms: {svg}"
            );
            assert!(
                svg.matches("<line").count() >= 6,
                "fractal weak-review samples should include visible contour structure: {svg}"
            );
            assert!(
                svg.contains("opacity=\"0.18\""),
                "fractal should include compact interior glow to make sparse dark forms intentional: {svg}"
            );
            assert!(
                rendered.len() <= LAST_SVG_CAPACITY,
                "fractal must remain under byte cap"
            );
        }
    }

    fn render_pixel(seed: &[u8]) -> Vec<u8> {
        let mut buf = [0u8; LAST_SVG_CAPACITY];
        let params = BaseParams {
            dimensionality: 30,
            projection: 0,
            depth: 50,
            fundamental: 50,
            overtones: 3,
            decay: 0,
            entropy: 50,
            reserved: 0,
        };
        let evolution = EvolutionState::default();
        let len = generate_fractal_pixel_svg(seed, &params, &evolution, &mut buf)
            .expect("pixel fractal renders");
        buf[..len].to_vec()
    }

    #[test]
    fn pixel_fractal_same_seed_produces_same_output() {
        assert_eq!(
            render_pixel(b"pixel-fractal-seed"),
            render_pixel(b"pixel-fractal-seed")
        );
    }

    #[test]
    fn pixel_fractal_different_seeds_produce_different_output() {
        let first = render_pixel(b"seed-a");
        let second = render_pixel(b"seed-b");
        assert_ne!(first, second);
    }

    #[test]
    fn pixel_fractal_uses_rect_instead_of_circle() {
        let rendered = render_pixel(b"pixel-test");
        let svg = str::from_utf8(&rendered).expect("valid utf8");
        assert!(svg.starts_with("<svg"));
        assert!(svg.ends_with("</svg>"));
        assert!(svg.contains("<rect"));
        assert!(!svg.contains("<circle"));
        assert!(rendered.len() <= LAST_SVG_CAPACITY);
    }

    #[test]
    fn pixel_fractal_blocks_aligned_to_grid() {
        let rendered = render_pixel(b"grid-align");
        let svg = str::from_utf8(&rendered).expect("valid utf8");
        // All x/y coordinates should be multiples of 8 (pixel size)
        for attr in [" x=\"", " y=\""] {
            let mut pos = 0;
            while let Some(start) = svg[pos..].find(attr) {
                let val_start = pos + start + attr.len();
                if let Some(end) = svg[val_start..].find('"') {
                    let val: u16 = svg[val_start..val_start + end].parse().unwrap();
                    assert_eq!(val % 8, 0, "coordinate must align to 8px grid: {}", val);
                    pos = val_start + end;
                } else {
                    break;
                }
            }
        }
    }

    #[test]
    fn pixel_fractal_weak_review_samples_have_premium_density() {
        for seed in [
            b"solsoul-artqa-batch-v1:117:pixelfractal".as_slice(),
            b"solsoul-artqa-batch-v1:101:pixelfractal".as_slice(),
            b"solsoul-artqa-batch-v1:125:pixelfractal".as_slice(),
        ] {
            let rendered = render_pixel(seed);
            let svg = str::from_utf8(&rendered).expect("valid utf8");
            let foreground_blocks = svg.matches("<rect").count().saturating_sub(1);
            assert!(
                foreground_blocks >= 32,
                "weak-review pixel fractal sample should have denser foreground blocks, got {foreground_blocks}: {svg}"
            );
            assert!(svg.contains("shape-rendering=\"crispEdges\""));
            assert!(
                rendered.len() <= LAST_SVG_CAPACITY,
                "pixel fractal must remain under byte cap"
            );
        }
    }
}
