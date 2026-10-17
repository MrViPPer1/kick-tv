# Real TV follow-up

Target tested: LG 43LJ594V-ZA, webOS SDK 3.9.0, firmware 06.10.60, Chromium 38. Example CLI device name: my-tv. Network address can change; update its host before connecting. Keep Developer Mode active. Key Server is needed when obtaining a new key, not for each existing authenticated connection.

## Remote controls

- OK pauses/resumes when controls are hidden. Up opens the controls, where arrows move focus and OK selects.
- Replays have visible −30/+30-second buttons. Rewind/fast-forward remote keys work with controls visible or hidden. Left/Right skip 10 seconds with controls hidden, and 30 seconds with the screen off.
- Red toggles a black overlay without replacing or reloading the media. This is screen-off listening, not a separate audio-only stream. Initial startup or a seek can still buffer.
- Green reconnects with a newly resolved URL. Back returns to the originating page; after a confirmed ended live broadcast the app returns Home.

## Remaining endurance checks

1. Use Automatic and HD quality. Watch one live broadcast for 30–60 uninterrupted minutes, then a replay for the same duration. Record start time, approximate time of the first visible pause, picture/audio symptoms and any message.
2. Compare 720p preference with HD-to-source on the same channel/network. The HD policy cannot hide a connection too slow for 720p. If the creator offers only lower resolution, the highest offered resolution is used.
3. Switch the screen off with Red for ten minutes, then restore it. Confirm audio continues and there is no reconnection just from Red.
4. Seek forward/backward within and outside the buffered portion. A short seek delay can be normal; indefinite buffering is not.
5. When convenient, briefly disconnect only the TV network and reconnect. Confirm a clear message and recovery or a usable Retry. Do not disrupt the household router to run this check.
6. Switch to another TV app and return, including while a replay is paused. Confirm one active player and preserved replay position/paused intent.
7. At the end of a live broadcast, confirm Home appears after fresh channel status reports offline. API failure alone must leave an actionable playback error, not falsely label the channel offline.

## Capture useful evidence

Diagnostics are collected through the computer connection; there is no TV diagnostics button. The record is a short, in-memory ring; closing the app clears it and continued playback replaces old entries. In LG Web Inspector, evaluate `kickDiagnostics()` and save the returned JSON. If the old inspector console cannot execute under a modern browser, use Sources → Snippets → New and run `console.log(kickDiagnostics())`.

Include TV model/firmware, selected player and quality, elapsed viewing time, and whether the stream was live or a replay. The app record excludes signed playback URLs and account tokens. Avoid sharing raw Network-tab requests containing tokens. Record the approximate time of a visible problem so it can be matched to the computer logs.

Check buffer, playback time, decoded/dropped frames, HTTP status, recovery reason and quality together. A buffered replay that briefly stalls is not automatically evidence of slow internet; repeated metadata exceptions, decode issues, device scheduling and memory retention require separate investigation. Native mode is an optional comparison; its quality is TV-managed.
