---
title: Privacy and sharing
lang: en
slug: privacy
description: Know what becomes public, how information is kept, and how to control your media.
blocks:
  - columns: 1
    cells:
      - - type: hero
          eyebrow: ishare
          title: Know what becomes public, how information is kept, and how to control your media.
          mascotSrc: /brand/bear-mascot.290e2ec64418a2fa.webp
          mascotAlt: Black bear mascot
          mascotWidth: 512
          mascotHeight: 512
  - columns: 2
    cells:
      - - type: section
          title: Public content
          tone: soft
          blocks:
            - type: text
              paragraphs:
                - Published images, videos, captions and author identities are public. Viewers can download or share
                  them without signing in. Share only content you have the right to publish.
                - The choice to appear on the platform homepage is stored with the post and is off by default. You can
                  change it in My shares. Keeping a post out of the feed does not make its share links private.
      - - type: section
          title: Identity and media storage
          tone: soft
          blocks:
            - type: text
              paragraphs:
                - Publishers sign in with GitHub. We keep your numeric user ID, username and display name to authorize
                  publishing and deletion. Your avatar is fetched from GitHub through this site. We do not request email
                  or repository permissions.
                - Cloudflare Images and Stream store and encode media. Your browser uploads files and necessary network
                  information to a one-time Cloudflare address. Viewing uses our media proxy. Necessary data may be
                  processed across global locations under provider policies.
  - columns: 2
    cells:
      - - type: section
          title: Cookies and retention
          tone: soft
          blocks:
            - type: text
              paragraphs:
                - Secure HttpOnly session cookies last at most one day and expire on logout. One-use OAuth state lasts
                  ten minutes. Short-term rate limits use hashed records; raw IP addresses are not stored as public
                  media information.
                - Known unfinished uploads are generally cleaned up after one day; uncertain upstream outcomes need
                  review. Daily-quota deletion records last at most thirty days without media bytes. Identifiable
                  administration and answered privacy-request records expire after ninety days, earlier on completed
                  account erasure.
      - - type: section
          title: Deletion and administration
          tone: soft
          blocks:
            - type: text
              paragraphs:
                - You may delete your own media. Our public caches can last five minutes; independent copies on other
                  sites are outside our control. Administration can remove abusive content.
                - Image storage count, image delivery count, stored video duration and delivered video duration are
                  tracked separately. Deliveries are monitoring metrics without ordinary viewer caps; preloads and
                  repeated requests may count. Ordinary reductions or suspension require a clear reason and seven days
                  of notice. Explicit urgent abuse can suspend new uploads, publishing or public sharing immediately.
                  Quota changes do not automatically delete existing media.
  - columns: 2
    cells:
      - - type: section
          title: Your data and rights
          tone: soft
          blocks:
            - type: text
              paragraphs:
                - Publishing restrictions preserve metadata export, deletion, correction, restriction requests and human
                  review. Export is JSON metadata and does not include original video files. Privacy requests have a
                  calendar-month response deadline and require actual operator handling.
                - Account erasure stops known public media, then removes provider resources, the account and associated
                  personal records. Provider failures retry; uncertain uploads need manual review. Pending erasure is
                  not treated as complete.
                - Necessary identity and media data provide requested login, publishing and sharing; minimal rate-limit
                  and administrative records prevent abuse. You may object and contact the relevant data-protection
                  authority. The operator must meet applicable notice, supplier and rights-handling duties.
      - - type: section
          title: Optional services and contact
          tone: soft
          blocks:
            - type: text
              paragraphs:
                - This site configures no general media-platform services and does not load X, YouTube or other platform
                  players, advertising or analytics. Local privacy settings remain available. Other sites embedding
                  ishare must obtain visitor permission according to their own configuration. Future optional services
                  need renewed consent and visitor demand; choices can be kept locally for 180 days.
                - The controller is JS.GRIPE. Submit requests under Your data and rights after sign-in, or contact
                  helper@js.gripe. Do not put private information in public issues.
---
