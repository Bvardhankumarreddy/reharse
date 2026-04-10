"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { useApiClient } from "@/lib/hooks/useApiClient";
import type { JDMatchResponse } from "@/lib/api/client";


function ScoreRing({ score }: { score: number }) {
  const color = score >= 70 ? "text-green-500" : score >= 45 ? "text-amber-500" : "text-red-500";
  const bg    = score >= 70 ? "bg-green-50"   : score >= 45 ? "bg-amber-50"   : "bg-red-50";
  return (
    <div className={clsx("w-28 h-28 rounded-full flex flex-col items-center justify-center border-4", bg,
      score >= 70 ? "border-green-400" : score >= 45 ? "border-amber-400" : "border-red-400")}>
      <span className={clsx("text-3xl font-extrabold font-mono", color)}>{score}</span>
      <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Match</span>
    </div>
  );
}

function Chip({ label, found }: { label: string; found: boolean }) {
  return (
    <span className={clsx(
      "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold",
      found ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600",
    )}>
      <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>
        {found ? "check_circle" : "cancel"}
      </span>
      {label}
    </span>
  );
}

function ResultPanel({ result }: { result: JDMatchResponse }) {
  return (
    <div className="space-y-6">
      {/* Score + summary */}
      <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-6">
        <ScoreRing score={result.match_score} />
        <div className="flex-1">
          <h3 className="text-[16px] font-bold text-text-pri mb-1">Resume Match Analysis</h3>
          <p className="text-[14px] text-text-sec leading-relaxed">{result.summary}</p>
        </div>
      </div>

      {/* Keywords */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded-2xl p-5">
          <h4 className="text-[13px] font-bold text-green-700 mb-3 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>check_circle</span>
            Matched Keywords ({result.matched_keywords.length})
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {result.matched_keywords.length > 0
              ? result.matched_keywords.map((k) => <Chip key={k} label={k} found />)
              : <p className="text-[13px] text-text-muted">No resume provided</p>
            }
          </div>
        </div>
        <div className="bg-surface border border-border rounded-2xl p-5">
          <h4 className="text-[13px] font-bold text-red-600 mb-3 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>cancel</span>
            Missing Keywords ({result.missing_keywords.length})
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {result.missing_keywords.map((k) => <Chip key={k} label={k} found={false} />)}
          </div>
        </div>
      </div>

      {/* Strengths + Gaps */}
      <div className="grid sm:grid-cols-2 gap-4">
        {[
          { title: "Strengths", items: result.strengths, icon: "thumb_up", color: "text-green-700" },
          { title: "Gaps",      items: result.gaps,      icon: "warning",  color: "text-amber-600" },
        ].map(({ title, items, icon, color }) => (
          <div key={title} className="bg-surface border border-border rounded-2xl p-5">
            <h4 className={clsx("text-[13px] font-bold mb-3 flex items-center gap-1.5", color)}>
              <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>{icon}</span>
              {title}
            </h4>
            <ul className="space-y-1.5">
              {items.map((item, i) => (
                <li key={i} className="text-[13px] text-text-sec flex gap-2">
                  <span className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-current opacity-50" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Recommendations */}
      <div className="bg-surface border border-border rounded-2xl p-5">
        <h4 className="text-[13px] font-bold text-blue mb-3 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>tips_and_updates</span>
          Resume Recommendations
        </h4>
        <ol className="space-y-2">
          {result.recommendations.map((rec, i) => (
            <li key={i} className="text-[13px] text-text-sec flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue/10 text-blue text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
              {rec}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export default function JDMatchPage() {
  const { api, ready } = useApiClient();

  const [isPro,        setIsPro]        = useState(false);
  const [usesThisWeek, setUsesThisWeek] = useState(0);
  const [weekLimit,    setWeekLimit]    = useState(3);

  useEffect(() => {
    if (!ready) return;
    api.getJDMatchUsage()
      .then(({ usesThisWeek, weekLimit, isPro }) => {
        setIsPro(isPro);
        setUsesThisWeek(usesThisWeek);
        setWeekLimit(weekLimit);
      })
      .catch(() => {});
  }, [api, ready]);

  const isLimited = !isPro && usesThisWeek >= weekLimit;

  // "paste" | "url"
  const [inputMode,  setInputMode]  = useState<"paste" | "url">("paste");
  const [jdText,     setJdText]     = useState("");
  const [urlInput,   setUrlInput]   = useState("");
  const [resumeText, setResumeText] = useState("");

  const [fetching,   setFetching]   = useState(false);  // URL fetch in progress
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [result,     setResult]     = useState<JDMatchResponse | null>(null);

  async function handleFetchUrl() {
    if (!urlInput.trim()) return;
    setFetching(true);
    setFetchError(null);
    try {
      const { text } = await api.fetchJDFromUrl(urlInput.trim());
      setJdText(text);
      setInputMode("paste"); // switch to paste tab so user can see/edit the extracted text
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Could not fetch the URL");
    } finally {
      setFetching(false);
    }
  }

  async function handleAnalyze() {
    if (!jdText.trim() || isLimited) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.analyzeJD({
        jobDescription: jdText.trim(),
        resumeText:     resumeText.trim() || undefined,
      });
      setResult(res);
      if (!isPro) setUsesThisWeek((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-heading-l text-text-pri">JD Keyword Match</h2>
          <p className="text-body text-text-sec mt-1">
            Paste a job description or drop in a careers-page URL — see how well your resume matches and exactly what to add.
          </p>
        </div>
        {!isPro && (
          <span className={clsx(
            "self-start flex-shrink-0 text-[12px] font-semibold px-3 py-1.5 rounded-full border",
            usesThisWeek >= weekLimit
              ? "bg-red-50 text-red-600 border-red-200"
              : "bg-bg-app text-text-muted border-border"
          )}>
            {usesThisWeek}/{weekLimit} free this week
          </span>
        )}
      </div>

      {/* Limit wall */}
      {isLimited && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center space-y-4">
          <span className="material-symbols-outlined text-[40px] text-amber-500"
            style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 48" }}>lock</span>
          <div>
            <p className="text-[16px] font-bold text-text-pri">Weekly limit reached</p>
            <p className="text-[13px] text-text-sec mt-1">
              Free accounts get {weekLimit} JD analyses per week. Upgrade to Pro for unlimited access.
            </p>
          </div>
          <Link
            href="/settings?tab=billing"
            className="inline-flex items-center gap-2 btn-gradient text-white px-6 py-2.5 rounded-btn font-semibold text-[14px] shadow-blue-glow hover:-translate-y-0.5 transition-all"
          >
            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>workspace_premium</span>
            Upgrade to Pro
          </Link>
        </div>
      )}

      {/* Input panel */}
      <div className="bg-surface border border-border rounded-2xl p-5 space-y-4">

        {/* Tab switcher */}
        <div className="flex gap-1 p-1 bg-bg-app rounded-xl w-fit">
          {(["paste", "url"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => { setInputMode(mode); setFetchError(null); }}
              className={clsx(
                "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all",
                inputMode === mode
                  ? "bg-surface text-text-pri shadow-sm"
                  : "text-text-muted hover:text-text-sec"
              )}
            >
              <span className="material-symbols-outlined text-[15px]"
                style={{ fontVariationSettings: "'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24" }}>
                {mode === "paste" ? "content_paste" : "link"}
              </span>
              {mode === "paste" ? "Paste JD" : "Job URL"}
            </button>
          ))}
        </div>

        {/* URL mode */}
        {inputMode === "url" && (
          <div className="space-y-3">
            <label className="block text-[12px] font-semibold text-text-sec uppercase tracking-wide">
              Career Page URL <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => { setUrlInput(e.target.value); setFetchError(null); }}
                onKeyDown={(e) => e.key === "Enter" && handleFetchUrl()}
                placeholder="https://careers.company.com/jobs/software-engineer-123"
                className="flex-1 px-4 py-2.5 bg-bg-app border border-border rounded-xl text-[14px] text-text-pri
                           placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue/20
                           focus:border-blue/40 transition"
              />
              <button
                onClick={handleFetchUrl}
                disabled={fetching || !urlInput.trim()}
                className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 bg-blue/10 text-blue border border-blue/20
                           rounded-xl text-[13px] font-semibold hover:bg-blue/15 transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {fetching ? (
                  <span className="w-4 h-4 border-2 border-blue/40 border-t-blue rounded-full animate-spin" />
                ) : (
                  <span className="material-symbols-outlined text-[16px]"
                    style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>
                    download
                  </span>
                )}
                {fetching ? "Fetching…" : "Fetch JD"}
              </button>
            </div>
            {fetchError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-[13px] text-red-600 flex items-start gap-2">
                <span className="material-symbols-outlined text-[15px] flex-shrink-0 mt-0.5"
                  style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>error</span>
                <span>{fetchError} — try pasting the job description directly instead.</span>
              </div>
            )}
            <p className="text-[12px] text-text-muted flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">info</span>
              Works best with direct job posting pages. LinkedIn, Workday, Greenhouse, and most ATS portals are supported.
            </p>
          </div>
        )}

        {/* Paste mode — also shown after a successful URL fetch */}
        {inputMode === "paste" && (
          <div>
            <label className="block text-[12px] font-semibold text-text-sec uppercase tracking-wide mb-1.5">
              Job Description <span className="text-red-500">*</span>
            </label>
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder="Paste the full job description here…"
              rows={8}
              className="w-full px-4 py-3 bg-bg-app border border-border rounded-xl text-[14px] text-text-pri
                         placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue/20
                         focus:border-blue/40 transition resize-none"
            />
            {jdText && (
              <p className="text-[11px] text-text-muted mt-1">{jdText.split(/\s+/).filter(Boolean).length} words</p>
            )}
          </div>
        )}

        <div>
          <label className="block text-[12px] font-semibold text-text-sec uppercase tracking-wide mb-1.5">
            Resume Text <span className="text-text-muted font-normal normal-case">(optional — uses your profile resume if blank)</span>
          </label>
          <textarea
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="Paste your resume text here, or leave blank to use your saved profile resume…"
            rows={5}
            className="w-full px-4 py-3 bg-bg-app border border-border rounded-xl text-[14px] text-text-pri
                       placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue/20
                       focus:border-blue/40 transition resize-none"
          />
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-[13px] text-red-600">{error}</div>
        )}

        <button
          onClick={handleAnalyze}
          disabled={loading || !jdText.trim()}
          className="btn-gradient text-white px-6 py-2.5 rounded-btn font-semibold text-[14px]
                     flex items-center gap-2 shadow-blue-glow hover:-translate-y-0.5 transition-all
                     disabled:opacity-50 disabled:translate-y-0 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Analysing…
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>search</span>
              Analyse Match
            </>
          )}
        </button>
      </div>

      {/* Results */}
      {result && <ResultPanel result={result} />}
    </div>
  );
}
