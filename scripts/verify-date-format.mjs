import assert from "node:assert/strict";
import {
  formatDateLabel,
  formatDateTimeLabel,
  formatDateTimeLabel24,
} from "../statrumble/lib/formatDate.ts";

const cases = [
  {
    input: "2026-02-25T15:00:00Z",
    expectedUi: "2026-02-25 07:00:00",
    expectedDate: "2026-02-25",
    expected24: "2026-02-25 07:00:00",
  },
  {
    input: "2026-02-25T00:02:35Z",
    expectedUi: "2026-02-24 16:02:35",
    expectedDate: "2026-02-24",
    expected24: "2026-02-24 16:02:35",
  },
  {
    input: "2026-02-25T00:02:35",
    expectedUi: "2026-02-25T00:02:35",
    expectedDate: "2026-02-25T00:02:35",
    expected24: "2026-02-25T00:02:35",
  },
];

for (const testCase of cases) {
  const uiLabel = formatDateTimeLabel(testCase.input);
  assert.equal(uiLabel, testCase.expectedUi, `UI label mismatch for ${testCase.input}`);

  if (testCase.expectedDate) {
    const dateLabel = formatDateLabel(testCase.input);
    assert.equal(dateLabel, testCase.expectedDate, `Date label mismatch for ${testCase.input}`);
  }

  if (testCase.expected24) {
    const label24 = formatDateTimeLabel24(testCase.input);
    assert.equal(label24, testCase.expected24, `24h label mismatch for ${testCase.input}`);
  }
}

console.log("verify-date-format: OK");
