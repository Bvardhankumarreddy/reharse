"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuizDeviceSignals } from "@/lib/quiz-trust-signals";

type VerifyResult = {
  valid: boolean;
  canonicalHandle?: string;
  channelId?: string;
  channelTitle?: string;
  thumbnailUrl?: string;
  subscriberCount?: number;
  customUrl?: string;
  reason?: "not_found" | "api_disabled" | "api_error" | "invalid_input";
  message?: string;
};

export default function QuizStartPage() {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: "", email: "", upiId: "", youtubeHandle: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const { deviceFingerprint, browserId, screenResolution } = useQuizDeviceSignals();

  async function handleVerifyYoutube() {
    setError(null);
    setVerify(null);
    if (!form.youtubeHandle?.trim()) {
      setVerify({ valid: false, reason: "invalid_input", message: "Enter your handle first" });
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch(
        `/api/v1/quiz/verify-youtube-handle?handle=${encodeURIComponent(form.youtubeHandle)}`,
      );
      const data: VerifyResult = await res.json();
      setVerify(data);
      // If the API canonicalised the handle (e.g. user pasted a URL),
      // snap the input value to the clean @handle so submit ships it.
      if (data.canonicalHandle && data.canonicalHandle !== form.youtubeHandle) {
        setForm((f) => ({ ...f, youtubeHandle: data.canonicalHandle! }));
      }
    } catch (e) {
      setVerify({
        valid: false, reason: "api_error",
        message: e instanceof Error ? e.message : "Verification failed",
      });
    } finally {
      setVerifying(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/v1/quiz/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          ...(deviceFingerprint ? { deviceFingerprint } : {}),
          browserId,
          screenResolution,
        }),
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
            YouTube Handle
          </label>
          <div className="flex gap-2">
            <input
              value={form.youtubeHandle}
              onChange={(e) => {
                setForm({ ...form, youtubeHandle: e.target.value });
                // Reset verification when the handle changes so the
                // preview can't go stale relative to the input.
                if (verify) setVerify(null);
              }}
              required
              placeholder="@yourhandle"
              className="flex-1 min-w-0 bg-[#0A0E27] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-[#4A5470] focus:outline-none focus:border-[#00D4FF] transition"
            />
            <button
              type="button"
              onClick={handleVerifyYoutube}
              disabled={verifying || !form.youtubeHandle?.trim()}
              className="px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-semibold rounded-xl whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {verifying ? "…" : verify?.valid ? "✓" : "Verify"}
            </button>
          </div>
          <p className="text-[10px] text-[#4A5470] mt-1">
            Required — we verify you&apos;re subscribed before paying out. Tap Verify to confirm your channel.
          </p>

          {/* ── Verification result ──────────────────────────────── */}
          {verify?.valid && verify.channelId && (
            <div className="mt-2 flex items-center gap-3 bg-[#00D4FF]/5 border border-[#00D4FF]/30 rounded-xl p-3">
              {verify.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={verify.thumbnailUrl}
                  alt={verify.channelTitle ?? "channel"}
                  className="w-12 h-12 rounded-full border border-[#00D4FF]/30 flex-shrink-0"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-white truncate">
                  ✓ {verify.channelTitle}
                </div>
                <div className="text-[11px] text-[#B8C5E0] truncate">
                  {verify.canonicalHandle}
                  {typeof verify.subscriberCount === "number" && (
                    <> · {verify.subscriberCount.toLocaleString()} subscribers</>
                  )}
                </div>
              </div>
            </div>
          )}
          {verify && !verify.valid && (
            <div className="mt-2 bg-[#FF5C7C]/10 border border-[#FF5C7C]/30 rounded-xl p-3 text-[#FF5C7C] text-[12px]">
              {verify.reason === "not_found" && (
                <>No channel found for <span className="font-semibold">{verify.canonicalHandle}</span>. Double-check the spelling.</>
              )}
              {verify.reason === "api_disabled" && (
                <>YouTube verification is offline right now — your handle will be saved as-is. You can still proceed.</>
              )}
              {verify.reason === "api_error" && <>Couldn&apos;t reach YouTube. Try Verify again.</>}
              {verify.reason === "invalid_input" && <>{verify.message}</>}
            </div>
          )}
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
