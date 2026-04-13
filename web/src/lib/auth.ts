import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { Pool } from "pg";

async function sendOtpEmail(email: string, otp: string) {
  const lambdaUrl = process.env.STORAGE_LAMBDA_URL;
  const secret    = process.env.STORAGE_LAMBDA_SECRET;

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#ffffff;">
      <div style="text-align:center;margin-bottom:32px;">
        <div style="display:inline-flex;align-items:center;gap:10px;">
          <div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:inline-flex;align-items:center;justify-content:center;">
            <span style="color:#fff;font-size:20px;">🎙</span>
          </div>
          <span style="font-size:20px;font-weight:700;color:#0f172a;letter-spacing:-0.5px;">Rehearse</span>
        </div>
      </div>
      <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f172a;text-align:center;">Verify your email</h2>
      <p style="margin:0 0 32px;font-size:14px;color:#64748b;text-align:center;">Enter this 6-digit code to complete your sign-up. It expires in 10 minutes.</p>
      <div style="text-align:center;margin-bottom:32px;">
        <div style="display:inline-block;background:#f1f5f9;border-radius:12px;padding:20px 32px;">
          <span style="font-size:36px;font-weight:800;letter-spacing:12px;color:#0f172a;font-family:monospace;">${otp}</span>
        </div>
      </div>
      <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">If you didn't create a Rehearse account, you can safely ignore this email.</p>
    </div>
  `;

  if (!lambdaUrl || !secret) {
    // Local dev fallback — log to console so you can test without Lambda
    console.log(`[OTP] ${email} → ${otp}`);
    return;
  }

  const res = await fetch(`${lambdaUrl}/email/send`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "x-secret": secret },
    body:    JSON.stringify({
      to:      email,
      subject: "Your Rehearse verification code",
      html,
      text:    `Your Rehearse verification code is: ${otp}\n\nIt expires in 10 minutes.`,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Email Lambda error ${res.status}: ${(body as { error?: string }).error ?? res.statusText}`);
  }
}

// Only register OAuth providers when credentials are present.
// This prevents a 500 crash when running locally without OAuth keys.
const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  };
}

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  socialProviders.github = {
    clientId:     process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  };
}

export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // we gate via emailOtp plugin manually
    minPasswordLength: 8,
  },

  socialProviders,

  plugins: [
    emailOTP({
      otpLength:   6,
      expiresIn:   600, // 10 minutes
      async sendVerificationOTP({ email, otp }) {
        await sendOtpEmail(email, otp);
      },
    }),
  ],

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge:  60 * 60 * 24,     // refresh session token daily
  },

  trustedOrigins: [
    process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ],
});
