(function (root) {
  'use strict';
  var K = root.KickTV;
  K.API = function (options) {
    options = options || {};
    this.base = options.base || 'https://kick.com/api/v2';
    this.makeXHR = options.makeXHR || function () { return new XMLHttpRequest(); };
    this.cache = {}; this.keys = []; this.pending = {}; this.cooldown = 0;
    this.diagnostics = options.diagnostics;
  };
  K.API.prototype.request = function (path, fresh, callback) {
    var self = this, now = Date.now(), cached = self.cache[path], key = path + (fresh ? ':fresh' : ':cached');
    if (self.cooldown > now) { callback(new Error('Kick asked us to slow down. Wait a minute, then retry.')); return; }
    if (!fresh && cached && now - cached.at < 30000) { callback(null, cached.data); return; }
    if (self.pending[key]) { self.pending[key].push(callback); return; }
    self.pending[key] = [callback];
    var xhr = self.makeXHR(), done = false;
    function finish(error, data) {
      if (done) return;
      done = true;
      var callbacks = self.pending[key]; delete self.pending[key];
      xhr.onload = xhr.onerror = xhr.ontimeout = xhr.onabort = null;
      if (!error) {
        if (!self.cache[path]) self.keys.push(path);
        self.cache[path] = {at: Date.now(), data: data};
        while (self.keys.length > 16) delete self.cache[self.keys.shift()];
      }
      if (self.diagnostics) self.diagnostics.add('api', {status: xhr.status || 0, reason: error ? 'failed' : 'ok'});
      for (var i = 0; i < callbacks.length; i++) callbacks[i](error, data);
    }
    xhr.onload = function () {
      var status = xhr.status;
      if (status === 404) return finish(new Error('Streamer or video not found. Check the username.'));
      if (status === 401 || status === 403) return finish(new Error('Kick refused this request. Access may be restricted; retry later.'));
      if (status === 429) {
        self.cooldown = Date.now() + 60000;
        return finish(new Error('Kick asked us to slow down. Wait a minute, then retry.'));
      }
      if (status < 200 || status >= 300) return finish(new Error('Kick is unavailable (HTTP ' + status + '). Try again.'));
      var data;
      try { data = JSON.parse(xhr.responseText); }
      catch (e) { return finish(new Error('Kick did not return channel data. Access may be restricted.')); }
      finish(null, data);
    };
    xhr.onerror = function () { finish(new Error('Could not reach Kick. Check the connection; TV access or CORS may also be blocking the request.')); };
    xhr.ontimeout = function () { finish(new Error('Kick took too long to respond. Please retry.')); };
    xhr.onabort = function () { finish(new Error('Request cancelled.')); };
    try {
      xhr.open('GET', self.base + path, true); xhr.timeout = 12000;
      xhr.setRequestHeader('Accept', 'application/json'); xhr.send(null);
    } catch (e) { finish(new Error('Could not start the connection to Kick.')); }
  };
  K.API.prototype.channel = function (name, fresh, callback) {
    var slug = K.slug(name);
    if (!slug) { callback(new Error('Use a Kick username: 1–25 letters, numbers, underscores or hyphens.')); return; }
    this.request('/channels/' + encodeURIComponent(slug), fresh, function (error, raw) {
      if (error) return callback(error);
      var result;
      try { result = K.channel(raw, slug); } catch (e) { return callback(e); }
      callback(null, result);
    });
  };
  K.API.prototype.videos = function (name, fresh, callback) {
    var slug = K.slug(name);
    if (!slug) { callback(new Error('Invalid streamer name.')); return; }
    this.request('/channels/' + encodeURIComponent(slug) + '/videos', fresh, function (error, raw) {
      if (error) return callback(error);
      var result;
      try { result = K.vods(raw); } catch (e) { return callback(e); }
      callback(null, result);
    });
  };
  K.API.prototype.resolve = function (item, callback) {
    if (item.kind === 'live') this.channel(item.slug, true, function (error, channel) {
      if (error) return callback(error);
      if (!channel.live) {
        var offline = new Error('The streamer is now offline.'); offline.code = 'STREAM_OFFLINE';
        return callback(offline);
      }
      if (!channel.playback) return callback(new Error('Kick has not supplied a playable live URL. Try again shortly.'));
      callback(null, channel.playback);
    });
    else this.videos(item.slug, true, function (error, videos) {
      if (error) return callback(error);
      for (var i = 0; i < videos.length; i++) if (videos[i].id === item.id) return callback(null, videos[i].source);
      callback(new Error('This replay is no longer available in the recent videos list. Return and choose another.'));
    });
  };
}(typeof window !== 'undefined' ? window : global));
