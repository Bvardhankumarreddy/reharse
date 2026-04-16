// Uses Next.js rewrites to proxy to the NestJS API — always same-origin, no CORS.
const BASE = "/api/v1";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type GetToken = () => Promise<string | null>;

async function request<T>(
  getToken: GetToken,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {

  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function upload<T>(getToken: GetToken, path: string, formData: FormData): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: formData });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text);
  }
  return res.json() as Promise<T>;
}

// ── Typed API methods ─────────────────────────────────────────────────────────

export function createApiClient(getToken: GetToken) {
  const get  = <T>(path: string)              => request<T>(getToken, "GET",    path);
  const post = <T>(path: string, body: unknown) => request<T>(getToken, "POST",   path, body);
  const patch = <T>(path: string, body: unknown) => request<T>(getToken, "PATCH",  path, body);
  const del  = <T>(path: string)              => request<T>(getToken, "DELETE", path);

  return {
    // ── Users ──────────────────────────────────────────────────────────────
    getMe:         ()                     => get<UserResponse>("/users/me"),
    updateMe:      (dto: UpdateUserDto)   => patch<UserResponse>("/users/me", dto),
    uploadResume:  (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return upload<UserResponse>(getToken, "/users/me/resume", form);
    },
    getResumeVersions:    () => get<ResumeVersion[]>("/users/me/resume/versions"),
    getResumeDownloadUrl: (key?: string) => get<{ url: string }>(`/users/me/resume/download${key ? `?key=${encodeURIComponent(key)}` : ""}`),

    // ── Sessions ───────────────────────────────────────────────────────────
    getSessions:     ()                       => get<SessionResponse[]>("/sessions"),
    getSession:      (id: string)             => get<SessionResponse>(`/sessions/${id}`),
    createSession:   (dto: CreateSessionDto)  => post<SessionResponse>("/sessions", dto),
    updateSession:   (id: string, dto: UpdateSessionDto) => patch<SessionResponse>(`/sessions/${id}`, dto),
    deleteSession:   (id: string)             => del<void>(`/sessions/${id}`),

    // ── Feedback ───────────────────────────────────────────────────────────
    getUserFeedback:      ()                  => get<FeedbackResponse[]>(`/feedback`),
    getFeedback:          (id: string)        => get<FeedbackResponse>(`/feedback/${id}`),
    getFeedbackBySession: (sessionId: string) => get<FeedbackResponse>(`/feedback/session/${sessionId}`),

    // ── Coach ──────────────────────────────────────────────────────────────
    coachMessage: (messages: { role: string; content: string }[]) =>
      post<{ reply: string; suggestions: string[] }>("/coach/message", { messages }),

    // ── Questions ──────────────────────────────────────────────────────────
    getQuestions: (params?: QuestionFilter) => {
      const qs = params ? "?" + new URLSearchParams(params as Record<string, string>).toString() : "";
      return get<{ data: QuestionResponse[]; total: number }>(`/questions${qs}`);
    },
    getQuestion: (id: string) => get<QuestionResponse>(`/questions/${id}`),

    // ── Calendar ───────────────────────────────────────────────────────────
    getCalendarAuthUrl:      ()  => get<{ url: string }>("/calendar/auth-url"),
    syncCalendarEvent:       ()  => post<{ eventId: string; htmlLink: string }>("/calendar/sync", {}),
    disconnectCalendar:      ()  => del<void>("/calendar/disconnect"),

    // ── Billing ────────────────────────────────────────────────────────────
    getBillingStatus:       ()                                        => get<BillingStatus>("/billing/status"),
    createSubscription:     (plan: "weekly" | "monthly" | "yearly")   => post<{ subscriptionId: string; keyId: string }>("/billing/subscription", { plan }),
    verifyPayment:          (dto: RazorpayVerifyDto)                  => post<void>("/billing/verify", dto),
    cancelSubscription:     ()                                        => post<void>("/billing/cancel", {}),
    createDayPass:          ()                                        => post<{ orderId: string; keyId: string; amount: number }>("/billing/daypass", {}),
    verifyDayPass:          (dto: DayPassVerifyDto)                   => post<void>("/billing/daypass/verify", dto),

    // ── User Feedback ──────────────────────────────────────────────────────
    submitUserFeedback: (dto: { rating?: number; category?: string; message: string }) =>
      post<void>("/user-feedback", dto),

    // ── Tools ──────────────────────────────────────────────────────────────
    warmup:           ()                                                       => get<{ ok: boolean }>("/tools/warmup"),
    fetchJDFromUrl:   (url: string)                                            => post<{ text: string }>("/tools/jd-fetch", { url }),
    analyzeJD:        (dto: { jobDescription: string; resumeText?: string })  => post<JDMatchResponse>("/tools/jd-match", dto),
    getJDMatchUsage:  ()                                                       => get<{ usesThisWeek: number; weekLimit: number; isPro: boolean }>("/tools/jd-match/usage"),
    reviewResume:     ()                                                       => post<ResumeReviewResponse>("/tools/resume-review", {}),

    // ── Referrals ───────────────────────────────────────────────────────
    getMyReferrals:   ()                    => get<ReferralData>("/referrals"),
    applyReferral:    (code: string)        => post<{ success: boolean; message: string }>("/referrals/apply", { code }),

    // ── Teams ─────────────────────────────────────────────────────────
    getMyTeam:        ()                    => get<TeamData | null>("/teams/me"),
    createTeam:       (name: string, maxSeats?: number) => post<TeamData>("/teams", { name, maxSeats }),
    inviteToTeam:     (teamId: string, email: string) => post<TeamData>(`/teams/${teamId}/invite`, { email }),
    removeFromTeam:   (teamId: string, memberId: string) => del<TeamData>(`/teams/${teamId}/members/${memberId}`),
    acceptTeamInvite: (teamId: string)      => post<TeamData>(`/teams/${teamId}/accept`, {}),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

// ── Response / DTO types (mirrors NestJS DTOs) ────────────────────────────────

export interface ResumeVersion {
  key:        string;
  fileName:   string;
  uploadedAt: string;
  version:    number;
}

export interface UserResponse {
  id:                 string;
  email:              string;
  firstName:          string | null;
  lastName:           string | null;
  imageUrl:           string | null;
  targetRole:         string | null;
  targetCompany:      string | null;
  experienceLevel:    string | null;
  goalType:           string | null;
  companyType:        string | null;
  resumeUrl:          string | null;
  resumeText:         string | null;
  preferences:        { mode?: string; adaptive?: boolean; starHints?: boolean; feedbackDepth?: string } | null;
  notificationPreferences: { daily?: boolean; weekly?: boolean; newQ?: boolean; aiCoach?: boolean; session?: boolean } | null;
  targetCompanies:    string[] | null;
  currentStreak:      number;
  longestStreak:      number;
  onboardingCompleted: boolean;
  interviewDate:           string | null;
  googleCalendarConnected: boolean;
  subscriptionTier:        string;
  subscriptionStatus:      string | null;
  subscriptionEndsAt:      string | null;
  createdAt:               string;
  updatedAt:               string;
}

export interface UpdateUserDto {
  firstName?:          string;
  lastName?:           string;
  targetRole?:         string;
  targetCompany?:      string;
  experienceLevel?:    string;
  goalType?:           string;
  companyType?:        string;
  resumeUrl?:          string;
  onboardingCompleted?: boolean;
  interviewDate?: string | null;
  preferences?: { mode?: string; adaptive?: boolean; starHints?: boolean; feedbackDepth?: string };
  notificationPreferences?: { daily?: boolean; weekly?: boolean; newQ?: boolean; aiCoach?: boolean; session?: boolean };
  targetCompanies?: string[];
}

export interface SessionResponse {
  id:              string;
  userId:          string;
  interviewType:   string;
  targetRole:      string | null;
  targetCompany:   string | null;
  experienceLevel: string | null;
  mode:            string;
  durationMinutes: number;
  status:          string;
  overallScore:    number | null;
  transcript:      object[];
  startedAt:       string | null;
  completedAt:     string | null;
  createdAt:       string;
  updatedAt:       string;
}

export interface CreateSessionDto {
  interviewType:    string;
  targetRole?:      string;
  targetCompany?:   string;
  experienceLevel?: string;
  mode?:            string;
  durationMinutes?: number;
  questionIds?:     string[];
}

export interface UpdateSessionDto {
  status?:      string;
  overallScore?: number;
  transcript?:  object[];
}

export interface FeedbackResponse {
  id:               string;
  sessionId:        string;
  overallScore:     number;
  dimensionScores:  Record<string, number>;
  summary:          string;
  questionFeedback: QuestionFeedbackItem[];
  nextSteps:        NextStep[];
  weakAreas:        string[];
  modelUsed:        string | null;
  createdAt:        string;
}

export interface QuestionFeedbackItem {
  questionId:   string;
  question:     string;
  answer:       string;
  score:        number;
  strengths:    string[];
  improvements: string[];
  modelAnswer?: string;
}

export interface NextStep {
  type:        string;
  title:       string;
  description: string;
  link?:       string;
}

export interface QuestionResponse {
  id:           string;
  type:         string;
  difficulty:   string;
  question:     string;
  modelAnswer:  string | null;
  tags:         string[];
  companies:    string[];
  roles:        string[];
  avgScore:     number;
  attemptCount: number;
}

export interface QuestionFilter {
  type?:       string;
  difficulty?: string;
  search?:     string;
  company?:    string;
  role?:       string;
  limit?:      string;
  offset?:     string;
}

export interface BillingStatus {
  tier:           string;        // 'free' | 'pro'
  status:         string | null; // 'active' | 'day_pass' | 'past_due' | 'cancelled' | 'expired' | null
  subscriptionId: string | null;
  endsAt:         string | null;
}

export interface RazorpayVerifyDto {
  razorpay_payment_id:      string;
  razorpay_subscription_id: string;
  razorpay_signature:       string;
}

export interface DayPassVerifyDto {
  razorpay_payment_id: string;
  razorpay_order_id:   string;
  razorpay_signature:  string;
}

export interface JDMatchResponse {
  match_score:       number;
  matched_keywords:  string[];
  missing_keywords:  string[];
  strengths:         string[];
  gaps:              string[];
  recommendations:   string[];
  summary:           string;
}

export interface ResumeReviewSection {
  name:        string;
  score:       number;
  feedback:    string;
  suggestions: string[];
}

export interface ResumeReviewResponse {
  overall_score:    number;
  sections:         ResumeReviewSection[];
  strengths:        string[];
  improvements:     string[];
  ats_score:        number;
  ats_feedback:     string;
  summary:          string;
  target_role_fit:  string | null;
}

export interface ReferralData {
  code:          string;
  totalReferred: number;
  totalRewarded: number;
  referrals:     Array<{
    id:              string;
    referredEmail:   string | null;
    referredName:    string | null;
    status:          string;
    referrerRewarded: boolean;
    createdAt:       string;
  }>;
}

export interface TeamData {
  id:        string;
  name:      string;
  plan:      string;
  maxSeats:  number;
  ownerId:   string;
  ownerEmail: string;
  createdAt: string;
  members:   Array<{
    id:        string;
    email:     string;
    role:      string;
    status:    string;
    userId:    string | null;
    name:      string | null;
    createdAt: string;
  }>;
}
