# AI Mock Interview Platform — Figma Design Specification
> Practice real interviews with an AI that listens, adapts, and gives you honest feedback — anytime, for free.

---

## 1. Past → Present → Future Analysis

### Past (2000–2015): The Static Prep Era

**How people prepared for interviews:**
- Cracking the Coding Interview (book) — memorize patterns, pray it comes up
- Mock interviews with friends — inconsistent, awkward, hard to schedule
- Glassdoor — read what others were asked, guess what you'd be asked
- YouTube walk-throughs — passive, no feedback loop
- Career centers at universities — 30-minute session, once a semester

**What was painful:**
- No real feedback — friends are too kind, too vague, or not qualified to evaluate
- Scheduling a mock interview required finding someone willing, free, and capable — rare
- No repetition — you couldn't practice the same question 10 times with variations
- No coverage — you didn't know what you didn't know
- Behavioral interviews were ignored until the night before
- System design prep was "watch a YouTube video and hope for the best"

---

### Present (2016–2025): The Platform Era

**What exists today:**
- LeetCode — dominates coding prep, gamified DSA, but no interview simulation
- Pramp — free peer-to-peer mock interviews, but depends on another human showing up
- interviewing.io — real engineers, but expensive and hard to access
- Big Interview — video-recorded answers, scripted questions, basic AI scoring
- ChatGPT (manual) — people prompt GPT to interview them, but it's clunky and inconsistent
- LinkedIn Interview Prep — generic, no personalisation, no real feedback

**What is still painful:**
- No platform combines: adaptive questioning + voice + real-time feedback + progress tracking
- Peer mocks (Pramp) are inconsistent — your partner may be worse than you
- Paid platforms (interviewing.io) are inaccessible at scale — $200–$300/session
- AI feedback is surface-level — "Great answer!" tells you nothing
- No platform personalises to your resume, target role, or target company
- Coding + behavioral + system design all require separate tools
- You can't practice at 2am when anxiety peaks before a big interview

**Who is winning at what:**
- LeetCode: best coding problem bank — but no interview simulation
- Pramp: best free mock experience — but limited by human availability
- interviewing.io: highest quality feedback — but priced out of reach
- Nobody has nailed: AI that truly simulates a real interview, adapts in real-time, and gives honest, specific, actionable feedback

---

### Future (2026+): The AI-Native Interview Coach Era

**What this product changes:**
- Available 24/7 — practice at midnight before your Google interview
- Fully adaptive — AI asks follow-up questions based on your actual answer, not a script
- Resume-aware — upload your CV, get questions about your specific experience
- Company-targeted — prep for Amazon (Leadership Principles), Google (Googleyness), Meta (Impact)
- Honest feedback — detailed breakdown: structure, specificity, impact quantification, communication
- Progress over time — your weak areas surface, your growth is visible
- Multi-modal — voice, text, or mixed — practice how you actually interview
- Full-loop simulation — coding + system design + behavioral in one continuous session

**Design principles:**
- **Low friction to start**: pick a role, start in 10 seconds — no signup wall
- **AI that actually listens**: follow-up questions prove the AI understood your answer
- **Honest, not kind**: feedback that makes you better, not comfortable
- **Progress is the product**: every session builds a picture of where you stand
- **Feels like a real interview**: the UI should create a calm, focused, professional atmosphere

---

## 2. Design System

### Color Palette
```
Background (light mode):        #F7F8FA
Surface / Cards:                #FFFFFF
Border:                         #E2E6ED
Text Primary:                   #0F172A
Text Secondary:                 #64748B
Text Muted:                     #94A3B8

Background (dark mode):         #0D0F14
Surface dark:                   #151820
Border dark:                    #1E2330

Accent Blue (primary actions):  #3B82F6
Accent Violet (AI elements):    #7C3AED
Accent Green (pass/strong):     #22C55E
Accent Amber (average/medium):  #F59E0B
Accent Red (weak/fail):         #EF4444
Accent Teal (coding):           #0EA5E9
Accent Grey (neutral/default):  #94A3B8

Score bands:
  Strong (80–100):   #22C55E
  Good   (60–79):    #3B82F6
  Fair   (40–59):    #F59E0B
  Weak   (0–39):     #EF4444

Interview types:
  Behavioral:        #7C3AED (violet)
  Coding:            #0EA5E9 (teal)
  System Design:     #F59E0B (amber)
  HR / Culture Fit:  #22C55E (green)
  Case Study:        #EC4899 (pink)
```

### Typography
```
Font Family:    Inter (UI + labels), JetBrains Mono (code blocks)
Heading XL:     36px / 700 — hero sections, page titles
Heading L:      28px / 600 — section headers, modal titles
Heading M:      20px / 600 — card titles, question text
Body L:         16px / 400 — answer input, transcript text
Body:           15px / 400 — descriptions, feedback body
Small:          13px / 400 — metadata, timestamps, scores
Label:          11px / 600 uppercase — section labels, badges
Code:           14px / 400 — JetBrains Mono, code editor
```

### Spacing
```
4px base unit
Card padding:           20px / 24px
List row height:        44px (compact) / 56px (comfortable)
Sidebar width:          240px (collapsed: 56px)
Right panel:            340px
Interview panel:        full-width centered, max 880px
Page max-width:         1440px
Modal max-width:        560px
```

---

## 3. Screen Specifications + Figma AI Prompts

---

### Screen 1: Landing / Home Dashboard

**What it is:** The user's personal home after login — a command center showing where they stand and what to do next.

**Layout:**
- Left sidebar: navigation
- Top: greeting + streak indicator
- AI Readiness Score card (prominent): overall score with breakdown ring chart
- Upcoming Interview countdown (if set)
- "Start Practice" CTA — prominent
- Recent sessions list
- Weak areas identified by AI

---

**FIGMA AI PROMPT — Home Dashboard:**
```
Design a clean, modern interview prep dashboard (light mode) called "Home".

Left sidebar (240px, white, subtle right border #E2E6ED):
- App logo top left: abstract microphone/AI mark + "InterviewAI" wordmark
- Navigation items with icons: Home (active), Practice, My Sessions, Progress, Question Bank, Settings
- Active item: blue filled pill background, white icon, blue label
- Bottom: user avatar, name "Priya Sharma", streak flame icon "12-day streak"

Main content area (#F7F8FA background):

Top row:
- "Good morning, Priya" in 28px bold, grey subtext: "Your Google SWE interview is in 6 days"
- Right: countdown card — "6 days" in large blue number, "until Google SWE L4" subtitle

AI Readiness Score card (full width, white, rounded 16px, subtle shadow):
- Left: Large donut ring chart, 72% filled in blue, "72" large in center, "Readiness Score" below
- Right: breakdown list:
  - Coding        ████░░ 68%   (teal)
  - System Design ███░░░ 55%   (amber)
  - Behavioral    █████░ 81%   (violet)
  - Communication █████░ 84%   (blue)
- Bottom: violet sparkle badge — "AI insight: Your system design is holding you back. 3 sessions recommended."

"Start Practice" section:
- Section title "Jump Back In"
- 4 quick-start cards in a row (white, rounded 12px, hover: blue border):
  - 🧠 Behavioral Interview — "30 min · STAR method"
  - 💻 Coding Interview — "45 min · DSA"
  - 🏗️ System Design — "60 min · Architecture"
  - 🎯 Full Loop — "90 min · All types"
- Each card: icon, title, duration, violet "AI Adaptive" chip

Recent Sessions (below):
- 3 session rows: date | interview type chip | role targeted | score badge | "Review" link
- Score badges: colored by score band (green/blue/amber/red)

Right column (340px):
- "Weak Areas" card: bulleted list of 4 topics with red/amber indicators
  - "Quantifying impact in STAR answers"
  - "Distributed systems — consistency models"
  - "Dynamic programming — tree problems"
  - "Asking clarifying questions in system design"
- Each: small topic label, AI suggestion link "Practice this →"

Style: Professional, focused, motivating. Not gamified/cartoon. Feels like a Bloomberg terminal for interview prep — serious but beautiful.
```

---

### Screen 2: Interview Setup

**What it replaces:** Picking questions manually, configuring ChatGPT prompts, choosing difficulty

**Layout:**
- Step 1: Choose interview type
- Step 2: Configure role, level, company
- Step 3: Choose duration + mode (voice / text / mixed)
- Step 4: Resume upload (optional)
- Start button

---

**FIGMA AI PROMPT — Interview Setup:**
```
Design a clean, multi-step interview configuration screen (light mode).

Centered layout, max-width 640px, white card on grey background.

Top: Breadcrumb stepper — Step 1 (filled blue circle "1") → Step 2 → Step 3 → Step 4
Current step label: "Choose interview type"

Step 1 content:

Large heading "What kind of interview?" (24px bold)
Subtext: "AI will adapt questions to match the real interview format for your role"

5 interview type cards in vertical list (white, rounded 12px, subtle border):
Each card (72px height): left colored icon block | type name (bold) + description | right: select circle

Cards:
- 🟣 Behavioral — "STAR-format, leadership, conflict, motivation"
- 🔵 Coding — "DSA, algorithms, problem-solving, live code"
- 🟡 System Design — "Architecture, scalability, tradeoffs, design"
- 🟢 HR / Culture Fit — "Values, career goals, culture alignment"
- 🩷 Case Study — "Business problems, estimation, product thinking"

"Behavioral" is selected — card has blue border, blue checkmark circle

"Next: Configure Role →" blue full-width button (52px)

---

Also design: Step 2 frame (show as second frame):
Heading: "Configure your interview"

3 dropdown fields:
- "Target Role" — dropdown showing: "Software Engineer"
- "Experience Level" — dropdown: "Mid-level (3–5 years)"
- "Target Company (optional)" — dropdown: "Google" with Google logo chip

Below dropdowns: Company-specific note box (light blue background):
"Google Behavioral focuses on Leadership Principles and Googleyness. AI will weight questions accordingly."

Resume upload zone:
- Dashed border box, cloud upload icon
- "Upload your resume for personalized questions (PDF, max 5MB)"
- Or: "Skip — use generic questions for my role"

Style: Clean wizard flow. Not overwhelming. Feels like setting up a Calendly meeting, not configuring a database.
```

---

### Screen 3: Live Interview — Behavioral Mode (Text)

**What it is:** The core product — the AI interviewer in action.

**Layout:**
- Top bar: interview type, timer, question counter, end interview button
- Left (60%): AI interviewer panel — avatar, question text, follow-up indicator
- Right (40%): Your answer — text area or voice waveform
- Bottom: action bar — submit answer, pass question, hint

---

**FIGMA AI PROMPT — Live Interview (Behavioral, Text Mode):**
```
Design a focused, distraction-free live interview screen (light mode).

Top bar (white, border bottom):
- Left: "Behavioral Interview" chip (violet) | "Google SWE L4" label
- Center: Timer "08:42" in monospace, amber color (running)
- Right: Question counter "Question 3 of 8" | "End Interview" red outline button

Main area — two-column layout:

Left panel (60%, white card, rounded 16px, shadow):
AI Interviewer section:
- AI avatar: abstract circular gradient face (violet/blue gradient orb, not cartoon)
- Name below: "InterviewAI" in small grey text
- Status indicator: green dot "Listening" or grey "Waiting for your answer"

Question display:
- Label above: "BEHAVIORAL · LEADERSHIP" in small caps, violet
- Question text (20px, semi-bold, dark):
  "Tell me about a time you had to make a difficult decision with incomplete information. What was the situation and how did you approach it?"

Below question:
- "Follow-up available" hint (subtle, grey): "AI will ask a follow-up based on your answer"
- Collapsible "Hint" section (collapsed by default):
  - "Structure your answer using STAR: Situation, Task, Action, Result"
  - 4 bullet points, one per STAR element

Previous question reference:
- Small "← Q2 (answered)" link in bottom-left corner

Right panel (40%, #F7F8FA background, rounded 16px):
- Label: "YOUR ANSWER" in small caps
- Large text area (white, rounded 12px, border): placeholder "Start typing your answer..."
- Word count: "0 / ~300 recommended" in small grey bottom-right
- STAR progress tracker below textarea:
  - 4 pills: S · T · A · R — each lights up as user types relevant content
  - Subtitle: "AI detects STAR structure as you write"

Bottom action bar (white, border top):
- Left: "Pass this question" ghost button
- Center: "Submit Answer" blue filled button (large, 52px)
- Right: "Recording off" microphone icon (toggle to voice mode)

Style: Focused, calm, professional. Like a Bloomberg terminal meets a meditation app. Nothing competes for attention except the question.
```

---

### Screen 4: Live Interview — Coding Mode

**What it is:** AI asks a coding question, user writes code in a live editor, AI evaluates logic + communication.

**Layout:**
- Top bar: problem title, timer, end interview
- Left (50%): Problem statement + AI follow-up chat
- Right (50%): Code editor (Monaco-style)
- Bottom: run code, submit, AI hint

---

**FIGMA AI PROMPT — Live Interview (Coding Mode):**
```
Design a coding interview screen split into problem statement and code editor (light mode).

Top bar (white, border bottom):
- Left: "Coding Interview" chip (teal) | "Medium Difficulty"
- Center: Timer "22:14" in monospace, teal
- Right: "Run Code" teal outline button | "Submit" blue filled button | "End" red outline button

Two-column layout (full height):

Left panel (50%, white):
- Problem header:
  - Title: "Two Sum" in 20px bold
  - Badges row: "Array" chip | "Hash Map" chip | "Medium" amber chip

- Problem statement (body text, 15px, readable line height):
  - Description paragraph
  - "Examples" section with formatted input/output blocks
  - "Constraints" section as bulleted list
  - Code-style examples in light grey boxes (monospace font)

- Below problem: AI Chat thread (subtle grey background section)
  - Label: "INTERVIEWER" in small violet caps
  - AI message bubble (violet left border): "Before you start coding, can you walk me through your initial approach?"
  - User message bubble (blue left border): "Sure — I'm thinking of using a hash map to store..."
  - AI follow-up: "Good. What's the time complexity of that approach?"
  - Input field at bottom: "Reply to interviewer..." with send icon

Right panel (50%, dark theme code editor):
- Editor toolbar: language selector "Python ▾" | "Reset" | line numbers toggle
- Code editor (dark background #1E2330, syntax highlighted):
  ```python
  def two_sum(nums, target):
      seen = {}
      for i, num in enumerate(nums):
          complement = target - num
          if complement in seen:
              return [seen[complement], i]
          seen[num] = i
      return []
  ```
- Gutter: line numbers in grey
- Bottom section: "Test Output" panel
  - Tabs: "Test Cases" (active) | "Console"
  - 3 test cases with pass/fail indicators
  - Test case 1: ✅ "Input: [2,7,11,15], 9 → Output: [0,1]"
  - Test case 2: ✅ "Input: [3,2,4], 6 → Output: [1,2]"
  - Test case 3: ⏳ Running...

Bottom bar:
- "AI Hint" ghost button (left)
- "Think out loud" toggle — when on, AI listens to narration

Style: VS Code meets Google interview. Clean, focused, no distractions. Dark editor on right, clean white on left.
```

---

### Screen 5: Post-Interview Feedback Report

**What it is:** The most important screen — detailed AI feedback after every session.

**Layout:**
- Header: session summary (type, role, date, overall score)
- Score breakdown: radar chart + dimension scores
- Question-by-question review
- Strengths and areas to improve
- Recommended next steps (AI-generated)

---

**FIGMA AI PROMPT — Feedback Report:**
```
Design a detailed post-interview feedback report page (light mode).

Top section (white card, full width):
- Left: "Session Complete" in 28px bold | Subtext: "Google SWE L4 · Behavioral · March 28, 2026"
- Centered: Large score badge (circular, 80px) — "74" in big blue number, "out of 100" below
- Score label: "Good — Above Average" in blue
- Right: Share button | "Practice Again" blue button

Score Breakdown (white card, full width):
- Heading: "Performance Breakdown"
- Left: Radar/spider chart with 5 axes:
  - Communication (82)
  - STAR Structure (71)
  - Impact & Results (63)
  - Depth of Answer (78)
  - Confidence (70)
- Right: 5 dimension rows with progress bars + score:
  - Communication     ████████░░ 82   (blue)
  - STAR Structure    ███████░░░ 71   (blue)
  - Impact & Results  ██████░░░░ 63   (amber — below average)
  - Depth of Answer   ███████░░░ 78   (blue)
  - Confidence        ███████░░░ 70   (blue)

AI Summary card (violet gradient border, rounded):
- Sparkle icon + "AI Analysis"
- Paragraph: "You communicated clearly and showed genuine leadership in Q2 and Q4. Your biggest opportunity: you rarely quantified business impact — answers like 'it improved performance' need a number. In Q3, your answer lacked a concrete Result. Fixing this alone could push your score to 85+."

Question-by-question review (accordion list, 8 items):
First item expanded:
- Q1 header: "Q1 — Tell me about a time you led a cross-functional project" | Score badge "82" green
- Your answer transcript (collapsed, expandable — shown open here):
  - Text block of user answer (3-4 lines)
- AI Feedback section (light violet background):
  - ✅ "Strong Situation setup — context was clear and concise"
  - ✅ "Task was well defined — your role was unambiguous"
  - ⚠️ "Action section was strong but lacked specifics on how you influenced stakeholders"
  - ❌ "Result: 'the project was successful' — quantify this. What was the impact? Revenue? Time saved?"
- "What a great answer looks like" — collapsible example (collapsed)

Second item collapsed:
- Q2 header row: "Q2 — Describe a time you disagreed with your manager" | Score "91" green badge
Third item:
- Q3 header row: "Q3 — Tell me about a time you failed" | Score "61" amber badge | small red indicator

Bottom: AI Recommendations (white card):
- Heading: "Your Next Steps"
- 3 recommended action cards (blue outline):
  - 🎯 "Practice quantifying results — 15 min drill" → Start
  - 📚 "Review: STAR method for failure questions" → Read
  - 🔁 "Retry: Behavioral interview, Google-style" → Start

Style: Feels like a coach wrote this, not an algorithm. Dense but organized. Every number has a reason. The user should leave knowing exactly what to fix.
```

---

### Screen 6: Progress Dashboard

**What it is:** A longitudinal view of improvement over time — weekly trends, score history, topic mastery.

**Layout:**
- Readiness score trend (line chart, last 30 days)
- Sessions heatmap (GitHub-style)
- Topic mastery grid
- Milestone badges earned
- Upcoming practice recommendations

---

**FIGMA AI PROMPT — Progress Dashboard:**
```
Design a clean, data-rich progress tracking page for an interview prep app (light mode).

Page title: "My Progress" (28px bold)
Subtitle: "Last 30 days · 18 sessions · +12 points overall"

Top row — 4 stat cards (white, rounded 12px, compact):
- "Overall Score" — 74 (↑12 from 62) in blue
- "Sessions Completed" — 18 this month
- "Best Category" — Behavioral 81
- "Current Streak" — 12 days 🔥

Score Trend chart (full width, white card):
- Title: "Readiness Score — Last 30 Days"
- Line chart: smooth curve, blue line, subtle blue fill below
- X-axis: dates (Mar 1 → Mar 28)
- Y-axis: score (0–100), grid lines at 25/50/75/100
- Annotations: small dot markers for each session
- Hoverable: tooltip showing session date, score, interview type
- Two sessions annotated: "System Design session" (dip) | "Coaching session" (spike)

Activity Heatmap (full width, white card):
- Title: "Practice Consistency"
- GitHub-style calendar grid: 7 rows (days) × 13 columns (weeks)
- Color scale: empty = light grey | 1 session = light blue | 2 = medium blue | 3+ = dark blue
- Legend: "Less" → 5 colored squares → "More"

Topic Mastery grid (white card):
- Title: "Topic Breakdown"
- 3-column grid of topic cards:
  Each card: topic name | category chip | mastery bar | sessions count
  Topics:
  - STAR Behavioral        Behavioral  ██████░░  6 sessions  78%
  - Leadership Principles  Behavioral  ████████  4 sessions  85%
  - Arrays & Strings       Coding      ████░░░░  5 sessions  61%
  - Dynamic Programming    Coding      ██░░░░░░  2 sessions  38% (red)
  - System Design Basics   Design      ███░░░░░  3 sessions  52%
  - API Design             Design      ████░░░░  2 sessions  60%

Milestone badges row (white card):
- Title: "Achievements"
- 6 badge icons in a row (circular, colored):
  - 🔥 "7-Day Streak" (earned, full color)
  - 🎯 "First Behavioral Ace" — 90+ score (earned)
  - 💻 "Code Warrior" — 10 coding sessions (earned)
  - ⭐ "System Thinker" — 5 design sessions (locked, grey)
  - 🏆 "Interview Ready" — 80+ overall (locked, grey)
  - 🎓 "Full Loop" — complete a full loop (locked, grey)

AI Insight card (violet gradient border):
- "Based on your progress, focus on Dynamic Programming (38%) and System Design (52%) this week. You're on track for 80+ before your Google interview."

Style: Clean analytics dashboard. Not gamified to a fault — feels like a serious tool, not Duolingo. Data should feel empowering.
```

---

### Screen 7: Question Bank

**What it is:** Browse, filter, and practice individual questions without starting a full interview.

**Layout:**
- Filters: type, role, company, difficulty, topic
- Question list with metadata
- Click to practice a single question
- "Add to practice set" to build a custom session

---

**FIGMA AI PROMPT — Question Bank:**
```
Design a searchable question bank page for an interview prep app (light mode).

Top bar:
- "Question Bank" title (28px bold)
- Search bar (full width, 44px): placeholder "Search questions, topics, or companies..."
- Right: "Create Practice Set" blue button

Filter row (below search):
- Filter chips, horizontally scrollable:
  - Type: All | Behavioral | Coding | System Design | HR | Case Study
  - Difficulty: Any | Easy | Medium | Hard
  - Company: Any | Google | Amazon | Meta | Apple | Microsoft
  - Role: Any | SWE | PM | Data | Design | EM
  - Topic: Arrays | STAR | Distributed Systems | Leadership | Dynamic Programming | ...
- Active filters shown as removable chips (blue "× Behavioral · Google · Medium")

Question count: "Showing 142 of 1,840 questions"

Question list (main area):

Each row (white card, rounded 12px, 76px height, subtle shadow):
- Left: checkbox (for adding to set)
- Type color block (12px wide, rounded): violet = behavioral, teal = coding, amber = design
- Question text (16px, semi-bold, 2-line truncation): "Tell me about a time you influenced without authority"
- Below text: tag chips — "Leadership" · "Behavioral" · "L4–L6" · "Google" · "Asked 2024"
- Right side:
  - Difficulty badge: "Medium" amber
  - Avg score badge: "68 avg" grey
  - "Practice" ghost button
  - "..." more menu

Show 8 question rows. Examples:

Row 1 (violet - Behavioral):
"Tell me about a time you influenced without authority"
Tags: Leadership · Behavioral · Google · Asked 2024
Difficulty: Medium | Avg: 68

Row 2 (teal - Coding):
"Given an array of integers, return indices of the two numbers that add up to a target"
Tags: Array · Hash Map · Easy · LeetCode #1
Difficulty: Easy | Avg: 81

Row 3 (amber - System Design):
"Design a URL shortening service like bit.ly"
Tags: System Design · Scalability · Common · All Levels
Difficulty: Medium | Avg: 61

Row 4 (violet - Behavioral):
"Describe a time you failed. What did you learn?"
Tags: Self-awareness · Behavioral · Amazon · LP: Learn and Be Curious
Difficulty: Hard | Avg: 59

Row 5 (teal - Coding):
"Implement LRU Cache"
Tags: Design · HashMap · LinkedList · Meta · Medium-Hard
Difficulty: Hard | Avg: 54

Pagination: "Load 25 more" | "Showing 8 of 142"

"Practice Set" sidebar (340px, visible when 1+ selected):
- "Selected (3)" header with clear button
- 3 selected questions listed
- "Start Custom Session" blue button
- Session config: Duration | Mode (voice/text)

Style: Dense but scannable. Like LeetCode meets Notion. Clean rows, useful metadata, fast to filter.
```

---

### Screen 8: AI Command Bar + AI Coach Chat

**What it is:** Universal action bar (⌘K) — search questions, start interviews, ask the AI coach anything.

**Layout (Command Bar):**
- Full overlay, dark backdrop
- Centered input, wide
- AI-powered suggestions below input
- Recent actions

**AI Coach Panel:**
- Persistent right sidebar or modal
- Chat with AI coach about prep strategy, weaknesses, advice

---

**FIGMA AI PROMPT — AI Command Bar + AI Coach:**
```
Design a command bar overlay and AI coach panel for an interview prep app.

Frame 1 — Command Bar (full screen overlay):

Dark semi-transparent overlay (#0D0F14 at 60% opacity) behind.

Center card (680px wide, white, 20px rounded corners, strong shadow):

Top input row (56px height, full width):
- Left: violet AI sparkle icon (gradient)
- Input placeholder: "Search questions, start interview, or ask anything..."
- Input focused, violet ring
- Right: "esc" grey label

Quick Actions row (input empty state):
- 4 action chips:
  - "▶ Start Behavioral Interview" (violet, filled)
  - "💻 Coding Session" (teal, filled)
  - "+ Practice this topic" (grey outline)
  - "📊 Show my progress" (grey outline)

Recent section (input empty):
- Label "RECENTLY PRACTICED" in small caps grey
- 4 rows: icon | question title | type chip | "Practice again" link
  - 🟣 "Tell me about a time you influenced without authority" · Behavioral
  - 🔵 "Two Sum" · Coding
  - 🟡 "Design Twitter's feed system" · System Design
  - 🟣 "Describe your greatest failure" · Behavioral

Typed state (show second overlay frame):
Input filled: "how do i answer failure questions"
Below: AI result (sparkle icon, violet):
"AI Answer: Structure failure questions using STAR — focus on what you learned and what you'd do differently. Avoid blaming others. Press Enter to get a full coaching response."

---

Frame 2 — AI Coach Panel (side panel, 400px, white, shadow):

Header:
- Violet sparkle icon + "AI Coach" label
- "Powered by Claude" small grey text
- X close

Chat area:
- AI message (grey background bubble):
  "Hi Priya! Based on your recent sessions, I'd focus on quantifying results in your STAR answers. Want me to run a short drill on that?"

- User message (blue background, right aligned):
  "Yes, and can you also help me prep for the Amazon LP questions?"

- AI message (grey bubble):
  "Absolutely. Amazon uses 16 Leadership Principles — your weakest based on past sessions are:
  · Dive Deep (asked in 80% of Amazon interviews)
  · Deliver Results (you tend to skip quantifying outcomes)

  Want to do a 15-minute targeted drill on these two, or should we do a full Amazon behavioral loop?"

- Action buttons below message:
  - "15-min targeted drill" (blue outline)
  - "Full Amazon behavioral loop" (blue outline)

Input at bottom:
- "Ask your AI coach..." text field with send icon
- Below: "Coach remembers your sessions and weak areas"

Style: Warm, personal, like a real coach — not a chatbot. Violet accents for AI elements. The coach knows your history.
```

---

### Screen 9: Settings + Profile

**What it is:** User profile, interview preferences, notification settings, account management.

**Layout:**
- Left: settings navigation
- Right: active settings panel

---

**FIGMA AI PROMPT — Settings Page:**
```
Design a settings page for an interview prep app (light mode).

Two-column layout:
Left sidebar (220px, #F7F8FA background, right border):
- Settings nav groups with section labels:
  ACCOUNT
  - Profile
  - Notifications
  INTERVIEW
  - Preferences (active — highlighted blue)
  - Resume
  - Target Companies
  INTEGRATIONS
  - Calendar
  - LinkedIn
  BILLING
  - Plan & Billing

Right content area (white):

Active section — "Interview Preferences":
- Section title: "Interview Preferences" (24px bold)
- Subtitle: "Customize how AI interviews you"

Setting rows (clean, each 64px height, border-bottom):
Row 1: "Default Interview Type"
  - Label + grey description: "What type of interview to start by default"
  - Dropdown: "Behavioral" (full width)

Row 2: "Experience Level"
  - Label + description
  - Dropdown: "Mid-level (3–5 years)"

Row 3: "Primary Target Role"
  - Dropdown: "Software Engineer"

Row 4: "Interview Language"
  - Dropdown: "English (US)"

Row 5: "Answer Mode"
  - 3-option toggle: [Text] [Voice] [Mixed] — "Voice" selected

Row 6: "AI Difficulty Adaptation"
  - Toggle switch (on — blue)
  - Description: "AI adjusts question difficulty based on your answers"

Row 7: "Show STAR Hints"
  - Toggle switch (on — blue)
  - Description: "Show STAR structure reminder during behavioral interviews"

Row 8: "Post-Interview Feedback Depth"
  - 3 options as radio cards: "Quick Summary" | "Detailed Report (recommended)" | "Expert Analysis"
  - "Detailed Report" selected (blue border)

Bottom: "Save Preferences" blue button

Style: Clean settings page. Not overwhelming. Linear/Notion-inspired. Feels like a professional tool.
```

---

## 4. Navigation Structure

```
Sidebar Navigation:
├── Home (personal dashboard + readiness score)
├── Practice
│   ├── Start Interview (quick start wizard)
│   ├── Full Loop (all interview types, 90 min)
│   └── Custom Session (build from question bank)
├── My Sessions
│   ├── Recent Sessions
│   └── Bookmarked Answers
├── Progress
│   ├── Score Trends
│   ├── Topic Mastery
│   └── Achievements
├── Question Bank
│   ├── Behavioral
│   ├── Coding
│   ├── System Design
│   ├── HR / Culture Fit
│   └── Case Study
├── AI Coach (persistent chat)
└── Settings
    ├── Profile
    ├── Interview Preferences
    ├── Resume
    ├── Target Companies
    ├── Integrations (Calendar, LinkedIn)
    └── Plan & Billing
```

---

## 5. Key Interaction Patterns

### Keyboard-First
```
⌘K          — Open AI command bar (search, start, ask)
⌘N          — Start new interview (from anywhere)
⌘⇧F         — Open feedback for last session
⌘⇧P         — Go to progress dashboard
⌘⇧Q         — Open question bank
Space       — Play/pause voice recording
Enter       — Submit answer (in interview)
Esc         — Pass question / exit command bar
⌘↵          — Submit and move to next question
```

### Interview Flow
- Choose type → configure role → start → AI asks question → user answers → AI asks follow-up → user answers → next question → end → instant feedback report
- No waiting — AI response is streamed in real-time
- Voice: automatic speech-to-text, AI listens for pauses to ask follow-ups

### AI Follow-Up Logic
- User answers → AI evaluates depth/specificity in real-time
- If answer is vague: "Can you be more specific about what you personally did?"
- If answer lacks result: "What was the outcome of that?"
- If answer is strong: natural pivot to next question
- Follow-up feels like a real interviewer — not a script

### Adaptive Difficulty
- Correct, specific, quantified answers → AI increases difficulty next question
- Weak, vague, short answers → AI asks a simpler follow-up first, then increases
- After session: AI calibrates your score based on answer quality vs question difficulty

---

## 6. What Changes from Existing Tools

| Pain Point Today | How This Solves It |
|---|---|
| Pramp requires scheduling another human | Available 24/7, start in 10 seconds |
| ChatGPT interviews are inconsistent | Structured session with session memory + consistent evaluation |
| Feedback is generic ("great job!") | Specific: "Your Result lacked quantification — add a number" |
| No voice interview simulation | Full voice mode with speech-to-text + AI response |
| Can't practice for specific companies | Company-targeted modes (Amazon LPs, Google Googleyness) |
| No longitudinal progress tracking | Readiness score improves over sessions, weak areas surfaced |
| Coding + behavioral require separate tools | All interview types in one platform |
| Resume-based questions not possible | Upload CV → AI generates personalized behavioral questions |
| No insight on what to fix | AI Coach tells you exactly: "Fix result quantification → +10 points" |
| Expensive human mock interviews | Free or low-cost, unlimited practice |

---

## 7. Onboarding Flow Specification

**Screen 1 — Welcome:**
- "Land your dream job with AI mock interviews"
- Single CTA: "Get Started Free" — no credit card
- Below: "Used by 50,000+ engineers preparing for FAANG"

**Screen 2 — Target:**
- "What are you preparing for?"
- 4 options as visual cards: Job Interview | Promotion / Internal | Career Change | Just Exploring
- Then: Target company input (optional) + Target role

**Screen 3 — Level:**
- "What's your experience level?"
- 4 options: Student / New Grad | Early Career (0–3 yrs) | Mid-level (3–7 yrs) | Senior+ (7+ yrs)

**Screen 4 — First Interview:**
- "Try your first 5-minute interview"
- Pre-selected: Behavioral, your role, medium difficulty
- "Start Sample Interview →" — jumps straight in, no more setup

---

**FIGMA AI PROMPT — Onboarding Welcome:**
```
Design a clean, motivating onboarding welcome screen for an AI interview prep app (light mode).

Centered layout, max 580px, white card on very light grey background.

Top: App logo — abstract microphone + AI spark mark, "InterviewAI" wordmark

Hero section:
- Big heading (36px bold, dark): "Ace your next interview"
- Subheading (18px, grey): "Practice with an AI that adapts, listens, and tells you exactly what to fix"
- 3 trust points in a row (icon + text, small):
  - ⚡ "Ready in 10 seconds"
  - 🎯 "Honest AI feedback"
  - 📈 "Track your progress"

Primary CTA: "Start Practicing Free" — large blue button, 56px height, full width, rounded 12px
Below: "No credit card required · Takes 30 seconds to set up"

Social proof strip (grey background, full width):
- "Trusted by engineers at" + 5 company logos: Google · Meta · Amazon · Microsoft · Stripe

Separator line then secondary: "Already have an account? Sign in →"

Background: clean white card floats on #F7F8FA. Hero might have subtle gradient top section (very light violet to white).

Style: Consumer app energy. Not corporate. Not Duolingo-childish. The design of Superhuman meets Linear — premium, focused, fast.
```

---

## 8. Monetization Screens

### Upgrade / Pricing Page

**FIGMA AI PROMPT — Pricing Page:**
```
Design a clean pricing page for an interview prep SaaS app (light mode).

Page heading: "Simple, honest pricing" (32px bold, centered)
Subtext: "Start free. Upgrade when you're ready to go deep."

3 pricing cards in a row (white, rounded 16px, subtle shadow):

Card 1 — Free:
- Plan name: "Free" (grey)
- Price: "$0 / month"
- Description: "Perfect for getting started"
- Feature list (checkmarks):
  ✅ 3 practice sessions / month
  ✅ Behavioral interviews
  ✅ Basic feedback report
  ✅ Question bank (100 questions)
  ❌ Voice mode
  ❌ Coding interviews
  ❌ System design
  ❌ Company-specific modes
  ❌ AI Coach
- CTA: "Get Started" grey outline button

Card 2 — Pro (highlighted, most popular):
- "Most Popular" badge (blue chip, top of card)
- Plan name: "Pro" (blue)
- Price: "$19 / month" (strikethrough $29, sale badge)
- Description: "For serious candidates"
- Feature list:
  ✅ Unlimited sessions
  ✅ All interview types
  ✅ Voice + Text mode
  ✅ Full question bank (1,800+)
  ✅ Detailed AI feedback
  ✅ Progress tracking
  ✅ Company-specific modes
  ✅ AI Coach (unlimited)
  ✅ Resume-based questions
- CTA: "Start Free Trial" blue filled button (larger)
- Subtle blue shadow/glow on card

Card 3 — Teams:
- Plan name: "Teams" (grey)
- Price: "$49 / month per seat" (billed annually)
- Description: "For bootcamps and hiring orgs"
- Feature list:
  ✅ Everything in Pro
  ✅ Admin dashboard
  ✅ Cohort progress tracking
  ✅ Custom question sets
  ✅ Bulk invites
  ✅ White-label option
- CTA: "Contact Sales" grey outline button

Below cards: FAQ accordion (3 items, collapsed)
- "Can I cancel anytime?" | "What AI model powers the interviews?" | "Is my data private?"

Style: Stripe-inspired pricing page. Clean, trustworthy, no tricks. The Pro card should feel like the obvious choice.
```

---

## 9. Tech Stack

### Frontend
| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js + TypeScript | SSR for SEO on landing pages, fast SPA for app |
| Styling | Tailwind CSS | Rapid UI, consistent design tokens |
| Code Editor | Monaco Editor | VS Code in the browser for coding interviews |
| Rich Text | TipTap | For AI coach formatting and feedback rendering |
| Voice / STT | Deepgram API | Real-time, low-latency speech to text |
| Text to Speech | ElevenLabs / Web Speech API | AI interviewer voice |
| State | Zustand | Simple, no boilerplate |
| Charts | Recharts | Progress charts, radar charts, heatmaps |
| Animation | Framer Motion | Smooth transitions, interview mode focus animations |

### Backend
| Layer | Choice | Why |
|---|---|---|
| Primary API | Node.js + NestJS | Fast dev velocity, TypeScript-native |
| AI Engine | Python + FastAPI | Claude API for question generation, evaluation, coaching |
| Real-time | WebSockets (Socket.io) | Live interview session state, voice streaming |
| Background Jobs | BullMQ + Redis | Feedback generation, report processing, digest emails |
| Auth | Clerk | Multi-tenant, social login, org management |
| File Storage | AWS S3 | Resume uploads, session recordings |

### AI Layer
| Feature | Model / Tool | Why |
|---|---|---|
| Question Generation | claude-sonnet-4-6 | Role-aware, company-specific question creation |
| Answer Evaluation | claude-opus-4-6 | Deep evaluation of STAR structure, depth, quality |
| AI Coach | claude-sonnet-4-6 | Conversational coaching with session memory |
| Follow-up Generation | claude-sonnet-4-6 | Real-time adaptive follow-up questions |
| Coding Evaluation | claude-opus-4-6 | Code review, time complexity analysis |
| Resume Parsing | claude-haiku-4-5 | Fast extraction of experience for personalized questions |

### Database
| Layer | Choice | Why |
|---|---|---|
| Primary (users, sessions, feedback) | PostgreSQL | Structured data, ACID compliance |
| Session Transcripts | PostgreSQL (JSONB) | Flexible transcript storage |
| Caching + Session State | Redis | Fast session lookups, WebSocket state |
| Search (questions) | Typesense | Instant question bank search, faceted filtering |
| Embeddings (similarity) | pgvector | Find similar past questions and answers |

---

## 10. Product Names (Shortlist)

| Name | Why |
|---|---|
| **PrepAI** | Direct, clear, findable — does exactly what it says |
| **Candidly** | Honest feedback, "be candid" — personality-forward |
| **Intervu** | Clean stylization of "interview" — memorable domain potential |
| **Ace** | Simple, aspirational, positive outcome |
| **Vetted** | You get vetted — or you vet yourself |
| **Calibrate** | Calibrate your answers, calibrate your readiness |
| **Coachly** | AI as a coach, personal and ongoing |
| **Rehearse** | Practice-first positioning — do it again until it's right |

---

*Spec Version 1.0 — Generated 2026-03-28*
