/* Local test server only. This file is not packaged on the TV. */
(function () {
  document.querySelector('.unofficial').textContent = 'TEST FIXTURES — NOT LIVE DATA';
  var K = window.KickTV;
  K.API.prototype.channel = function (slug, fresh, callback) {
    setTimeout(function () {
      if (slug === 'missing') return callback(new Error('Streamer or video not found. Check the username.'));
      if (slug === 'broken') return callback(new Error('Kick refused this request. Access may be restricted; retry later.'));
      callback(null, {id:'1',slug:slug,name:slug === 'xqc' ? 'xQc' : slug,avatar:null,live:slug !== 'offline' && !(slug === 'ending' && fresh),
        title:slug === 'offline' ? 'The stream is offline' : 'A test broadcast — live status and remote navigation',category:'Just Chatting',viewers:8413,playback:'https://example.invalid/master.m3u8'});
    }, slug === 'slow' ? 1500 : 50);
  };
  K.API.prototype.videos = function (slug, fresh, callback) {
    setTimeout(function () {
      callback(null, slug === 'empty' ? [] : [0,1,2,3,4,5].map(function (i) {
        return {id:String(i),title:'Test replay ' + (i+1) + ': a longer title for the TV card layout',source:'https://example.invalid/replay.m3u8',thumbnail:null,duration:37819,created:'2026-09-21 19:06:32'};
      }));
    }, 50);
  };
}());
