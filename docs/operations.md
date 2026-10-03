# Quotas, cost and privacy operations

## Four different media dimensions

| Application field | Ordinary-user default | Unit / reset |
| --- | ---: | --- |
| `images` | 300 | Stored image count; released after provider deletion succeeds |
| `imageDeliveries` | 10,000 | Image responses requested from ishare, UTC calendar month |
| `videoSeconds` | 600 | Stored/reserved video seconds, displayed as minutes |
| `videoDeliverySeconds` | 6,000 | Requested HLS segment duration, displayed as minutes, UTC calendar month |
| `dailyUploads` | 50 | Upload grants reserved per UTC day |
| `videoDuration` | 120 | Maximum seconds per new video |
| `videoBytes` | 1,073,741,824 | Maximum bytes per new video; a protocol limit, not a storage billing unit |

Image count and video duration control storage costs. File byte size is shown as metadata and validated for uploads; it is not presented as the primary storage quota. Pending video grants reserve their maximum duration before contacting Stream. Publication replaces the reservation with the provider's rounded-up actual seconds. Unknown allocation outcomes retain reservations for operator reconciliation rather than generating duplicate resources.

Image requests count once; HLS playlists, encryption keys, initialization data and HEAD probes do not count as video playback. Each media segment uses its authenticated playlist duration; replay, buffering, retries, range requests and parallel quality/audio tracks conservatively consume corresponding duration. Browser-cached requests never reaching ishare do not increment counters. Worker cache hits do increment user sharing usage. Failed requests can retain a delivery reservation. These conservative application counters are not a replacement for the Cloudflare bill, which measures its own delivery requests. Resource-account traffic outside ishare cannot be controlled by these counters. No API billing bypass or fixed currency ceiling is promised.

The default shared non-operator budgets are 1,000 stored images, 3,600 stored/reserved video seconds, 500 uploads/day, 100,000 image deliveries/month, and 60,000 video delivery seconds/month. Operator resources and their delivery are excluded. Increase these alongside individual limits when capacity permits. Null individual limits mean unlimited; zero prevents that kind of new use. Lowering storage below current use preserves existing resources and blocks further allocation after the grace period.

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
4. Account erasure makes known published media unavailable immediately, schedules provider removal, and then scrubs the account, media metadata, sessions, rights records and identifiable administrative history. Provider deletion failures retry hourly; ambiguous allocations require operator reconciliation. The operator must check the resource account for the matching application metadata/creator and remove any actual resource, then use “Release reconciled reservation” with a recorded reason; this button itself does not remove an unknown upstream file. Erasure requests are visible in the rights queue until completion. Do not mark deletion complete while upstream removal or reconciliation remains outstanding. Ordinary individual deletion keeps non-byte records at most thirty days; administrative history and answered requests at most ninety days, unless earlier account erasure removes them.
5. Share HTML may remain cached thirty seconds, media five minutes. Independently downloaded copies cannot be recalled. On applicable erasure/restriction requests, assess notices to recipients and removal of controllable caches/backups; do not promise instant erasure from third parties. GitHub/Cloudflare maintain their separate platform records under their policies.

This implements technical support for transparency, access, rectification, restriction, erasure and human review. GDPR compliance also requires the controller's lawful basis, required disclosures, actual handling of rights requests and processor/transfer arrangements. See the official [GDPR Articles 5, 12–22 and 28](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng); the project does not claim certification.
