import assert from "node:assert/strict";
import { applyTransform, compareStats, type TransformSeriesPoint } from "../statrumble/lib/transforms/index.ts";

function assertFiniteValues(series: TransformSeriesPoint[]) {
  for (const point of series) {
    assert.equal(Number.isFinite(point.value), true);
  }
}

const outlierSeries: TransformSeriesPoint[] = [
  { ts: "2026-01-01T00:00:00.000Z", value: 10 },
  { ts: "2026-01-02T00:00:00.000Z", value: 11 },
  { ts: "2026-01-03T00:00:00.000Z", value: 12 },
  { ts: "2026-01-04T00:00:00.000Z", value: 200 },
  { ts: "2026-01-05T00:00:00.000Z", value: 13 },
  { ts: "2026-01-06T00:00:00.000Z", value: 14 },
];

const unsortedWithDuplicateTs: TransformSeriesPoint[] = [
  { ts: "2026-01-03T00:00:00.000Z", value: 3 },
  { ts: "2026-01-01T00:00:00.000Z", value: 1 },
  { ts: "2026-01-02T00:00:00.000Z", value: 2 },
  { ts: "2026-01-02T00:00:00.000Z", value: 22 },
  { ts: 1704067200000, value: 0 },
];

const normalized = applyTransform(
  {
    version: 1,
    ops: [{ op: "moving_average", window: 1 }],
  },
  unsortedWithDuplicateTs,
);

assert.equal(normalized.series.length, 4);
assert.deepEqual(normalized.series.map((point) => point.ts), [
  1704067200000,
  "2026-01-01T00:00:00.000Z",
  "2026-01-02T00:00:00.000Z",
  "2026-01-03T00:00:00.000Z",
]);
assert.equal(normalized.series[2]?.value, 22);

const baseline = applyTransform(
  {
    version: 1,
    ops: [{ op: "moving_average", window: 1 }],
  },
  outlierSeries,
);

const clippedByDefault = applyTransform(
  {
    version: 1,
    ops: [{ op: "filter_outliers", method: "iqr", k: 1.5 }],
  },
  outlierSeries,
);

assert.equal(clippedByDefault.series.length, outlierSeries.length);
assert.equal(clippedByDefault.stats.outliers_removed, 0);
assert.equal(clippedByDefault.stats.outliers_clipped > 0, true);
assert.equal(Math.max(...clippedByDefault.series.map((point) => point.value)) < 200, true);

const removedOutliers = applyTransform(
  {
    version: 1,
    ops: [{ op: "filter_outliers", method: "iqr", mode: "remove", k: 1.5 }],
  },
  outlierSeries,
);

assert.equal(removedOutliers.stats.count_after < removedOutliers.stats.count_before, true);
assert.equal(removedOutliers.stats.outliers_removed > 0, true);

const diff = compareStats(baseline.stats, removedOutliers.stats);
assert.equal(diff.count_after.delta < 0, true);
assert.equal(diff.outliers_removed.delta > 0, true);

const shortSeries: TransformSeriesPoint[] = [
  { ts: "2026-02-01T00:00:00.000Z", value: 10 },
  { ts: "2026-02-02T00:00:00.000Z", value: 20 },
  { ts: "2026-02-03T00:00:00.000Z", value: 30 },
  { ts: "2026-02-04T00:00:00.000Z", value: 40 },
  { ts: "2026-02-05T00:00:00.000Z", value: 50 },
];

const oversizedWindow = applyTransform(
  {
    version: 1,
    ops: [{ op: "moving_average", window: 7 }],
  },
  shortSeries,
);

assert.deepEqual(oversizedWindow.series, shortSeries);
assert.equal(oversizedWindow.stats.warnings?.includes("window_too_large"), true);
assertFiniteValues(oversizedWindow.series);

const oversizedDiff = compareStats(baseline.stats, oversizedWindow.stats);
assert.equal(typeof oversizedDiff.count_after.delta, "number");

console.log("sanity-transforms: OK");
