"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

const NAV = [
  { href: "/admin", label: "Overview", icon: "dashboard" },
  { href: "/admin/analytics", label: "Analytics", icon: "insights" },
  { href: "/admin/users", label: "Users", icon: "group" },
  { href: "/admin/sessions", label: "Sessions", icon: "mic" },
  { href: "/admin/questions", label: "Questions", icon: "quiz" },
  { href: "/admin/feedback", label: "Feedback", icon: "reviews" },
  { href: "/admin/feedback-audit", label: "AI Audit", icon: "fact_check" },
  { href: "/admin/revenue", label: "Revenue", icon: "payments" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      if (!data?.user) { router.replace("/sign-in"); return; }
      setChecking(false);
    });
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen bg-bg-app flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  const activeNav = NAV.find((n) =>
    n.href === "/admin"
      ? pathname === "/admin"
      : pathname.startsWith(n.href),
  );

  return (
    <div className="min-h-screen bg-[#0f172a] flex">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-[#1e293b] border-r border-white/5 flex flex-col">
        <div className="px-5 py-5 border-b border-white/5">
          <span className="text-white font-bold text-lg tracking-tight">Rehearse</span>
          <span className="ml-2 text-[10px] font-semibold bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full uppercase tracking-wide">Admin</span>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => {
            const active = item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? "bg-indigo-500/15 text-indigo-300"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-white/5 space-y-0.5">
          <button
            onClick={async () => {
              const res = await fetch("/api/auth/token");
              const { token } = (await res.json()) as { token?: string };
              if (!token) return;
              const csv = await fetch("/api/v1/admin/users/export", {
                headers: { Authorization: `Bearer ${token}` },
              });
              const blob = await csv.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "users.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            Export CSV
          </button>
          <Link href="/" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Back to App
          </Link>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-[#1e293b]/50 border-b border-white/5 flex items-center px-6">
          <h1 className="text-white font-semibold text-sm">
            {activeNav?.label ?? "Admin"}
          </h1>
        </header>
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
