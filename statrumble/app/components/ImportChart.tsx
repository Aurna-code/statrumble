"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { formatDateTimeLabel as formatDateLabel } from "@/lib/formatDate";
import TransformProposalCreateForm from "@/app/components/TransformProposalCreateForm";

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

function parseNonNegativeInteger(value: string | null): number | null {
  if (typeof value !== "string") {
    return null;
  }

  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

export default function ImportChart({ imports }: ImportChartProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const renderCountRef = useRef(0);
  const didWarnRenderLoopRef = useRef(false);
  const brushUrlUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const importIdSet = useMemo(() => new Set(importIds), [importIds]);
  const firstImportId = importIds[0] ?? "";
  const urlImportId = useMemo(() => {
    const raw = searchParams.get("import");
    if (!raw) {
      return null;
    }

    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, [searchParams]);
  const urlStartIndex = useMemo(() => parseNonNegativeInteger(searchParams.get("start")), [searchParams]);
  const urlEndIndex = useMemo(() => parseNonNegativeInteger(searchParams.get("end")), [searchParams]);

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

  function replaceArenaQuery(nextParams: URLSearchParams) {
    const currentQuery = searchParams.toString();
    const nextQuery = nextParams.toString();

    if (currentQuery === nextQuery) {
      return;
    }

    const nextUrl = nextQuery ? `${pathname}?${nextQuery}#chart` : `${pathname}#chart`;
    router.replace(nextUrl, { scroll: false });
  }

  function onImportChange(nextImportId: string) {
    if (brushUrlUpdateTimeoutRef.current) {
      clearTimeout(brushUrlUpdateTimeoutRef.current);
      brushUrlUpdateTimeoutRef.current = null;
    }

    setSelectedImportId(nextImportId);

    const nextParams = new URLSearchParams(searchParams.toString());
    if (nextImportId) {
      nextParams.set("import", nextImportId);
    } else {
      nextParams.delete("import");
    }
    nextParams.delete("start");
    nextParams.delete("end");
    replaceArenaQuery(nextParams);
  }

  function scheduleBrushRangeQueryUpdate(nextRange: BrushRange) {
    if (!selectedImportId || points.length === 0) {
      return;
    }

    const maxIndex = Math.max(points.length - 1, 0);
    const normalizedStart = Math.min(nextRange.startIndex, nextRange.endIndex);
    const normalizedEnd = Math.max(nextRange.startIndex, nextRange.endIndex);
    const clampedStart = Math.max(0, Math.min(normalizedStart, maxIndex));
    const clampedEnd = Math.max(0, Math.min(normalizedEnd, maxIndex));

    if (brushUrlUpdateTimeoutRef.current) {
      clearTimeout(brushUrlUpdateTimeoutRef.current);
    }

    brushUrlUpdateTimeoutRef.current = setTimeout(() => {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("import", selectedImportId);
      nextParams.set("start", String(clampedStart));
      nextParams.set("end", String(clampedEnd));
      replaceArenaQuery(nextParams);
      brushUrlUpdateTimeoutRef.current = null;
    }, 200);
  }

  useEffect(() => {
    return () => {
      if (brushUrlUpdateTimeoutRef.current) {
        clearTimeout(brushUrlUpdateTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!firstImportId) {
      setSelectedImportId((prev) => (prev === "" ? prev : ""));
      return;
    }

    const hasValidUrlImport = Boolean(urlImportId && importIdSet.has(urlImportId));
    const nextSelectedImportId = hasValidUrlImport ? (urlImportId as string) : firstImportId;

    setSelectedImportId((prev) => {
      if (hasValidUrlImport) {
        return prev === nextSelectedImportId ? prev : nextSelectedImportId;
      }

      return importIdSet.has(prev) ? prev : nextSelectedImportId;
    });
  }, [firstImportId, importIdSet, urlImportId]);

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

  useEffect(() => {
    if (points.length === 0) {
      const nextRange = getDefaultBrushRange(0);
      setBrushRange((prev) =>
        prev.startIndex === nextRange.startIndex && prev.endIndex === nextRange.endIndex ? prev : nextRange,
      );
      return;
    }

    if (urlStartIndex !== null && urlEndIndex !== null) {
      const maxIndex = points.length - 1;
      const clampedStart = Math.max(0, Math.min(Math.min(urlStartIndex, urlEndIndex), maxIndex));
      const clampedEnd = Math.max(0, Math.min(Math.max(urlStartIndex, urlEndIndex), maxIndex));
      const nextRange = {
        startIndex: clampedStart,
        endIndex: clampedEnd,
      };

      setBrushRange((prev) =>
        prev.startIndex === nextRange.startIndex && prev.endIndex === nextRange.endIndex ? prev : nextRange,
      );
      return;
    }

    const defaultRange = getDefaultBrushRange(points.length);
    setBrushRange((prev) =>
      prev.startIndex === defaultRange.startIndex && prev.endIndex === defaultRange.endIndex ? prev : defaultRange,
    );
  }, [points.length, selectedImportId, urlStartIndex, urlEndIndex]);

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

      const threadParams = new URLSearchParams();
      threadParams.set("from", "arena");
      threadParams.set("import", selectedImportId);
      threadParams.set("start", String(selectedRange.startIndex));
      threadParams.set("end", String(selectedRange.endIndex));

      router.push(`/threads/${payload.thread_id}?${threadParams.toString()}`);
    } catch (error) {
      setThreadError(error instanceof Error ? error.message : "Unknown thread creation error");
    } finally {
      setIsCreatingThread(false);
    }
  }

  if (imports.length === 0) {
    return <p className="mt-2 text-sm text-zinc-600">No imports yet. Upload a CSV first.</p>;
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
          onChange={(event) => onImportChange(event.target.value)}
        >
          {imports.map((item) => (
            <option key={item.id} value={item.id}>
              {(item.file_name ?? "(no file name)")} - {formatDateLabel(item.created_at)}
            </option>
          ))}
        </select>
      </div>

      {isPointsLoading ? <p className="text-sm text-zinc-600">Loading points...</p> : null}
      {pointsError ? <p className="text-sm text-red-600">Failed to load: {pointsError}</p> : null}

      {!isPointsLoading && !pointsError && points.length === 0 ? (
        <p className="text-sm text-zinc-600">No points to display for the selected import.</p>
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
                    const maxIndex = Math.max(points.length - 1, 0);
                    const rawStart = Math.max(0, Math.min(nextRange.startIndex ?? 0, maxIndex));
                    const rawEnd = Math.max(0, Math.min(nextRange.endIndex ?? maxIndex, maxIndex));
                    const nextBrushRange = {
                      startIndex: Math.min(rawStart, rawEnd),
                      endIndex: Math.max(rawStart, rawEnd),
                    };

                    setBrushRange((prev) =>
                      prev.startIndex === nextBrushRange.startIndex && prev.endIndex === nextBrushRange.endIndex
                        ? prev
                        : nextBrushRange,
                    );
                    scheduleBrushRangeQueryUpdate(nextBrushRange);
                  }}
                  tickFormatter={(value) => chartData[value]?.label ?? String(value)}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <p className="text-xs text-zinc-600">
            Points shown: {points.length}
            {totalPoints !== null ? ` / total ${totalPoints}` : ""}
            {sampled ? " (sampled)" : ""}
          </p>

          {selectedRange ? (
            <p className="text-sm text-zinc-700">
              Selected range: {formatDateLabel(selectedRange.startTs)} to {formatDateLabel(selectedRange.endTs)}
            </p>
          ) : null}

          <div className="flex flex-wrap items-start gap-2">
            <button
              type="button"
              disabled={!canCreateThread}
              onClick={onCreateThread}
              className="inline-flex items-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreatingThread ? "Creating..." : "Create Thread"}
            </button>
            <TransformProposalCreateForm
              importId={selectedImportId}
              disabled={!selectedImportId}
              arenaImportId={selectedImportId}
              arenaStartIndex={selectedRange?.startIndex ?? null}
              arenaEndIndex={selectedRange?.endIndex ?? null}
            />
          </div>

          {threadError ? <p className="text-sm text-red-600">Failed to create thread: {threadError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
