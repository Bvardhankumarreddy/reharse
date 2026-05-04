"use client";

// Sub-layout for /admin/social-agent/* — applies AetherStackAI dark theme
// inside the existing admin shell. Tab nav across the section.

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/social-agent",              label: "Dashboard" },
  { href: "/admin/social-agent/generate",     label: "+ Generate" },
  { href: "/admin/social-agent/queue",        label: "Queue" },
  { href: "/admin/social-agent/scheduled",    label: "Scheduled" },
  { href: "/admin/social-agent/history",      label: "History" },
  { href: "/admin/social-agent/analytics",    label: "📊 Analytics" },
  { href: "/admin/social-agent/competitors",  label: "👀 Competitors" },
  { href: "/admin/social-agent/connections",  label: "🔗 Connections" },
];

export default function SocialAgentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="-m-6 min-h-[calc(100vh-3.5rem)] bg-[#0A0E27] p-6 text-white">
      <div className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">
              📲 Social Agent
            </h1>
            <p className="text-[#B8C5E0] text-sm mt-1">
              AI-generate, review, and approve posts for AetherStackAI
            </p>
          </div>
        </div>

        <nav className="mt-4 flex gap-1 p-1 bg-[#151B3D] border border-white/10 rounded-xl w-fit overflow-x-auto">
          {TABS.map((t) => {
            const active = t.href === "/admin/social-agent"
              ? pathname === "/admin/social-agent"
              : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition whitespace-nowrap ${
                  active ? "bg-[#00D4FF] text-[#0A0E27]" : "text-[#B8C5E0] hover:text-white"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {children}
    </div>
  );
}
