type MetricLike = {
  name?: string | null;
  unit?: string | null;
};

type ThreadLike = {
  id: string;
  metric: {
    name: string;
    unit: string | null;
  } | null;
};

export function shortId(id: string): string {
  const normalized = id.trim();

  if (normalized.length === 0) {
    return "-";
  }

  return normalized.slice(0, 8);
}

export function formatMetricLabel(metric: MetricLike | null): string {
  const metricName = metric?.name?.trim();

  if (!metricName) {
    return "Thread";
  }

  const metricUnit = metric?.unit?.trim();
  return metricUnit ? `${metricName} (${metricUnit})` : metricName;
}

export function formatThreadPrimaryTitle(thread: ThreadLike): string {
  return formatMetricLabel(thread.metric);
}
