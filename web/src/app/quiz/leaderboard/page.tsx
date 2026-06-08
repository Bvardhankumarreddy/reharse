"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface ClosedWeek {
  quizWeek: number;
  title: string | null;
  endsAt: string | null;
  totalEntries: number;
  visibleUntil: string | null;
}

interface LeaderboardEntry {
  rank: number;
  fullName: string;
  totalScore: number;
  totalTimeSeconds: number;
}

interface Leaderboard {
  quizWeek: number;
  title: string | null;
  endsAt: string | null;
  visibleUntil: string | null;
  totalEntries: number;
  entries: LeaderboardEntry[];
}

function timeUntil(iso: string | null): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / (3600 * 1000));
  const m = Math.floor((ms % (3600 * 1000)) / (60 * 1000));
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatEndsAt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric",
  });
}

function trophy(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

export default function QuizLeaderboardPage() {
  const [weeks, setWeeks] = useState<ClosedWeek[] | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingBoard, setLoadingBoard] = useState(false);
  // Re-render every minute so the "Visible for Xh Ym" countdown ticks
  // even when the user leaves the page sitting open.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  // Load the list of closed weeks; default the picker to the most recent.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/quiz/leaderboard/weeks");
        if (!res.ok) throw new Error("Failed to load weeks");
        const data: ClosedWeek[] = await res.json();
        if (cancelled) return;
        setWeeks(data);
        if (data.length > 0) setSelectedWeek(data[0].quizWeek);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load weeks");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadBoard = useCallback(async (week: number) => {
    setLoadingBoard(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/quiz/leaderboard/${week}?limit=100`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to load leaderboard" }));
        throw new Error(err.message ?? "Failed to load leaderboard");
      }
      const data: Leaderboard = await res.json();
      setBoard(data);
    } catch (e) {
      setBoard(null);
      setError(e instanceof Error ? e.message : "Failed to load leaderboard");
    } finally {
      setLoadingBoard(false);
    }
  }, []);

  useEffect(() => {
    if (selectedWeek != null) void loadBoard(selectedWeek);
  }, [selectedWeek, loadBoard]);

  return (
    <div className="max-w-3xl mx-auto px-5 py-12 sm:py-16">
      <Link href="/quiz" className="text-[#B8C5E0] hover:text-white text-sm flex items-center gap-1 mb-6">
        ← Back to Quiz
      </Link>

      <div className="text-center mb-10">
        <div className="text-5xl mb-3">🏆</div>
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
          Latest Quiz Winners
        </h1>
        <p className="text-[#B8C5E0]">
          Each week&apos;s leaderboard is public for <span className="text-[#FFD700] font-semibold">24 hours</span> after submissions close, then it goes private.
        </p>
      </div>

      {/* Week picker */}
      {weeks === null && !error && (
        <div className="flex justify-center py-10">
          <div className="w-8 h-8 rounded-full border-2 border-[#00D4FF] border-t-transparent animate-spin" />
        </div>
      )}

      {weeks && weeks.length === 0 && (
        <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-8 text-center">
          <div className="text-3xl mb-3">⏳</div>
          <p className="text-white font-semibold mb-1">No leaderboard right now</p>
          <p className="text-[#B8C5E0] text-sm">
            Winners appear here within 24 hours of a quiz closing.
            Check back after the next Saturday close.
          </p>
        </div>
      )}

      {weeks && weeks.length > 0 && (
        <>
          <div className="bg-[#151B3D] border border-white/5 rounded-2xl p-4 mb-6">
            <label className="text-[11px] font-bold uppercase tracking-wide text-[#B8C5E0] block mb-2">
              Pick a week
            </label>
            <select
              value={selectedWeek ?? ""}
              onChange={(e) => setSelectedWeek(Number(e.target.value))}
              className="w-full bg-[#0A0E27] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#00D4FF] transition"
            >
              {weeks.map((w) => (
                <option key={w.quizWeek} value={w.quizWeek}>
                  Week {w.quizWeek}
                  {w.title ? ` — ${w.title}` : ""}
                  {w.endsAt ? ` (ended ${formatEndsAt(w.endsAt)})` : ""}
                  {" · "}{w.totalEntries} {w.totalEntries === 1 ? "entry" : "entries"}
                </option>
              ))}
            </select>
          </div>

          {/* Leaderboard table */}
          <div className="bg-[#151B3D] border border-white/5 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-white font-bold truncate">
                  {board?.title ?? `Week ${selectedWeek}`}
                </div>
                <div className="text-[10px] text-[#6B7799] uppercase tracking-wide">
                  {board ? `${board.totalEntries} ${board.totalEntries === 1 ? "entry" : "entries"} · showing top ${board.entries.length}` : "Loading…"}
                </div>
              </div>
              {board && timeUntil(board.visibleUntil) && (
                <div className="shrink-0 text-right">
                  <div className="text-[10px] text-[#FFD700] font-semibold uppercase tracking-wide">
                    Public for
                  </div>
                  <div className="text-[11px] text-white font-mono">
                    {timeUntil(board.visibleUntil)}
                  </div>
                </div>
              )}
            </div>

            {loadingBoard && (
              <div className="flex justify-center py-10">
                <div className="w-6 h-6 rounded-full border-2 border-[#00D4FF] border-t-transparent animate-spin" />
              </div>
            )}

            {!loadingBoard && error && (
              <div className="px-4 py-6 text-center text-[#FF5C7C] text-sm">
                {error}
              </div>
            )}

            {!loadingBoard && !error && board && board.entries.length === 0 && (
              <div className="px-4 py-8 text-center text-[#B8C5E0] text-sm">
                No entries for this week.
              </div>
            )}

            {!loadingBoard && !error && board && board.entries.length > 0 && (
              <div className="divide-y divide-white/5">
                {board.entries.map((entry) => {
                  const isPodium = entry.rank <= 3;
                  return (
                    <div
                      key={entry.rank}
                      className={
                        "flex items-center gap-3 px-4 py-3 " +
                        (isPodium ? "bg-gradient-to-r from-[#FFD700]/5 to-transparent" : "")
                      }
                    >
                      <div className={
                        "w-10 flex-shrink-0 text-center text-lg font-bold " +
                        (entry.rank === 1
                          ? "text-[#FFD700]"
                          : entry.rank === 2
                            ? "text-[#C0C0C0]"
                            : entry.rank === 3
                              ? "text-[#CD7F32]"
                              : "text-[#6B7799]")
                      }>
                        {trophy(entry.rank)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-semibold truncate">
                          {entry.fullName}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-white font-bold">{entry.totalScore} pts</div>
                        <div className="text-[10px] text-[#6B7799] uppercase tracking-wide">
                          {formatTime(entry.totalTimeSeconds)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Privacy notice */}
          <p className="text-[10px] text-[#4A5470] text-center mt-4 leading-relaxed">
            🔒 Only name, score and time are public.
            Email, payment details and other personal info stay private.
          </p>
        </>
      )}
    </div>
  );
}
