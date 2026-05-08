use super::blueprint::{BaseParams, EvolutionState};
use alloc::vec::Vec;
#[allow(unused_imports)]
use libm::floor;
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

    fn write_opacity_tenths(&mut self, value: u16) -> Result<(), ProgramError> {
        let clamped = value.clamp(1, 9);
        self.write_bytes(b"0.")?;
        self.write_bytes(&[b'0' + clamped as u8])
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
        ("#0a0a0a", "#e8e8e8", "#4ecdc4"),
        ("#f5f5f0", "#1a1a1a", "#ff6b6b"),
        ("#1a1a2e", "#e94560", "#f8b500"),
        ("#16213e", "#f5f5f5", "#00d9ff"),
    ];
    palettes[(hash % 4) as usize]
}

fn fade(t: f64) -> f64 {
    t * t * t * (t * (t * 6.0 - 15.0) + 10.0)
}

fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + t * (b - a)
}

fn grad(hash: u8, x: f64, y: f64) -> f64 {
    let h = hash & 3;
    let u = if h < 2 { x } else { y };
    let v = if h < 2 { y } else { x };
    (if (h & 1) == 0 { u } else { -u }) + (if (h & 2) == 0 { v } else { -v })
}

fn perlin_noise_2d(x: f64, y: f64, seed: u64) -> f64 {
    let xi = floor(x) as i32 & 255;
    let yi = floor(y) as i32 & 255;
    let xf = x - floor(x);
    let yf = y - floor(y);

    let u = fade(xf);
    let v = fade(yf);

    let mut p = [0u8; 512];
    let mut rng = seed;
    for i in 0..256 {
        rng = rng
            .wrapping_mul(0x0000_0100_0000_01b3)
            .wrapping_add(0xcbf2_9ce4_8422_2325);
        let mixed = rng ^ rng.rotate_left(19) ^ (rng >> 32) ^ ((i as u64) << 11);
        p[i] = (mixed & 0xff) as u8;
        p[i + 256] = p[i];
    }

    let aa = p[((xi as u16 + u16::from(p[(yi & 255) as usize])) & 255) as usize];
    let ab = p[((xi as u16 + u16::from(p[((yi + 1) & 255) as usize])) & 255) as usize];
    let ba = p[(((xi + 1) as u16 + u16::from(p[(yi & 255) as usize])) & 255) as usize];
    let bb = p[(((xi + 1) as u16 + u16::from(p[((yi + 1) & 255) as usize])) & 255) as usize];

    let x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1.0, yf), u);
    let x2 = lerp(grad(ab, xf, yf - 1.0), grad(bb, xf - 1.0, yf - 1.0), u);

    lerp(x1, x2, v)
}

fn generate_field_points(seed: &[u8], count: usize) -> Vec<(u16, u16, u16)> {
    let hash = seed_hash(seed);
    let mut points = Vec::with_capacity(count);

    for i in 0..count {
        let x = (i % 16) as f64 * 0.7;
        let y = (i / 16) as f64 * 0.7;
        let noise = perlin_noise_2d(x, y, hash);

        let px = ((x / 10.0 + noise * 0.3 + 0.5) * 200.0) as u16;
        let py = ((y / 10.0 + noise * 0.3 + 0.5) * 200.0) as u16;
        let intensity = ((noise + 1.0) * 127.5) as u16;

        points.push((px.min(255), py.min(255), intensity));
    }

    points
}

pub fn generate_field_svg(
    seed: &[u8],
    _params: &BaseParams,
    _evolution: &EvolutionState,
    buf: &mut [u8],
) -> Result<usize, ProgramError> {
    let (bg, fg, accent) = palette_from_seed(seed);
    let points = generate_field_points(seed, 48);

    let mut out = SvgWriter::new(buf);

    out.write_str("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" width=\"256\" height=\"256\">")?;
    out.write_str("<rect width=\"256\" height=\"256\" fill=\"")?;
    out.write_str(bg)?;
    out.write_str("\"/>")?;

    for (i, (x, y, intensity)) in points.iter().enumerate() {
        let color = if i.is_multiple_of(5) { accent } else { fg };
        let opacity = 2 + ((*intensity as u32 * 7) / 255) as u16;

        out.write_str("<circle cx=\"")?;
        out.write_u16(*x + 28)?;
        out.write_str("\" cy=\"")?;
        out.write_u16(*y + 28)?;
        out.write_str("\" r=\"")?;
        out.write_u16(2 + (i % 3) as u16)?;
        out.write_str("\" fill=\"")?;
        out.write_str(color)?;
        out.write_str("\" opacity=\"")?;
        out.write_opacity_tenths(opacity)?;
        out.write_str("\"/>")?;
    }

    out.write_str("</svg>")?;

    Ok(out.len)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::LAST_SVG_CAPACITY;
    use std::{collections::BTreeSet, format, str, vec::Vec};

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
        let len = generate_field_svg(seed, &params, &evolution, &mut buf).expect("field renders");
        buf[..len].to_vec()
    }

    #[test]
    fn same_seed_produces_same_field_svg() {
        assert_eq!(render(b"field-test-seed"), render(b"field-test-seed"));
    }

    #[test]
    fn different_seeds_produce_different_field_svgs() {
        let first = render(b"field-seed-a");
        let second = render(b"field-seed-b");
        assert_ne!(first, second);
    }

    #[test]
    fn normal_field_seed_sweep_has_no_exact_duplicates() {
        let mut seen = BTreeSet::new();
        for index in 0..64 {
            let seed = format!("field-normal-seed-sweep-{index:03}");
            let svg = render(seed.as_bytes());
            assert!(
                seen.insert(svg),
                "field seed sweep produced a duplicate at index {index}"
            );
        }
    }

    #[test]
    fn field_svg_is_valid_and_bounded() {
        let rendered = render(b"field-budget-test");
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
}
