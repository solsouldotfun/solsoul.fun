use pinocchio::{error::ProgramError, AccountView};

use crate::layout::{
    GENERATION_OFFSET, RENDERER_ID_OFFSET, RENDER_BUFFER_LEN, RESERVED_OFFSET, SVG_LEN_OFFSET,
    SVG_OFFSET,
};

/// Zero-copy writer for the on-chain `RenderBuffer` account layout.
///
/// Layout (must match soul-generator's RenderBuffer):
/// - [0..4]   renderer_id: u32
/// - [4..12]  generation: u64
/// - [12..14] svg_len: u16
/// - [14..36] reserved: [u8; 22]
/// - [36..]   svg: [u8; MAX_SVG_CAPACITY]
pub struct RenderBufferWriter;

impl RenderBufferWriter {
    /// Write SVG bytes into the RenderBuffer account's data.
    ///
    /// # Errors
    /// - `InvalidAccountData` if the account data is too short.
    /// - `AccountDataTooSmall` if `svg_bytes` exceeds `MAX_SVG_CAPACITY`.
    pub fn write(render_buffer: &mut AccountView, svg_bytes: &[u8]) -> Result<(), ProgramError> {
        if svg_bytes.len() > crate::MAX_SVG_CAPACITY {
            return Err(ProgramError::AccountDataTooSmall);
        }

        let data = unsafe { render_buffer.borrow_unchecked_mut() };
        if data.len() < RENDER_BUFFER_LEN {
            return Err(ProgramError::InvalidAccountData);
        }

        let svg_len = svg_bytes.len() as u16;
        data[SVG_LEN_OFFSET..SVG_LEN_OFFSET + 2].copy_from_slice(&svg_len.to_le_bytes());

        // Clear reserved bytes
        for byte in &mut data[RESERVED_OFFSET..SVG_OFFSET] {
            *byte = 0;
        }

        data[SVG_OFFSET..SVG_OFFSET + svg_bytes.len()].copy_from_slice(svg_bytes);
        Ok(())
    }

    /// Set the renderer_id field (u32, little-endian) on the RenderBuffer account.
    pub fn set_renderer_id(
        render_buffer: &mut AccountView,
        renderer_id: u32,
    ) -> Result<(), ProgramError> {
        let data = unsafe { render_buffer.borrow_unchecked_mut() };
        if data.len() < RENDER_BUFFER_LEN {
            return Err(ProgramError::InvalidAccountData);
        }
        data[RENDERER_ID_OFFSET..RENDERER_ID_OFFSET + 4]
            .copy_from_slice(&renderer_id.to_le_bytes());
        Ok(())
    }

    /// Set the generation field (u64, little-endian) on the RenderBuffer account.
    pub fn set_generation(
        render_buffer: &mut AccountView,
        generation: u64,
    ) -> Result<(), ProgramError> {
        let data = unsafe { render_buffer.borrow_unchecked_mut() };
        if data.len() < RENDER_BUFFER_LEN {
            return Err(ProgramError::InvalidAccountData);
        }
        data[GENERATION_OFFSET..GENERATION_OFFSET + 8].copy_from_slice(&generation.to_le_bytes());
        Ok(())
    }
}
