# JobPilot

[![CI](https://github.com/VELIR5/jobpilot/actions/workflows/ci.yml/badge.svg)](https://github.com/VELIR5/jobpilot/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/github/package-json/v/VELIR5/jobpilot)](https://github.com/VELIR5/jobpilot)

[简体中文](README.zh-CN.md) · [Live demo](https://job.vcrelay.com:8443) · [Issues](https://github.com/VELIR5/jobpilot/issues)

JobPilot is a resume-aware job matching and application assistant. It helps a
candidate parse a resume, describe job preferences, search for real vacancies,
review matching evidence, and prepare or submit an application after explicit
confirmation.

The repository contains a Next.js web application and a native WeChat
mini-program client. Both clients use the same server-side domain and API
contracts.

> The live demo is a deployment endpoint, not an availability or delivery
> guarantee. Job data, model responses, and email delivery must be independently
> reviewed by the user.

## What it does

- Email-based access with signed HttpOnly browser sessions.
- Resume upload and deterministic PDF/DOCX text extraction with confirmation.
- Preference capture for target city, role family, industry, and work mode.
- Model-assisted web search with schema validation, city matching, source
  evidence, deduplication, pagination, and local filtering.
- Explicit separation between email-eligible vacancies and official manual
  application channels.
- Application tasks, idempotency, status history, and user-scoped records.
- Optional Google OAuth and central platform email relay through Resend.
- Native WeChat mini-program pages for login, resume, preferences, matches, and
  application history.

## Safety boundaries

JobPilot deliberately favors an honest incomplete result over a fabricated one.

- External job pages and model output are untrusted input.
- A job must pass the configured source, URL, city, and schema checks before it
  becomes a formal result.
- The system never guesses a hiring email, company, vacancy, URL, qualification,
  or delivery result.
- A vacancy without a directly verified application email remains a manual or
  official-portal action; it is not auto-emailed.
- Real email submission requires user selection, final confirmation, valid
  sending configuration, and an idempotent application task.
- Tests and CI use mocks and do not send real email or search a user's resume.
- The project does not bypass login, CAPTCHA, rate limits, access controls, or
  site rules.

See [`docs/SECURITY_PRIVACY.md`](docs/SECURITY_PRIVACY.md) and
[`SECURITY.md`](SECURITY.md) for the full boundary.

## Architecture

```text
Web browser / WeChat mini-program
                 |
                 v
        Next.js API routes and middleware
                 |
      signed Cookie or Bearer session
                 |
                 v
     Domain rules + Node.js built-in SQLite
          |                    |
          v                    v
    Resume parser       Search/model adapter
          |                    |
          +----------+---------+
                     v
             Application task state
                     |
                     v
       User-confirmed submission adapter
```

The server stores its SQLite database at `%LOCALAPPDATA%\JobPilot\jobpilot.db`
on Windows, or under the local application data directory used by the runtime.
`node:sqlite` is used directly; Prisma is retained only for the existing schema
and initialization script, not as the runtime database engine.

## Requirements

- Node.js 22.5 or newer. Node 22 is required for the built-in SQLite runtime.
- npm with network access to install the locked dependencies.
- A model provider with an OpenAI Responses-compatible endpoint for live search.
- Google Cloud OAuth credentials only if Google login is enabled.
- WeChat mini-program credentials only if the mini-program login exchange is
  enabled.
- Resend sender credentials only if central email relay is enabled.

## Local development

```powershell
npm ci
Copy-Item .env.example .env
# Fill the required values in .env using your own local secrets.
npm run db:push
npm run dev
```

Open `http://localhost:3000`. The `.env` file, database, uploads, and logs are
ignored by Git and must never be committed.

The minimum useful server configuration includes:

| Variable | Purpose |
| --- | --- |
| `JOBPILOT_SESSION_SECRET` | Signs browser and Bearer sessions. Use a long random value. |
| `JOBPILOT_ACCESS_PASSWORD_HASH` | Shared gate password hash for the sign-in page. |
| `JOBPILOT_INVITE_PASSWORD_HASH` | Invitation hash used for account registration. |
| `JOBPILOT_MODEL_BASE_URL` | OpenAI-compatible provider base URL. |
| `JOBPILOT_MODEL_API_KEY` | Server-only model credential. |
| `JOBPILOT_MODEL_NAME` | Provider model identifier. |
| `JOBPILOT_MODEL_REASONING` | Optional reasoning effort accepted by the provider. |

All supported variables and security notes are listed in [`.env.example`](.env.example).
The runtime does not read `DATABASE_URL`; local SQLite location is selected by
the Node runtime and `LOCALAPPDATA`.

## Production start

```powershell
npm ci
npm run db:push
npm run build
npm run start
```

`next start` loads the production build once at startup. After changing server
code or environment configuration, rebuild and restart the process. Put the
application behind HTTPS and a deployment-specific access control layer; a
tunnel only supplies transport and does not replace authentication or tenant
isolation.

## WeChat mini-program

1. Import [`miniapp/`](miniapp/) into WeChat Developer Tools.
2. Replace the placeholder AppID in `project.config.json` with your own AppID.
3. Set the production HTTPS API origin in [`miniapp/config.js`](miniapp/config.js).
4. Configure the API origin as a legal request and upload domain in WeChat.
5. Run `npm run check:miniapp` before device testing.

The mini-program package contains no model key, mail key, database, resume, or
server session secret. Real WeChat login, upload, navigation, and device
acceptance still require WeChat Developer Tools and a real device.

## API surface

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/gate` | Verify the shared access gate. |
| `POST` | `/api/invite` | Register or start web email access. |
| `POST` / `PUT` | `/api/miniapp/session` | Exchange a WeChat login code or bind an account. |
| `GET` | `/api/state` | Read the current user's scoped application state. |
| `POST` | `/api/resume` | Upload and parse a resume. |
| `POST` | `/api/resume/confirm` | Confirm the parsed resume version. |
| `POST` | `/api/preferences` | Save confirmed job preferences. |
| `POST` | `/api/matches` | Run a live search and save matching results. |
| `POST` | `/api/matches/select` | Select or clear a vacancy. |
| `POST` | `/api/applications` | Create confirmed application tasks. |

The API accepts either the signed web Cookie or a separate Bearer session. A
mini-program token is never written into a browser Cookie.

## Verification

Run the same checks locally and in CI:

```powershell
npm run typecheck
npm test
npm run check:miniapp
npm run audit
npm run build
```

The latest local baseline on 2026-09-04 was 18 test files and 66 tests, with
TypeScript checking and the production build passing. The build may print
Node.js's known `node:sqlite` experimental warning; the command exit status is
the authoritative result.

Automated checks do not replace deployment or device acceptance. The following
remain environment-dependent:

- Real model-provider search and its source availability.
- Production database, OAuth, WeChat, and email-provider configuration.
- Real WeChat login, upload, navigation, and application flow.
- Actual email delivery. A submission record is not proof of delivery.

## Project documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): domain and adapter boundaries.
- [`docs/CROSS_PLATFORM_ARCHITECTURE.md`](docs/CROSS_PLATFORM_ARCHITECTURE.md): H5 and mini-program contract.
- [`docs/SECURITY_PRIVACY.md`](docs/SECURITY_PRIVACY.md): application privacy model.
- [`docs/TEST_REPORT.md`](docs/TEST_REPORT.md): historical verification evidence.
- [`docs/GOOGLE_OAUTH_SETUP.md`](docs/GOOGLE_OAUTH_SETUP.md): Google OAuth setup.
- [`HANDOFF_2026-09-02.md`](HANDOFF_2026-09-02.md): current project handoff.

## Contributing and license

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a pull request. Report
security issues privately according to [`SECURITY.md`](SECURITY.md).

JobPilot is released under the [MIT License](LICENSE). Third-party packages
retain their own licenses.
