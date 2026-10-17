(function (root) {
  'use strict';
  var K = root.KickTV = root.KickTV || {};
  K.slug = function (value) {
    var s = String(value || '').replace(/^\s+|\s+$/g, '').toLowerCase();
    return /^[a-z0-9_-]{1,25}$/.test(s) ? s : null;
  };
  K.url = function (value) {
    // Preserve signed URLs byte-for-byte. JSON parsing already unescapes slashes.
    return typeof value === 'string' && /^https:\/\/[^\s/@]+(?:\/|$)/i.test(value) ? value : null;
  };
  K.time = function (seconds) {
    if (!isFinite(seconds) || seconds < 0) return '--:--';
    seconds = Math.floor(seconds);
    var h = Math.floor(seconds / 3600), m = Math.floor(seconds / 60) % 60, s = seconds % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
  };
  K.date = function (value) {
    if (!value) return '';
    // Kick's legacy timestamps are UTC but sometimes omit the zone.
    var s = String(value).replace(' ', 'T');
    if (/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(s)) s += 'Z';
    var d = new Date(s);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString();
  };
  K.channel = function (raw, requested) {
    if (!raw || typeof raw !== 'object' || !raw.id || !K.slug(raw.slug) ||
        !Object.prototype.hasOwnProperty.call(raw, 'livestream') ||
        (raw.livestream !== null && (typeof raw.livestream !== 'object' || !raw.livestream.id))) {
      throw new Error('Kick returned an unfamiliar channel response. Try again later.');
    }
    var live = raw.livestream, user = raw.user || {}, categories = live && live.categories || [];
    return {
      id: String(raw.id), slug: K.slug(raw.slug) || requested,
      name: String(user.username || raw.slug), avatar: K.url(user.profile_pic),
      live: !!live, title: live ? String(live.session_title || 'Live broadcast') : 'The stream is offline',
      category: categories[0] ? String(categories[0].name || '') : '',
      viewers: live && typeof live.viewer_count === 'number' ? live.viewer_count : null,
      started: live && (live.start_time || live.created_at),
      playback: K.url(raw.playback_url || (live && live.playback_url)),
      bio: typeof user.bio === 'string' ? user.bio : '', banned: raw.is_banned === true
    };
  };
  K.vods = function (raw) {
    var list = Array.isArray(raw) ? raw : raw && raw.data;
    if (!Array.isArray(list)) throw new Error('Kick returned an unfamiliar videos response. Try again later.');
    var result = [], seen = {}, i, v, url, id;
    for (i = 0; i < list.length && result.length < 24; i++) {
      v = list[i];
      if (!v || v.is_live !== false || (v.video && (v.video.deleted_at || v.video.is_private || v.video.is_pruned))) continue;
      url = K.url(v.source);
      id = v.video && v.video.uuid || v.id;
      if (!url || id === undefined || seen[String(id)]) continue;
      seen[String(id)] = true;
      result.push({id: String(id), title: String(v.session_title || v.title || 'Past broadcast'),
        source: url, thumbnail: K.url(v.thumbnail && v.thumbnail.src),
        duration: typeof v.duration === 'number' ? v.duration / 1000 : 0,
        created: v.start_time || v.created_at});
    }
    return result;
  };
  K.Store = function (storage) { this.storage = storage; this.memory = {}; this.available = true; };
  K.Store.prototype.get = function (key, fallback) {
    try { var v = this.storage.getItem('kicktv.' + key); return v === null ? fallback : JSON.parse(v); }
    catch (e) { this.available = false; return this.memory[key] === undefined ? fallback : this.memory[key]; }
  };
  K.Store.prototype.set = function (key, value) {
    this.memory[key] = value;
    try { this.storage.setItem('kicktv.' + key, JSON.stringify(value)); }
    catch (e) { this.available = false; }
  };
  K.Diagnostics = function () { this.events = []; this.last = {}; };
  K.Diagnostics.prototype.add = function (type, details) {
    // Only structured, deliberately selected scalar fields. Never include URLs or raw errors.
    var allowed = ['status','detail','engine','attempt','level','height','bitrate','buffer','latency','bandwidth','dropped','frames','duration','live','seconds','code','reason'];
    var clean = {}, i, v;
    for (i = 0; i < allowed.length; i++) {
      v = details && details[allowed[i]];
      if (typeof v === 'number' && isFinite(v)) clean[allowed[i]] = Math.round(v * 100) / 100;
      else if (typeof v === 'boolean') clean[allowed[i]] = v;
      else if (typeof v === 'string') clean[allowed[i]] = v.replace(/https?:\/\/\S+/g, '[URL removed]').slice(0, 100);
    }
    this.events.push({at: new Date().toISOString(), type: type, data: clean});
    if (this.events.length > 120) this.events.shift();
    if (type === 'sample') this.last = clean;
  };
  K.Diagnostics.prototype.report = function () {
    return JSON.stringify({app: '2.0.1', hls: '1.4.10', userAgent: root.navigator ? root.navigator.userAgent : 'test', events: this.events}, null, 2);
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = K;
}(typeof window !== 'undefined' ? window : global));
