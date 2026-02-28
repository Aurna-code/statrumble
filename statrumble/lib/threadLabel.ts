type MetricLike = {
  name?: string | null;
  unit?: string | null;
};

export function shortId(id: string): string {
  const normalized = typeof id === "string" ? id.trim() : "";

  if (normalized.length === 0) {
    return "-";
  }

  return normalized.slice(0, 8);
}

export function formatMetricLabel(metric: MetricLike | null): string {
  const name = metric?.name?.trim();

  if (!name) {
    return "Thread";
  }

  const unit = metric?.unit?.trim();
  return unit ? `${name} (${unit})` : name;
}

export function formatThreadPrimaryTitle(thread: {
  id: string;
  metric: { name: string; unit: string | null } | null;
}): string {
  return formatMetricLabel(thread.metric);
}
