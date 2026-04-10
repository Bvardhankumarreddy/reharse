"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { useApiClient } from "@/lib/hooks/useApiClient";

const STEPS = [
  {
    key:         "situation" as const,
    label:       "Situation",
    abbr:        "S",
    color:       "bg-violet-500",
    lightColor:  "bg-violet-50 border-violet-200",
    textColor:   "text-violet-700",
    placeholder: "Describe the context and background. When did this happen? What was your role? What was the challenge or opportunity?",
    hint:        "Be specific — set the scene clearly so the interviewer understands the stakes.",
  },
  {
    key:         "task" as const,
    label:       "Task",
    abbr:        "T",
    color:       "bg-blue-500",
    lightColor:  "bg-blue-50 border-blue-200",
    textColor:   "text-blue-700",
    placeholder: "What was your specific responsibility? What were you asked to do or what goal did you set for yourself?",
    hint:        "Make clear it was YOUR task — distinguish from team goals.",
  },
  {
    key:         "action" as const,
    label:       "Action",
    abbr:        "A",
    color:       "bg-amber-500",
    lightColor:  "bg-amber-50 border-amber-200",
    textColor:   "text-amber-700",
    placeholder: "What steps did YOU personally take? Describe your decision-making process and the actions you chose.",
    hint:        "Use 'I' not 'we' — focus on your individual contribution.",
  },
  {
    key:         "result" as const,
    label:       "Result",
    abbr:        "R",
    color:       "bg-green-500",
    lightColor:  "bg-green-50 border-green-200",
    textColor:   "text-green-700",
    placeholder: "What was the outcome? Quantify where possible — numbers, percentages, time saved, revenue impact, etc.",
    hint:        "Always include at least one metric if you can — 'reduced load time by 40%' beats 'made it faster'.",
  },
];

type StarKey = typeof STEPS[number]["key"];
type StarData = Record<StarKey, string>;

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex gap-2 mb-6">
      {STEPS.map((s, i) => (
        <div key={s.key} className="flex-1 flex flex-col items-center gap-1">
          <div className={clsx(
            "w-full h-1.5 rounded-full transition-all",
            i <= step ? s.color : "bg-border",
          )} />
          <span className={clsx("text-[10px] font-bold uppercase tracking-wide", i <= step ? s.textColor : "text-text-muted")}>
            {s.abbr}
          </span>
        </div>
      ))}
    </div>
  );
}

function PreviewPanel({ data }: { data: StarData }) {
  const parts = STEPS.map((s) => ({ label: s.label, text: data[s.key].trim() })).filter((p) => p.text);
  if (!parts.length) return null;
  return (
    <div className="bg-surface border border-border rounded-2xl p-5 space-y-3">
      <h3 className="text-[13px] font-bold text-text-pri">Answer Preview</h3>
      {parts.map(({ label, text }) => (
        <div key={label}>
          <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted mb-0.5">{label}</p>
          <p className="text-[13px] text-text-sec leading-relaxed">{text}</p>
        </div>
      ))}
    </div>
  );
}

export default function StarBuilderPage() {
  const { api } = useApiClient();
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<StarData>({ situation: "", task: "", action: "", result: "" });
  const [aiFeedback, setAiFeedback]   = useState<string | null>(null);
  const [loadingAI,  setLoadingAI]    = useState(false);
  const [aiError,    setAiError]      = useState<string | null>(null);
  const [copied,     setCopied]       = useState(false);

  const step = STEPS[currentStep];
  const isLast = currentStep === STEPS.length - 1;
  const allFilled = STEPS.every((s) => data[s.key].trim().length > 0);

  function update(val: string) {
    setData((prev) => ({ ...prev, [step.key]: val }));
  }

  function next() {
    if (currentStep < STEPS.length - 1) setCurrentStep((c) => c + 1);
  }
  function back() {
    if (currentStep > 0) setCurrentStep((c) => c - 1);
  }

  async function getAIFeedback() {
    if (!allFilled) return;
    setLoadingAI(true);
    setAiFeedback(null);
    setAiError(null);
    const answer = STEPS.map((s) => `${s.label}: ${data[s.key]}`).join("\n\n");
    try {
      const res = await api.coachMessage([
        {
          role:    "user",
          content: `Please review this STAR-format behavioral interview answer and give specific, actionable feedback. Rate the strength of each component (S/T/A/R) and suggest improvements.\n\n${answer}`,
        },
      ]);
      setAiFeedback(res.reply);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "AI feedback failed");
    } finally {
      setLoadingAI(false);
    }
  }

  function copyAnswer() {
    const text = STEPS.map((s) => `${s.label.toUpperCase()}:\n${data[s.key]}`).join("\n\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-heading-l text-text-pri">STAR Answer Builder</h2>
        <p className="text-body text-text-sec mt-1">
          Structure any behavioral answer with the STAR framework — then get AI feedback.
        </p>
      </div>

      {/* Question picker hint */}
      <div className="bg-blue/5 border border-blue/20 rounded-xl px-4 py-3 text-[13px] text-text-sec">
        <span className="font-semibold text-blue">Tip:</span> Pick a behavioral question from the{" "}
        <a href="/question-bank" className="text-blue underline underline-offset-2">Question Bank</a>{" "}
        first, then build your answer here.
      </div>

      {/* Step builder */}
      <div className="bg-surface border border-border rounded-2xl p-5 space-y-4">
        <ProgressBar step={currentStep} />

        <div className={clsx("border rounded-xl p-4", step.lightColor)}>
          <div className="flex items-center gap-2 mb-3">
            <div className={clsx("w-7 h-7 rounded-lg flex items-center justify-center text-white text-[13px] font-bold flex-shrink-0", step.color)}>
              {step.abbr}
            </div>
            <div>
              <p className={clsx("text-[14px] font-bold", step.textColor)}>{step.label}</p>
              <p className="text-[11px] text-text-muted">{step.hint}</p>
            </div>
          </div>
          <textarea
            value={data[step.key]}
            onChange={(e) => update(e.target.value)}
            placeholder={step.placeholder}
            rows={5}
            className="w-full px-3 py-2.5 bg-white border border-white/60 rounded-lg text-[14px] text-text-pri
                       placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue/20 transition resize-none"
          />
        </div>

        {/* Step nav */}
        <div className="flex items-center justify-between">
          <button
            onClick={back}
            disabled={currentStep === 0}
            className="px-4 py-2 border border-border rounded-btn text-[13px] font-semibold text-text-sec
                       hover:border-blue/40 transition disabled:opacity-40"
          >
            Back
          </button>
          <span className="text-[12px] text-text-muted">{currentStep + 1} / {STEPS.length}</span>
          {isLast ? (
            <button
              onClick={getAIFeedback}
              disabled={!allFilled || loadingAI}
              className="btn-gradient text-white px-5 py-2 rounded-btn font-semibold text-[13px]
                         flex items-center gap-2 shadow-blue-glow disabled:opacity-50"
            >
              {loadingAI ? (
                <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Getting feedback…</>
              ) : (
                <><span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>auto_awesome</span>Get AI Feedback</>
              )}
            </button>
          ) : (
            <button
              onClick={next}
              className="btn-gradient text-white px-5 py-2 rounded-btn font-semibold text-[13px]
                         flex items-center gap-2 shadow-blue-glow"
            >
              Next <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </button>
          )}
        </div>
      </div>

      {/* Jump to step pills */}
      <div className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            onClick={() => setCurrentStep(i)}
            className={clsx(
              "px-3 py-1 rounded-full text-[11px] font-semibold transition-all border",
              i === currentStep
                ? `${s.color} text-white border-transparent`
                : data[s.key].trim()
                  ? "bg-green-50 border-green-300 text-green-700"
                  : "bg-surface border-border text-text-muted hover:border-blue/40",
            )}
          >
            {s.abbr} — {s.label}
          </button>
        ))}
      </div>

      {/* Preview */}
      <PreviewPanel data={data} />

      {/* Copy answer */}
      {allFilled && (
        <button
          onClick={copyAnswer}
          className="flex items-center gap-2 px-4 py-2.5 border border-border rounded-btn text-[13px] font-semibold
                     text-text-sec hover:border-blue/40 hover:text-blue transition-all"
        >
          <span className="material-symbols-outlined text-[16px]">{copied ? "check" : "content_copy"}</span>
          {copied ? "Copied!" : "Copy Full Answer"}
        </button>
      )}

      {/* AI Feedback */}
      {aiError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-[13px] text-red-600">{aiError}</div>
      )}
      {aiFeedback && (
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-2">
          <h3 className="text-[14px] font-bold text-text-pri flex items-center gap-2">
            <span className="material-symbols-outlined text-blue text-[18px]" style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>auto_awesome</span>
            AI Feedback
          </h3>
          <p className="text-[13px] text-text-sec leading-relaxed whitespace-pre-wrap">{aiFeedback}</p>
        </div>
      )}
    </div>
  );
}
