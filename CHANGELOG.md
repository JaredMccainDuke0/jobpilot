# Changelog

All notable changes to JobPilot are documented here. This project follows a
small, human-readable changelog rather than claiming formal release semantics
before a tagged release exists.

## [Unreleased]

- Added bilingual public-project documentation and repository governance files.
- Added CI validation for TypeScript, tests, production builds, and mini-program
  source files.
- Added explicit repository metadata and a Node.js runtime requirement.
- Replaced click-triggered model web search with a scheduled, bounded job
  catalog fed by configured public ATS, JSON, RSS, or Atom sources.
- Added deterministic freshness, expiry, deduplication, retention, and catalog
  status reporting for user and mini-program matching.
- Removed fabricated seed vacancies and the unused model-search runtime path.

## [0.1.0] - 2026-09-04

- Delivered the Next.js H5 flow for email access, resume parsing, preferences,
  matching, job selection, and application tracking.
- Added the native WeChat mini-program client and shared Bearer-session APIs.
- Added verified-source search boundaries, pagination, filtering, and explicit
  manual-handling states.
- Kept real email submission behind user confirmation and configured sending
  credentials.
