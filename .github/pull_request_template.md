## Summary

Describe the user-visible or engineering change.

## Verification

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run check:miniapp` (when mini-program files are affected)
- [ ] `npm run build`
- [ ] Manual verification is listed separately from automated verification.

## Safety and data

- [ ] No `.env`, credential, database, upload, resume, or personal data is included.
- [ ] No real email was sent by tests or verification.
- [ ] External model, job-page, URL, and email content remains untrusted.
- [ ] Authentication, tenant isolation, and submission behavior were reviewed when affected.

## Remaining limitations

List deployment, provider, browser, WeChat device, or email-delivery checks that
could not be performed.
