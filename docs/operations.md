# Quotas, cost and privacy operations

## Four different media dimensions

| Application field | Ordinary-user default | Unit / reset |
| --- | ---: | --- |
| `images` | 1,000 | Stored image count; released after provider deletion succeeds |
| `imageDeliveries` usage | No delivery cap | Image responses requested from ishare, UTC calendar month; operator monitoring only |
| `videoSeconds` | 3,600 | Stored/reserved video seconds, displayed as minutes |
| `videoDeliverySeconds` usage | No delivery cap | Requested HLS segment duration, displayed as minutes, UTC calendar month; operator monitoring only |
| `dailyUploads` | 50 | Upload grants reserved per UTC day |
| `videoDuration` | 600 | Maximum seconds per new video |

Image count and video duration control storage costs. File byte size is shown as metadata and validated for uploads; it is not presented as the primary storage quota. Pending video grants reserve their maximum duration before contacting Stream. Publication replaces the reservation with the provider's rounded-up actual seconds. Failed uploads automatically remove their new allocations. Unknown allocation outcomes retain reservations until an exact creator/application-metadata lookup and upstream deletion or confirmed absence finishes. No manual reconciliation is required.

Image requests count once; HLS playlists, encryption keys, initialization data and HEAD probes do not count as video playback. Each media segment uses its authenticated playlist duration; replay, buffering, retries, range requests and parallel quality/audio tracks conservatively record corresponding duration. Browser-cached requests never reaching ishare do not increment counters. Worker cache hits do increment user sharing usage. Failed requests can retain a delivery reservation. These conservative application counters are not a replacement for the Cloudflare bill, which measures its own delivery requests. Resource-account traffic outside ishare cannot be controlled by these counters. No API billing bypass or fixed currency ceiling is promised.

The default shared non-operator budgets are 10,000 stored images, 36,000 stored/reserved video seconds, and 500 uploads/day. Delivery counts and durations are monitored without per-user or shared delivery quota enforcement. Personal sites can share normally; storage ceilings, verified identities, allocation frequency and human abuse management bound resource stockpiling. These controls do not claim to prevent coordinated abuse using multiple real accounts. Operator resources and their delivery are excluded. Increase these alongside individual limits when capacity permits. The verified GitHub operator edits new-user defaults and shared budgets in avatar menu → Administration → Platform quotas; SQLite stores them rather than environment variables. Changing defaults freezes existing effective and pending user quotas; shared reductions are announced seven days ahead unless urgent. Null limits mean unlimited; zero prevents that kind of new use. Lowering storage below current use preserves existing resources and blocks further allocation after the grace period.

Private viewing uses the image blob API and signed Stream playback behind the proxy. Existing Images variants configured with `neverRequireSignedURLs: true` still bypass Cloudflare image signatures when someone knows their provider URL. ishare does not change another application's variants. Proxying hides upstream addresses from ordinary viewing; it cannot revoke an independently public provider URL or prevent a publisher from redistributing media.

## Market reference, checked 2026-10-04

These providers use incompatible quota units, so there is no honest single “largest free quota” ranking.

| Service | Published free offering | Relevance |
| --- | --- | --- |
| [ImageKit](https://imagekit.io/plans/) | 3 GB storage, 20 GB monthly bandwidth, 500 monthly video units; 25 MB image and 100 MB video uploads | Closest mixed-media reference; bytes/video units cannot be equated to Stream minutes |
| [Cloudinary](https://cloudinary.com/pricing) | 25 monthly credits shared between resource dimensions | Flexible pool, not 25 GB storage plus 25 GB traffic simultaneously |
| [ImgBB API](https://api.imgbb.com/) | Images up to 32 MB | Image-only size reference; no verified numeric free storage/traffic quota claimed here |

The ishare defaults are an operator-selected conversion to provider-relevant dimensions, not a promise of matching these third-party plans. [Images pricing](https://developers.cloudflare.com/images/pricing/) charges stored/delivered counts. [Stream pricing](https://developers.cloudflare.com/stream/pricing/) charges stored and delivered minutes; encoded variants do not each multiply storage and actual preloaded segments count as delivery. Images/Stream hosted storage is paid even if a Worker has a free request allowance. Use resource-account billing alerts to track actual spend.

## Restriction and privacy workflow

The controller is JS.GRIPE; privacy contact is **helper@js.gripe**, as already configured on the operator's website. Publishing and delivery process identity/media to supply the requested service; security and restrained abuse records support operating it. Optional embeds are also subject to the hosting site's consent and disclosures. GitHub and Cloudflare receive their required network requests; operators must assess provider contracts, international transfers and regional legal applicability for their deployment.

1. Raise a quota immediately with a visible reason, or schedule an ordinary reduction/suspension seven days ahead. The user's account shows the reason, pending limits and effective date. Seven days is this service's policy, **not a GDPR statutory quota-change deadline**. No automatic deletion follows a quota reduction. For urgent abuse, use the explicit immediate option with a specific reason; the action is logged and permits human review.
2. A suspended user retains authentication, metadata export, owned-media deletion, account erasure and requests for appeal/correction/restriction. A rights request enters the operator queue with a **calendar-month** response deadline. The software records the deadline; an operator must actually review and answer. Do not regard automatically marking a request answered as fulfilling the request. Refusals, extensions and justified retention require specific explanations and applicable complaint/remedy information.
3. Export supplies machine-readable identity, attribution, captions, quota state and request records. Public media links remain in the export; this is a metadata export, not an archive of the original uploaded video. Stream does not retain a retrievable exact original through this service. An operator must handle any additional file-copy/access request and disclose available formats. Do not tell users a metadata export contains their original media bytes.
4. Account erasure makes known published media unavailable immediately, schedules provider removal, and then scrubs the account, public profile, media metadata, sessions, rights records and identifiable administrative history. Provider deletion failures schedule a one-time alarm for remaining work; no cron runs when the queue is empty. Ambiguous allocations are matched by exact application metadata and creator, never filenames alone, then removed automatically. Erasure requests are visible in the rights queue until completion. Do not mark deletion complete while upstream removal or reconciliation remains outstanding. Ordinary individual deletion keeps non-byte records at most thirty days; administrative history and answered requests at most ninety days, unless earlier account erasure removes them.
5. Share HTML may remain cached thirty seconds, media five minutes. Independently downloaded copies cannot be recalled. On applicable erasure/restriction requests, assess notices to recipients and removal of controllable caches/backups; do not promise instant erasure from third parties. GitHub/Cloudflare maintain their separate platform records under their policies.

This implements technical support for transparency, access, rectification, restriction, erasure and human review. GDPR compliance also requires the controller's lawful basis, required disclosures, actual handling of rights requests and processor/transfer arrangements. See the official [GDPR Articles 5, 12–22 and 28](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng); the project does not claim certification.

## Social posts and migration

Posts contain text and up to 50 owned, published attachments. Attachment order is preserved. A post enters the homepage feed only when its publisher explicitly opts in; legacy uploads remain outside it. Homepage visibility can be changed independently of the public share link. Public author profiles list all published posts by that numeric GitHub identity, including posts excluded from the homepage. Profile display name and plain-text biography can be edited in Personal center; identity, authorization and quota ownership remain tied to the verified GitHub ID. Profile tables and the owner-post index are additive; account export includes the profile and completed erasure removes it. Complete posts are rendered by oEmbed; Markdown lists each original image proxy URL separately, with viewing links for videos. Files have no extra application byte cap beyond the provider’s 10 MB image and sub-30 GB video limits. Storage remains measured as image count and video seconds.

The existing ShareStore class, migration tag and namespace are retained when the deployment root moves to /ishare.js.gripe. New post tables are additive; existing media links and policies remain readable. Update the Git build root and GitHub OAuth callback, and attach the new domain to the existing Worker. Changing domain does not transfer HttpOnly login cookies; publishers sign in again.
