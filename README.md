<p align="center"><img src="app/icon.png" width="112" alt="Kick TV icon"></p>

<h1 align="center">Kick TV for LG webOS</h1>

<p align="center">Watch Kick live streams and past broadcasts with your TV remote.</p>

<p align="center"><a href="https://github.com/MrViPPer1/kick-tv/releases/latest">Download for your TV</a> · <a href="#installation">Installation</a> · <a href="#remote-controls">Remote controls</a> · <a href="https://github.com/MrViPPer1/kick-tv/issues">Report an issue</a></p>

Kick TV is an unofficial app for LG webOS TVs. Find a streamer, save them to your home screen, and watch live streams or replays without signing in to Kick.

## What you can do

- Search by exact Kick username and browse streamer profiles.
- Save up to 12 streamers to your home screen.
- Watch live streams and browse up to 24 recent public replays per channel.
- Pause, resume, and skip forward or backward in replays.
- Start at a lower quality, then adapt from 720p up to the creator's source quality. A 720p limit is also available.
- Hide the picture with the red button while audio continues.
- Reconnect with the green button and keep your replay position.

The interface is designed for directional remotes, with large focus targets and semi-transparent playback controls.

## Compatibility

Tested on an LG **43LJ594V-ZA**, webOS SDK **3.9.0**, firmware **06.10.60**. Other webOS TVs may work, but have not been verified. NetCast TVs are not supported.

The interface uses a 1280 × 720 graphics resolution. Video can still play at 1080p when the broadcast and TV support it.

This is a sideloaded app, not an LG Content Store release. It is not affiliated with or endorsed by Kick or LG.

## Installation

1. Download the `.ipk` file from the [latest release](https://github.com/MrViPPer1/kick-tv/releases/latest).
2. Install LG's **Developer Mode** app on your TV and sign in with an LG developer account. Enable Developer Mode and complete the restart.
3. Put the computer and TV on the same network. Install the [webOS CLI](https://webostv.developer.lge.com/develop/tools/cli-introduction).
4. Run `ares-setup-device`, choose **add**, and name the device `my-tv`. Enter the TV's IP address, port `9922`, and SSH user `prisoner`.
5. Turn on **Key Server** in the TV's Developer Mode app, then run:

```sh
ares-novacom --device my-tv --getkey
```

Enter the passphrase shown on the TV when prompted. Then install and launch the downloaded package from its folder:

```sh
ares-install --device my-tv com.kickapp.unified_2.0.1_all.ipk
ares-launch --device my-tv com.kickapp.unified
```

Keep the Developer Mode session active. If it expires and Developer Mode is disabled, LG removes sideloaded apps. See [LG's setup and session guide](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app).

## Remote controls

- **OK** pauses or resumes playback when controls are hidden. With controls visible, it activates the selected button.
- **Up** shows playback controls. Use the arrows to move between buttons.
- **Left / Right** skip 10 seconds in a replay when controls are hidden.
- **Rewind / Fast-forward** skip 30 seconds in a replay. The visible controls also have −30 / +30 second buttons.
- **Red** hides or restores the picture. With the picture hidden, Left / Right skip 30 seconds in a replay.
- **Green** reconnects playback. It does not reset the app or clear saved streamers.
- **Back** returns to the previous screen.

Hiding the picture uses a black overlay. Video still downloads and decodes, so this does not reduce bandwidth or turn off the TV panel.

## Playback settings

Open **Account** for local playback preferences. Kick account login is not available.

**Automatic** uses HLS.js and can fall back to the TV's native player when a playlist cannot be read. The other player settings allow manual comparison.

**HD** allows a brief low-resolution start, then selects from 720p through source quality. Already-buffered startup video can delay the visible quality change. If the creator offers no HD rendition, the highest available quality is used. Native playback manages its own quality and cannot guarantee the 720p minimum.

## Known limitations

- Kick can change its playback endpoints, which may interrupt this unofficial app.
- Startup, unbuffered seeking, and reconnecting can pause briefly.
- A tested three-minute VOD interval at 720p had no buffering events or reported dropped frames. This does not guarantee uninterrupted playback on every TV, network, or broadcast.
- Search requires an exact username. Chat, Kick login, and account follow syncing are not implemented.
- A desktop browser can reject live playback because of CDN cross-origin restrictions even when the packaged TV app works.

For a playback problem, [open an issue](https://github.com/MrViPPer1/kick-tv/issues) with your TV model, firmware, app version, selected quality, and whether it affects live or replay playback. Describe whether audio stops too. Do not post passwords, TV pairing keys, cookies, or signed playback URLs.

## Development

Use Node.js 18 or later for the local tools and the webOS CLI for packaging. Node.js is not required on the TV.

```sh
git clone https://github.com/MrViPPer1/kick-tv.git
cd kick-tv
npm ci
npm run check
npm test
npm start
```

Open `http://127.0.0.1:5173`. The `/fixture` page uses synthetic metadata for UI tests and is excluded from the TV package.

Build the installable package:

```sh
npm run package
```

The output is written to `dist/`. Application code targets ES5 for older webOS browsers, and HLS.js 1.4.10 is bundled locally.

Read the [playback notes](docs/RESEARCH.md), [test results](docs/TEST-RESULTS.md), and [TV testing guide](docs/TV-TESTING.md) for implementation details and verification limits.

## License

App code is available under the [MIT license](LICENSE). Bundled HLS.js is licensed separately under [Apache 2.0](app/vendor/HLS-LICENSE.txt). Kick and LG names and trademarks belong to their respective owners.
