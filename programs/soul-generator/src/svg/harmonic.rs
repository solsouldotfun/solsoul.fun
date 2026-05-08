use super::blueprint::{BaseParams, EvolutionState};
use libm::sin;
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
        ("#020617", "#e5e7eb", "#14f195"),
        ("#050816", "#c4b5fd", "#9945ff"),
        ("#09090b", "#ecfeff", "#00d9ff"),
        ("#08111f", "#f8fafc", "#22c55e"),
    ];
    palettes[(hash % 4) as usize]
}

fn fourier_waveform(seed: &[u8]) -> [(u16, u16); 64] {
    let hash = seed_hash(seed);
    let fundamental_freq = 1.0 + ((hash % 5) as f64);
    let harmonics = 3 + ((hash >> 8) % 4) as usize;

    let mut points = [(0u16, 0u16); 64];
    let mut i = 0usize;
    while i < 64 {
        let t = i as f64 / 64.0;
        let mut y = 0.0f64;

        let mut h = 1usize;
        while h <= harmonics {
            let amplitude = 1.0 / h as f64;
            let phase = ((hash >> (h * 8)) % 100) as f64 / 100.0 * core::f64::consts::TAU;
            y += amplitude * sin(t * fundamental_freq * h as f64 * core::f64::consts::TAU + phase);
            h += 1;
        }

        let px = (t * 200.0) as u16 + 28;
        let py = (128.0 + y * 50.0) as u16;
        points[i] = (px.min(255), py.min(255));

        i += 1;
    }

    points
}

pub fn generate_harmonic_svg(
    seed: &[u8],
    _params: &BaseParams,
    _evolution: &EvolutionState,
    buf: &mut [u8],
) -> Result<usize, ProgramError> {
    let hash = seed_hash(seed);
    let (bg, fg, accent) = palette_from_seed(seed);
    let points = fourier_waveform(seed);

    let mut out = SvgWriter::new(buf);

    out.write_str("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" width=\"256\" height=\"256\">")?;
    out.write_str("<rect width=\"256\" height=\"256\" fill=\"")?;
    out.write_str(bg)?;
    out.write_str("\"/>")?;

    // Resonance rings and a connected contour make the waveform read as
    // intentional gallery art, not isolated dots on a flat dark plane.
    let inner_radius = 46 + ((hash >> 12) % 11) as u16;
    let outer_radius = 86 + ((hash >> 20) % 13) as u16;
    for (radius, opacity, color) in [(outer_radius, "0.22", accent), (inner_radius, "0.16", fg)] {
        out.write_str("<circle cx=\"128\" cy=\"128\" r=\"")?;
        out.write_u16(radius)?;
        out.write_str("\" fill=\"none\" stroke=\"")?;
        out.write_str(color)?;
        out.write_str("\" stroke-width=\"1\" opacity=\"")?;
        out.write_str(opacity)?;
        out.write_str("\"/>")?;
    }

    out.write_str("<path d=\"")?;
    let mut path_i = 0usize;
    while path_i < points.len() {
        let (x, y) = points[path_i];
        if path_i == 0 {
            out.write_str("M")?;
        } else {
            out.write_str("L")?;
        }
        out.write_u16(x)?;
        out.write_str(" ")?;
        out.write_u16(y)?;
        path_i += 2;
    }
    out.write_str("\" fill=\"none\" stroke=\"")?;
    out.write_str(accent)?;
    out.write_str("\" stroke-width=\"2\" opacity=\"0.48\"/>")?;

    let mut i = 0usize;
    while i < points.len() {
        let (x, y) = points[i];
        let size = 3u16;
        let color = if i.is_multiple_of(8) { accent } else { fg };

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
            generate_harmonic_svg(seed, &params, &evolution, &mut buf).expect("harmonic renders");
        buf[..len].to_vec()
    }

    #[test]
    fn same_seed_produces_same_harmonic_svg() {
        assert_eq!(render(b"harmonic-test-seed"), render(b"harmonic-test-seed"));
    }

    #[test]
    fn different_seeds_produce_different_harmonic_svgs() {
        let first = render(b"harmonic-seed-a");
        let second = render(b"harmonic-seed-b");
        assert_ne!(first, second);
    }

    #[test]
    fn harmonic_svg_is_valid_and_bounded() {
        let rendered = render(b"harmonic-budget-test");
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
    fn harmonic_weak_review_samples_have_resonance_contours() {
        for seed in [
            b"solsoul-artqa-batch-v1:012:harmonic".as_slice(),
            b"solsoul-artqa-batch-v1:060:harmonic".as_slice(),
            b"solsoul-artqa-batch-v1:124:harmonic".as_slice(),
        ] {
            let rendered = render(seed);
            let svg = str::from_utf8(&rendered).expect("valid utf8");

            assert!(
                !svg.contains("fill=\"#f5f5f0\""),
                "harmonic should keep a black-gallery background instead of light flat forms: {svg}"
            );
            assert!(
                svg.contains("<path d=\"M"),
                "harmonic weak-review samples should connect tones with contour paths: {svg}"
            );
            assert!(
                svg.contains("cx=\"128\" cy=\"128\" r=\""),
                "harmonic should include compact resonance rings as secondary geometry: {svg}"
            );
            assert!(
                rendered.len() <= LAST_SVG_CAPACITY,
                "harmonic must remain under byte cap"
            );
        }
    }
}
