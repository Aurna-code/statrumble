"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RefereeReportView from "@/app/components/RefereeReportView";
import type { RefereeReport } from "@/lib/referee/schema";

type VoteStance = "A" | "B" | "C";

type VoteCounts = Record<VoteStance, number>;

type MessageItem = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
};

type VoteSubmitApiResponse = {
  ok: boolean;
  my_stance?: VoteStance;
  error?: string;
};

type RefreshApiResponse = {
  ok: boolean;
  messages?: MessageItem[];
  counts?: VoteCounts;
  my_stance?: VoteStance | null;
  referee_report?: RefereeReport | null;
  error?: string;
};

type JudgeApiResponse = {
  ok: boolean;
  report?: RefereeReport;
  reused?: boolean;
  error?: string;
};

type SnapshotSummary = {
  selectedAvg: number | null;
  selectedN: number | null;
  beforeAvg: number | null;
  beforeN: number | null;
  deltaAbs: number | null;
  deltaRel: number | null;
};

type ThreadArenaProps = {
  threadId: string;
  snapshot: unknown;
  initialRefereeReport?: RefereeReport | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getSnapshotSummary(snapshot: unknown): SnapshotSummary {
  const root = asRecord(snapshot);
  const selected = asRecord(root?.selected);
  const before = asRecord(root?.before);
  const delta = asRecord(root?.delta);

  return {
    selectedAvg: asFiniteNumber(selected?.avg),
    selectedN: asFiniteNumber(selected?.n),
    beforeAvg: asFiniteNumber(before?.avg),
    beforeN: asFiniteNumber(before?.n),
    deltaAbs: asFiniteNumber(delta?.abs),
    deltaRel: asFiniteNumber(delta?.rel),
  };
}

function formatDateLabel(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function formatDecimal(value: number | null, digits = 2) {
  if (value === null) {
    return "-";
  }

  return value.toLocaleString("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatCount(value: number | null) {
  if (value === null) {
    return "-";
  }

  return Math.round(value).toLocaleString("ko-KR");
}

function buildQuoteSentence(snapshot: unknown) {
  const summary = getSnapshotSummary(snapshot);
  const selectedAvg = formatDecimal(summary.selectedAvg);
  const selectedN = formatCount(summary.selectedN);

  if (summary.beforeAvg === null) {
    return `선택 구간 평균은 ${selectedAvg}(${selectedN}개)이며, 직전 구간 데이터가 없어 변화는 계산되지 않았습니다.`;
  }

  const beforeAvg = formatDecimal(summary.beforeAvg);
  const beforeN = formatCount(summary.beforeN);
  const deltaAbs = formatDecimal(summary.deltaAbs);
  const deltaRelPercent = summary.deltaRel === null ? "-" : formatDecimal(summary.deltaRel * 100);

  return `선택 구간 평균은 ${selectedAvg}(${selectedN}개), 직전 구간 평균은 ${beforeAvg}(${beforeN}개), 변화는 ${deltaAbs} / ${deltaRelPercent}%.`;
}

function areMessagesEqual(left: MessageItem[], right: MessageItem[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((item, index) => {
    const next = right[index];
    return (
      Boolean(next) &&
      item.id === next.id &&
      item.user_id === next.user_id &&
      item.content === next.content &&
      item.created_at === next.created_at
    );
  });
}

function buildVoteSignature(counts: VoteCounts, myStance: VoteStance | null) {
  return `${counts.A}:${counts.B}:${counts.C}:${myStance ?? "-"}`;
}

export default function ThreadArena({ threadId, snapshot, initialRefereeReport = null }: ThreadArenaProps) {
  const renderWindowRef = useRef({
    windowStart: Date.now(),
    renderCount: 0,
    lastWarnAt: 0,
  });
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [voteCounts, setVoteCounts] = useState<VoteCounts>({ A: 0, B: 0, C: 0 });
  const [myStance, setMyStance] = useState<VoteStance | null>(null);
  const [voting, setVoting] = useState(false);
  const [votesError, setVotesError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refereeReport, setRefereeReport] = useState<RefereeReport | null>(initialRefereeReport);
  const [refereeReused, setRefereeReused] = useState<boolean | null>(null);
  const [judging, setJudging] = useState(false);
  const [judgeError, setJudgeError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const refreshInFlightRef = useRef(false);
  const votesSignatureRef = useRef(buildVoteSignature(voteCounts, myStance));

  if (process.env.NEXT_PUBLIC_DEBUG_RENDER_LOOP === "1") {
    const now = Date.now();
    const windowMs = 1000;
    const warnCooldownMs = 5000;

    if (now - renderWindowRef.current.windowStart >= windowMs) {
      renderWindowRef.current.windowStart = now;
      renderWindowRef.current.renderCount = 1;
    } else {
      renderWindowRef.current.renderCount += 1;
    }

    if (
      renderWindowRef.current.renderCount > 30 &&
      now - renderWindowRef.current.lastWarnAt >= warnCooldownMs
    ) {
      renderWindowRef.current.lastWarnAt = now;
      console.error("[ThreadArena] high render rate detected", {
        threadId,
        rendersPerSecond: renderWindowRef.current.renderCount,
        windowMs,
      });
    }
  }

  const quoteSentence = useMemo(() => buildQuoteSentence(snapshot), [snapshot]);
  const loadingMessages = refreshing && messages.length === 0;

  const refreshThreadData = useCallback(async () => {
    if (refreshInFlightRef.current) {
      return;
    }

    refreshInFlightRef.current = true;
    setRefreshing(true);
    setMessagesError(null);
    setVotesError(null);

    try {
      const response = await fetch(`/api/threads/${threadId}/refresh`, {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json()) as RefreshApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to refresh thread.");
      }

      const nextMessages = payload.messages ?? [];
      setMessages((prev) => (areMessagesEqual(prev, nextMessages) ? prev : nextMessages));

      if (!payload.counts) {
        throw new Error("Failed to load votes.");
      }

      const nextCounts = payload.counts;
      const nextMyStance = payload.my_stance ?? null;
      const nextSignature = buildVoteSignature(nextCounts, nextMyStance);

      if (votesSignatureRef.current !== nextSignature) {
        votesSignatureRef.current = nextSignature;
        setVoteCounts(nextCounts);
        setMyStance(nextMyStance);
      }

      setRefereeReport(payload.referee_report ?? null);
      setRefereeReused(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown refresh error";
      setMessagesError(message);
      setVotesError(message);
    } finally {
      refreshInFlightRef.current = false;
      setRefreshing(false);
    }
  }, [threadId]);

  useEffect(() => {
    void refreshThreadData();
  }, [refreshThreadData]);

  async function onSendMessage() {
    if (sending || !draft.trim()) {
      return;
    }

    setSending(true);
    setMessagesError(null);

    try {
      const response = await fetch(`/api/threads/${threadId}/messages`, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: draft }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to send message.");
      }

      setDraft("");
      await refreshThreadData();
    } catch (error) {
      setMessagesError(error instanceof Error ? error.message : "Unknown send error");
    } finally {
      setSending(false);
    }
  }

  async function onVote(stance: VoteStance) {
    if (voting) {
      return;
    }

    setVoting(true);
    setVotesError(null);

    try {
      const response = await fetch(`/api/threads/${threadId}/votes`, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ stance }),
      });
      const payload = (await response.json()) as VoteSubmitApiResponse;

      if (!response.ok || !payload.ok || !payload.my_stance) {
        throw new Error(payload.error ?? "Failed to submit vote.");
      }

      await refreshThreadData();
    } catch (error) {
      setVotesError(error instanceof Error ? error.message : "Unknown vote error");
    } finally {
      setVoting(false);
    }
  }

  function onInsertQuoteStats() {
    setDraft((prev) => (prev.trim().length === 0 ? quoteSentence : `${prev}\n${quoteSentence}`));
  }

  async function onRunReferee(force = false) {
    if (judging) {
      return;
    }

    setJudging(true);
    setJudgeError(null);
    setRefereeReused(null);

    try {
      const endpoint = force ? `/api/threads/${threadId}/judge?force=1` : `/api/threads/${threadId}/judge`;
      const response = await fetch(endpoint, {
        method: "POST",
        cache: "no-store",
      });
      const payload = (await response.json()) as JudgeApiResponse;

      if (!response.ok || !payload.ok || !payload.report) {
        throw new Error(payload.error ?? "Failed to run referee.");
      }

      setRefereeReport(payload.report);
      setRefereeReused(payload.reused === true ? true : null);
    } catch (error) {
      setJudgeError(error instanceof Error ? error.message : "Unknown referee error");
    } finally {
      setJudging(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Messages</h2>
            <button
              type="button"
              className="rounded-md border border-zinc-300 px-3 py-1 text-xs text-zinc-700 transition hover:bg-zinc-100"
              onClick={() => void refreshThreadData()}
              disabled={refreshing}
            >
              {refreshing ? "새로고침 중..." : "새로고침"}
            </button>
          </div>

          <div className="mt-4 max-h-80 space-y-3 overflow-auto pr-1">
            {loadingMessages ? <p className="text-sm text-zinc-600">메시지 로딩 중...</p> : null}
            {!loadingMessages && messages.length === 0 ? (
              <p className="text-sm text-zinc-600">아직 메시지가 없습니다.</p>
            ) : null}
            {messages.map((message) => (
              <article key={message.id} className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-xs text-zinc-600">{message.user_id}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-900">{message.content}</p>
                <p className="mt-2 text-[11px] text-zinc-500">{formatDateLabel(message.created_at)}</p>
              </article>
            ))}
          </div>

          {messagesError ? <p className="mt-3 text-sm text-red-600">{messagesError}</p> : null}

          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-zinc-600">Enter 전송 / Shift+Enter 줄바꿈</p>
              <button
                type="button"
                className="rounded-md border border-zinc-300 px-3 py-1 text-xs text-zinc-700 transition hover:bg-zinc-100"
                onClick={onInsertQuoteStats}
              >
                Quote stats
              </button>
            </div>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void onSendMessage();
                }
              }}
              placeholder="메시지를 입력하세요."
              rows={4}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-500"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void onSendMessage()}
                disabled={sending || !draft.trim()}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? "전송 중..." : "전송"}
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Vote</h2>
            <button
              type="button"
              className="rounded-md border border-zinc-300 px-3 py-1 text-xs text-zinc-700 transition hover:bg-zinc-100"
              onClick={() => void refreshThreadData()}
              disabled={refreshing}
            >
              {refreshing ? "새로고침 중..." : "새로고침"}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {(Object.keys(voteCounts) as VoteStance[]).map((stance) => {
              const selected = myStance === stance;

              return (
                <button
                  key={stance}
                  type="button"
                  onClick={() => void onVote(stance)}
                  disabled={voting}
                  className={`rounded-md border px-3 py-3 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    selected
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100"
                  }`}
                >
                  <span className="font-semibold">{stance}</span>
                  <span className="ml-2 text-xs">({voteCounts[stance]})</span>
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-xs text-zinc-600">1인 1표이며, 다시 선택하면 투표가 변경됩니다.</p>
          {myStance ? <p className="mt-2 text-sm text-zinc-800">내 선택: {myStance}</p> : null}
          {votesError ? <p className="mt-2 text-sm text-red-600">{votesError}</p> : null}

          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void onRunReferee(false)}
                disabled={judging}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {judging ? "Referee 실행 중..." : "Run Referee"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (judging) {
                    return;
                  }

                  const confirmed = window.confirm("비용이 발생할 수 있습니다. 재판정하시겠습니까?");

                  if (confirmed) {
                    void onRunReferee(true);
                  }
                }}
                disabled={judging}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-900 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {judging ? "재판정 중..." : "Re-run (costs)"}
              </button>
              {refereeReused ? (
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                  Reused
                </span>
              ) : null}
            </div>
            {judgeError ? <p className="mt-2 text-sm text-red-600">{judgeError}</p> : null}
          </div>
        </div>
      </section>

      {refereeReport ? (
        <RefereeReportView report={refereeReport} />
      ) : (
        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-base font-semibold">Referee Report</h2>
          <p className="mt-2 text-sm text-zinc-600">아직 생성된 Referee report가 없습니다.</p>
        </section>
      )}
    </div>
  );
}
