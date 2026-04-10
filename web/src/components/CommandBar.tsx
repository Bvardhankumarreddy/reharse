"use client";

// Spec § Screen 8: AI Command Bar (⌘K)
// "Full overlay, dark backdrop. Centered card 680px. Violet ring on input."

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { clsx } from "clsx";
import { INTERVIEW_BG } from "@/types";
import { useApiClient } from "@/lib/hooks/useApiClient";
import type { SessionResponse } from "@/lib/api/client";

const QUICK_ACTIONS = [
  { label: "Behavioral Interview",  icon: "forum",               href: "/interview/setup?type=behavioral", color: "bg-violet-100 text-[#7C3AED]" },
  { label: "Coding Session",        icon: "code",                href: "/interview/setup?type=coding",     color: "bg-teal-100 text-[#0EA5E9]" },
  { label: "JD Match",              icon: "document_scanner",    href: "/tools/jd-match",                  color: "bg-blue/10 text-blue" },
  { label: "STAR Builder",          icon: "format_list_bulleted", href: "/tools/star-builder",             color: "bg-bg-app text-text-sec border border-border" },
  { label: "Question Bank",         icon: "database",            href: "/question-bank",                   color: "bg-bg-app text-text-sec border border-border" },
  { label: "My Progress",           icon: "leaderboard",         href: "/progress",                        color: "bg-bg-app text-text-sec border border-border" },
] as const;

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CommandBar({ open, onClose }: Props) {
  const { api, ready }    = useApiClient();
  const [query,   setQuery]   = useState("");
  const [aiText,  setAiText]  = useState("");
  const [loading, setLoading] = useState(false);
  const [recentSessions, setRecentSessions] = useState<SessionResponse[]>([]);
  const inputRef  = useRef<HTMLInputElement>(null);
  const router    = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load recent completed sessions on open
  useEffect(() => {
    if (open && ready) {
      api.getSessions()
        .then((sessions) => {
          const completed = sessions
            .filter((s) => s.status === "completed")
            .sort((a, b) => new Date(b.completedAt ?? b.updatedAt).getTime() - new Date(a.completedAt ?? a.updatedAt).getTime())
            .slice(0, 4);
          setRecentSessions(completed);
        })
        .catch(() => {/* non-critical */});
    }
  }, [open, ready, api]);

  // Auto-focus on open
  useEffect(() => {
    if (open) { setTimeout(() => inputRef.current?.focus(), 50); }
    else       { setQuery(""); setAiText(""); }
  }, [open]);

  // Debounced AI answer from query
  useEffect(() => {
    if (query.length < 5) { setAiText(""); return; }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!ready) return;
      setLoading(true);
      try {
        const res = await api.coachMessage([{ role: "user", content: query }]);
        setAiText(res.reply);
      } catch {
        setAiText("");
      } finally {
        setLoading(false);
      }
    }, 600);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  function navigate(href: string) {
    router.push(href);
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4"
          style={{ background: "rgba(13,15,20,0.6)", backdropFilter: "blur(4px)" }}
          onClick={onClose}
        >
          <motion.div
            key="card"
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{    opacity: 0, scale: 0.97, y: -8  }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="w-full max-w-[680px] bg-surface rounded-[20px] shadow-float overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Input row ── */}
            <div className="flex items-center gap-3 px-5 h-14 border-b border-border">
              <span
                className="material-symbols-outlined text-[#7C3AED] text-[22px] flex-shrink-0"
                style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}
              >
                {loading ? "hourglass_top" : "auto_awesome"}
              </span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search questions, start interview, or ask anything..."
                className="flex-1 text-[16px] text-text-pri placeholder:text-text-muted bg-transparent
                           outline-none ring-0 border-0"
                style={{ caretColor: "#7C3AED" }}
              />
              <kbd className="px-2 py-0.5 bg-bg-app border border-border rounded text-[11px] font-mono text-text-muted flex-shrink-0">
                esc
              </kbd>
            </div>

            {/* ── Body ── */}
            <div className="max-h-[460px] overflow-y-auto">

              {/* AI answer (when typing) */}
              {(aiText || (loading && query.length >= 5)) && (
                <div className="mx-4 mt-4 p-4 bg-violet-50 border border-violet-100 rounded-xl flex items-start gap-3">
                  <span
                    className="material-symbols-outlined text-[#7C3AED] text-[18px] flex-shrink-0 mt-0.5"
                    style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}
                  >
                    auto_awesome
                  </span>
                  <p className="text-small text-text-pri leading-relaxed">
                    {loading && !aiText
                      ? <span className="text-text-muted">Thinking…</span>
                      : <><span className="font-semibold text-[#7C3AED]">AI Answer: </span>{aiText}</>
                    }
                  </p>
                </div>
              )}

              {/* Empty state: Quick actions + recent sessions */}
              {!query && (
                <>
                  <div className="px-4 pt-4 pb-2">
                    <div className="flex flex-wrap gap-2">
                      {QUICK_ACTIONS.map((a) => (
                        <button
                          key={a.label}
                          onClick={() => navigate(a.href)}
                          className={clsx(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all hover:-translate-y-0.5",
                            a.color
                          )}
                        >
                          <span className="material-symbols-outlined text-[14px]">{a.icon}</span>
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {recentSessions.length > 0 && (
                    <div className="px-4 pb-4 pt-2">
                      <p className="label text-text-muted mb-2" style={{ fontSize: 10 }}>Recently Practiced</p>
                      <div className="space-y-0.5">
                        {recentSessions.map((s) => {
                          const type = s.interviewType as keyof typeof INTERVIEW_BG;
                          const [bgCls, textCls] = (INTERVIEW_BG[type] ?? "bg-gray-50 text-gray-600").split(" ");
                          const label = s.interviewType === "system-design" ? "System Design"
                            : s.interviewType.charAt(0).toUpperCase() + s.interviewType.slice(1);
                          const roleLabel = s.targetRole ?? "Interview";
                          return (
                            <button
                              key={s.id}
                              onClick={() => navigate(`/sessions/${s.id}`)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-bg-app transition-colors text-left group"
                            >
                              <div className={clsx("w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0", bgCls)}>
                                <span className={clsx("material-symbols-outlined text-[14px]", textCls)}>quiz</span>
                              </div>
                              <span className="flex-1 text-small text-text-pri truncate">{roleLabel}</span>
                              <span className={clsx("px-2 py-0.5 rounded-full label flex-shrink-0", bgCls, textCls)} style={{ fontSize: 9 }}>
                                {label}
                              </span>
                              <span className="text-[11px] text-blue font-semibold opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                View results
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Prompt when typing but no AI answer yet */}
              {query && !aiText && !loading && (
                <div className="px-4 py-4">
                  <p className="text-small text-text-muted text-center py-4">
                    Keep typing for an AI coaching response…
                  </p>
                </div>
              )}

              {query && aiText && (
                <div className="px-4 py-3 border-t border-border">
                  <button
                    onClick={() => navigate("/sessions")}
                    className="w-full text-center text-small text-blue font-semibold hover:underline"
                  >
                    Open full AI Coach →
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
