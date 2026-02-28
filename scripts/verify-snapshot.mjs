import assert from "node:assert/strict";
import { extractSelectedSeries, mergeSelectedSeriesIntoSnapshot } from "../statrumble/lib/snapshot.ts";

const selectedPointsShape = extractSelectedSeries({
  selected_points: [
    { ts: "2026-02-28T00:00:00Z", value: "10.5" },
    { ts: "2026-02-28T01:00:00Z", value: 12 },
  ],
});

assert.ok(selectedPointsShape && selectedPointsShape.length === 2, "selected_points shape should parse");
assert.equal(selectedPointsShape?.[0]?.value, 10.5);

const selectedRangeShape = extractSelectedSeries({
  selectedRange: {
    points: [
      { ts: "2026-02-28T02:00:00Z", value: "13" },
      { ts: "2026-02-28T03:00:00Z", value: "14.25" },
    ],
  },
});

assert.ok(selectedRangeShape && selectedRangeShape.length === 2, "selectedRange.points shape should parse");

const selectedShape = extractSelectedSeries({
  selected: {
    points: [
      [1700000000000, "2.75"],
      [1700003600000, 3],
      ["", 9],
    ],
  },
});

assert.ok(selectedShape && selectedShape.length === 2, "selected.points shape should parse and filter invalid points");
assert.equal(typeof selectedShape?.[0]?.ts, "number");

const selectedSeriesShape = extractSelectedSeries({
  selected_series: [
    { timestamp: "2026-02-28T04:00:00Z", y: 8.5 },
    { timestamp: "2026-02-28T05:00:00Z", y: 8.8 },
  ],
});

assert.ok(selectedSeriesShape && selectedSeriesShape.length === 2, "selected_series shape should parse");

const mergedSnapshot = mergeSelectedSeriesIntoSnapshot(
  {
    range: {
      start_ts: "2026-02-28T00:00:00Z",
      end_ts: "2026-02-28T06:00:00Z",
    },
    selected: {
      n: 3,
      avg: 2.91,
    },
  },
  [
    { ts: "2026-02-28T00:00:00Z", value: 2.5 },
    { ts: "2026-02-28T01:00:00Z", value: 2.8 },
    { ts: "2026-02-28T02:00:00Z", value: 3.43 },
  ],
);
const mergedSeries = extractSelectedSeries(mergedSnapshot);

assert.ok(mergedSeries && mergedSeries.length === 3, "merged snapshot shape should preserve selected series");

const invalidShape = extractSelectedSeries({
  selected: {
    n: 5,
    avg: 12.2,
  },
});

assert.equal(invalidShape, null, "non-series snapshot shape should return null");

console.log("verify-snapshot: OK");
