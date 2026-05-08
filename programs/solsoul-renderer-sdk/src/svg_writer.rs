use pinocchio::error::ProgramError;

/// Zero-allocation SVG builder for on-chain renderer programs.
///
/// Writes UTF-8 SVG fragments into a pre-allocated byte buffer.
/// All operations are bounds-checked and return `AccountDataTooSmall`
/// on overflow.
pub struct SvgWriter<'a> {
    buf: &'a mut [u8],
    len: usize,
}

impl<'a> SvgWriter<'a> {
    /// Create a new `SvgWriter` backed by `buf`.
    pub fn new(buf: &'a mut [u8]) -> Self {
        Self { buf, len: 0 }
    }

    /// Current written length in bytes.
    pub fn len(&self) -> usize {
        self.len
    }

    pub fn is_empty(&self) -> bool {
        self.len == 0
    }

    /// Remaining capacity in bytes.
    pub fn remaining(&self) -> usize {
        self.buf.len().saturating_sub(self.len)
    }

    /// Write raw bytes.
    pub fn write_bytes(&mut self, value: &[u8]) -> Result<(), ProgramError> {
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

    /// Write a UTF-8 string.
    pub fn write_str(&mut self, value: &str) -> Result<(), ProgramError> {
        self.write_bytes(value.as_bytes())
    }

    /// Write a `u16` as decimal digits.
    pub fn write_u16(&mut self, value: u16) -> Result<(), ProgramError> {
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

    /// Write a `u32` as decimal digits.
    pub fn write_u32(&mut self, value: u32) -> Result<(), ProgramError> {
        if value == 0 {
            return self.write_bytes(b"0");
        }
        let mut digits = [0u8; 10];
        let mut cursor = digits.len();
        let mut remaining = value;
        while remaining > 0 {
            cursor -= 1;
            digits[cursor] = b'0' + (remaining % 10) as u8;
            remaining /= 10;
        }
        self.write_bytes(&digits[cursor..])
    }

    /// Write a `u64` as decimal digits.
    pub fn write_u64(&mut self, value: u64) -> Result<(), ProgramError> {
        if value == 0 {
            return self.write_bytes(b"0");
        }
        let mut digits = [0u8; 20];
        let mut cursor = digits.len();
        let mut remaining = value;
        while remaining > 0 {
            cursor -= 1;
            digits[cursor] = b'0' + (remaining % 10) as u8;
            remaining /= 10;
        }
        self.write_bytes(&digits[cursor..])
    }

    /// Write a signed `i64` as decimal digits (with minus sign if negative).
    pub fn write_i64(&mut self, value: i64) -> Result<(), ProgramError> {
        if value < 0 {
            self.write_bytes(b"-")?;
            self.write_u64(value.abs_diff(0))
        } else {
            self.write_u64(value as u64)
        }
    }

    /// Open a root `<svg>` tag with a viewBox.
    pub fn open_svg(&mut self, width: u16, height: u16) -> Result<(), ProgramError> {
        self.write_bytes(b"<svg xmlns=\"http://www.w3.org/2000/svg\"")?;
        self.write_bytes(b" viewBox=\"0 0 ")?;
        self.write_u16(width)?;
        self.write_bytes(b" ")?;
        self.write_u16(height)?;
        self.write_bytes(b"\">")
    }

    /// Open a root `<svg>` tag with custom attributes.
    pub fn open_svg_with_attrs(&mut self, attrs: &str) -> Result<(), ProgramError> {
        self.write_bytes(b"<svg xmlns=\"http://www.w3.org/2000/svg\" ")?;
        self.write_str(attrs)?;
        self.write_bytes(b">")
    }

    /// Close the root `</svg>` tag.
    pub fn close_svg(&mut self) -> Result<(), ProgramError> {
        self.write_bytes(b"</svg>")
    }

    /// Write a `<rect>` element.
    pub fn rect(
        &mut self,
        x: i64,
        y: i64,
        width: u64,
        height: u64,
        fill: &str,
    ) -> Result<(), ProgramError> {
        self.write_bytes(b"<rect x=\"")?;
        self.write_i64(x)?;
        self.write_bytes(b"\" y=\"")?;
        self.write_i64(y)?;
        self.write_bytes(b"\" width=\"")?;
        self.write_u64(width)?;
        self.write_bytes(b"\" height=\"")?;
        self.write_u64(height)?;
        self.write_bytes(b"\" fill=\"")?;
        self.write_str(fill)?;
        self.write_bytes(b"\"/>")
    }

    /// Write a `<circle>` element.
    pub fn circle(&mut self, cx: i64, cy: i64, r: u64, fill: &str) -> Result<(), ProgramError> {
        self.write_bytes(b"<circle cx=\"")?;
        self.write_i64(cx)?;
        self.write_bytes(b"\" cy=\"")?;
        self.write_i64(cy)?;
        self.write_bytes(b"\" r=\"")?;
        self.write_u64(r)?;
        self.write_bytes(b"\" fill=\"")?;
        self.write_str(fill)?;
        self.write_bytes(b"\"/>")
    }

    /// Write a `<path>` element with `d` attribute.
    pub fn path(&mut self, d: &str, fill: &str) -> Result<(), ProgramError> {
        self.write_bytes(b"<path d=\"")?;
        self.write_str(d)?;
        self.write_bytes(b"\" fill=\"")?;
        self.write_str(fill)?;
        self.write_bytes(b"\"/>")
    }

    /// Write a `<g>` group open tag with optional attributes.
    pub fn open_group(&mut self, attrs: Option<&str>) -> Result<(), ProgramError> {
        self.write_bytes(b"<g")?;
        if let Some(a) = attrs {
            self.write_bytes(b" ")?;
            self.write_str(a)?;
        }
        self.write_bytes(b">")
    }

    /// Close a `</g>` group.
    pub fn close_group(&mut self) -> Result<(), ProgramError> {
        self.write_bytes(b"</g>")
    }

    /// Write a `<line>` element.
    pub fn line(
        &mut self,
        x1: i64,
        y1: i64,
        x2: i64,
        y2: i64,
        stroke: &str,
        stroke_width: u16,
    ) -> Result<(), ProgramError> {
        self.write_bytes(b"<line x1=\"")?;
        self.write_i64(x1)?;
        self.write_bytes(b"\" y1=\"")?;
        self.write_i64(y1)?;
        self.write_bytes(b"\" x2=\"")?;
        self.write_i64(x2)?;
        self.write_bytes(b"\" y2=\"")?;
        self.write_i64(y2)?;
        self.write_bytes(b"\" stroke=\"")?;
        self.write_str(stroke)?;
        self.write_bytes(b"\" stroke-width=\"")?;
        self.write_u16(stroke_width)?;
        self.write_bytes(b"\"/>")
    }

    /// Write a `<polygon>` element.
    pub fn polygon(&mut self, points: &str, fill: &str) -> Result<(), ProgramError> {
        self.write_bytes(b"<polygon points=\"")?;
        self.write_str(points)?;
        self.write_bytes(b"\" fill=\"")?;
        self.write_str(fill)?;
        self.write_bytes(b"\"/>")
    }

    /// Write a `<text>` element (content is escaped by caller).
    pub fn text(
        &mut self,
        x: i64,
        y: i64,
        content: &str,
        fill: &str,
        font_size: u16,
    ) -> Result<(), ProgramError> {
        self.write_bytes(b"<text x=\"")?;
        self.write_i64(x)?;
        self.write_bytes(b"\" y=\"")?;
        self.write_i64(y)?;
        self.write_bytes(b"\" fill=\"")?;
        self.write_str(fill)?;
        self.write_bytes(b"\" font-size=\"")?;
        self.write_u16(font_size)?;
        self.write_bytes(b"\">")?;
        self.write_str(content)?;
        self.write_bytes(b"</text>")
    }

    /// Write a `<defs>` open tag.
    pub fn open_defs(&mut self) -> Result<(), ProgramError> {
        self.write_bytes(b"<defs>")
    }

    /// Close `</defs>`.
    pub fn close_defs(&mut self) -> Result<(), ProgramError> {
        self.write_bytes(b"</defs>")
    }

    /// Write a `<linearGradient>` open tag.
    pub fn open_linear_gradient(
        &mut self,
        id: &str,
        x1: &str,
        y1: &str,
        x2: &str,
        y2: &str,
    ) -> Result<(), ProgramError> {
        self.write_bytes(b"<linearGradient id=\"")?;
        self.write_str(id)?;
        self.write_bytes(b"\" x1=\"")?;
        self.write_str(x1)?;
        self.write_bytes(b"\" y1=\"")?;
        self.write_str(y1)?;
        self.write_bytes(b"\" x2=\"")?;
        self.write_str(x2)?;
        self.write_bytes(b"\" y2=\"")?;
        self.write_str(y2)?;
        self.write_bytes(b"\">")
    }

    /// Write a `<stop>` gradient stop.
    pub fn gradient_stop(&mut self, offset: &str, stop_color: &str) -> Result<(), ProgramError> {
        self.write_bytes(b"<stop offset=\"")?;
        self.write_str(offset)?;
        self.write_bytes(b"\" stop-color=\"")?;
        self.write_str(stop_color)?;
        self.write_bytes(b"\"/>")
    }

    /// Close `</linearGradient>`.
    pub fn close_linear_gradient(&mut self) -> Result<(), ProgramError> {
        self.write_bytes(b"</linearGradient>")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_str_and_bytes() {
        let mut buf = [0u8; 64];
        let mut w = SvgWriter::new(&mut buf);
        w.write_str("<svg>").unwrap();
        w.write_bytes(b"</circle>").unwrap();
        let len = w.len();
        drop(w);
        assert_eq!(&buf[..len], b"<svg></circle>");
    }

    #[test]
    fn overflow_returns_error() {
        let mut buf = [0u8; 5];
        let mut w = SvgWriter::new(&mut buf);
        assert!(w.write_str("<svg>").is_ok());
        assert_eq!(w.write_str("x"), Err(ProgramError::AccountDataTooSmall));
    }

    #[test]
    fn u16_formatting() {
        let mut buf = [0u8; 32];
        let mut w = SvgWriter::new(&mut buf);
        w.write_u16(0).unwrap();
        w.write_bytes(b",").unwrap();
        w.write_u16(42).unwrap();
        w.write_bytes(b",").unwrap();
        w.write_u16(65535).unwrap();
        let len = w.len();
        drop(w);
        assert_eq!(&buf[..len], b"0,42,65535");
    }

    #[test]
    fn open_close_svg_produces_valid_root() {
        let mut buf = [0u8; 256];
        let mut w = SvgWriter::new(&mut buf);
        w.open_svg(200, 200).unwrap();
        w.close_svg().unwrap();
        let len = w.len();
        drop(w);
        let svg = core::str::from_utf8(&buf[..len]).unwrap();
        assert!(
            svg.starts_with("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">")
        );
        assert!(svg.ends_with("</svg>"));
    }

    #[test]
    fn circle_element_format() {
        let mut buf = [0u8; 256];
        let mut w = SvgWriter::new(&mut buf);
        w.circle(50, 50, 25, "#ff0000").unwrap();
        let len = w.len();
        drop(w);
        let svg = core::str::from_utf8(&buf[..len]).unwrap();
        assert_eq!(
            svg,
            "<circle cx=\"50\" cy=\"50\" r=\"25\" fill=\"#ff0000\"/>"
        )
    }

    #[test]
    fn rect_with_negative_coords() {
        let mut buf = [0u8; 256];
        let mut w = SvgWriter::new(&mut buf);
        w.rect(-10, -20, 100, 200, "blue").unwrap();
        let len = w.len();
        drop(w);
        let svg = core::str::from_utf8(&buf[..len]).unwrap();
        assert!(svg.contains("x=\"-10\""));
        assert!(svg.contains("y=\"-20\""));
    }

    #[test]
    fn line_element_format() {
        let mut buf = [0u8; 256];
        let mut w = SvgWriter::new(&mut buf);
        w.line(0, 0, 100, 100, "black", 2).unwrap();
        let len = w.len();
        drop(w);
        let svg = core::str::from_utf8(&buf[..len]).unwrap();
        assert!(svg.contains("stroke=\"black\""));
        assert!(svg.contains("stroke-width=\"2\""));
    }

    #[test]
    fn gradient_roundtrip() {
        let mut buf = [0u8; 512];
        let mut w = SvgWriter::new(&mut buf);
        w.open_defs().unwrap();
        w.open_linear_gradient("g1", "0%", "0%", "100%", "100%")
            .unwrap();
        w.gradient_stop("0%", "#ff0000").unwrap();
        w.gradient_stop("100%", "#0000ff").unwrap();
        w.close_linear_gradient().unwrap();
        w.close_defs().unwrap();
        let len = w.len();
        drop(w);
        let svg = core::str::from_utf8(&buf[..len]).unwrap();
        assert!(svg.contains("<linearGradient id=\"g1\""));
        assert!(svg.contains("<stop offset=\"0%\" stop-color=\"#ff0000\"/>"));
    }
}
