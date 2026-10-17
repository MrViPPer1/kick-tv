(function (root) {
  'use strict';
  var K = root.KickTV;
  K.Player = function (video, api, diagnostics, notify, options) {
    this.video = video; this.api = api; this.log = diagnostics; this.notify = notify;
    this.Hls = options && options.Hls || root.Hls;
    this.replaceVideo = options && options.replaceVideo;
    this.mode = 'auto'; this.cap = 0; this.session = 0; this.generation = 0;
    this.hls = null; this.item = null; this.engine = ''; this.attempts = 0;
    this.retryTimer = null; this.watchTimer = null; this.listeners = [];
    this.busy = false; this.failed = false; this.suspended = false; this.userPaused = false;
    this.resumeAt = 0; this.nativeTried = false; this.lastProgress = 0; this.stableSince = 0;
  };
  K.Player.prototype.message = function (state, text) { this.notify(state, text || ''); };
  K.Player.prototype.clearEngine = function () {
    this.generation++;
    for (var i = 0; i < this.listeners.length; i++) this.video.removeEventListener(this.listeners[i][0], this.listeners[i][1]);
    this.listeners = [];
    if (this.hls) { this.hls.destroy(); this.hls = null; }
    this.video.pause(); this.video.removeAttribute('src');
    while (this.video.firstChild) this.video.removeChild(this.video.firstChild);
    this.video.load();
  };
  K.Player.prototype.stop = function () {
    this.session++; this.item = null; this.busy = false;
    clearTimeout(this.retryTimer); clearInterval(this.watchTimer);
    this.retryTimer = this.watchTimer = null;
    this.clearEngine(); this.engine = '';
  };
  K.Player.prototype.start = function (item, mode, cap) {
    this.stop(); this.item = item; this.mode = mode || 'auto'; this.cap = cap || 0;
    this.attempts = 0; this.failed = false; this.nativeTried = false;
    this.suspended = false; this.userPaused = false; this.resumeAt = 0; this.fallbackCap = -1;
    this.log.add('start', {live: item.kind === 'live'});
    var self = this;
    this.watchTimer = setInterval(function () { self.watch(); }, 5000);
    this.resolve();
  };
  K.Player.prototype.resolve = function () {
    var self = this, session = self.session;
    self.busy = true; self.lastProgress = Date.now(); self.stableSince = 0;
    self.message('loading', 'Connecting to the broadcast…');
    self.api.resolve(self.item, function (error, url) {
      if (session !== self.session || !self.item || self.suspended) return;
      self.busy = false;
      if (error) {
        if (error.code === 'STREAM_OFFLINE') { self.offline(); return; }
        self.fail(error.message); return;
      }
      self.attach(url);
    });
  };
  K.Player.prototype.attach = function (url, forceNative) {
    var self = this, v = self.video, H = self.Hls;
    self.clearEngine();
    // Give webOS a fresh video surface after reconnects and rendition changes.
    // Reusing the detached MSE element can retain the previous decoder crop.
    if (self.replaceVideo) v = self.video = self.replaceVideo(v);
    var session = self.session, generation = self.generation;
    function valid() { return self.item && !self.suspended && self.session === session && self.generation === generation; }
    function listen(name, fn) {
      var listener = function () { if (valid()) fn(); };
      self.listeners.push([name, listener]); v.addEventListener(name, listener);
    }
    self.lastProgress = Date.now(); self.lastTime = v.currentTime || 0; self.stableSince = 0;
    self.hdReady = false; self.playedSinceAttach = 0;
    self.failed = false; v.muted = false; v.playbackRate = 1;
    listen('timeupdate', function () {
      if (v.currentTime > self.lastTime + 0.05) {
        self.playedSinceAttach += Math.min(1, v.currentTime - self.lastTime);
        if (!self.hdReady && self.playedSinceAttach >= 3 && self.hls) {
          self.hdReady = true; self.applyCap();
          self.hls.nextAutoLevel = self.hdLevel;
          self.log.add('hd-ready', {level: self.hdLevel});
        }
        self.lastProgress = Date.now();
        if (!self.stableSince) self.stableSince = Date.now();
        if (Date.now() - self.stableSince > 60000) self.attempts = 0;
      }
      self.lastTime = v.currentTime;
    });
    listen('playing', function () {
      if (self.userPaused) { v.pause(); return; }
      self.lastProgress = Date.now(); self.message('playing');
    });
    listen('waiting', function () {
      if (!self.userPaused) { self.stableSince = 0; self.message('buffering', 'Buffering…'); self.log.add('waiting', self.sample()); }
    });
    listen('ended', function () {
      if (self.item.kind === 'live') self.recover('stream-ended');
      else { self.userPaused = true; self.message('ended', 'Replay finished. Press Back to choose another.'); }
    });
    listen('loadedmetadata', function () {
      if (!self.hls && self.item.kind === 'vod' && self.resumeAt > 0 && isFinite(v.duration)) {
        try { v.currentTime = Math.min(self.resumeAt, Math.max(0, v.duration - 1)); } catch (e) {}
      }
      if (!self.hls && !self.userPaused) self.play();
    });
    listen('error', function () {
      self.log.add('video-error', {code: v.error && v.error.code || 0});
      // HLS errors are handled by the single HLS error path, avoiding duplicate recovery.
      if (!self.hls) self.recover('native-media-error');
    });
    var nativeSupported = !!v.canPlayType('application/vnd.apple.mpegurl');
    var hlsSupported = H && H.isSupported();
    if (forceNative || self.mode === 'native' || (self.mode === 'auto' && self.nativeTried) || (!hlsSupported && self.mode === 'auto' && nativeSupported)) {
      if (!nativeSupported) { self.fail('The TV does not report native HLS support. Choose Automatic in Account.'); return; }
      self.engine = 'native'; self.nativeTried = true;
      // No crossorigin attribute: native media fetches need not expose bytes to JavaScript.
      // The CDN still enforces its own playback authorization.
      var source = v.ownerDocument.createElement('source');
      source.type = 'application/vnd.apple.mpegurl'; source.src = url; v.appendChild(source); v.load(); self.play();
    } else if (hlsSupported) {
      self.engine = 'hls';
      var h = self.hls = new H({
        // Long VOD segments blocked this TV's main thread for 2–3 seconds,
        // leading to false stall nudges. Keep the verified live path unchanged.
        enableWorker: self.item.kind === 'vod',
        lowLatencyMode: false,
        // HLS 1.4.10 date-range cue cleanup calls Array.includes, absent in webOS 3.
        // This app does not consume timed metadata. Verified throwing on the real TV.
        enableDateRangeMetadataCues: false,
        startLevel: 0,
        startPosition: self.item.kind === 'vod' && self.resumeAt > 0 ? self.resumeAt : -1,
        // The real TV retained 136s ahead at 720p with defaults. Bound VOD memory.
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        // Trim already-played media, not the forward safety buffer. Defaults govern ABR and live sync.
        backBufferLength: 30,
        maxLiveSyncPlaybackRate: 1
      });
      h.on(H.Events.MANIFEST_PARSED, function () {
        if (!valid() || self.hls !== h) return;
        self.applyCap();
        // Conservative startup only; adaptive selection remains enabled afterwards.
        h.startLevel = 0;
        self.log.add('manifest', {engine: 'hls', level: h.levels.length}); self.play();
      });
      h.on(H.Events.LEVEL_LOADED, function (event, data) {
        if (!valid()) return;
        self.log.add('playlist', {duration: data.details.targetduration, live: data.details.live});
      });
      h.on(H.Events.LEVEL_SWITCHED, function (event, data) {
        if (!valid()) return;
        var level = h.levels[data.level] || {};
        self.log.add('quality', {level: data.level, height: level.height, bitrate: level.bitrate});
      });
      h.on(H.Events.ERROR, function (event, data) {
        if (!valid() || self.hls !== h || self.failed) return;
        var status = data.response && data.response.code || 0;
        self.log.add('hls-error', {status: status, detail: data.details});
        if (!data.fatal) return; // Allow HLS.js segment retry and ABR to do their job first.
        if (self.mode === 'auto' && !self.nativeTried && status === 0 &&
            data.details === H.ErrorDetails.MANIFEST_LOAD_ERROR && nativeSupported && root.navigator.onLine !== false) {
          self.log.add('native-fallback', {reason: 'master-unreadable'});
          self.message('loading', 'Trying the TV’s built-in player…'); self.attach(url, true); return;
        }
        if (status === 0 && data.details === H.ErrorDetails.MANIFEST_LOAD_ERROR && !nativeSupported) {
          self.fail('The live playlist could not be read. Kick currently restricts browser access to some live URLs. Try the native player on the TV.'); return;
        }
        // Re-resolve through Kick on fatal errors, including HTTP 401/403, instead of reusing an expired URL.
        self.recover(status === 401 || status === 403 ? 'authorization' : data.type === H.ErrorTypes.MEDIA_ERROR ? 'decode' : 'network');
      });
      h.attachMedia(v); h.loadSource(url);
    } else self.fail('HLS playback is not supported on this device. Try Native in Account.');
    self.log.add('engine', {engine: self.engine});
    if (!self.failed) self.message('loading', 'Connecting to the broadcast…');
  };
  K.Player.prototype.applyCap = function () {
    if (!this.hls) return;
    var levels = this.hls.levels, cap = -1, i, hd = -1;
    for (i = 0; i < levels.length; i++) if (levels[i].height >= 720) { hd = i; break; }
    if (hd < 0) hd = Math.max(0, levels.length - 1);
    this.hdLevel = hd;
    // Permit a quick low-resolution start, then constrain ABR to HD through source.
    // If the creator provides no HD rendition, use their highest available quality.
    this.hls.config.minAutoBitrate = this.hdReady && levels[hd] ? levels[hd].bitrate || 0 : 0;
    if (this.cap) {
      for (i = 0; i < levels.length; i++) if (levels[i].height && levels[i].height <= this.cap) cap = i;
      if (cap === -1 && levels.length) cap = 0;
    }
    if (cap >= 0) cap = Math.max(hd, cap);
    this.hls.autoLevelCapping = cap;
  };
  K.Player.prototype.setCap = function (cap) { this.cap = cap; this.fallbackCap = -1; this.applyCap(); };
  K.Player.prototype.play = function () {
    if (!this.item || this.failed || this.suspended || this.userPaused) return;
    var self = this, session = self.session, generation = self.generation, result;
    try { result = self.video.play(); }
    catch (e) { self.message('paused', 'Press OK to start playback.'); return; }
    if (result && typeof result.catch === 'function') result.catch(function (error) {
      if (session !== self.session || generation !== self.generation || !self.item) return;
      if (error && error.name === 'AbortError') return;
      self.userPaused = true; self.message('paused', 'Press OK to start playback.');
    });
  };
  K.Player.prototype.toggle = function () {
    if (!this.item || this.failed) return;
    this.userPaused = !this.userPaused;
    if (this.userPaused) { this.video.pause(); this.message('paused', 'Paused'); }
    else {
      this.lastProgress = Date.now();
      if (this.item.kind === 'live') this.goLive();
      this.play();
    }
  };
  K.Player.prototype.goLive = function () {
    var v = this.video, position = this.hls && this.hls.liveSyncPosition;
    if (this.item && this.item.kind === 'live') {
      try {
        if (typeof position === 'number' && isFinite(position)) v.currentTime = position;
        else if (v.seekable.length) v.currentTime = Math.max(v.seekable.start(0), v.seekable.end(v.seekable.length - 1) - 12);
      } catch (e) {}
    }
  };
  K.Player.prototype.seek = function (seconds) {
    var v = this.video;
    if (!this.item || this.item.kind !== 'vod' || !isFinite(v.duration)) return;
    try { v.currentTime = Math.max(0, Math.min(v.currentTime + seconds, v.duration)); } catch (e) {}
    this.lastProgress = Date.now();
  };
  K.Player.prototype.sample = function () {
    var v = this.video, buffer = 0, i, quality = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null;
    for (i = 0; i < v.buffered.length; i++) if (v.buffered.start(i) <= v.currentTime && v.buffered.end(i) >= v.currentTime) buffer = v.buffered.end(i) - v.currentTime;
    var data = {engine: this.engine, buffer: buffer, seconds: v.currentTime,
      dropped: quality ? quality.droppedVideoFrames : v.webkitDroppedFrameCount,
      frames: quality ? quality.totalVideoFrames : v.webkitDecodedFrameCount};
    if (this.hls) {
      var level = this.hls.levels[this.hls.currentLevel] || {};
      data.height = level.height; data.bitrate = level.bitrate;
      data.bandwidth = this.hls.bandwidthEstimate;
      if (this.item && this.item.kind === 'live') data.latency = this.hls.latency;
    }
    return data;
  };
  K.Player.prototype.watch = function () {
    if (!this.item || this.suspended || this.failed) return;
    this.log.add('sample', this.sample());
    if (this.busy || this.retryTimer || this.userPaused || this.video.seeking) return;
    if (Date.now() - this.lastProgress >= 20000) {
      this.recover('no-progress');
    }
  };
  K.Player.prototype.recover = function (reason) {
    if (!this.item || this.busy || this.retryTimer || this.suspended || this.failed) return;
    if (this.attempts >= 3) { this.checkEnded(); return; }
    var self = this, session = self.session;
    self.attempts++; self.stableSince = 0;
    if (self.item.kind === 'vod') self.resumeAt = self.video.currentTime || self.resumeAt;
    self.log.add('recovery', {reason: reason, attempt: self.attempts});
    self.clearEngine();
    self.message('buffering', 'Reconnecting… attempt ' + self.attempts + ' of 3');
    self.retryTimer = setTimeout(function () {
      self.retryTimer = null;
      if (session === self.session && self.item && !self.suspended) self.resolve();
    }, Math.pow(2, self.attempts) * 1000);
  };
  K.Player.prototype.offline = function () {
    this.log.add('offline', {reason: 'confirmed'});
    this.stop(); this.message('offline', 'The broadcast has ended.');
  };
  K.Player.prototype.checkEnded = function () {
    var self = this, session = self.session;
    var failure = 'Playback could not recover. Check the connection. Press Retry to reconnect.';
    if (!self.item || self.item.kind !== 'live') { self.fail(failure); return; }
    self.busy = true; self.message('loading', 'Checking whether the streamer is still live…');
    self.api.channel(self.item.slug, true, function (error, channel) {
      if (session !== self.session || !self.item || self.suspended) return;
      self.busy = false;
      if (!error && !channel.live) self.offline();
      else self.fail(failure);
    });
  };
  K.Player.prototype.fail = function (text) {
    this.failed = true; this.busy = false;
    clearTimeout(this.retryTimer); this.retryTimer = null;
    this.clearEngine(); this.message('error', text);
    this.log.add('stopped', {reason: 'terminal-error'});
  };
  K.Player.prototype.retry = function () {
    if (!this.item || this.suspended) return;
    this.session++; clearTimeout(this.retryTimer); this.retryTimer = null;
    this.attempts = 0; this.failed = false; this.userPaused = false;
    if (this.item.kind === 'vod') this.resumeAt = this.video.currentTime || this.resumeAt;
    this.clearEngine(); this.resolve();
  };
  K.Player.prototype.suspend = function () {
    if (!this.item || this.suspended) return;
    this.suspended = true; this.session++;
    if (this.item.kind === 'vod') this.resumeAt = this.video.currentTime || this.resumeAt;
    clearTimeout(this.retryTimer); this.retryTimer = null; this.busy = false;
    this.clearEngine(); this.log.add('suspend');
  };
  K.Player.prototype.resume = function () {
    if (!this.item || !this.suspended) return;
    this.suspended = false;
    if (!this.failed) this.resolve();
  };
}(typeof window !== 'undefined' ? window : global));
