use pinocchio::error::ProgramError;

#[derive(Clone, Copy, Eq, PartialEq)]
enum Mode {
    Color,
    Hsl,
    Pixel,
}

#[derive(Clone, Copy)]
struct StyleParams {
    mode: Mode,
    evolution: u8,
}

struct TemplateWriter<'a> {
    buf: &'a mut [u8],
    len: usize,
}

impl<'a> TemplateWriter<'a> {
    fn new(buf: &'a mut [u8]) -> Self {
        Self { buf, len: 0 }
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

    fn write_u8(&mut self, value: u8) -> Result<(), ProgramError> {
        self.write_u16(value as u16)
    }

    fn write_seed_hex(&mut self, seed: &[u8]) -> Result<(), ProgramError> {
        const HEX: &[u8; 16] = b"0123456789abcdef";
        let mut output = [b'0'; 16];
        let mut index = 0usize;
        while index < 8 {
            let byte = if index < seed.len() { seed[index] } else { 0 };
            output[index * 2] = HEX[(byte >> 4) as usize];
            output[index * 2 + 1] = HEX[(byte & 0x0f) as usize];
            index += 1;
        }

        self.write_bytes(&output)
    }
}

pub fn render_with_template(
    template: &[u8],
    seed: &[u8],
    style_params: &[u8],
    holder_balance: u64,
    buf: &mut [u8],
) -> Result<usize, ProgramError> {
    let style = parse_style_params(style_params)?;
    let hue = hue_for_mode(seed, style.mode);
    let accent = (hue + 180) % 360;
    let holder_tier = holder_tier(holder_balance);
    let mut out = TemplateWriter::new(buf);
    let mut cursor = 0usize;

    while cursor < template.len() {
        if cursor + 1 < template.len() && template[cursor] == b'{' && template[cursor + 1] == b'{' {
            if let Some(close) = find_placeholder_close(template, cursor + 2) {
                let name = &template[cursor + 2..close];
                if write_placeholder(
                    &mut out,
                    name,
                    style.evolution,
                    hue,
                    accent,
                    seed,
                    holder_tier,
                )? {
                    cursor = close + 2;
                    continue;
                }

                out.write_bytes(&template[cursor..close + 2])?;
                cursor = close + 2;
                continue;
            }
        }

        out.write_bytes(&template[cursor..cursor + 1])?;
        cursor += 1;
    }

    Ok(out.len)
}

fn parse_style_params(style_params: &[u8]) -> Result<StyleParams, ProgramError> {
    let mut parsed = StyleParams {
        mode: Mode::Hsl,
        evolution: 3,
    };
    let mut pair_start = 0usize;

    while pair_start <= style_params.len() {
        let pair_end = find_byte(style_params, pair_start, b';').unwrap_or(style_params.len());
        if pair_end > pair_start {
            parse_style_pair(&style_params[pair_start..pair_end], &mut parsed)?;
        }

        if pair_end == style_params.len() {
            break;
        }
        pair_start = pair_end
            .checked_add(1)
            .ok_or(ProgramError::ArithmeticOverflow)?;
    }

    Ok(parsed)
}

fn parse_style_pair(pair: &[u8], parsed: &mut StyleParams) -> Result<(), ProgramError> {
    let equals = find_byte(pair, 0, b'=').ok_or(ProgramError::InvalidInstructionData)?;
    if equals == 0 || equals + 1 >= pair.len() {
        return Err(ProgramError::InvalidInstructionData);
    }

    let key = &pair[..equals];
    let value = &pair[equals + 1..];
    if key == b"mode" {
        parsed.mode = match value {
            b"color" => Mode::Color,
            b"hsl" => Mode::Hsl,
            b"pixel" => Mode::Pixel,
            _ => return Err(ProgramError::InvalidInstructionData),
        };
    } else if key == b"evolution" {
        parsed.evolution = match value {
            b"0" => 0,
            b"1" => 1,
            b"2" => 2,
            b"3" => 3,
            _ => return Err(ProgramError::InvalidInstructionData),
        };
    }

    Ok(())
}

fn write_placeholder(
    out: &mut TemplateWriter<'_>,
    name: &[u8],
    evolution: u8,
    hue: u16,
    accent: u16,
    seed: &[u8],
    holder_tier: u8,
) -> Result<bool, ProgramError> {
    if name == b"HUE" {
        out.write_u16(hue)?;
        return Ok(true);
    } else if name == b"ACCENT" && evolution >= 1 {
        out.write_u16(accent)?;
        return Ok(true);
    } else if name == b"SEED_HEX" && evolution >= 2 {
        out.write_seed_hex(seed)?;
        return Ok(true);
    } else if name == b"HOLDER_TIER" && evolution >= 3 {
        out.write_u8(holder_tier)?;
        return Ok(true);
    }

    Ok(false)
}

fn find_placeholder_close(template: &[u8], start: usize) -> Option<usize> {
    let mut index = start;
    while index + 1 < template.len() {
        if template[index] == b'}' && template[index + 1] == b'}' {
            return Some(index);
        }
        index += 1;
    }
    None
}

fn find_byte(bytes: &[u8], start: usize, target: u8) -> Option<usize> {
    let mut index = start;
    while index < bytes.len() {
        if bytes[index] == target {
            return Some(index);
        }
        index += 1;
    }
    None
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

fn hue_for_mode(seed: &[u8], mode: Mode) -> u16 {
    let hash = seed_hash(seed);
    let raw = match mode {
        Mode::Color => hash % 360,
        Mode::Hsl => hash.rotate_left(17) % 360,
        Mode::Pixel => {
            let bucket = hash % 12;
            bucket * 30
        }
    };
    raw as u16
}

fn holder_tier(holder_balance: u64) -> u8 {
    const TEN_MT_QUANTA: u64 = crate::state::MIN_CLAIM_BALANCE * 10;
    const HUNDRED_MT_QUANTA: u64 = crate::state::MIN_CLAIM_BALANCE * 100;

    if holder_balance == 0 {
        0
    } else if holder_balance < crate::state::MIN_CLAIM_BALANCE {
        1
    } else if holder_balance < TEN_MT_QUANTA {
        2
    } else if holder_balance < HUNDRED_MT_QUANTA {
        3
    } else {
        4
    }
}

#[cfg(test)]
mod tests {
    use super::render_with_template;
    use crate::state::LAST_SVG_CAPACITY;
    use std::str;
    use std::string::{String, ToString};

    fn render(template: &[u8], seed: &[u8], style_params: &[u8], holder_balance: u64) -> String {
        let mut buf = [0u8; LAST_SVG_CAPACITY];
        let len = render_with_template(template, seed, style_params, holder_balance, &mut buf)
            .expect("template renders");
        str::from_utf8(&buf[..len]).expect("utf8 svg").to_string()
    }

    #[test]
    fn color_mode_substitutes_hue_and_accent() {
        let svg = render(
            br##"<svg fill="{{HUE}}" stroke="{{ACCENT}}"></svg>"##,
            b"color-seed-123456",
            b"mode=color;evolution=1",
            0,
        );

        assert!(!svg.contains("{{HUE}}"));
        assert!(!svg.contains("{{ACCENT}}"));
        assert!(svg.starts_with("<svg fill=\""));
    }

    #[test]
    fn hsl_mode_preserves_hsl_template_shape() {
        let svg = render(
            br##"<svg><rect fill="hsl({{HUE}},80%,60%)"/></svg>"##,
            b"hsl-seed-12345678",
            b"mode=hsl;evolution=0",
            0,
        );

        assert!(svg.starts_with("<svg><rect fill=\"hsl("));
        assert!(svg.ends_with(",80%,60%)\"/></svg>"));
        assert!(!svg.contains("{{HUE}}"));
    }

    #[test]
    fn pixel_mode_uses_bucketed_hue_values() {
        let svg = render(
            br##"<svg data-hue="{{HUE}}" data-accent="{{ACCENT}}"></svg>"##,
            b"pixel-seed-123456",
            b"mode=pixel;evolution=1",
            0,
        );
        let hue_start = svg.find("data-hue=\"").expect("data-hue") + "data-hue=\"".len();
        let hue_end = svg[hue_start..].find('"').expect("hue close") + hue_start;
        let hue: u16 = svg[hue_start..hue_end].parse().expect("numeric hue");

        assert_eq!(hue % 30, 0);
        assert!(!svg.contains("{{ACCENT}}"));
    }

    #[test]
    fn evolution_range_controls_enabled_placeholders() {
        let template =
            br##"<svg a="{{HUE}}" b="{{ACCENT}}" c="{{SEED_HEX}}" d="{{HOLDER_TIER}}"></svg>"##;

        let stage0 = render(template, b"12345678abcdef", b"mode=hsl;evolution=0", 0);
        assert!(!stage0.contains("{{HUE}}"));
        assert!(stage0.contains("{{ACCENT}}"));
        assert!(stage0.contains("{{SEED_HEX}}"));
        assert!(stage0.contains("{{HOLDER_TIER}}"));

        let stage3 = render(
            template,
            b"12345678abcdef",
            b"mode=hsl;evolution=3",
            crate::state::MIN_CLAIM_BALANCE * 100,
        );
        assert!(!stage3.contains("{{HUE}}"));
        assert!(!stage3.contains("{{ACCENT}}"));
        assert!(!stage3.contains("{{SEED_HEX}}"));
        assert!(!stage3.contains("{{HOLDER_TIER}}"));
    }

    #[test]
    fn all_placeholders_substitute_to_expected_literal_shapes() {
        let svg = render(
            br##"<svg hue="{{HUE}}" accent="{{ACCENT}}" seed="{{SEED_HEX}}" tier="{{HOLDER_TIER}}"></svg>"##,
            &[0xab, 0xcd, 0xef, 0x01, 0x23, 0x45, 0x67, 0x89, 0xff],
            b"mode=hsl;evolution=3",
            crate::state::MIN_CLAIM_BALANCE * 10,
        );

        assert!(svg.contains("seed=\"abcdef0123456789\""));
        assert!(svg.contains("tier=\"3\""));
        assert!(!svg.contains("{{"));
    }

    #[test]
    fn unknown_placeholders_are_left_literal() {
        let svg = render(
            br##"<svg known="{{HUE}}" unknown="{{MOOD}}"></svg>"##,
            b"unknown-seed",
            b"mode=hsl;evolution=3",
            0,
        );

        assert!(!svg.contains("{{HUE}}"));
        assert!(svg.contains("unknown=\"{{MOOD}}\""));
    }
}
