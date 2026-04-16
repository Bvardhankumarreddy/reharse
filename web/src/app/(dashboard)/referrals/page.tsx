"use client";

import { useState, useEffect } from "react";
import { useApiClient } from "@/lib/hooks/useApiClient";
import type { ReferralData } from "@/lib/api/client";

export default function ReferralsPage() {
  const { api, ready } = useApiClient();
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [applyCode, setApplyCode] = useState("");
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!ready) return;
    api.getMyReferrals()
      .then(setData)
      .finally(() => setLoading(false));
  }, [api, ready]);

  async function handleApply() {
    if (!applyCode.trim()) return;
    setApplying(true);
    setMessage(null);
    try {
      const res = await api.applyReferral(applyCode.trim());
      setMessage({ type: "success", text: res.message });
      setApplyCode("");
      // Reload referral data
      const updated = await api.getMyReferrals();
      setData(updated);
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Failed to apply code" });
    } finally {
      setApplying(false);
    }
  }

  function copyCode() {
    if (!data) return;
    navigator.clipboard.writeText(data.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const shareUrl = typeof window !== "undefined" && data
    ? `${window.location.origin}/sign-up?ref=${data.code}`
    : "";

  if (loading) {
    return (
      <div className="max-w-2xl space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 bg-surface border border-border rounded-card animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-heading-l text-text-pri">Referral Program</h2>
        <p className="text-body text-text-sec mt-1">
          Invite friends and both of you get 7 days of free Pro access
        </p>
      </div>

      {/* Your Referral Code */}
      {data && (
        <div className="bg-surface border border-border rounded-card p-6">
          <h3 className="text-text-pri font-semibold mb-4">Your Referral Code</h3>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 bg-bg-app border border-border rounded-xl px-5 py-3 font-mono text-xl text-text-pri tracking-widest text-center">
              {data.code}
            </div>
            <button
              onClick={copyCode}
              className="px-4 py-3 bg-bg-app border border-border rounded-xl text-text-sec hover:text-text-pri transition text-sm font-medium"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          {/* Share buttons */}
          <div className="flex gap-2 flex-wrap">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Join me on Rehearse for AI mock interviews! Use my referral code ${data.code} to get 7 days Pro free: ${shareUrl}`)}`}
              target="_blank"
              rel="noopener"
              className="px-4 py-2 bg-green-500 text-white text-sm font-medium rounded-xl hover:bg-green-600 transition"
            >
              WhatsApp
            </a>
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Practice mock interviews with AI on @Rehearse! Use my referral code ${data.code} for 7 days Pro free`)}&url=${encodeURIComponent(shareUrl)}`}
              target="_blank"
              rel="noopener"
              className="px-4 py-2 bg-black text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition"
            >
              Twitter/X
            </a>
            <a
              href={`mailto:?subject=${encodeURIComponent("Try Rehearse - AI Mock Interviews")}&body=${encodeURIComponent(`Hey! I've been using Rehearse for AI mock interview practice and it's great. Use my referral code ${data.code} to get 7 days Pro free: ${shareUrl}`)}`}
              className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-xl hover:bg-blue-600 transition"
            >
              Email
            </a>
          </div>
        </div>
      )}

      {/* Stats */}
      {data && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-surface border border-border rounded-card p-4 text-center">
            <div className="text-2xl font-bold text-text-pri">{data.totalReferred}</div>
            <div className="text-xs text-text-muted mt-1">Friends Referred</div>
          </div>
          <div className="bg-surface border border-border rounded-card p-4 text-center">
            <div className="text-2xl font-bold text-text-pri">{data.totalRewarded}</div>
            <div className="text-xs text-text-muted mt-1">Rewards Earned</div>
          </div>
          <div className="bg-surface border border-border rounded-card p-4 text-center">
            <div className="text-2xl font-bold text-green-500">{data.totalRewarded * 7}</div>
            <div className="text-xs text-text-muted mt-1">Pro Days Earned</div>
          </div>
        </div>
      )}

      {/* Apply Code */}
      <div className="bg-surface border border-border rounded-card p-6">
        <h3 className="text-text-pri font-semibold mb-3">Have a Referral Code?</h3>
        <div className="flex gap-2">
          <input
            value={applyCode}
            onChange={(e) => setApplyCode(e.target.value.toUpperCase())}
            placeholder="Enter referral code"
            maxLength={12}
            className="flex-1 bg-bg-app border border-border rounded-xl px-4 py-2.5 text-sm text-text-pri placeholder-text-muted focus:outline-none focus:border-blue font-mono tracking-wider"
            onKeyDown={(e) => { if (e.key === "Enter") handleApply(); }}
          />
          <button
            onClick={handleApply}
            disabled={applying || !applyCode.trim()}
            className="btn-gradient text-white px-5 py-2.5 rounded-btn font-semibold text-[14px] disabled:opacity-50"
          >
            {applying ? "Applying..." : "Apply"}
          </button>
        </div>
        {message && (
          <div className={`mt-3 text-sm ${message.type === "success" ? "text-green-600" : "text-red-600"}`}>
            {message.text}
          </div>
        )}
      </div>

      {/* Referral History */}
      {data && data.referrals.length > 0 && (
        <div className="bg-surface border border-border rounded-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-text-pri font-semibold">Referral History</h3>
          </div>
          <div className="divide-y divide-border">
            {data.referrals.map((ref) => (
              <div key={ref.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm text-text-pri">{ref.referredName ?? ref.referredEmail ?? "Pending"}</div>
                  <div className="text-xs text-text-muted">{new Date(ref.createdAt).toLocaleDateString()}</div>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                  ref.status === "rewarded" ? "bg-green-50 text-green-600" :
                  ref.status === "completed" ? "bg-blue-50 text-blue-600" :
                  "bg-gray-50 text-text-muted"
                }`}>
                  {ref.status === "rewarded" ? "+7 days Pro" : ref.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
