export type SnapshotPoint = {
  ts: string | number;
  value: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function asPointTs(value: unknown): string | number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
}

function extractPoint(value: unknown): SnapshotPoint | null {
  if (Array.isArray(value)) {
    if (value.length < 2) {
      return null;
    }

    const ts = asPointTs(value[0]);
    const metricValue = asFiniteNumber(value[1]);

    if (ts === null || metricValue === null) {
      return null;
    }

    return { ts, value: metricValue };
  }

  const record = asRecord(value);

  if (!record) {
    return null;
  }

  const ts = asPointTs(record.ts ?? record.timestamp ?? record.time ?? record.x);
  const metricValue = asFiniteNumber(record.value ?? record.y);

  if (ts === null || metricValue === null) {
    return null;
  }

  return { ts, value: metricValue };
}

function extractPointArray(value: unknown): SnapshotPoint[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const points = value.map((item) => extractPoint(item)).filter((item): item is SnapshotPoint => item !== null);

  return points.length > 0 ? points : null;
}

export function mergeSelectedSeriesIntoSnapshot(snapshot: unknown, points: SnapshotPoint[]): Record<string, unknown> {
  const root = asRecord(snapshot);
  const selected = asRecord(root?.selected);
  const selectedRange = asRecord(root?.selectedRange);
  const normalizedPoints = points
    .map((item) => extractPoint(item))
    .filter((item): item is SnapshotPoint => item !== null);

  return {
    ...(root ?? {}),
    selected_points: normalizedPoints,
    selected_series: normalizedPoints,
    selected: {
      ...(selected ?? {}),
      points: normalizedPoints,
    },
    selectedRange: {
      ...(selectedRange ?? {}),
      points: normalizedPoints,
    },
  };
}

export function extractSelectedSeries(snapshot: unknown): SnapshotPoint[] | null {
  const root = asRecord(snapshot);

  if (!root) {
    return null;
  }

  const selectedRange = asRecord(root.selectedRange);
  const selected = asRecord(root.selected);
  const range = asRecord(root.range);
  const series = asRecord(root.series);

  const candidates: unknown[] = [
    root.selected_points,
    root.selected_series,
    selectedRange?.points,
    selected?.points,
    range?.points,
    root.snapshot_points,
    root.points,
    root.series,
    series?.selected,
    root.selected,
  ];

  for (const candidate of candidates) {
    const points = extractPointArray(candidate);

    if (points) {
      return points;
    }
  }

  return null;
}
