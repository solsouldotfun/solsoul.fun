/// On-chain color palette generator.
///
/// Derives deterministic color schemes from a seed hash — no floating point,
/// no allocations.
pub struct ColorPalette {
    pub primary: [u8; 7], // "#RRGGBB"
    pub secondary: [u8; 7],
    pub accent: [u8; 7],
    pub background: [u8; 7],
    pub text: [u8; 7],
}

impl ColorPalette {
    /// Generate a palette from a 64-bit seed hash.
    pub fn from_seed_hash(hash: u64) -> Self {
        let h1 = hash as u32;
        let h2 = (hash >> 16) as u32;
        let h3 = (hash >> 32) as u32;
        let h4 = (hash >> 48) as u32;

        Self {
            primary: hsl_to_hex(
                (h1 % 360) as u16,
                70 + (h1 >> 9) as u8 % 26,
                45 + (h1 >> 13) as u8 % 26,
            ),
            secondary: hsl_to_hex(
                ((h1 % 360) as u16 + 120 + (h2 % 60) as u16) % 360,
                60 + (h2 >> 9) as u8 % 26,
                40 + (h2 >> 13) as u8 % 26,
            ),
            accent: hsl_to_hex(
                ((h1 % 360) as u16 + 240 + (h3 % 60) as u16) % 360,
                75 + (h3 >> 9) as u8 % 21,
                50 + (h3 >> 13) as u8 % 21,
            ),
            background: hsl_to_hex(
                (h4 % 360) as u16,
                10 + (h4 >> 9) as u8 % 11,
                5 + (h4 >> 13) as u8 % 11,
            ),
            text: hsl_to_hex(
                (h4 % 360) as u16,
                5 + (h4 >> 11) as u8 % 11,
                85 + (h4 >> 15) as u8 % 11,
            ),
        }
    }

    /// Primary color as `&str` (e.g. `"#14f195"`).
    pub fn primary_str(&self) -> &str {
        unsafe { core::str::from_utf8_unchecked(&self.primary) }
    }

    pub fn secondary_str(&self) -> &str {
        unsafe { core::str::from_utf8_unchecked(&self.secondary) }
    }

    pub fn accent_str(&self) -> &str {
        unsafe { core::str::from_utf8_unchecked(&self.accent) }
    }

    pub fn background_str(&self) -> &str {
        unsafe { core::str::from_utf8_unchecked(&self.background) }
    }

    pub fn text_str(&self) -> &str {
        unsafe { core::str::from_utf8_unchecked(&self.text) }
    }

    /// Interpolate between two palette colors by ratio (0..=100).
    pub fn mix(&self, a: &str, b: &str, ratio: u8) -> [u8; 7] {
        let r = ratio.min(100) as u32;
        let rgb_a = hex_to_rgb(a);
        let rgb_b = hex_to_rgb(b);
        let rr = ((rgb_a[0] as u32 * (100 - r) + rgb_b[0] as u32 * r) / 100) as u8;
        let gg = ((rgb_a[1] as u32 * (100 - r) + rgb_b[1] as u32 * r) / 100) as u8;
        let bb = ((rgb_a[2] as u32 * (100 - r) + rgb_b[2] as u32 * r) / 100) as u8;
        rgb_to_hex(rr, gg, bb)
    }
}

/// Convert HSL (hue 0-359, sat 0-100, lit 0-100) to `"#RRGGBB"` hex.
fn hsl_to_hex(h: u16, s: u8, l: u8) -> [u8; 7] {
    let h = h % 360;
    let s = s.min(100) as u32;
    let l = l.min(100) as u32;

    let c = ((100 - (2 * l).saturating_sub(100).abs_diff(0)) * s) / 100;
    let x = c * (60u32.saturating_sub(((h as i32 % 120) - 60).unsigned_abs())) / 60;
    let m = l.saturating_sub(c / 2);

    let (r1, g1, b1) = match h {
        0..=59 => (c, x, 0u32),
        60..=119 => (x, c, 0),
        120..=179 => (0, c, x),
        180..=239 => (0, x, c),
        240..=299 => (x, 0, c),
        _ => (c, 0, x),
    };

    let scale = |v: u32| ((v * 255) / 100).min(255) as u8;
    rgb_to_hex(scale(r1 + m), scale(g1 + m), scale(b1 + m))
}

fn rgb_to_hex(r: u8, g: u8, b: u8) -> [u8; 7] {
    let mut out = [0u8; 7];
    out[0] = b'#';
    out[1] = byte_to_hex(r >> 4);
    out[2] = byte_to_hex(r & 0x0f);
    out[3] = byte_to_hex(g >> 4);
    out[4] = byte_to_hex(g & 0x0f);
    out[5] = byte_to_hex(b >> 4);
    out[6] = byte_to_hex(b & 0x0f);
    out
}

fn byte_to_hex(nibble: u8) -> u8 {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    HEX[(nibble & 0x0f) as usize]
}

fn hex_to_rgb(hex: &str) -> [u8; 3] {
    let bytes = hex.as_bytes();
    if bytes.len() < 7 || bytes[0] != b'#' {
        return [0, 0, 0];
    }
    [
        (hex_nibble(bytes[1]) << 4) | hex_nibble(bytes[2]),
        (hex_nibble(bytes[3]) << 4) | hex_nibble(bytes[4]),
        (hex_nibble(bytes[5]) << 4) | hex_nibble(bytes[6]),
    ]
}

fn hex_nibble(c: u8) -> u8 {
    match c {
        b'0'..=b'9' => c - b'0',
        b'a'..=b'f' => c - b'a' + 10,
        b'A'..=b'F' => c - b'A' + 10,
        _ => 0,
    }
}

/// Pick one of `choices` deterministically using `hash`.
pub fn pick_by_hash<T>(choices: &[T], hash: u64) -> Option<&T> {
    if choices.is_empty() {
        return None;
    }
    Some(&choices[(hash as usize) % choices.len()])
}

/// Deterministic random float proxy: returns 0..=1000 representing 0.0..=1.0.
pub fn hash_to_millis(hash: u64) -> u32 {
    (hash % 1001) as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn palette_from_same_seed_is_deterministic() {
        let p1 = ColorPalette::from_seed_hash(0x1234_5678_9abc_def0);
        let p2 = ColorPalette::from_seed_hash(0x1234_5678_9abc_def0);
        assert_eq!(p1.primary, p2.primary);
        assert_eq!(p1.secondary, p2.secondary);
        assert_eq!(p1.accent, p2.accent);
    }

    #[test]
    fn different_seeds_produce_different_palettes() {
        let p1 = ColorPalette::from_seed_hash(0x1111_1111_1111_1111);
        let p2 = ColorPalette::from_seed_hash(0x2222_2222_2222_2222);
        // Very unlikely to be identical
        assert_ne!(p1.primary, p2.primary);
    }

    #[test]
    fn hex_colors_start_with_hash_and_are_valid_length() {
        let p = ColorPalette::from_seed_hash(0);
        for color in [&p.primary, &p.secondary, &p.accent, &p.background, &p.text] {
            assert_eq!(color[0], b'#', "color must start with #");
            assert_eq!(color.len(), 7);
            for i in 1..7 {
                assert!(
                    color[i].is_ascii_hexdigit(),
                    "color char must be hex: {}",
                    color[i] as char
                );
            }
        }
    }

    #[test]
    fn mix_ratio_0_returns_a() {
        let p = ColorPalette::from_seed_hash(0);
        let mixed = p.mix(p.primary_str(), p.secondary_str(), 0);
        assert_eq!(&mixed[..], p.primary_str().as_bytes());
    }

    #[test]
    fn mix_ratio_100_returns_b() {
        let p = ColorPalette::from_seed_hash(0);
        let mixed = p.mix(p.primary_str(), p.secondary_str(), 100);
        assert_eq!(&mixed[..], p.secondary_str().as_bytes());
    }

    #[test]
    fn pick_by_hash_returns_element() {
        let choices = ["a", "b", "c"];
        assert_eq!(pick_by_hash(&choices, 0), Some(&"a"));
        assert_eq!(pick_by_hash(&choices, 1), Some(&"b"));
        assert_eq!(pick_by_hash(&choices, 2), Some(&"c"));
        assert_eq!(pick_by_hash(&choices, 3), Some(&"a"));
    }

    #[test]
    fn pick_by_hash_empty_returns_none() {
        let empty: &[&str] = &[];
        assert_eq!(pick_by_hash(empty, 0), None);
    }

    #[test]
    fn hash_to_millis_in_range() {
        for hash in [0, 1, 500, 999, 1000, 1_000_000] {
            let m = hash_to_millis(hash);
            assert!(m <= 1000);
        }
    }

    #[test]
    fn hsl_known_values() {
        // Red: hsl(0, 100, 50) => #ff0000
        assert_eq!(&hsl_to_hex(0, 100, 50), b"#ff0000");
        // Green: hsl(120, 100, 50)
        assert_eq!(&hsl_to_hex(120, 100, 50), b"#00ff00");
        // Blue: hsl(240, 100, 50)
        assert_eq!(&hsl_to_hex(240, 100, 50), b"#0000ff");
        // Black: hsl(0, 0, 0)
        assert_eq!(&hsl_to_hex(0, 0, 0), b"#000000");
        // White: hsl(0, 0, 100)
        assert_eq!(&hsl_to_hex(0, 0, 100), b"#ffffff");
    }
}
