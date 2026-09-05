# Security and Privacy

- Resumes, uploads, SQLite databases, logs, test artifacts, `.env`, and local configuration are ignored by Git.
- API keys must never enter source, README examples, screenshots, database, test output, or logs. The server reads the ignored local `.env`; the browser receives only connection status.
- Feed records and job text are untrusted. They cannot modify rules, access local files, create contacts, or trigger submissions.
- No adapter may bypass authentication, CAPTCHA, rate limits, access controls, or site rules. Unsupported channels become manual actions with verified URLs.
- Logs contain identifiers, states, and sanitized summaries only. Uploaded paths are generated server-side and are never derived from user filenames. Feed responses are bounded before parsing and are treated as untrusted content.
- Demo and tests permit mock submission adapters only. Real email requires a verified source, explicit final confirmation, SMTP authorization, and a unique idempotency key.
- Public tunnels require the invite gate. The stored value is a password hash; the session cookie is HttpOnly and HMAC signed. ngrok credentials remain outside the repository.
- The invitation password authorizes registration only. Each user has a separate email/password login and all resume, preference, match, selection, application, and SMTP queries are scoped by user ID.
- User SMTP passwords are encrypted at rest with AES-256-GCM and never returned after saving. Feed credentials, when a provider requires them, remain server-side and are never returned to the browser.
