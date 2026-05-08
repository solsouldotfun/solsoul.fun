use crate::state::{
    global_config::assert_global_config_not_paused, SoulAccount, BASE_SVG_TEMPLATE_CAPACITY,
    SOUL_SEED, STYLE_PARAMS_CAPACITY,
};
use crate::svg::theme::{resolve_art_theme, ArtTheme};
use crate::svg::traits::validate_user_core_trait_style_params;
use pinocchio::{error::ProgramError, AccountView, Address, ProgramResult};
use shared::geppetto::{assert_owned_by, assert_pda, assert_signer, assert_writable};

pub fn process(
    program_id: &Address,
    accounts: &mut [AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    if accounts.len() < 3 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }

    let args = parse_upload_args(instruction_data)?;

    let (soul_accounts, rest) = accounts.split_at_mut(1);
    let soul = &mut soul_accounts[0];
    let authority = &rest[0];
    let global_config = &rest[1];

    assert_writable(soul)?;
    assert_owned_by(soul, program_id)?;
    assert_global_config_not_paused(global_config, program_id)?;
    assert_signer(authority)?;

    if soul.data_len() < SoulAccount::LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }

    let (mint, stored_authority) = {
        let data = soul.try_borrow()?;
        read_soul_identity(&data[..SoulAccount::LEN])?
    };

    assert_pda(soul, &[SOUL_SEED, mint.as_ref()], program_id)?;
    if &stored_authority != authority.address() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let mut data = soul.try_borrow_mut()?;
    write_upload_fields(
        &mut data[..SoulAccount::LEN],
        args.template_bytes,
        args.style_params,
    )
}

struct UploadArgs<'a> {
    template_bytes: &'a [u8],
    style_params: &'a [u8],
}

fn parse_upload_args(instruction_data: &[u8]) -> Result<UploadArgs<'_>, ProgramError> {
    if instruction_data.len() < 4 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let template_len = u16::from_le_bytes([instruction_data[0], instruction_data[1]]) as usize;
    let template_start = 2usize;
    let template_end = template_start
        .checked_add(template_len)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    let style_len_end = template_end
        .checked_add(2)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    if instruction_data.len() < style_len_end {
        return Err(ProgramError::InvalidInstructionData);
    }

    let style_len = u16::from_le_bytes([
        instruction_data[template_end],
        instruction_data[template_end + 1],
    ]) as usize;
    let style_start = style_len_end;
    let style_end = style_start
        .checked_add(style_len)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    if instruction_data.len() != style_end {
        return Err(ProgramError::InvalidInstructionData);
    }

    let template_bytes = &instruction_data[template_start..template_end];
    let style_params = &instruction_data[style_start..style_end];
    validate_upload_bytes(template_bytes, style_params)?;

    Ok(UploadArgs {
        template_bytes,
        style_params,
    })
}

fn read_soul_identity(data: &[u8]) -> Result<(Address, Address), ProgramError> {
    if data.len() < SoulAccount::LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }

    let mut mint = [0u8; 32];
    mint.copy_from_slice(&data[SoulAccount::MINT_OFFSET..SoulAccount::AUTHORITY_OFFSET]);

    let mut authority = [0u8; 32];
    authority.copy_from_slice(&data[SoulAccount::AUTHORITY_OFFSET..SoulAccount::CREATED_AT_OFFSET]);

    Ok((
        Address::new_from_array(mint),
        Address::new_from_array(authority),
    ))
}

fn write_upload_fields(
    data: &mut [u8],
    template_bytes: &[u8],
    style_params: &[u8],
) -> ProgramResult {
    validate_upload_bytes(template_bytes, style_params)?;

    data[SoulAccount::BASE_SVG_TEMPLATE_OFFSET..SoulAccount::TEMPLATE_LEN_OFFSET].fill(0);
    data[SoulAccount::BASE_SVG_TEMPLATE_OFFSET
        ..SoulAccount::BASE_SVG_TEMPLATE_OFFSET + template_bytes.len()]
        .copy_from_slice(template_bytes);
    let template_len =
        u16::try_from(template_bytes.len()).map_err(|_| ProgramError::InvalidInstructionData)?;
    data[SoulAccount::TEMPLATE_LEN_OFFSET..SoulAccount::STYLE_PARAMS_OFFSET]
        .copy_from_slice(&template_len.to_le_bytes());

    data[SoulAccount::STYLE_PARAMS_OFFSET..SoulAccount::STYLE_PARAMS_LEN_OFFSET].fill(0);
    data[SoulAccount::STYLE_PARAMS_OFFSET..SoulAccount::STYLE_PARAMS_OFFSET + style_params.len()]
        .copy_from_slice(style_params);
    let style_params_len =
        u16::try_from(style_params.len()).map_err(|_| ProgramError::InvalidInstructionData)?;
    data[SoulAccount::STYLE_PARAMS_LEN_OFFSET..SoulAccount::MIN_CLAIM_BALANCE_OFFSET]
        .copy_from_slice(&style_params_len.to_le_bytes());

    Ok(())
}

#[cfg(test)]
fn apply_upload_to_account(
    account: &mut SoulAccount,
    authority: &Address,
    template_bytes: &[u8],
    style_params: &[u8],
) -> ProgramResult {
    let stored_authority = account.authority;
    if &stored_authority != authority {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let mut data = [0u8; SoulAccount::LEN];
    account.pack(&mut data)?;
    write_upload_fields(&mut data, template_bytes, style_params)?;
    *account = SoulAccount::unpack(&data)?;
    Ok(())
}

fn validate_upload_bytes(template_bytes: &[u8], style_params: &[u8]) -> ProgramResult {
    if template_bytes.len() > BASE_SVG_TEMPLATE_CAPACITY {
        return Err(ProgramError::InvalidInstructionData);
    }
    if style_params.len() > STYLE_PARAMS_CAPACITY {
        return Err(ProgramError::InvalidInstructionData);
    }
    validate_user_core_trait_style_params(style_params)?;
    validate_supported_upload_style_params(style_params, !template_bytes.is_empty())?;
    if template_bytes.is_empty() {
        if resolve_art_theme(style_params, 0) == ArtTheme::CustomTemplate {
            return Err(ProgramError::InvalidInstructionData);
        }
        return Ok(());
    }
    let trimmed = trim_ascii_whitespace(template_bytes);
    if !starts_with_ascii_case_insensitive(trimmed, b"<svg")
        || !ends_with_ascii_case_insensitive(trimmed, b"</svg>")
    {
        return Err(ProgramError::InvalidInstructionData);
    }
    if contains_forbidden_svg_reference(trimmed) {
        return Err(ProgramError::InvalidInstructionData);
    }

    Ok(())
}

fn validate_supported_upload_style_params(
    style_params: &[u8],
    has_template: bool,
) -> ProgramResult {
    let mut pair_start = 0usize;
    while pair_start <= style_params.len() {
        let pair_end = find_byte(style_params, pair_start, b';').unwrap_or(style_params.len());
        if pair_end > pair_start {
            let pair = &style_params[pair_start..pair_end];
            if let Some(equals) = find_byte(pair, 0, b'=') {
                if equals > 0 && equals + 1 < pair.len() {
                    let key = &pair[..equals];
                    let value = &pair[equals + 1..];
                    if key == b"theme" {
                        validate_upload_theme(value, has_template)?;
                    } else if (!has_template && key == b"mode" && value == b"hexagram")
                        || (has_template && is_core_trait_style_key(key))
                    {
                        return Err(ProgramError::InvalidInstructionData);
                    }
                }
            }
        }
        if pair_end == style_params.len() {
            break;
        }
        pair_start = pair_end
            .checked_add(1)
            .ok_or(ProgramError::ArithmeticOverflow)?;
    }

    Ok(())
}

fn validate_upload_theme(value: &[u8], has_template: bool) -> ProgramResult {
    match value {
        b"fractal" | b"field" | b"lattice" | b"chaos" | b"harmonic" | b"pixelfractal"
        | b"pixelart" | b"symphony" => Ok(()),
        b"custom" if has_template => Ok(()),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

fn is_core_trait_style_key(key: &[u8]) -> bool {
    matches!(
        key,
        b"trait_palette" | b"trait_mood" | b"trait_form" | b"trait_background"
    )
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

fn contains_forbidden_svg_reference(template_bytes: &[u8]) -> bool {
    contains_forbidden_tag(template_bytes, b"script")
        || contains_forbidden_tag(template_bytes, b"image")
        || contains_forbidden_tag(template_bytes, b"iframe")
        || contains_forbidden_tag(template_bytes, b"embed")
        || contains_forbidden_tag(template_bytes, b"object")
        || contains_forbidden_tag(template_bytes, b"foreignobject")
        || contains_forbidden_tag(template_bytes, b"animate")
        || contains_forbidden_tag(template_bytes, b"set")
        || contains_attribute_assignment(template_bytes, b"href")
        || contains_attribute_assignment(template_bytes, b"xlink:href")
        || contains_event_handler_assignment(template_bytes)
        || contains_external_scheme(template_bytes)
        || contains_external_url_function(template_bytes)
}

fn trim_ascii_whitespace(bytes: &[u8]) -> &[u8] {
    let mut start = 0usize;
    let mut end = bytes.len();
    while start < end && bytes[start].is_ascii_whitespace() {
        start += 1;
    }
    while end > start && bytes[end - 1].is_ascii_whitespace() {
        end -= 1;
    }
    &bytes[start..end]
}

fn starts_with_ascii_case_insensitive(haystack: &[u8], needle: &[u8]) -> bool {
    haystack.len() >= needle.len() && ascii_matches_at(haystack, 0, needle)
}

fn ends_with_ascii_case_insensitive(haystack: &[u8], needle: &[u8]) -> bool {
    haystack.len() >= needle.len()
        && ascii_matches_at(haystack, haystack.len() - needle.len(), needle)
}

fn contains_forbidden_tag(bytes: &[u8], tag_name: &[u8]) -> bool {
    let mut index = 0usize;
    while index < bytes.len() {
        if bytes[index] != b'<' {
            index += 1;
            continue;
        }

        let mut cursor = index + 1;
        cursor = skip_ascii_whitespace(bytes, cursor);
        if cursor < bytes.len() && bytes[cursor] == b'/' {
            cursor += 1;
            cursor = skip_ascii_whitespace(bytes, cursor);
        }
        if ascii_matches_at(bytes, cursor, tag_name) {
            let after = cursor + tag_name.len();
            if after >= bytes.len() || is_name_boundary(bytes[after]) {
                return true;
            }
        }

        index += 1;
    }

    false
}

fn contains_attribute_assignment(bytes: &[u8], attr_name: &[u8]) -> bool {
    if attr_name.is_empty() || bytes.len() < attr_name.len() {
        return false;
    }

    let mut index = 0usize;
    while index + attr_name.len() <= bytes.len() {
        if is_attribute_boundary_before(bytes, index) && ascii_matches_at(bytes, index, attr_name) {
            let after_name = index + attr_name.len();
            if after_name < bytes.len() && is_attribute_name_boundary(bytes[after_name]) {
                let after_space = skip_ascii_whitespace(bytes, after_name);
                if after_space < bytes.len() && bytes[after_space] == b'=' {
                    return true;
                }
            }
        }
        index += 1;
    }

    false
}

fn contains_event_handler_assignment(bytes: &[u8]) -> bool {
    let mut index = 0usize;
    while index + 3 <= bytes.len() {
        if is_attribute_boundary_before(bytes, index)
            && to_ascii_lower(bytes[index]) == b'o'
            && to_ascii_lower(bytes[index + 1]) == b'n'
            && bytes[index + 2].is_ascii_alphabetic()
        {
            let mut cursor = index + 3;
            while cursor < bytes.len()
                && (bytes[cursor].is_ascii_alphanumeric()
                    || bytes[cursor] == b'-'
                    || bytes[cursor] == b'_')
            {
                cursor += 1;
            }
            let after_space = skip_ascii_whitespace(bytes, cursor);
            if after_space < bytes.len() && bytes[after_space] == b'=' {
                return true;
            }
        }
        index += 1;
    }

    false
}

fn contains_external_scheme(bytes: &[u8]) -> bool {
    for scheme in [b"http:".as_slice(), b"https:", b"ipfs:", b"ar:", b"data:"] {
        if contains_ascii_case_insensitive(bytes, scheme) {
            return true;
        }
    }

    false
}

fn contains_external_url_function(bytes: &[u8]) -> bool {
    let mut index = 0usize;
    while index + 4 <= bytes.len() {
        if !ascii_matches_at(bytes, index, b"url(") {
            index += 1;
            continue;
        }

        let mut cursor = skip_ascii_whitespace(bytes, index + 4);
        if cursor < bytes.len() && (bytes[cursor] == b'\'' || bytes[cursor] == b'"') {
            cursor += 1;
            cursor = skip_ascii_whitespace(bytes, cursor);
        }

        for scheme in [b"http:".as_slice(), b"https:", b"ipfs:", b"ar:", b"data:"] {
            if ascii_matches_at(bytes, cursor, scheme) {
                return true;
            }
        }
        if cursor + 1 < bytes.len() && bytes[cursor] == b'/' && bytes[cursor + 1] == b'/' {
            return true;
        }

        index += 1;
    }

    false
}

fn skip_ascii_whitespace(bytes: &[u8], mut index: usize) -> usize {
    while index < bytes.len() && bytes[index].is_ascii_whitespace() {
        index += 1;
    }
    index
}

fn is_name_boundary(byte: u8) -> bool {
    byte.is_ascii_whitespace() || byte == b'/' || byte == b'>'
}

fn is_attribute_name_boundary(byte: u8) -> bool {
    byte.is_ascii_whitespace() || byte == b'=' || byte == b'/' || byte == b'>'
}

fn is_attribute_boundary_before(bytes: &[u8], index: usize) -> bool {
    index == 0 || bytes[index - 1].is_ascii_whitespace() || bytes[index - 1] == b'<'
}

fn contains_ascii_case_insensitive(haystack: &[u8], needle: &[u8]) -> bool {
    if needle.is_empty() || haystack.len() < needle.len() {
        return false;
    }

    let last_start = haystack.len() - needle.len();
    let mut start = 0usize;
    while start <= last_start {
        let mut offset = 0usize;
        let mut matched = true;
        while offset < needle.len() {
            if to_ascii_lower(haystack[start + offset]) != to_ascii_lower(needle[offset]) {
                matched = false;
                break;
            }
            offset += 1;
        }
        if matched {
            return true;
        }
        start += 1;
    }

    false
}

fn ascii_matches_at(haystack: &[u8], start: usize, needle: &[u8]) -> bool {
    if start + needle.len() > haystack.len() {
        return false;
    }

    let mut offset = 0usize;
    while offset < needle.len() {
        if to_ascii_lower(haystack[start + offset]) != to_ascii_lower(needle[offset]) {
            return false;
        }
        offset += 1;
    }

    true
}

fn to_ascii_lower(byte: u8) -> u8 {
    if byte.is_ascii_uppercase() {
        byte + 32
    } else {
        byte
    }
}

#[cfg(test)]
mod tests {
    use super::apply_upload_to_account;
    use crate::state::{
        SoulAccount, BASE_SVG_TEMPLATE_CAPACITY, PROVENANCE_SIDE_NONE, SEED_HASH_LEN,
        STYLE_PARAMS_CAPACITY,
    };
    use pinocchio::{error::ProgramError, Address};
    use shared::amm::TargetAmm;
    use std::vec;

    fn account_with_authority(authority: Address) -> SoulAccount {
        SoulAccount {
            mint: Address::new_from_array([1; 32]),
            authority,
            created_at: 1_714_200_000,
            generation_count: 0,
            last_svg_len: 0,
            last_svg: [0; crate::state::LAST_SVG_CAPACITY],
            base_svg_template: [0; crate::state::BASE_SVG_TEMPLATE_CAPACITY],
            template_len: 0,
            style_params: [0; crate::state::STYLE_PARAMS_CAPACITY],
            style_params_len: 0,
            min_claim_balance: 0,
            claim_count: 0,
            meme_symbol: [0; crate::state::MEME_SYMBOL_CAPACITY],
            meme_symbol_len: 0,
            target_amm: TargetAmm::Raydium as u8,
            provenance_generation: 0,
            provenance_side: PROVENANCE_SIDE_NONE,
            provenance_amount: 0,
            provenance_trader: Address::new_from_array([0; 32]),
            provenance_token_account: Address::new_from_array([0; 32]),
            provenance_mint: Address::new_from_array([0; 32]),
            provenance_soul: Address::new_from_array([0; 32]),
            provenance_seed_hash: [0; SEED_HASH_LEN],
            provenance_token_amount: 0,
        }
    }

    #[test]
    fn authorized_upload_writes_template_and_style_fields() {
        let authority = Address::new_from_array([7; 32]);
        let mut account = account_with_authority(authority);
        let template = b"<svg><circle fill=\"{{HUE}}\" /></svg>";
        let style = b"mode=hsl;evolution=2";

        apply_upload_to_account(&mut account, &authority, template, style)
            .expect("authorized upload succeeds");

        let template_len = account.template_len;
        assert_eq!(template_len, template.len() as u16);
        assert_eq!(
            &account.base_svg_template[..template.len()],
            template.as_slice()
        );
        assert!(account.base_svg_template[template.len()..]
            .iter()
            .all(|byte| *byte == 0));
        let style_params_len = account.style_params_len;
        assert_eq!(style_params_len, style.len() as u16);
        assert_eq!(&account.style_params[..style.len()], style.as_slice());
        assert!(account.style_params[style.len()..]
            .iter()
            .all(|byte| *byte == 0));
    }

    #[test]
    fn built_in_theme_style_params_can_be_uploaded_without_template_bytes() {
        let authority = Address::new_from_array([7; 32]);
        let mut account = account_with_authority(authority);
        let style = b"theme=symphony";

        apply_upload_to_account(&mut account, &authority, b"", style)
            .expect("built-in theme style upload succeeds");

        let template_len = account.template_len;
        assert_eq!(template_len, 0);
        let style_params_len = account.style_params_len;
        assert_eq!(style_params_len, style.len() as u16);
        assert_eq!(&account.style_params[..style.len()], style.as_slice());
    }

    #[test]
    fn unsupported_legacy_theme_uploads_are_rejected() {
        let authority = Address::new_from_array([7; 32]);

        for style in [
            b"theme=hexagram".as_slice(),
            b"theme=neonpuff".as_slice(),
            b"theme=soulpuff".as_slice(),
            b"theme=monochrome".as_slice(),
            b"theme=signal".as_slice(),
            b"theme=unipeg".as_slice(),
            b"theme=pixel_fractal".as_slice(),
            b"theme=pixel_art".as_slice(),
            b"theme=unknown".as_slice(),
            b"mode=hexagram".as_slice(),
        ] {
            let mut account = account_with_authority(authority);
            assert_eq!(
                apply_upload_to_account(&mut account, &authority, b"", style),
                Err(ProgramError::InvalidInstructionData),
                "unsupported legacy style must be rejected: {}",
                core::str::from_utf8(style).unwrap_or("<non-utf8>")
            );
        }
    }

    #[test]
    fn custom_template_rejects_core_trait_style_params_until_placeholders_are_supported() {
        let authority = Address::new_from_array([7; 32]);
        let mut account = account_with_authority(authority);

        assert_eq!(
            apply_upload_to_account(
                &mut account,
                &authority,
                b"<svg><circle fill=\"{{HUE}}\" /></svg>",
                b"theme=custom;mode=hsl;evolution=3;trait_palette=ember"
            ),
            Err(ProgramError::InvalidInstructionData)
        );
    }

    #[test]
    fn custom_theme_without_template_bytes_is_rejected() {
        let authority = Address::new_from_array([7; 32]);
        let mut account = account_with_authority(authority);

        assert_eq!(
            apply_upload_to_account(&mut account, &authority, b"", b"theme=custom"),
            Err(ProgramError::InvalidInstructionData)
        );
    }

    #[test]
    fn unauthorized_signer_is_rejected() {
        let authority = Address::new_from_array([7; 32]);
        let other_signer = Address::new_from_array([8; 32]);
        let mut account = account_with_authority(authority);

        assert_eq!(
            apply_upload_to_account(&mut account, &other_signer, b"<svg />", b""),
            Err(ProgramError::MissingRequiredSignature)
        );
    }

    #[test]
    fn oversize_template_is_rejected() {
        let authority = Address::new_from_array([7; 32]);
        let mut account = account_with_authority(authority);
        let mut template = vec![b'a'; BASE_SVG_TEMPLATE_CAPACITY + 1];
        template[..4].copy_from_slice(b"<svg");

        assert_eq!(
            apply_upload_to_account(&mut account, &authority, &template, b""),
            Err(ProgramError::InvalidInstructionData)
        );
    }

    #[test]
    fn oversize_style_params_are_rejected() {
        let authority = Address::new_from_array([7; 32]);
        let mut account = account_with_authority(authority);
        let style_params = vec![b'a'; STYLE_PARAMS_CAPACITY + 1];

        assert_eq!(
            apply_upload_to_account(&mut account, &authority, b"<svg />", &style_params),
            Err(ProgramError::InvalidInstructionData)
        );
    }

    #[test]
    fn non_svg_prefix_is_rejected() {
        let authority = Address::new_from_array([7; 32]);
        let mut account = account_with_authority(authority);

        assert_eq!(
            apply_upload_to_account(&mut account, &authority, b"<html />", b""),
            Err(ProgramError::InvalidInstructionData)
        );
    }

    #[test]
    fn external_reference_templates_are_rejected() {
        let authority = Address::new_from_array([7; 32]);
        let mut account = account_with_authority(authority);

        for template in [
            br#"<svg><image href="https://example.invalid/soul.png" /></svg>"#.as_slice(),
            br#"<svg><rect fill="url(https://example.invalid/remote)" /></svg>"#.as_slice(),
            br#"<svg><ScRiPt>alert(1)</ScRiPt></svg>"#.as_slice(),
            b"<svg><IMAGE\nHREF = 'https://example.invalid/soul.png' /></svg>".as_slice(),
            b"<svg><use\nxlink:href = '#local-symbol' /></svg>".as_slice(),
            b"<svg><a\tHREF=https://example.invalid>bad</a></svg>".as_slice(),
            b"<svg><rect fill=\"url(  ' ipfs://bafybad'  )\" /></svg>".as_slice(),
            b"<svg><rect stroke=\"url(\n\tHTTPS://example.invalid/paint )\" /></svg>".as_slice(),
            b"<svg><text>data:text/plain,remote</text></svg>".as_slice(),
            b"<svg><text>ar://remote-id</text></svg>".as_slice(),
            b"<svg onload=\"alert(1)\"></svg>".as_slice(),
            b"<svg><circle OnError = 'alert(1)' /></svg>".as_slice(),
            b"<svg><foreignObject><div>bad</div></foreignObject></svg>".as_slice(),
            b"<svg><animate attributeName=\"x\" /></svg>".as_slice(),
            b"<svg><object data=\"x\"></object></svg>".as_slice(),
        ] {
            assert_eq!(
                apply_upload_to_account(&mut account, &authority, template, b""),
                Err(ProgramError::InvalidInstructionData),
                "template should reject normalized external reference: {}",
                core::str::from_utf8(template).unwrap_or("<non-utf8>")
            );
        }
    }

    #[test]
    fn protocol_relative_css_url_templates_are_rejected() {
        let authority = Address::new_from_array([7; 32]);
        let mut account = account_with_authority(authority);

        for template in [
            b"<svg><rect fill=\"url( //example.invalid/pattern.svg#p)\" /></svg>".as_slice(),
            b"<svg><rect fill=\"URL(//example.invalid/pattern.svg#p)\" /></svg>".as_slice(),
            b"<svg><rect fill=\"url(  '//example.invalid/pattern.svg#p'  )\" /></svg>".as_slice(),
            b"<svg><rect fill='url(\n\t\"//example.invalid/pattern.svg#p\" )' /></svg>".as_slice(),
        ] {
            assert_eq!(
                apply_upload_to_account(&mut account, &authority, template, b""),
                Err(ProgramError::InvalidInstructionData),
                "template should reject protocol-relative url(...) reference: {}",
                core::str::from_utf8(template).unwrap_or("<non-utf8>")
            );
        }
    }

    #[test]
    fn local_fragment_css_url_templates_remain_allowed() {
        let authority = Address::new_from_array([7; 32]);
        let mut account = account_with_authority(authority);

        for template in [
            b"<svg><defs><linearGradient id=\"p\" /></defs><rect fill=\"url(#p)\" /></svg>"
                .as_slice(),
            b"<svg><defs><linearGradient id=\"p\" /></defs><rect fill=\"url( '#p' )\" /></svg>"
                .as_slice(),
        ] {
            assert_eq!(
                apply_upload_to_account(&mut account, &authority, template, b""),
                Ok(()),
                "template should allow local fragment url(...) reference: {}",
                core::str::from_utf8(template).unwrap_or("<non-utf8>")
            );
        }
    }
}
