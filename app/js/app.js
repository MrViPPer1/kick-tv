(function () {
  'use strict';
  var K = window.KickTV, $ = function (id) { return document.getElementById(id); };
  var storage;
  try { storage = window.localStorage; } catch (e) { storage = null; }
  var store = new K.Store(storage), log = new K.Diagnostics(), api = new K.API({diagnostics: log});
  var saved = store.get('saved', ['xqc']), mode = store.get('engine', 'auto'), cap = store.get('cap', 0);
  if (!Array.isArray(saved)) saved = ['xqc'];
  saved = saved.filter(function (s, i, a) { return K.slug(s) === s && a.indexOf(s) === i; }).slice(0, 12);
  if (['auto', 'hls', 'native'].indexOf(mode) < 0) mode = 'auto';
  if ([0, 720].indexOf(cap) < 0) cap = 0;
  var state = {page: 'home', selected: store.get('selected', saved[0]), home: null, channel: null,
    videos: [], homeSeq: 0, channelSeq: 0, searchSeq: 0, history: [],
    playerReturn: null, controls: false, dimmed: false, playerState: '', hideTimer: null};
  if (saved.indexOf(state.selected) < 0) state.selected = saved[0];
  function visible(id, yes) { $(id).classList[yes ? 'remove' : 'add']('hidden'); }
  function text(id, value) { $(id).textContent = value || ''; }
  function message(id, value, error) { text(id, value); $(id).className = 'message' + (error ? ' error' : ''); }
  function avatar(id, url) {
    var img = $(id), target = url || 'icon.png';
    if (img.getAttribute('src') !== target) img.src = target;
    img.onerror = function () { img.onerror = null; img.src = 'icon.png'; };
  }
  function focus(id) { if (K.visible($(id))) $(id).focus(); }
  function badge(id, channel) { text(id, channel.live ? 'LIVE NOW' : 'OFFLINE'); $(id).className = 'badge' + (channel.live ? ' live' : ''); }
  function meta(c) { return (c.category || '') + (c.viewers !== null ? (c.category ? '  ·  ' : '') + c.viewers.toLocaleString() + ' watching' : ''); }
  function qualityText() { return cap ? '720p' : 'HD · 720p to source'; }
  function setPage(page, target, push) {
    if (push) state.history.push({page: state.page, focus: document.activeElement && document.activeElement.id});
    // Invalidate asynchronous work on pages that are being left.
    if (state.page === 'search' && page !== 'search') state.searchSeq++;
    state.page = page;
    ['home', 'search', 'channel', 'account'].forEach(function (id) { visible(id, id === page); });
    ['home', 'search', 'account'].forEach(function (id) { $('nav-' + id).className = 'nav-button' + (id === page ? ' current' : ''); });
    if (target) focus(target);
  }
  function renderSaved() {
    $('saved-list').textContent = '';
    visible('saved-section', saved.length > 0);
    saved.forEach(function (slug) {
      var button = document.createElement('button'); button.id = 'saved-' + slug;
      button.textContent = slug; button.className = slug === state.selected ? 'selected' : '';
      button.onclick = function () { state.selected = slug; store.set('selected', slug); renderSaved(); focus('saved-' + slug); loadHome(false); };
      $('saved-list').appendChild(button);
    });
  }
  function loadHome(fresh) {
    var seq = ++state.homeSeq, slug = state.selected;
    state.home = null;
    ['home-vods', 'home-channel', 'home-refresh'].forEach(function (id) { visible(id, !!slug); });
    $('home-vods').disabled = true; $('home-channel').disabled = true;
    $('home-watch').disabled = !!slug;
    if (!slug) {
      text('home-name', 'Your next stream.'); avatar('home-avatar'); text('home-status', 'WELCOME'); $('home-status').className = 'badge';
      text('home-title', 'Pick a streamer. Make yourself at home.'); text('home-meta', 'Find your favorites on Kick and save them here.');
      text('home-watch', 'Find a streamer'); message('home-message', ''); return;
    }
    text('home-name', slug); avatar('home-avatar'); text('home-status', 'CHECKING'); $('home-status').className = 'badge';
    text('home-title', 'Checking the stream…'); text('home-meta', ''); text('home-watch', 'Watch live'); message('home-message', '');
    api.channel(slug, fresh, function (error, channel) {
      if (seq !== state.homeSeq) return;
      $('home-watch').disabled = false;
      if (error) { text('home-status', 'UNAVAILABLE'); text('home-title', 'Could not load this streamer'); text('home-watch', 'Try again'); message('home-message', error.message, true); return; }
      state.home = channel; text('home-name', channel.name); avatar('home-avatar', channel.avatar); badge('home-status', channel);
      text('home-title', channel.title); text('home-meta', meta(channel) || 'Catch up with a past broadcast, or check back for the next live stream.');
      text('home-watch', channel.live ? 'Watch live' : 'Check again');
      $('home-vods').disabled = false; $('home-channel').disabled = false;
    });
  }
  function saveLabel() { text('channel-save', state.channel && saved.indexOf(state.channel.slug) >= 0 ? 'Remove from home page' : 'Add to home page'); }
  function renderChannel(c) {
    text('channel-name', c.name); avatar('channel-avatar', c.avatar); badge('channel-status', c);
    text('channel-title', c.title); text('channel-meta', meta(c) || (c.live ? 'Live broadcast' : 'Browse available past broadcasts below.'));
    $('channel-watch').disabled = !c.live || !c.playback; text('channel-watch', c.live ? 'Watch live' : 'Offline'); saveLabel();
  }
  function loadVideos(slug, seq, fresh, goToVideos) {
    message('vod-message', 'Loading past broadcasts…'); text('vod-count', ''); $('vod-list').textContent = ''; state.videos = [];
    api.videos(slug, fresh, function (error, videos) {
      if (seq !== state.channelSeq) return;
      if (error) { message('vod-message', error.message + ' Use Refresh to retry.', true); return; }
      state.videos = videos; message('vod-message', videos.length ? '' : 'No public past broadcasts are available.');
      text('vod-count', videos.length ? videos.length + ' recent replays' : '');
      videos.forEach(function (vod, index) {
        var b = document.createElement('button'), img = document.createElement('img'), copy = document.createElement('span'), title = document.createElement('span'), detail = document.createElement('span');
        b.className = 'vod-card'; b.id = 'vod-' + index;
        img.className = 'vod-image'; img.src = vod.thumbnail || 'bicon.png'; img.alt = '';
        img.onerror = function () { img.onerror = null; img.src = 'bicon.png'; };
        copy.className = 'vod-copy'; title.className = 'vod-title'; title.textContent = vod.title;
        detail.className = 'vod-meta'; detail.textContent = K.time(vod.duration) + (K.date(vod.created) ? '  ·  ' + K.date(vod.created) : '');
        copy.appendChild(title); copy.appendChild(detail); b.appendChild(img); b.appendChild(copy);
        b.onclick = function () { startPlayback({kind: 'vod', slug: slug, id: vod.id, title: vod.title}); };
        $('vod-list').appendChild(b);
      });
      if (goToVideos && state.page === 'channel' && videos.length) focus('vod-0');
    });
  }
  function openChannel(channel, goToVideos, fresh, push) {
    state.channel = channel; var seq = ++state.channelSeq;
    setPage('channel', null, push); renderChannel(channel); message('channel-message', '');
    focus(channel.live ? 'channel-watch' : 'channel-save');
    loadVideos(channel.slug, seq, !!fresh, goToVideos);
    if (fresh) api.channel(channel.slug, true, function (error, updated) {
      if (seq !== state.channelSeq) return;
      if (error) { message('channel-message', error.message, true); return; }
      state.channel = updated; renderChannel(updated);
    });
  }
  function search() {
    var seq = ++state.searchSeq, slug = K.slug($('search-input').value);
    $('search-results').textContent = '';
    if (!slug) { message('search-message', 'Enter a username using letters, numbers, underscores or hyphens.', true); return; }
    message('search-message', 'Searching for ' + slug + '…');
    api.channel(slug, false, function (error, channel) {
      if (seq !== state.searchSeq || state.page !== 'search') return;
      if (error) { message('search-message', error.message, true); return; }
      message('search-message', '1 matching streamer');
      var b = document.createElement('button'), img = document.createElement('img'), copy = document.createElement('span'), name = document.createElement('strong'), detail = document.createElement('span');
      b.id = 'search-result'; b.className = 'result-card'; img.className = 'avatar'; img.alt = ''; img.src = channel.avatar || 'icon.png';
      img.onerror = function () { img.onerror = null; img.src = 'icon.png'; };
      copy.className = 'result-copy'; name.textContent = channel.name; detail.textContent = '@' + channel.slug + '  ·  ' + (channel.live ? 'LIVE NOW' : 'Offline') + '  ·  Open streamer page';
      copy.appendChild(name); copy.appendChild(detail); b.appendChild(img); b.appendChild(copy);
      b.onclick = function () { openChannel(channel, false, false, true); };
      $('search-results').appendChild(b); b.focus();
    });
  }
  function showControls(focusControl) {
    if (state.page !== 'watch') return;
    state.controls = true; visible('player-controls', true);
    if (focusControl) focus('player-toggle');
    clearTimeout(state.hideTimer);
    if (state.playerState === 'playing') state.hideTimer = setTimeout(hideControls, 7000);
    updateTime();
  }
  function hideControls() {
    state.controls = false; visible('player-controls', false); clearTimeout(state.hideTimer);
    if ($('player-controls').contains(document.activeElement)) document.activeElement.blur();
  }
  var player = new K.Player($('video'), api, log, function (status, value) {
    if (status === 'offline') {
      hideControls(); state.dimmed = false; visible('blackout', false);
      visible('watch', false); visible('shell', true); state.history = [];
      setPage('home', 'nav-home', false); loadHome(true); return;
    }
    state.playerState = status; text('player-message', value);
    if (status === 'error' || status === 'paused' || status === 'ended') { state.dimmed = false; visible('blackout', false); showControls(false); }
    if (status === 'playing') { text('player-message', ''); if (state.controls) showControls(false); }
    text('player-quality', player.engine === 'native' ? 'Quality: TV managed' : 'Quality: ' + qualityText());
    $('player-quality').disabled = player.engine === 'native';
  }, {replaceVideo: function (oldVideo) {
    var video = oldVideo.cloneNode(false);
    video.removeAttribute('src');
    oldVideo.parentNode.replaceChild(video, oldVideo);
    bindVideo(video);
    return video;
  }});
  function startPlayback(item) {
    if (state.page !== 'watch') state.playerReturn = {page: state.page, focus: document.activeElement.id};
    state.page = 'watch'; state.dimmed = false; visible('blackout', false); visible('shell', false); visible('watch', true);
    text('player-title', (item.kind === 'live' ? 'LIVE  ·  ' : 'REPLAY  ·  ') + item.slug + '  —  ' + item.title);
    visible('player-live', item.kind === 'live'); text('player-message', 'Connecting…');
    visible('player-rewind', item.kind === 'vod'); visible('player-forward', item.kind === 'vod');
    state.playerState = 'loading'; showControls(false); focus('player-back');
    player.start(item, mode, cap); updateTime();
  }
  function stopPlayback() {
    player.stop(); hideControls(); state.dimmed = false; visible('blackout', false);
    visible('watch', false); visible('shell', true);
    var ret = state.playerReturn || {page: 'home', focus: 'home-watch'};
    setPage(ret.page, ret.focus, false);
    if (!K.visible(document.activeElement)) focus('nav-home');
  }
  function back() {
    if (state.dimmed) { state.dimmed = false; visible('blackout', false); return true; }
    if (state.page === 'watch') { stopPlayback(); return true; }
    var previous = state.history.pop();
    if (previous) { setPage(previous.page, previous.focus || 'nav-home', false); return true; }
    if (state.page !== 'home') { setPage('home', 'home-watch', false); return true; }
    // Same platform bridge used by LG's webOSTV.js 1.2.10 platformBack().
    if (window.PalmSystem && window.PalmSystem.platformBack) { window.PalmSystem.platformBack(); return true; }
    // Desktop preview has no TV launcher.
    return false;
  }
  function updateSettings() {
    text('engine-setting', 'Player: ' + ({auto: 'Automatic', hls: 'Adaptive', native: 'Native TV'})[mode]);
    text('quality-setting', 'Quality: ' + qualityText());
    text('player-quality', player.engine === 'native' ? 'Quality: TV managed' : 'Quality: ' + qualityText());
    text('storage-message', store.available ? saved.length + ' saved streamer' + (saved.length === 1 ? '' : 's') + ' · This device only' : 'Storage is unavailable. Changes will last only until you close the app.');
  }
  function cycleQuality() { cap = cap ? 0 : 720; store.set('cap', cap); player.setCap(cap); updateSettings(); showControls(false); }
  function updateTime() {
    if (!state.controls || state.page !== 'watch') return;
    var sample = player.sample(), v = $('video');
    text('player-time', (player.item && player.item.kind === 'vod' ? K.time(v.currentTime) + ' / ' + K.time(v.duration) : 'Live broadcast') +
      '  ·  ' + (player.engine === 'native' ? 'TV player' : 'Adaptive player') +
      (sample.height ? '  ·  ' + sample.height + 'p' : '') + '  ·  Buffer ' + Math.round(sample.buffer) + 's');
  }
  $('nav-home').onclick = function () { state.history = []; setPage('home', 'nav-home', false); loadHome(false); };
  $('nav-search').onclick = function () { state.history = []; setPage('search', 'search-input', false); };
  $('nav-account').onclick = function () { state.history = []; updateSettings(); setPage('account', 'engine-setting', false); };
  $('home-watch').onclick = function () {
    if (!state.selected) { setPage('search', 'search-input', true); return; }
    if (state.home && state.home.live) startPlayback({kind: 'live', slug: state.home.slug, title: state.home.title});
    else loadHome(true);
  };
  $('home-vods').onclick = function () { if (state.home) openChannel(state.home, true, true, true); };
  $('home-channel').onclick = function () { if (state.home) openChannel(state.home, false, true, true); };
  $('home-refresh').onclick = function () { loadHome(true); };
  $('search-form').onsubmit = function (event) { event.preventDefault(); search(); };
  $('channel-watch').onclick = function () { if (state.channel && state.channel.live) startPlayback({kind:'live', slug:state.channel.slug, title:state.channel.title}); };
  $('channel-refresh').onclick = function () { if (state.channel) openChannel(state.channel, false, true, false); };
  $('channel-save').onclick = function () {
    if (!state.channel) return;
    var slug = state.channel.slug, index = saved.indexOf(slug);
    if (index >= 0) { saved.splice(index, 1); if (state.selected === slug) state.selected = saved[0]; }
    else {
      if (saved.length >= 12) { message('channel-message', 'Your home page has 12 streamers. Remove one before adding another.'); return; }
      saved.push(slug); state.selected = slug;
    }
    store.set('saved', saved); store.set('selected', state.selected || null); saveLabel(); renderSaved(); loadHome(false);
    message('channel-message', index >= 0 ? 'Removed from your home page.' : 'Added to your home page.');
  };
  $('engine-setting').onclick = function () { mode = ['auto','hls','native'][(['auto','hls','native'].indexOf(mode) + 1) % 3]; store.set('engine', mode); updateSettings(); };
  $('quality-setting').onclick = cycleQuality;
  $('player-quality').onclick = cycleQuality;
  $('player-toggle').onclick = function () { player.toggle(); showControls(false); };
  $('player-live').onclick = function () { player.goLive(); };
  $('player-rewind').onclick = function () { player.seek(-30); showControls(false); };
  $('player-forward').onclick = function () { player.seek(30); showControls(false); };
  $('player-retry').onclick = function () { player.retry(); };
  $('player-back').onclick = stopPlayback;
  function bindVideo(video) {
    video.onclick = function () { showControls(true); };
    video.addEventListener('timeupdate', updateTime);
  }
  bindVideo($('video'));
  document.addEventListener('keydown', function (event) {
    var key = event.keyCode, active = document.activeElement, input = active && active.tagName === 'INPUT';
    // Keep Backspace and horizontal cursor movement available to the on-screen keyboard.
    if (input && (key === 8 || key === 37 || key === 39)) return;
    if (key === 461 || key === 27 || key === 8 || key === 413) { if (back()) event.preventDefault(); return; }
    if (state.page === 'watch') {
      if (key === 403) { event.preventDefault(); state.dimmed = !state.dimmed; visible('blackout', state.dimmed); hideControls(); return; }
      if (key === 412 || key === 417 || (state.dimmed && (key === 37 || key === 39))) {
        event.preventDefault(); player.seek(key === 412 || key === 37 ? -30 : 30); return;
      }
      if (state.dimmed) {
        if (key === 13) player.toggle();
        event.preventDefault(); return;
      }
      if (key === 404) { event.preventDefault(); player.retry(); return; }
      if (key === 415 || key === 19 || key === 179) { event.preventDefault(); if ((key === 415 && player.userPaused) || (key === 19 && !player.userPaused) || key === 179) player.toggle(); return; }
      if (!state.controls) {
        if (key === 13) { event.preventDefault(); player.toggle(); if (state.controls) focus('player-toggle'); }
        else if (key === 38 || key === 40) { event.preventDefault(); showControls(true); }
        else if (key === 37 || key === 39) { event.preventDefault(); player.seek(key === 37 ? -10 : 10); }
        return;
      }
      if (key >= 37 && key <= 40) { event.preventDefault(); K.moveFocus($('player-controls'), key); showControls(false); return; }
    }
    if (key >= 37 && key <= 40) { event.preventDefault(); K.moveFocus($('shell'), key); }
    else if (key === 13 && !input && active && active.tagName === 'BUTTON') { event.preventDefault(); active.click(); }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) player.suspend(); else player.resume();
  });
  window.addEventListener('offline', function () {
    log.add('network', {reason:'offline'});
    if (state.page === 'watch') text('player-message', 'Connection lost. Waiting for the network…');
  });
  window.addEventListener('online', function () {
    log.add('network', {reason:'online'});
    if (state.page === 'watch' && !player.suspended) player.retry();
  });
  window.addEventListener('beforeunload', function () { player.stop(); });
  // Read-only export for LG Web Inspector; no tokens, URLs, cookies or personal account data.
  window.kickDiagnostics = function () { return log.report(); };
  renderSaved(); updateSettings(); loadHome(false); focus('nav-search');
  // Only refresh the visible home channel, never interrupt active playback or redraw focus.
  setInterval(function () {
    if (document.hidden || state.page !== 'home' || !state.selected) return;
    var slug = state.selected, seq = state.homeSeq;
    api.channel(slug, true, function (error, channel) {
      if (seq !== state.homeSeq || state.page !== 'home') return;
      if (error) { message('home-message', 'Status may be out of date. ' + error.message, true); return; }
      state.home = channel; badge('home-status', channel); text('home-title', channel.title); text('home-meta', meta(channel));
      text('home-watch', channel.live ? 'Watch live' : 'Check again'); message('home-message', '');
      $('home-watch').disabled = false; $('home-vods').disabled = false; $('home-channel').disabled = false;
    });
  }, 60000);
}());
