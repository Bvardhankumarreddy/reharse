"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { clsx } from "clsx";
import { useState } from "react";

const TABS = [
  { href: "/",              label: "Home",     icon: "home"       },
  { href: "/practice",      label: "Practice", icon: "exercise"   },
  { href: "/sessions",      label: "Sessions", icon: "history"    },
  { href: "/progress",      label: "Progress", icon: "leaderboard"},
  { href: "/question-bank", label: "Bank",     icon: "database"   },
] as const;

const TOOLS_LINKS = [
  { href: "/tools/jd-match",     label: "JD Match",      icon: "document_scanner"       },
  { href: "/tools/star-builder", label: "STAR Builder",   icon: "format_list_bulleted"   },
  { href: "/tools/debrief",      label: "Interview Log",  icon: "work_history"           },
  { href: "/tools/pair",         label: "Peer Practice",  icon: "group"                  },
] as const;

type Sheet = "account" | "tools" | null;

/** Mobile bottom tab bar (hidden on lg+) */
export default function BottomNav() {
  const pathname          = usePathname();
  const { signOut }       = useClerk();
  const [sheet, setSheet] = useState<Sheet>(null);

  function handleSignOut() {
    document.cookie = "rehearse_onboarded=; path=/; max-age=0; SameSite=Lax";
    signOut({ redirectUrl: "/sign-in" });
  }

  const toolsActive = pathname.startsWith("/tools");

  return (
    <>
      {/* Bottom sheet backdrop */}
      {sheet && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end"
          onClick={() => setSheet(null)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-surface rounded-t-2xl border-t border-border p-4 space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            {sheet === "tools" && (
              <>
                <p className="text-[13px] font-semibold text-text-sec text-center mb-3">Tools</p>
                {TOOLS_LINKS.map(({ href, label, icon }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setSheet(null)}
                    className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-bg-app text-text-pri text-[14px] font-medium"
                  >
                    <span className="material-symbols-outlined text-[20px] text-blue">{icon}</span>
                    {label}
                  </Link>
                ))}
              </>
            )}

            {sheet === "account" && (
              <>
                <p className="text-[13px] font-semibold text-text-sec text-center mb-3">Account</p>
                <Link
                  href="/settings"
                  onClick={() => setSheet(null)}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-bg-app text-text-pri text-[14px] font-medium"
                >
                  <span className="material-symbols-outlined text-[20px]">settings</span>
                  Settings
                </Link>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-red-50 text-red-600 text-[14px] font-semibold"
                >
                  <span className="material-symbols-outlined text-[20px]">logout</span>
                  Sign out
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40
                   bg-surface border-t border-border
                   flex items-center"
        style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}
      >
        {TABS.map(({ href, label, icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors",
                active ? "text-blue" : "text-text-muted"
              )}
            >
              <span
                className="material-symbols-outlined text-[22px]"
                style={{
                  fontVariationSettings: active
                    ? "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24"
                    : "'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24",
                }}
              >
                {icon}
              </span>
              <span style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {label}
              </span>
            </Link>
          );
        })}

        {/* Tools tab */}
        <button
          onClick={() => setSheet((s) => s === "tools" ? null : "tools")}
          className={clsx(
            "flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors",
            sheet === "tools" || toolsActive ? "text-blue" : "text-text-muted"
          )}
        >
          <span
            className="material-symbols-outlined text-[22px]"
            style={{
              fontVariationSettings: (sheet === "tools" || toolsActive)
                ? "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24"
                : "'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24",
            }}
          >
            construction
          </span>
          <span style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Tools
          </span>
        </button>

        {/* Account tab */}
        <button
          onClick={() => setSheet((s) => s === "account" ? null : "account")}
          className={clsx(
            "flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors",
            sheet === "account" ? "text-blue" : "text-text-muted"
          )}
        >
          <span className="material-symbols-outlined text-[22px]"
            style={{ fontVariationSettings: "'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24" }}>
            person
          </span>
          <span style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Account
          </span>
        </button>
      </nav>
    </>
  );
}
