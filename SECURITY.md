# Security

## Report privately

Do not publish exploit details, secrets, personal documents or production data in issues or PRs. Use this repository's private vulnerability reporting option if available, or email **helper@js.gripe** with the subject "Security: ishare".

Include the affected commit/version, platform, impact, a minimal sanitized reproduction and possible mitigation. Use dummy accounts/data, not live credentials. We can agree on a private way to exchange a sensitive fixture if needed.

## Scope and maintenance

Reports about current `main` source and reproducible regressions are welcome. There is no promised response SLA, automatic backport policy or security certification. Operators should review changes and dependency advisories before deploying. Vendor platform/provider issues belong to their vendor.

This is a complete public source distribution, not permission to change the operator deployment. Preserve storage identity, ownership, CSRF, quotas, deletion and media privacy. Use mocked providers and isolated databases; never upload test media to production.

Ordinary bugs/ideas can use public issues. Coordinate disclosure after a fix and verification. Do not test someone else's live service without authorization.
