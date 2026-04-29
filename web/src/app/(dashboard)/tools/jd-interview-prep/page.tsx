"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApiClient } from "@/lib/hooks/useApiClient";
import type { JDInterviewPrepResponse } from "@/lib/api/client";

const INTERVIEW_TYPES = [
  { value: "mixed",         label: "Mixed (recommended)" },
  { value: "behavioral",    label: "Behavioral" },
  { value: "coding",        label: "Coding" },
  { value: "system-design", label: "System Design" },
  { value: "hr",            label: "HR / Culture" },
  { value: "case-study",    label: "Case Study" },
];

const diffColor: Record<string, string> = {
  easy:   "bg-green-50 text-green-700",
  medium: "bg-amber-50 text-amber-700",
  hard:   "bg-red-50 text-red-700",
};

const typeColor: Record<string, string> = {
  behavioral:      "bg-violet-50 text-violet-700",
  coding:          "bg-sky-50 text-sky-700",
  "system-design": "bg-amber-50 text-amber-700",
  hr:              "bg-emerald-50 text-emerald-700",
  "case-study":    "bg-pink-50 text-pink-700",
};

export default function JDInterviewPrepPage() {
  const router = useRouter();
  const { api, ready } = useApiClient();

  const [tab, setTab] = useState<"url" | "paste">("url");
  const [url, setUrl] = useState("");
  const [jdText, setJdText] = useState("");
  const [fetching, setFetching] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [interviewType, setInterviewType] = useState("mixed");
  const [numQuestions, setNumQuestions] = useState(5);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<JDInterviewPrepResponse | null>(null);
  const [starting, setStarting] = useState(false);

  async function fetchFromUrl() {
    if (!url.trim()) return;
    setFetching(true);
    setError(null);
    try {
      const { text } = await api.fetchJDFromUrl(url.trim());
      setJdText(text);
      setTab("paste"); // switch to text view so user can review/edit
    } catch (e) {
      setError(
        e instanceof Error
          ? `Couldn't read this URL — ${e.message}. Paste the JD text directly instead.`
          : "Couldn't fetch the URL",
      );
    } finally {
      setFetching(false);
    }
  }

  async function generateQuestions() {
    if (!jdText.trim() || jdText.trim().length < 100) {
      setError("Please provide a job description (at least 100 characters)");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const data = await api.jdInterviewPrep({
        jobDescription: jdText.trim(),
        interviewType,
        numQuestions,
      });
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate questions");
    } finally {
      setGenerating(false);
    }
  }

  async function startInterview() {
    if (!result || !ready) return;
    setStarting(true);
    setError(null);
    try {
      // Map AI-generated question type to our valid types; default to behavioral if mixed
      const firstType = result.questions[0]?.type ?? "behavioral";
      const allowed = ["behavioral", "coding", "system-design", "hr", "case-study"];
      const sessionType = allowed.includes(firstType) ? firstType : "behavioral";

      // Persist the JD-generated questions in sessionStorage so the live interview
      // can use them (the interview engine will pull them on session start)
      sessionStorage.setItem("jd-prep-questions", JSON.stringify({
        questions: result.questions,
        targetRole: result.target_role,
        targetCompany: result.target_company,
        experienceLevel: result.experience_level,
      }));

      const session = await api.createSession({
        interviewType: sessionType,
        targetRole: result.target_role,
        targetCompany: result.target_company ?? undefined,
        experienceLevel: result.experience_level,
        durationMinutes: 45,
        mode: "text",
      });

      router.push(`/interview/session?id=${session.id}&jdPrep=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start interview");
      setStarting(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-heading-l text-text-pri">Interview Prep from a Job Description</h2>
        <p className="text-body text-text-sec mt-1">
          Paste a JD or career URL — we&apos;ll generate tailored interview questions based on the role and your resume.
        </p>
      </div>

      {!result && (
        <div className="bg-surface border border-border rounded-card p-6 space-y-4">
          {/* Tab switcher */}
          <div className="flex gap-1 p-1 bg-bg-app border border-border rounded-xl w-fit">
            {(["url", "paste"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all ${
                  tab === t
                    ? "bg-surface shadow-sm text-text-pri"
                    : "text-text-muted hover:text-text-sec"
                }`}
              >
                {t === "url" ? "From URL" : "Paste text"}
              </button>
            ))}
          </div>

          {tab === "url" && (
            <div>
              <label className="text-text-sec text-xs uppercase tracking-wide block mb-1.5">
                Job Posting URL
              </label>
              <div className="flex gap-2">
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://jobs.lever.co/openai/..."
                  className="flex-1 bg-bg-app border border-border rounded-xl px-4 py-2.5 text-sm text-text-pri placeholder-text-muted focus:outline-none focus:border-blue"
                />
                <button
                  onClick={fetchFromUrl}
                  disabled={fetching || !url.trim()}
                  className="px-5 py-2.5 bg-blue text-white text-sm font-semibold rounded-xl hover:bg-blue/90 disabled:opacity-50 transition"
                >
                  {fetching ? "Reading..." : "Fetch JD"}
                </button>
              </div>
              <p className="text-text-muted text-xs mt-2">
                Works best with Lever, Greenhouse, Workable, Ashby, and most company career pages.
                LinkedIn / Indeed don&apos;t work — paste the description directly instead.
              </p>
            </div>
          )}

          {tab === "paste" && (
            <div>
              <label className="text-text-sec text-xs uppercase tracking-wide block mb-1.5">
                Job Description
              </label>
              <textarea
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                rows={12}
                placeholder="Paste the full job description here..."
                className="w-full bg-bg-app border border-border rounded-xl px-4 py-3 text-sm text-text-pri placeholder-text-muted focus:outline-none focus:border-blue font-mono"
              />
              <p className="text-text-muted text-xs mt-1">
                {jdText.trim().length < 100
                  ? `${jdText.trim().length} / 100 characters minimum`
                  : `${jdText.trim().length} characters — looks good`}
              </p>
            </div>
          )}

          {/* Options */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
            <div>
              <label className="text-text-sec text-xs uppercase tracking-wide block mb-1.5">
                Interview Type
              </label>
              <select
                value={interviewType}
                onChange={(e) => setInterviewType(e.target.value)}
                className="w-full bg-bg-app border border-border rounded-xl px-4 py-2.5 text-sm text-text-pri"
              >
                {INTERVIEW_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-text-sec text-xs uppercase tracking-wide block mb-1.5">
                Number of Questions
              </label>
              <select
                value={numQuestions}
                onChange={(e) => setNumQuestions(parseInt(e.target.value, 10))}
                className="w-full bg-bg-app border border-border rounded-xl px-4 py-2.5 text-sm text-text-pri"
              >
                {[3, 5, 7, 10, 15].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={generateQuestions}
            disabled={generating || jdText.trim().length < 100}
            className="w-full btn-gradient text-white py-3 rounded-btn font-semibold text-sm shadow-blue-glow disabled:opacity-50"
          >
            {generating ? "Analyzing JD & generating questions..." : "Generate Interview Questions →"}
          </button>
        </div>
      )}

      {result && (
        <div className="space-y-5">
          {/* Header */}
          <div className="bg-surface border border-border rounded-card p-6">
            <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
              <div>
                <h3 className="text-heading-m text-text-pri">{result.target_role}</h3>
                <div className="flex items-center gap-3 mt-1 text-sm text-text-sec">
                  {result.target_company && <span>{result.target_company}</span>}
                  {result.target_company && <span>·</span>}
                  <span>{result.experience_level}</span>
                </div>
              </div>
              <button
                onClick={() => { setResult(null); setError(null); }}
                className="text-text-muted hover:text-text-sec text-sm"
              >
                ← Generate again
              </button>
            </div>
            <p className="text-text-pri text-sm leading-relaxed mb-4">{result.summary}</p>
            {result.focus_areas.length > 0 && (
              <div>
                <div className="text-text-muted text-[11px] uppercase tracking-wide mb-2">Focus Areas</div>
                <div className="flex gap-2 flex-wrap">
                  {result.focus_areas.map((a) => (
                    <span key={a} className="text-xs bg-blue/10 text-blue px-2.5 py-1 rounded-full font-medium">
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Generated questions */}
          <div className="bg-surface border border-border rounded-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-text-pri font-semibold">
                Generated Questions ({result.questions.length})
              </h3>
            </div>
            <div className="divide-y divide-border">
              {result.questions.map((q, i) => (
                <div key={i} className="p-5">
                  <div className="flex items-start gap-3 mb-2">
                    <span className="w-7 h-7 rounded-lg bg-blue text-white text-xs font-bold flex items-center justify-center shrink-0">
                      Q{i + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-text-pri font-medium leading-relaxed">{q.question}</p>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${typeColor[q.type] ?? "bg-slate-100 text-slate-700"}`}>
                          {q.type}
                        </span>
                        <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${diffColor[q.difficulty] ?? ""}`}>
                          {q.difficulty}
                        </span>
                      </div>
                    </div>
                  </div>
                  {q.rationale && (
                    <p className="text-text-sec text-xs italic ml-10 leading-relaxed">
                      Why: {q.rationale}
                    </p>
                  )}
                  {q.follow_ups.length > 0 && (
                    <div className="ml-10 mt-2">
                      <div className="text-text-muted text-[10px] uppercase tracking-wide mb-1">Possible follow-ups</div>
                      <ul className="space-y-0.5">
                        {q.follow_ups.map((f, j) => (
                          <li key={j} className="text-text-sec text-xs">- {f}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Start practice CTA */}
          <div className="flex gap-3">
            <button
              onClick={startInterview}
              disabled={starting || !ready}
              className="flex-1 btn-gradient text-white py-3 rounded-btn font-semibold text-sm shadow-blue-glow disabled:opacity-50"
            >
              {starting ? "Starting..." : "Start Mock Interview with these Questions →"}
            </button>
            <button
              onClick={() => { setResult(null); }}
              className="px-6 text-text-sec hover:text-text-pri text-sm transition"
            >
              Generate Different Set
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
