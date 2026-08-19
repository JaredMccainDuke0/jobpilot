# Implementation Plan

- M0: specifications, state model, security and acceptance criteria.
- M1: Next.js, built-in SQLite storage, scripts, configuration and traceable seed jobs.
- M2: upload, parsing candidate, correction, confirmation and preferences.
- M3: deterministic rules, scoring, evidence, details and persistent selection.
- M4: confirmation gate, transaction queue, idempotency, mock execution and manual fallback.
- M5: responsive QA, error states, tests, build verification and report.

Primary risks are unsafe external actions, secret leakage, invented job facts, duplicate submission, native Windows dependencies, and mobile fixed-bar overlap. Defaults are mock adapters, no secret persistence, structured source records, database uniqueness, dependency-light scripts, and explicit viewport checks.
