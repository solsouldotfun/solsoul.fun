import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CLAIM_INSUFFICIENT_PROVENANCE_ERROR,
  TRANSFER_HOOK_BOUNDARY_BREAK_ERROR,
  assertExpectedNegativeFailure,
} from "./devnet-negative-assertions.ts";

describe("devnet negative assertion helpers", () => {
  it("accepts the non-qualifying claim provenance custom error from status err", () => {
    assert.doesNotThrow(() =>
      assertExpectedNegativeFailure({
        label: "non-qualifying claim",
        err: { InstructionError: [0, { Custom: CLAIM_INSUFFICIENT_PROVENANCE_ERROR }] },
        logs: ["Program log: custom program error: 0x303"],
        expectation: {
          customErrorCode: CLAIM_INSUFFICIENT_PROVENANCE_ERROR,
          requiredLogFragments: [],
        },
      }),
    );
  });

  it("accepts the boundary hook custom error from nested logs", () => {
    assert.doesNotThrow(() =>
      assertExpectedNegativeFailure({
        label: "boundary-breaking hook transfer",
        err: { InstructionError: [0, { Custom: 36 }] },
        logs: [
          "Program log: SolSoul Transfer Hook: rejecting boundary-breaking transfer active_receipts=1 post_whole=0",
          "Program failed: custom program error: 0x1b5c",
        ],
        expectation: {
          customErrorCode: TRANSFER_HOOK_BOUNDARY_BREAK_ERROR,
          requiredLogFragments: ["rejecting boundary-breaking transfer"],
        },
      }),
    );
  });

  it("rejects unexpected success instead of accepting later simulation errors", () => {
    assert.throws(
      () =>
        assertExpectedNegativeFailure({
          label: "non-qualifying claim",
          err: null,
          logs: ["Program log: custom program error: 0x303"],
          expectation: {
            customErrorCode: CLAIM_INSUFFICIENT_PROVENANCE_ERROR,
            requiredLogFragments: [],
          },
        }),
      /unexpectedly succeeded/,
    );
  });

  it("rejects the wrong custom error code even when the transaction failed", () => {
    assert.throws(
      () =>
        assertExpectedNegativeFailure({
          label: "boundary-breaking hook transfer",
          err: { InstructionError: [0, { Custom: 9999 }] },
          logs: ["Program failed: custom program error: 0x270f"],
          expectation: {
            customErrorCode: TRANSFER_HOOK_BOUNDARY_BREAK_ERROR,
            requiredLogFragments: ["rejecting boundary-breaking transfer"],
          },
        }),
      /expected custom error 7004/,
    );
  });
});
