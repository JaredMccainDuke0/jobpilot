# Architecture

JobPilot is a local-catalog job matching application. A scheduled worker reads
configured public vacancy feeds, normalizes and validates their records, and
stores a bounded, freshness-aware snapshot in SQLite. User requests only read
that snapshot and apply deterministic matching rules.

```text
Public ATS / JSON / RSS / Atom feeds
                 |
       scheduled catalog worker
                 |
  fetch bounds + normalization + dedupe
                 |
       expiry and retention policy
                 v
       SQLite job catalog snapshot
                 |
        user-scoped local query
                 |
       deterministic match scoring
                 |
     explicit selection and confirmation
                 |
       submission task and history
```

The Next.js Node process starts the scheduler through `src/instrumentation.ts`.
Deployments may instead run `npm run catalog:worker` under a process manager,
or invoke `npm run catalog:refresh` from a scheduler. A database lease prevents
overlapping refresh jobs across processes.

## Boundaries

- Domain modules do not depend on HTTP or storage.
- Feed adapters return untrusted records; they do not write business data
  directly.
- The catalog worker owns source freshness, deduplication, expiry, retention,
  and active-row limits.
- API routes validate the signed user session, scope every query to that user,
  and create immutable match-run snapshots.
- Matching uses deterministic city, graduation-year, work-mode, and capability
  checks. It does not call a model or perform network search during a user
  request.
- Real email submission remains behind explicit user confirmation, verified
  channel checks, configured sender credentials, and an idempotent task.

## Data lifecycle

```text
feed item -> normalized job -> active catalog row -> match snapshot
                                     |                    |
                                     v                    v
                              stale/expired         selected task
                                     |                    |
                                     +--> bounded cleanup  +--> append-only history
```

Jobs referenced by match or application history are retained as evidence. Other
expired catalog rows are eligible for cleanup after the configured retention
period. See [`JOB_CATALOG.md`](JOB_CATALOG.md) for source configuration and
freshness policy.

## Cross-client behavior

The web UI and WeChat mini-program consume the same state and resource APIs.
The web UI uses a signed HttpOnly Cookie; the mini-program uses a separate
Bearer session. A mini-program token is never written into a browser Cookie.
Neither client implements the catalog or submission rules as its only source of
authority.
