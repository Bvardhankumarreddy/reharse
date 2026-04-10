import { chromium } from 'playwright';
import path from 'path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.resolve(__dirname, '../.env') });

const BASE_URL  = process.env.APP_URL || 'https://app.rehearse.ai';
const AUTH_FILE = path.resolve(__dirname, '../auth-state.json');

async function saveAuth() {
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext();
  const page    = await context.newPage();

  await page.goto(`${BASE_URL}/sign-in`);

  console.log('');
  console.log('👆  Sign in manually in the browser (email → OTP → done).');
  console.log('⏳  Waiting up to 3 minutes for you to complete sign-in...');
  console.log('');

  // Wait until the URL is no longer /sign-in or /onboarding
  await page.waitForURL(
    (url) => !url.toString().includes('/sign-in') && !url.toString().includes('/onboarding'),
    { timeout: 180_000 },
  );

  // Mark onboarding complete in DB so the onboarding useEffect never pulls user back
  await page.evaluate(async (base) => {
    await fetch(`${base}/api/v1/users/me`, {
      method:      'PATCH',
      headers:     { 'Content-Type': 'application/json' },
      credentials: 'include',
      body:        JSON.stringify({ onboardingCompleted: true }),
    });
  }, BASE_URL);

  // Set the onboarding cookie so the middleware never bounces to /onboarding
  await context.addCookies([{
    name:     'rehearse_onboarded',
    value:    '1',
    domain:   new URL(BASE_URL).hostname,
    path:     '/',
    httpOnly: false,
    secure:   BASE_URL.startsWith('https'),
    sameSite: 'Lax',
    expires:  Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
  }]);

  await context.storageState({ path: AUTH_FILE });

  console.log(`✅  Auth state saved → ${AUTH_FILE}`);
  console.log('    Run "npm run record" to start the demo recording.');

  await browser.close();
}

saveAuth().catch((e) => { console.error(e); process.exit(1); });
