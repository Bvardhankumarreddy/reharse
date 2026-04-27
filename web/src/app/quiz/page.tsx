"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface QuizInfo {
  status: "live" | "upcoming" | "closed" | "no-quiz";
  quizWeek: number;
  title: string;
  description: string;
  startsAt: string | null;
  endsAt: string | null;
  durationMinutes: number;
  questionsPerQuiz: number;
  totalQuestionsAvailable: number;
  totalSubmissions: number;
  isOpen: boolean;
}

function formatCountdown(target: Date) {
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return null;
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  return `${hours}h ${mins}m ${secs}s`;
}

export default function QuizLandingPage() {
  const [info, setInfo] = useState<QuizInfo | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/quiz/info").then((r) => r.json()).then(setInfo).catch(() => {});
  }, []);

  useEffect(() => {
    if (!info) return;
    const target = info.status === "upcoming" && info.startsAt
      ? new Date(info.startsAt)
      : info.status === "live" && info.endsAt
        ? new Date(info.endsAt)
        : null;
    if (!target) return;
    const tick = () => setCountdown(formatCountdown(target));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [info]);

  const isLive = info?.status === "live" && info.isOpen;
  const isUpcoming = info?.status === "upcoming";
  const isClosed = info?.status === "closed" || info?.status === "no-quiz";

  return (
    <div className="max-w-3xl mx-auto px-5 py-12 sm:py-20">
      {/* Header */}
      <div className="text-center mb-12">
        <span className="inline-block text-[11px] font-bold tracking-widest text-[#00D4FF] uppercase mb-3">
          ⚡ Weekly Challenge
        </span>
        <h1 className="text-[40px] sm:text-[56px] font-bold tracking-tight leading-[1.05] mb-4">
          {info?.title ?? "AI Knowledge Quiz"}
        </h1>
        <p className="text-[#B8C5E0] text-lg max-w-xl mx-auto">
          {info?.description || "Test your AI fundamentals. Win prizes. Sharpen your interview prep — all in 5 minutes."}
        </p>
      </div>

      {/* Status banner */}
      {info && (
        <div
          className={`rounded-2xl p-5 mb-8 text-center border ${
            isLive ? "bg-[#00F5A0]/10 border-[#00F5A0]/30" :
            isUpcoming ? "bg-[#00D4FF]/10 border-[#00D4FF]/30" :
            "bg-[#FF5C7C]/10 border-[#FF5C7C]/30"
          }`}
        >
          {isLive && (
            <>
              <div className="text-[#00F5A0] text-[11px] font-bold tracking-widest uppercase mb-1">🟢 Live Now</div>
              {countdown && info.endsAt && (
                <div className="text-white text-2xl font-bold tabular-nums">Closes in {countdown}</div>
              )}
              <div className="text-[#B8C5E0] text-xs mt-1">
                You have <span className="text-white font-bold">{info.durationMinutes} minutes</span> once you start
              </div>
            </>
          )}
          {isUpcoming && (
            <>
              <div className="text-[#00D4FF] text-[11px] font-bold tracking-widest uppercase mb-1">⏳ Coming Soon</div>
              {countdown && (
                <div className="text-white text-2xl font-bold tabular-nums">Starts in {countdown}</div>
              )}
              {info.startsAt && (
                <div className="text-[#B8C5E0] text-xs mt-1">
                  {new Date(info.startsAt).toLocaleString()}
                </div>
              )}
            </>
          )}
          {isClosed && (
            <>
              <div className="text-[#FF5C7C] text-[11px] font-bold tracking-widest uppercase mb-1">🔒 Closed</div>
              <div className="text-white text-lg font-bold">Quiz has ended</div>
              <div className="text-[#B8C5E0] text-xs mt-1">Stay tuned for the next weekly quiz!</div>
            </>
          )}
        </div>
      )}

      {/* Live stats */}
      {info && (
        <div className="grid grid-cols-3 gap-3 mb-10">
          <div className="bg-[#151B3D] border border-white/5 rounded-2xl p-4 text-center">
            <div className="text-2xl font-bold text-white">Week {info.quizWeek}</div>
            <div className="text-xs text-[#B8C5E0] mt-1">Current Quiz</div>
          </div>
          <div className="bg-[#151B3D] border border-white/5 rounded-2xl p-4 text-center">
            <div className="text-2xl font-bold text-[#00D4FF]">{info.questionsPerQuiz}</div>
            <div className="text-xs text-[#B8C5E0] mt-1">Questions</div>
          </div>
          <div className="bg-[#151B3D] border border-white/5 rounded-2xl p-4 text-center">
            <div className="text-2xl font-bold text-[#00F5A0]">{info.totalSubmissions}</div>
            <div className="text-xs text-[#B8C5E0] mt-1">Submissions</div>
          </div>
        </div>
      )}

      {/* Prizes */}
      <div className="bg-[#151B3D] border border-white/5 rounded-2xl p-6 mb-6">
        <h2 className="text-[#FFD700] font-bold text-lg mb-4 flex items-center gap-2">
          🏆 This Week&apos;s Prizes
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { rank: "1st", color: "from-[#FFD700] to-[#FFA500]", emoji: "🥇" },
            { rank: "2nd", color: "from-[#C0C0C0] to-[#A0A0A0]", emoji: "🥈" },
            { rank: "3rd", color: "from-[#CD7F32] to-[#A0522D]", emoji: "🥉" },
          ].map((p) => (
            <div key={p.rank} className="text-center">
              <div className="text-3xl mb-1">{p.emoji}</div>
              <div className={`text-sm font-bold bg-gradient-to-r ${p.color} bg-clip-text text-transparent`}>{p.rank} Place</div>
              <div className="text-xs text-[#B8C5E0]">Cash + Pro</div>
            </div>
          ))}
        </div>
      </div>

      {/* Rules */}
      <div className="bg-[#151B3D] border border-white/5 rounded-2xl p-6 mb-8">
        <h2 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
          🎯 How It Works
        </h2>
        <ul className="space-y-3">
          {[
            `Answer ${info?.questionsPerQuiz ?? 5} random AI questions (mix of easy, medium, hard)`,
            "Each correct answer earns 1-3 points based on difficulty",
            `Once you start, you have ${info?.durationMinutes ?? 5} minutes total — timer won't pause`,
            "One attempt only — submission per email per quiz",
            "Tiebreaker question decides ties — closest wins",
            "Winners announced after quiz closes",
          ].map((rule, i) => (
            <li key={i} className="flex items-start gap-3 text-[#B8C5E0]">
              <span className="w-5 h-5 rounded-full bg-[#00D4FF]/15 text-[#00D4FF] flex items-center justify-center text-[11px] font-bold shrink-0">
                {i + 1}
              </span>
              <span className="text-sm">{rule}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* CTA */}
      {isLive ? (
        <Link
          href="/quiz/start"
          className="block w-full text-center bg-gradient-to-r from-[#00D4FF] to-[#0099CC] text-[#0A0E27] font-bold text-lg py-4 rounded-2xl shadow-[0_0_40px_rgba(0,212,255,0.4)] hover:shadow-[0_0_60px_rgba(0,212,255,0.6)] transition-all active:scale-[0.98]"
        >
          Start Quiz →
        </Link>
      ) : (
        <button
          disabled
          className="block w-full text-center bg-white/5 text-[#4A5470] font-bold text-lg py-4 rounded-2xl cursor-not-allowed"
        >
          {isUpcoming ? "Quiz hasn't started yet" : "Quiz is closed"}
        </button>
      )}

      {/* Promo: Rehearse */}
      <div className="mt-16 bg-gradient-to-br from-[#151B3D] to-[#0F1438] border border-[#00D4FF]/20 rounded-2xl p-6 sm:p-8 text-center">
        <span className="inline-block text-[10px] font-bold tracking-widest text-[#00D4FF] uppercase mb-2">
          Built by
        </span>
        <h3 className="text-2xl sm:text-3xl font-bold text-white mb-3">
          Rehearse
        </h3>
        <p className="text-[#B8C5E0] text-sm mb-5 max-w-md mx-auto">
          AI-powered mock interviews for SDE, PM, Data roles. Practice unlimited sessions,
          get personalized feedback, and ace your dream company.
        </p>
        <a
          href="https://reharse.inferix.in"
          target="_blank"
          rel="noopener"
          className="inline-block bg-white text-[#0A0E27] font-bold px-6 py-2.5 rounded-xl hover:bg-[#FFD700] transition"
        >
          Try Rehearse Free →
        </a>
      </div>
    </div>
  );
}
