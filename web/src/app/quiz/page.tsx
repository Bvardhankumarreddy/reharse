"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface QuizInfo {
  quizWeek: number;
  questionsPerQuiz: number;
  totalQuestionsAvailable: number;
  totalSubmissions: number;
  isOpen: boolean;
}

export default function QuizLandingPage() {
  const [info, setInfo] = useState<QuizInfo | null>(null);

  useEffect(() => {
    fetch("/api/v1/quiz/info").then((r) => r.json()).then(setInfo).catch(() => {});
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-5 py-12 sm:py-20">
      {/* Header */}
      <div className="text-center mb-12">
        <span className="inline-block text-[11px] font-bold tracking-widest text-[#00D4FF] uppercase mb-3">
          ⚡ Weekly Challenge
        </span>
        <h1 className="text-[40px] sm:text-[56px] font-bold tracking-tight leading-[1.05] mb-4">
          AI Knowledge <span className="text-[#FFD700]">Quiz</span>
        </h1>
        <p className="text-[#B8C5E0] text-lg max-w-xl mx-auto">
          Test your AI fundamentals. Win prizes. Sharpen your interview prep — all in 5 minutes.
        </p>
      </div>

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
            "Answer 5 random AI questions (mix of easy, medium, hard)",
            "Each correct answer earns 1-3 points based on difficulty",
            "Optional 30-second timer per question",
            "One submission per email per week",
            "Tiebreaker question decides ties — closest wins",
            "Winners announced every Saturday",
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
      <Link
        href="/quiz/start"
        className="block w-full text-center bg-gradient-to-r from-[#00D4FF] to-[#0099CC] text-[#0A0E27] font-bold text-lg py-4 rounded-2xl shadow-[0_0_40px_rgba(0,212,255,0.4)] hover:shadow-[0_0_60px_rgba(0,212,255,0.6)] transition-all active:scale-[0.98]"
      >
        Start Quiz →
      </Link>

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
