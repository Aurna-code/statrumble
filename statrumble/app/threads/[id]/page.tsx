import { notFound } from "next/navigation";
import ThreadArena from "@/app/components/ThreadArena";
import { getThread } from "@/lib/db/threads";
import type { RefereeReport } from "@/lib/referee/schema";

export const dynamic = "force-dynamic";

interface ThreadPageProps {
  params: Promise<{ id: string }>;
}

type SnapshotMetric = {
  name?: string | null;
  unit?: string | null;
};

type SnapshotRange = {
  start_ts?: string | null;
  end_ts?: string | null;
};

type SnapshotStats = {
  n?: number | null;
  avg?: number | null;
};

type SnapshotDelta = {
  abs?: number | null;
  rel?: number | null;
};

type ThreadSnapshot = {
  metric?: SnapshotMetric | null;
  range?: SnapshotRange | null;
  selected?: SnapshotStats | null;
  before?: SnapshotStats | null;
  delta?: SnapshotDelta | null;
};

function formatDateLabel(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined) {
    return "-";
  }

  return value.toLocaleString("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatCount(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }

  return Math.round(value).toLocaleString("ko-KR");
}

export default async function ThreadDetailPage({ params }: ThreadPageProps) {
  const { id } = await params;
  let thread = null;

  try {
    thread = await getThread(id);
  } catch (error) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
        <h1 className="text-2xl font-semibold">Thread #{id}</h1>
        <p className="mt-2 text-sm text-red-600">
          조회 실패: {error instanceof Error ? error.message : "Unknown error"}
        </p>
      </main>
    );
  }

  if (thread === null) {
    notFound();
  }

  const snapshot = (thread.snapshot ?? {}) as ThreadSnapshot;
  const metricName = thread.metric?.name ?? snapshot.metric?.name ?? "-";
  const metricUnit = thread.metric?.unit ?? snapshot.metric?.unit ?? null;
  const selectedAvg = snapshot.selected?.avg ?? null;
  const selectedN = snapshot.selected?.n ?? null;
  const beforeAvg = snapshot.before?.avg ?? null;
  const beforeN = snapshot.before?.n ?? null;
  const deltaAbs = snapshot.delta?.abs ?? null;
  const deltaRel = snapshot.delta?.rel ?? null;
  const rangeStart = snapshot.range?.start_ts ?? thread.start_ts;
  const rangeEnd = snapshot.range?.end_ts ?? thread.end_ts;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
      <h1 className="text-2xl font-semibold">Thread #{id}</h1>
      <p className="mt-2 text-sm text-zinc-600">생성 시점 snapshot 기준으로 토론과 투표를 진행합니다.</p>

      <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-base font-semibold">Snapshot 요약</h2>
        <div className="mt-3 grid gap-3 text-sm md:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">Metric</p>
            <p className="mt-1 font-medium">
              {metricName}
              {metricUnit ? ` (${metricUnit})` : ""}
            </p>
          </div>
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">선택 구간 평균 / n</p>
            <p className="mt-1 font-medium">
              {formatNumber(selectedAvg)} / {formatCount(selectedN)}
            </p>
          </div>
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">직전 구간 평균 / n</p>
            <p className="mt-1 font-medium">
              {formatNumber(beforeAvg)} / {formatCount(beforeN)}
            </p>
          </div>
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">변화량 (abs)</p>
            <p className="mt-1 font-medium">{formatNumber(deltaAbs)}</p>
          </div>
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">변화율 (rel %)</p>
            <p className="mt-1 font-medium">{deltaRel === null ? "-" : `${formatNumber(deltaRel * 100)}%`}</p>
          </div>
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">생성 시각</p>
            <p className="mt-1 font-medium">{formatDateLabel(thread.created_at)}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <p className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
            Start: <span className="font-medium">{formatDateLabel(rangeStart ?? thread.start_ts)}</span>
          </p>
          <p className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
            End: <span className="font-medium">{formatDateLabel(rangeEnd ?? thread.end_ts)}</span>
          </p>
        </div>
      </div>

      <ThreadArena
        threadId={thread.id}
        snapshot={thread.snapshot}
        initialRefereeReport={(thread.referee_report as RefereeReport | null) ?? null}
      />
    </main>
  );
}
