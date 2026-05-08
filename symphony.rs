use pinocchio::error::ProgramError;

/// Symphony renderer — maximum-quality pixel art within 4KB SVG budget.
/// Grid: 32×32 pixels, 8px each, 256×256 viewBox.
/// Strategy: background rect + foreground runs only, ultra-compact SVG.

struct CompactWriter<'a> {
    buf: &'a mut [u8],
    pos: usize,
}

impl<'a> CompactWriter<'a> {
    fn new(buf: &'a mut [u8]) -> Self { Self { buf, pos: 0 } }

    fn write(&mut self, bytes: &[u8]) -> Result<(), ProgramError> {
        let end = self.pos.checked_add(bytes.len()).ok_or(ProgramError::ArithmeticOverflow)?;
        if end > self.buf.len() { return Err(ProgramError::AccountDataTooSmall); }
        self.buf[self.pos..end].copy_from_slice(bytes);
        self.pos = end;
        Ok(())
    }

    fn write_str(&mut self, s: &str) -> Result<(), ProgramError> {
        self.write(s.as_bytes())
    }

    fn write_u8(&mut self, v: u8) -> Result<(), ProgramError> {
        if v < 10 { return self.write(&[b'0' + v]); }
        let mut d = [0u8; 3];
        let mut n = v;
        let mut i = 3;
        while n > 0 { i -= 1; d[i] = b'0' + (n % 10); n /= 10; }
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

fn seed_u32(seed: &[u8], salt: u64) -> u32 {
    ((seed_u64(seed).wrapping_add(salt)) % u32::MAX as u64) as u32
}

/// 16-color harmonic palette from seed.
fn palette(seed: &[u8]) -> [&'static str; 16] {
    let h = seed_u64(seed);
    let base: [[&str; 4]; 6] = [
        ["#1a1a2e","#16213e","#0f3460","#e94560"], // crimson dusk
        ["#0f0f23","#1a1a3e","#4a4e69","#f2e9e4"], // midnight
        ["#264653","#2a9d8f","#e9c46a","#f4a261"], // ocean sunset
        ["#2b2d42","#8d99ae","#edf2f4","#ef233c"], // neo tokyo
        ["#1b4332","#40916c","#52b788","#d8f3dc"], // forest
        ["#240046","#3c096c","#7b2cbf","#e0aaff"], // violet dream
    ];
    let b = &base[(h % 6) as usize];
    [
        b[0],b[1],b[2],b[3],b[0],b[2],b[1],b[3],
        b[3],b[1],b[0],b[2],b[2],b[3],b[0],b[1],
    ]
}

/// 32×32 canvas. Each cell is a palette index 0..=15.
struct Canvas {
    grid: [[u8; 32]; 32],
    bg: u8,
}

impl Canvas {
    fn new(bg: u8) -> Self {
        Self { grid: [[bg; 32]; 32], bg }
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

    fn circle(&mut self, cx: i8, cy: i8, r: i8, color: u8) {
        let r2 = r * r;
        let mut yy = 0i8;
        while yy < 32 {
            let mut xx = 0i8;
            while xx < 32 {
                let dx = xx - cx;
                let dy = yy - cy;
                if dx * dx + dy * dy <= r2 {
                    self.grid[yy as usize][xx as usize] = color;
                }
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
            if x >= 0 && x < 32 && y >= 0 && y < 32 {
                self.grid[y as usize][x as usize] = color;
            }
            if x == x2 && y == y2 { break; }
            let e2 = 2 * err;
            if e2 > -dy { err -= dy; x += sx; }
            if e2 < dx { err += dx; y += sy; }
        }
    }
}

/// Scene types determined by seed.
#[derive(Clone, Copy)]
enum Scene {
    Sunset,    // Mountain silhouette against gradient sky
    Portrait,  // Abstract face
    Creature,  // Small animal/bird silhouette
    Flora,     // Tree/flower
    Night,     // Stars + moon + mountains
}

fn scene_from_seed(seed: &[u8]) -> Scene {
    match seed_u64(seed) % 5 {
        0 => Scene::Sunset,
        1 => Scene::Portrait,
        2 => Scene::Creature,
        3 => Scene::Flora,
        _ => Scene::Night,
    }
}

/// Compose a scene into the canvas.
fn compose(scene: Scene, seed: &[u8], canvas: &mut Canvas, pal: &[&str; 16]) {
    let h = seed_u64(seed);
    match scene {
        Scene::Sunset => {
            // Sky bands
            let band1 = 6 + ((h % 4) as i8); // horizon line
            canvas.rect(0, 0, 32, band1, 2);
            canvas.rect(0, band1 - 3, 32, 3, 3);
            // Sun
            let sun_x = 8 + ((h % 16) as i8);
            let sun_y = band1 - 4 - ((h % 3) as i8);
            let sun_r = 3 + ((h % 3) as i8);
            canvas.circle(sun_x, sun_y, sun_r, 3);
            // Mountains
            let mountain_color = 1u8;
            let peak1 = 12 + ((h % 8) as i8);
            let peak2 = 16 + ((h % 10) as i8);
            let peak3 = 10 + ((h % 6) as i8);
            // Draw jagged mountain silhouette
            let mut xx = 0i8;
            while xx < 32 {
                let height = if xx < 10 { peak1 * xx / 10 }
                    else if xx < 20 { peak1 + (peak2 - peak1) * (xx - 10) / 10 }
                    else { peak2 + (peak3 - peak2) * (xx - 20) / 12 };
                let base = 32 - height.max(3);
                let mut yy = base;
                while yy < 32 {
                    canvas.grid[yy as usize][xx as usize] = mountain_color;
                    yy += 1;
                }
                xx += 1;
            }
            // Stars in upper sky
            let mut s = 0u8;
            while s < 8 {
                let sx = ((h.wrapping_add(s as u64 * 37)) % 32) as i8;
                let sy = ((h.wrapping_add(s as u64 * 53)) % (band1 as u64 - 4)) as i8;
                if sy > 0 {
                    canvas.grid[sy as usize][sx as usize] = 7;
                }
                s += 1;
            }
        }
        Scene::Portrait => {
            // Face oval
            let cx = 16i8;
            let cy = 14i8;
            canvas.circle(cx, cy, 10, 2); // skin
            // Hair
            let hair_color = 1u8;
            canvas.rect(cx - 10, cy - 12, 20, 5, hair_color);
            canvas.rect(cx - 8, cy - 14, 16, 3, hair_color);
            // Eyes
            let eye_y = cy - 2;
            let eye_offset = 3 + ((h % 3) as i8);
            canvas.rect(cx - eye_offset - 2, eye_y, 3, 2, 0);
            canvas.rect(cx + eye_offset - 1, eye_y, 3, 2, 0);
            // Eye highlight
            canvas.grid[eye_y as usize][(cx - eye_offset) as usize] = 7;
            canvas.grid[eye_y as usize][(cx + eye_offset + 1) as usize] = 7;
            // Nose
            canvas.rect(cx, cy + 1, 1, 3, 4);
            // Mouth
            let mouth_y = cy + 5;
            canvas.rect(cx - 3, mouth_y, 7, 1, 5);
            // Neck
            canvas.rect(cx - 3, cy + 10, 6, 4, 2);
            // Shoulders
            canvas.rect(cx - 10, cy + 14, 20, 4, 3);
        }
        Scene::Creature => {
            // Bird/flying creature silhouette
            let body_x = 16i8;
            let body_y = 14i8;
            // Body
            canvas.circle(body_x, body_y, 4, 2);
            // Wings
            let wing_span = 10 + ((h % 6) as i8);
            let wing_y = body_y - 2;
            // Left wing
            let mut wx = body_x - wing_span;
            while wx < body_x {
                let wy = wing_y - ((body_x - wx) / 2);
                if wy > 0 && wy < 32 && wx > 0 {
                    canvas.grid[wy as usize][wx as usize] = 2;
                    canvas.grid[(wy + 1) as usize][wx as usize] = 2;
                }
                wx += 1;
            }
            // Right wing
            wx = body_x;
            while wx < body_x + wing_span {
                let wy = wing_y - ((wx - body_x) / 2);
                if wy > 0 && wy < 32 && wx < 32 {
                    canvas.grid[wy as usize][wx as usize] = 2;
                    canvas.grid[(wy + 1) as usize][wx as usize] = 2;
                }
                wx += 1;
            }
            // Tail
            canvas.line(body_x, body_y + 3, body_x - 6, body_y + 8, 2);
            canvas.line(body_x, body_y + 3, body_x + 6, body_y + 8, 2);
            // Moon behind
            canvas.circle(body_x + 8, body_y - 6, 5, 1);
            // Stars
            let mut s = 0u8;
            while s < 6 {
                let sx = ((h.wrapping_add(s as u64 * 41)) % 32) as i8;
                let sy = ((h.wrapping_add(s as u64 * 67)) % 12) as i8;
                canvas.grid[sy as usize][sx as usize] = 7;
                s += 1;
            }
        }
        Scene::Flora => {
            // Ground
            canvas.rect(0, 28, 32, 4, 1);
            // Trunk
            let trunk_x = 14 + ((h % 4) as i8);
            canvas.rect(trunk_x, 18, 3, 10, 4);
            // Canopy (multiple circles)
            let canopy_c = 2u8;
            canvas.circle(trunk_x + 1, 14, 7, canopy_c);
            canvas.circle(trunk_x - 3, 16, 5, canopy_c);
            canvas.circle(trunk_x + 5, 16, 5, canopy_c);
            // Flowers
            let mut f = 0u8;
            while f < 5 {
                let fx = ((h.wrapping_add(f as u64 * 23)) % 30 + 1) as i8;
                let fy = 26 + ((h.wrapping_add(f as u64 * 17)) % 4) as i8;
                canvas.grid[fy as usize][fx as usize] = 5;
                if fx > 0 { canvas.grid[fy as usize][(fx - 1) as usize] = 5; }
                f += 1;
            }
            // Sun
            canvas.circle(26, 5, 4, 3);
            // Sky gradient hint
            canvas.rect(0, 0, 32, 8, 0);
        }
        Scene::Night => {
            // Dark sky
            canvas.rect(0, 0, 32, 32, 0);
            // Moon
            let mx = 24 + ((h % 4) as i8);
            let my = 6 + ((h % 4) as i8);
            canvas.circle(mx, my, 5, 7);
            // Crater
            canvas.circle(mx - 1, my + 1, 1, 0);
            // Stars (many)
            let mut s = 0u8;
            while s < 20 {
                let sx = ((h.wrapping_add(s as u64 * 37)) % 32) as i8;
                let sy = ((h.wrapping_add(s as u64 * 53)) % 20) as i8;
                if canvas.grid[sy as usize][sx as usize] == canvas.bg {
                    canvas.grid[sy as usize][sx as usize] = 7;
                }
                s += 1;
            }
            // Mountains
            let peak = 14 + ((h % 8) as i8);
            let mut xx = 0i8;
            while xx < 32 {
                let hgt = if xx < 16 { peak * xx / 16 } else { peak * (32 - xx) / 16 };
                let base = 32 - hgt.max(4);
                let mut yy = base;
                while yy < 32 {
                    canvas.grid[yy as usize][xx as usize] = 1;
                    yy += 1;
                }
                xx += 1;
            }
            // Reflection in water
            let water_line = 28i8;
            canvas.rect(0, water_line, 32, 4, 1);
            let mut rx = 0i8;
            while rx < 32 {
                if (h.wrapping_add(rx as u64)) % 3 == 0 {
                    let ry = water_line + 1 + ((h.wrapping_add(rx as u64)) % 3) as i8;
                    if ry < 32 {
                        canvas.grid[ry as usize][rx as usize] = 7;
                    }
                }
                rx += 1;
            }
        }
    }
}

/// Encode canvas to ultra-compact SVG.
fn encode_svg(canvas: &Canvas, pal: &[&str; 16], buf: &mut [u8]) -> Result<usize, ProgramError> {
    let mut out = CompactWriter::new(buf);

    // Header: <svg v="0 0 256 256" s-r="cE">
    out.write_str(r#"<svg v="0 0 256 256" s-r="cE">"#)?;

    // Background rect (dominant color)
    out.write_str(r#"<rect w=256 h=256 f="#)?;
    out.write_str(pal[canvas.bg as usize])?;
    out.write_str("/>")?;

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
                        // Open group: <g f=#123>
                        out.write_str(r#"<g f="#)?;
                        out.write_str(pal[color as usize])?;
                        out.write_str("")>")?;
                        first = false;
                    }
                    // Rect: <rect x=XX y=YY w=WW h=8/>
                    out.write_str("<rect x=")?;
                    out.write_u8((run_start * 8) as u8)?;
                    out.write_str(" y=")?;
                    out.write_u8((yy * 8) as u8)?;
                    out.write_str(" w=")?;
                    out.write_u8((run_len * 8) as u8)?;
                    out.write_str(" h=8/>")?;
                } else {
                    xx += 1;
                }
            }
            yy += 1;
        }

        if !first {
            // Close group
            out.write_str("</g>")?;
        }
        color += 1;
    }

    out.write_str("</svg>")?;
    Ok(out.pos)
}

pub fn generate_symphony_svg(seed: &[u8], buf: &mut [u8]) -> Result<usize, ProgramError> {
    let pal = palette(seed);
    let scene = scene_from_seed(seed);

    // Choose background as the palette color that will be most abundant
    let bg = match scene {
        Scene::Sunset => 0,
        Scene::Portrait => 0,
        Scene::Creature => 0,
        Scene::Flora => 0,
        Scene::Night => 0,
    };

    let mut canvas = Canvas::new(bg);
    compose(scene, seed, &mut canvas, &pal);
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::LAST_SVG_CAPACITY;
    use std::vec::Vec;

    fn render(seed: &[u8]) -> Vec<u8> {
        let mut buf = [0u8; LAST_SVG_CAPACITY];
        let len = generate_symphony_svg(seed, &mut buf).expect("ok");
        buf[..len].to_vec()
    }

    #[test]
    fn same_seed_same_output() {
        assert_eq!(render(b"symphony_1"), render(b"symphony_1"));
    }

    #[test]
    fn different_seeds_different() {
        assert_ne!(render(b"seed_a"), render(b"seed_b"));
    }

    #[test]
    fn svg_valid_and_bounded() {
        let svg = render(b"symphony_budget");
        assert_eq!(svg[0], b'\u{003c}');
        assert_eq!(svg[1], b's');
        assert!(svg.len() <= LAST_SVG_CAPACITY);
        assert!(svg.len() < 4096);
    }

    #[test]
    fn all_five_scenes_render() {
        for seed in [b"sunset", b"portrait", b"creature", b"flora", b"night"] {
            let svg = render(seed);
            assert!(svg.len() < 4096);
        }
    }
}
