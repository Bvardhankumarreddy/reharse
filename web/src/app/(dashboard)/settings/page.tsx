"use client";

// Spec § Screen 9: Settings + Profile
// "Clean settings page. Linear/Notion-inspired. Feels like a professional tool."

import { useState, useEffect, useRef, Suspense } from "react";
import { authClient } from "@/lib/auth-client";
import { useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { useApiClient } from "@/lib/hooks/useApiClient";
import type { UserResponse, UpdateUserDto, BillingStatus, RazorpayVerifyDto, DayPassVerifyDto, ResumeVersion } from "@/lib/api/client";

// ── Spec: grouped settings navigation ────────────────────────────────────────
type SettingId =
  | "profile" | "notifications"
  | "preferences" | "resume" | "companies"
  | "calendar" | "linkedin"
  | "billing" | "feedback";

type NavItem  = { id: SettingId; label: string; icon: string };
type NavGroup = { group: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    group: "ACCOUNT",
    items: [
      { id: "profile",       label: "Profile",          icon: "person"         },
      { id: "notifications", label: "Notifications",    icon: "notifications"  },
    ],
  },
  {
    group: "INTERVIEW",
    items: [
      { id: "preferences",   label: "Preferences",      icon: "tune"           },
      { id: "resume",        label: "Resume",           icon: "description"    },
      { id: "companies",     label: "Target Companies", icon: "apartment"      },
    ],
  },
  {
    group: "INTEGRATIONS",
    items: [
      { id: "calendar",      label: "Calendar",         icon: "calendar_month" },
      { id: "linkedin",      label: "LinkedIn",         icon: "link"           },
    ],
  },
  {
    group: "BILLING",
    items: [
      { id: "billing",       label: "Plan & Billing", icon: "credit_card"   },
    ],
  },
  {
    group: "SUPPORT",
    items: [
      { id: "feedback",      label: "Send Feedback",  icon: "feedback"      },
    ],
  },
];

const COMPANY_TYPES = [
  { id: "product",     label: "Product Company" },
  { id: "service",     label: "Service / IT"    },
  { id: "startup",     label: "Startup"         },
  { id: "fintech",     label: "Fintech / Crypto" },
  { id: "consulting",  label: "Consulting"      },
  { id: "any",         label: "Any / Exploring" },
];

// ── Reusable sub-components ───────────────────────────────────────────────────

function ProBadge({ onClick }: { onClick?: () => void }) {
  return (
    <span
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      title="Upgrade to Pro"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold ml-1.5 hover:bg-amber-200 transition-colors cursor-pointer"
    >
      <span className="material-symbols-outlined text-[11px]"
        style={{ fontVariationSettings: "'FILL' 1,'wght' 700,'GRAD' 0,'opsz' 20" }}>workspace_premium</span>
      PRO
    </span>
  );
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 py-4 border-b border-border last:border-b-0">
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-text-pri">{label}</p>
        {description && <p className="text-small text-text-sec mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

const GOAL_LABELS: Record<string, string> = {
  job_search:    "Job Search",
  promotion:     "Promotion / Internal",
  career_change: "Career Change",
  explore:       "Just Exploring",
};

function Select({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full sm:w-auto sm:min-w-[180px] h-9 px-3 bg-bg-app border border-border rounded-lg text-small text-text-pri
                 focus:outline-none focus:ring-2 focus:ring-blue/20 focus:border-blue/40 transition"
    >
      {options.map((o) => <option key={o} value={o}>{GOAL_LABELS[o] ?? o}</option>)}
    </select>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={clsx("w-11 h-6 rounded-full transition-colors flex items-center px-0.5", on ? "bg-blue" : "bg-border")}
    >
      <div className={clsx("w-5 h-5 rounded-full bg-surface shadow transition-transform", on ? "translate-x-5" : "translate-x-0")} />
    </button>
  );
}

function SegmentedControl({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex w-full sm:w-auto bg-bg-app border border-border rounded-lg p-0.5 gap-0.5">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={clsx(
            "flex-1 sm:flex-none px-3 py-1.5 rounded text-[12px] font-semibold transition-all",
            value === o ? "bg-surface shadow-sm text-text-pri" : "text-text-sec hover:text-text-pri"
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

// ── Profile panel ─────────────────────────────────────────────────────────────

function ProfilePanel({ user, onSave }: { user: UserResponse | null; onSave: (dto: UpdateUserDto) => Promise<void> }) {
  const { data: session } = authClient.useSession();
  const authUser = session?.user;
  const [firstName,     setFirstName]     = useState(user?.firstName ?? "");
  const [lastName,      setLastName]      = useState(user?.lastName ?? "");
  const [targetRole,    setTargetRole]    = useState(user?.targetRole ?? "");
  const [targetCompany, setTargetCompany] = useState(user?.targetCompany ?? "");
  const [saving,        setSaving]        = useState(false);
  const [saved,         setSaved]         = useState(false);
  const [saveError,     setSaveError]     = useState<string | null>(null);

  // Sync when user data arrives
  useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
    setTargetRole(user.targetRole ?? "");
    setTargetCompany(user.targetCompany ?? "");
  }, [user]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await onSave({ firstName, lastName, targetRole, targetCompany });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const initials = [firstName, lastName].filter(Boolean).map((n) => n[0]).join("").toUpperCase() || "?";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[20px] sm:text-[24px] font-bold text-text-pri">Profile</h2>
        <p className="text-body text-text-sec mt-1">Your public identity and personal details</p>
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden flex-shrink-0">
          {authUser?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={authUser.image} alt="avatar" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full btn-gradient flex items-center justify-center text-white text-[20px] font-black">
              {initials}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[14px] sm:text-[15px] font-semibold text-text-pri truncate">
            {[firstName, lastName].filter(Boolean).join(" ") || "Your Name"}
          </p>
          <p className="text-small text-text-sec mt-0.5 truncate">
            {user?.email ?? authUser?.email ?? ""}
          </p>
        </div>
      </div>

      {/* Fields — 2-col grid on sm+ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {([
          { label: "First Name",     value: firstName,     setter: setFirstName },
          { label: "Last Name",      value: lastName,      setter: setLastName  },
          { label: "Target Role",    value: targetRole,    setter: setTargetRole },
          { label: "Target Company", value: targetCompany, setter: setTargetCompany },
        ] as const).map(({ label, value, setter }) => (
          <div key={label} className="space-y-1.5">
            <label className="label text-text-sec">{label}</label>
            <input
              value={value}
              onChange={(e) => setter(e.target.value)}
              placeholder={label}
              className="w-full h-11 px-4 bg-bg-app border border-border rounded-btn text-body text-text-pri
                         placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue/20 focus:border-blue/40 transition"
            />
          </div>
        ))}
      </div>

      {saveError && <p className="text-[13px] text-red-500">{saveError}</p>}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full sm:w-auto btn-gradient text-white px-6 py-2.5 rounded-btn font-semibold text-[14px] shadow-blue-glow disabled:opacity-60"
      >
        {saving ? "Saving…" : saved ? "Saved ✓" : "Save Changes"}
      </button>
    </div>
  );
}

// ── Preferences panel ─────────────────────────────────────────────────────────

function PreferencesPanel({ user, onSave }: { user: UserResponse | null; onSave: (dto: UpdateUserDto) => Promise<void> }) {
  const isPro = user?.subscriptionTier === "pro" &&
    (user.subscriptionStatus === "active" ||
      ((user.subscriptionStatus === "pass" || user.subscriptionStatus === "day_pass") &&
        (!user.subscriptionEndsAt || new Date(user.subscriptionEndsAt) > new Date())));

  const [level,          setLevel]          = useState(user?.experienceLevel ?? "Mid-level (3–5 years)");
  const [goalType,       setGoalType]       = useState(user?.goalType ?? "job_search");
  const [companyType,    setCompanyType]    = useState(user?.companyType ?? "");
  const [mode,           setMode]           = useState(user?.preferences?.mode          ?? "Text");
  const [adaptive,       setAdaptive]       = useState(user?.preferences?.adaptive       ?? true);
  const [starHints,      setStarHints]      = useState(user?.preferences?.starHints      ?? true);
  const [feedbackDepth,  setFeedbackDepth]  = useState(user?.preferences?.feedbackDepth  ?? "Detailed Report");
  const [saving,         setSaving]         = useState(false);
  const [saved,          setSaved]          = useState(false);
  const [proNudge,       setProNudge]       = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (user.experienceLevel)           setLevel(user.experienceLevel);
    if (user.goalType)                  setGoalType(user.goalType);
    if (user.companyType != null)       setCompanyType(user.companyType);
    if (user.preferences?.mode)         setMode(user.preferences.mode);
    if (user.preferences?.adaptive        != null) setAdaptive(user.preferences.adaptive);
    if (user.preferences?.starHints       != null) setStarHints(user.preferences.starHints);
    if (user.preferences?.feedbackDepth)  setFeedbackDepth(user.preferences.feedbackDepth);
  }, [user]);

  function nudgePro(feature: string) {
    setProNudge(feature);
    setTimeout(() => setProNudge(null), 3500);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ experienceLevel: level, goalType, companyType, preferences: { mode, adaptive, starHints, feedbackDepth } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1">
      <div className="mb-5">
        <h2 className="text-[20px] sm:text-[24px] font-bold text-text-pri">Interview Preferences</h2>
        <p className="text-body text-text-sec mt-1">Customize how AI interviews you</p>
      </div>

      <SettingRow label="Experience Level" description="Affects question difficulty calibration">
        <Select value={level} onChange={setLevel}
          options={["Entry-level (0–2 years)", "Mid-level (3–5 years)", "Senior (5–8 years)", "Staff/Principal (8+ years)"]} />
      </SettingRow>

      <SettingRow label="Interview Goal" description="What you&apos;re primarily preparing for">
        <Select value={goalType} onChange={setGoalType}
          options={["job_search", "promotion", "career_change", "explore"]} />
      </SettingRow>

      {/* Company Type */}
      <div className="py-4 border-b border-border">
        <p className="text-[14px] font-semibold text-text-pri mb-1">Company Type</p>
        <p className="text-small text-text-sec mb-3">What kind of company are you preparing for?</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {COMPANY_TYPES.map((ct) => (
            <button
              key={ct.id}
              onClick={() => setCompanyType(companyType === ct.id ? "" : ct.id)}
              className={clsx(
                "py-2.5 px-3 rounded-xl border-2 text-[13px] font-semibold text-left transition-all",
                companyType === ct.id
                  ? "border-blue bg-blue/5 text-blue"
                  : "border-border text-text-sec hover:border-blue/30 hover:text-text-pri"
              )}
            >
              {ct.label}
            </button>
          ))}
        </div>
      </div>

      <SettingRow label="Answer Mode" description="How you want to respond during interviews">
        <SegmentedControl value={mode} onChange={setMode} options={["Text", "Voice", "Mixed"]} />
      </SettingRow>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 py-4 border-b border-border">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-text-pri flex items-center">
            AI Difficulty Adaptation
            {!isPro && <ProBadge onClick={() => nudgePro("AI Difficulty Adaptation")} />}
          </p>
          <p className="text-small text-text-sec mt-0.5">AI adjusts question difficulty based on your answers</p>
          {proNudge === "AI Difficulty Adaptation" && (
            <p className="text-[11px] text-amber-600 mt-1 font-medium">
              Upgrade to Pro to enable adaptive difficulty.{" "}
              <a href="/settings?tab=billing" className="underline">View plans →</a>
            </p>
          )}
        </div>
        <div className="flex-shrink-0">
          <Toggle on={isPro && adaptive} onChange={(v) => {
            if (!isPro) { nudgePro("AI Difficulty Adaptation"); return; }
            setAdaptive(v);
          }} />
        </div>
      </div>

      <SettingRow label="Show STAR Hints" description="Show STAR structure reminder during behavioral interviews">
        <Toggle on={starHints} onChange={setStarHints} />
      </SettingRow>

      <div className="py-4 border-b border-border">
        <p className="text-[14px] font-semibold text-text-pri mb-1">Post-Interview Feedback Depth</p>
        <p className="text-small text-text-sec mb-3">How detailed should your feedback report be?</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {(["Quick Summary", "Detailed Report", "Expert Analysis"] as const).map((opt) => {
            const locked = opt === "Expert Analysis" && !isPro;
            return (
              <button
                key={opt}
                onClick={() => {
                  if (locked) { nudgePro("Expert Analysis"); return; }
                  setFeedbackDepth(opt);
                }}
                className={clsx(
                  "p-3.5 rounded-xl border-2 text-left transition-all",
                  feedbackDepth === opt && !locked ? "border-blue bg-blue/5" : "border-border hover:border-blue/30",
                  locked && "opacity-60"
                )}
              >
                <p className="text-[13px] font-bold text-text-pri flex items-center gap-1">
                  {opt}
                  {locked && <ProBadge onClick={() => nudgePro("Expert Analysis")} />}
                </p>
                {opt === "Detailed Report" && (
                  <p className="text-[10px] text-blue font-semibold mt-0.5">Recommended</p>
                )}
                {locked && proNudge === "Expert Analysis" && (
                  <p className="text-[10px] text-amber-600 mt-0.5 font-medium">Pro only —{" "}
                    <a href="/settings?tab=billing" className="underline">upgrade →</a>
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full sm:w-auto btn-gradient text-white px-6 py-2.5 rounded-btn font-semibold text-[14px] shadow-blue-glow disabled:opacity-60"
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save Preferences"}
        </button>
      </div>
    </div>
  );
}

// ── Static panels ─────────────────────────────────────────────────────────────

function NotificationsPanel({ user, onSave }: { user: UserResponse | null; onSave: (dto: UpdateUserDto) => Promise<void> }) {
  const defaults = { daily: true, weekly: true, newQ: false, aiCoach: true, session: true };
  const [notifs,  setNotifs]  = useState({ ...defaults, ...(user?.notificationPreferences ?? {}) });
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  useEffect(() => {
    if (user?.notificationPreferences) setNotifs({ ...defaults, ...user.notificationPreferences });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleToggle(key: keyof typeof notifs, val: boolean) {
    const next = { ...notifs, [key]: val };
    setNotifs(next);
    setSaving(true);
    try {
      await onSave({ notificationPreferences: next });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="mb-5">
        <h2 className="text-[20px] sm:text-[24px] font-bold text-text-pri">Notifications</h2>
        <p className="text-body text-text-sec mt-1">
          Manage when and how Rehearse contacts you
          {saved && <span className="ml-2 text-[12px] text-green-600 font-semibold">Saved ✓</span>}
          {saving && !saved && <span className="ml-2 text-[12px] text-text-muted">Saving…</span>}
        </p>
      </div>
      {([
        { key: "daily",   label: "Daily practice reminder",    desc: "Get a nudge every day at 9 AM"              },
        { key: "weekly",  label: "Weekly progress digest",     desc: "Summary of your week every Monday"          },
        { key: "newQ",    label: "New question alerts",        desc: "When new questions are added to your topics" },
        { key: "aiCoach", label: "AI Coach insights",          desc: "Personalised tips based on recent sessions"  },
        { key: "session", label: "Session reminders",          desc: "Reminder before a scheduled mock interview"  },
      ] as const).map(({ key, label, desc }) => (
        <SettingRow key={key} label={label} description={desc}>
          <Toggle on={notifs[key]} onChange={(v) => handleToggle(key, v)} />
        </SettingRow>
      ))}
    </div>
  );
}

function ResumePanel({ user, onUpload }: { user: UserResponse | null; onUpload: (u: UserResponse) => void }) {
  const { api, ready } = useApiClient();
  const inputRef                              = useRef<HTMLInputElement>(null);
  const [uploading,    setUpl]               = useState(false);
  const [error,        setErr]               = useState<string | null>(null);
  const [parsed,       setParsed]            = useState<UserResponse | null>(null);
  const [versions,     setVersions]          = useState<ResumeVersion[]>([]);
  const [loadingVer,   setLoadingVer]        = useState(false);
  const [downloading,  setDownloading]       = useState<string | null>(null); // key being downloaded

  const hasResume = !!(parsed?.resumeText ?? user?.resumeText);
  const display   = parsed ?? user;

  // Load version history on mount
  useEffect(() => {
    if (!ready) return;
    setLoadingVer(true);
    api.getResumeVersions()
      .then(setVersions)
      .catch(() => {})
      .finally(() => setLoadingVer(false));
  }, [api, ready]);

  async function handleDownload(key?: string) {
    const id = key ?? "latest";
    setDownloading(id);
    try {
      const { url } = await api.getResumeDownloadUrl(key);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setErr("Download failed — resume may not be stored in the cloud.");
    } finally {
      setDownloading(null);
    }
  }

  async function handleFile(file: File) {
    if (file.size > 5 * 1024 * 1024) { setErr("File too large (max 5 MB)"); return; }
    setUpl(true); setErr(null);
    try {
      const updated = await api.uploadResume(file);
      setParsed(updated);
      onUpload(updated);
      // Refresh version list after upload
      const v = await api.getResumeVersions().catch(() => versions);
      setVersions(v);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUpl(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[20px] sm:text-[24px] font-bold text-text-pri">Resume</h2>
        <p className="text-body text-text-sec mt-1">AI uses your resume to generate personalised questions</p>
      </div>

      {/* Active resume banner */}
      {hasResume && (
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
          <span className="material-symbols-outlined text-green-600 text-[20px]">check_circle</span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-green-800">Resume active</p>
            {display?.targetRole && (
              <p className="text-[12px] text-green-700 mt-0.5">
                {display.targetRole}{display.experienceLevel ? ` · ${display.experienceLevel}` : ""}
              </p>
            )}
          </div>
          {versions.length > 0 && (
            <button
              onClick={() => handleDownload(versions[0].key)}
              disabled={downloading === versions[0].key}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-green-700 border border-green-300 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-60 flex-shrink-0"
            >
              <span className="material-symbols-outlined text-[14px]">download</span>
              {downloading === versions[0].key ? "…" : "Download"}
            </button>
          )}
        </div>
      )}

      {/* Drop zone */}
      <div
        className="border-2 border-dashed border-border rounded-2xl p-10 flex flex-col items-center gap-3 hover:border-blue/40 transition-colors cursor-pointer"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
      >
        <span className="material-symbols-outlined text-text-muted text-[40px]">
          {uploading ? "hourglass_top" : "cloud_upload"}
        </span>
        <p className="text-[14px] font-semibold text-text-pri">
          {uploading ? "Parsing resume…" : "Drop your resume here"}
        </p>
        <p className="text-small text-text-muted">PDF, max 5 MB</p>
        <button
          disabled={uploading}
          onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
          className="btn-gradient text-white px-5 py-2 rounded-btn text-[13px] font-semibold disabled:opacity-60"
        >
          {hasResume ? "Replace file" : "Browse file"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
        />
      </div>

      {error && <p className="text-[13px] text-red-500">{error}</p>}

      {/* Extracted data (shown right after upload) */}
      {parsed && (
        <div className="p-4 bg-blue-50/40 border border-blue/20 rounded-xl space-y-1.5">
          <p className="text-[13px] font-semibold text-text-pri">Extracted from your resume:</p>
          {parsed.targetRole && (
            <p className="text-small text-text-sec">Role: <span className="font-semibold text-text-pri">{parsed.targetRole}</span></p>
          )}
          {parsed.experienceLevel && (
            <p className="text-small text-text-sec">Level: <span className="font-semibold text-text-pri">{parsed.experienceLevel}</span></p>
          )}
          <p className="text-[11px] text-text-muted">Profile &amp; Preferences updated automatically.</p>
        </div>
      )}

      {/* Version history */}
      {(loadingVer || versions.length > 0) && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-[13px] font-bold text-text-pri">Version History</p>
            <p className="text-[11px] text-text-muted mt-0.5">Last 10 uploads stored · v1 is oldest</p>
          </div>
          {loadingVer ? (
            <div className="p-4 space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-10 bg-bg-app rounded-lg animate-pulse" />)}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {versions.map((v, i) => (
                <div key={v.key} className="flex items-center gap-3 px-4 py-3">
                  <div className={clsx(
                    "w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0",
                    i === 0 ? "bg-blue text-white" : "bg-bg-app text-text-muted"
                  )}>
                    v{v.version}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-text-pri truncate">{v.fileName}</p>
                    <p className="text-[11px] text-text-muted">
                      {new Date(v.uploadedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      {i === 0 && <span className="ml-2 text-blue font-semibold">Active</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDownload(v.key)}
                    disabled={downloading === v.key}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-text-sec border border-border rounded-lg hover:border-blue/40 hover:text-blue transition-colors disabled:opacity-60 flex-shrink-0"
                  >
                    <span className="material-symbols-outlined text-[13px]">download</span>
                    {downloading === v.key ? "…" : "Download"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CompaniesPanel({ user, onSave }: { user: UserResponse | null; onSave: (dto: UpdateUserDto) => Promise<void> }) {
  const ALL = ["Google", "Amazon", "Meta", "Apple", "Microsoft", "Stripe", "Airbnb", "Netflix", "Uber", "LinkedIn"];
  const [companies, setCompanies] = useState<string[]>(user?.targetCompanies ?? []);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);

  useEffect(() => {
    if (user?.targetCompanies) setCompanies(user.targetCompanies);
  }, [user]);

  function toggle(c: string) {
    setCompanies((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ targetCompanies: companies });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[20px] sm:text-[24px] font-bold text-text-pri">Target Companies</h2>
        <p className="text-body text-text-sec mt-1">AI tailors questions to each company&apos;s known interview style</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {ALL.map((c) => (
          <button key={c} onClick={() => toggle(c)}
            className={clsx("px-4 py-2 rounded-full border-2 text-[13px] font-semibold transition-all",
              companies.includes(c) ? "border-blue bg-blue-50/50 text-blue" : "border-border text-text-sec hover:border-blue/30")}>
            {c}
          </button>
        ))}
      </div>
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full sm:w-auto btn-gradient text-white px-6 py-2.5 rounded-btn font-semibold text-[14px] shadow-blue-glow disabled:opacity-60"
      >
        {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
      </button>
    </div>
  );
}

function LinkedInPanel({ user, onSave }: { user: UserResponse | null; onSave: (dto: UpdateUserDto) => Promise<void> }) {
  const [url,     setUrl]     = useState("");
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Pre-populate fields from user profile
  const [firstName,  setFirstName]  = useState(user?.firstName  ?? "");
  const [lastName,   setLastName]   = useState(user?.lastName   ?? "");
  const [role,       setRole]       = useState(user?.targetRole ?? "");
  const [company,    setCompany]    = useState(user?.targetCompany ?? "");
  const [parsed,     setParsed]     = useState(false);

  useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
    setRole(user.targetRole ?? "");
    setCompany(user.targetCompany ?? "");
  }, [user]);

  function handleParse() {
    // Extract name, role, company from the LinkedIn URL pattern as a best-effort
    // without OAuth. We parse the public URL path for the handle and let the user
    // confirm the pre-filled fields below.
    const trimmed = url.trim();
    if (!trimmed.includes("linkedin.com/in/")) {
      setError("Please enter a valid LinkedIn profile URL (linkedin.com/in/your-handle).");
      return;
    }
    setError(null);
    // Extract handle and humanise as a display name hint
    const handle = trimmed.split("linkedin.com/in/")[1]?.replace(/\/$/, "") ?? "";
    const parts  = handle.split("-").filter(Boolean);
    if (parts.length >= 2 && !firstName && !lastName) {
      setFirstName(parts[0].charAt(0).toUpperCase() + parts[0].slice(1));
      setLastName(parts[parts.length - 1].charAt(0).toUpperCase() + parts[parts.length - 1].slice(1));
    }
    setParsed(true);
  }

  async function handleSave() {
    setSaving(true); setError(null);
    try {
      await onSave({ firstName, lastName, targetRole: role, targetCompany: company });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[20px] sm:text-[24px] font-bold text-text-pri">LinkedIn Import</h2>
        <p className="text-body text-text-sec mt-1">
          Paste your LinkedIn profile URL to auto-fill your name, role, and company.
        </p>
      </div>

      {/* URL input */}
      <div className="space-y-2">
        <label className="label text-text-sec">LinkedIn Profile URL</label>
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => { setUrl(e.target.value); setParsed(false); setError(null); }}
            placeholder="https://linkedin.com/in/your-handle"
            className="flex-1 h-10 px-3 bg-bg-app border border-border rounded-btn text-[13px] text-text-pri
                       placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-blue/20 focus:border-blue/40 transition"
          />
          <button
            onClick={handleParse}
            disabled={!url.trim()}
            className="px-4 py-2 btn-gradient text-white rounded-btn text-[13px] font-semibold shadow-blue-glow disabled:opacity-50 flex-shrink-0"
          >
            Import
          </button>
        </div>
        {error && <p className="text-[12px] text-red-500">{error}</p>}
        <p className="text-[11px] text-text-muted flex items-center gap-1">
          <span className="material-symbols-outlined text-[13px]">info</span>
          Your public profile URL — no login required. We only read the URL path.
        </p>
      </div>

      {/* Editable fields — shown after parsing or pre-filled from profile */}
      {(parsed || firstName || role) && (
        <div className="bg-bg-app border border-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-[16px] text-blue"
              style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>edit</span>
            <p className="text-[13px] font-semibold text-text-pri">Confirm imported details</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { label: "First Name", value: firstName, set: setFirstName },
              { label: "Last Name",  value: lastName,  set: setLastName  },
              { label: "Target Role",    value: role,    set: setRole    },
              { label: "Target Company", value: company, set: setCompany },
            ].map(({ label, value, set }) => (
              <div key={label}>
                <label className="block text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-1">{label}</label>
                <input
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  className="w-full h-10 px-3 bg-surface border border-border rounded-btn text-[13px] text-text-pri
                             focus:outline-none focus:ring-2 focus:ring-blue/20 focus:border-blue/40 transition"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-gradient text-white px-6 py-2.5 rounded-btn font-semibold text-[13px] shadow-blue-glow disabled:opacity-60"
            >
              {saving ? "Saving…" : saved ? "Saved ✓" : "Save to Profile"}
            </button>
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="flex items-start gap-3 bg-blue/5 border border-blue/20 rounded-xl p-4">
        <span className="material-symbols-outlined text-blue text-[18px] flex-shrink-0 mt-0.5"
          style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>lock</span>
        <p className="text-[12px] text-text-sec leading-relaxed">
          We only use your LinkedIn URL to infer your handle. No OAuth, no access to your LinkedIn account — your data stays private.
        </p>
      </div>
    </div>
  );
}

function CalendarPanel({ user, onSave }: { user: UserResponse | null; onSave: (dto: UpdateUserDto) => Promise<void> }) {
  const { api } = useApiClient();
  const searchParams = useSearchParams();

  const [date,        setDate]        = useState(user?.interviewDate?.slice(0, 10) ?? "");
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [connecting,  setConnecting]  = useState(false);
  const [syncing,     setSyncing]     = useState(false);
  const [syncLink,    setSyncLink]    = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  // Handle OAuth return params
  useEffect(() => {
    const connected = searchParams.get("connected");
    const oauthError = searchParams.get("error");
    if (connected === "true") {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      // strip query params without reload
      window.history.replaceState({}, "", window.location.pathname + "?tab=calendar");
    } else if (oauthError) {
      setError(decodeURIComponent(oauthError));
      window.history.replaceState({}, "", window.location.pathname + "?tab=calendar");
    }
  }, [searchParams]);

  useEffect(() => {
    if (user?.interviewDate) setDate(user.interviewDate.slice(0, 10));
  }, [user]);

  const daysRemaining = date
    ? Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000)
    : null;

  const isConnected = user?.googleCalendarConnected ?? false;

  async function handleSave() {
    setSaving(true); setError(null);
    try {
      await onSave({ interviewDate: date || null });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      // Auto-sync to calendar if connected and a valid date is set
      if (isConnected && date && daysRemaining !== null && daysRemaining >= 0) {
        const result = await api.syncCalendarEvent();
        setSyncLink(result.htmlLink);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setDate("");
    setSaving(true);
    try {
      await onSave({ interviewDate: null });
    } finally {
      setSaving(false);
    }
  }

  async function handleConnect() {
    setConnecting(true); setError(null);
    try {
      const { url } = await api.getCalendarAuthUrl();
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start Google sign-in");
      setConnecting(false);
    }
  }

  async function handleSync() {
    setSyncing(true); setError(null);
    try {
      const result = await api.syncCalendarEvent();
      setSyncLink(result.htmlLink);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true); setError(null);
    try {
      await api.disconnectCalendar();
      setSyncLink(null);
      // Refresh user so googleCalendarConnected flips to false
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Disconnect failed");
      setDisconnecting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[20px] sm:text-[24px] font-bold text-text-pri">Interview Countdown</h2>
        <p className="text-body text-text-sec mt-1">
          Set your target interview date — we&apos;ll show a countdown on your dashboard.
        </p>
      </div>

      {/* Date picker */}
      <div className="space-y-1.5">
        <label className="label text-text-sec">Interview Date</label>
        <input
          type="date"
          value={date}
          min={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setDate(e.target.value)}
          className="w-full sm:w-64 h-11 px-4 bg-bg-app border border-border rounded-btn text-body text-text-pri
                     focus:outline-none focus:ring-2 focus:ring-blue/20 focus:border-blue/40 transition"
        />
      </div>

      {date && daysRemaining !== null && daysRemaining >= 0 && (
        <div className="flex items-center gap-3 p-4 bg-blue/5 border border-blue/20 rounded-xl">
          <span className="material-symbols-outlined text-blue text-[20px]"
            style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>event</span>
          <p className="text-[14px] text-text-pri">
            <span className="font-bold text-blue">{daysRemaining} day{daysRemaining !== 1 ? "s" : ""}</span> until your interview
          </p>
        </div>
      )}

      {date && daysRemaining !== null && daysRemaining < 0 && (
        <p className="text-[13px] text-text-muted">That date has passed. Pick a future date.</p>
      )}

      {error && <p className="text-[13px] text-red-500">{error}</p>}
      {saved && !error && (
        <p className="text-[13px] text-emerald-500">
          {isConnected ? "Saved and synced to Google Calendar ✓" : "Saved ✓"}
        </p>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !date || (daysRemaining !== null && daysRemaining < 0)}
          className="btn-gradient text-white px-6 py-2.5 rounded-btn font-semibold text-[14px] shadow-blue-glow disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save Date"}
        </button>
        {user?.interviewDate && (
          <button onClick={handleClear} disabled={saving}
            className="px-5 py-2.5 border border-border rounded-btn text-[14px] font-semibold text-text-sec hover:text-text-pri hover:border-text-muted transition-colors disabled:opacity-40">
            Clear
          </button>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Google Calendar integration */}
      <div>
        <h3 className="text-[16px] font-semibold text-text-pri">Google Calendar</h3>
        <p className="text-[13px] text-text-sec mt-1">
          Connect Google Calendar to automatically create a calendar event for your interview date.
        </p>
      </div>

      {isConnected ? (
        <div className="space-y-4">
          {/* Connected badge */}
          <div className="flex items-center gap-3 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
            <span className="material-symbols-outlined text-emerald-500 text-[20px]"
              style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>check_circle</span>
            <p className="text-[14px] text-text-pri font-medium">Google Calendar connected</p>
          </div>

          {syncLink && (
            <a
              href={syncLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[13px] text-blue hover:underline"
            >
              <span className="material-symbols-outlined text-[16px]">open_in_new</span>
              View event in Google Calendar
            </a>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleSync}
              disabled={syncing || !date || (daysRemaining !== null && daysRemaining < 0)}
              className="flex items-center gap-2 px-5 py-2.5 bg-bg-card border border-border rounded-btn text-[14px] font-semibold text-text-pri hover:border-text-muted transition-colors disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[18px]">sync</span>
              {syncing ? "Syncing…" : "Sync to Calendar"}
            </button>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="px-5 py-2.5 border border-red-500/30 rounded-btn text-[14px] font-semibold text-red-500 hover:bg-red-500/5 transition-colors disabled:opacity-40"
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="flex items-center gap-2.5 px-5 py-2.5 bg-bg-card border border-border rounded-btn text-[14px] font-semibold text-text-pri hover:border-text-muted transition-colors disabled:opacity-60"
        >
          {connecting ? (
            <>
              <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
              Redirecting…
            </>
          ) : (
            <>
              {/* Google "G" logo */}
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              Connect Google Calendar
            </>
          )}
        </button>
      )}
    </div>
  );
}

const PRO_FEATURES = [
  { icon: "auto_awesome",    text: "Unlimited AI-adaptive sessions with difficulty tuning" },
  { icon: "description",     text: "Resume-tailored question generation for every role" },
  { icon: "analytics",       text: "Advanced feedback, weak-area tracking & score trends" },
  { icon: "bolt",            text: "Priority AI response times — no wait queues" },
  { icon: "groups",          text: "Mock interview pairs — practice with a peer" },
  { icon: "workspace_premium", text: "Early access to all new features" },
];

// ₹120/mo is the only recurring plan. 3mo/6mo/yearly are one-time access
// passes (no auto-renew). Amounts here are display-only — the server is the
// source of truth for what is actually charged.
const ACCESS_PASSES = [
  { id: "3mo" as const,    price: "₹279", was: null,   per: "/ 3 mo", sub: "One-time · 3 months access", tag: "Save 22% vs monthly", best: false },
  { id: "6mo" as const,    price: "₹449", was: null,   per: "/ 6 mo", sub: "One-time · 6 months access", tag: "Save 38% vs monthly", best: false },
  { id: "yearly" as const, price: "₹599", was: "₹999", per: "/ yr",   sub: "One-time · no renewal",     tag: null,                 best: true  },
];

// Rolling urgency date for the yearly offer — always ~5 days out so it never
// looks stale. Display only; price is constant.
function rollingOfferDate(): string {
  return new Date(Date.now() + 5 * 86_400_000).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function BillingPanel({ user }: { user: UserResponse | null }) {
  const { api } = useApiClient();

  // Seed from user prop so there's no loading flicker
  const [billing, setBilling] = useState<BillingStatus>(() => ({
    tier:           user?.subscriptionTier   ?? "free",
    status:         user?.subscriptionStatus ?? null,
    subscriptionId: null,
    endsAt:         user?.subscriptionEndsAt ?? null,
  }));
  const [showModal,    setShowModal]    = useState(false);
  const [working,      setWorking]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [notice,       setNotice]       = useState<string | null>(null);

  // 'pass' = new 3/6/12-month access pass; 'day_pass' = legacy 24h pass.
  const isPass    = billing?.tier === "pro" && (billing?.status === "pass" || billing?.status === "day_pass");
  const isPro     = billing?.tier === "pro" && (billing?.status === "active" || isPass);
  const isPastDue = billing?.status === "past_due";

  async function handleUpgrade() {
    setWorking(true); setError(null);
    try {
      const { subscriptionId, keyId } = await api.createSubscription();

      // Load Razorpay checkout script on-demand
      await new Promise<void>((resolve, reject) => {
        if ((window as unknown as Record<string, unknown>).Razorpay) { resolve(); return; }
        const s = document.createElement("script");
        s.src = "https://checkout.razorpay.com/v1/checkout.js";
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Failed to load Razorpay"));
        document.head.appendChild(s);
      });

      const RazorpayConstructor = (window as unknown as { Razorpay: new (opts: unknown) => { open(): void } }).Razorpay;
      const rzp = new RazorpayConstructor({
        key:             keyId,
        subscription_id: subscriptionId,
        name:            "Rehearse",
        description:     "Pro — ₹120 / month (recurring)",
        image:           "/logo.png",
        handler: async (response: RazorpayVerifyDto) => {
          try {
            await api.verifyPayment(response);
            setBilling((prev) => ({ ...prev!, tier: "pro", status: "active" }));
            setNotice("Payment successful — your Pro plan is now active!");
            setShowModal(false);
          } catch {
            setError("Payment verification failed. Contact support if amount was charged.");
          } finally {
            setWorking(false);
          }
        },
        modal: {
          ondismiss: () => setWorking(false),
        },
        theme: { color: "#6366f1" },
      });

      rzp.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start checkout");
      setWorking(false);
    }
  }

  async function handleAccessPass(passType: "3mo" | "6mo" | "yearly") {
    setWorking(true); setError(null);
    try {
      const { orderId, keyId, amount } = await api.createAccessPass(passType);

      await new Promise<void>((resolve, reject) => {
        if ((window as unknown as Record<string, unknown>).Razorpay) { resolve(); return; }
        const s = document.createElement("script");
        s.src = "https://checkout.razorpay.com/v1/checkout.js";
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Failed to load Razorpay"));
        document.head.appendChild(s);
      });

      const label =
        passType === "3mo" ? "3 months" : passType === "6mo" ? "6 months" : "1 year";

      const RazorpayConstructor = (window as unknown as { Razorpay: new (opts: unknown) => { open(): void } }).Razorpay;
      const rzp = new RazorpayConstructor({
        key:      keyId,
        order_id: orderId,
        amount,
        currency: "INR",
        name:     "Rehearse",
        description: `Pro Access Pass — ${label} (one-time)`,
        image:    "/logo.png",
        handler: async (response: DayPassVerifyDto) => {
          try {
            const { endsAt } = await api.verifyAccessPass(response);
            setBilling((prev) => ({ ...prev!, tier: "pro", status: "pass", endsAt }));
            setNotice(`Access pass activated! Full Pro access for ${label}.`);
            setShowModal(false);
          } catch {
            setError("Payment verification failed. Contact support if amount was charged.");
          } finally {
            setWorking(false);
          }
        },
        modal: { ondismiss: () => setWorking(false) },
        theme: { color: "#6366f1" },
      });

      rzp.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start checkout");
      setWorking(false);
    }
  }

  async function handleCancel() {
    if (!confirm("Cancel your Pro subscription? You'll keep access until the end of the billing period.")) return;
    setWorking(true); setError(null);
    try {
      await api.cancelSubscription();
      setBilling((prev) => ({ ...prev!, status: "cancelled" }));
      setNotice("Subscription cancelled. You'll keep Pro access until the end of your billing period.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setWorking(false);
    }
  }

  const renewalDate = billing?.endsAt
    ? new Date(billing.endsAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[20px] sm:text-[24px] font-bold text-text-pri">Plan & Billing</h2>
        <p className="text-body text-text-sec mt-1">Manage your subscription and payment details</p>
      </div>

      {notice && (
        <div className="flex items-center gap-3 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
          <span className="material-symbols-outlined text-emerald-500 text-[20px]"
            style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>check_circle</span>
          <p className="text-[14px] text-text-pri">{notice}</p>
        </div>
      )}

      {isPastDue && (
        <div className="flex items-center gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
          <span className="material-symbols-outlined text-amber-500 text-[20px]"
            style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>warning</span>
          <p className="text-[14px] text-text-pri">Payment failed. Please update your payment method to keep Pro access.</p>
        </div>
      )}

      {error && <p className="text-[13px] text-red-500">{error}</p>}

      {/* Current plan card */}
      <div className="bg-bg-app border border-border rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {isPro ? (
            <span className="px-2.5 py-1 rounded-full bg-gradient-to-r from-violet-500 to-blue-500 text-[11px] font-bold text-white uppercase tracking-wide flex-shrink-0">
              Pro
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full bg-surface border border-border text-[11px] font-bold text-text-sec uppercase tracking-wide flex-shrink-0">
              Free
            </span>
          )}
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-text-pri">
              {isPass ? "Pro · Access Pass" : isPro ? "Pro Plan" : "Free Plan"}
            </p>
            <p className="text-small text-text-sec mt-0.5">
              {isPass && renewalDate
                ? `Access until ${renewalDate}`
                : isPro && renewalDate
                ? `Renews ${renewalDate}`
                : isPro
                ? "Active"
                : "Unlimited practice sessions · No credit card required"}
            </p>
          </div>
        </div>
        {billing?.status === "active" ? (
          // Only recurring subscriptions can be cancelled. One-time passes
          // simply lapse at their end date — nothing to cancel.
          <button
            onClick={handleCancel}
            disabled={working}
            className="flex-shrink-0 px-4 py-2 border border-red-500/30 rounded-btn text-[13px] font-semibold text-red-500 hover:bg-red-500/5 transition-colors disabled:opacity-50"
          >
            {working ? "Cancelling…" : "Cancel Plan"}
          </button>
        ) : !isPro ? (
          <button
            onClick={() => setShowModal(true)}
            className="flex-shrink-0 px-4 py-2 btn-gradient text-white rounded-btn text-[13px] font-semibold shadow-blue-glow hover:-translate-y-0.5 transition-all"
          >
            Upgrade to Pro
          </button>
        ) : null}
      </div>

      {/* Pro features grid — show only when not already pro */}
      {!isPro && (
        <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-blue-50 p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#7C3AED] text-[20px]"
              style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>workspace_premium</span>
            <p className="text-[14px] font-bold text-[#7C3AED]">What you unlock with Pro</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {PRO_FEATURES.map((f) => (
              <div key={f.text} className="flex items-start gap-2.5">
                <span className="material-symbols-outlined text-[#7C3AED] text-[16px] flex-shrink-0 mt-0.5"
                  style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>{f.icon}</span>
                <p className="text-[13px] text-text-sec leading-snug">{f.text}</p>
              </div>
            ))}
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="w-full sm:w-auto btn-gradient text-white px-6 py-2.5 rounded-btn font-semibold text-[13px] shadow-blue-glow hover:-translate-y-0.5 transition-all"
          >
            Get Pro Access
          </button>
        </div>
      )}

      {/* Upgrade modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setShowModal(false)}>
          <div className="bg-surface rounded-2xl shadow-2xl border border-border w-full max-w-md p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}>

            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[18px] font-black text-text-pri">Become a Member</p>
                <p className="text-small text-text-sec mt-0.5">Unlock everything · Cancel anytime</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1 text-text-muted hover:text-text-pri transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* ₹120/mo recurring subscription */}
              <button
                onClick={handleUpgrade}
                disabled={working}
                className="text-left p-4 rounded-xl border-2 border-border hover:border-violet-300 transition-all disabled:opacity-50"
              >
                <p className="text-[22px] font-black text-text-pri leading-none">
                  ₹120 <span className="text-[13px] font-medium text-text-muted">/ mo</span>
                </p>
                <p className="text-[12px] text-text-sec mt-1.5">Recurring · cancel anytime</p>
                <p className="text-[11px] text-violet-600 font-semibold mt-1">Auto-charged ₹120 every month</p>
                <span className="mt-3 inline-block w-full text-center px-3 py-2 rounded-btn border border-border text-[13px] font-semibold text-text-pri">
                  {working ? "Opening…" : "Subscribe"}
                </span>
              </button>

              {/* One-time access passes */}
              {ACCESS_PASSES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleAccessPass(p.id)}
                  disabled={working}
                  className={clsx(
                    "relative text-left p-4 rounded-xl border-2 transition-all disabled:opacity-50",
                    p.best ? "border-text-pri" : "border-border hover:border-violet-300",
                  )}
                >
                  {p.best && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-text-pri text-white text-[10px] font-bold">
                      Best Value
                    </span>
                  )}
                  <p className="text-[22px] font-black text-text-pri leading-none">
                    {p.price}
                    {p.was && <span className="ml-1.5 text-[13px] font-medium text-text-muted line-through">{p.was}</span>}
                    <span className="text-[13px] font-medium text-text-muted"> {p.per}</span>
                  </p>
                  <p className="text-[12px] text-text-sec mt-1.5">{p.sub}</p>
                  {p.tag && <p className="text-[11px] text-emerald-600 font-semibold mt-1">{p.tag}</p>}
                  {p.best && (
                    <p className="text-[11px] text-amber-600 font-semibold mt-1">
                      Offer ends {rollingOfferDate()}
                    </p>
                  )}
                  <span className={clsx(
                    "mt-3 inline-block w-full text-center px-3 py-2 rounded-btn text-[13px] font-semibold",
                    p.best ? "bg-text-pri text-white" : "border border-border text-text-pri",
                  )}>
                    {working ? "Opening…" : "Get access"}
                  </span>
                </button>
              ))}
            </div>

            <p className="text-[12px] text-text-sec text-center">
              Full Pro access — all interview types, voice mode, AI coach, 1,800+ questions.
              Monthly auto-renews; passes are one-time with no renewal.
            </p>

            <div className="flex items-center justify-center gap-4 text-[11px] text-text-muted">
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">lock</span>Secure checkout via Razorpay
              </span>
              <span>·</span>
              <span>Cancel anytime</span>
              <span>·</span>
              <span>No hidden fees</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Feedback panel ────────────────────────────────────────────────────────────

const FEEDBACK_CATEGORIES = [
  { id: "bug",     label: "Bug Report",     icon: "bug_report"    },
  { id: "feature", label: "Feature Request", icon: "lightbulb"    },
  { id: "general", label: "General",         icon: "chat"         },
  { id: "praise",  label: "Praise",          icon: "favorite"     },
];

function FeedbackPanel() {
  const { api } = useApiClient();
  const [rating,   setRating]   = useState(0);
  const [hovered,  setHovered]  = useState(0);
  const [category, setCategory] = useState("general");
  const [message,  setMessage]  = useState("");
  const [saving,   setSaving]   = useState(false);
  const [sent,     setSent]     = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function handleSubmit() {
    if (!message.trim()) { setError("Please write a message before submitting."); return; }
    setSaving(true); setError(null);
    try {
      await api.submitUserFeedback({ rating: rating || undefined, category, message: message.trim() });
      setSent(true);
      setRating(0); setCategory("general"); setMessage("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[20px] sm:text-[24px] font-bold text-text-pri">Send Feedback</h2>
        <p className="text-body text-text-sec mt-1">
          Help us improve Rehearse — report bugs, request features, or just say hi.
        </p>
      </div>

      {sent ? (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 flex flex-col items-center gap-3 text-center">
          <span className="material-symbols-outlined text-[40px] text-green-500"
            style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>check_circle</span>
          <p className="text-[16px] font-semibold text-green-800">Thanks for your feedback!</p>
          <p className="text-[13px] text-green-700">We read every message and use it to make Rehearse better.</p>
          <button
            onClick={() => setSent(false)}
            className="mt-2 px-4 py-2 text-[13px] font-semibold text-green-700 border border-green-300 rounded-btn hover:bg-green-100 transition-colors"
          >
            Send another
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Star rating */}
          <div className="space-y-2">
            <p className="label text-text-sec">How would you rate Rehearse? (optional)</p>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onMouseEnter={() => setHovered(star)}
                  onMouseLeave={() => setHovered(0)}
                  onClick={() => setRating(star === rating ? 0 : star)}
                  className="text-[28px] transition-transform hover:scale-110"
                >
                  <span
                    className="material-symbols-outlined text-[28px]"
                    style={{
                      fontVariationSettings: (hovered || rating) >= star ? "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" : "'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24",
                      color: (hovered || rating) >= star ? "#f59e0b" : "#9ca3af",
                    }}
                  >
                    star
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <p className="label text-text-sec">Category</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {FEEDBACK_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className={clsx(
                    "flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 text-[12px] font-semibold transition-all",
                    category === c.id
                      ? "border-blue bg-blue/5 text-blue"
                      : "border-border text-text-sec hover:border-text-muted hover:text-text-pri"
                  )}
                >
                  <span
                    className="material-symbols-outlined text-[20px]"
                    style={{ fontVariationSettings: category === c.id ? "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" : "'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24" }}
                  >
                    {c.icon}
                  </span>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <p className="label text-text-sec">Message <span className="text-red-400">*</span></p>
            <textarea
              value={message}
              onChange={(e) => { setMessage(e.target.value); setError(null); }}
              rows={5}
              placeholder="Tell us what's on your mind…"
              className="w-full px-4 py-3 bg-bg-app border border-border rounded-xl text-[13px] text-text-pri placeholder:text-text-muted
                         focus:outline-none focus:ring-2 focus:ring-blue/20 focus:border-blue/40 transition resize-none"
            />
            <p className="text-[11px] text-text-muted text-right">{message.length} / 2000</p>
          </div>

          {error && <p className="text-[13px] text-red-500">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={saving || !message.trim()}
            className="px-6 py-2.5 btn-gradient text-white rounded-btn text-[14px] font-semibold shadow-blue-glow
                       hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:translate-y-0"
          >
            {saving ? "Sending…" : "Send Feedback"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function SettingsPageInner() {
  const { api, ready } = useApiClient();
  const params = useSearchParams();
  const initialTab = (params.get("tab") as SettingId | null) ?? "preferences";
  const [active, setActive] = useState<SettingId>(initialTab);
  const [apiUser, setApiUser] = useState<UserResponse | null>(null);

  useEffect(() => {
    if (!ready) return;
    api.getMe().then(setApiUser).catch(() => {/* silently fall back */});
  }, [api, ready]);

  async function handleUserSave(dto: UpdateUserDto) {
    const updated = await api.updateMe(dto);
    setApiUser(updated);
  }

  function renderPanel() {
    switch (active) {
      case "profile":       return <ProfilePanel       user={apiUser} onSave={handleUserSave} />;
      case "preferences":   return <PreferencesPanel   user={apiUser} onSave={handleUserSave} />;
      case "notifications": return <NotificationsPanel user={apiUser} onSave={handleUserSave} />;
      case "resume":        return <ResumePanel user={apiUser} onUpload={setApiUser} />;
      case "companies":     return <CompaniesPanel user={apiUser} onSave={handleUserSave} />;
      case "calendar":      return <CalendarPanel user={apiUser} onSave={handleUserSave} />;
      case "linkedin":      return <LinkedInPanel user={apiUser} onSave={handleUserSave} />;
      case "billing":       return <BillingPanel user={apiUser} />;
      case "feedback":      return <FeedbackPanel />;
    }
  }

  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-6 items-start max-w-[960px] w-full overflow-x-hidden">

      {/* Left nav — desktop only */}
      <aside className="hidden md:flex flex-col w-[220px] flex-shrink-0 bg-bg-app border border-border rounded-2xl py-4 overflow-hidden">
        {NAV_GROUPS.map(({ group, items }) => (
          <div key={group} className="mb-2">
            <p className="label text-text-muted px-4 pb-1 pt-2" style={{ fontSize: 10 }}>{group}</p>
            {items.map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => setActive(id)}
                className={clsx(
                  "w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium transition-colors text-left",
                  active === id ? "bg-blue/10 text-blue font-semibold" : "text-text-sec hover:bg-surface hover:text-text-pri"
                )}
              >
                <span
                  className="material-symbols-outlined text-[16px]"
                  style={{ fontVariationSettings: active === id ? "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" : "'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24" }}
                >
                  {icon}
                </span>
                {label}
              </button>
            ))}
          </div>
        ))}
      </aside>

      {/* Right column: tab strip (mobile) + panel */}
      <div className="flex-1 min-w-0 w-full flex flex-col gap-3 overflow-hidden">

        {/* Mobile tab strip — scrolls horizontally, isolated so it can't expand parent */}
        <div className="md:hidden w-full overflow-x-auto no-scrollbar">
          <div className="flex gap-1.5 pb-1 w-max">
            {NAV_GROUPS.flatMap((g) => g.items).map(({ id, label }) => (
              <button key={id} onClick={() => setActive(id)}
                className={clsx("px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition-all flex-shrink-0",
                  active === id ? "bg-blue text-white" : "bg-surface border border-border text-text-sec")}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Content panel */}
        <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 shadow-card overflow-hidden">
          {renderPanel()}
        </div>

      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsPageInner />
    </Suspense>
  );
}
