import assert from "node:assert/strict";
import { DEMO_MODE_NOTE, mockRefereeReport, mockTransformProposal } from "../statrumble/lib/demoMock.ts";

const refereeInput = {
  threadId: "11111111-1111-1111-1111-111111111111",
  votes: {
    A: 5,
    B: 2,
    C: 1,
    my_stance: "A",
  },
  snapshotSummary: "Selected average 12.30 over 48 points; previous average 10.10 over 48 points; delta 2.20 (21.78%).",
  messages: [
    {
      content: "I think the jump is mostly a one-time event; we need another week.",
      user_id: "u-1",
      created_at: "2026-02-28T10:00:00.000Z",
    },
    {
      content: "A fair compromise is to remove clear outliers first and compare again before deciding.",
      user_id: "u-2",
      created_at: "2026-02-28T10:05:00.000Z",
    },
  ],
};

const refereeA = mockRefereeReport(refereeInput);
const refereeB = mockRefereeReport(refereeInput);

assert.deepEqual(refereeA, refereeB, "mockRefereeReport should be deterministic for identical input");
assert.equal(refereeA.demo_note, DEMO_MODE_NOTE, "mockRefereeReport should include demo note");
assert.ok(refereeA.data_facts.length >= 3, "mockRefereeReport should include core fact blocks");

const longMessageReport = mockRefereeReport({
  ...refereeInput,
  messages: [
    ...refereeInput.messages,
    {
      content:
        "x".repeat(300),
      user_id: "u-3",
      created_at: "2026-02-28T10:07:00.000Z",
    },
  ],
});
const quoteFact = longMessageReport.data_facts.find((item) => item.fact.startsWith("Recent quote:"));
assert.ok(quoteFact, "mockRefereeReport should include a recent quote fact");
assert.ok((quoteFact?.fact.length ?? 0) <= 170, "recent quote fact should be truncated to a short length");

const proposalInput = {
  prompt: "Clip extremes and optionally smooth noise while preserving trend shape.",
  importId: "22222222-2222-2222-2222-222222222222",
  importMeta: {
    name: "Revenue",
    unit: "USD",
  },
  startTs: "2026-02-01T00:00:00.000Z",
  endTs: "2026-02-28T00:00:00.000Z",
  parentThreadId: "33333333-3333-3333-3333-333333333333",
};

const proposalA = mockTransformProposal(proposalInput);
const proposalB = mockTransformProposal(proposalInput);

assert.deepEqual(proposalA, proposalB, "mockTransformProposal should be deterministic for identical input");
assert.equal(proposalA.transformSpec.version, 1, "transform spec should keep version 1");
assert.equal(proposalA.statsPayload.demo_note, DEMO_MODE_NOTE, "transform stats should include demo note");
assert.ok(proposalA.sqlPreview.includes("Preview only"), "SQL preview should include preview warning");
assert.ok(proposalA.diffReport, "diff report should be present when parentThreadId is provided");
assert.equal(proposalA.diffReport?.parent_thread_id, proposalInput.parentThreadId);

const rootProposal = mockTransformProposal({
  ...proposalInput,
  parentThreadId: null,
});
assert.equal(rootProposal.diffReport, null, "diff report should be null for root proposals");

console.log("verify-demo-mock: OK");
