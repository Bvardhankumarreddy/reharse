"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";

function SignUpForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const redirect     = searchParams.get("redirect_url") ?? "/onboarding";

  const [name,     setName]     = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "github" | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const { data, error: authError } = await authClient.signUp.email({
        email,
        password,
        name,
      });
      if (authError || !data) {
        setError(authError?.message ?? "Sign up failed. Please try again.");
      } else {
        router.push(redirect);
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: "google" | "github") {
    setOauthLoading(provider);
    setError(null);
    try {
      await authClient.signIn.social({
        provider,
        callbackURL: redirect,
      });
    } catch {
      setError("OAuth sign-in failed. Please try again.");
      setOauthLoading(null);
    }
  }

  const busy = loading || !!oauthLoading;

  return (
    <div className="w-full max-w-sm bg-surface border border-border shadow-xl rounded-2xl p-8 space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-[22px] font-bold text-text-pri">Create account</h1>
        <p className="text-text-sec text-[14px]">Start your AI interview prep journey</p>
      </div>

      {/* OAuth buttons */}
      <div className="space-y-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => handleOAuth("google")}
          className="w-full h-11 flex items-center justify-center gap-3 border border-border rounded-xl
                     bg-surface hover:bg-bg-app text-[14px] font-medium text-text-pri
                     disabled:opacity-60 transition"
        >
          {oauthLoading === "google" ? (
            <span className="w-4 h-4 border-2 border-text-muted border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          Continue with Google
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => handleOAuth("github")}
          className="w-full h-11 flex items-center justify-center gap-3 border border-border rounded-xl
                     bg-surface hover:bg-bg-app text-[14px] font-medium text-text-pri
                     disabled:opacity-60 transition"
        >
          {oauthLoading === "github" ? (
            <span className="w-4 h-4 border-2 border-text-muted border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-5 h-5 text-text-pri" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
            </svg>
          )}
          Continue with GitHub
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-[12px] text-text-muted">or sign up with email</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[13px] font-medium text-text-sec">Full Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Smith"
            required
            autoComplete="name"
            className="w-full h-11 px-4 bg-bg-app border border-border rounded-xl text-[14px]
                       text-text-pri placeholder:text-text-muted focus:outline-none
                       focus:ring-2 focus:ring-blue/20 focus:border-blue/40 transition"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[13px] font-medium text-text-sec">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
            className="w-full h-11 px-4 bg-bg-app border border-border rounded-xl text-[14px]
                       text-text-pri placeholder:text-text-muted focus:outline-none
                       focus:ring-2 focus:ring-blue/20 focus:border-blue/40 transition"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[13px] font-medium text-text-sec">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min. 8 characters"
            required
            autoComplete="new-password"
            className="w-full h-11 px-4 bg-bg-app border border-border rounded-xl text-[14px]
                       text-text-pri placeholder:text-text-muted focus:outline-none
                       focus:ring-2 focus:ring-blue/20 focus:border-blue/40 transition"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[13px] font-medium text-text-sec">Confirm Password</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="new-password"
            className="w-full h-11 px-4 bg-bg-app border border-border rounded-xl text-[14px]
                       text-text-pri placeholder:text-text-muted focus:outline-none
                       focus:ring-2 focus:ring-blue/20 focus:border-blue/40 transition"
          />
        </div>

        {error && (
          <p className="text-[13px] text-red-500 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full h-11 btn-gradient text-white font-semibold rounded-xl
                     disabled:opacity-60 transition-opacity"
        >
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="text-center text-[13px] text-text-sec">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-blue hover:text-blue/80 font-medium">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-bg-app flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl btn-gradient flex items-center justify-center">
          <span
            className="material-symbols-outlined text-white text-[22px]"
            style={{ fontVariationSettings: "'FILL' 1,'wght' 500,'GRAD' 0,'opsz' 24" }}
          >
            mic
          </span>
        </div>
        <span className="text-[20px] font-bold text-text-pri tracking-tight">Rehearse</span>
      </div>

      <Suspense>
        <SignUpForm />
      </Suspense>
    </div>
  );
}
