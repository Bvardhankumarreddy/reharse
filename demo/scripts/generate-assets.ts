import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const OUTPUT_DIR = path.resolve('./demo-output/assets');

// ─── HTML Templates ──────────────────────────────────────────────────────────

const THUMBNAIL_HTML = /* html */`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1280px; height: 720px; overflow: hidden;
    font-family: 'Inter', sans-serif;
    background: #0A0F1E;
  }

  /* ── Background grid ── */
  .grid-bg {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(59,130,246,0.07) 1px, transparent 1px),
      linear-gradient(90deg, rgba(59,130,246,0.07) 1px, transparent 1px);
    background-size: 60px 60px;
  }

  /* ── Gradient blobs ── */
  .blob-blue {
    position: absolute; width: 600px; height: 600px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(59,130,246,0.25) 0%, transparent 70%);
    top: -150px; right: -80px;
  }
  .blob-violet {
    position: absolute; width: 500px; height: 500px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(124,58,237,0.20) 0%, transparent 70%);
    bottom: -100px; left: 200px;
  }

  /* ── Content layout ── */
  .content {
    position: relative; z-index: 10;
    display: flex; align-items: center;
    height: 100%; padding: 0 80px;
    gap: 60px;
  }

  /* ── Left: text ── */
  .left { flex: 1; display: flex; flex-direction: column; gap: 20px; }

  .badge {
    display: inline-flex; align-items: center; gap: 8px;
    background: rgba(59,130,246,0.15);
    border: 1px solid rgba(59,130,246,0.35);
    border-radius: 100px; padding: 6px 16px;
    width: fit-content;
  }
  .badge-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: #3B82F6;
    box-shadow: 0 0 8px #3B82F6;
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.4; }
  }
  .badge-text { font-size: 13px; font-weight: 600; color: #60A5FA; letter-spacing: 0.04em; }

  .headline {
    font-size: 72px; font-weight: 900; line-height: 1.0;
    color: #F1F5F9;
    letter-spacing: -2px;
  }
  .headline .accent {
    background: linear-gradient(135deg, #3B82F6, #7C3AED);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }

  .sub {
    font-size: 22px; font-weight: 500; color: #94A3B8;
    line-height: 1.5; max-width: 460px;
  }

  /* ── Pills ── */
  .pills { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 4px; }
  .pill {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 8px; padding: 6px 14px;
    font-size: 14px; font-weight: 600; color: #CBD5E1;
  }

  /* ── Right: mock UI card ── */
  .right { width: 420px; flex-shrink: 0; }

  .card {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.10);
    border-radius: 20px; padding: 28px;
    backdrop-filter: blur(20px);
    box-shadow: 0 24px 64px rgba(0,0,0,0.4);
  }
  .card-header {
    display: flex; align-items: center; gap: 10px; margin-bottom: 20px;
  }
  .card-icon {
    width: 36px; height: 36px; border-radius: 10px;
    background: linear-gradient(135deg, #3B82F6, #7C3AED);
    display: flex; align-items: center; justify-content: center;
    font-size: 18px;
  }
  .card-title { font-size: 15px; font-weight: 700; color: #F1F5F9; }
  .card-sub   { font-size: 12px; color: #64748B; margin-top: 2px; }

  .score-row {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 16px;
  }
  .score-label { font-size: 13px; color: #94A3B8; font-weight: 500; }
  .score-value { font-size: 32px; font-weight: 900; color: #F1F5F9; }
  .score-value span { font-size: 16px; color: #64748B; font-weight: 400; }

  .bar-row { margin-bottom: 12px; }
  .bar-label {
    display: flex; justify-content: space-between;
    font-size: 12px; color: #94A3B8; margin-bottom: 5px;
  }
  .bar-track {
    height: 6px; border-radius: 3px;
    background: rgba(255,255,255,0.07);
    overflow: hidden;
  }
  .bar-fill { height: 100%; border-radius: 3px; }

  .divider { height: 1px; background: rgba(255,255,255,0.07); margin: 16px 0; }

  .ai-bubble {
    background: rgba(59,130,246,0.10);
    border: 1px solid rgba(59,130,246,0.20);
    border-radius: 12px; padding: 12px 14px;
  }
  .ai-q { font-size: 12px; color: #64748B; margin-bottom: 4px; font-weight: 600; }
  .ai-text { font-size: 13px; color: #CBD5E1; line-height: 1.5; }

  /* ── Logo watermark ── */
  .logo {
    position: absolute; bottom: 32px; left: 80px; z-index: 20;
    display: flex; align-items: center; gap: 10px;
  }
  .logo-icon {
    width: 32px; height: 32px; border-radius: 9px;
    background: linear-gradient(135deg, #3B82F6, #7C3AED);
    display: flex; align-items: center; justify-content: center;
    font-size: 16px;
  }
  .logo-name { font-size: 15px; font-weight: 700; color: #64748B; }
</style>
</head>
<body>
  <div class="grid-bg"></div>
  <div class="blob-blue"></div>
  <div class="blob-violet"></div>

  <div class="content">
    <div class="left">
      <div class="badge">
        <div class="badge-dot"></div>
        <span class="badge-text">AI MOCK INTERVIEW COACH</span>
      </div>

      <div class="headline">
        Ace Your Next<br/><span class="accent">Interview</span><br/>with AI
      </div>

      <div class="sub">
        Adaptive questions. Honest feedback.<br/>The full interview loop — free to start.
      </div>

      <div class="pills">
        <div class="pill">🎯 Behavioral</div>
        <div class="pill">💻 Coding</div>
        <div class="pill">🏗️ System Design</div>
        <div class="pill">📊 AI Feedback</div>
      </div>
    </div>

    <div class="right">
      <div class="card">
        <div class="card-header">
          <div class="card-icon">🎙️</div>
          <div>
            <div class="card-title">AI Readiness Score</div>
            <div class="card-sub">Updated after every session</div>
          </div>
        </div>

        <div class="score-row">
          <span class="score-label">Overall</span>
          <span class="score-value">78<span>/100</span></span>
        </div>

        ${[
          { label: 'Communication', pct: 85, color: '#3B82F6' },
          { label: 'Structure',     pct: 72, color: '#7C3AED' },
          { label: 'Depth',         pct: 68, color: '#0EA5E9' },
          { label: 'Examples',      pct: 80, color: '#22C55E' },
          { label: 'Confidence',    pct: 74, color: '#F59E0B' },
        ].map(({ label, pct, color }) => `
          <div class="bar-row">
            <div class="bar-label"><span>${label}</span><span>${pct}%</span></div>
            <div class="bar-track">
              <div class="bar-fill" style="width:${pct}%;background:${color};"></div>
            </div>
          </div>
        `).join('')}

        <div class="divider"></div>

        <div class="ai-bubble">
          <div class="ai-q">🤖 AI Question</div>
          <div class="ai-text">Tell me about a time you led a project without formal authority. What was your approach?</div>
        </div>
      </div>
    </div>
  </div>

  <div class="logo">
    <div class="logo-icon">🎙️</div>
    <span class="logo-name">app.rehearse.ai</span>
  </div>
</body>
</html>`;

// ─────────────────────────────────────────────────────────────────────────────

const BANNER_HTML = /* html */`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 2560px; height: 1440px; overflow: hidden;
    font-family: 'Inter', sans-serif;
    background: #0A0F1E;
  }

  .grid-bg {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(59,130,246,0.06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(59,130,246,0.06) 1px, transparent 1px);
    background-size: 80px 80px;
  }
  .blob-left {
    position: absolute;
    width: 900px; height: 900px; border-radius: 50%;
    background: radial-gradient(circle, rgba(59,130,246,0.18) 0%, transparent 70%);
    top: -200px; left: -100px;
  }
  .blob-right {
    position: absolute;
    width: 900px; height: 900px; border-radius: 50%;
    background: radial-gradient(circle, rgba(124,58,237,0.18) 0%, transparent 70%);
    bottom: -200px; right: -100px;
  }

  /* Safe zone: YouTube shows 1546×423px centred — everything critical lives here */
  .safe-zone {
    position: absolute;
    left: 507px; top: 508px;
    width: 1546px; height: 423px;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 24px;
  }

  .badge {
    display: inline-flex; align-items: center; gap: 10px;
    background: rgba(59,130,246,0.15);
    border: 1px solid rgba(59,130,246,0.35);
    border-radius: 100px; padding: 8px 24px;
  }
  .badge-dot {
    width: 10px; height: 10px; border-radius: 50%;
    background: #3B82F6; box-shadow: 0 0 10px #3B82F6;
  }
  .badge-text { font-size: 18px; font-weight: 700; color: #60A5FA; letter-spacing: 0.06em; }

  .headline {
    font-size: 96px; font-weight: 900; line-height: 1.0;
    color: #F1F5F9; text-align: center; letter-spacing: -3px;
  }
  .headline .accent {
    background: linear-gradient(135deg, #3B82F6, #7C3AED);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }

  .sub {
    font-size: 30px; font-weight: 500; color: #94A3B8;
    text-align: center; line-height: 1.5;
  }

  .pills {
    display: flex; gap: 16px; flex-wrap: wrap; justify-content: center;
  }
  .pill {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 12px; padding: 10px 22px;
    font-size: 20px; font-weight: 600; color: #CBD5E1;
  }

  /* ── Corner decorations visible on wider displays ── */
  .corner-card {
    position: absolute;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 20px; padding: 28px;
    backdrop-filter: blur(10px);
  }
  .corner-card.top-left  { top: 120px; left: 100px; width: 320px; }
  .corner-card.top-right { top: 120px; right: 100px; width: 320px; }
  .corner-card.bot-left  { bottom: 120px; left: 100px; width: 320px; }
  .corner-card.bot-right { bottom: 120px; right: 100px; width: 320px; }

  .mini-title { font-size: 13px; font-weight: 700; color: #64748B; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.06em; }
  .mini-score { font-size: 48px; font-weight: 900; color: #F1F5F9; line-height: 1; }
  .mini-sub   { font-size: 13px; color: #64748B; margin-top: 4px; }
  .mini-bar-track { height: 6px; border-radius: 3px; background: rgba(255,255,255,0.07); margin-top: 10px; overflow: hidden; }
  .mini-bar-fill  { height: 100%; border-radius: 3px; }

  .mini-item { margin-bottom: 10px; }
  .mini-item-row { display: flex; justify-content: space-between; font-size: 13px; color: #94A3B8; margin-bottom: 4px; }

  /* URL at bottom */
  .url {
    position: absolute; bottom: 60px;
    left: 50%; transform: translateX(-50%);
    font-size: 22px; font-weight: 600; color: #334155;
    letter-spacing: 0.02em;
  }
</style>
</head>
<body>
  <div class="grid-bg"></div>
  <div class="blob-left"></div>
  <div class="blob-right"></div>

  <!-- Corner cards — visible on wide displays -->
  <div class="corner-card top-left">
    <div class="mini-title">Readiness Score</div>
    <div class="mini-score">78<span style="font-size:20px;color:#64748B">/100</span></div>
    <div class="mini-sub">↑ +12 this week</div>
    <div class="mini-bar-track"><div class="mini-bar-fill" style="width:78%;background:linear-gradient(90deg,#3B82F6,#7C3AED);"></div></div>
  </div>

  <div class="corner-card top-right">
    <div class="mini-title">AI Feedback</div>
    ${[
      { label: 'Communication', pct: 85, color: '#3B82F6' },
      { label: 'Structure',     pct: 72, color: '#7C3AED' },
      { label: 'Depth',         pct: 68, color: '#0EA5E9' },
    ].map(({ label, pct, color }) => `
      <div class="mini-item">
        <div class="mini-item-row"><span>${label}</span><span>${pct}%</span></div>
        <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${pct}%;background:${color};"></div></div>
      </div>
    `).join('')}
  </div>

  <div class="corner-card bot-left">
    <div class="mini-title">🎯 Interview Types</div>
    ${['Behavioral', 'Coding', 'System Design', 'HR', 'Case Study'].map(t =>
      `<div style="font-size:14px;color:#94A3B8;margin-bottom:6px;">✓ ${t}</div>`
    ).join('')}
  </div>

  <div class="corner-card bot-right">
    <div class="mini-title">📚 Question Bank</div>
    <div class="mini-score" style="font-size:36px;">1,800+</div>
    <div class="mini-sub">Questions · All types</div>
    <div style="margin-top:12px;">
      ${['Google', 'Amazon', 'Meta', 'Stripe'].map(c =>
        `<span style="font-size:12px;color:#64748B;margin-right:8px;font-weight:700;">${c}</span>`
      ).join('')}
    </div>
  </div>

  <!-- Safe zone content -->
  <div class="safe-zone">
    <div class="badge">
      <div class="badge-dot"></div>
      <span class="badge-text">AI MOCK INTERVIEW COACH</span>
    </div>

    <div class="headline">
      <span class="accent">Rehearse</span> — Ace Every Interview
    </div>

    <div class="sub">
      Adaptive AI questions · Honest feedback · Free to start
    </div>

    <div class="pills">
      <div class="pill">🎯 Behavioral</div>
      <div class="pill">💻 Coding</div>
      <div class="pill">🏗️ System Design</div>
      <div class="pill">📊 Progress Tracking</div>
      <div class="pill">⭐ STAR Builder</div>
    </div>
  </div>

  <div class="url">app.rehearse.ai</div>
</body>
</html>`;

// ─── Render ───────────────────────────────────────────────────────────────────

async function generateAssets() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('🎨 Generating YouTube assets...\n');

  const browser = await chromium.launch({ headless: true });

  // ── Thumbnail 1280×720 ──────────────────────────────────────────────────
  process.stdout.write('  ⏳ Thumbnail (1280×720)... ');
  {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.setContent(THUMBNAIL_HTML, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500); // let fonts render
    const thumbPath = path.join(OUTPUT_DIR, 'thumbnail.png');
    await page.screenshot({ path: thumbPath, type: 'png' });
    await page.close();
    console.log(`✅  → ${thumbPath}`);
  }

  // ── Channel Banner 2560×1440 ────────────────────────────────────────────
  process.stdout.write('  ⏳ Channel banner (2560×1440)... ');
  {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 2560, height: 1440 });
    await page.setContent(BANNER_HTML, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const bannerPath = path.join(OUTPUT_DIR, 'channel-banner.png');
    await page.screenshot({ path: bannerPath, type: 'png' });
    await page.close();
    console.log(`✅  → ${bannerPath}`);
  }

  await browser.close();

  console.log('\n✅ Done! Assets saved to demo-output/assets/');
  console.log('\n📐 Upload guide:');
  console.log('   thumbnail.png      → YouTube video thumbnail  (1280×720)');
  console.log('   channel-banner.png → YouTube channel art       (2560×1440)');
  console.log('\n💡 YouTube safe zone: 1546×423px centred in the banner.');
  console.log('   All key text is within that zone — safe on TV, desktop, and mobile.');
}

generateAssets().catch((e) => { console.error(e); process.exit(1); });
