"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ImportOption = {
  id: string;
  file_name: string | null;
  created_at: string;
};

type ImportChartProps = {
  imports: ImportOption[];
};

type PointItem = {
  ts: string;
  value: number;
};

type PointsApiResponse = {
  ok: boolean;
  points?: PointItem[];
  total?: number;
  sampled?: boolean;
  error?: string;
};

type CreateThreadApiResponse = {
  ok: boolean;
  thread_id?: string;
  error?: string;
};

type BrushRange = {
  startIndex: number;
  endIndex: number;
};

function formatDateLabel(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function arePointsEqual(left: PointItem[], right: PointItem[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((item, index) => {
    const next = right[index];
    return Boolean(next) && item.ts === next.ts && item.value === next.value;
  });
}

function getDefaultBrushRange(pointsLength: number): BrushRange {
  if (pointsLength === 0) {
    return { startIndex: 0, endIndex: 0 };
  }

  return {
    startIndex: 0,
    endIndex: pointsLength - 1,
  };
}

export default function ImportChart({ imports }: ImportChartProps) {
  const router = useRouter();
  const renderCountRef = useRef(0);
  const didWarnRenderLoopRef = useRef(false);
  const [selectedImportId, setSelectedImportId] = useState(imports[0]?.id ?? "");
  const [points, setPoints] = useState<PointItem[]>([]);
  const [totalPoints, setTotalPoints] = useState<number | null>(null);
  const [sampled, setSampled] = useState(false);
  const [isPointsLoading, setIsPointsLoading] = useState(false);
  const [pointsError, setPointsError] = useState<string | null>(null);
  const [brushRange, setBrushRange] = useState<BrushRange>(getDefaultBrushRange(0));
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const importIds = useMemo(() => imports.map((item) => item.id), [imports]);
  const firstImportId = importIds[0] ?? "";
  const importIdsKey = useMemo(() => importIds.join("|"), [importIds]);

  renderCountRef.current += 1;
  if (
    process.env.NEXT_PUBLIC_DEBUG_RENDER_LOOP === "1" &&
    renderCountRef.current > 60 &&
    !didWarnRenderLoopRef.current
  ) {
    didWarnRenderLoopRef.current = true;
    console.error("[ImportChart] render count exceeded 60", {
      selectedImportId,
      importCount: imports.length,
      renderCount: renderCountRef.current,
    });
  }

  useEffect(() => {
    if (!firstImportId) {
      setSelectedImportId((prev) => (prev === "" ? prev : ""));
      return;
    }

    const idSet = new Set(importIdsKey.split("|"));
    setSelectedImportId((prev) => {
      return idSet.has(prev) ? prev : firstImportId;
    });
  }, [firstImportId, importIdsKey]);

  useEffect(() => {
    if (!selectedImportId) {
      setPoints([]);
      setTotalPoints(null);
      setSampled(false);
      setPointsError(null);
      setBrushRange(getDefaultBrushRange(0));
      return;
    }

    const controller = new AbortController();

    async function loadPoints() {
      setIsPointsLoading(true);
      setPointsError(null);
      setThreadError(null);

      try {
        const response = await fetch(`/api/imports/${selectedImportId}/points`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as PointsApiResponse;

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Failed to load points.");
        }

        const loadedPoints = payload.points ?? [];
        const nextTotalPoints = typeof payload.total === "number" ? payload.total : loadedPoints.length;
        const nextSampled = Boolean(payload.sampled);

        setPoints((prev) => (arePointsEqual(prev, loadedPoints) ? prev : loadedPoints));
        setTotalPoints((prev) => (prev === nextTotalPoints ? prev : nextTotalPoints));
        setSampled((prev) => (prev === nextSampled ? prev : nextSampled));

        const nextBrushRange = getDefaultBrushRange(loadedPoints.length);
        setBrushRange((prev) =>
          prev.startIndex === nextBrushRange.startIndex && prev.endIndex === nextBrushRange.endIndex ? prev : nextBrushRange,
        );
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        const nextDefaultRange = getDefaultBrushRange(0);
        setPoints((prev) => (prev.length === 0 ? prev : []));
        setTotalPoints((prev) => (prev === null ? prev : null));
        setSampled((prev) => (prev === false ? prev : false));
        setBrushRange((prev) =>
          prev.startIndex === nextDefaultRange.startIndex && prev.endIndex === nextDefaultRange.endIndex ? prev : nextDefaultRange,
        );
        setPointsError(error instanceof Error ? error.message : "Unknown points error");
      } finally {
        if (!controller.signal.aborted) {
          setIsPointsLoading(false);
        }
      }
    }

    void loadPoints();

    return () => {
      controller.abort();
    };
  }, [selectedImportId]);

  const chartData = useMemo(
    () =>
      points.map((point, index) => ({
        ...point,
        index,
        label: formatDateLabel(point.ts),
      })),
    [points],
  );

  const selectedRange = useMemo(() => {
    if (points.length === 0) {
      return null;
    }

    const minIndex = Math.max(0, Math.min(brushRange.startIndex, brushRange.endIndex));
    const maxIndex = Math.min(points.length - 1, Math.max(brushRange.startIndex, brushRange.endIndex));
    const startPoint = points[minIndex];
    const endPoint = points[maxIndex];

    if (!startPoint || !endPoint) {
      return null;
    }

    return {
      startIndex: minIndex,
      endIndex: maxIndex,
      startTs: startPoint.ts,
      endTs: endPoint.ts,
    };
  }, [brushRange.endIndex, brushRange.startIndex, points]);

  const canCreateThread = Boolean(selectedImportId) && Boolean(selectedRange) && !isCreatingThread;

  async function onCreateThread() {
    if (!selectedImportId || !selectedRange) {
      return;
    }

    const startTs = selectedRange.startTs;
    const nextPoint = points[selectedRange.endIndex + 1];
    let endTs = nextPoint?.ts;

    if (!endTs) {
      const parsedEnd = new Date(selectedRange.endTs);

      if (Number.isNaN(parsedEnd.getTime())) {
        setThreadError("Invalid selected end timestamp.");
        return;
      }

      endTs = new Date(parsedEnd.getTime() + 1).toISOString();
    }

    setIsCreatingThread(true);
    setThreadError(null);

    try {
      const response = await fetch("/api/threads/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          import_id: selectedImportId,
          start_ts: startTs,
          end_ts: endTs,
        }),
      });
      const payload = (await response.json()) as CreateThreadApiResponse;

      if (!response.ok || !payload.ok || !payload.thread_id) {
        throw new Error(payload.error ?? "Failed to create thread.");
      }

      router.push(`/threads/${payload.thread_id}`);
    } catch (error) {
      setThreadError(error instanceof Error ? error.message : "Unknown thread creation error");
    } finally {
      setIsCreatingThread(false);
    }
  }

  if (imports.length === 0) {
    return <p className="mt-2 text-sm text-zinc-600">아직 import가 없습니다. CSV를 먼저 업로드하세요.</p>;
  }

  return (
    <div className="mt-4 space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-800" htmlFor="import-select">
          Import
        </label>
        <select
          id="import-select"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-0 transition focus:border-zinc-500"
          value={selectedImportId}
          onChange={(event) => setSelectedImportId(event.target.value)}
        >
          {imports.map((item) => (
            <option key={item.id} value={item.id}>
              {(item.file_name ?? "(no file name)")} - {formatDateLabel(item.created_at)}
            </option>
          ))}
        </select>
      </div>

      {isPointsLoading ? <p className="text-sm text-zinc-600">포인트 로딩 중...</p> : null}
      {pointsError ? <p className="text-sm text-red-600">조회 실패: {pointsError}</p> : null}

      {!isPointsLoading && !pointsError && points.length === 0 ? (
        <p className="text-sm text-zinc-600">선택한 import에 표시할 포인트가 없습니다.</p>
      ) : null}

      {points.length > 0 ? (
        <div className="space-y-3">
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="index"
                  tickFormatter={(value: number) => chartData[value]?.label ?? String(value)}
                  minTickGap={24}
                />
                <YAxis width={60} />
                <Tooltip
                  labelFormatter={(value) => {
                    const index = Number(value);
                    return Number.isFinite(index) ? chartData[index]?.label ?? String(value) : String(value);
                  }}
                />
                <Line type="monotone" dataKey="value" stroke="#18181b" strokeWidth={2} dot={false} />
                <Brush
                  dataKey="index"
                  startIndex={brushRange.startIndex}
                  endIndex={brushRange.endIndex}
                  onChange={(nextRange) => {
                    setBrushRange({
                      startIndex: nextRange.startIndex ?? 0,
                      endIndex: nextRange.endIndex ?? Math.max(points.length - 1, 0),
                    });
                  }}
                  tickFormatter={(value) => chartData[value]?.label ?? String(value)}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <p className="text-xs text-zinc-600">
            표시 포인트: {points.length}
            {totalPoints !== null ? ` / 전체 ${totalPoints}` : ""}
            {sampled ? " (sampled)" : ""}
          </p>

          {selectedRange ? (
            <p className="text-sm text-zinc-700">
              선택 구간: {formatDateLabel(selectedRange.startTs)} ~ {formatDateLabel(selectedRange.endTs)}
            </p>
          ) : null}

          <button
            type="button"
            disabled={!canCreateThread}
            onClick={onCreateThread}
            className="inline-flex items-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCreatingThread ? "Creating..." : "Create Thread"}
          </button>

          {threadError ? <p className="text-sm text-red-600">스레드 생성 실패: {threadError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
