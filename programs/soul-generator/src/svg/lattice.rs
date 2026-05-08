use super::blueprint::{BaseParams, EvolutionState};
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
    let palettes = [
        ("#0a0a0a", "#e8e8e8", "#ff6b6b"),
        ("#f5f5f0", "#1a1a1a", "#4ecdc4"),
        ("#1a1a2e", "#e94560", "#f8b500"),
        ("#16213e", "#f5f5f5", "#00d9ff"),
    ];
    palettes[(hash % 4) as usize]
}

fn generate_lattice_points(seed: &[u8]) -> [(u16, u16); 36] {
    let hash = seed_hash(seed);
    let mut points = [(0u16, 0u16); 36];
    let spacing = 32u16;
    let offset_x = 20u16 + ((hash % 20) as u16);
    let offset_y = 20u16 + ((hash >> 8) % 20) as u16;

    let mut idx = 0usize;
    while idx < 36 {
        let row = (idx / 6) as u16;
        let col = (idx % 6) as u16;
        points[idx] = (offset_x + col * spacing, offset_y + row * spacing);
        idx += 1;
    }

    points
}

pub fn generate_lattice_svg(
    seed: &[u8],
    _params: &BaseParams,
    _evolution: &EvolutionState,
    buf: &mut [u8],
) -> Result<usize, ProgramError> {
    let hash = seed_hash(seed);
    let (bg, fg, accent) = palette_from_seed(seed);
    let points = generate_lattice_points(seed);

    let mut out = SvgWriter::new(buf);

    out.write_str("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" width=\"256\" height=\"256\">")?;
    out.write_str("<rect width=\"256\" height=\"256\" fill=\"")?;
    out.write_str(bg)?;
    out.write_str("\"/>")?;

    let mut i = 0usize;
    while i < points.len() {
        let (x, y) = points[i];
        let size = 3 + ((hash >> (i % 16)) % 5) as u16;
        let color = if i.is_multiple_of(4) { accent } else { fg };

        out.write_str("<rect x=\"")?;
        out.write_u16(x)?;
        out.write_str("\" y=\"")?;
        out.write_u16(y)?;
        out.write_str("\" width=\"")?;
        out.write_u16(size)?;
        out.write_str("\" height=\"")?;
        out.write_u16(size)?;
        out.write_str("\" fill=\"")?;
        out.write_str(color)?;
        out.write_str("\"/>")?;

        i += 1;
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
            generate_lattice_svg(seed, &params, &evolution, &mut buf).expect("lattice renders");
        buf[..len].to_vec()
    }

    #[test]
    fn same_seed_produces_same_lattice_svg() {
        assert_eq!(render(b"lattice-test-seed"), render(b"lattice-test-seed"));
    }

    #[test]
    fn different_seeds_produce_different_lattice_svgs() {
        let first = render(b"lattice-seed-a");
        let second = render(b"lattice-seed-b");
        assert_ne!(first, second);
    }

    #[test]
    fn lattice_svg_is_valid_and_bounded() {
        let rendered = render(b"lattice-budget-test");
        let svg = str::from_utf8(&rendered).expect("valid utf8");

        assert!(svg.starts_with("<svg"));
        assert!(svg.ends_with("</svg>"));
        assert!(svg.contains("<rect"));
        assert!(rendered.len() <= LAST_SVG_CAPACITY);

        let lower = svg.to_ascii_lowercase();
        assert!(!lower.contains("url("));
        assert!(!lower.contains("<script"));
        assert!(!lower.contains("<image"));
    }
}
