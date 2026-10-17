const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../app/js/core');
require('../app/js/api');
test('usernames are normalized and cannot inject paths', () => {
  assert.equal(K.slug(' XqC '),'xqc');
  for (const s of ['../admin','a/b','x?token=1','', 'a'.repeat(26)]) assert.equal(K.slug(s),null);
});
test('unknown channel responses are errors, not offline', () => {
  assert.throws(() => K.channel({id:1,slug:'xqc'},'xqc'));
  assert.throws(() => K.channel({id:1,slug:'xqc',livestream:{}},'xqc'));
  assert.equal(K.channel({id:1,slug:'xqc',livestream:null},'xqc').live,false);
});
test('signed URL is preserved and unsafe URLs rejected', () => {
  const url = 'https://cdn.example/master.m3u8?token=a%2Fb%3D&x=1';
  assert.equal(K.url(url),url);
  assert.equal(K.url('javascript:alert(1)'),null);
  assert.equal(K.url('https://user@host/path'),null);
});
test('VOD duration is milliseconds; live, deleted and duplicates excluded', () => {
  const vod = {id:1,is_live:false,duration:37819000,source:'https://stream.kick.com/vod.m3u8',session_title:'Title'};
  const result=K.vods([vod,vod,{...vod,id:2,is_live:true},{...vod,id:3,video:{deleted_at:'today'}}]);
  assert.equal(result.length,1); assert.equal(result[0].duration,37819); assert.equal(K.time(result[0].duration),'10:30:19');
  assert.throws(() => K.vods({message:'challenge'})); assert.deepEqual(K.vods([]),[]);
});
test('storage failures preserve session settings', () => {
  const s = new K.Store(null); s.set('saved',['xqc']); assert.deepEqual(s.get('saved',[]),['xqc']); assert.equal(s.available,false);
});
test('diagnostics are bounded and omit raw URL/token fields', () => {
  const log=new K.Diagnostics();
  for(let i=0;i<150;i++) log.add('error',{status:403,url:'secret',token:'secret',detail:'https://cdn.example/?token=secret'});
  assert.equal(log.events.length,120); assert.ok(!log.report().includes('secret'));
});
function fakeXHR() {
  const requests=[];
  function make() {
    const x={status:0,open(method,url){this.url=url;},setRequestHeader(){},send(){requests.push(this);},respond(status,data){this.status=status;this.responseText=JSON.stringify(data);this.onload();}};
    return x;
  }
  return {requests,make};
}
test('API caches by channel, coalesces requests, and fresh playback bypasses cache', () => {
  const f=fakeXHR(),api=new K.API({makeXHR:f.make});let calls=0;
  const raw={id:1,slug:'xqc',livestream:{id:12},playback_url:'https://cdn.example/a.m3u8'};
  api.channel('xqc',false,()=>calls++);api.channel('xqc',false,()=>calls++);
  assert.equal(f.requests.length,1);f.requests[0].respond(200,raw);assert.equal(calls,2);
  api.channel('xqc',false,()=>calls++);assert.equal(f.requests.length,1);
  api.channel('other',false,()=>{});assert.equal(f.requests.length,2);
  api.resolve({kind:'live',slug:'xqc'},()=>{});assert.equal(f.requests.length,3);
});
test('timeout and network events settle once', () => {
  const f=fakeXHR(),api=new K.API({makeXHR:f.make});let calls=0;
  api.channel('xqc',true,e=>{assert.ok(e);calls++;});
  const timeout=f.requests[0].ontimeout, error=f.requests[0].onerror;timeout();error();assert.equal(calls,1);
});
test('429 pauses requests instead of hammering Kick', () => {
  const f=fakeXHR(),api=new K.API({makeXHR:f.make});
  api.channel('xqc',true,()=>{});f.requests[0].respond(429,{});
  api.channel('xqc',true,e=>assert.match(e.message,/slow down/));assert.equal(f.requests.length,1);
});
test('missing refreshed VOD produces explicit error', () => {
  const f=fakeXHR(),api=new K.API({makeXHR:f.make});let message='';
  api.resolve({kind:'vod',slug:'xqc',id:'removed'},e=>{message=e.message;});f.requests[0].respond(200,[]);
  assert.match(message,/no longer available/);
});
