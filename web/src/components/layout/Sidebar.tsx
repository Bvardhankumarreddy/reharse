"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";
import { authClient } from "@/lib/auth-client";
import { useDashboardStore } from "@/lib/store/dashboard";

const NAV_ITEMS = [
  { href: "/",              label: "Home",          icon: "home" },
  { href: "/practice",      label: "Practice",      icon: "exercise" },
  { href: "/sessions",      label: "My Sessions",   icon: "history" },
  { href: "/progress",      label: "Progress",      icon: "leaderboard" },
  { href: "/question-bank", label: "Question Bank", icon: "database" },
] as const;

const TOOLS_ITEMS = [
  { href: "/tools/jd-match",       label: "JD Match",       icon: "document_scanner" },
  { href: "/tools/star-builder",   label: "STAR Builder",   icon: "format_list_bulleted" },
  { href: "/tools/resume-review",  label: "Resume Review",  icon: "description" },
  { href: "/tools/debrief",        label: "Interview Log",  icon: "work_history" },
  { href: "/tools/pair",           label: "Peer Practice",  icon: "group" },
] as const;

const COMMUNITY_ITEMS = [
  { href: "/referrals", label: "Referrals",  icon: "share" },
  { href: "/team",      label: "Team",       icon: "groups" },
] as const;

const BOTTOM_ITEMS = [
  { href: "/settings", label: "Settings", icon: "settings" },
] as const;

// Thin wrapper so we can use filled variant for active icons
function NavIcon({ name, filled }: { name: string; filled?: boolean }) {
  return (
    <span
      className="material-symbols-outlined text-[20px]"
      style={{
        fontVariationSettings: filled
          ? "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24"
          : "'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24",
      }}
    >
      {name}
    </span>
  );
}

function UserFooter() {
  const router                       = useRouter();
  const { data: session }            = authClient.useSession();
  const streak                       = useDashboardStore((s) => s.user.streak);
  const user                         = session?.user;

  async function handleSignOut() {
    document.cookie = "rehearse_onboarded=; path=/; max-age=0; SameSite=Lax";
    await authClient.signOut({
      fetchOptions: { onSuccess: () => router.push("/sign-in") },
    });
  }

  const name = user?.name ?? "";
  const parts = name.trim().split(" ");
  const initials = parts
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

  const displayName = name || user?.email || "You";

  return (
    <div className="px-4 py-4 border-t border-border">
      <div className="flex items-center gap-3">
        {user?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt={displayName}
            className="w-9 h-9 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div
            className="w-9 h-9 rounded-full btn-gradient flex items-center justify-center
                       text-white font-bold text-[13px] flex-shrink-0"
          >
            {initials}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-text-pri truncate">
            {displayName}
          </p>
          {streak > 0 && (
            <div className="flex items-center gap-1 mt-0.5">
              <span
                className="material-symbols-outlined text-orange-500 text-[14px]"
                style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}
              >
                local_fire_department
              </span>
              <span className="text-[11px] font-bold text-orange-500">
                {streak}-day streak
              </span>
            </div>
          )}
        </div>

        <button
          onClick={handleSignOut}
          title="Sign out"
          className="p-1.5 rounded-lg text-text-muted hover:text-text-sec hover:bg-bg-app transition-colors flex-shrink-0"
        >
          <span
            className="material-symbols-outlined text-[18px]"
            style={{ fontVariationSettings: "'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24" }}
          >
            logout
          </span>
        </button>
      </div>
    </div>
  );
}

interface Props {
  onCoachOpen: () => void;
}

export default function Sidebar({ onCoachOpen }: Props) {
  const pathname = usePathname();

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  return (
    <>
      {/* Google Material Symbols font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
      />

      <aside
        className="fixed inset-y-0 left-0 z-50 hidden lg:flex flex-col
                   w-[240px] bg-surface border-r border-border"
      >
        {/* ── Logo ── */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
          <div className="w-8 h-8 rounded-lg btn-gradient flex items-center justify-center flex-shrink-0">
            <NavIcon name="mic" filled />
          </div>
          <div>
            <p className="text-[15px] font-bold tracking-tight text-text-pri">
              Rehearse
            </p>
            <p className="label text-text-muted" style={{ fontSize: 10 }}>
              AI Interview Coach
            </p>
          </div>
        </div>

        {/* ── Nav items ── */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ href, label, icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium transition-colors",
                  active
                    ? "bg-blue text-white font-semibold"
                    : "text-text-sec hover:bg-bg-app hover:text-text-pri"
                )}
              >
                <NavIcon name={icon} filled={active} />
                <span>{label}</span>
              </Link>
            );
          })}

          {/* ── Tools section ── */}
          <div className="pt-3 mt-3 border-t border-border space-y-0.5">
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-text-muted">Tools</p>
            {TOOLS_ITEMS.map(({ href, label, icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={clsx(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium transition-colors",
                    active
                      ? "bg-blue text-white font-semibold"
                      : "text-text-sec hover:bg-bg-app hover:text-text-pri"
                  )}
                >
                  <NavIcon name={icon} filled={active} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>

          {/* ── Community section ── */}
          <div className="pt-3 mt-3 border-t border-border space-y-0.5">
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-text-muted">Community</p>
            {COMMUNITY_ITEMS.map(({ href, label, icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={clsx(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium transition-colors",
                    active
                      ? "bg-blue text-white font-semibold"
                      : "text-text-sec hover:bg-bg-app hover:text-text-pri"
                  )}
                >
                  <NavIcon name={icon} filled={active} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>

          {/* ── AI Coach button ── */}
          <button
            onClick={onCoachOpen}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium
                       text-text-sec hover:bg-bg-app hover:text-text-pri transition-colors"
          >
            <NavIcon name="auto_awesome" />
            <span>AI Coach</span>
          </button>

          {/* ── Divider + settings ── */}
          <div className="pt-3 mt-3 border-t border-border">
            {BOTTOM_ITEMS.map(({ href, label, icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium
                           text-text-sec hover:bg-bg-app hover:text-text-pri transition-colors"
              >
                <NavIcon name={icon} />
                <span>{label}</span>
              </Link>
            ))}
          </div>
        </nav>

        {/* ── User profile + streak ── */}
        <UserFooter />
      </aside>
    </>
  );
}
