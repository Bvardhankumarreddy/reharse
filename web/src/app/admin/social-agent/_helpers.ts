// Shared helpers for the Social Agent admin pages.
"use client";

export type SocialPlatform =
  | "linkedin_page" | "linkedin_personal"
  | "instagram_feed" | "instagram_story"
  | "whatsapp_status" | "youtube_community";

export type SocialContentType =
  | "lesson_drop" | "quiz_winners" | "quiz_announcement"
  | "engagement_post" | "custom";

export type SocialPostStatus =
  | "draft" | "pending_approval" | "approved"
  | "publishing"
  | "published_manual" | "published_auto"
  | "failed" | "rejected";

export interface SocialConnection {
  id: string;
  platform: SocialPlatform;
  accountId: string;
  accountName: string | null;
  tokenExpiresAt: string;
  isActive: boolean;
  lastUsedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SocialPost {
  id: string;
  platform: SocialPlatform;
  contentType: SocialContentType;
  textContent: string;
  imageUrl: string | null;
  linkUrl: string | null;
  scheduledAt: string;
  publishedAt: string | null;
  externalUrl: string | null;
  externalPostId: string | null;
  publishAttempts: number;
  lastPublishAttemptAt: string | null;
  failureReason: string | null;
  status: SocialPostStatus;
  generatedBy: "manual" | "claude";
  generationContext: Record<string, unknown> | null;
  approvedAt: string | null;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  linkedin_page:     "LinkedIn Page",
  linkedin_personal: "LinkedIn Personal",
  instagram_feed:    "Instagram Feed",
  instagram_story:   "Instagram Story",
  whatsapp_status:   "WhatsApp Status",
  youtube_community: "YouTube Community",
};

export const PLATFORM_COLOR: Record<SocialPlatform, string> = {
  linkedin_page:     "#0A66C2",
  linkedin_personal: "#0A66C2",
  instagram_feed:    "#E4405F",
  instagram_story:   "#E4405F",
  whatsapp_status:   "#25D366",
  youtube_community: "#FF0000",
};

export const CONTENT_TYPE_LABEL: Record<SocialContentType, string> = {
  lesson_drop:        "Lesson Drop",
  quiz_winners:       "Quiz Winners",
  quiz_announcement:  "Quiz Announcement",
  engagement_post:    "Engagement",
  custom:             "Custom",
};

export const STATUS_COLOR: Record<SocialPostStatus, string> = {
  draft:              "bg-slate-500/20 text-slate-300",
  pending_approval:   "bg-amber-500/20 text-amber-300",
  approved:           "bg-cyan-500/20 text-cyan-300",
  publishing:         "bg-violet-500/20 text-violet-300 animate-pulse",
  published_manual:   "bg-emerald-500/20 text-emerald-300",
  published_auto:     "bg-emerald-500/20 text-emerald-300",
  failed:             "bg-red-500/20 text-red-300",
  rejected:           "bg-slate-500/20 text-slate-400",
};

export async function fetchToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/token");
    if (!res.ok) return null;
    const { token } = (await res.json()) as { token?: string };
    return token ?? null;
  } catch {
    return null;
  }
}

export function api<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  return fetch(`/api/v1/admin/social-agent${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  }).then(async (r) => {
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new Error(body.message ?? `HTTP ${r.status}`);
    }
    return r.json() as Promise<T>;
  });
}
