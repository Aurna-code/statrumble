"use client";

import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDateTimeLabel } from "@/lib/formatDate";
import type { SnapshotPoint } from "@/lib/snapshot";

type ThreadSnapshotChartProps = {
  points: SnapshotPoint[];
  metricLabel: string;
};

function formatTimestamp(value: string | number): string {
  if (typeof value === "number") {
    const asDate = new Date(value);

    if (!Number.isNaN(asDate.getTime())) {
      return formatDateTimeLabel(asDate.toISOString());
    }

    return value.toLocaleString("ko-KR");
  }

  const formatted = formatDateTimeLabel(value);
  return formatted === value ? value : formatted;
}

function formatMetricValue(value: number): string {
  return value.toLocaleString("ko-KR", {
    maximumFractionDigits: 6,
  });
}

export default function ThreadSnapshotChart({ points, metricLabel }: ThreadSnapshotChartProps) {
  const chartData = useMemo(
    () =>
      points.map((point, index) => ({
        ...point,
        index,
        label: formatTimestamp(point.ts),
      })),
    [points],
  );

  return (
    <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold">Snapshot Chart</h2>
      <p className="mt-1 text-sm text-zinc-600">{metricLabel}</p>

      {chartData.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-600">No snapshot series available.</p>
      ) : (
        <>
          <div className="mt-4 h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="index"
                  tickFormatter={(value: number) => chartData[value]?.label ?? String(value)}
                  minTickGap={24}
                />
                <YAxis
                  width={72}
                  tickFormatter={(value: number) => {
                    return Number.isFinite(value) ? formatMetricValue(value) : String(value);
                  }}
                />
                <Tooltip
                  labelFormatter={(value) => {
                    const index = Number(value);
                    return Number.isFinite(index) ? chartData[index]?.label ?? String(value) : String(value);
                  }}
                  formatter={(value) => {
                    const numeric = Number(value);
                    return Number.isFinite(numeric) ? formatMetricValue(numeric) : String(value);
                  }}
                />
                <Line type="monotone" dataKey="value" stroke="#18181b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <p className="mt-3 text-xs text-zinc-600">Points: {chartData.length}</p>
        </>
      )}
    </section>
  );
}
