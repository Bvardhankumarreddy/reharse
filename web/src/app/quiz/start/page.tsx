"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function QuizStartPage() {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: "", email: "", upiId: "", youtubeHandle: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/v1/quiz/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to start quiz" }));
        throw new Error(err.message ?? "Failed to start quiz");
      }

      const data = await res.json();

      // Persist session start data for /quiz/play to pick up
      sessionStorage.setItem(
        "quiz-session",
        JSON.stringify({
          sessionId: data.sessionId,
          quizWeek: data.quizWeek,
          questionNumber: data.questionNumber,
          totalQuestions: data.totalQuestions,
          question: data.question,
          expiresAt: data.expiresAt,
          durationMinutes: data.durationMinutes,
        }),
      );
      router.push("/quiz/play");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-5 py-12 sm:py-20">
      <Link href="/quiz" className="text-[#B8C5E0] hover:text-white text-sm flex items-center gap-1 mb-6">
        ← Back
      </Link>

      <div className="text-center mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">Almost there!</h1>
        <p className="text-[#B8C5E0]">Enter your details to start the quiz</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 bg-[#151B3D] border border-white/5 rounded-2xl p-6">
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#B8C5E0] block mb-1.5">Full Name *</label>
          <input
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            required
            placeholder="John Doe"
            className="w-full bg-[#0A0E27] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-[#4A5470] focus:outline-none focus:border-[#00D4FF] transition"
          />
        </div>

        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#B8C5E0] block mb-1.5">Email *</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
            placeholder="you@example.com"
            className="w-full bg-[#0A0E27] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-[#4A5470] focus:outline-none focus:border-[#00D4FF] transition"
          />
          <p className="text-[10px] text-[#4A5470] mt-1">One submission per email per week</p>
        </div>

        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#B8C5E0] block mb-1.5">UPI ID / Amazon Email *</label>
          <input
            value={form.upiId}
            onChange={(e) => setForm({ ...form, upiId: e.target.value })}
            required
            placeholder="yourname@paytm or amazon.in@gmail.com"
            className="w-full bg-[#0A0E27] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-[#4A5470] focus:outline-none focus:border-[#00D4FF] transition"
          />
          <p className="text-[10px] text-[#4A5470] mt-1">Used for prize payout if you win</p>
        </div>

        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#B8C5E0] block mb-1.5">
            YouTube Handle <span className="text-[#4A5470] normal-case font-normal">(optional)</span>
          </label>
          <input
            value={form.youtubeHandle}
            onChange={(e) => setForm({ ...form, youtubeHandle: e.target.value })}
            placeholder="@yourhandle"
            className="w-full bg-[#0A0E27] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-[#4A5470] focus:outline-none focus:border-[#00D4FF] transition"
          />
        </div>

        {error && (
          <div className="bg-[#FF5C7C]/10 border border-[#FF5C7C]/30 rounded-xl p-3 text-[#FF5C7C] text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-gradient-to-r from-[#00D4FF] to-[#0099CC] text-[#0A0E27] font-bold text-lg py-4 rounded-xl shadow-[0_0_30px_rgba(0,212,255,0.3)] hover:shadow-[0_0_50px_rgba(0,212,255,0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Starting..." : "Begin Quiz →"}
        </button>

        <p className="text-[10px] text-[#4A5470] text-center">
          By starting, you agree to fair play. No reattempts permitted.
        </p>
      </form>
    </div>
  );
}
