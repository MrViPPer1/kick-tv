# Investigation and implementation decisions

Initial inspection and network sampling: 2026-09-22. Hardware testing resumed 2026-09-24. See the dated probe JSON for reproducible, redacted observations. Findings about one sampled stream are not guarantees for every Kick channel.

## Current external dependencies

The app calls `GET https://kick.com/api/v2/channels/{slug}` and `GET https://kick.com/api/v2/channels/{slug}/videos`. Both returned HTTP 200 JSON from this PC on September 22. The channel includes `user.profile_pic`, `user.username`, `livestream.session_title`, `livestream.categories`, `livestream.viewer_count` and top-level `playback_url`. The videos endpoint returned an array, with `source`, `session_title`, millisecond `duration`, `thumbnail.src`, `is_live` and nested `video.uuid`/visibility fields. Completed VOD sources and live playback URLs are kept separate.

`GET https://kick.com/api/v2/channels/xqc/livestream` was also checked and returned HTTP 200 with a `data` object. It is used by current Streamlink source, but the app does not need another request for data already available from the channel endpoint. No new speculative endpoint was introduced.

The live URL observed was a signed Amazon IVS master on `*.playback.live-video.net`. Variants and segment locations come from the returned playlists; the app does not construct CDN paths. VODs use the returned `stream.kick.com` master URL. Profile/thumbnail locations come from JSON. No public proxy or forged Origin/Referer is used. Redirect handling is left to the browser/HLS loader.

The current Kick website was opened and displayed xQc's live status/title/category. Network sampling here independently requested the known endpoints; this was not a complete authenticated website HAR capture. A future website deployment may change its private contracts without notice.

## Playback evidence and limits

The sampled master offered approximately 9.0 Mbps 1080p60, 3.42 Mbps 720p60, 1.43 Mbps 480p30, 630 Kbps 360p and 230 Kbps 160p. The media playlist declared HLS version 3, target duration 6 seconds, and contained fourteen completed 2-second segments plus two `EXT-X-PREFETCH` entries. No Apple `EXT-X-PART` tags were present. IVS low-latency prefetch is not the same thing as Apple's LL-HLS parts. Merely enabling HLS.js `lowLatencyMode` does not turn it into the IVS player.

The sampled playback JWT had about 599 seconds remaining. This disproves a blanket assumption that every returned URL can be cached for hours. It does NOT prove that a running media session must be restarted when the master token expires. The app obtains a fresh URL when opening/reconnecting and preserves it exactly, without periodic replacement during successful playback. It never logs the token, full CDN URL, cookies or raw playlist session data.

The channel API reflected `Access-Control-Allow-Origin: null` for a null Origin and allowed the tested localhost Origin. In contrast, the live master returned HTTP 200 but no Access-Control-Allow-Origin for either origin. Child media playlists and VOD masters returned `*`. This is a verified desktop HLS.js startup obstacle; it is not evidence that CORS explains intermittent buffering after successful playback. A packaged TV runtime must be tested independently. Native media loading may behave differently, but is still subject to server authorization and TV playlist support.

Desktop replay testing decoded actual Kick content at 1920×1080, advanced through playback and reported a 10:30:19 duration consistent with the API. Desktop live testing reproduced the unreadable master and exhausted a bounded recovery budget. Neither observation establishes hours-long TV stability.

## LG constraints

LG documents webOS 3.x as Chromium 38 and older MSE support. Native HLS exists on these TVs, but has significant tag/variant limitations. H.264 1080p60 Level 4.2 falls inside LG's published 3.0 Full HD envelope; a stream being within the codec envelope does not demonstrate sufficient CPU, MSE memory or network headroom. HLS.js uses MSE and the TV decoder; it is not a software video decoder.

Native HLS has limited support for discontinuities, EXT-X-MEDIA and session/date metadata. LG does not recommend non-1.0 playback speed. Old emulators do not support HLS and cannot establish hardware decoder behavior. The simulator likewise is not a substitute for real-device media and memory testing. There is no assumed universal app memory quota in this project.

## Architecture

The app uses modular ES5 scripts, a pinned HLS.js build, and one active video element and player instance. Shared lifecycle code destroys the old owner before replacement, cancels retries on navigation, rejects stale callbacks, and preserves paused intent/VOD position across suspension.

ABR remains enabled. The app permits a low-resolution startup, then raises the automatic minimum to the first 720p rendition after three seconds of measured playback progress. Buffered startup segments can delay the visible switch; the TV replay test reached 720p at about 15 seconds. Source quality remains the maximum; an optional 720p preference caps the range. If HD does not exist, the highest offered rendition is used. A network unable to sustain 720p can buffer under this user-requested policy. Native HLS controls quality independently.

Fatal errors trigger up to three reconnects at 2, 4 and 8 seconds; successful manifest parsing does not reset that budget. Only sustained playback progress does. A no-progress watchdog waits 20 seconds. Nonfatal segment errors remain with HLS.js's built-in retry/ABR logic. Every live recovery resolves fresh channel status; confirmed offline returns Home. On exhausted recovery, a final fresh status check distinguishes offline from a network/API failure.

Low latency is disabled as the stability-oriented policy, not claimed as the root-cause fix. The 90-second back buffer is reduced to 30 seconds. On September 24, real replay logs showed about 136 seconds buffered ahead at 720p, with repeated stall nudges despite ample downloaded data. Forward buffering now uses a 30-second target and 60-second maximum target (segments can overshoot); the TV test measured roughly 58–67 seconds. This reduces retained media but does not establish memory pressure as the cause of those stalls. Live synchronization retains library defaults and playback rate remains 1.

The TV revealed a separate proven compatibility fault: HLS.js 1.4.10's date-range metadata cleanup calls `Array.includes`, absent in Chromium 38. A stack trace pinpointed the call at bundled column 54772 inside `onLevelUpdated`. Disabling unused `enableDateRangeMetadataCues` stopped the repeated internal exceptions on playlist updates. ES5 syntax validation alone cannot catch missing runtime methods.

The TV also confirmed `innerWidth/innerHeight` 1920×1080 against a 1280×720 graphics screen. The original package setting clipped the interface to a corner. LG documents 1280×720 graphics for Full HD models, independently of 1920×1080 video. Changing appinfo resolution to 1280×720 made both viewport and screen agree, and the user confirmed menus and the screen-off overlay fill the TV.

Diagnostics record buffer seconds, playback progress, rendition, estimated bandwidth, latency, frame counters when available and sanitized errors. A 120-event ring bounds memory. Five-second sampling only runs for an active player. Metadata caching is short-lived, capped, keyed by path and coalesced; playback resolution bypasses it. Hidden/background pages do not poll. Rendering uses text nodes for API data and legacy-compatible flex layouts without CSS gap, grid, heavy effects or animated focus.

## Authentication

Kick now has an official developer API and OAuth 2.1 documentation. Official channel metadata is not evidence of a documented viewer playback/VOD contract. In particular, the stream key/URL scope must not be confused with a public viewer playback URL.

The documented authorization-code flow requires PKCE, state and a client secret at token exchange; client credentials also requires a secret. A packaged TV app cannot keep that secret. The Account page therefore exposes guest/local settings only. Future sign-in should use a registered application, a controlled HTTPS backend holding secrets and refresh tokens, a verified redirect/state/PKCE flow, and a phone/browser pairing experience with expiring one-use codes. No Kick device-code endpoint was verified, so none is invented here. Do not ask users to paste browser cookies or account tokens into the TV.

## Primary sources

- [LG web engines and packaged-app cookie restrictions](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine)
- [LG graphics versus video resolutions](https://webostv.developer.lge.com/develop/specifications/app-resolution)
- [LG streaming protocols and native HLS limitations](https://webostv.developer.lge.com/develop/specifications/streaming-protocol-drm)
- [LG 3.0 audio/video formats](https://webostv.developer.lge.com/develop/specifications/video-audio-30)
- [LG HLS troubleshooting](https://webostv.developer.lge.com/faq/streaming-http-live-streaming-hls-troubleshooting)
- [LG Back handling](https://webostv.developer.lge.com/develop/guides/back-button)
- [LG Magic Remote](https://webostv.developer.lge.com/develop/guides/magic-remote)
- [LG MediaPlayback sample](https://github.com/webOS-TV-app-samples/MediaPlayback)
- [LG simulator limitations](https://webostv.developer.lge.com/develop/tools/simulator-introduction)
- [HLS.js 1.4.10 configuration and error API](https://github.com/video-dev/hls.js/blob/v1.4.10/docs/API.md)
- [Kick OAuth flow](https://docs.kick.com/getting-started/generating-tokens-oauth2-flow)
- [Kick official channels API](https://docs.kick.com/apis/channels)
- [Streamlink's Kick implementation](https://github.com/streamlink/streamlink/blob/master/src/streamlink/plugins/kick.py)
- [yt-dlp's Kick implementation](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/kick.py)
- [Amazon IVS playback authorization](https://docs.aws.amazon.com/ivs/latest/userguide/private-channels-enable-playback-auth.html)
- [Amazon IVS session protection](https://docs.aws.amazon.com/ivs/latest/LowLatencyUserGuide/private-channels-session-protection.html)

Open-source clients corroborate endpoint usage and IVS prefetch handling. They also contain browser-challenge workarounds; those are not imported into this app. No third-party client's existence proves Kick authorizes its endpoints or that it is compatible with this television.
