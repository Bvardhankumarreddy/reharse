"use client";

// Spec § Screen 2: Interview Setup
// "Multi-step wizard. Feels like Calendly, not configuring a database."

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import type { InterviewType } from "@/types";
import { useApiClient } from "@/lib/hooks/useApiClient";

const STEPS = ["Interview Type", "Configure Role", "Mode & Duration", "Resume"] as const;

const INTERVIEW_TYPES: Array<{
  type: InterviewType;
  label: string;
  description: string;
  color: string;
  bgColor: string;
  icon: string;
}> = [
  { type: "behavioral",    label: "Behavioral",    description: "STAR-format, leadership, conflict, motivation",       color: "text-[#7C3AED]", bgColor: "bg-violet-50",  icon: "forum"       },
  { type: "coding",        label: "Coding",        description: "DSA, algorithms, problem-solving, live code",         color: "text-[#0EA5E9]", bgColor: "bg-teal-50",   icon: "code"        },
  { type: "system-design", label: "System Design", description: "Architecture, scalability, tradeoffs, design",        color: "text-[#F59E0B]", bgColor: "bg-amber-50",  icon: "architecture"},
  { type: "hr",            label: "HR / Culture",  description: "Values, career goals, culture alignment",             color: "text-[#22C55E]", bgColor: "bg-green-50",  icon: "handshake"   },
  { type: "case-study",    label: "Case Study",    description: "Business problems, estimation, product thinking",     color: "text-[#EC4899]", bgColor: "bg-pink-50",   icon: "lightbulb"   },
];

export default function InterviewSetupPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { api, ready } = useApiClient();

  // ── Derive initial state from query params ──────────────────────────────────
  const typeParam    = searchParams.get("type") as InterviewType | null;
  const modeParam    = searchParams.get("mode");
  const isFullLoop   = modeParam === "full-loop";
  const validTypes   = INTERVIEW_TYPES.map((t) => t.type);
  const initialType  = typeParam && validTypes.includes(typeParam) ? typeParam : "behavioral";
  const questionIds  = searchParams.get("questionIds")?.split(",").filter(Boolean) ?? [];

  // Full-loop: start at step 1 (role config) with 60 min pre-selected
  const [step, setStep]             = useState(isFullLoop ? 1 : 0);
  const [selectedType, setType]     = useState<InterviewType>(initialType);
  const [role,         setRole]         = useState("Software Engineer");
  const [customRole,   setCustomRole]   = useState("");
  const [level,        setLevel]        = useState("Mid-level (3–5 years)");
  const [company,      setCompany]      = useState("");
  const [customCompany, setCustomCompany] = useState("");
  const [duration, setDuration]     = useState(isFullLoop ? "60" : "45");
  const [mode, setMode]             = useState<"text" | "voice" | "mixed">("text");
  const [isPro,      setIsPro]      = useState(false);
  const [loading, setLoading]       = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [proNudge,   setProNudge]   = useState(false);

  // Recent sessions for quick-restart
  const [recentSessions, setRecentSessions] = useState<Array<{
    id: string; interviewType: string; targetRole: string | null;
    experienceLevel: string | null; durationMinutes: number;
  }>>([]);

  // Resume step state
  const fileInputRef                  = useRef<HTMLInputElement>(null);
  const [hasResume,    setHasResume]  = useState(false);
  const [uploading,    setUploading]  = useState(false);
  const [uploadDone,   setUploadDone] = useState(false);
  const [uploadError,  setUploadErr]  = useState<string | null>(null);

  // ── Warm up AI engine as soon as setup page loads ───────────────────────────
  useEffect(() => {
    if (!ready) return;
    api.warmup().catch(() => {}); // best-effort — reduces first-question latency
  }, [api, ready]);

  // ── Prefill from user profile + load recent sessions ────────────────────────
  useEffect(() => {
    if (!ready) return;
    api.getMe()
      .then((u) => {
        if (u.targetRole) {
          const knownRoles = ["Software Engineer","Senior Software Engineer","Staff Engineer","Product Manager","Senior Product Manager","Data Scientist","Data Analyst","ML Engineer","Engineering Manager","Director of Engineering","Designer / UX","DevOps / SRE","QA Engineer","Business Analyst","Consultant"];
          if (knownRoles.includes(u.targetRole)) { setRole(u.targetRole); }
          else { setRole("__other__"); setCustomRole(u.targetRole); }
        }
        if (u.experienceLevel) setLevel(u.experienceLevel);
        if (u.targetCompany) {
          const knownCompanies = ["Google","Amazon","Meta","Apple","Microsoft","Stripe","Airbnb","Netflix","Uber","LinkedIn","Twitter/X","Salesforce","Adobe","Atlassian","Shopify"];
          if (knownCompanies.includes(u.targetCompany)) { setCompany(u.targetCompany); }
          else { setCompany("__other__"); setCustomCompany(u.targetCompany); }
        }
        if (u.resumeText)      setHasResume(true);
        setIsPro(u.subscriptionTier === "pro" &&
          (u.subscriptionStatus === "active" ||
            (u.subscriptionStatus === "day_pass" &&
              (!u.subscriptionEndsAt || new Date(u.subscriptionEndsAt) > new Date()))));
      })
      .catch(() => {});
    api.getSessions()
      .then((sessions) => {
        const recent = sessions
          .filter((s) => s.status === "completed")
          .slice(0, 3)
          .map((s) => ({
            id:              s.id,
            interviewType:   s.interviewType,
            targetRole:      s.targetRole,
            experienceLevel: s.experienceLevel,
            durationMinutes: s.durationMinutes,
          }));
        setRecentSessions(recent);
      })
      .catch(() => {});
  }, [api, ready]);

  function next() { setStep((s) => Math.min(s + 1, STEPS.length - 1)); }
  function back() { setStep((s) => Math.max(s - 1, 0)); }

  async function handleResumeFile(file: File) {
    if (file.size > 5 * 1024 * 1024) { setUploadErr("File too large (max 5 MB)"); return; }
    setUploading(true);
    setUploadErr(null);
    try {
      const updated = await api.uploadResume(file);
      if (updated.targetRole)      setRole(updated.targetRole);
      if (updated.experienceLevel) setLevel(updated.experienceLevel);
      setHasResume(true);
      setUploadDone(true);
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const effectiveRole    = role    === "__other__" ? customRole.trim()    || "Software Engineer" : role;
  const effectiveCompany = company === "__other__" ? customCompany.trim() || undefined           : company || undefined;

  async function startInterview() {
    setLoading(true);
    setStartError(null);
    try {
      const session = await api.createSession({
        interviewType:   selectedType,
        targetRole:      effectiveRole,
        experienceLevel: level,
        targetCompany:   effectiveCompany,
        mode,
        durationMinutes: parseInt(duration, 10),
        ...(questionIds.length > 0 && { questionIds }),
      });
      const dest = selectedType === "coding" ? "/interview/coding" : "/interview/session";
      router.push(
        `${dest}?sessionId=${session.id}&type=${selectedType}&role=${encodeURIComponent(effectiveRole)}&mode=${mode}`
      );
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Failed to create session");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg-app flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[640px]">

        {/* Recent sessions quick-restart */}
        {recentSessions.length > 0 && (
          <div className="mb-6">
            <p className="text-[12px] font-semibold text-text-muted uppercase tracking-wide mb-2">
              Jump back in
            </p>
            <div className="flex flex-wrap gap-2">
              {recentSessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setType(s.interviewType as InterviewType);
                    if (s.targetRole)      setRole(s.targetRole);
                    if (s.experienceLevel) setLevel(s.experienceLevel);
                    setDuration(String(s.durationMinutes));
                    setStep(2); // skip to Mode & Duration
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border
                             rounded-full text-[12px] font-medium text-text-sec hover:border-blue/40
                             hover:text-text-pri transition-all"
                >
                  <span className="material-symbols-outlined text-[14px] text-blue"
                    style={{ fontVariationSettings: "'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24" }}>
                    replay
                  </span>
                  {s.interviewType.replace("-", " ")} · {s.targetRole ?? "General"} · {s.durationMinutes} min
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Practice Set banner */}
        {questionIds.length > 0 && (
          <div className="mb-6 flex items-start gap-3 bg-violet-50 border border-violet-200 rounded-2xl px-4 py-3">
            <span className="material-symbols-outlined text-[#7C3AED] text-[20px] flex-shrink-0 mt-0.5"
              style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>
              playlist_add_check
            </span>
            <div>
              <p className="text-[13px] font-bold text-text-pri">Practice Set — {questionIds.length} question{questionIds.length !== 1 ? "s" : ""}</p>
              <p className="text-[12px] text-text-sec mt-0.5">
                Your selected question bank questions will be used in this session instead of AI-generated ones.
              </p>
            </div>
          </div>
        )}

        {/* Full Loop banner */}
        {isFullLoop && (
          <div className="mb-6 flex items-start gap-3 bg-blue/5 border border-blue/20 rounded-2xl px-4 py-3">
            <span className="material-symbols-outlined text-blue text-[20px] flex-shrink-0 mt-0.5"
              style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>
              all_inclusive
            </span>
            <div>
              <p className="text-[13px] font-bold text-text-pri">Full Loop — 60 min session</p>
              <p className="text-[12px] text-text-sec mt-0.5">
                Configure your role and the AI will cover Behavioral, Coding, and System Design questions across the full session.
              </p>
            </div>
          </div>
        )}

        {/* Stepper */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div className={clsx(
                "w-7 h-7 rounded-full flex items-center justify-center label text-[11px] flex-shrink-0",
                i <= step ? "bg-blue text-white" : "bg-border text-text-muted"
              )}>
                {i < step ? (
                  <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>check</span>
                ) : i + 1}
              </div>
              <span className={clsx("text-[12px] font-medium hidden sm:block", i === step ? "text-text-pri" : "text-text-muted")}>
                {label}
              </span>
              {i < STEPS.length - 1 && <div className="flex-1 h-px bg-border ml-2" />}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-surface border border-border rounded-card p-6 lg:p-8 shadow-card">

          {/* ── Step 0: Interview Type ── */}
          {step === 0 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-[24px] font-bold text-text-pri">What kind of interview?</h2>
                <p className="text-body text-text-sec mt-1">
                  AI will adapt questions to match the real interview format for your role.
                </p>
              </div>
              <div className="space-y-2">
                {INTERVIEW_TYPES.map((t) => (
                  <button
                    key={t.type}
                    onClick={() => setType(t.type)}
                    className={clsx(
                      "w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all overflow-hidden",
                      selectedType === t.type ? "border-blue bg-blue-50/40" : "border-border hover:border-blue/30"
                    )}
                  >
                    <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", t.bgColor)}>
                      <span className={clsx("material-symbols-outlined text-[20px]", t.color)}
                        style={{ fontVariationSettings: "'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24" }}>
                        {t.icon}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-text-pri">{t.label}</p>
                      <p className="text-small text-text-sec">{t.description}</p>
                    </div>
                    <div className={clsx(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                      selectedType === t.type ? "border-blue bg-blue" : "border-border"
                    )}>
                      {selectedType === t.type && (
                        <span className="material-symbols-outlined text-white text-[13px]"
                          style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>check</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 1: Configure Role ── */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-[24px] font-bold text-text-pri">Configure your interview</h2>
                <p className="text-body text-text-sec mt-1">Pre-filled from your profile — change anything.</p>
              </div>

              {/* Target Role */}
              <div className="space-y-1.5">
                <label className="label text-text-sec">Target Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full h-11 px-4 bg-bg-app border border-border rounded-btn text-body text-text-pri focus:outline-none focus:ring-2 focus:ring-blue/20 focus:border-blue/40 transition"
                >
                  {["Software Engineer","Senior Software Engineer","Staff Engineer","Product Manager","Senior Product Manager","Data Scientist","Data Analyst","ML Engineer","Engineering Manager","Director of Engineering","Designer / UX","DevOps / SRE","QA Engineer","Business Analyst","Consultant"].map((r) => <option key={r}>{r}</option>)}
                  <option value="__other__">Other (type below)</option>
                </select>
                {role === "__other__" && (
                  <input value={customRole} onChange={(e) => setCustomRole(e.target.value)}
                    placeholder="e.g. Blockchain Developer"
                    className="w-full h-10 px-3 bg-bg-app border border-border rounded-btn text-[13px] text-text-pri placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue/20 transition" />
                )}
              </div>

              {/* Experience Level */}
              <div className="space-y-1.5">
                <label className="label text-text-sec">Experience Level</label>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  className="w-full h-11 px-4 bg-bg-app border border-border rounded-btn text-body text-text-pri focus:outline-none focus:ring-2 focus:ring-blue/20 focus:border-blue/40 transition"
                >
                  {["Entry-level (0–1 years)","Entry-level (0–2 years)","Mid-level (3–5 years)","Senior (5–8 years)","Staff/Principal (8+ years)"].map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>

              {/* Target Company */}
              <div className="space-y-1.5">
                <label className="label text-text-sec">Target Company (optional)</label>
                <select
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full h-11 px-4 bg-bg-app border border-border rounded-btn text-body text-text-pri focus:outline-none focus:ring-2 focus:ring-blue/20 focus:border-blue/40 transition"
                >
                  <option value="">Any company</option>
                  {["Google","Amazon","Meta","Apple","Microsoft","Stripe","Airbnb","Netflix","Uber","LinkedIn","Twitter/X","Salesforce","Adobe","Atlassian","Shopify"].map((c) => <option key={c}>{c}</option>)}
                  <option value="__other__">Other (type below)</option>
                </select>
                {company === "__other__" && (
                  <input value={customCompany} onChange={(e) => setCustomCompany(e.target.value)}
                    placeholder="e.g. Flipkart, Zepto…"
                    className="w-full h-10 px-3 bg-bg-app border border-border rounded-btn text-[13px] text-text-pri placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue/20 transition" />
                )}
              </div>

              {company === "Google" && (
                <div className="p-4 bg-blue-50 border border-blue/20 rounded-xl flex gap-3">
                  <span className="material-symbols-outlined text-blue text-[18px] flex-shrink-0 mt-0.5">info</span>
                  <p className="text-small text-text-pri leading-relaxed">
                    <strong>Google Behavioral</strong> focuses on Leadership Principles and Googleyness. AI will weight questions accordingly.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Mode & Duration ── */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-[24px] font-bold text-text-pri">Mode & Duration</h2>
                <p className="text-body text-text-sec mt-1">How do you want to practice?</p>
              </div>

              <div className="space-y-1.5">
                <label className="label text-text-sec">Interview Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["text", "voice", "mixed"] as const).map((m) => {
                    const locked = m !== "text" && !isPro;
                    return (
                      <button
                        key={m}
                        onClick={() => {
                          if (locked) { setProNudge(true); setTimeout(() => setProNudge(false), 3500); return; }
                          setMode(m);
                        }}
                        className={clsx(
                          "py-3 rounded-xl border-2 text-[13px] font-semibold transition-all relative",
                          mode === m && !locked ? "border-blue bg-blue-50/50 text-blue" : "border-border text-text-sec hover:border-blue/30",
                          locked && "opacity-60"
                        )}
                      >
                        {m.charAt(0).toUpperCase() + m.slice(1)}
                        {locked && (
                          <span className="absolute -top-2 -right-2 inline-flex items-center px-1 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[9px] font-bold">
                            PRO
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {proNudge && (
                  <p className="text-[12px] text-amber-600 font-medium">
                    Voice &amp; Mixed modes are available on the Pro plan.{" "}
                    <a href="/settings?tab=billing" className="underline">Upgrade →</a>
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="label text-text-sec">Duration</label>
                <div className="grid grid-cols-4 gap-2">
                  {["15", "30", "45", "60"].map((d) => (
                    <button key={d} onClick={() => setDuration(d)}
                      className={clsx(
                        "py-3 rounded-xl border-2 text-[13px] font-semibold transition-all",
                        duration === d ? "border-blue bg-blue-50/50 text-blue" : "border-border text-text-sec hover:border-blue/30"
                      )}
                    >
                      {d} min
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Resume ── */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-[24px] font-bold text-text-pri">Resume</h2>
                <p className="text-body text-text-sec mt-1">
                  AI generates questions based on your specific experience.
                </p>
              </div>

              {/* Existing resume banner */}
              {hasResume && !uploadDone && (
                <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                  <span className="material-symbols-outlined text-green-600 text-[20px]">check_circle</span>
                  <div>
                    <p className="text-[13px] font-semibold text-green-800">Resume on file</p>
                    <p className="text-[12px] text-green-700">AI will personalise questions to your experience.</p>
                  </div>
                </div>
              )}

              {/* Upload success */}
              {uploadDone && (
                <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue/20 rounded-xl">
                  <span className="material-symbols-outlined text-blue text-[20px]">auto_awesome</span>
                  <div>
                    <p className="text-[13px] font-semibold text-text-pri">Resume parsed!</p>
                    <p className="text-[12px] text-text-sec">Role &amp; level updated from your CV. Ready to start.</p>
                  </div>
                </div>
              )}

              {/* Dropzone — shown unless upload is done */}
              {!uploadDone && (
                <div
                  className="border-2 border-dashed border-border rounded-xl p-10 flex flex-col items-center gap-3 hover:border-blue/40 transition-colors cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleResumeFile(f); }}
                >
                  <span className="material-symbols-outlined text-text-muted text-[40px]">
                    {uploading ? "hourglass_top" : "cloud_upload"}
                  </span>
                  <p className="text-[14px] font-semibold text-text-pri">
                    {uploading ? "Parsing resume…" : hasResume ? "Replace resume" : "Upload your resume"}
                  </p>
                  <p className="text-small text-text-muted">PDF, max 5 MB</p>
                  <button
                    disabled={uploading}
                    onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                    className="btn-gradient text-white px-5 py-2 rounded-btn text-[13px] font-semibold disabled:opacity-60"
                  >
                    Browse file
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleResumeFile(f); e.target.value = ""; }}
                  />
                </div>
              )}

              {uploadError && <p className="text-[13px] text-red-500">{uploadError}</p>}

              <button
                onClick={startInterview}
                disabled={uploading}
                className="w-full py-3 text-[14px] font-semibold text-text-sec hover:text-text-pri transition-colors disabled:opacity-40"
              >
                Skip — use generic questions for my role
              </button>
            </div>
          )}

          {/* ── Navigation ── */}
          <div className="flex gap-3 mt-8">
            {step > 0 && (
              <button onClick={back}
                className="px-5 py-3 border border-border rounded-btn text-[14px] font-semibold text-text-sec hover:bg-bg-app transition-colors">
                ← Back
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button onClick={next}
                className="flex-1 btn-gradient text-white py-3 rounded-btn font-bold text-[15px] shadow-blue-glow">
                Next: {STEPS[step + 1]} →
              </button>
            ) : (
              <button onClick={startInterview} disabled={loading || uploading}
                className="flex-1 btn-gradient text-white py-3 rounded-btn font-bold text-[15px] shadow-blue-glow disabled:opacity-60">
                {loading ? "Starting…" : "Start Interview →"}
              </button>
            )}
          </div>

          {startError && (
            <p className="mt-3 text-[13px] text-red-500 text-center">{startError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
