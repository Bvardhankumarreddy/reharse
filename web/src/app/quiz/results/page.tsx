"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface QuizResult {
  submissionId: string;
  totalScore: number;
  maxScore: number;
  correctCount: number;
  totalQuestions: number;
  totalTimeSeconds: number;
  rank: number;
  totalSubmissions: number;
}

export default function QuizResultsPage() {
  const router = useRouter();
  const [result, setResult] = useState<QuizResult | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("quiz-result");
    if (!raw) {
      router.replace("/quiz");
      return;
    }
    try {
      setResult(JSON.parse(raw));
    } catch {
      router.replace("/quiz");
    }
  }, [router]);

  if (!result) {
    return (
      <div className="max-w-2xl mx-auto px-5 py-12 text-center">
        <div className="w-8 h-8 mx-auto rounded-full border-2 border-[#00D4FF] border-t-transparent animate-spin" />
      </div>
    );
  }

  const percentage = result.maxScore > 0 ? Math.round((result.totalScore / result.maxScore) * 100) : 0;
  const isPerfect = result.totalScore === result.maxScore && result.maxScore > 0;
  const isGood = percentage >= 70;
  const minutes = Math.floor(result.totalTimeSeconds / 60);
  const seconds = result.totalTimeSeconds % 60;

  return (
    <div className="max-w-2xl mx-auto px-5 py-12 sm:py-16">
      {/* Score display */}
      <div className="text-center mb-10">
        <div className="text-6xl mb-4">
          {isPerfect ? "🎉" : isGood ? "🎯" : "👍"}
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
          {isPerfect ? "Perfect Score!" : isGood ? "Great job!" : "Quiz Complete!"}
        </h1>
        <p className="text-[#B8C5E0]">Your submission has been recorded.</p>
      </div>

      {/* Big score card */}
      <div className="bg-gradient-to-br from-[#151B3D] to-[#0F1438] border border-[#00D4FF]/20 rounded-3xl p-8 mb-6 text-center">
        <div className="text-[12px] font-bold tracking-widest text-[#00D4FF] uppercase mb-3">
          Your Score
        </div>
        <div className="text-6xl sm:text-7xl font-bold mb-2">
          <span className={isPerfect ? "text-[#FFD700]" : "text-white"}>{result.totalScore}</span>
          <span className="text-[#4A5470]">/{result.maxScore}</span>
        </div>
        <div className={`text-2xl font-bold ${isPerfect ? "text-[#FFD700]" : isGood ? "text-[#00F5A0]" : "text-[#00D4FF]"}`}>
          {percentage}%
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className="bg-[#151B3D] border border-white/5 rounded-2xl p-4 text-center">
          <div className="text-2xl font-bold text-white">{result.correctCount}/{result.totalQuestions}</div>
          <div className="text-[10px] text-[#B8C5E0] mt-1 uppercase tracking-wide">Correct</div>
        </div>
        <div className="bg-[#151B3D] border border-white/5 rounded-2xl p-4 text-center">
          <div className="text-2xl font-bold text-white">{minutes}:{String(seconds).padStart(2, "0")}</div>
          <div className="text-[10px] text-[#B8C5E0] mt-1 uppercase tracking-wide">Total Time</div>
        </div>
        <div className="bg-[#151B3D] border border-white/5 rounded-2xl p-4 text-center">
          <div className="text-2xl font-bold text-[#FFD700]">#{result.rank}</div>
          <div className="text-[10px] text-[#B8C5E0] mt-1 uppercase tracking-wide">of {result.totalSubmissions}</div>
        </div>
      </div>

      {/* Note */}
      <p className="text-[#B8C5E0] text-center text-sm mb-8">
        🏆 Winners announced every Saturday. Correct answers will be revealed once submissions close.
      </p>

      {/* Share */}
      <div className="bg-[#151B3D] border border-white/5 rounded-2xl p-5 mb-6">
        <h3 className="text-white font-bold mb-3 text-center">Share your score</h3>
        <div className="flex gap-2 justify-center flex-wrap">
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`I scored ${result.totalScore}/${result.maxScore} (rank #${result.rank}) on the Rehearse Weekly AI Quiz! 🎯 Try it: `)}&url=${encodeURIComponent(typeof window !== "undefined" ? `${window.location.origin}/quiz` : "")}`}
            target="_blank"
            rel="noopener"
            className="px-5 py-2 bg-black text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition"
          >
            Share on X
          </a>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`I scored ${result.totalScore}/${result.maxScore} on the Rehearse Weekly AI Quiz! Try it: ${typeof window !== "undefined" ? `${window.location.origin}/quiz` : ""}`)}`}
            target="_blank"
            rel="noopener"
            className="px-5 py-2 bg-[#25D366] text-white text-sm font-medium rounded-xl hover:bg-[#1FB855] transition"
          >
            WhatsApp
          </a>
        </div>
      </div>

      {/* Promo: Rehearse */}
      <div className="bg-gradient-to-br from-[#0F1438] to-[#151B3D] border border-[#FFD700]/20 rounded-2xl p-6 sm:p-8 text-center mb-4">
        <span className="inline-block text-[10px] font-bold tracking-widest text-[#FFD700] uppercase mb-2">
          Take it to the next level
        </span>
        <h3 className="text-2xl font-bold text-white mb-3">
          Practice real interview questions on <span className="text-[#FFD700]">Rehearse</span>
        </h3>
        <p className="text-[#B8C5E0] text-sm mb-5 max-w-md mx-auto">
          AI mock interviews. Personalized feedback. STAR coaching. Get ready for FAANG, startups, and more.
        </p>
        <a
          href="https://reharse.inferix.in"
          target="_blank"
          rel="noopener"
          className="inline-block bg-gradient-to-r from-[#FFD700] to-[#FFA500] text-[#0A0E27] font-bold px-6 py-3 rounded-xl hover:shadow-[0_0_30px_rgba(255,215,0,0.4)] transition"
        >
          Start Practicing Free →
        </a>
      </div>

      <div className="text-center">
        <Link href="/quiz" className="text-[#B8C5E0] hover:text-white text-sm">
          ← Back to Quiz
        </Link>
      </div>
    </div>
  );
}
