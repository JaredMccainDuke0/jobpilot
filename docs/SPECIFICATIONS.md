# Product Specifications

## Core flow

1. Upload a PDF, DOCX, or TXT resume up to 5 MB, inspect parsed fields, fill missing values, and explicitly confirm a new immutable parse version.
2. Describe the target role in natural language; optionally add city, role, industry, and work mode.
3. Run deterministic eligibility rules before semantic scoring, inspect evidence and unknowns, select eligible jobs, and confirm the submission list.

Onboarding hides global navigation and preserves server-side data. Empty, loading, validation, failure, manual-action, and completed states always expose a next action.

## Mobile acceptance

Primary viewports are 375x812, 390x844, and 430x932; 1280px desktop must remain usable. Touch targets are at least 44px. Safe-area padding, fixed navigation, selection toolbar space, keyboard-reachable fields, wrapping, and zero horizontal overflow are required.

## Submission rules

Only confirmed resumes and verified sources may proceed. Mock channels can execute automatically. Other verified channels become `NEEDS_USER` with the official entry. Unverified sources are blocked. Duplicate requests reuse the unique idempotent task. History is append-only.
