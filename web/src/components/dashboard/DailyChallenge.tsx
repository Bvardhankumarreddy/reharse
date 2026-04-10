"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { useApiClient } from "@/lib/hooks/useApiClient";
import type { QuestionResponse } from "@/lib/api/client";
import { INTERVIEW_BG } from "@/types";

const TYPE_LABEL: Record<string, string> = {
  behavioral: "Behavioral", coding: "Coding", "system-design": "System Design", hr: "HR", "case-study": "Case Study",
};

const DIFF_COLOR: Record<string, string> = {
  easy: "text-green-600 bg-green-50", medium: "text-amber-600 bg-amber-50", hard: "text-red-600 bg-red-50",
};

function todayIndex(len: number): number {
  // Deterministic pick: days-since-epoch mod total questions
  const day = Math.floor(Date.now() / 86_400_000);
  return day % len;
}

export default function DailyChallenge() {
  const { api, ready } = useApiClient();
  const [question,  setQuestion]  = useState<QuestionResponse | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [dateLabel, setDateLabel] = useState<string | null>(null);

  useEffect(() => {
    setDateLabel(new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  }, []);

  useEffect(() => {
    if (!ready) return;
    // Fetch a page of questions and pick today's
    api.getQuestions({ limit: "100" })
      .then(({ data }) => {
        if (data.length > 0) setQuestion(data[todayIndex(data.length)]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [api, ready]);

  if (loading) {
    return <div className="bg-surface border border-border rounded-2xl h-24 animate-pulse" />;
  }
  if (!question) return null;

  const typeCls = INTERVIEW_BG[question.type as keyof typeof INTERVIEW_BG] ?? "bg-gray-50 text-gray-600";

  return (
    <div className="bg-surface border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="material-symbols-outlined text-[18px] text-amber-500"
            style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}
          >
            local_fire_department
          </span>
          <h3 className="text-[13px] font-bold text-text-pri">Daily Challenge</h3>
        </div>
        {dateLabel && <span className="text-[11px] text-text-muted">{dateLabel}</span>}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className={clsx("px-2 py-0.5 rounded-full text-[10px] font-semibold", typeCls)}>
          {TYPE_LABEL[question.type] ?? question.type}
        </span>
        <span className={clsx("px-2 py-0.5 rounded-full text-[10px] font-semibold", DIFF_COLOR[question.difficulty] ?? "text-gray-600 bg-gray-50")}>
          {question.difficulty.charAt(0).toUpperCase() + question.difficulty.slice(1)}
        </span>
      </div>

      <p className="text-[14px] font-semibold text-text-pri leading-snug mb-4 line-clamp-3">
        {question.question}
      </p>

      <Link
        href={`/interview/setup?type=${question.type}`}
        className="inline-flex items-center gap-1.5 btn-gradient text-white px-4 py-2 rounded-btn
                   font-semibold text-[12px] shadow-blue-glow hover:-translate-y-0.5 transition-all"
      >
        <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>
          play_arrow
        </span>
        Practice Now
      </Link>
    </div>
  );
}
