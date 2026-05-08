use pinocchio::error::ProgramError;

/// Symphony renderer — maximum-quality pixel art within 4KB SVG budget.
/// Grid: 32×32 pixels, 8px each, 256×256 viewBox.
/// Strategy: background rect + foreground runs only, ultra-compact SVG.
struct CompactWriter<'a> {
    buf: &'a mut [u8],
    pos: usize,
}

impl<'a> CompactWriter<'a> {
    fn new(buf: &'a mut [u8]) -> Self {
        Self { buf, pos: 0 }
    }

    fn write(&mut self, bytes: &[u8]) -> Result<(), ProgramError> {
        let end = self
            .pos
            .checked_add(bytes.len())
            .ok_or(ProgramError::ArithmeticOverflow)?;
        if end > self.buf.len() {
            return Err(ProgramError::AccountDataTooSmall);
        }
        self.buf[self.pos..end].copy_from_slice(bytes);
        self.pos = end;
        Ok(())
    }

    fn write_str(&mut self, s: &str) -> Result<(), ProgramError> {
        self.write(s.as_bytes())
    }

    fn write_u16(&mut self, v: u16) -> Result<(), ProgramError> {
        if v < 10 {
            return self.write(&[b'0' + v as u8]);
        }
        let mut d = [0u8; 5];
        let mut n = v;
        let mut i = d.len();
        while n > 0 {
            i -= 1;
            d[i] = b'0' + (n % 10) as u8;
            n /= 10;
        }
        self.write(&d[i..])
    }
}

fn seed_u64(seed: &[u8]) -> u64 {
    let mut h = 0xcbf2_9ce4_8422_2325u64;
    let mut i = 0usize;
    while i < seed.len() {
        h ^= seed[i] as u64;
        h = h.wrapping_mul(0x0100_0000_01b3);
        h ^= (i as u64).rotate_left(((i * 7) % 64) as u32);
        i += 1;
    }
    h
}

/// 16-color harmonic palette from seed.
fn palette(seed: &[u8]) -> [&'static str; 16] {
    let h = seed_u64(seed);
    let base: [[&str; 4]; 6] = [
        ["#020617", "#0f172a", "#9945ff", "#14f195"], // solana dusk
        ["#030712", "#111827", "#22d3ee", "#a78bfa"], // cyan violet
        ["#07111f", "#123047", "#2dd4bf", "#f97316"], // deep aurora
        ["#09090b", "#18181b", "#e879f9", "#67e8f9"], // black glass
        ["#04130d", "#0f2f24", "#22c55e", "#c084fc"], // emerald pulse
        ["#14031f", "#261047", "#7c3aed", "#5eead4"], // violet resonance
    ];
    let b = &base[(h % 6) as usize];
    [
        b[0], b[1], b[2], b[3], "#e5e7eb", "#38bdf8", "#10b981", "#8b5cf6", b[3], b[2], b[1],
        "#f59e0b", "#0ea5e9", "#a3e635", b[0], b[1],
    ]
}

/// 32×32 canvas. Each cell is a palette index 0..=15.
struct Canvas {
    grid: [[u8; 32]; 32],
    bg: u8,
}

impl Canvas {
    fn new(bg: u8) -> Self {
        Self {
            grid: [[bg; 32]; 32],
            bg,
        }
    }

    fn rect(&mut self, x: i8, y: i8, w: i8, h: i8, color: u8) {
        let x0 = x.max(0) as usize;
        let y0 = y.max(0) as usize;
        let x1 = ((x + w).min(32)) as usize;
        let y1 = ((y + h).min(32)) as usize;
        let mut yy = y0;
        while yy < y1 {
            let mut xx = x0;
            while xx < x1 {
                self.grid[yy][xx] = color;
                xx += 1;
            }
            yy += 1;
        }
    }

    fn line(&mut self, x1: i8, y1: i8, x2: i8, y2: i8, color: u8) {
        let dx = (x2 - x1).abs();
        let dy = (y2 - y1).abs();
        let sx = if x1 < x2 { 1 } else { -1 };
        let sy = if y1 < y2 { 1 } else { -1 };
        let mut err = dx - dy;
        let mut x = x1;
        let mut y = y1;
        loop {
            if (0..32).contains(&x) && (0..32).contains(&y) {
                self.grid[y as usize][x as usize] = color;
            }
            if x == x2 && y == y2 {
                break;
            }
            let e2 = 2 * err;
            if e2 > -dy {
                err -= dy;
                x += sx;
            }
            if e2 < dx {
                err += dx;
                y += sy;
            }
        }
    }

    fn pixel(&mut self, x: i8, y: i8, color: u8) {
        if (0..32).contains(&x) && (0..32).contains(&y) {
            self.grid[y as usize][x as usize] = color;
        }
    }

    fn ring(&mut self, cx: i8, cy: i8, r: i8, color: u8) {
        let outer = (r as i32) * (r as i32);
        let inner_radius = (r - 2).max(0) as i32;
        let inner = inner_radius * inner_radius;
        let mut yy = 0i8;
        while yy < 32 {
            let mut xx = 0i8;
            while xx < 32 {
                let dx = (xx as i32) - (cx as i32);
                let dy = (yy as i32) - (cy as i32);
                let d = dx * dx + dy * dy;
                if d <= outer && d >= inner {
                    self.grid[yy as usize][xx as usize] = color;
                }
                xx += 1;
            }
            yy += 1;
        }
    }
}

/// Abstract audio-reactive motifs determined by seed.
#[derive(Clone, Copy)]
enum AudioMode {
    Spectrum,
    Pulse,
    Resonance,
    Waveform,
    Nebula,
}

fn mode_from_seed(seed: &[u8]) -> AudioMode {
    match seed_u64(seed) % 5 {
        0 => AudioMode::Spectrum,
        1 => AudioMode::Pulse,
        2 => AudioMode::Resonance,
        3 => AudioMode::Waveform,
        _ => AudioMode::Nebula,
    }
}

fn wave_y(h: u64, x: i8, lane: i8, amplitude: i8) -> i8 {
    let lane_index = (lane + 1) as u32;
    let phase = ((h >> (lane_index * 9)) & 31) as i8;
    let period = 8 + (((h >> (lane_index * 5)) & 7) as i8);
    let mut t = (x + phase) % period;
    if t < 0 {
        t += period;
    }
    let half = (period / 2).max(1);
    let tri = if t < half { t } else { period - t };
    16 + lane * 4 + ((tri * amplitude) / half) - amplitude / 2
}

/// Compose an abstract spectral field into the canvas.
fn compose(mode: AudioMode, seed: &[u8], canvas: &mut Canvas) {
    let h = seed_u64(seed);
    // Ambient low-frequency bands: enough structure to avoid blank fields while
    // preserving the black-gallery base.
    canvas.rect(0, 3, 32, 2, 1);
    canvas.rect(0, 27, 32, 2, 1);
    canvas.rect(0, 14, 32, 1, 10);

    // Mirrored spectrum bars along the lower and upper edges.
    let mut band = 0i8;
    while band < 6 {
        let bits = h.rotate_left((band as u32) * 3);
        let height = 3 + (bits % 9) as i8;
        let x = band * 5;
        let color = if band % 3 == 0 { 2 } else { 3 };
        canvas.rect(x, 32 - height, 4, height, color);
        band += 1;
    }

    // Three deterministic waveform lanes, deliberately abstract rather than
    // literal notes or scene illustration.
    let mut lane = -1i8;
    while lane <= 1 {
        let mut x = 0i8;
        let amp = 4 + (((h >> ((lane + 1) as u32 * 8)) & 3) as i8);
        let color = match lane {
            -1 => 3,
            0 => 4,
            _ => 5,
        };
        while x < 32 {
            let y = wave_y(h, x, lane, amp);
            canvas.pixel(x, y, color);
            canvas.pixel(x, y + 1, color);
            x += 3;
        }
        lane += 1;
    }

    let cx = 14 + (h % 5) as i8;
    let cy = 14 + ((h >> 7) % 5) as i8;
    canvas.ring(cx, cy, 6, 2);
    canvas.rect(cx - 2, cy - 1, 5, 2, 3);

    match mode {
        AudioMode::Spectrum => {
            canvas.line(3, 24, 28, 7, 6);
            canvas.line(4, 25, 29, 8, 8);
        }
        AudioMode::Pulse => {
            canvas.ring(16, 16, 10, 5);
            canvas.rect(13, 13, 6, 6, 3);
        }
        AudioMode::Resonance => {
            canvas.line(16, 3, 28, 16, 2);
            canvas.line(28, 16, 16, 29, 2);
            canvas.line(16, 29, 4, 16, 3);
            canvas.line(4, 16, 16, 3, 3);
        }
        AudioMode::Waveform => {
            let mut x = 0i8;
            while x < 32 {
                let y = 8 + ((x + (h % 7) as i8) % 5);
                canvas.pixel(x, y, 12);
                canvas.pixel(31 - x, 24 - (y - 8), 13);
                x += 2;
            }
        }
        AudioMode::Nebula => {
            let mut spark = 0u8;
            while spark < 8 {
                let mixed = h.wrapping_add((spark as u64 + 1) * 0x9e37_79b9);
                let sx = (mixed % 32) as i8;
                let sy = ((mixed >> 11) % 32) as i8;
                let color = 4 + (spark % 2);
                canvas.pixel(sx, sy, color);
                canvas.pixel(sx + 1, sy, color);
                spark += 1;
            }
        }
    }
}

/// Encode canvas to ultra-compact SVG.
fn encode_svg(canvas: &Canvas, pal: &[&str; 16], buf: &mut [u8]) -> Result<usize, ProgramError> {
    let mut out = CompactWriter::new(buf);

    out.write_str(
        r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" shape-rendering="crispEdges">"#,
    )?;

    // Background rect (dominant color)
    out.write_str(r#"<rect width="256" height="256" fill=""#)?;
    out.write_str(pal[canvas.bg as usize])?;
    out.write_str(r#""/>"#)?;

    // Collect foreground runs per color
    // For each color != bg, collect horizontal runs and emit as a group
    let mut color = 0u8;
    while color < 16 {
        if color == canvas.bg {
            color += 1;
            continue;
        }

        let mut first = true;
        let mut yy = 0usize;
        while yy < 32 {
            let mut xx = 0usize;
            while xx < 32 {
                if canvas.grid[yy][xx] == color {
                    // Start of run
                    let run_start = xx;
                    while xx < 32 && canvas.grid[yy][xx] == color {
                        xx += 1;
                    }
                    let run_len = xx - run_start;

                    if first {
                        out.write_str(r#"<path fill=""#)?;
                        out.write_str(pal[color as usize])?;
                        out.write_str(r#"" d=""#)?;
                        first = false;
                    }
                    out.write_str("M")?;
                    out.write_u16((run_start * 8) as u16)?;
                    out.write_str(" ")?;
                    out.write_u16((yy * 8) as u16)?;
                    out.write_str("h")?;
                    out.write_u16((run_len * 8) as u16)?;
                    out.write_str("v8H")?;
                    out.write_u16((run_start * 8) as u16)?;
                    out.write_str("z")?;
                } else {
                    xx += 1;
                }
            }
            yy += 1;
        }

        if !first {
            out.write_str(r#""/>"#)?;
        }
        color += 1;
    }

    out.write_str("</svg>")?;
    Ok(out.pos)
}

pub fn generate_symphony_svg(seed: &[u8], buf: &mut [u8]) -> Result<usize, ProgramError> {
    let pal = palette(seed);
    let mode = mode_from_seed(seed);
    let bg = 0;

    let mut canvas = Canvas::new(bg);
    compose(mode, seed, &mut canvas);
    encode_svg(&canvas, &pal, buf)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::LAST_SVG_CAPACITY;
    use std::{str, vec::Vec};

    fn render(seed: &[u8]) -> Vec<u8> {
        let mut buf = [0u8; LAST_SVG_CAPACITY];
        let len = generate_symphony_svg(seed, &mut buf).expect("symphony_renders");
        buf[..len].to_vec()
    }

    #[test]
    fn same_seed_same_output() {
        assert_eq!(render(b"symphony_1"), render(b"symphony_1"));
    }

    #[test]
    fn different_seeds_different() {
        let a = render(b"seed_a");
        let b = render(b"seed_b");
        assert_ne!(a, b);
    }

    #[test]
    fn svg_valid_and_bounded() {
        let svg = render(b"symphony_budget");
        let s = str::from_utf8(&svg).expect("valid_utf8");
        assert!(s.starts_with("<svg"));
        assert_eq!(svg[0], b'<');
        assert_eq!(svg[1], b's');
        assert!(svg.len() <= LAST_SVG_CAPACITY);
        assert!(svg.len() < 4096, "symphony under 4KB, got {}", svg.len());
    }

    #[test]
    fn all_five_audio_modes_render() {
        for seed in [
            b"sunset".as_slice(),
            b"portrait".as_slice(),
            b"creature".as_slice(),
            b"floraa".as_slice(),
            b"nighta".as_slice(),
        ] {
            let svg = render(seed);
            assert!(svg.len() < 4096, "scene over budget, {}", svg.len());
        }
    }

    #[test]
    fn weak_review_samples_render_as_dense_abstract_audio_fields() {
        for seed in [
            b"solsoul-artqa-batch-v1:055:symphony".as_slice(),
            b"solsoul-artqa-batch-v1:095:symphony".as_slice(),
            b"solsoul-artqa-batch-v1:007:symphony".as_slice(),
        ] {
            let svg = render(seed);
            let s = str::from_utf8(&svg).expect("valid_utf8");
            let path_groups = s.matches("<path").count();
            let run_count = s.matches('M').count();
            assert!(
                path_groups >= 6,
                "symphony should use multiple spectral color layers, got {path_groups}: {s}"
            );
            assert!(
                run_count >= 45,
                "symphony should contain dense waveform/spectrum runs, got {run_count}: {s}"
            );
            assert!(
                !s.contains("<circle") && !s.contains("<line"),
                "symphony should stay in abstract encoded spectral paths"
            );
            assert!(svg.len() < 4096, "symphony under 4KB, got {}", svg.len());
        }
    }
}
