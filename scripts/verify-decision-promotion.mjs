import assert from "node:assert/strict";
import {
  PROMOTE_REQUIRES_JUDGE_MESSAGE,
  getPromotableRefereeReport,
  getPromoteAvailability,
} from "../statrumble/lib/decisions/promotion.ts";
import { mockRefereeReport } from "../statrumble/lib/demoMock.ts";

const validReport = mockRefereeReport({
  threadId: "11111111-1111-1111-1111-111111111111",
  votes: {
    A: 4,
    B: 1,
    C: 0,
    my_stance: "A",
  },
  snapshotSummary: "Selected average 12.30 over 48 points; previous average 10.10 over 48 points; delta 2.20 (21.78%).",
  messages: [
    {
      content: "The jump looks durable enough to justify action.",
      user_id: "u-1",
      created_at: "2026-02-28T10:00:00.000Z",
    },
  ],
});

assert.equal(getPromotableRefereeReport(null), null, "null referee report should not be promotable");
assert.equal(
  getPromotableRefereeReport({ tldr: "missing fields" }),
  null,
  "invalid referee report should not be promotable",
);
assert.equal(
  getPromotableRefereeReport({
    ...validReport,
    tldr: "   ",
  }),
  null,
  "empty referee summary should not be promotable",
);

const promotable = getPromotableRefereeReport(validReport);
assert.ok(promotable, "valid referee report should be promotable");
assert.equal(promotable?.summary, validReport.tldr);
assert.deepEqual(promotable?.report, validReport);

assert.deepEqual(
  getPromoteAvailability({
    decisionId: null,
    refereeReport: null,
  }),
  {
    canPromote: false,
    reason: PROMOTE_REQUIRES_JUDGE_MESSAGE,
  },
  "promotion should be blocked before judge",
);

assert.deepEqual(
  getPromoteAvailability({
    decisionId: null,
    refereeReport: validReport,
  }),
  {
    canPromote: true,
    reason: null,
  },
  "promotion should be allowed after a valid judge report",
);

assert.deepEqual(
  getPromoteAvailability({
    decisionId: "22222222-2222-2222-2222-222222222222",
    refereeReport: validReport,
  }),
  {
    canPromote: false,
    reason: null,
  },
  "existing decisions should suppress the promote action instead of showing an error",
);

console.log("verify-decision-promotion: OK");
