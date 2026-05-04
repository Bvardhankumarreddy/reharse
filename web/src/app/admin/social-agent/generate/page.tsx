"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  fetchToken, api, PLATFORM_LABEL, PLATFORM_COLOR,
  type SocialPlatform, type SocialContentType, type SocialPost,
} from "../_helpers";

const CONTENT_TYPES: { value: SocialContentType; label: string; description: string }[] = [
  { value: "lesson_drop",       label: "📚 Lesson Drop",       description: "Announce a new YouTube lesson" },
  { value: "quiz_winners",      label: "🏆 Quiz Winners",      description: "Celebrate top 3 winners" },
  { value: "quiz_announcement", label: "🎯 Quiz Announcement", description: "Promote upcoming quiz" },
  { value: "engagement_post",   label: "💬 Engagement Post",   description: "Hot take / question to start a conversation" },
  { value: "custom",            label: "✏️ Custom",            description: "Free-form prompt" },
];

const PLATFORMS: SocialPlatform[] = [
  "linkedin_page", "linkedin_personal",
  "instagram_feed", "instagram_story",
  "whatsapp_status", "youtube_community",
];

function defaultScheduledAt(): string {
  const d = new Date();
  d.setHours(d.getHours() + 1);
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
}

export default function GeneratePage() {
  const router = useRouter();
  const [contentType, setContentType] = useState<SocialContentType>("lesson_drop");
  const [scheduledAt, setScheduledAt] = useState(defaultScheduledAt());
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<SocialPlatform>>(
    new Set(["linkedin_page", "instagram_feed", "whatsapp_status"]),
  );
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lesson drop fields
  const [lessonCtx, setLessonCtx] = useState({
    week: 1, lessonNum: 1, title: "", hook: "",
    youtubeLink: "", duration: 7,
    nextLessonTitle: "", nextLessonDay: "Saturday",
    insight: "",
  });

  // Quiz winners fields
  const [quizCtx, setQuizCtx] = useState({
    week: 1, totalParticipants: 0,
    winners: [
      { name: "", score: "", time: "" },
      { name: "", score: "", time: "" },
      { name: "", score: "", time: "" },
    ],
    nextQuizDay: "Saturday",
  });

  // Quiz announcement fields
  const [announceCtx, setAnnounceCtx] = useState({
    week: 1, quizDay: "Saturday", quizTime: "8 PM IST",
  });

  // Engagement / custom fields
  const [engagementCtx, setEngagementCtx] = useState({ topic: "", angle: "" });
  const [customBrief, setCustomBrief] = useState("");

  function togglePlatform(p: SocialPlatform) {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  function buildContext(): Record<string, unknown> {
    if (contentType === "lesson_drop") return { ...lessonCtx };
    if (contentType === "quiz_winners") return { ...quizCtx };
    if (contentType === "quiz_announcement") return { ...announceCtx };
    if (contentType === "engagement_post") return { ...engagementCtx };
    return { brief: customBrief };
  }

  function validate(): string | null {
    if (selectedPlatforms.size === 0) return "Pick at least one platform";
    if (!scheduledAt) return "Schedule date required";
    if (contentType === "lesson_drop" && !lessonCtx.title.trim()) return "Lesson title required";
    if (contentType === "quiz_winners" && !quizCtx.winners[0].name.trim()) return "1st place winner name required";
    if (contentType === "custom" && !customBrief.trim()) return "Brief required for custom posts";
    return null;
  }

  async function handleGenerate() {
    const err = validate();
    if (err) { setError(err); return; }

    setGenerating(true);
    setError(null);
    try {
      const token = await fetchToken();
      if (!token) throw new Error("Not authenticated");

      await api<{ data: SocialPost[] }>(token, "/generate", {
        method: "POST",
        body: JSON.stringify({
          contentType,
          context: buildContext(),
          platforms: Array.from(selectedPlatforms),
          scheduledAt: new Date(scheduledAt).toISOString(),
        }),
      });

      router.push("/admin/social-agent/queue?just_generated=1");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Content type */}
      <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-5">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[#B8C5E0] mb-3">Content Type</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {CONTENT_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setContentType(t.value)}
              className={`text-left p-3 rounded-xl border transition ${
                contentType === t.value
                  ? "bg-[#00D4FF]/10 border-[#00D4FF] text-white"
                  : "bg-[#0A0E27] border-white/10 text-[#B8C5E0] hover:border-white/30"
              }`}
            >
              <div className="font-semibold">{t.label}</div>
              <div className="text-xs text-[#6B7799] mt-0.5">{t.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Context fields */}
      <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[#B8C5E0]">Details</div>

        {contentType === "lesson_drop" && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <NumField label="Week #"     value={lessonCtx.week}      onChange={(v) => setLessonCtx({ ...lessonCtx, week: v })} />
              <NumField label="Lesson #"   value={lessonCtx.lessonNum} onChange={(v) => setLessonCtx({ ...lessonCtx, lessonNum: v })} />
              <NumField label="Duration (min)" value={lessonCtx.duration} onChange={(v) => setLessonCtx({ ...lessonCtx, duration: v })} />
            </div>
            <TextField label="Title *" value={lessonCtx.title} onChange={(v) => setLessonCtx({ ...lessonCtx, title: v })} placeholder="Prompt Engineering 101" />
            <TextArea label="Hook (1-2 sentences)" value={lessonCtx.hook} onChange={(v) => setLessonCtx({ ...lessonCtx, hook: v })} rows={2} />
            <TextField label="YouTube Link" value={lessonCtx.youtubeLink} onChange={(v) => setLessonCtx({ ...lessonCtx, youtubeLink: v })} placeholder="https://youtube.com/watch?v=..." />
            <div className="grid grid-cols-3 gap-3">
              <TextField cols={2} label="Next Lesson Title" value={lessonCtx.nextLessonTitle} onChange={(v) => setLessonCtx({ ...lessonCtx, nextLessonTitle: v })} />
              <TextField label="Next Lesson Day" value={lessonCtx.nextLessonDay} onChange={(v) => setLessonCtx({ ...lessonCtx, nextLessonDay: v })} />
            </div>
            <TextArea label="Personal Insight (LinkedIn personal)" value={lessonCtx.insight} onChange={(v) => setLessonCtx({ ...lessonCtx, insight: v })} rows={2} />
          </>
        )}

        {contentType === "quiz_winners" && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <NumField label="Quiz Week #"        value={quizCtx.week}              onChange={(v) => setQuizCtx({ ...quizCtx, week: v })} />
              <NumField label="Total Participants" value={quizCtx.totalParticipants} onChange={(v) => setQuizCtx({ ...quizCtx, totalParticipants: v })} />
              <TextField label="Next Quiz Day"     value={quizCtx.nextQuizDay}       onChange={(v) => setQuizCtx({ ...quizCtx, nextQuizDay: v })} />
            </div>
            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[#B8C5E0]">Top 3 Winners *</div>
              {quizCtx.winners.map((w, i) => (
                <div key={i} className="bg-[#0A0E27] border border-white/10 rounded-xl p-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#B8C5E0] mb-1">
                    {["🥇 1st", "🥈 2nd", "🥉 3rd"][i]}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input value={w.name}  onChange={(e) => updateWinner(i, { name: e.target.value })} placeholder="Name"  className={inputCls} />
                    <input value={w.score} onChange={(e) => updateWinner(i, { score: e.target.value })} placeholder="Score (e.g. 9/9)" className={inputCls} />
                    <input value={w.time}  onChange={(e) => updateWinner(i, { time: e.target.value })}  placeholder="Time (e.g. 56s)" className={inputCls} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {contentType === "quiz_announcement" && (
          <div className="grid grid-cols-3 gap-3">
            <NumField label="Quiz Week #" value={announceCtx.week} onChange={(v) => setAnnounceCtx({ ...announceCtx, week: v })} />
            <TextField label="Day" value={announceCtx.quizDay} onChange={(v) => setAnnounceCtx({ ...announceCtx, quizDay: v })} />
            <TextField label="Time" value={announceCtx.quizTime} onChange={(v) => setAnnounceCtx({ ...announceCtx, quizTime: v })} />
          </div>
        )}

        {contentType === "engagement_post" && (
          <>
            <TextField label="Topic" value={engagementCtx.topic} onChange={(v) => setEngagementCtx({ ...engagementCtx, topic: v })} placeholder="e.g., Prompt engineering vs fine-tuning" />
            <TextArea label="Angle / Hook" value={engagementCtx.angle} onChange={(v) => setEngagementCtx({ ...engagementCtx, angle: v })} rows={2} placeholder="What spicy take or question do you want to test?" />
          </>
        )}

        {contentType === "custom" && (
          <TextArea label="Brief *" value={customBrief} onChange={setCustomBrief} rows={5} placeholder="Tell Claude what kind of post you want..." />
        )}
      </div>

      {/* Platforms */}
      <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-5">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[#B8C5E0] mb-3">Platforms ({selectedPlatforms.size} selected)</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {PLATFORMS.map((p) => {
            const on = selectedPlatforms.has(p);
            return (
              <button
                key={p}
                onClick={() => togglePlatform(p)}
                className={`text-left p-3 rounded-xl border transition flex items-center gap-2 ${
                  on
                    ? "bg-white/5 border-white/30 text-white"
                    : "bg-[#0A0E27] border-white/10 text-[#6B7799] hover:border-white/20"
                }`}
                style={on ? { borderColor: PLATFORM_COLOR[p] } : undefined}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: PLATFORM_COLOR[p] }}
                />
                <span className="text-sm">{PLATFORM_LABEL[p]}</span>
                {on && <span className="ml-auto text-xs" style={{ color: PLATFORM_COLOR[p] }}>✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Schedule */}
      <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-5">
        <label className="text-[11px] font-bold uppercase tracking-widest text-[#B8C5E0] block mb-1.5">Schedule For</label>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className={inputCls + " [color-scheme:dark]"}
        />
      </div>

      {error && (
        <div className="bg-[#FF5C7C]/10 border border-[#FF5C7C]/30 rounded-xl p-3 text-[#FF5C7C] text-sm">
          {error}
        </div>
      )}

      <button
        onClick={handleGenerate}
        disabled={generating}
        className="w-full bg-gradient-to-r from-[#00D4FF] to-[#0099CC] text-[#0A0E27] font-bold py-4 rounded-xl shadow-[0_0_30px_rgba(0,212,255,0.3)] disabled:opacity-50 transition"
      >
        {generating ? "Generating with Claude..." : `⚡ Generate ${selectedPlatforms.size} Post${selectedPlatforms.size !== 1 ? "s" : ""}`}
      </button>
    </div>
  );

  function updateWinner(idx: number, patch: Partial<{ name: string; score: string; time: string }>) {
    setQuizCtx((q) => ({
      ...q,
      winners: q.winners.map((w, i) => (i === idx ? { ...w, ...patch } : w)),
    }));
  }
}

const inputCls =
  "w-full bg-[#0A0E27] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-[#4A5470] focus:outline-none focus:border-[#00D4FF]";

function TextField({ label, value, onChange, placeholder, cols }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; cols?: number;
}) {
  return (
    <div className={cols === 2 ? "col-span-2" : undefined}>
      <label className="text-[11px] font-bold uppercase tracking-widest text-[#B8C5E0] block mb-1.5">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputCls} />
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-[11px] font-bold uppercase tracking-widest text-[#B8C5E0] block mb-1.5">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
        className={inputCls}
      />
    </div>
  );
}

function TextArea({ label, value, onChange, rows = 3, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string;
}) {
  return (
    <div>
      <label className="text-[11px] font-bold uppercase tracking-widest text-[#B8C5E0] block mb-1.5">{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder} className={inputCls} />
    </div>
  );
}
