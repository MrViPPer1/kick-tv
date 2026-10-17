# Verification record

## Automated and desktop checks

- 24 Node regression tests pass: response handling, signed URL preservation, caching/coalescing, timeout settlement, rate limiting, stale callbacks, bounded retries, native fallback, HD transition, confirmed-offline behavior, replay seek bounds, suspension and listener cleanup.
- All application scripts and bundled HLS.js parse as ES5. Script paths and unique DOM IDs pass validation. Real-TV runtime testing remains necessary for missing built-in APIs.
- Packaged successfully and installed/launched on my-tv as `com.kickapp.unified`.
- Real desktop API/channel/replay requests passed. A real replay decoded at 1920×1080 with duration 10:30:19. Desktop live master CORS failure was reproduced and bounded recovery verified; packaged TV live playback worked.
- Local fixture UI verified exact lookup, invalid/missing usernames, offline state, add/remove home, persistence after reload, replay grid arrow navigation, Back restoring search-result focus, empty replays, the former diagnostics dialog focus return, and confirmed-offline transition to Home. Fixtures are clearly labelled and excluded from the TV package.
- Home layout inspected at 1280×720 and 1920×1080. The desktop alone did not reveal the TV's graphics-plane resolution mismatch.

## LG hardware, September 24

Model 43LJ594V-ZA, SDK 3.9.0, firmware 06.10.60, Chromium 38.

- Real live playback reached 720p at about 3.42 Mbps, with about 19 seconds buffered and zero reported dropped frames during initial observation. User confirmed picture and audio, while noting their previous buffering generally began later.
- Reproduced repeated HLS `internalException` events. Stack trace led to unsupported `Array.includes` in date-range metadata cleanup. Disabling unused date-range cues removed these exceptions in the observed corrected session.
- User subsequently used live and VOD playback. The last available logs showed replay position around 13,200 seconds, about 136 seconds buffered, and occasional `bufferNudgeOnStall`/`waiting` events despite zero reported dropped frames. This was user-driven mixed usage, not a controlled uninterrupted soak test. Earlier events were overwritten by the diagnostic ring.
- Live master 404s were observed after a broadcast ended. New code refreshes live status and returns Home only on confirmed offline. Regression tests cover exhausted retries; a local browser fixture verifies the screen transition. A future natural end-of-broadcast run still provides the strongest end-to-end confirmation.
- Before correction: graphics viewport 1920×1080, screen 1280×720; user photo showed clipped UI. After correction: viewport and screen both 1280×720. User confirmed menus and screen-off overlay cover the TV.
- Corrected real replay test: 22 replays loaded for Highman; video duration 13,386.385 seconds. Startup rose from 160p to 720p at about 15 seconds, with zero reported dropped frames. Forward buffer measured about 58–67 seconds after bounding the target; segment-size overshoot is expected.
- Real replay skip buttons: 23.645 → 53.645 → 23.645 seconds. Screen-off Right shortcut: 66.662 → 96.662 seconds, followed by progressing playback, readyState 4 and paused false. Screen-off overlay measured 1280×720. All visible replay buttons fit within the TV viewport.
- OK pause/resume passed, retaining focus on the play/pause button. Remote fast-forward advanced 30 seconds. Rewind after the previous seek settled moved 266.912 → 236.912 seconds. An immediate back-to-back opposite seek was not reflected synchronously by this old media engine; inspect settled position when testing rapid sequences.

## Limits

The latest memory/quality/navigation changes have not completed a controlled multi-hour soak. The record does not prove every source of long-session buffering is fixed. Remaining checks include long live/VOD sessions, a natural broadcast ending on the final build, actual TV network interruption, suspend/resume across other TV apps, and native-player comparison. Initial HLS startup and unbuffered seeking may still pause briefly.

## Version 2.0.1 follow-up

- Installed and launched on my-tv. VOD segment processing now uses an HLS worker; live retains its previous setting. Worker creation was confirmed in the TV inspector during a runtime comparison.
- Before the worker comparison, VOD stall recovery sought forward despite approximately 55 seconds buffered. The independent progress-clock experiment did not remove this and was not shipped. Main-thread delays of 2–3 seconds suggest segment processing contributes, but do not establish the sole cause.
- The user reports VOD now only stutters occasionally and no longer displays buffering, while live works well. This is improvement, not proof that all VOD stutter is fixed.
- Reconnect creates a fresh video element and supplies the saved VOD position to HLS at startup, avoiding a second metadata seek. Regression covers element replacement, destruction of the old player, saved position, and no duplicate metadata seek.
- Player controls have translucent backgrounds. Diagnostics remain available through the computer inspector; the TV button/dialog were removed. Green is labelled Reconnect.

- Installed 2.0.1 TV verification: app version reported 2.0.1, worker enabled, no player diagnostics button, controls computed background rgba(4,12,21,0.580392). Green remote key replaced the video element and resumed 71.994 seconds at 80.834 seconds after a 15-second startup observation.
- Controlled replay interval after reconnect: 180.002 seconds wall time, 180.050 seconds media advancement, 720p at 3.480869 Mbps, last forward buffer 62.30 seconds, zero reported dropped frames. No waiting, bufferNudgeOnStall, or recovery events in this interval. Ten nonfatal bufferStalledError warnings remain, so this does not establish stutter-free decoding.

- User subsequently reported no noticeable VOD lag yet. Longer viewing remains necessary before claiming all stutter resolved.
- ASMongold247 was confirmed live and played on the installed build at 720p, 2.373 Mbps, about 15 seconds buffered, zero reported dropped frames during the short check. Live worker remained disabled as intended. Left this stream playing after testing.
