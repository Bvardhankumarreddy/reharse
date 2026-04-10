"use client";

import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { useDashboardStore } from "@/lib/store/dashboard";

interface Props {
  onCmdOpen:   () => void;
  onCoachOpen: () => void;
}

/** Mobile-only top bar (hidden on lg+). Sign-out lives in the BottomNav account sheet. */
export default function TopBar({ onCmdOpen, onCoachOpen }: Props) {
  const { data: session } = authClient.useSession();
  const streak            = useDashboardStore((s) => s.user.streak);
  const user              = session?.user;

  const name     = user?.name ?? "";
  const initials = name
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

  return (
    <header
      className="lg:hidden sticky top-0 z-40 bg-surface border-b border-border
                 px-4 py-3 flex items-center justify-between"
    >
      {/* Logo */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg btn-gradient flex items-center justify-center">
          <span
            className="material-symbols-outlined text-white text-[15px]"
            style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}
          >
            mic
          </span>
        </div>
        <span className="text-[15px] font-bold tracking-tight text-text-pri">
          Rehearse
        </span>
      </div>

      {/* Right: search · coach · streak · avatar (→ settings) */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onCmdOpen}
          aria-label="Open command bar"
          className="p-1.5 rounded-full text-text-sec hover:bg-bg-app transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">search</span>
        </button>

        <button
          onClick={onCoachOpen}
          aria-label="Open AI coach"
          className="p-1.5 rounded-full text-text-sec hover:bg-bg-app transition-colors"
        >
          <span
            className="material-symbols-outlined text-[20px]"
            style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}
          >
            auto_awesome
          </span>
        </button>

        {/* Streak badge */}
        {streak > 0 && (
          <div className="flex items-center gap-0.5 bg-orange-50 px-2 py-1 rounded-full">
            <span
              className="material-symbols-outlined text-orange-500 text-[14px]"
              style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}
            >
              local_fire_department
            </span>
            <span className="text-[12px] font-bold text-orange-500">{streak}</span>
          </div>
        )}

        {/* Avatar → settings */}
        <Link
          href="/settings"
          title={name || "Account"}
          aria-label="Account settings"
          className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 ml-0.5
                     ring-2 ring-transparent hover:ring-blue transition-all active:scale-95"
        >
          {user?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt={name || "avatar"} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full btn-gradient flex items-center justify-center
                            text-white font-bold text-[12px]">
              {initials}
            </div>
          )}
        </Link>
      </div>
    </header>
  );
}
