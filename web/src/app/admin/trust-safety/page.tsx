"use client";

import { useCallback, useEffect, useState } from "react";

interface SuspiciousIp {
  ip: string;
  count: number;
  city: string | null;
  country: string | null;
  isVpn: boolean;
  users: Array<{
    email: string;
    name: string | null;
    score: number | null;
    timeSeconds: number | null;
    submittedAt: string;
  }>;
}

interface OverviewResp {
  quizWeek: number;
  totalSubmissions: number;
  uniqueIps: number;
  uniqueDevices: number;
  vpnSubmissions: number;
  copyPasteDetected: number;
  heavyTabSwitching: number;
  suspiciousIps: SuspiciousIp[];
}

export default function TrustSafetyOverviewPage() {
  const [token, setToken] = useState<string | null>(null);
  const [quizWeek, setQuizWeek] = useState("5");
  const [data, setData] = useState<OverviewResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/token")
      .then((r) => r.json())
      .then((d: { token?: string }) => { if (d.token) setToken(d.token); });
  }, []);

  const load = useCallback(async () => {
    if (!token || !quizWeek) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(
        `/api/v1/admin/trust-safety/quiz/${encodeURIComponent(quizWeek)}/overview`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setData(null);
    } finally { setLoading(false); }
  }, [token, quizWeek]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-white">🛡 Trust &amp; Safety — Quiz Overview</h1>
        <p className="text-[#6B7799] text-sm">
          Per-week fingerprint summary. Suspicious IPs = same IP with ≥3 submissions in the lookback window.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-[#6B7799] flex items-center gap-2">
          quiz week
          <input
            type="number" min={1} max={999}
            value={quizWeek}
            onChange={(e) => setQuizWeek(e.target.value)}
            className="w-20 bg-[#0F1330] border border-white/10 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-[#00D4FF]/40"
          />
        </label>
        <button
          onClick={() => void load()}
          disabled={loading || !token || !quizWeek}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#00D4FF]/40 text-[#00D4FF] hover:bg-[#00D4FF]/10 disabled:opacity-50"
        >
          {loading ? "Loading…" : "🔄 Refresh"}
        </button>
        {error && <span className="text-xs text-red-300">⚠ {error}</span>}
      </div>

      {/* Top stats */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          <Stat label="Submissions"      value={data.totalSubmissions} />
          <Stat label="Unique IPs"       value={data.uniqueIps} />
          <Stat label="Unique devices"   value={data.uniqueDevices} accent="#00F5A0" />
          <Stat label="VPN flagged"      value={data.vpnSubmissions} accent="#FFB020" />
          <Stat label="Copy/paste seen"  value={data.copyPasteDetected} accent="#FFB020" />
          <Stat label="Heavy tab switch" value={data.heavyTabSwitching} accent="#FF5C7C" />
        </div>
      )}

      {/* Suspicious IPs */}
      {data && (
        <section className="bg-[#151B3D] border border-white/10 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#B8C5E0] uppercase tracking-wide">
              🚨 Suspicious IPs ({data.suspiciousIps.length})
            </h2>
            <span className="text-[10px] text-[#6B7799]">≥ 3 submissions from same IP</span>
          </div>

          {data.suspiciousIps.length === 0 ? (
            <p className="text-[#6B7799] text-sm py-6 text-center">
              No suspicious IPs for week {data.quizWeek}. Clean week.
            </p>
          ) : (
            <ul className="space-y-3">
              {data.suspiciousIps.map((s) => (
                <li key={s.ip} className="border border-white/5 rounded-xl overflow-hidden">
                  <div className="bg-white/[0.03] px-3 py-2 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <code className="text-[#B8C5E0] text-sm">{s.ip}</code>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-300">
                        ×{s.count}
                      </span>
                      {s.isVpn && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#FFB020]/20 text-[#FFB020]">
                          VPN
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-[#6B7799]">
                      {s.city ?? "?"}{s.country ? ` · ${s.country}` : ""}
                    </span>
                  </div>
                  <ul className="px-3 py-2 space-y-0.5">
                    {s.users.map((u, i) => (
                      <li key={`${u.email}-${i}`} className="flex items-center gap-2 text-[11px] text-[#B8C5E0]">
                        <span className="text-[#6B7799] w-12 shrink-0 font-mono text-[10px]">
                          {u.timeSeconds != null ? `${u.timeSeconds}s` : "—"}
                        </span>
                        <span className="text-[#FFB020] w-10 shrink-0 text-[10px]">
                          {u.score ?? "—"}
                        </span>
                        <span className="flex-1 truncate">{u.name ?? "—"} · {u.email}</span>
                        <span className="text-[10px] text-[#6B7799] shrink-0">
                          {new Date(u.submittedAt).toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!data && !loading && !error && (
        <p className="text-[#6B7799] text-sm">
          Enter a quiz week and click Refresh. No data yet means no submissions were captured for that week.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, accent = "#00D4FF" }: {
  label: string; value: number; accent?: string;
}) {
  return (
    <div className="bg-[#151B3D] border border-white/10 rounded-xl p-3">
      <p className="text-[10px] text-[#6B7799] uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold mt-0.5" style={{ color: accent }}>{value}</p>
    </div>
  );
}
