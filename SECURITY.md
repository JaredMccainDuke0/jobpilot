# Security Policy

## Supported versions

Only the latest commit on the default `master` branch is supported. This
project is still evolving and does not currently publish long-term support
releases.

## Reporting a vulnerability

Please do not disclose credentials, resume contents, personal data, or an
unfixed vulnerability in a public issue. Use GitHub's private vulnerability
reporting for `VELIR5/jobpilot` when it is available, or contact the repository
owner through the GitHub profile and include only the minimum reproducible
details.

When reporting, include the affected commit, deployment context, reproduction
steps, impact, and any logs with secrets and personal data removed. Do not send
API keys, OAuth secrets, SMTP passwords, session secrets, or uploaded files.

## Security boundaries

- Keep `.env`, databases, uploads, logs, and local configuration outside Git.
- Treat model output, job descriptions, URLs, email addresses, and resumes as
  untrusted input.
- Never bypass authentication, CAPTCHA, rate limits, access controls, or site
  rules when collecting job information.
- Real email submission requires user confirmation and is not part of tests.
- Rotate any credential that was accidentally exposed instead of deleting only
  the visible line from a commit.

See [`docs/SECURITY_PRIVACY.md`](docs/SECURITY_PRIVACY.md) for the application
security and privacy model.
