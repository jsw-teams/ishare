# ishare development

- ishare is the standalone image and video publishing service at https://share.js.gripe. It is separate from website hosting and iask.
- Keep platform entry points under backend/cloudflare. Existing web/connect DNS/WARP code, bindings, routes and storage are outside this project and must not be changed.
- The operator manages routes. Disable workers.dev and preview URLs. Images and Stream belong to separately configured resource accounts; account IDs, API tokens and signing keys are Secrets, never browser configuration.
- Browser business calls use /api and validated X-Service-Action / X-Service-Resource headers. Standard /oembed supports the standard discovery protocol; canonical share, embed and media paths contain opaque application IDs.
- Authenticate publishers using GitHub's numeric user ID. Apply CSRF, ownership, upload reservations and bounded quotas before minting direct upload URLs. Do not imply verified ownership of a source website.
- Media delivery must proxy private upstream resources without redirects, provider IDs, customer subdomains or signed upstream URLs in public responses. Rewrite every HLS resource reference using authenticated opaque tickets; fail closed on unsupported manifest syntax and untrusted destinations.
- Keep upstreams private and signing keys server-side. Public delivery is shareable, not DRM. Cache hashed assets for one year, and bound media caching so deletion has a documented propagation window.
- Never claim live upload, playback, account configuration or deployment validation unless actually performed. Remove genuinely unused code and preserve unrelated user edits.
- Track image storage counts, image delivery counts, stored video seconds and delivered HLS segment seconds separately. Restrict stored images/videos and allocation frequency, not ordinary image delivery or playback; delivery dimensions are operator monitoring metrics. File bytes are upload metadata, not the media storage billing quota. Identify the operator by verified numeric GitHub ID and exempt the operator from all application quotas and shared budgets.
- Administrative quota and permission changes need user-visible reasons. Ordinary reductions use seven days of notice without deleting existing media; urgent abuse restrictions are explicit and preserve access to export, erasure and human review. Rights requests use calendar-month response deadlines; never describe technical support as certified GDPR compliance or claim erasure complete before provider cleanup.

- Canonical source is web/share.js.gripe. The complete directory is synchronized to the public ishare GitHub source mirror. Frontend pages use EdgePress; all backend entry points belong to backend/cloudflare. No public frontend release, cross-repository source fetching or credentials in generated assets.
- dist and .site-static are generated. Source UI fragments are in plugins/application; browser logic lives in static/ishare. Keep nav/footer, language switching, keyboard focus and immutable asset hashes.

- The operator Worker deploys from jsw-teams/web, root share.js.gripe. The public jsw-teams/ishare repository is a source mirror for distribution, not the operator deployment source. Keep Secrets only in Cloudflare.
