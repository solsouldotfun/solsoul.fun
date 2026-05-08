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

/// 8-bit retro palette: 16 deterministic colors from seed.
fn palette_8bit(seed: &[u8]) -> [&'static str; 16] {
    let hash = seed_hash(seed);
    // Four base palettes, each with 4 colors; expanded to 16 via mixing.
    let base: [[&str; 4]; 4] = [
        ["#000000", "#1a1c2c", "#5d275d", "#b13e53"], // dusk
        ["#38b764", "#a7f070", "#ffcd75", "#ef7d57"], // nature
        ["#29366f", "#3b5dc9", "#41a6f6", "#73eff7"], // ocean
        ["#f4f4f4", "#94b0c2", "#566c86", "#333c57"], // monochrome
    ];
    let chosen = &base[(hash % 4) as usize];
    [
        chosen[0], chosen[1], chosen[2], chosen[3], chosen[0], chosen[2], chosen[1], chosen[3],
        chosen[3], chosen[1], chosen[0], chosen[2], chosen[2], chosen[3], chosen[0], chosen[1],
    ]
}

/// Simple value noise on an 8×8 grid.
/// Returns height value 0..=15 for each cell.
fn generate_terrain(seed: &[u8]) -> [[u8; 8]; 8] {
    let hash = seed_hash(seed);
    let mut terrain = [[0u8; 8]; 8];

    let mut y = 0usize;
    while y < 8 {
        let mut x = 0usize;
        while x < 8 {
            let mut h = 0u32;
            let mut amp = 8u32;
            let mut freq = 1u32;
            let mut oct = 0u32;
            while oct < 3 {
                let nx = (x as u32 * freq) % 8;
                let ny = (y as u32 * freq) % 8;
                let idx = (hash
                    .wrapping_add((nx as u64).wrapping_mul(73))
                    .wrapping_add((ny as u64).wrapping_mul(151))
                    .wrapping_add((oct as u64).wrapping_mul(251)))
                    % 16;
                h += (idx as u32 * amp) / 16;
                amp /= 2;
                freq *= 2;
                oct += 1;
            }
            terrain[y][x] = (h.min(15)) as u8;
            x += 1;
        }
        y += 1;
    }
    terrain
}

/// Deterministic "cloud" overlay: sparse bright pixels in upper rows.
fn generate_clouds(seed: &[u8]) -> [[bool; 8]; 8] {
    let hash = seed_hash(seed);
    let mut clouds = [[false; 8]; 8];
    let mut y = 0usize;
    while y < 3 {
        let mut x = 0usize;
        while x < 8 {
            let idx = hash
                .wrapping_add((x as u64).wrapping_mul(17))
                .wrapping_add((y as u64).wrapping_mul(53));
            if idx.is_multiple_of(7) {
                clouds[y][x] = true;
            }
            x += 1;
        }
        y += 1;
    }
    clouds
}

/// Deterministic "building" overlay: vertical structures in lower rows.
fn generate_buildings(seed: &[u8]) -> [[bool; 8]; 8] {
    let hash = seed_hash(seed);
    let mut buildings = [[false; 8]; 8];
    let mut bx = 1usize;
    while bx < 7 {
        let idx = hash.wrapping_add(bx as u64 * 37);
        let height = 1 + ((idx % 3) as usize);
        let by_start = 8usize.saturating_sub(height);
        let mut by = by_start;
        while by < 8 {
            buildings[by][bx] = true;
            by += 1;
        }
        bx += 1 + ((idx % 2) as usize);
    }
    buildings
}

pub fn generate_pixel_art_svg(seed: &[u8], buf: &mut [u8]) -> Result<usize, ProgramError> {
    const GRID: u16 = 8;
    const PIXEL: u16 = 32; // 8 * 32 = 256
    const VIEWBOX: u16 = 256;

    let palette = palette_8bit(seed);
    let terrain = generate_terrain(seed);
    let clouds = generate_clouds(seed);
    let buildings = generate_buildings(seed);

    let mut out = SvgWriter::new(buf);

    out.write_str("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 ")?;
    out.write_u16(VIEWBOX)?;
    out.write_str(" ")?;
    out.write_u16(VIEWBOX)?;
    out.write_str("\" width=\"")?;
    out.write_u16(VIEWBOX)?;
    out.write_str("\" height=\"")?;
    out.write_u16(VIEWBOX)?;
    out.write_str("\"")?;
    out.write_str(" shape-rendering=\"crispEdges\"")?;
    out.write_str(">")?;

    // Sky background
    out.write_str("<rect x=\"0\" y=\"0\" width=\"")?;
    out.write_u16(VIEWBOX)?;
    out.write_str("\" height=\"")?;
    out.write_u16(VIEWBOX)?;
    out.write_str("\" fill=\"")?;
    out.write_str(palette[12])?;
    out.write_str("\"/>")?;

    let mut color_index = 0usize;
    while color_index < palette.len() {
        if palette[color_index] == palette[12] {
            color_index += 1;
            continue;
        }

        let mut first = true;
        let mut y = 0usize;
        while y < GRID as usize {
            let mut x = 0usize;
            while x < GRID as usize {
                let cell_color_index = if clouds[y][x] {
                    15usize
                } else if buildings[y][x] {
                    7usize
                } else {
                    terrain[y][x] as usize
                };

                if cell_color_index == color_index {
                    if first {
                        out.write_str("<path fill=\"")?;
                        out.write_str(palette[color_index])?;
                        out.write_str("\" d=\"")?;
                        first = false;
                    }
                    let px = (x as u16) * PIXEL;
                    let py = (y as u16) * PIXEL;
                    out.write_str("M")?;
                    out.write_u16(px)?;
                    out.write_str(" ")?;
                    out.write_u16(py)?;
                    out.write_str("h")?;
                    out.write_u16(PIXEL)?;
                    out.write_str("v")?;
                    out.write_u16(PIXEL)?;
                    out.write_str("H")?;
                    out.write_u16(px)?;
                    out.write_str("z")?;
                }

                x += 1;
            }
            y += 1;
        }

        if !first {
            out.write_str("\"/>")?;
        }
        color_index += 1;
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
        let len = generate_pixel_art_svg(seed, &mut buf).expect("pixel art renders");
        buf[..len].to_vec()
    }

    #[test]
    fn same_seed_produces_same_pixel_art() {
        assert_eq!(render(b"pixel-seed-1"), render(b"pixel-seed-1"));
    }

    #[test]
    fn different_seeds_produce_different_pixel_art() {
        let a = render(b"seed-a");
        let b = render(b"seed-b");
        assert_ne!(a, b);
    }

    #[test]
    fn pixel_art_svg_is_valid_and_bounded() {
        let rendered = render(b"pixel-budget");
        let svg = str::from_utf8(&rendered).expect("valid utf8");

        assert!(svg.starts_with("<svg"));
        assert!(svg.ends_with("</svg>"));
        assert!(svg.contains("shape-rendering=\"crispEdges\""));
        assert!(svg.contains("<rect"));
        assert!(rendered.len() <= LAST_SVG_CAPACITY);

        let lower = svg.to_ascii_lowercase();
        assert!(!lower.contains("url("));
        assert!(!lower.contains("<script"));
        assert!(!lower.contains("<image"));
    }

    #[test]
    fn pixel_art_blocks_align_to_grid() {
        let rendered = render(b"grid-test");
        let svg = str::from_utf8(&rendered).expect("valid utf8");
        for attr in [" x=\"", " y=\""] {
            let mut pos = 0;
            while let Some(start) = svg[pos..].find(attr) {
                let val_start = pos + start + attr.len();
                if let Some(end) = svg[val_start..].find('"') {
                    let val: u16 = svg[val_start..val_start + end].parse().unwrap();
                    assert_eq!(val % 32, 0, "coordinate must align to 32px grid: {}", val);
                    pos = val_start + end;
                } else {
                    break;
                }
            }
        }
    }

    #[test]
    fn palette_8bit_has_sixteen_colors() {
        let p = palette_8bit(b"test");
        assert_eq!(p.len(), 16);
        for c in p {
            assert_eq!(c.as_bytes()[0], b'#', "color must start with #");
            assert_eq!(c.len(), 7);
        }
    }
}
