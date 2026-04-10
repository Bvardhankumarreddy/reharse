"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";

function SignInForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const redirect     = searchParams.get("redirect_url") ?? "/";

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: authError } = await authClient.signIn.email({ email, password });
      if (authError) {
        setError(authError.message ?? "Sign in failed. Please check your credentials.");
      } else {
        router.push(redirect);
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm bg-surface border border-border shadow-xl rounded-2xl p-8 space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-[22px] font-bold text-text-pri">Welcome back</h1>
        <p className="text-text-sec text-[14px]">Sign in to continue to Rehearse</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
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
            placeholder="••••••••"
            required
            autoComplete="current-password"
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
          disabled={loading}
          className="w-full h-11 btn-gradient text-white font-semibold rounded-xl
                     disabled:opacity-60 transition-opacity"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="text-center text-[13px] text-text-sec">
        {"Don't have an account? "}
        <Link href="/sign-up" className="text-blue hover:text-blue/80 font-medium">
          Sign up
        </Link>
      </p>
    </div>
  );
}

export default function SignInPage() {
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
        <SignInForm />
      </Suspense>
    </div>
  );
}
