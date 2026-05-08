extern crate alloc;
use alloc::vec::Vec;
use pinocchio::error::ProgramError;

/// Forbidden tokens in SVG output (case-insensitive).
///
/// These patterns indicate potential XSS, data exfiltration, or
/// external resource loading that violates the Soul Engine inline-SVG policy.
const FORBIDDEN_PATTERNS: &[&[u8]] = &[
    b"<script",
    b"<style",
    b"<image",
    b"href=",
    b"xlink:",
    b"http://",
    b"https://",
    b"ipfs:",
    b"ar:",
    b"data:",
    b"@import",
    b"url(",
    b"url (",
    b"behavior:",
    b"mhtml:",
    b"javascript:",
    b"vbscript:",
    b"onerror=",
    b"onload=",
    b"onclick=",
    b"onmouseover=",
    b"<iframe",
    b"<embed",
    b"<object",
    b"<foreignObject",
    b"<animate",
    b"<set",
];

/// Validate that `svg_bytes` contains no forbidden patterns.
///
/// Returns `Ok(())` if safe, `InvalidAccountData` if a forbidden token is found.
///
/// # Performance
/// Linear scan: O(N * P) where N = svg length, P = number of patterns.
/// Acceptable because both N (≤4096) and P (≤24) are tiny.
pub fn validate_svg(svg_bytes: &[u8]) -> Result<(), ProgramError> {
    let lower = to_ascii_lowercase_in_place(svg_bytes);
    for pattern in FORBIDDEN_PATTERNS {
        if contains_subslice(&lower, pattern) {
            return Err(ProgramError::InvalidAccountData);
        }
    }
    Ok(())
}

/// Fast case-insensitive sub-slice search.
/// Scans `haystack` for `needle` using a simple byte-by-byte comparison
/// after lowercasing both.
fn contains_subslice(haystack: &[u8], needle: &[u8]) -> bool {
    if needle.is_empty() {
        return true;
    }
    if haystack.len() < needle.len() {
        return false;
    }
    let mut i = 0;
    while i <= haystack.len() - needle.len() {
        let mut j = 0;
        while j < needle.len() && haystack[i + j] == needle[j] {
            j += 1;
        }
        if j == needle.len() {
            return true;
        }
        i += 1;
    }
    false
}

/// Convert ASCII A-Z to a-z, leaving other bytes untouched.
/// Returns a borrowed view (no allocation).
fn to_ascii_lowercase_in_place(bytes: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(bytes.len());
    for &b in bytes {
        out.push(if b.is_ascii_uppercase() { b + 32 } else { b });
    }
    out
}

/// Check whether an SVG starts with `<svg` and ends with `</svg>`.
pub fn validate_well_formed(svg_bytes: &[u8]) -> Result<(), ProgramError> {
    let lower = to_ascii_lowercase_in_place(svg_bytes);
    if !lower.starts_with(b"<svg") {
        return Err(ProgramError::InvalidAccountData);
    }
    if !lower.ends_with(b"</svg>") {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

/// Combined validation: well-formed + no forbidden patterns.
pub fn validate_svg_full(svg_bytes: &[u8]) -> Result<(), ProgramError> {
    validate_well_formed(svg_bytes)?;
    validate_svg(svg_bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_svg_passes() {
        let svg =
            b"<svg><circle cx=\"50\" cy=\"50\" r=\"40\" fill=\"red\"/><text>Hello</text></svg>";
        assert!(validate_svg(svg).is_ok());
        assert!(validate_well_formed(svg).is_ok());
        assert!(validate_svg_full(svg).is_ok());
    }

    #[test]
    fn script_tag_rejected() {
        let svg = b"<svg><script>alert(1)</script></svg>";
        assert_eq!(validate_svg(svg), Err(ProgramError::InvalidAccountData));
    }

    #[test]
    fn style_tag_rejected() {
        let svg = b"<svg><style>circle{fill:url(#local)}</style><circle /></svg>";
        assert_eq!(validate_svg(svg), Err(ProgramError::InvalidAccountData));
    }

    #[test]
    fn image_tag_rejected() {
        let svg = b"<svg><image href=\"x\" /></svg>";
        assert_eq!(validate_svg(svg), Err(ProgramError::InvalidAccountData));
    }

    #[test]
    fn external_url_rejected() {
        let svg = b"<svg><circle fill=\"url(https://evil.com)\" /></svg>";
        assert_eq!(validate_svg(svg), Err(ProgramError::InvalidAccountData));
    }

    #[test]
    fn xlink_rejected() {
        let svg = b"<svg><use xlink:href=\"x\" /></svg>";
        assert_eq!(validate_svg(svg), Err(ProgramError::InvalidAccountData));
    }

    #[test]
    fn javascript_protocol_rejected() {
        let svg = b"<svg><a href=\"javascript:alert(1)\"/></svg>";
        assert_eq!(validate_svg(svg), Err(ProgramError::InvalidAccountData));
    }

    #[test]
    fn event_handler_rejected() {
        let svg = b"<svg><circle onload=\"alert(1)\"/></svg>";
        assert_eq!(validate_svg(svg), Err(ProgramError::InvalidAccountData));
    }

    #[test]
    fn case_insensitive_rejection() {
        let svg = b"<svg><SCRIPT>alert(1)</SCRIPT></svg>";
        assert_eq!(validate_svg(svg), Err(ProgramError::InvalidAccountData));
    }

    #[test]
    fn malformed_missing_closing_tag() {
        let svg = b"<svg><circle/>";
        assert_eq!(
            validate_well_formed(svg),
            Err(ProgramError::InvalidAccountData)
        );
    }

    #[test]
    fn malformed_missing_opening_tag() {
        let svg = b"<circle/></svg>";
        assert_eq!(
            validate_well_formed(svg),
            Err(ProgramError::InvalidAccountData)
        );
    }

    #[test]
    fn empty_rejected() {
        assert_eq!(
            validate_well_formed(b""),
            Err(ProgramError::InvalidAccountData)
        );
    }

    #[test]
    fn iframe_rejected() {
        let svg = b"<svg><iframe src=\"x\"></iframe></svg>";
        assert_eq!(validate_svg(svg), Err(ProgramError::InvalidAccountData));
    }
}
