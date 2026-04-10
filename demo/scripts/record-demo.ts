import { chromium, Browser, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import { config as loadEnv } from 'dotenv';

// Load .env from the demo/ directory
loadEnv({ path: path.resolve(__dirname, '../.env') });

// ─── Config ────────────────────────────────────────────────────────────────
const CONFIG = {
  baseUrl:   process.env.APP_URL || 'https://app.rehearse.ai',
  authFile:  path.resolve(__dirname, '../auth-state.json'),
  outputDir: path.resolve('./demo-output'),
  viewport:  { width: 1440, height: 900 },
  slowMo:    80,
  pauseShort:  1500,
  pauseMedium: 2500,
  pauseLong:   4000,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

async function goto(page: Page, path: string) {
  await page.goto(`${CONFIG.baseUrl}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(CONFIG.pauseShort);
}

async function showTitleCard(page: Page, title: string, subtitle: string = '') {
  await page.evaluate(({ title, subtitle }: { title: string; subtitle: string }) => {
    const existing = document.getElementById('demo-title-card');
    if (existing) existing.remove();
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn  { from { opacity:0; transform:translateX(-50%) translateY(10px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
      @keyframes fadeOut { from { opacity:1; } to { opacity:0; } }
    `;
    document.head.appendChild(style);
    const card = document.createElement('div');
    card.id = 'demo-title-card';
    card.style.cssText = `
      position:fixed; bottom:40px; left:50%; transform:translateX(-50%);
      background:rgba(10,20,35,0.93); border:1px solid rgba(14,165,233,0.5);
      border-radius:12px; padding:16px 28px; z-index:99999; text-align:center;
      backdrop-filter:blur(8px); box-shadow:0 8px 32px rgba(0,0,0,0.4); animation:fadeIn 0.4s ease;
    `;
    card.innerHTML = `
      <div style="color:#E8F4FD;font-size:15px;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${title}</div>
      ${subtitle ? `<div style="color:#64A8C8;font-size:12px;margin-top:4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${subtitle}</div>` : ''}
    `;
    document.body.appendChild(card);
  }, { title, subtitle } as { title: string; subtitle: string });
  await page.waitForTimeout(400);
}

async function hideTitleCard(page: Page) {
  await page.evaluate(() => {
    const card = document.getElementById('demo-title-card');
    if (card) { card.style.animation = 'fadeOut 0.3s ease forwards'; setTimeout(() => card.remove(), 300); }
  });
  await page.waitForTimeout(400);
}

// ─── Timing tracker ─────────────────────────────────────────────────────────
// Records the wall-clock offset (ms from recording start) of every scene.
// sync-audio.ts reads this to place each voiceover clip at the exact moment
// its scene appears in the video.
const sceneTimings: { scene: string; startMs: number }[] = [];
let recordingStart = 0;

function markScene(scene: string) {
  sceneTimings.push({ scene, startMs: Date.now() - recordingStart });
  console.log(`📍 ${scene} @ ${((Date.now() - recordingStart) / 1000).toFixed(1)}s`);
}

// ─── Main Demo Script ────────────────────────────────────────────────────────
async function recordDemo() {
  if (!fs.existsSync(CONFIG.outputDir)) fs.mkdirSync(CONFIG.outputDir, { recursive: true });

  console.log('🎬 Starting Rehearse demo recording...');
  console.log(`📁 Output: ${CONFIG.outputDir}`);

  const browser: Browser = await chromium.launch({
    headless: false,
    slowMo: CONFIG.slowMo,
    args: ['--start-maximized'],
  });

  if (!fs.existsSync(CONFIG.authFile)) {
    console.error('❌ Auth state not found. Run "npm run save-auth" first to log in and save your session.');
    process.exit(1);
  }

  const context: BrowserContext = await browser.newContext({
    viewport: CONFIG.viewport,
    recordVideo: { dir: CONFIG.outputDir, size: CONFIG.viewport },
    deviceScaleFactor: 2,
    // Load full auth state (cookies + localStorage) so all API calls are authenticated
    storageState: CONFIG.authFile,
  });

  const page: Page = await context.newPage();
  recordingStart = Date.now();

  try {

    // ──────────────────────────────────────────────────────────────
    // SCENE 1: Pricing page — no auth needed, sets context
    // ──────────────────────────────────────────────────────────────
    markScene('01_pricing');

    await goto(page, '/pricing');
    await showTitleCard(page, '🎙️ Rehearse', 'AI-powered mock interview coaching — free to start');
    await page.waitForTimeout(CONFIG.pauseLong);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(CONFIG.pauseMedium);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(CONFIG.pauseShort);
    await hideTitleCard(page);

    // ──────────────────────────────────────────────────────────────
    // SCENE 2: Sign In — mock overlay (never navigate to /sign-in to
    // avoid Clerk token rotation invalidating the session mid-recording)
    // ──────────────────────────────────────────────────────────────
    markScene('02_signin');

    // Inject a pixel-perfect mock of the Clerk sign-in form as an overlay.
    // Auth state is never disturbed — all subsequent API calls stay authenticated.
    await page.evaluate(() => {
      const overlay = document.createElement('div');
      overlay.id = 'demo-signin-overlay';
      overlay.style.cssText = `
        position:fixed;inset:0;z-index:999999;
        background:#F9FAFB;display:flex;align-items:center;justify-content:center;
      `;
      overlay.innerHTML = `
        <div style="width:400px;background:#fff;border:1px solid #E5E7EB;border-radius:16px;padding:40px;box-shadow:0 4px 24px rgba(0,0,0,0.08);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          <div style="text-align:center;margin-bottom:28px;">
            <div style="display:inline-flex;align-items:center;gap:8px;margin-bottom:16px;">
              <div style="width:32px;height:32px;background:linear-gradient(135deg,#3B82F6,#6366F1);border-radius:8px;"></div>
              <span style="font-size:18px;font-weight:700;color:#111827;">Rehearse</span>
            </div>
            <h2 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 6px;">Sign in</h2>
            <p style="font-size:14px;color:#6B7280;margin:0;">to continue to Rehearse</p>
          </div>
          <div style="margin-bottom:16px;">
            <label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;">Email address</label>
            <input id="demo-email-input" type="email" placeholder="alex@example.com"
              style="width:100%;box-sizing:border-box;height:42px;padding:0 14px;border:1.5px solid #D1D5DB;border-radius:8px;font-size:14px;color:#111827;outline:none;"/>
          </div>
          <button style="width:100%;height:42px;background:linear-gradient(135deg,#3B82F6,#6366F1);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
            Continue
          </button>
          <div style="margin-top:20px;text-align:center;">
            <span style="font-size:13px;color:#6B7280;">Don't have an account? </span>
            <span style="font-size:13px;color:#3B82F6;font-weight:500;">Sign up</span>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    });
    await page.waitForTimeout(CONFIG.pauseMedium);

    // Type a demo email into the mock input
    await page.locator('#demo-email-input').fill('alex@example.com');
    await page.waitForTimeout(CONFIG.pauseMedium);

    // Fade the overlay out
    await page.evaluate(() => {
      const el = document.getElementById('demo-signin-overlay');
      if (el) { el.style.transition = 'opacity 0.4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }
    });
    await page.waitForTimeout(600);

    // ──────────────────────────────────────────────────────────────
    // SCENE 3: Dashboard
    // ──────────────────────────────────────────────────────────────
    markScene('03_dashboard');

    await goto(page, '/');
    await showTitleCard(page, '🏠 Your Dashboard', 'Readiness score, streak, and weak areas — at a glance');
    await page.waitForTimeout(CONFIG.pauseLong);
    await page.mouse.wheel(0, 350);
    await page.waitForTimeout(CONFIG.pauseMedium);
    await page.mouse.wheel(0, -350);
    await page.waitForTimeout(CONFIG.pauseShort);
    await hideTitleCard(page);

    // ──────────────────────────────────────────────────────────────
    // SCENE 4: Practice / Interview Setup
    // ──────────────────────────────────────────────────────────────
    markScene('04_setup');

    await goto(page, '/practice');
    await showTitleCard(page, '🎯 Choose Your Interview', 'Behavioral, Coding, System Design, HR, Case Study');
    await page.waitForTimeout(CONFIG.pauseLong);
    await hideTitleCard(page);

    await goto(page, '/interview/setup');
    await showTitleCard(page, '⚙️ Configure Your Session', 'Role, company, experience level, duration — all customisable');
    await page.waitForTimeout(CONFIG.pauseMedium);

    // Fill target role
    const roleInput = page.locator('input[placeholder*="role" i], input[name*="role" i]').first();
    if (await roleInput.isVisible().catch(() => false)) {
      await roleInput.click();
      await roleInput.fill('Software Engineer');
      await page.waitForTimeout(400);
    }

    // Fill target company
    const companyInput = page.locator('input[placeholder*="company" i], input[name*="company" i]').first();
    if (await companyInput.isVisible().catch(() => false)) {
      await companyInput.click();
      await companyInput.fill('Google');
      await page.waitForTimeout(400);
    }

    await page.waitForTimeout(CONFIG.pauseMedium);
    await hideTitleCard(page);

    await showTitleCard(page, '⚡ Starting session...', 'AI generates your first question in real time');
    // Click Start Session button
    const startBtn = page.locator('button', { hasText: /start/i }).first();
    if (await startBtn.isVisible().catch(() => false)) {
      await startBtn.hover();
      await page.waitForTimeout(300);
      await startBtn.click();
      await page.waitForTimeout(CONFIG.pauseLong);
    }
    await hideTitleCard(page);

    // ──────────────────────────────────────────────────────────────
    // SCENE 5: Live Interview Session
    // ──────────────────────────────────────────────────────────────
    markScene('05_session');

    // Wait for session page
    await page.waitForURL(url => url.toString().includes('/interview/session'), { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(CONFIG.pauseShort);

    await showTitleCard(page, '🤖 AI Interview in Progress', 'Questions adapt to your answers in real time');
    await page.waitForTimeout(CONFIG.pauseLong);

    // Wait for question to appear (AI typing → question text)
    const questionText = page.locator('[data-testid="question-text"], .question-text, h2, h3').first();
    await questionText.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(CONFIG.pauseMedium);
    await hideTitleCard(page);

    // Type a sample answer
    const answerInput = page.locator('textarea, [contenteditable="true"]').first();
    if (await answerInput.isVisible().catch(() => false)) {
      await answerInput.click();
      await page.waitForTimeout(500);
      await answerInput.pressSequentially(
        'In my last role I led a backend migration from a monolithic service to microservices. ' +
        'I aligned three teams without direct authority by running weekly syncs and building shared dashboards. ' +
        'The migration shipped on time and reduced p99 latency by 40 percent.',
        { delay: 40 },
      );
      await page.waitForTimeout(CONFIG.pauseMedium);

      await showTitleCard(page, '📝 Submitting answer...', 'Next question adapts based on what you just said');
      // Submit answer
      const submitAnswer = page.locator('button', { hasText: /submit|next/i }).first();
      if (await submitAnswer.isVisible().catch(() => false)) {
        await submitAnswer.click();
        await page.waitForTimeout(CONFIG.pauseLong);
      }
      await hideTitleCard(page);
    }

    await showTitleCard(page, '🔄 Adaptive follow-up question', 'Probes exactly where your answer was vague');
    await page.waitForTimeout(CONFIG.pauseLong);
    await hideTitleCard(page);

    // End session
    const endBtn = page.locator('button', { hasText: /end session|finish/i }).first();
    if (await endBtn.isVisible().catch(() => false)) {
      await showTitleCard(page, '🏁 Ending session...', 'AI evaluates your full performance');
      await endBtn.click();
      await page.waitForTimeout(CONFIG.pauseMedium);
      await hideTitleCard(page);
    }

    // ──────────────────────────────────────────────────────────────
    // SCENE 6: Feedback Report
    // ──────────────────────────────────────────────────────────────
    markScene('06_feedback');

    await goto(page, '/sessions');
    await showTitleCard(page, '📊 Your Session History', 'Every session saved with full transcript and scores');
    await page.waitForTimeout(CONFIG.pauseMedium);

    // Click the first/latest session
    const firstSession = page.locator('a[href*="/sessions/"]').first();
    if (await firstSession.isVisible().catch(() => false)) {
      await firstSession.hover();
      await page.waitForTimeout(300);
      await firstSession.click();
      await page.waitForTimeout(CONFIG.pauseLong);

      await showTitleCard(page, '🎯 AI Feedback Report', 'Overall score + 5 dimensions — Communication, Structure, Depth, Examples, Confidence');
      await page.waitForTimeout(CONFIG.pauseLong);
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(CONFIG.pauseMedium);

      await hideTitleCard(page);
      await showTitleCard(page, '📝 Per-question breakdown', 'Strengths, improvements, and a model answer for every question');
      await page.waitForTimeout(CONFIG.pauseLong);
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(CONFIG.pauseMedium);

      await hideTitleCard(page);
      await showTitleCard(page, '🔮 Weak areas & next steps', 'AI tells you exactly what to practice next');
      await page.waitForTimeout(CONFIG.pauseLong);
      await page.mouse.wheel(0, -1000);
      await page.waitForTimeout(CONFIG.pauseShort);
      await hideTitleCard(page);
    }

    // ──────────────────────────────────────────────────────────────
    // SCENE 7: Progress
    // ──────────────────────────────────────────────────────────────
    markScene('07_progress');

    await goto(page, '/progress');
    await showTitleCard(page, '📈 Your Progress', 'AI Readiness Score and score trend across all sessions');
    await page.waitForTimeout(CONFIG.pauseLong);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(CONFIG.pauseMedium);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(CONFIG.pauseShort);
    await hideTitleCard(page);

    // ──────────────────────────────────────────────────────────────
    // SCENE 8: Tools — STAR Builder
    // ──────────────────────────────────────────────────────────────
    markScene('08_star_builder');

    await goto(page, '/tools/star-builder');
    await showTitleCard(page, '⭐ STAR Answer Builder', 'Turn rough notes into a polished, structured interview answer');
    await page.waitForTimeout(CONFIG.pauseMedium);

    const starTextarea = page.locator('textarea').first();
    if (await starTextarea.isVisible().catch(() => false)) {
      await starTextarea.click();
      await starTextarea.pressSequentially(
        'Led migration project, worked with 3 teams, no authority, shipped on time',
        { delay: 50 },
      );
      await page.waitForTimeout(CONFIG.pauseShort);

      const generateBtn = page.locator('button', { hasText: /generate|build/i }).first();
      if (await generateBtn.isVisible().catch(() => false)) {
        await showTitleCard(page, '✨ Generating STAR answer...', 'AI structures your answer using the STAR framework');
        await generateBtn.click();
        await page.waitForTimeout(CONFIG.pauseLong + 1000);
        await hideTitleCard(page);
      }
    }
    await hideTitleCard(page);

    // ──────────────────────────────────────────────────────────────
    // SCENE 9: Tools — JD Match
    // ──────────────────────────────────────────────────────────────
    markScene('09_jd_match');

    await goto(page, '/tools/jd-match');
    await showTitleCard(page, '🔍 JD Match', 'Paste a job description — see how well your profile fits');
    await page.waitForTimeout(CONFIG.pauseMedium);

    const jdTextarea = page.locator('textarea').first();
    if (await jdTextarea.isVisible().catch(() => false)) {
      await jdTextarea.click();
      await jdTextarea.pressSequentially(
        'We are looking for a Senior Software Engineer with strong experience in distributed systems, ' +
        'Go or Java backend development, and a track record of leading cross-functional projects.',
        { delay: 20 },
      );
      await page.waitForTimeout(CONFIG.pauseShort);

      const analyzeBtn = page.locator('button', { hasText: /analyse|analyze|match/i }).first();
      if (await analyzeBtn.isVisible().catch(() => false)) {
        await showTitleCard(page, '🤖 Analysing match...', 'Match score, missing keywords, and what to prepare for');
        await analyzeBtn.click();
        await page.waitForTimeout(CONFIG.pauseLong + 5000);
        await hideTitleCard(page);
      }
    }

    await page.waitForTimeout(CONFIG.pauseLong);
    await hideTitleCard(page);

    // ──────────────────────────────────────────────────────────────
    // SCENE 10: Question Bank
    // ──────────────────────────────────────────────────────────────
    markScene('10_question_bank');

    // Use client-side navigation (click the sidebar link) instead of goto().
    // goto() is a hard page load — Clerk initializes AFTER React freezes the
    // useCallback(fn, []) that captures the api instance, so getToken() returns
    // null and the API call gets a 401. Client-side nav keeps Clerk pre-initialized.
    const qbLink = page.locator('a[href="/question-bank"], nav a', { hasText: /question bank/i }).first();
    if (await qbLink.isVisible().catch(() => false)) {
      await qbLink.click();
      await page.waitForURL(/question-bank/, { timeout: 10000 });
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(CONFIG.pauseShort);
    } else {
      await goto(page, '/question-bank');
    }
    await showTitleCard(page, '📚 Question Bank', '1,800+ questions — filter by type, difficulty, and company');
    await page.waitForTimeout(CONFIG.pauseLong);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(CONFIG.pauseMedium);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(CONFIG.pauseShort);
    await hideTitleCard(page);

    // ──────────────────────────────────────────────────────────────
    // SCENE 11: Settings — Billing / Day Pass
    // ──────────────────────────────────────────────────────────────
    markScene('11_settings');

    await goto(page, '/settings');
    await showTitleCard(page, '⚙️ Settings & Billing', 'Upgrade to Pro or grab a Day Pass for ₹99');
    await page.waitForTimeout(CONFIG.pauseLong);

    // Scroll to billing section
    const billingSection = page.locator('text=/billing|subscription|plan/i').first();
    if (await billingSection.isVisible().catch(() => false)) {
      await billingSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(CONFIG.pauseMedium);
    }

    await hideTitleCard(page);
    await showTitleCard(page, '💳 Day Pass — ₹99', 'Full Pro access for 24 hours — perfect for tomorrow\'s interview');
    await page.waitForTimeout(CONFIG.pauseLong);
    await hideTitleCard(page);

    // ──────────────────────────────────────────────────────────────
    // SCENE 12: Closing
    // ──────────────────────────────────────────────────────────────
    markScene('12_closing');

    await goto(page, '/');
    await showTitleCard(page, '🎙️ Try Rehearse Free', 'app.rehearse.ai — no credit card required');
    await page.waitForTimeout(CONFIG.pauseLong + 2000);
    await hideTitleCard(page);

    console.log('✅ Demo recording complete!');

  } catch (error) {
    console.error('❌ Error during recording:', error);
  } finally {
    await context.close();
    await browser.close();

    // Save scene timings so sync-audio.ts can place each voiceover at the right moment
    if (sceneTimings.length > 0) {
      const timingsPath = path.join(CONFIG.outputDir, 'scene-timings.json');
      fs.writeFileSync(timingsPath, JSON.stringify(sceneTimings, null, 2));
      console.log(`⏱️  Scene timings saved: ${timingsPath}`);
    }

    const files = fs.readdirSync(CONFIG.outputDir).filter((f: string) => f.endsWith('.webm'));
    if (files.length > 0) {
      const latest = files[files.length - 1];
      const newName = `rehearse-demo-${new Date().toISOString().split('T')[0]}.webm`;
      fs.renameSync(
        path.join(CONFIG.outputDir, latest),
        path.join(CONFIG.outputDir, newName),
      );
      console.log(`🎥 Video saved: ${newName}`);
      console.log(`📁 Location: ${CONFIG.outputDir}/${newName}`);
    }
  }
}

recordDemo();
