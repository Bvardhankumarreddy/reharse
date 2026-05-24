"use client";

// Admin route error boundary. Replaces Next's generic "couldn't load" screen
// with the actual error message + stack so failures are diagnosable, and a
// retry button so a transient error doesn't require a full reload.

import { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface in the browser console too.
    console.error("[admin] render error:", error);
  }, [error]);

  return (
    <div className="max-w-2xl mx-auto mt-10 rounded-2xl border border-red-400/30 bg-red-500/5 p-6 space-y-4">
      <div>
        <h2 className="text-lg font-bold text-red-300">⚠ This admin page hit an error</h2>
        <p className="text-sm text-[#B8C5E0] mt-1">
          The page failed to render. The details below help pin down the cause.
        </p>
      </div>

      <div className="rounded-xl bg-[#0A0E27] border border-white/10 p-3">
        <p className="text-[10px] uppercase tracking-wide text-[#6B7799] mb-1">Message</p>
        <pre className="text-[12px] text-red-200 whitespace-pre-wrap font-mono">
          {error?.message || "(no message)"}
        </pre>
        {error?.digest && (
          <p className="text-[10px] text-[#6B7799] mt-2">digest: {error.digest}</p>
        )}
      </div>

      {error?.stack && (
        <details className="rounded-xl bg-[#0A0E27] border border-white/10 p-3">
          <summary className="text-[11px] text-[#6B7799] cursor-pointer select-none">
            Stack trace (tap to expand — copy this to report the bug)
          </summary>
          <pre className="text-[11px] text-[#8b96b5] whitespace-pre-wrap font-mono mt-2 overflow-auto max-h-80">
            {error.stack}
          </pre>
        </details>
      )}

      <div className="flex gap-2">
        <button
          onClick={reset}
          className="px-4 py-1.5 text-xs font-semibold rounded-lg border border-[#00D4FF]/40 text-[#00D4FF] hover:bg-[#00D4FF]/10 transition"
        >
          ↻ Try again
        </button>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-1.5 text-xs font-semibold rounded-lg border border-white/10 text-[#B8C5E0] hover:bg-white/5 transition"
        >
          Reload page
        </button>
      </div>
    </div>
  );
}
