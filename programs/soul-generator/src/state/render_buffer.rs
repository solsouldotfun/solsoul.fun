use pinocchio::{error::ProgramError, Address, ProgramResult};

pub const RENDER_BUFFER_SEED: &[u8] = b"render_buffer";

/// Temporary SVG output buffer owned by soul-generator.
/// External renderer programs write SVG bytes here via CPI.
/// The buffer is keyed by (mint, generation) to prevent collisions.
#[repr(C, packed)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RenderBuffer {
    pub renderer_id: u32,
    pub generation: u64,
    pub svg_len: u16,
    pub reserved: [u8; 22],
    pub svg: [u8; super::LAST_SVG_CAPACITY],
}

impl RenderBuffer {
    pub const RENDERER_ID_OFFSET: usize = 0;
    pub const GENERATION_OFFSET: usize = Self::RENDERER_ID_OFFSET + 4;
    pub const SVG_LEN_OFFSET: usize = Self::GENERATION_OFFSET + 8;
    pub const RESERVED_OFFSET: usize = Self::SVG_LEN_OFFSET + 2;
    pub const SVG_OFFSET: usize = Self::RESERVED_OFFSET + 22;
    pub const LEN: usize = Self::SVG_OFFSET + super::LAST_SVG_CAPACITY;

    pub fn new(renderer_id: u32, generation: u64) -> Self {
        Self {
            renderer_id,
            generation,
            svg_len: 0,
            reserved: [0; 22],
            svg: [0; super::LAST_SVG_CAPACITY],
        }
    }

    pub fn unpack(data: &[u8]) -> Result<Self, ProgramError> {
        if data.len() < Self::LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }

        let mut renderer_id = [0u8; 4];
        renderer_id.copy_from_slice(&data[Self::RENDERER_ID_OFFSET..Self::GENERATION_OFFSET]);

        let mut generation = [0u8; 8];
        generation.copy_from_slice(&data[Self::GENERATION_OFFSET..Self::SVG_LEN_OFFSET]);

        let mut svg_len = [0u8; 2];
        svg_len.copy_from_slice(&data[Self::SVG_LEN_OFFSET..Self::RESERVED_OFFSET]);
        let svg_len = u16::from_le_bytes(svg_len);
        if usize::from(svg_len) > super::LAST_SVG_CAPACITY {
            return Err(ProgramError::InvalidAccountData);
        }

        let mut svg = [0u8; super::LAST_SVG_CAPACITY];
        svg.copy_from_slice(&data[Self::SVG_OFFSET..Self::LEN]);

        Ok(Self {
            renderer_id: u32::from_le_bytes(renderer_id),
            generation: u64::from_le_bytes(generation),
            svg_len,
            reserved: [0; 22],
            svg,
        })
    }

    pub fn pack(&self, data: &mut [u8]) -> ProgramResult {
        if data.len() < Self::LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }
        if usize::from(self.svg_len) > super::LAST_SVG_CAPACITY {
            return Err(ProgramError::InvalidAccountData);
        }

        data[..Self::LEN].fill(0);
        data[Self::RENDERER_ID_OFFSET..Self::GENERATION_OFFSET]
            .copy_from_slice(&self.renderer_id.to_le_bytes());
        data[Self::GENERATION_OFFSET..Self::SVG_LEN_OFFSET]
            .copy_from_slice(&self.generation.to_le_bytes());
        data[Self::SVG_LEN_OFFSET..Self::RESERVED_OFFSET]
            .copy_from_slice(&self.svg_len.to_le_bytes());
        data[Self::SVG_OFFSET..Self::LEN].copy_from_slice(&self.svg);
        Ok(())
    }
}

pub fn derive_render_buffer_address(
    mint: &Address,
    generation: u64,
    program_id: &Address,
) -> Address {
    Address::derive_address(
        &[RENDER_BUFFER_SEED, mint.as_ref(), &generation.to_le_bytes()],
        None,
        program_id,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::LAST_SVG_CAPACITY;

    #[test]
    fn layout_size() {
        assert_eq!(RenderBuffer::LEN, 4 + 8 + 2 + 22 + LAST_SVG_CAPACITY);
        assert_eq!(RenderBuffer::LEN, 36 + LAST_SVG_CAPACITY);
        assert_eq!(RenderBuffer::LEN, 4132);
    }

    #[test]
    fn roundtrip() {
        let mut svg = [0u8; LAST_SVG_CAPACITY];
        svg[..11].copy_from_slice(b"<svg></svg>");
        let buf = RenderBuffer {
            renderer_id: 0x0001_0001,
            generation: 42,
            svg_len: 11,
            reserved: [0; 22],
            svg,
        };
        let mut data = [0u8; RenderBuffer::LEN];
        buf.pack(&mut data).unwrap();
        let unpacked = RenderBuffer::unpack(&data).unwrap();
        let renderer_id = unpacked.renderer_id;
        let generation = unpacked.generation;
        let svg_len = unpacked.svg_len;
        let expected_renderer_id = buf.renderer_id;
        let expected_generation = buf.generation;
        let expected_svg_len = buf.svg_len;
        assert_eq!(renderer_id, expected_renderer_id);
        assert_eq!(generation, expected_generation);
        assert_eq!(svg_len, expected_svg_len);
        assert_eq!(&unpacked.svg[..11], b"<svg></svg>");
    }

    #[test]
    fn derive_is_deterministic() {
        let program_id = Address::new_from_array([7; 32]);
        let mint = Address::new_from_array([3; 32]);
        let a = derive_render_buffer_address(&mint, 5, &program_id);
        let b = derive_render_buffer_address(&mint, 5, &program_id);
        assert_eq!(a, b);
    }

    #[test]
    fn unpack_rejects_oversized_svg_len() {
        let mut data = [0u8; RenderBuffer::LEN];
        data[RenderBuffer::SVG_LEN_OFFSET..RenderBuffer::RESERVED_OFFSET]
            .copy_from_slice(&((LAST_SVG_CAPACITY as u16) + 1).to_le_bytes());
        assert_eq!(
            RenderBuffer::unpack(&data),
            Err(ProgramError::InvalidAccountData)
        );
    }
}
