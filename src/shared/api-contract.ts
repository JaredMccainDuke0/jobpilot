/**
 * Cross-client API contract.
 *
 * The web client currently authenticates with the signed httpOnly cookie. A future
 * mini-program client will use the same resource shapes with its own session token;
 * business rules must stay in the server and never be duplicated in either UI.
 */
export type ApiError = {
  error: string;
  code?:
    | "UNAUTHENTICATED"
    | "VALIDATION_ERROR"
    | "CONFLICT"
    | "UPSTREAM_UNAVAILABLE"
    | "RATE_LIMITED"
    | "INTERNAL_ERROR";
  retryable?: boolean;
};

export type ApiResult<T> =
  | { ok: true; data: T }
  | ({ ok: false } & ApiError);

export type UserSummary = {
  id: string;
  email: string;
  role: string;
};

export type ResumeSummary = {
  id: string;
  confirmed: boolean;
  currentVersionId?: string | null;
  versions?: Array<Record<string, unknown>>;
} | null;

export type PreferenceSummary = Record<string, unknown> | null;

export type MatchJobSummary = {
  title: string;
  company: string;
  city: string;
  workMode?: string | null;
  applicationType: "verified_email";
  applicationEmail: string;
  applicationUrl: string;
  source: { name: string; url: string; verified: boolean };
  sourceEvidence?: Record<string, unknown> | null;
  sourceVerifiedAt?: string | null;
};

export type MatchResultSummary = {
  id: string;
  score: number;
  eligible: boolean;
  selected: boolean;
  job: MatchJobSummary;
};

export type ApplicationTaskSummary = {
  id: string;
  status: string;
  applicationType: "verified_email";
  jobTitle: string;
  company: string;
  applicationUrl?: string | null;
  sourceVerified: boolean;
  sourceEvidence?: Record<string, unknown> | null;
  history: Array<Record<string, unknown>>;
};

/** Stable subset consumed by both web and mini-program clients. */
export type StateResponse = {
  user: UserSummary;
  resume: ResumeSummary;
  preference: PreferenceSummary;
  run: (Record<string, unknown> & { results?: MatchResultSummary[] }) | null;
  tasks: ApplicationTaskSummary[];
  loginProvider: "email" | "google";
  emailSender: { kind: string; ready: boolean; error: string | null };
  modelConfigured: boolean;
  modelProvider: string | null;
};

export const API_ENDPOINTS = {
  state: "/api/state",
  resume: "/api/resume",
  resumeConfirm: "/api/resume/confirm",
  preferences: "/api/preferences",
  matches: "/api/matches",
  selectMatches: "/api/matches/select",
  applications: "/api/applications",
  manualApplication: "/api/applications/manual",
} as const;
