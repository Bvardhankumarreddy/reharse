"use client";

// Spec § Screen 7: Question Bank
// "Dense but scannable. Like LeetCode meets Notion."

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { INTERVIEW_BG } from "@/types";
import type { InterviewType, Difficulty } from "@/types";
import { useApiClient } from "@/lib/hooks/useApiClient";
import type { QuestionResponse } from "@/lib/api/client";

// ── Constants ──────────────────────────────────────────────────────────────────

const COMPANY_PACKS: Array<{ name: string; logo: string; roles: string; count: string }> = [
  { name: "Google",    logo: "G",  roles: "SWE, PM, Data",       count: "Behavioral · System Design · Coding" },
  { name: "Amazon",    logo: "A",  roles: "SDE, PM, TPM",        count: "Leadership Principles · System Design" },
  { name: "Meta",      logo: "M",  roles: "SWE, PM, Design",     count: "Behavioral · Coding · System Design" },
  { name: "Microsoft", logo: "Ms", roles: "SWE, PM, PM II",      count: "Behavioral · Coding · System Design" },
  { name: "Apple",     logo: "Ap", roles: "SWE, PM, Design",     count: "Behavioral · Coding · System Design" },
  { name: "Netflix",   logo: "N",  roles: "SWE, Senior SWE",     count: "Behavioral · System Design" },
  { name: "Stripe",    logo: "St", roles: "SWE, Backend, PM",    count: "Coding · System Design · Behavioral" },
  { name: "Airbnb",    logo: "Ab", roles: "SWE, PM, DS",         count: "Behavioral · Coding · System Design" },
  { name: "Uber",      logo: "U",  roles: "SWE, Backend, PM",    count: "Coding · System Design · Behavioral" },
  { name: "LinkedIn",  logo: "Li", roles: "SWE, PM, Recruiter",  count: "Behavioral · Coding · System Design" },
  { name: "Salesforce",logo: "Sf", roles: "SWE, PM, Account Exec", count: "Behavioral · System Design" },
  { name: "Startup",   logo: "Su", roles: "Full-stack, PM",      count: "Behavioral · Coding · Case Study" },
];

const DIFF_COLOR: Record<string, string> = {
  easy:   "bg-green-50 text-[#22C55E]",
  medium: "bg-amber-50 text-[#F59E0B]",
  hard:   "bg-red-50 text-[#EF4444]",
};

const TYPE_LABEL: Record<string, string> = {
  behavioral: "Behavioral", coding: "Coding", "system-design": "System Design", hr: "HR", "case-study": "Case Study",
};

const TYPE_FILTERS: Array<{ value: InterviewType | "all"; label: string }> = [
  { value: "all",           label: "All Types" },
  { value: "behavioral",    label: "Behavioral" },
  { value: "coding",        label: "Coding" },
  { value: "system-design", label: "System Design" },
  { value: "hr",            label: "HR" },
  { value: "case-study",    label: "Case Study" },
];

const PAGE_SIZE = 25;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function QuestionBankPage() {
  const { api, ready } = useApiClient();
  const router = useRouter();

  const [view,       setView]       = useState<"questions" | "companies">("questions");
  const [search,     setSearch]     = useState("");
  const [typeFilter, setTypeFilter] = useState<InterviewType | "all">("all");
  const [diffFilter, setDiffFilter] = useState<Difficulty | "all">("all");
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [questions,  setQuestions]  = useState<QuestionResponse[]>([]);
  const [total,      setTotal]      = useState(0);
  const [offset,     setOffset]     = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);

  const fetchQuestions = useCallback((searchVal: string, type: string, diff: string, off: number) => {
    setLoading(true);
    setError(null);
    const params: Record<string, string> = { limit: String(PAGE_SIZE), offset: String(off) };
    if (searchVal) params.search = searchVal;
    if (type !== "all") params.type = type;
    if (diff !== "all") params.difficulty = diff;

    api.getQuestions(params)
      .then(({ data, total: t }) => {
        setQuestions((prev) => off === 0 ? data : [...prev, ...data]);
        setTotal(t);
        setOffset(off + data.length);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load questions"))
      .finally(() => setLoading(false));
  }, [api]);

  // Debounce search + reset on filter change — wait for Clerk to be ready
  useEffect(() => {
    if (!ready) return;
    setOffset(0);
    const id = setTimeout(() => fetchQuestions(search, typeFilter, diffFilter, 0), search ? 300 : 0);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, search, typeFilter, diffFilter]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const selectedQuestions = questions.filter((q) => selected.has(q.id));
  const hasMore = offset < total;

  return (
    <div className="flex gap-8 items-start">

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-5">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-heading-l text-text-pri">Question Bank</h2>
          <button
            disabled={selected.size === 0}
            onClick={() => {
              const firstType = selectedQuestions[0]?.type ?? "behavioral";
              const ids = [...selected].join(",");
              router.push(`/interview/setup?type=${firstType}&questionIds=${ids}`);
            }}
            className="btn-gradient text-white px-4 py-2.5 rounded-btn font-semibold text-[14px]
                       flex items-center gap-2 shadow-blue-glow self-start sm:self-auto disabled:opacity-50"
          >
            <span
              className="material-symbols-outlined text-[16px]"
              style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}
            >
              playlist_add
            </span>
            {selected.size > 0 ? `Practice ${selected.size} Selected` : "Create Practice Set"}
          </button>
        </div>

        {/* View tabs */}
        <div className="flex gap-1 p-1 bg-bg-app border border-border rounded-xl w-fit">
          {(["questions", "companies"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={clsx(
                "px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all",
                view === v ? "bg-surface shadow-sm text-text-pri" : "text-text-muted hover:text-text-sec",
              )}
            >
              {v === "questions" ? "All Questions" : "Company Packs"}
            </button>
          ))}
        </div>

        {/* Company Packs grid */}
        {view === "companies" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {COMPANY_PACKS.map((c) => (
              <button
                key={c.name}
                onClick={() => { setView("questions"); setSearch(c.name === "Startup" ? "" : c.name); setTypeFilter("all"); }}
                className="bg-surface border border-border rounded-2xl p-4 text-left hover:shadow-card hover:border-blue/30 transition-all group"
              >
                <div className="w-10 h-10 rounded-xl btn-gradient flex items-center justify-center text-white font-bold text-[13px] mb-3">
                  {c.logo}
                </div>
                <p className="text-[13px] font-bold text-text-pri group-hover:text-blue transition-colors">{c.name}</p>
                <p className="text-[11px] text-text-muted mt-0.5 truncate">{c.roles}</p>
                <p className="text-[10px] text-text-muted mt-1 line-clamp-2 leading-snug">{c.count}</p>
              </button>
            ))}
          </div>
        )}

        {/* Questions view */}
        {view === "questions" && (
          <>
            {/* Search */}
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted text-[20px]">
                search
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search questions, topics, or companies…"
                className="w-full h-11 pl-11 pr-4 bg-surface border border-border rounded-btn
                           text-body text-text-pri placeholder:text-text-muted
                           focus:outline-none focus:ring-2 focus:ring-blue/20 focus:border-blue/40 transition"
              />
            </div>

            {/* Filter chips */}
            <div className="flex flex-wrap gap-2">
              {TYPE_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setTypeFilter(f.value)}
                  className={clsx(
                    "px-3 py-1.5 rounded-chip label text-[11px] transition-all",
                    typeFilter === f.value
                      ? "bg-blue text-white shadow-blue-glow"
                      : "bg-surface border border-border text-text-sec hover:border-blue/40"
                  )}
                >
                  {f.label}
                </button>
              ))}
              <span className="w-px h-5 bg-border self-center mx-1" />
              {(["all", "easy", "medium", "hard"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDiffFilter(d)}
                  className={clsx(
                    "px-3 py-1.5 rounded-chip label text-[11px] transition-all",
                    diffFilter === d
                      ? "bg-blue text-white"
                      : "bg-surface border border-border text-text-sec hover:border-blue/40"
                  )}
                >
                  {d === "all" ? "Any Difficulty" : d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>

            {/* Count + error */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-[13px] text-red-600">{error}</div>
            )}
            {!error && (
              <p className="text-small text-text-muted">
                Showing <strong className="text-text-pri">{questions.length}</strong>
                {total > 0 && <> of {total}</>} questions
              </p>
            )}

            {/* Skeleton */}
            {loading && questions.length === 0 && (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="bg-surface border border-border rounded-xl h-16 animate-pulse" />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!loading && questions.length === 0 && !error && (
              <div className="text-center py-16 space-y-3">
                <span className="material-symbols-outlined text-[48px] text-text-muted">quiz</span>
                <p className="text-[15px] font-semibold text-text-pri">No questions found</p>
                <p className="text-text-sec text-sm">Try adjusting your filters or search term.</p>
              </div>
            )}

            {/* Question list */}
            <div className="space-y-2">
              {questions.map((q) => {
                const typeCls    = INTERVIEW_BG[q.type as keyof typeof INTERVIEW_BG] ?? "bg-gray-50 text-gray-600";
                const [bgCls]    = typeCls.split(" ");
                const isSelected = selected.has(q.id);

                return (
                  <div
                    key={q.id}
                    className={clsx(
                      "bg-surface border rounded-xl px-4 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 transition-all",
                      isSelected ? "border-blue/50 bg-blue-50/30" : "border-border hover:shadow-card"
                    )}
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(q.id)}
                        className="mt-1 w-4 h-4 accent-blue flex-shrink-0 cursor-pointer"
                      />
                      <div className={clsx("w-1 self-stretch rounded-full flex-shrink-0", bgCls)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] sm:text-[15px] font-semibold text-text-pri leading-snug line-clamp-2">
                          {q.question}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-2 items-center">
                          {q.tags?.map((tag) => (
                            <span key={tag} className="px-2 py-0.5 bg-bg-app text-text-sec rounded-chip label" style={{ fontSize: 10 }}>
                              {tag}
                            </span>
                          ))}
                          <span className={clsx("px-2 py-0.5 rounded-chip label", typeCls)} style={{ fontSize: 10 }}>
                            {TYPE_LABEL[q.type] ?? q.type}
                          </span>
                          <span
                            className={clsx("px-2 py-0.5 rounded-chip label sm:hidden", DIFF_COLOR[q.difficulty] ?? "bg-gray-50 text-gray-500")}
                            style={{ fontSize: 10 }}
                          >
                            {q.difficulty.charAt(0).toUpperCase() + q.difficulty.slice(1)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0 pl-8 sm:pl-0">
                      <span
                        className={clsx("px-2 py-0.5 rounded-chip label hidden sm:inline", DIFF_COLOR[q.difficulty] ?? "bg-gray-50 text-gray-500")}
                        style={{ fontSize: 10 }}
                      >
                        {q.difficulty.charAt(0).toUpperCase() + q.difficulty.slice(1)}
                      </span>
                      {q.avgScore > 0 && (
                        <span className="font-mono text-[12px] text-text-muted hidden sm:inline">{Math.round(q.avgScore)} avg</span>
                      )}
                      <button
                        onClick={() => router.push(`/interview/setup?type=${q.type}&questionIds=${q.id}`)}
                        className="px-3 py-1.5 border border-border rounded-btn text-[12px] font-semibold text-text-sec hover:border-blue/40 hover:text-blue transition-colors"
                      >
                        Practice
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Load more */}
            {hasMore && !loading && (
              <div className="text-center py-4">
                <button
                  onClick={() => fetchQuestions(search, typeFilter, diffFilter, offset)}
                  className="text-blue font-semibold text-small hover:underline"
                >
                  Load {Math.min(PAGE_SIZE, total - offset)} more
                </button>
              </div>
            )}
            {loading && questions.length > 0 && (
              <p className="text-small text-text-muted text-center py-4">Loading…</p>
            )}
          </>
        )}
      </div>

      {/* Practice Set sidebar */}
      {selected.size > 0 && (
        <aside className="hidden lg:flex flex-col w-[280px] flex-shrink-0 bg-surface border border-border rounded-2xl p-5 space-y-4 sticky top-24">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-bold text-text-pri">Selected ({selected.size})</h3>
            <button onClick={() => setSelected(new Set())} className="text-small text-text-muted hover:text-red transition-colors">
              Clear
            </button>
          </div>
          <div className="space-y-2">
            {selectedQuestions.map((q) => (
              <p key={q.id} className="text-small text-text-sec line-clamp-1">{q.question}</p>
            ))}
          </div>
          <button
            onClick={() => {
              const firstType = selectedQuestions[0]?.type ?? "behavioral";
              const ids = [...selected].join(",");
              router.push(`/interview/setup?type=${firstType}&questionIds=${ids}`);
            }}
            className="w-full btn-gradient text-white py-3 rounded-btn font-bold text-[14px] shadow-blue-glow"
          >
            Start Practice Session
          </button>
        </aside>
      )}
    </div>
  );
}
