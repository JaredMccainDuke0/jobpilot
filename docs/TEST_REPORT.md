# Test Report

## 2026-09-05 session — scheduled local job catalog

The user-facing match request now reads a local, freshness-bounded job catalog.
A separate scheduler/worker fetches configured public Greenhouse, Lever, JSON,
RSS, or Atom feeds, normalizes records, deduplicates them, hides expired or
stale jobs, enforces an active-row limit, and records refresh status. No model
web-search request is made when a user matches jobs. No real feed was configured
for this local verification run, so no external vacancy was imported and no
email was sent.

Verification:

- `npm run typecheck`: passed.
- `npm test`: 20 files, 59 tests passed.
- `npm run check:miniapp`: passed for all mini-program JSON and JavaScript files.
- `npm run build`: passed with Next.js 16.3.4; only the known Node.js
  `node:sqlite` experimental warning was emitted.
- `npm audit --audit-level=moderate`: 0 vulnerabilities.
- Feed and collector tests cover Greenhouse, Lever, generic JSON, RSS/Atom
  parsing, malformed configuration, private URL rejection, freshness
  rejection, refresh records, duplicate source IDs, planned-city evidence, and
  local catalog-only search.

Not verified in this session: production source authorization/configuration,
live feed availability, server worker uptime, WeChat device acceptance, and
real email delivery.

The entries below are historical verification sessions. The current verification
summary is recorded above. Historical claims about model search or seed jobs do
not describe the current catalog architecture.

## 2026-08-17 session — switch runtime model to gpt-5.6-sol

User request: retain the current `https://kuaipao.pro/v1` provider and existing secret, but switch the active model from `gpt-5.6-terra` to the full identifier `gpt-5.6-sol`. Runtime `.env`, `.env.example`, the search-adapter test fixture, and current-state handoff text were updated; historical test entries were left as history. The existing `light` configuration still maps to Responses-compatible `reasoning.effort: low`.

Verification:
- Official OpenAI model documentation exposes `gpt-5.6-sol` and the GPT-5.6 migration guide keeps the Responses API/reasoning-effort shape used by this project.
- Kuaipao `/models`: 200 and the exact target identifier was present. A minimal non-personal `/responses` request using `gpt-5.6-sol` plus `reasoning.effort: low`: 200 before the edit and again after restart.
- `npm test`: 15 files, 51 tests passed. `npx tsc --noEmit`: passed. `npm run build`: passed.
- Production server restarted after the `.env` change; local and public `/gate` both returned 200. No resume search, database write, or email send was performed.

## 2026-08-17 session — minimum-five target, ten-result bound, transient retry

User correction: five is a minimum target, not the result cap. `MATCH_RESULT_TARGET` is now 5 and the bounded UI/API limit is 10. A broad model response may therefore return 6–10 jobs; when it returns fewer than 5, focused follow-up searches continue across up to four additional role families. The prompt now asks for at least 5 and up to 10 real vacancies. No virtual jobs are added when the real-source target cannot be reached.

Reliability changes: model-network and 5xx failures retry automatically before the run is marked unavailable; persistent transport failures stop further family passes and return a Chinese page-level message such as `模型服务连接失败（kuaipao.pro），请点击重试` instead of raw `fetch failed`. A real vacancy without a public email can now independently verify by finding both the title and company on the same source page; it remains `official_apply` and can never auto-send.

Verification:
- `npm test`: 15 files, 51 tests passed, including ten-result visibility, a transient-fetch retry regression, and independent verification of an uncited no-email manual vacancy.
- `npx tsc --noEmit`: passed. `npm run build`: passed. Production server restarted on the new build.
- Non-personal provider probe: `/models` returned 200 and a minimal `/responses` request returned 200; no key value was printed.
- Provider recheck after a user-visible transient failure: runtime `.env` host is `kuaipao.pro`, model is `gpt-5.6-terra`, and reasoning config is `light`; each setting occurs exactly once. Three authenticated `/models` probes and two minimal `/responses` probes all returned 200, while an unauthenticated request returned the expected 401. `.env.example` was synchronized to the same non-secret host/model values. The match page now displays the provider hostname, and transport errors include it without exposing the key.
- Read-only live search probe with generic AI/Python skills and city only: `mode=live`, 10 results, no warning. No resume, name, email, phone, database write, or email send was involved.
- Local and public `/gate` both returned 200 after restart.

## 2026-08-12 session — live-search recall improvements

Scope of change: raise Terra `web_search` recall for adjacent/similar roles while keeping every hard constraint intact (official first-party page that publishes the recruitment email, at most 5 jobs per batch, refresh excludes previously shown URLs, no virtual/demo fallback). No real emails were sent during any check in this session.

Code changes verified:
- `src/infrastructure/job-search.ts`: fan-out — one broad query plus up to two focused adjacent-family queries (`pickFamilies`) issued in parallel and merged/deduped, instead of a single query that returned empty or timed out as a single point of failure. Citation gate relaxed from exact-URL equality to **same official host** (`citedHosts`), so a citation landing on a sibling page of the same official domain no longer discards a real vacancy. City filter now uses `sameCity` normalization. Final list still capped at 5; `mode:"unavailable"` when no query succeeds; no demo fallback.
- `src/domain/matching.ts`: added `normalizeCity`/`sameCity` (strips 省/市/区/县 suffixes and whitespace) and applied it to the hard city constraint in `matchJob`.
- `src/infrastructure/db.ts`: added `PRAGMA busy_timeout=10000;` before the WAL/DDL exec so parallel `next build` workers that each import the module serialize their opens instead of failing with `SQLITE_BUSY` (`database is locked`). This is the pre-existing build-lock issue; the fix is unrelated to the recall change.

Verification this session:
- `npm test`: 5 files, 18 tests passed. Search-adapter suite (6 tests) covers: at-most-5 cap with exclusions carried on every fan-out query, rejection of uncited/wrong-city/example.com/previously-shown results, no fallback when `web_search` was not executed (`mode:"unavailable"`, warning `模型没有执行联网搜索`), acceptance of a same-host sibling-page citation, `深圳市` satisfying `深圳`, and dedupe keeping multiple distinct vacancies from one official page. Matching suite adds an administrative-suffix city-equality test. All adapter tests mock `fetch`; no network or email is used.
- `npx tsc --noEmit`: passed (exit 0).
- `npm run build`: passed (exit 0) with the server stopped first, then restarted — no `database is locked` error, confirming the `busy_timeout` fix.
- Playwright mobile acceptance (headless system Chrome) on the public `/invite` page at 375x812, 390x844, 430x932 and 1280x800: unauthenticated root redirected to `/invite`, horizontal overflow was 0 px on every viewport, content rendered (2 inputs, 3 buttons), and no console errors were logged.
- Public tunnel (ngrok): `GET /` returned 307 → `/invite?next=%2F` and `GET /invite` returned 200 through `https://cartwheel-synopsis-handyman.ngrok-free.dev` on an actual public request.

Not verified this session (not bypassed): authenticated-screen responsive re-checks require the invite/login password, which is protected — only the public invite page and the auth-gate redirect were exercised. A non-empty live `web_search` result was not forced, so end-to-end display of a real live job remains pending (see Remaining warnings).

## 2026-08-12 session — recall relaxation (Option A) + long-wait UX

Root cause of the persistent zero-result matches was not fuzzy matching (the prompt already searches adjacent families and `matchJob` scores by capability overlap). It was a structural hard gate: every candidate job required an official first-party page that **publicly publishes a recruitment email**, which is rare for CN employers (most route through online portals or aggregators that are correctly excluded). Combined with same-host citation + same-city + a 120 s timeout, this frequently collapsed to zero.

User-approved fix ("展示相近真实岗位"): demote "has a public email" from a display gate to a submission-channel distinction. This supersedes the earlier "official page that publishes the recruitment email" constraint — a real official vacancy **without** a published email is now kept and shown, not discarded. The no-virtual-jobs, no-aggregator, ≤5-per-batch, exclude-shown-URLs, and never-email-an-unpublished-address constraints are all unchanged.

Code changes verified:
- `src/infrastructure/job-search.ts`: `applicationEmail` made optional/nullable in the Zod schema. A cited, same-host, same-city vacancy with an email → `applicationType: "verified_email"` (auto-email eligible); one without → `applicationType: "official_apply"` with `applicationEmail: null` (shown for manual/official-portal submission only). Prompt now instructs the model to publish the exact public email **or** set it to null and give the official application/careers URL, and "If you do not actually see an email on the page, use null — never guess one." The sub-5 warning now reports how many are email-submittable vs. manual.
- `src/app/api/matches/route.ts`: bind `job.applicationEmail || null` (SQLite cannot bind `undefined`).
- `src/domain/application.ts` (unchanged, confirmed safe): `official_apply` is neither `verified_email` nor `mock`, so `submissionEligibility` routes it to `NEEDS_USER`. `src/app/api/applications/route.ts` (unchanged, confirmed safe) skips any task whose status ≠ `WAITING`, and only the `verified_email` path with full SMTP config + a present `applicationEmail` reaches `EmailSubmissionAdapter.send()`. Therefore an email-less job can never be auto-emailed.
- `src/components/JobPilot.tsx`: each result row and the detail view now show a channel label — "可邮件投递（确认后可自动邮件投递）" for `verified_email`, otherwise "官方入口手动投递；系统不会自动发送邮件". Added a `SearchingOverlay` (spinner ring + rotating stage text + elapsed-seconds counter + a "通常需要 1–2 分钟，请勿刷新" hint) shown while the Preferences submit and the Matches "重新计算" requests are in flight; the refresh button is disabled during the request.
- `src/app/globals.css`: overlay styles reusing the existing `spin` keyframes, with a `prefers-reduced-motion` slowdown.

Verification this session:
- `npm test`: 5 files, **20 tests** passed (was 18; +2). New `job-search` test proves a no-email official vacancy is kept as `official_apply` with `applicationEmail === null` while an email vacancy on the same host stays `verified_email`. New `application` test locks the safety property that `official_apply` → `NEEDS_USER` and is never auto-emailed. All adapter tests mock `fetch`; no network or email is used.
- `npx tsc --noEmit`: passed (exit 0).
- `npm run build`: passed (exit 0), all 14 routes compiled, no `database is locked` error.

## 2026-08-12 session — root-cause of persistent zero results (empty citation annotations)

After Option A shipped, live matching still returned 0 on a real run (city 广州, an AI-engineering resume). Reproduced against the real model with a throwaway diagnostic (since deleted) that read the user's own confirmed preference/resume from the DB and printed **aggregate only** — no secrets, emails, or resume content.

Findings:
- The running production server (`next start`, PID booted 16:19) had loaded the **pre-Option-A build into memory**; the rebuilt `.next-build` on disk (17:17) was never picked up. `next start` reads the build once at boot, so the server was still serving the old email-required gate — its old warning text ("…官方公开邮箱核验…") is what the screenshot showed. Fixed by stop → rebuild → restart.
- The deeper killer, still present with the new code: the model **executed web_search and returned 6 real jobs, but the response carried zero citation annotations** (`message.content[].annotations` was `[]`). The host-citation gate was built only from annotations, so `citedHosts` was empty and every real job was rejected → 0. This provider is OpenAI-Responses-shaped: the URLs it actually browsed live in **`web_search_call.action`** — an `open_page` action's `url`, and `search` actions' `site:<host>` query operators — not in message annotations.

Fix (`src/infrastructure/job-search.ts`): build `citedHosts` from message annotations **and** `web_search_call.action` — `action.url` (browsed page), `action.results[].url` when present, and hosts parsed from `site:<host>` operators in `action.query`/`action.queries` (wildcard `site:*.com` ignored). This preserves the original "domain the model demonstrably browsed" anti-hallucination intent using the data this provider actually emits, and still rejects any job whose host the model neither opened, searched via `site:`, nor annotated.

Verification:
- Live re-run of `searchJobs` against the real model (same 广州 query): recall recovered from **0 → 3 jobs** with the real exclusion list (all `campus.cvte.com`, a first-party Guangzhou employer) and **0 → 5 jobs** without exclusions (`datastory.com.cn`, `cogineai.com`). Every result came back `official_apply` with `applicationEmail: null` — real official vacancies that publish no public email, shown for manual submission and never auto-emailed. No fabricated jobs, ≤5 cap held, city all 广州.
- `npm test`: 5 files, **21 tests** passed. New `job-search` test locks the regression: a response with **empty annotations** but an `open_page` action and a `site:` search operator accepts exactly the two cited-host jobs and rejects a third job on an uncited host.
- `npx tsc --noEmit`: passed (exit 0). `npm run build`: passed (exit 0). Server stopped → rebuilt → restarted on port 3000; public `/invite` and `/matches` both returned 200 through the ngrok tunnel on real public requests after the restart. No real emails were sent.

## 2026-08-12 session — independent URL verification (opt-in) + email-only login

Two user-requested changes, both verified. No real emails were sent.

Part A — server-side URL-existence verification (`src/infrastructure/job-search.ts`). Previously a returned job was kept only if its host was one the model demonstrably browsed (annotations or `web_search_call.action`). Added an **additive, opt-in** acceptance path gated by `JOBPILOT_VERIFY_URLS=1`: a real official vacancy the model did not visibly cite can still be shown if its `sourceUrl` independently answers over http(s). This never admits a job the other gates already reject — the exclude-shown-URL, `example.com`, and city filters run first, and only survivors that are *uncited* are probed. The probe is SSRF-guarded: it rejects non-http(s) schemes, `localhost`/`.local`/`.internal`, and any host that is or resolves (DNS `lookup`, all records) to a loopback / RFC1918 / link-local / CGNAT / multicast address, failing closed on any parse or DNS error; requests use `redirect:"manual"`, an 8 s timeout, HEAD then GET fallback, and accept only 2xx/3xx (or 401/403/405/429), treating 404/410/network errors as "does not exist". The flag is **off by default** (unit tests keep the strict cited-only behavior) and is set to `1` in `.env` for production.
- `.env.example`: documented `JOBPILOT_VERIFY_URLS`.

Part B — email-only login, no registration (`src/app/api/invite/route.ts`, `src/app/invite/page.tsx`, `src/app/api/settings/route.ts`, `src/components/JobPilot.tsx`). Per the user's design, there is no separate registration step and no per-account password: the email is the isolation key and the password is a single shared value. `POST /api/invite` now takes `{email, password}`, checks the password against `JOBPILOT_INVITE_PASSWORD_HASH` (sha256) **failing closed when unset**, then finds-or-creates the user by lowercased email and opens a session (unique-constraint race falls back to a re-select). The invite page is a single login form (removed the login/register tabs, the invite-password field, and the 8-char minimum). The per-user "修改登录密码" form and its `/api/settings` `currentPassword`/`newPassword` handling were removed, since login no longer uses a per-account password. `JOBPILOT_INVITE_PASSWORD_HASH` in `.env` was set to sha256 of the shared password the user chose.

Verification this session:
- `npm test`: 5 files, **23 tests** passed (was 21; +2). New `job-search` tests: (1) with `JOBPILOT_VERIFY_URLS=1`, an uncited host that answers 200 is accepted while an uncited host that answers 404 is dropped; (2) with the flag unset, uncited jobs are neither verified (zero verification fetches) nor accepted. DNS `lookup` is mocked to a public IP so the SSRF guard stays hermetic; `fetch` is mocked; no network or email is used.
- `npx tsc --noEmit`: passed (exit 0). `npm run build`: passed (exit 0), all 15 routes compiled. Running server stopped first, rebuilt, restarted on the new build.
- Login flow against the restarted server: `POST /api/invite` with a wrong password → **401**; with the shared password and a fresh test email → **200** with an `HttpOnly; Secure; SameSite=lax` `jobpilot_session` cookie (create path); the same email again → **200** (find path, no duplicate). The throwaway test account was deleted afterward (1 row), leaving the database unchanged.
- Auth gate + public tunnel: local `GET /` → 307 → `/invite`, local `GET /invite` → 200, and public `GET /invite` → 200 through `https://cartwheel-synopsis-handyman.ngrok-free.dev` on a real request.

## 2026-08-12 session — broaden source scope + capture directly-usable emails

User request: stop restricting to first-party employer pages — search **every usable public source** and capture a **directly-usable company application email** whenever a page shows one, so more jobs can be applied to by email directly.

Change (`src/infrastructure/job-search.ts` `buildPrompt`, plus label/comment wording in `src/components/JobPilot.tsx`): removed the "FIRST-PARTY official source only" requirement and the job-board / aggregator / university-portal exclusions. The prompt now instructs the model to sweep employer sites, official recruitment notices/accounts, job boards, aggregators, and campus/employment portals alike, and to put an email in `applicationEmail` whenever the page shows a directly-usable application address for that employer. The **non-negotiable guards are unchanged**: the model may never invent/guess/complete an email, company, job, URL, qualification, or date; an email must be genuinely shown on the page as the way to apply AND belong to the hiring company (never a job board's own contact/customer-service mailbox); `example.com` and already-shown URLs are still excluded; the host-citation + optional URL-verification anti-fabrication gate still applies. Downstream is untouched, so `official_apply` still routes to `NEEDS_USER` and nothing is auto-emailed unless the user confirms a `verified_email` job with SMTP configured and a real published address.

Verification this session:
- `npm test`: 5 files, **23 tests** passed (prompt/label wording changes only; gate logic and its tests unchanged). `npx tsc --noEmit`: 0. `npm run build`: 0. Server stopped → rebuilt → restarted on the new build.
- Live re-run against the real model (广州, AI-engineering resume, read-only, no DB writes): first attempt hit a transient `fetch failed` (~11 s); retry returned **5 real 广州 jobs in ~120 s**, now drawn from a genuinely wider net — 牛客网 (nowcoder.com), 智联招聘 (zhaopin.com ×2), bebee.com (aggregator), and a 香港中文大学（深圳）就业网 campus recruitment notice (career.cuhk.edu.cn PDF). All five URLs independently returned HTTP 200. City all 广州, ≤5 cap held, no virtual/`example.com` fallback. All five came back manual-channel this round (no directly-usable employer email exposed — job boards typically intermediate the contact), so none were auto-emailable, consistent with the guard.
- Public tunnel had died earlier and was restarted; the account's persistent free static domain returned the same URL. Local `/invite` 200, local `/` 307, public `/invite` 200.

Note: the broadened search does more work and runs closer to the 120 s per-query timeout, and the provider occasionally returns a transient `fetch failed`; a retry (or the in-app refresh, which also excludes already-shown URLs) recovers it.

## 2026-08-12 session — email-only results (drop manual-portal jobs)

User request: the Applications page was full of "需要用户处理 / 打开官方申请入口" (manual) tasks; they only want jobs the app can **email for them**, not manual-portal jobs.

Change (`src/infrastructure/job-search.ts`): the search now surfaces **only vacancies that expose a directly-usable employer application email** (`verified_email`). The prompt makes a visible application email a HARD requirement — a posting whose only channel is an online form / portal button / QR code / phone number must be dropped, not returned — and repeats the anti-fabrication rule twice ("NEVER fabricate an email to make a job qualify — omit the job instead"), steering toward sources that actually print emails (招聘简章/公告, official accounts, research-institute and public-sector notices, employer mailboxes). The adapter then hard-drops any parsed job with a null `applicationEmail` on both the cited-host and URL-verification paths, so a manual-only job can never reach the UI. Warning text updated; `example.com`, already-shown-URL, host-citation and optional URL-verification guards unchanged. Downstream is unchanged: `verified_email` + confirmed resume + verified source ⇒ WAITING, and `POST /api/applications` auto-sends via `EmailSubmissionAdapter` **only when the user's SMTP (`smtpHost`/`smtpUser`/`smtpFrom` + app password) is configured** — otherwise it records FAILED "邮箱授权信息不完整" and sends nothing. No email is sent without the user selecting+confirming the batch.

Verification this session:
- `npm test`: 5 files, **23 tests** passed. The three former "keep an email-less vacancy as official_apply" cases were rewritten to the new contract: email-less vacancies are dropped, and cited/verified jobs are kept only when they carry an email (now asserted `verified_email`). `npx tsc --noEmit`: 0. `npm run build`: 0. Server stopped → rebuilt → restarted.
- Live re-run against the real model (广州, read-only, no DB writes, with the user's real 5-URL exclusion list applied): returned **5 jobs in ~97 s, all `verified_email`**, each carrying a real employer application email — `hr@fingercnc.com` (广州亿达/finger-cnc careers page), `rsc@gis.sia.cn` (广东智能无人系统研究院, via 广州大学就业网), `wanghuazhu@topwin.tech` (广州头文科技, via 广大就业), `canwaycr@canway.net` (广州嘉为科技 ×2, via a campus recruitment platform). Adversarial check: every email domain resolves to a real enterprise-mail MX (NetEase 企业邮, 阿里云企业邮, QQ 企业邮, and cstnet.cn for the institute), and each domain matches the hiring employer's own brand — none is a job board's contact address. City all 广州, ≤5 cap, no `example.com`, no virtual fallback. No email was sent (search path only).

Reminder: email-only sharply narrows recall (most CN postings never publish an employer email), so batches are small and sometimes empty; refresh (which excludes already-shown URLs) fetches the next set. To actually auto-send, the user must first fill 邮箱授权 (SMTP) under 我的.

## 2026-08-13 session — Gmail one-click OAuth ("用 Google 连接")

User request (Plan 1): let users authorize sending with **their own Gmail via OAuth** — click → Google's own consent page (password goes to Google, never us) → we receive a revocable token — instead of hand-entering an app-password. 163/QQ keep the SMTP+授权码 path (those providers do not expose third-party OAuth send).

New/changed:
- `src/infrastructure/oauth-google.ts` (new): scope `openid email https://www.googleapis.com/auth/gmail.send`, auth-URL builder (`access_type=offline`, `prompt=consent`), code→token exchange, id_token email decode, public-origin/redirect-URI helpers (origin fixed by `JOBPILOT_PUBLIC_URL` to match Google's exact redirect-URI requirement).
- `src/app/api/oauth/google/start/route.ts` + `.../callback/route.ts` (new): logged-in user → Google consent (CSRF-guarded by a short-lived `g_oauth_state` cookie); callback verifies state, exchanges the code, stores the **refresh token encrypted** (`encryptUserSecret` → `user_secrets`) and sets `authProvider=google` + smtpHost/Port/User/From in `user_settings`; redirects to `/profile?emailAuth=…`. No DB migration (reuses existing tables).
- `src/infrastructure/email-auth.ts` (new): `getEmailSender(user)` centralizes channel resolution — `authProvider=google` + stored refresh token ⇒ XOAUTH2; otherwise SMTP + app-password/授权码 (owner may use env password). Returns a friendly reason when incomplete.
- `src/infrastructure/submission.ts`: `EmailSubmissionAdapter` now accepts either `password` or `oauth:{clientId,clientSecret,refreshToken}` and builds a nodemailer transport with `auth.type=OAuth2` accordingly; `verify()`/`send()` both work for OAuth.
- `src/app/api/smtp/route.ts` and `src/app/api/applications/route.ts`: both now build the adapter via `getEmailSender` (OAuth when connected, password otherwise). `src/app/api/settings/route.ts`: saving the manual SMTP form sets `authProvider=smtp` (switches away from Google).
- `src/components/JobPilot.tsx` + `globals.css`: 邮箱授权 shows a **「用 Google 一键连接」** button, the connected-address status, and a result banner from `?emailAuth=`; the manual form remains for 163/QQ/Outlook. Env: `JOBPILOT_PUBLIC_URL`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` added (`.env` placeholders + `.env.example`).

Verification this session:
- `npx tsc --noEmit`: 0. `npm test`: 5 files, 23 tests pass (unchanged suites). `npm run build`: 0 — both `/api/oauth/google/start` and `/api/oauth/google/callback` compiled.
- Live route checks against the restarted server: `GET /api/oauth/google/start` **without** a session → **401** (middleware-protected); after owner login, **with** the session and `GOOGLE_OAUTH_CLIENT_ID` still empty → **307 → `https://cartwheel-synopsis-handyman.ngrok-free.dev/profile?emailAuth=google_unconfigured`** (confirms the route runs, reads the user, and builds the redirect from `JOBPILOT_PUBLIC_URL`). `/invite` still 200. No email sent.

Pending (external, user-owned): the actual Google consent hop needs a Google Cloud OAuth client — client id/secret in `.env` + the exact redirect URI `…/api/oauth/google/callback` registered + test users added. Steps in `docs/GOOGLE_OAUTH_SETUP.md`. Note: in "Testing" publishing status, Google refresh tokens expire after **7 days** (users re-click connect weekly) and testers see an "unverified app" warning; removing both requires publishing + Google verification.

## 2026-08-13 session — access gate + OAuth-as-login (Phases 1–2)

User request: (a) a shared **site access password `jobpilot2026`** to enter; (b) drop the redundant per-user login password; (c) identity via **their own email**, ideally one-click Gmail/Outlook OAuth (which is *also* the send authorization). Only Gmail/Outlook may log in (no email-only fallback in the final state). Correction surfaced and accepted: users must never type their real email password into our site — OAuth is exactly what replaces that.

Delivered this session (Phases 1–2; Microsoft = Phase 3 pending an Azure app, remove-interim = Phase 4):
- **Access gate** (`src/app/api/gate/route.ts`, `src/app/gate/page.tsx`, `.env` `JOBPILOT_ACCESS_PASSWORD_HASH`=sha256("jobpilot2026")): `/gate` verifies the shared password (fail-closed if unset) and sets a signed httpOnly `jobpilot_gate` cookie.
- **Two-layer middleware** (`src/middleware.ts`): layer 1 requires `jobpilot_gate` (else → `/gate`, or 401 for api); sign-in surfaces (`/invite`, `/api/invite`, `/api/oauth/*`) pass without a session; layer 2 requires `jobpilot_session` (else → `/invite`, or 401).
- **Google OAuth = login** (`src/app/api/oauth/google/{start,callback}/route.ts`, `findOrCreateOAuthUser` in `auth.ts`, `sessionCookie` helper for setting the session on a redirect Response): start needs only the gate; callback verifies CSRF state, exchanges the code, finds/creates the user by the Google email, sets the session, and stores the encrypted refresh token + `authProvider=google`. One flow logs in *and* authorizes sending.
- **Interim email-only login** (`src/app/api/invite/route.ts` now email-only via `findOrCreateOAuthUser`; the per-user password check is removed). `src/app/invite/page.tsx` reworked to a Google-login primary button, a disabled Microsoft placeholder, a collapsed email-only "临时通道", an `authError` banner, and a streamlined guide. Styles in `globals.css`.

Verification (restarted server):
- `npx tsc --noEmit` 0; `npm test` 23 pass; `npm run build` 0.
- Live flow (curl): no cookie `GET /` → **307 `/gate?next=/`**; `GET /gate` → **200**; `POST /api/gate` wrong → **401**, `jobpilot2026` → **200 + `jobpilot_gate`**; gated no-session `GET /` → **307 `/invite`**; `GET /invite` → **200**; gated `GET /api/oauth/google/start` (no client id) → **307 `/invite?authError=google_unconfigured`** (route reachable without a session, redirect built from `JOBPILOT_PUBLIC_URL`); gated `POST /api/invite {email}` → **200 + `jobpilot_session`** (email-only login, no password); gated+session `GET /` → **200**; public `GET /gate` → **200**. Throwaway test account deleted. No email sent.

Pending: Google client id/secret in `.env` to exercise the real Google consent + login hop (redirect URI unchanged: `…/api/oauth/google/callback`); Phase 3 Microsoft login+send via Graph `/sendMail` (needs an Azure app); Phase 4 removes the interim email login for OAuth-only.

## 2026-08-13 session — Outlook/Microsoft OAuth login + Graph send (Phase 3)

Completes the target flow: **access password → pick Gmail or Outlook → OAuth → land in the app and submit.**

- `src/infrastructure/oauth-microsoft.ts` (new): Microsoft identity platform `/common/` endpoints, scopes `openid email profile offline_access https://graph.microsoft.com/Mail.Send`, auth-URL builder, code→token and refresh→access-token exchanges, id_token email decode (`email || preferred_username`).
- `src/app/api/oauth/microsoft/{start,callback}/route.ts` (new): mirror Google — gate-only start (CSRF `ms_oauth_state`); callback exchanges the code, `findOrCreateOAuthUser(email)`, sets the session, stores the encrypted `microsoftRefreshToken` + `authProvider=microsoft`.
- **Send via Graph, not SMTP** (`GraphSubmissionAdapter` in `src/infrastructure/submission.ts`): exchanges the refresh token for a Graph access token and `POST /v1.0/me/sendMail` with the resume as a base64 file attachment (202 = success); `verify()` just fetches a token (no mail). Chosen because personal-account SMTP OAuth is unreliable.
- `src/infrastructure/email-auth.ts`: `EmailSenderConfig` is now a `smtp | graph` union; `authProvider=microsoft` → graph config; new `makeAdapter(config)` factory used by `src/app/api/smtp/route.ts` and `src/app/api/applications/route.ts`.
- `src/app/invite/page.tsx`: the Microsoft button is enabled (`/api/oauth/microsoft/start`) with its own authError messages; guide updated. Env `MICROSOFT_OAUTH_CLIENT_ID/SECRET` added. `docs/MICROSOFT_OAUTH_SETUP.md` written.

Verification (restarted server): `npx tsc --noEmit` 0; `npm test` 23 pass; `npm run build` 0 (both `/api/oauth/microsoft/{start,callback}` compiled). Gated `GET /api/oauth/google/start` → 307 `…/invite?authError=google_unconfigured`; gated `GET /api/oauth/microsoft/start` → 307 `…/invite?authError=microsoft_unconfigured`; sign-in page renders **both** Google and Microsoft buttons with the Microsoft href wired; public `/gate` 200. No email sent.

Pending (external, user-owned): Google client id/secret (Google Cloud) and Microsoft client id/secret (Azure app registration) in `.env` to exercise the real consent + login + send hops. For unverified/testing mode, each user's address must be added as a test user (Google ≤100); fully open public access needs provider app verification.

## Passed

- `npm install`: completed.
- `npm run db:push` and `npm run db:seed`: SQLite schema and three traceable demo jobs initialized.
- `npm test`: 4 files and 10 tests passed, covering matching rules, submission gates, missing facts, bilingual resume parsing and password hashing.
- `npm test`: latest run passed 5 files and 13 tests. The three added search-adapter tests verify the `web_search` tool request, five-result cap, exclusion URL propagation, citation/city/example-domain filtering, and no demo fallback when web search is absent.
- `npx tsc --noEmit`: passed after the final state-synchronization and SMTP validation fixes.
- `npm run build`: Next.js production compilation, type checking, page generation, middleware and trace collection passed.
- Real PDF extraction: the supplied PDF yielded 2,579 characters; name, email, phone, education, school, major, graduation year and six skills were confirmed in the browser.
- Invite gate: unauthenticated root returned 307 to `/invite`; a wrong password showed an inline error; a correct password created an HttpOnly session and allowed access.
- Playwright full flow: invite login, PDF upload, confirmation, preferences, matching, selection, final confirmation and mock submission succeeded.
- Isolated multi-user Playwright flow: registration, TXT resume upload and parsing, resume confirmation, preference save, ranked matching, select-all, confirmation, one mock success and two manual-channel tasks all succeeded. Refresh and back navigation retained the confirmed resume, preference, matches and selections.
- Idempotency: two repeated confirmation requests retained one `SUCCESS` task.
- Account lifecycle: the isolated user changed the login password, logged out and logged back in with the new password successfully.
- Navigation continuity: Home, Matches, Applications and Profile were clicked consecutively in the production server; the same React root remained mounted and no full-page loading state appeared.
- Visual inspection: 375x812, 390x844, 430x932 and 1280x800 views showed no horizontal overflow, text collision or fixed-bar obstruction. The selected-job action bar stayed above the bottom navigation.
- Missing SMTP settings show a local friendly alert without issuing a failing API request or exposing a JSON parsing error.
- Application history displayed job, company, channel, reason and manual official-entry links. The demo dataset currently contains mock and manual/web channels, not a verified email job.
- Multi-user isolation: the migrated owner account retained its resume; a temporary invited account received empty resume, task and SMTP state. Both `/api/state` responses were scanned and did not contain the configured model Base URL, model name or API key. The temporary account was removed after verification.
- Public account UI: Playwright verified login and registration tabs, owner login, account password controls, per-user SMTP fields, and a model-service status panel with no model connection details.
- Gmail SMTP `verify()` completed successfully with the owner configuration. Verification sent no email.
- Cloudflare Quick Tunnel returned 200 for the public invite page and remained connected to the local service.
- Dev/build isolation: production output uses `.next-build`, preventing `next build` from corrupting a running `.next` development server.
- `npx --yes ngrok version`: ngrok CLI 3.39.10 is available through the tunnel script path.

## Failed or unavailable external checks

- The configured external model endpoint had one transient connection timeout earlier in testing, then recovered. The provider model-list request and JobPilot model health check both returned success; the browser displayed `模型服务连接正常`.
- Real email delivery was not executed; only SMTP authentication was verified, so end-to-end delivery and bounce handling remain unverified.

## Remaining warnings

- Node.js 22 reports `node:sqlite` as experimental.
- `npm audit --omit=dev` reports three high-severity findings inherited through Next.js 15 PostCSS/Sharp dependencies. Automatic remediation requires a breaking Next.js 16 upgrade.
- Physical-device soft-keyboard behavior was not available; responsive browser checks and touch sizing were inspected instead.
- Cloudflare Quick Tunnel URLs are temporary and change whenever the tunnel restarts; this is not a durable production hostname.
- Real `/api/matches` verification ran twice against the configured Terra Responses API without calling any application or SMTP endpoint. One run timed out; the next completed with zero jobs after strict validation. Both persisted zero-result runs with explicit warnings and no demo fallback; URL overlap was zero.
- A non-empty live result with an official first-party citation and public recruitment email was not produced in the latest run, so end-to-end verification of a displayed live job remains pending.

## 2026-08-14 session — Gmail or zero-config platform relay, with BCC

This section supersedes the earlier Outlook and manual SMTP/QQ/163 configuration notes. The current product has exactly two sign-in/send paths: Gmail uses Google OAuth plus the Gmail API; every non-Gmail address enters directly and uses the shared Resend sender. No user-facing SMTP host, port, mailbox password, app password, or authorization-code setup remains.

Changes:
- `ResendSubmissionAdapter` now sets both `reply_to` and `bcc` to the user's login email. The recipient can reply directly to the applicant, while the applicant receives a blind copy of the complete relayed message and attachment. Gmail API messages deliberately do not add BCC because Gmail already stores the sent message.
- Initial matched-job delivery, failed-task retry, and user-initiated delivery to a specified address all pass the same relay-copy address.
- `EmailSubmissionAdapter`, the `/api/settings` and `/api/smtp` routes, and the QQ/163 form and guidance were removed. Existing legacy database rows were not deleted or reset; the runtime no longer reads them as a send channel or returns them to the browser.
- `/api/state` now exposes only a minimal send status (`gmail_api`, `resend`, or `unavailable`), never SMTP settings or server credentials.
- Direct email entry rejects `gmail.com` and `googlemail.com`, guiding those users through Google OAuth. Other mailboxes require no additional configuration.

Verification (no real email sent):
- `npx tsc --noEmit`: passed.
- `npm test`: 7 files, 28 tests passed. Two new mocked-network tests assert Resend includes `reply_to` + `bcc`, and Gmail MIME contains no Bcc header.
- `npm run build`: passed; the generated production route list contains neither `/api/settings` nor `/api/smtp`.
- Playwright/Chrome: the sign-in page showed only Google OAuth and non-Gmail email entry; direct Gmail entry produced the intended Google-login error; a reserved test account reached `/profile`, where the send method was shown as zero-config platform relay with reply and blind-copy behavior. No legacy SMTP/QQ/163 controls were present.

## 2026-08-16 session — immediate selection feedback and visible application progress

Changes:
- Matched-job checkboxes now update optimistically. Individual and select-all changes no longer reload the full `/api/state`; failed saves roll back and show an inline reason, recovery hint, and retry button.
- `POST /api/applications` now only creates durable tasks. `POST /api/applications/process` atomically claims one `WAITING` task, processes it, and records the result, so the confirmation button can display `正在发送 1/N` while untouched tasks remain recoverable.
- Waiting tasks expose `继续发送`; failed email tasks are re-queued before retry. Unknown task actions return 400, and retries use the resume version saved on the original task.
- Gmail and Resend requests now have bounded timeouts. Resend receives the task id as its idempotency key; Gmail MIME receives a stable task-based Message-ID. Timeout states explicitly warn the user to check sent/BCC copies before retrying.
- Selection, confirmation, retry, and manual-send failures use page-level status panels instead of native error alerts. Buttons disable immediately and display a spinner/status label.

Verification (no real email sent):
- `npm test`: 9 files, 32 tests passed. New mocked tests cover atomic task claiming, stored resume-version use, Resend idempotency headers, Gmail stable Message-ID, and the absence of Gmail BCC.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed; `/api/applications/process` is present in the production route list.
- Restarted the confirmed JobPilot `next start` process. Local and public `/gate` both returned HTTP 200 with matching response sizes.
- Playwright inspected the public gate at desktop and 390x844 mobile sizes; both rendered without console errors. Authenticated pages were not captured to avoid exposing resume or account data.

## 2026-08-16 incident — hidden results were included by select-all

Observed impact:
- The UI rendered the top 5 results, but the match run contained 10 stored results. The old select-all endpoint updated every row in the run, and task creation consumed every selected row.
- A read-only status audit after the user reported `3/10` found 5 visible tasks and 5 hidden tasks, all already recorded as `SUCCESS`. The service was paused immediately, but the sends had completed and could not be recalled. No recipient, resume, or user fields were printed during the audit.

Fix:
- Added one shared `MATCH_RESULT_LIMIT=5` definition for state rendering and application scope.
- Selection requests now include the exact visible result ids. The server validates that list, clears hidden selections, and select-all can only select those explicit ids.
- Application task creation has a separate SQL-level guard that accepts selected rows only from the overall top 5 results, so stale or malformed selection state cannot expand a batch.

Verification:
- `npm test`: 12 files, 37 tests passed, including explicit-visible-id select-all and task-creation scope regression tests.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- Restarted JobPilot after the fix; local and public `/gate` both returned HTTP 200. No test email was sent.

## 2026-08-16 session — archive the completed match batch

User request: after a batch has been confirmed for application, returning to Matches must show an empty completed state. Existing application history must remain intact, and only an explicit click on `刷新新岗位` may start and display another live search.

Changes:
- Added `match_runs.consumedAt`. Task creation and consuming the current match run now happen in the same database transaction. A second confirmation of the same consumed run returns HTTP 409 instead of recreating or reprocessing the batch.
- Database startup compatibility backfills older runs that can be linked to already-created application tasks. This only adds archival metadata; it does not delete jobs, match results, tasks, history, or delivery evidence.
- `/api/state` keeps the consumed run metadata and all application tasks, but returns `run.results: []` for that run. The Matches page renders `本轮岗位已处理完成` with a `刷新新岗位` button. The live `/api/matches` request is made only after that button (or the existing refresh icon) is clicked.
- Old search warnings are hidden on the completed-batch empty state. Application records remain available on the Applications page.

Current-data reconciliation:
- Read-only inspection found that the actually applied run had already been backfilled as consumed. A later extra match run existed with 10 stored results and no linked application tasks, so it could not be safely inferred as applied by the compatibility backfill.
- To restore the requested current UI state, exactly that one latest extra run was marked consumed. Its 10 stored results remain in the database; no application task or delivery record was changed or removed.

Verification (no real email sent):
- `npm test`: 13 files, 40 tests passed. Regression coverage verifies transactional run archival, duplicate-confirm rejection, an empty result list for consumed runs, and preservation of application tasks in state.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed (19 pages generated; only the existing Node.js `node:sqlite` experimental warning appeared).
- Restarted the confirmed JobPilot `next start` process on port 3000. Local `/gate` returned HTTP 200. The ngrok tunnel still points to `http://localhost:3000`; a public request with the ngrok browser-warning bypass header returned HTTP 200, the `JobPilot` title, and the same response size as local.
