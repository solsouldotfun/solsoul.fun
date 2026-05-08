pub const BONDING_CURVE_PROGRAM_ID: [u8; 32] =
    pinocchio_pubkey::pubkey!("CoL4Sti1wZbv8tJSYXC6pLSzhwj9eeArw9mdAbsS69un");

pub const SOUL_GENERATOR_PROGRAM_ID: [u8; 32] =
    pinocchio_pubkey::pubkey!("34erFyVvAiLsTwDivcauQCJnVX16ZjEwgJ6tEs5NeaMZ");

pub const TRANSFER_HOOK_PROGRAM_ID: [u8; 32] =
    pinocchio_pubkey::pubkey!("Gccbqia51Z8qpdeWvp1yGTrTwoyJX6WNGhFyH5pnPW66");

#[cfg(test)]
mod tests {
    use super::{BONDING_CURVE_PROGRAM_ID, SOUL_GENERATOR_PROGRAM_ID, TRANSFER_HOOK_PROGRAM_ID};

    #[test]
    fn bonding_curve_program_id_matches_devnet_deployment() {
        assert_eq!(
            BONDING_CURVE_PROGRAM_ID,
            pinocchio_pubkey::pubkey!("CoL4Sti1wZbv8tJSYXC6pLSzhwj9eeArw9mdAbsS69un")
        );
    }

    #[test]
    fn soul_generator_program_id_matches_devnet_deployment() {
        assert_eq!(
            SOUL_GENERATOR_PROGRAM_ID,
            pinocchio_pubkey::pubkey!("34erFyVvAiLsTwDivcauQCJnVX16ZjEwgJ6tEs5NeaMZ")
        );
    }

    #[test]
    fn transfer_hook_program_id_matches_devnet_deployment() {
        assert_eq!(
            TRANSFER_HOOK_PROGRAM_ID,
            pinocchio_pubkey::pubkey!("Gccbqia51Z8qpdeWvp1yGTrTwoyJX6WNGhFyH5pnPW66")
        );
    }
}
