"use client";

// Admin-only social media post generator for AetherStackAI lessons + quiz winners.
// Auth is handled by the existing /admin layout (which checks Better Auth session).

import { useState, useMemo } from "react";

// ── Constants ──────────────────────────────────────────────────────────────────
const LINKS = {
  youtube:   "youtube.com/@aetherstackai",
  instagram: "instagram.com/aetherstackai",
  linkedin:  "linkedin.com/company/115524370",
  whatsapp:  "whatsapp.com/channel/0029Vb7dRgq1dAwCydDr651d",
  quiz:      "reharse.inferix.in/quiz",
  rehearse:  "reharse.inferix.in",
};

const PLATFORM_COLORS = {
  whatsapp:  "#25D366",
  instagram: "#E4405F",
  linkedin:  "#0A66C2",
};

interface LessonData {
  week: string;
  lessonNum: number | string;
  title: string;
  hook: string;
  youtubeLink: string;
  nextLessonTitle: string;
  nextLessonDay: string;
  insight: string;
  duration: string;
}

interface Winner {
  name: string;
  score: string;
  time: string;
}

interface QuizData {
  week: string;
  totalParticipants: string;
  youtubeLink: string;
  nextQuizDay: string;
  winners: Winner[];
}

// ── Generators ────────────────────────────────────────────────────────────────

function generateLessonPosts(data: LessonData): Record<string, string> {
  const { week, lessonNum, title, hook, youtubeLink, nextLessonTitle, nextLessonDay, insight, duration } = data;
  const posts: Record<string, string> = {};

  posts.whatsappLesson1 = `🎓 LESSON ${lessonNum} LIVE

${title}

${hook}

Watch → ${youtubeLink || "[YouTube link]"}

📸 ${LINKS.instagram}
💬 ${LINKS.whatsapp}`.trim();

  posts.whatsappLesson2 = `🎓 Week ${week} · Lesson ${lessonNum}

${title}

${duration}-min beginner-friendly breakdown
No jargon. No math. Just clarity.

Watch → ${youtubeLink || "[YouTube link]"}

🏆 Quiz this Saturday → ${LINKS.quiz}`.trim();

  posts.whatsappLesson3 = `📺 NEW on @AetherStackAI

${title}

${hook}

${youtubeLink || "[YouTube link]"}

${nextLessonTitle ? `📅 ${nextLessonDay || "Thursday"}: ${nextLessonTitle}` : ""}
🏆 Saturday: Cash-prize quiz`.trim();

  posts.instagramFeed = `🎓 LESSON ${lessonNum} — LIVE NOW

${title}

${hook}

Full ${duration || "7"}-min breakdown on @aetherstackai 📺

🔗 Link in bio

📅 This week:
✅ Lesson ${lessonNum} — Today ✓
${nextLessonTitle ? `📚 Lesson ${Number(lessonNum) + 1} — ${nextLessonDay || "Thursday"}: ${nextLessonTitle}` : ""}
🏆 Quiz — Saturday (top 3 win prizes!)

💬 Join WhatsApp: link in bio

#AI #AetherStackAI #LearnAI #LearnInPublic #AIForBeginners #ArtificialIntelligence #IndianYoutuber #TechIndia #AIEducation #BuildInPublic`.trim();

  posts.instagramStory = `FRAME 1:
🎓 NEW LESSON LIVE
${title}
(Swipe 👉)

FRAME 2:
${hook}
@aetherstackai on YouTube

FRAME 3:
📅 This week:
✅ Lesson ${lessonNum} — Today
${nextLessonTitle ? `📚 Lesson ${Number(lessonNum) + 1} — ${nextLessonDay || "Thu"}` : ""}
🏆 Quiz — Saturday

FRAME 4 (CTA):
Watch → @aetherstackai
🏆 Quiz → ${LINKS.quiz}
[Add link sticker]`.trim();

  posts.linkedinPage = `🎓 AetherStackAI Lesson ${lessonNum} is LIVE.

"${title}"

${hook}

🎥 Watch: ${youtubeLink || "[YouTube link]"}

📅 This week:
✅ Lesson ${lessonNum} — Today ✓
${nextLessonTitle ? `📚 Lesson ${Number(lessonNum) + 1} — ${nextLessonDay || "Thursday"}: ${nextLessonTitle}` : ""}
🏆 Quiz — Saturday — Top 3 win prizes

What did you think? Comment below 👇

📺 ${LINKS.youtube}
📸 ${LINKS.instagram}
💬 ${LINKS.whatsapp}

#AI #AetherStackAI #LearnInPublic #AIEducation`.trim();

  posts.linkedinPersonal = `Lesson ${lessonNum} just dropped on AetherStackAI.

${title}

${hook}

${insight || "This is one of those topics most people get wrong. The video breaks it down simply."}

🎥 ${youtubeLink || "[YouTube link]"}

${nextLessonTitle ? `📅 ${nextLessonDay || "Thursday"}: ${nextLessonTitle}` : ""}
🏆 Saturday quiz with cash prizes

📺 ${LINKS.youtube}
📸 ${LINKS.instagram}
💬 ${LINKS.whatsapp}

#BuildInPublic #LearnInPublic #AIEducation #AetherStackAI`.trim();

  return posts;
}

function generateQuizWinnerPosts(data: QuizData): Record<string, string> {
  const { week, winners, totalParticipants, youtubeLink, nextQuizDay } = data;
  const posts: Record<string, string> = {};
  const w1 = winners[0] ?? { name: "", score: "", time: "" };
  const w2 = winners[1] ?? { name: "", score: "", time: "" };
  const w3 = winners[2] ?? { name: "", score: "", time: "" };
  const nextWeek = (parseInt(week, 10) || 0) + 1;

  posts.whatsappWinners1 = `🏆 QUIZ #${week} WINNERS

🥇 ${w1.name || "—"} — ${w1.score || "—"} · ${w1.time || "—"}
🥈 ${w2.name || "—"} — ${w2.score || "—"} · ${w2.time || "—"}
🥉 ${w3.name || "—"} — ${w3.score || "—"} · ${w3.time || "—"}

${totalParticipants ? `${totalParticipants} participants` : ""} 🔥
Prizes delivered ✅

Quiz #${nextWeek} → ${nextQuizDay || "Saturday"} 🎯
@AetherStackAI`.trim();

  posts.whatsappWinners2 = `⏱️ QUIZ #${week} — CLOSEST FINISH

🥇 ${w1.name?.split(" ")[0] || "—"} — ${w1.score || "—"} in ${w1.time || "—"}
🥈 ${w2.name?.split(" ")[0] || "—"} — ${w2.score || "—"} in ${w2.time || "—"}

Prizes delivered ✅

Think you're faster?
Quiz #${nextWeek} → ${nextQuizDay || "Saturday"} 🎯
${LINKS.quiz}`.trim();

  posts.whatsappWinners3 = `📊 QUIZ #${week} STATS

✅ ${totalParticipants || "—"} participants
✅ Prizes delivered ✅
✅ Fastest: ${w1.time || "—"}

Beat ${w1.score || "9/9"} in ${w1.time || "56s"}?
Quiz #${nextWeek} → ${nextQuizDay || "Saturday"} 🎯
${LINKS.quiz}`.trim();

  posts.instagramWinners = `🏆 AETHERSTACKAI QUIZ #${week} — RESULTS

${totalParticipants || "—"} participants. 5 random AI questions.

🥇 ${w1.name || "—"}
   Score: ${w1.score || "—"} · Time: ${w1.time || "—"}

🥈 ${w2.name || "—"}
   Score: ${w2.score || "—"} · Time: ${w2.time || "—"}

🥉 ${w3.name || "—"}
   Score: ${w3.score || "—"} · Time: ${w3.time || "—"}

Prizes delivered ✅

📅 Quiz #${nextWeek} → ${nextQuizDay || "Saturday"}
Same format. New questions. Top 3 win again.

🔗 Link in bio → ${LINKS.quiz}

#AIQuiz #AetherStackAI #LearnAI #LearnInPublic #AIEducation #IndianYoutuber #TechIndia`.trim();

  posts.instagramStoryWinners = `FRAME 1:
🏆 QUIZ #${week} RESULTS
${totalParticipants || "—"} players. 5 questions.

FRAME 2:
🥇 ${w1.name || "—"}
   ${w1.score || "—"} · ${w1.time || "—"}
🥈 ${w2.name || "—"}
   ${w2.score || "—"} · ${w2.time || "—"}
🥉 ${w3.name || "—"}
   ${w3.score || "—"} · ${w3.time || "—"}
[Tag winners]

FRAME 3:
Prizes delivered ✅
Congratulations! 🎉

FRAME 4 (CTA):
Quiz #${nextWeek} → ${nextQuizDay || "Saturday"}
Subscribe @aetherstackai
[Link sticker → ${LINKS.quiz}]`.trim();

  posts.linkedinPageWinners = `🏆 AetherStackAI Quiz #${week} — Winners

${totalParticipants || "—"} viewers competed. Here are the results:

🥇 ${w1.name || "—"} — ${w1.score || "—"} in ${w1.time || "—"}
🥈 ${w2.name || "—"} — ${w2.score || "—"} in ${w2.time || "—"}
🥉 ${w3.name || "—"} — ${w3.score || "—"} in ${w3.time || "—"}

Prizes delivered ✅

Quiz #${nextWeek} → ${nextQuizDay || "Saturday"}
🎯 ${LINKS.quiz}

${youtubeLink ? `Latest lesson: ${youtubeLink}` : ""}

📺 ${LINKS.youtube}
📸 ${LINKS.instagram}
💬 ${LINKS.whatsapp}

#AIQuiz #LearnInPublic #AetherStackAI`.trim();

  posts.linkedinPersonalWinners = `Quiz #${week} at AetherStackAI — done.

${totalParticipants || "—"} people took the quiz. Top 3 won prizes.

🥇 ${w1.name || "—"} — ${w1.score || "—"} in ${w1.time || "—"}
🥈 ${w2.name || "—"} — ${w2.score || "—"} in ${w2.time || "—"}
🥉 ${w3.name || "—"} — ${w3.score || "—"} in ${w3.time || "—"}

Prizes delivered ✅

Why run a quiz on a YouTube channel?

Most educational content gets watched passively. Forgotten in 24 hours. The quiz forces active engagement — and the results prove it works.

Quiz #${nextWeek} drops ${nextQuizDay || "Saturday"}. Anyone can play.

📺 ${LINKS.youtube}
📸 ${LINKS.instagram}
💬 ${LINKS.whatsapp}

#BuildInPublic #LearnInPublic #AIEducation #AetherStackAI`.trim();

  return posts;
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback for non-secure contexts
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <button
      onClick={copy}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
        copied
          ? "bg-[#00F5A0]/20 border-[#00F5A0]/40 text-[#00F5A0]"
          : "bg-[#00D4FF]/15 border-[#00D4FF]/30 text-[#00D4FF] hover:bg-[#00D4FF]/25"
      }`}
    >
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

function PostCard({
  title,
  platform,
  content,
}: {
  title: string;
  platform: "whatsapp" | "instagram" | "linkedin";
  content: string;
}) {
  const accent = PLATFORM_COLORS[platform];
  const charCount = content.length;
  const lineCount = content.split("\n").length;

  // WhatsApp warning thresholds (per spec)
  const showWarning = platform === "whatsapp" && (charCount > 700 || lineCount > 10);

  return (
    <div className="bg-[#151B3D] border border-white/10 rounded-2xl overflow-hidden">
      <div
        className="px-4 py-3 flex items-center justify-between border-b"
        style={{ borderColor: `${accent}30`, backgroundColor: `${accent}10` }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: accent }}
          />
          <span className="text-white text-sm font-semibold">{title}</span>
        </div>
        <CopyButton text={content} />
      </div>
      <pre className="px-4 py-3 text-[13px] text-[#B8C5E0] whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
        {content}
      </pre>
      <div className="px-4 py-2 border-t border-white/5 flex items-center justify-between text-[11px] text-[#6B7799]">
        <span>{charCount} chars · {lineCount} lines</span>
        {showWarning && (
          <span className="text-[#FF5C7C] font-medium">
            ⚠ Long for WhatsApp ({charCount > 700 ? `${charCount} chars` : `${lineCount} lines`})
          </span>
        )}
      </div>
    </div>
  );
}

function WinnerInput({
  index,
  winner,
  onChange,
}: {
  index: number;
  winner: Winner;
  onChange: (w: Winner) => void;
}) {
  const medal = ["🥇", "🥈", "🥉"][index] ?? "🏅";
  return (
    <div className="bg-[#0A0E27] border border-white/10 rounded-xl p-3">
      <div className="text-[11px] font-bold uppercase tracking-widest text-[#B8C5E0] mb-2">
        {medal} Position {index + 1}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input
          value={winner.name}
          onChange={(e) => onChange({ ...winner, name: e.target.value })}
          placeholder="Name"
          className="bg-[#151B3D] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-[#4A5470] focus:outline-none focus:border-[#00D4FF]"
        />
        <input
          value={winner.score}
          onChange={(e) => onChange({ ...winner, score: e.target.value })}
          placeholder="Score (e.g. 9/9)"
          className="bg-[#151B3D] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-[#4A5470] focus:outline-none focus:border-[#00D4FF]"
        />
        <input
          value={winner.time}
          onChange={(e) => onChange({ ...winner, time: e.target.value })}
          placeholder="Time (e.g. 56s)"
          className="bg-[#151B3D] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-[#4A5470] focus:outline-none focus:border-[#00D4FF]"
        />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PostGeneratorPage() {
  const [tab, setTab] = useState<"lesson" | "winners">("lesson");

  // Lesson form state
  const [lesson, setLesson] = useState<LessonData>({
    week: "1",
    lessonNum: 1,
    title: "",
    hook: "",
    youtubeLink: "",
    nextLessonTitle: "",
    nextLessonDay: "Thursday",
    insight: "",
    duration: "7",
  });
  const [lessonGenerated, setLessonGenerated] = useState<Record<string, string> | null>(null);

  // Quiz form state
  const [quiz, setQuiz] = useState<QuizData>({
    week: "1",
    totalParticipants: "",
    youtubeLink: "",
    nextQuizDay: "Saturday",
    winners: [
      { name: "", score: "", time: "" },
      { name: "", score: "", time: "" },
      { name: "", score: "", time: "" },
    ],
  });
  const [quizGenerated, setQuizGenerated] = useState<Record<string, string> | null>(null);

  const lessonValid = useMemo(() => lesson.title.trim().length > 0 && String(lesson.lessonNum).trim().length > 0, [lesson]);
  const quizValid = useMemo(
    () => quiz.week.trim().length > 0 && quiz.winners[0].name.trim().length > 0,
    [quiz],
  );

  function generateLesson() {
    setLessonGenerated(generateLessonPosts(lesson));
  }

  function generateQuiz() {
    setQuizGenerated(generateQuizWinnerPosts(quiz));
  }

  function updateWinner(idx: number, w: Winner) {
    setQuiz((q) => ({
      ...q,
      winners: q.winners.map((existing, i) => (i === idx ? w : existing)),
    }));
  }

  return (
    <div className="-m-6 min-h-[calc(100vh-3.5rem)] bg-[#0A0E27] p-6 text-white">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">📲 Post Generator</h1>
        <p className="text-[#B8C5E0] text-sm mt-1">
          Generate ready-to-copy posts for WhatsApp Status, Instagram, and LinkedIn — for AetherStackAI lessons and quiz winners.
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-[#151B3D] border border-white/10 rounded-xl w-fit mb-6">
        {(["lesson", "winners"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
              tab === t
                ? "bg-[#00D4FF] text-[#0A0E27]"
                : "text-[#B8C5E0] hover:text-white"
            }`}
          >
            {t === "lesson" ? "📚 Lesson Posts" : "🏆 Quiz Winners"}
          </button>
        ))}
      </div>

      {tab === "lesson" && (
        <div className="space-y-6">
          {/* Lesson form */}
          <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-5 space-y-4">
            <h2 className="text-white font-bold flex items-center gap-2">
              <span className="text-[#FFD700]">📚</span> Lesson Details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest text-[#B8C5E0] block mb-1.5">Week #</label>
                <input
                  value={lesson.week}
                  onChange={(e) => setLesson({ ...lesson, week: e.target.value })}
                  className="w-full bg-[#0A0E27] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00D4FF]"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest text-[#B8C5E0] block mb-1.5">Lesson #</label>
                <input
                  value={lesson.lessonNum}
                  onChange={(e) => setLesson({ ...lesson, lessonNum: e.target.value })}
                  className="w-full bg-[#0A0E27] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00D4FF]"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest text-[#B8C5E0] block mb-1.5">Duration (min)</label>
                <input
                  value={lesson.duration}
                  onChange={(e) => setLesson({ ...lesson, duration: e.target.value })}
                  className="w-full bg-[#0A0E27] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00D4FF]"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-[#B8C5E0] block mb-1.5">Lesson Title *</label>
              <input
                value={lesson.title}
                onChange={(e) => setLesson({ ...lesson, title: e.target.value })}
                placeholder="e.g., What is Machine Learning, really?"
                className="w-full bg-[#0A0E27] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-[#4A5470] focus:outline-none focus:border-[#00D4FF]"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-[#B8C5E0] block mb-1.5">Hook (1-2 sentences)</label>
              <textarea
                rows={2}
                value={lesson.hook}
                onChange={(e) => setLesson({ ...lesson, hook: e.target.value })}
                placeholder="A teaser that makes people want to watch."
                className="w-full bg-[#0A0E27] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-[#4A5470] focus:outline-none focus:border-[#00D4FF]"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-[#B8C5E0] block mb-1.5">YouTube Link</label>
              <input
                value={lesson.youtubeLink}
                onChange={(e) => setLesson({ ...lesson, youtubeLink: e.target.value })}
                placeholder="https://youtube.com/watch?v=..."
                className="w-full bg-[#0A0E27] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-[#4A5470] focus:outline-none focus:border-[#00D4FF]"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="text-[11px] font-bold uppercase tracking-widest text-[#B8C5E0] block mb-1.5">Next Lesson Title</label>
                <input
                  value={lesson.nextLessonTitle}
                  onChange={(e) => setLesson({ ...lesson, nextLessonTitle: e.target.value })}
                  placeholder="Optional — what's coming next"
                  className="w-full bg-[#0A0E27] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-[#4A5470] focus:outline-none focus:border-[#00D4FF]"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest text-[#B8C5E0] block mb-1.5">Next Lesson Day</label>
                <input
                  value={lesson.nextLessonDay}
                  onChange={(e) => setLesson({ ...lesson, nextLessonDay: e.target.value })}
                  className="w-full bg-[#0A0E27] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00D4FF]"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-[#B8C5E0] block mb-1.5">Personal Insight (LinkedIn personal post)</label>
              <textarea
                rows={2}
                value={lesson.insight}
                onChange={(e) => setLesson({ ...lesson, insight: e.target.value })}
                placeholder="Optional — your personal take. Defaults to a generic line."
                className="w-full bg-[#0A0E27] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-[#4A5470] focus:outline-none focus:border-[#00D4FF]"
              />
            </div>
            <button
              onClick={generateLesson}
              disabled={!lessonValid}
              className="w-full sm:w-auto bg-gradient-to-r from-[#00D4FF] to-[#0099CC] text-[#0A0E27] font-bold px-6 py-3 rounded-xl shadow-[0_0_30px_rgba(0,212,255,0.3)] disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              ⚡ Generate Lesson Posts
            </button>
          </div>

          {/* Lesson posts output */}
          {lessonGenerated && (
            <div className="space-y-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[#FFD700]">📋 Generated Posts</div>

              <h3 className="text-white font-semibold mt-4">WhatsApp Status (3 variants)</h3>
              <PostCard title="WhatsApp · Variant 1 — Hook" platform="whatsapp" content={lessonGenerated.whatsappLesson1} />
              <PostCard title="WhatsApp · Variant 2 — Educational" platform="whatsapp" content={lessonGenerated.whatsappLesson2} />
              <PostCard title="WhatsApp · Variant 3 — Schedule" platform="whatsapp" content={lessonGenerated.whatsappLesson3} />

              <h3 className="text-white font-semibold mt-6">Instagram</h3>
              <PostCard title="Instagram · Feed Caption" platform="instagram" content={lessonGenerated.instagramFeed} />
              <PostCard title="Instagram · Story (4 frames)" platform="instagram" content={lessonGenerated.instagramStory} />

              <h3 className="text-white font-semibold mt-6">LinkedIn</h3>
              <PostCard title="LinkedIn · Page (AetherStackAI)" platform="linkedin" content={lessonGenerated.linkedinPage} />
              <PostCard title="LinkedIn · Personal Profile" platform="linkedin" content={lessonGenerated.linkedinPersonal} />
            </div>
          )}
        </div>
      )}

      {tab === "winners" && (
        <div className="space-y-6">
          {/* Quiz form */}
          <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-5 space-y-4">
            <h2 className="text-white font-bold flex items-center gap-2">
              <span className="text-[#FFD700]">🏆</span> Quiz Winners
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest text-[#B8C5E0] block mb-1.5">Quiz Week #</label>
                <input
                  value={quiz.week}
                  onChange={(e) => setQuiz({ ...quiz, week: e.target.value })}
                  className="w-full bg-[#0A0E27] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00D4FF]"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest text-[#B8C5E0] block mb-1.5">Total Participants</label>
                <input
                  value={quiz.totalParticipants}
                  onChange={(e) => setQuiz({ ...quiz, totalParticipants: e.target.value })}
                  placeholder="e.g., 47"
                  className="w-full bg-[#0A0E27] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-[#4A5470] focus:outline-none focus:border-[#00D4FF]"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest text-[#B8C5E0] block mb-1.5">Next Quiz Day</label>
                <input
                  value={quiz.nextQuizDay}
                  onChange={(e) => setQuiz({ ...quiz, nextQuizDay: e.target.value })}
                  className="w-full bg-[#0A0E27] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00D4FF]"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-[#B8C5E0] block mb-1.5">YouTube Link (latest lesson — optional)</label>
              <input
                value={quiz.youtubeLink}
                onChange={(e) => setQuiz({ ...quiz, youtubeLink: e.target.value })}
                placeholder="https://youtube.com/watch?v=..."
                className="w-full bg-[#0A0E27] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-[#4A5470] focus:outline-none focus:border-[#00D4FF]"
              />
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[#B8C5E0]">Top 3 Winners *</div>
              {quiz.winners.map((w, i) => (
                <WinnerInput key={i} index={i} winner={w} onChange={(nw) => updateWinner(i, nw)} />
              ))}
            </div>

            <button
              onClick={generateQuiz}
              disabled={!quizValid}
              className="w-full sm:w-auto bg-gradient-to-r from-[#FFD700] to-[#FFA500] text-[#0A0E27] font-bold px-6 py-3 rounded-xl shadow-[0_0_30px_rgba(255,215,0,0.3)] disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              ⚡ Generate Winner Posts
            </button>
          </div>

          {/* Quiz posts output */}
          {quizGenerated && (
            <div className="space-y-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[#FFD700]">📋 Generated Posts</div>

              <h3 className="text-white font-semibold mt-4">WhatsApp Status (3 variants)</h3>
              <PostCard title="WhatsApp · Winners Announcement" platform="whatsapp" content={quizGenerated.whatsappWinners1} />
              <PostCard title="WhatsApp · Speed Story" platform="whatsapp" content={quizGenerated.whatsappWinners2} />
              <PostCard title="WhatsApp · Stats + Challenge" platform="whatsapp" content={quizGenerated.whatsappWinners3} />

              <h3 className="text-white font-semibold mt-6">Instagram</h3>
              <PostCard title="Instagram · Feed Caption" platform="instagram" content={quizGenerated.instagramWinners} />
              <PostCard title="Instagram · Story (4 frames)" platform="instagram" content={quizGenerated.instagramStoryWinners} />

              <h3 className="text-white font-semibold mt-6">LinkedIn</h3>
              <PostCard title="LinkedIn · Page (AetherStackAI)" platform="linkedin" content={quizGenerated.linkedinPageWinners} />
              <PostCard title="LinkedIn · Personal Profile" platform="linkedin" content={quizGenerated.linkedinPersonalWinners} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
