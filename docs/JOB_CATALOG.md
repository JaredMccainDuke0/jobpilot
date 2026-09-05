# Job Catalog

JobPilot uses a scheduled catalog instead of searching the public web when a
user clicks “match”. A server worker fetches configured public sources,
normalizes their records, removes expired or invalid vacancies, deduplicates
them, and stores a bounded local snapshot. User matching reads that snapshot
and does not send a resume or a search request to an external model.

## Source configuration

Copy `config/job-feeds.example.json` to `config/job-feeds.json`, then add only
sources that you are authorized to access and that clearly publish vacancy data.
The real configuration file is ignored by Git.

The worker reads the fixed `config/job-feeds.json` path. Deployments that cannot
mount a file may set `JOBPILOT_JOB_FEEDS` to the same JSON document; the inline
value takes precedence.

Supported source kinds:

- `greenhouse`: Greenhouse board API, normally a URL under
  `boards-api.greenhouse.io` with `?content=true`.
- `lever`: Lever postings API, normally a URL under `api.lever.co`.
- `json`: a JSON feed with an array at the root, `items`, `jobs`,
  `data.items`, `data.jobs`, or a configured `itemsPath`.
- `rss`: RSS or Atom feed. Company and city may be supplied on the feed when
  individual entries do not carry them.

The optional background web collector uses the configured model provider only
from the worker. It searches generic city and role-family plans, never includes
a user's resume or contact details, and applies the same public-page, citation,
city, expiry, and no-fabrication checks before a job enters the catalog. Set
`JOBPILOT_CATALOG_WEB_SEARCH=0` to disable it.

Example:

```json
{
  "feeds": [
    {
      "id": "acme-greenhouse",
      "kind": "greenhouse",
      "name": "Acme careers",
      "url": "https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true",
      "enabled": true,
      "official": true,
      "company": "Acme"
    },
    {
      "id": "regional-rss",
      "kind": "rss",
      "name": "Regional public vacancies",
      "url": "https://jobs.example.org/feed.xml",
      "enabled": true,
      "official": false,
      "city": "深圳"
    }
  ]
}
```

Set `official` to `true` only after confirming that the feed belongs to the
employer or an authorized official recruitment channel. An unverified feed can
still be cataloged for manual review, but it is not eligible for automatic
email submission.

For a generic JSON source, `fields` maps normalized names to dot-separated
paths in each item:

```json
{
  "id": "id",
  "title": "role.title",
  "company": "employer.name",
  "city": "location.city",
  "description": "description",
  "applicationUrl": "links.apply",
  "publishedAt": "dates.published",
  "expiresAt": "dates.expires"
}
```

Required normalized fields are title, company, city, a description of at least
20 characters, and a public application/source URL. An application email is
optional; when absent, the job remains a manual official-application item.
Emails are accepted only when they are explicit and syntactically valid in the
source record. JobPilot never invents an address.

## Refresh lifecycle

The Next.js Node process starts the scheduler automatically. For deployments
where a separate worker is preferred, run:

```powershell
npm run catalog:worker
```

For a one-shot refresh or a deployment scheduler:

```powershell
npm run catalog:refresh
```

The default interval is 60 minutes. Each source uses conditional requests when
the server provides an ETag or Last-Modified value. Redirects are limited and
must remain on publicly resolvable HTTP(S) addresses. Response size, timeout,
and concurrency are bounded.

## Freshness and retention

- A source record is searchable only while it has been seen within the stale
  window, which defaults to 48 hours.
- Explicitly expired records are hidden immediately.
- Records older than 45 days by publication/update time are rejected by
  default.
- Active jobs are capped at 5,000 by default.
- Unreferenced expired records are removed after 90 days by default.
- Jobs referenced by a user's match or application history are retained as
  evidence and are not silently deleted by catalog cleanup.

Change these bounds only after considering source volume, database size, and
the evidence-retention requirement. The runtime database remains outside the
repository under the local application data directory.

## Honest coverage boundary

There is no universal, stable, and permission-free “entire web” vacancy feed.
Broad coverage can combine legitimate employer ATS feeds, public recruitment
feeds, authorized JSON or RSS sources, and the optional generic web collector.
A missing or failed source is reported as missing coverage; the worker does not
fabricate vacancies or move web search into a user's request path.
