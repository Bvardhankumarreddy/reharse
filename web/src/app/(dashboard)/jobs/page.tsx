"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { useApiClient } from "@/lib/hooks/useApiClient";
import type { JobMatchRow, JobMatchStatus } from "@/lib/api/client";

type Tab = { key: string; label: string; status?: JobMatchStatus };
const TABS: Tab[] = [
  { key: "matches",   label: "Matches" },
  { key: "saved",     label: "Saved",     status: "saved" },
  { key: "applied",   label: "Applied",   status: "applied" },
  { key: "dismissed", label: "Dismissed", status: "dismissed" },
];

function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={clsx("material-symbols-outlined", className)}
      style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}
    >
      {name}
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 70 ? "bg-green-50 text-green-700 border-green-300"
    : score >= 45 ? "bg-amber-50 text-amber-700 border-amber-300"
    : "bg-red-50 text-red-600 border-red-300";
  return (
    <div className={clsx("w-12 h-12 rounded-xl border-2 flex flex-col items-center justify-center shrink-0", tone)}>
      <span className="text-[15px] font-extrabold font-mono leading-none">{Math.round(score)}</span>
      <span className="text-[8px] font-semibold uppercase tracking-wide">fit</span>
    </div>
  );
}

export default function JobsPage() {
  const { api, ready } = useApiClient();
  const [tab, setTab] = useState<Tab>(TABS[0]);
  const [rows, setRows] = useState<JobMatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getJobMatches({ status: tab.status, q: query || undefined });
      setRows(res.data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [api, tab, query]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(t);
  }, [note]);

  async function refresh() {
    setRefreshing(true);
    setNote("Matching jobs to your resume… (Claude, ~10-30s)");
    try {
      const r = await api.refreshJobMatches();
      setNote(
        r.skipped
          ? "Already refreshed recently — showing your latest matches."
          : `✓ ${r.matched} job${r.matched === 1 ? "" : "s"} matched.`,
      );
      await load();
    } catch (e) {
      setNote(`⚠ ${(e as Error).message}`);
    } finally {
      setRefreshing(false);
    }
  }

  async function setStatus(matchId: string, status: JobMatchStatus) {
    setRows((cur) => cur.filter((r) => r.matchId !== matchId)); // optimistic
    try {
      await api.setJobMatchStatus(matchId, status);
    } catch {
      await load();
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold text-text-pri flex items-center gap-2">
            <Icon name="work" className="text-[24px] text-blue" /> Job Matches
          </h1>
          <p className="text-[13px] text-text-sec mt-1 max-w-xl">
            Live openings from company career pages, ranked against your resume
            and target role. Keep your resume updated in Settings for the best
            matches.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing || !ready}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold
                     bg-blue text-white hover:opacity-90 disabled:opacity-50 transition"
        >
          <Icon name="autorenew" className={clsx("text-[18px]", refreshing && "animate-spin")} />
          {refreshing ? "Matching…" : "Refresh matches"}
        </button>
      </div>

      {note && (
        <div className="bg-blue/10 border border-blue/30 text-blue rounded-xl px-3 py-2 text-[13px]">
          {note}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t)}
            className={clsx(
              "px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px transition",
              tab.key === t.key
                ? "border-blue text-text-pri"
                : "border-transparent text-text-muted hover:text-text-sec",
            )}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto py-1.5">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setQuery(q)}
            placeholder="Search title / company…"
            className="w-52 bg-surface border border-border rounded-lg px-3 py-1.5 text-[13px]
                       text-text-pri placeholder:text-text-muted focus:outline-none focus:border-blue"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-center text-text-muted text-[14px] py-16">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-10 text-center">
          <Icon name="work_off" className="text-[32px] text-text-muted" />
          <p className="text-[14px] text-text-sec mt-2">
            {tab.key === "matches"
              ? "No matches yet. Click “Refresh matches” — we’ll pull current openings and rank them against your resume."
              : `Nothing ${tab.label.toLowerCase()} yet.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.matchId} className="bg-surface border border-border rounded-2xl p-4 flex gap-4">
              <ScoreBadge score={r.matchScore} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold text-text-pri truncate">{r.title}</p>
                    <p className="text-[13px] text-text-sec">
                      {r.company}
                      {r.location ? ` · ${r.location}` : ""}
                      {r.remote ? " · Remote" : ""}
                    </p>
                  </div>
                  <span className="text-[10px] uppercase tracking-wide text-text-muted shrink-0 mt-1">
                    {r.source}
                  </span>
                </div>
                {r.rationale && (
                  <p className="text-[12.5px] text-text-sec mt-2 leading-relaxed">
                    <span className="font-semibold text-text-pri">Why it fits: </span>
                    {r.rationale}
                  </p>
                )}
                <div className="flex items-center gap-2 flex-wrap mt-3">
                  <a
                    href={r.applyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-semibold
                               bg-blue text-white hover:opacity-90 transition"
                  >
                    <Icon name="open_in_new" className="text-[14px]" /> View & apply
                  </a>
                  {r.status !== "saved" && (
                    <RowBtn icon="bookmark" label="Save" onClick={() => setStatus(r.matchId, "saved")} />
                  )}
                  {r.status !== "applied" && (
                    <RowBtn icon="task_alt" label="Applied" onClick={() => setStatus(r.matchId, "applied")} />
                  )}
                  {r.status === "dismissed" ? (
                    <RowBtn icon="undo" label="Restore" onClick={() => setStatus(r.matchId, "matched")} />
                  ) : (
                    <RowBtn icon="close" label="Dismiss" onClick={() => setStatus(r.matchId, "dismissed")} />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-text-muted text-center pt-2">
        Missing your dream company?{" "}
        <Link href="/settings" className="text-blue hover:underline">
          Add it to your target companies
        </Link>{" "}
        and keep your resume current.
      </p>
    </div>
  );
}

function RowBtn({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium
                 border border-border text-text-sec hover:text-text-pri hover:bg-bg-app transition"
    >
      <Icon name={icon} className="text-[14px]" /> {label}
    </button>
  );
}
