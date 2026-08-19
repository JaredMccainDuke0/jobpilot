# Architecture

The Next.js UI calls application API routes. API routes validate the signed user session, scope every query to that user, and coordinate domain rules, SQLite transactions, and adapters. Domain modules do not depend on HTTP or storage. Node 22's built-in SQLite driver stores multi-user state without a separate native schema engine. Model and submission adapters return untrusted results and never write business data directly.

Resume -> confirmed parse version -> preference -> match run -> match results -> selected results -> application tasks -> append-only status history.

Deterministic city, graduation-year, and work-mode checks precede semantic evidence scoring. Job descriptions are delimited untrusted content; instruction-like text is ignored and recorded as risk. External model responses must be schema validated before persistence.

Task creation and initial history share a transaction. `idempotencyKey` is unique. Mock execution transitions WAITING -> PROCESSING -> SUCCESS. Unsupported verified channels transition directly to NEEDS_USER. Real email remains behind `SubmissionAdapter` and requires explicit configuration and final confirmation.

PDF.js and Mammoth extract local resume text before deterministic field structuring. Extraction failures are returned as actionable 422 responses. Model health checks call the configured OpenAI-compatible service. Verified email jobs may use the SMTP adapter only after final confirmation; mock jobs remain side-effect free.

Registration requires the hashed invitation password. Users then authenticate with their own scrypt-hashed password and receive an HMAC-signed HttpOnly session cookie. The server-wide model URL, model name, and API key never enter user state responses. User SMTP passwords are AES-GCM encrypted with authenticated user/key context. A tunnel only supplies HTTPS transport; it does not replace authentication or tenant isolation.
