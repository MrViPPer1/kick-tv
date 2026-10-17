'use strict';
// Read-only, low-volume probe. Never writes tokens, signed URLs, cookies or session-data values.
const slug = process.argv[2] || 'xqc';
if (!/^[a-z0-9_-]{1,25}$/.test(slug)) throw new Error('Pass an exact Kick username.');
async function get(url, origin) {
  const started = Date.now();
  const r = await fetch(url, {headers: origin ? {Origin:origin, Accept:'*/*'} : {Accept:'application/json'}, signal:AbortSignal.timeout(15000)});
  const text = await r.text();
  return {status:r.status, text, url:r.url, redirected:r.redirected, ms:Date.now()-started, cors:r.headers.get('access-control-allow-origin')};
}
function playlistSummary(p) {
  const lines = p.text.split(/\r?\n/);
  return {status:p.status, cors:p.cors, redirected:p.redirected, ms:p.ms,
    hls:lines[0] === '#EXTM3U',
    variants:lines.filter(l => l.startsWith('#EXT-X-STREAM-INF:')),
    targetDuration:lines.find(l => l.startsWith('#EXT-X-TARGETDURATION:')),
    segments:lines.filter(l => l.startsWith('#EXTINF:')).map(l => Number(l.slice(8).split(',')[0])),
    prefetch:lines.filter(l => l.startsWith('#EXT-X-PREFETCH:')).length,
    appleParts:lines.filter(l => l.startsWith('#EXT-X-PART:')).length,
    endList:lines.includes('#EXT-X-ENDLIST')};
}
(async () => {
  const c = await get('https://kick.com/api/v2/channels/' + slug, 'null');
  const report = {at:new Date().toISOString(), slug, channel:{status:c.status,cors:c.cors}};
  if (c.status !== 200) { console.log(JSON.stringify(report,null,2)); return; }
  const raw = JSON.parse(c.text); report.channel.live = !!raw.livestream;
  if (raw.livestream && raw.playback_url) {
    const token = new URL(raw.playback_url).searchParams.get('token');
    try { const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url')); report.tokenSecondsRemaining = claims.exp - Math.floor(Date.now()/1000); } catch {}
    const master = await get(raw.playback_url, 'null'); report.liveMaster = playlistSummary(master);
    const line = master.text.split(/\r?\n/).find(l => l && !l.startsWith('#'));
    if (master.status === 200 && master.text.startsWith('#EXTM3U') && line) report.liveMedia = playlistSummary(await get(new URL(line, master.url), 'null'));
  }
  const v = await get('https://kick.com/api/v2/channels/' + slug + '/videos', 'null');
  report.videos = {status:v.status,cors:v.cors};
  if (v.status === 200) {
    const list = JSON.parse(v.text); report.videos.count = Array.isArray(list) ? list.length : null;
    const vod = Array.isArray(list) && list.find(v => v.is_live === false && v.source);
    if (vod) report.vodMaster = playlistSummary(await get(vod.source, 'null'));
  }
  console.log(JSON.stringify(report, null, 2));
})().catch(e => { console.error('Probe failed:', e.name); process.exitCode=1; });
