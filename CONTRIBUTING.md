# Contributing to JobPilot

Thank you for helping improve JobPilot. Contributions should preserve the
project's strict boundary around real vacancies, user data, and email sending.

## Before opening a change

1. Create a focused branch from `master`.
2. Do not commit `.env`, databases, uploads, logs, resumes, screenshots with
   personal data, or API/OAuth/SMTP credentials.
3. Keep external model and job-site responses treated as untrusted data.
4. Add or update tests for behavior changes, especially authentication,
   tenant isolation, source verification, pagination, and submission safety.

## Local checks

```powershell
npm ci
npm run check
npm run build
```

`npm run check` runs the TypeScript check, Vitest suite, and mini-program JSON
and JavaScript validation. The production build may emit Node's known
`node:sqlite` experimental warning; that warning is not a successful substitute
for a failed command.

## Pull requests

Describe the user-visible change, affected API or data contracts, tests run,
and any remaining manual verification. State clearly whether a check used mock
adapters or a real external service. Never claim that an email was delivered
unless there is independent delivery evidence.

Do not add a demo or fabricated job to formal results. Do not send a real email
from tests or automated checks. Changes to authentication or cookies must
include both browser-session and Bearer-session coverage where applicable.
