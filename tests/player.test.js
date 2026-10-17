const test=require('node:test'), assert=require('node:assert/strict'), vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function setup(native=false) {
  let now=100000,id=0;const timers=new Map(),pending=[],events=[],messages=[];
  function MockDate(){return new Date(now);} MockDate.now=()=>now;
  const context={console,Date:MockDate, navigator:{onLine:true,userAgent:'test'},setTimeout:(f,delay)=>{timers.set(++id,{f,delay});return id;},clearTimeout:i=>timers.delete(i),setInterval:(f,delay)=>{timers.set(++id,{f,delay,interval:true});return id;},clearInterval:i=>timers.delete(i)};context.global=context;
  vm.createContext(context);
  for(const f of ['core.js','player.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/js',f),'utf8'),context);
  class Hls {
    constructor(config){this.config=config;this.handlers={};this.levels=[{height:360,bitrate:600000},{height:480,bitrate:1400000},{height:720,bitrate:3400000},{height:1080,bitrate:9000000}];this.currentLevel=3;this.liveSyncPosition=80;Hls.instances.push(this);}
    static isSupported(){return true;}
    on(e,f){this.handlers[e]=f;}
    emit(e,d){if(this.handlers[e])this.handlers[e](e,d);}
    destroy(){this.destroyed=true;}
    attachMedia(v){this.video=v;}
    loadSource(url){this.url=url;}
  }
  Hls.instances=[];Hls.Events={MANIFEST_PARSED:'manifest',LEVEL_LOADED:'level',LEVEL_SWITCHED:'switched',ERROR:'error'};
  Hls.ErrorDetails={MANIFEST_LOAD_ERROR:'manifestLoadError'};Hls.ErrorTypes={MEDIA_ERROR:'mediaError'};
  const listeners={};const video={paused:true,currentTime:0,duration:1000,buffered:{length:0},seekable:{length:1,start:()=>0,end:()=>100},ownerDocument:{createElement:()=>({})},
    addEventListener(e,f){(listeners[e]||(listeners[e]=[])).push(f);},removeEventListener(e,f){listeners[e]=(listeners[e]||[]).filter(x=>x!==f);},
    emit(e){for(const f of [...(listeners[e]||[])])f();},pause(){this.paused=true;},play(){this.paused=false;this.plays=(this.plays||0)+1;},load(){},removeAttribute(){},appendChild(s){this.source=s;},canPlayType(){return native?'probably':'';}};
  const api={resolve(item,cb){pending.push({item,cb});},channel(slug,fresh,cb){pending.push({slug,fresh,cb});}};
  const log={add:(type,data)=>events.push({type,data})};
  const player=new context.KickTV.Player(video,api,log,(s,t)=>messages.push({s,t}),{Hls});
  return {player,video,Hls,pending,events,messages,timers,listeners,advance(ms){now+=ms;},fireRetry(){const entry=[...timers].find(([i,t])=>!t.interval);assert.ok(entry);timers.delete(entry[0]);entry[1].f();}};
}
const item={kind:'live',slug:'xqc'};
test('stop cancels pending resolution and prevents ghost playback',()=>{const s=setup();s.player.start(item);s.player.stop();s.pending[0].cb(null,'https://test/a');assert.equal(s.Hls.instances.length,0);assert.equal(s.timers.size,0);});
test('old HLS callbacks cannot mutate new playback',()=>{const s=setup();s.player.start(item);s.pending[0].cb(null,'https://test/a');const old=s.Hls.instances[0];s.player.start({kind:'live',slug:'other'});s.pending[1].cb(null,'https://test/b');old.emit('error',{fatal:true,type:'networkError',response:{code:403}});assert.equal(s.player.attempts,0);assert.equal(s.player.item.slug,'other');});
test('fatal authorization refreshes URL with backoff and stops after three recoveries',()=>{
 const s=setup();s.player.start(item);s.pending[0].cb(null,'https://test/a');
 for(let n=0;n<3;n++){s.Hls.instances[n].emit('error',{fatal:true,type:'networkError',response:{code:403}});assert.equal(s.player.attempts,n+1);s.fireRetry();s.pending[n+1].cb(null,'https://test/fresh'+n);}
 s.Hls.instances[3].emit('error',{fatal:true,response:{code:403}});assert.equal(s.pending[4].fresh,true);s.pending[4].cb(null,{live:true});assert.equal(s.player.failed,true);assert.match(s.messages.at(-1).t,/could not recover/);
});
test('manifest success does not reset recovery budget',()=>{const s=setup();s.player.start(item);s.pending[0].cb(null,'https://test/a');s.player.attempts=2;s.Hls.instances[0].emit('manifest');assert.equal(s.player.attempts,2);});
test('nonfatal segment errors are left to HLS recovery',()=>{const s=setup();s.player.start(item);s.pending[0].cb(null,'https://test/a');s.Hls.instances[0].emit('error',{fatal:false,response:{code:404}});assert.equal(s.player.attempts,0);});
test('automatic native fallback destroys HLS before assigning a native source',()=>{const s=setup(true);s.player.start(item);s.pending[0].cb(null,'https://test/a');const h=s.Hls.instances[0];h.emit('error',{fatal:true,details:'manifestLoadError'});assert.equal(h.destroyed,true);assert.equal(s.player.engine,'native');assert.equal(s.video.source.src,'https://test/a');assert.equal(s.player.hls,null);});
test('HD policy permits low startup then selects 720p without locking adaptive source quality',()=>{const s=setup();s.player.start(item);s.pending[0].cb(null,'https://test/a');const h=s.Hls.instances[0];h.emit('manifest');assert.equal(h.config.startLevel,0);assert.equal(h.config.minAutoBitrate,0);for(let i=1;i<=4;i++){s.video.currentTime=i;s.video.emit('timeupdate');}assert.equal(h.config.minAutoBitrate,3400000);assert.equal(h.nextAutoLevel,2);assert.equal(h.autoLevelCapping,-1);assert.equal(h.currentLevel,3);s.player.setCap(720);assert.equal(h.autoLevelCapping,2);s.advance(25000);s.player.watch();assert.equal(s.player.attempts,1);});
test('a fresh offline response releases playback and tells the screen to return home',()=>{const s=setup();s.player.start(item);const error=new Error('offline');error.code='STREAM_OFFLINE';s.pending[0].cb(error);assert.equal(s.player.item,null);assert.equal(s.messages.at(-1).s,'offline');assert.equal(s.Hls.instances.length,0);assert.equal(s.timers.size,0);});
test('exhausted recovery checks live status, but network failure does not mean offline',()=>{const s=setup();s.player.start(item);s.pending[0].cb(null,'https://test/a');s.player.attempts=3;s.player.recover('network');s.pending[1].cb(new Error('network'));assert.equal(s.player.failed,true);assert.notEqual(s.messages.at(-1).s,'offline');});
test('confirmed broadcast end after failed recovery releases the player',()=>{const s=setup();s.player.start(item);s.pending[0].cb(null,'https://test/a');s.player.attempts=3;s.player.recover('network');s.pending[1].cb(null,{live:false});assert.equal(s.player.item,null);assert.equal(s.messages.at(-1).s,'offline');});
test('replay seeking moves both ways and clamps to available duration',()=>{const s=setup();s.player.start({kind:'vod',slug:'xqc',id:'1'});s.pending[0].cb(null,'https://test/a');s.video.currentTime=120;s.player.seek(30);assert.equal(s.video.currentTime,150);s.player.seek(-30);assert.equal(s.video.currentTime,120);s.player.seek(-300);assert.equal(s.video.currentTime,0);s.player.seek(3000);assert.equal(s.video.currentTime,1000);});
test('reconnect replaces the media surface and resumes HLS at the saved position without a second metadata seek',()=>{
 const s=setup();let replacements=0,latest;
 s.player.replaceVideo=old=>{replacements++;latest={...old,currentTime:0};return latest;};
 s.player.start({kind:'vod',slug:'xqc',id:'1'});s.pending[0].cb(null,'https://test/a');latest.currentTime=574;
 const old=latest;s.player.retry();s.pending[1].cb(null,'https://test/fresh');
 assert.equal(replacements,2);assert.notEqual(latest,old);assert.equal(s.Hls.instances[0].destroyed,true);
 assert.equal(s.Hls.instances[1].config.startPosition,574);assert.equal(s.Hls.instances[1].video,latest);
 latest.currentTime=575;latest.emit('loadedmetadata');assert.equal(latest.currentTime,575);
});
test('suspension cancels requests and restores VOD position without unpausing user pause',()=>{const s=setup();s.player.start({kind:'vod',slug:'xqc',id:'1'});s.pending[0].cb(null,'https://test/a');s.video.currentTime=42;s.player.toggle();s.player.suspend();assert.equal(s.player.resumeAt,42);s.player.resume();s.pending[1].cb(null,'https://test/b');s.video.emit('loadedmetadata');assert.equal(s.video.currentTime,42);assert.equal(s.player.userPaused,true);assert.equal(s.video.paused,true);});
test('listeners remain bounded across many starts and stop releases them',()=>{const s=setup();for(let i=0;i<30;i++){s.player.start(item);s.pending[i].cb(null,'https://test/a');}assert.equal(Object.values(s.listeners).flat().length,6);s.player.stop();assert.equal(Object.values(s.listeners).flat().length,0);assert.equal(s.timers.size,0);});
