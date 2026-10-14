# AI uploads and WebMCP

Create an API key in the signed-in personal center (`/profile/`). Name it for the tool that uses it and select 30, 90 or 365 days. Copy the full key when it is created; only its name, prefix, expiry and last-use time are stored for display. Revoke it in the same screen. Server storage contains a SHA-256 hash, never the usable key.

Keys use the same GitHub user identity, publisher permissions and storage/upload quotas as the browser account. The verified operator retains the existing quota exemption. A key can manage its owner's posts; it cannot act on another user's posts, administer users, create other keys or modify account identity. Suspension and account erasure apply to keys too.

## Upload from an AI tool

The repository includes a Node.js client. Put the key in the process environment, not in a command argument or committed file:

```sh
node tools/upload/ai-upload.mjs photo.png clip.mp4 > uploaded.md
```

Set `ISHARE_API_KEY` through the tool's secret/environment configuration. `ISHARE_CAPTION` supplies optional post text. `ISHARE_ORIGIN` selects another HTTPS installation. Video duration comes from local FFprobe; `ISHARE_VIDEO_SECONDS` supplies a measured duration when FFprobe is unavailable. The client transfers all attachments, confirms them, then creates one post. Images use multipart upload; videos use bounded TUS chunks, recovering interrupted offsets with HEAD. Progress goes to stderr. Stdout contains only the final Markdown with image/video references, a post link and every direct media link.

For custom clients, send requests to fixed `/api` with `Authorization: Bearer <key>` and `X-Service-Action`. `X-Service-Resource` supplies an opaque attachment or post id; do not put the key in a URL. JSON request bodies use `Content-Type: application/json`. These are server/tool requests; cookie-based browser requests keep their same-origin and CSRF requirements.

| Action | Method | Request / response |
| --- | --- | --- |
| `create-upload` | POST | `{kind,title,bytes,mime,duration}` → JSON `{id,uploadUrl,protocol}`. `duration` is zero for an image and a bounded whole-second video reservation. |
| Upload bytes | POST / PATCH | Use the granted upload URL without forwarding the API key. Images: multipart `file`; videos: TUS 1.0.0 PATCH with `Upload-Offset`, `application/offset+octet-stream`. |
| `publish` | POST | Attachment id in the resource header, `{}` body → confirmed attachment id/state. HTTP 202 means processing; wait and retry. |
| `create-post` | POST | `{caption,mediaIds,listed:false}` → HTTP 201 `text/markdown`, including post and media links. Keep a single post id across retries. |
| `history` / `owned-post` | GET | Read the user's history or one owned post as JSON, including the current revision. |
| `update-post` | POST | `{caption,mediaIds,listed,revision}` → Markdown. Retain the attachment ids still required. Omitted attachments are removed. |
| `set-visibility` | POST | `{listed}` → Markdown; changes homepage inclusion. |
| `delete-post` | POST | `{}` → publication revoked immediately; upstream cleanup follows. |
| `discard-upload` | POST | `{}` → clean up an unfinished/unattached upload. Attached published media cannot be discarded. |

API-created posts are unlisted on the homepage. Their share/media links remain accessible, and the author can later change homepage visibility. Final publication responses contain Markdown, while upload grants, processing and errors use JSON needed by the client. Media links point to ishare's own image or HLS delivery paths; upstream credentials and playback addresses stay private.

## Post editing and embedded preview

Publication results immediately show the actual `/embed/<post-id>` view, with the same caption, gallery and player as an inserted post. Closing the result removes the frame and stops its player. Videos wait for explicit Play. On the owner's public profile, Edit opens the existing post in the composer. The author can revise text, keep/remove/add attachments and change the homepage checkbox. Saving preserves its sharing link and creation date. Stale revisions return HTTP 409 instead of overwriting another edit.

## Native WebMCP

When the browser provides `document.modelContext`, top-level signed-in ishare pages register `ishare_list_my_posts`, `ishare_get_my_post`, `ishare_delete_my_post`, and—when publishing is allowed—`ishare_edit_my_post` and `ishare_set_homepage_visibility`. The composer additionally exposes `ishare_publish_selected_post`, using files already selected by the user and the normal upload/progress/preview flow. Personal center exposes key creation, metadata and revocation tools; creation returns the full key once. Each execution refreshes authentication and uses the existing API's ownership/CSRF checks. Logout, account changes and page exit remove the tools. Embedded frames register no private tools. Unsupported browsers continue to use the ordinary interface.
