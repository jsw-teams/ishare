import test from 'node:test';
import assert from 'node:assert/strict';
import {rewriteManifest,openResource,deliver,upstreamUrl,sealResource} from '../backend/cloudflare/delivery.js';
import {b64,random} from '../backend/cloudflare/security.js';
import {environment,repository} from './helpers.mjs';
const env=environment({}),item={id:'a'.repeat(32),kind:'video',provider_id:'provider-id-123456789012345'};
const token='header.'+b64(new TextEncoder().encode(JSON.stringify({sub:item.provider_id})))+'.signature';
const base='https://customer-testcustomer.cloudflarestream.com/'+token+'/manifest/video.m3u8';

test('HLS playlists rewrite variants, keys, initialization segments and subtitles into encrypted same-origin tickets',async()=>{
  const secret=random(),now=Math.floor(Date.now()/1000);
  const source='#EXTM3U\n#EXT-X-MAP:URI="../init.mp4"\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXT-X-MEDIA:TYPE=SUBTITLES,URI="subtitles/index.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nvariant.m3u8\n';
  const result=await rewriteManifest(source,base,item.id,secret,now+3600,env);
  assert.doesNotMatch(result,/cloudflarestream|provider-id|variant\.m3u8|key\.bin|init\.mp4|subtitles/);
  const tickets=[...result.matchAll(/\/v\/[a-f0-9]{32}\/([A-Za-z0-9_-]+)/g)].map(m=>m[1]);assert.equal(tickets.length,4);
  const opened=await Promise.all(tickets.map(t=>openResource(t,item.id,secret,now,env,item)));assert.ok(opened.some(url=>url.pathname.endsWith('/variant.m3u8')));
  await assert.rejects(openResource((tickets[0][0]==='A'?'B':'A')+tickets[0].slice(1),item.id,secret,now,env,item));
  await assert.rejects(openResource(tickets[0],'b'.repeat(32),secret,now,env,item));
  await assert.rejects(openResource(tickets[0],item.id,secret,now+3601,env,item));
});
test('SSRF, namespace escapes, redirects and unsafe manifest syntax fail closed',async()=>{
  const secret=random();for(const source of ['#EXTM3U\nhttps://evil.example/a.ts','#EXTM3U\n#EXT-X-KEY:URI="https://169.254.169.254/secret"','#EXTM3U\n../../other/a.ts','#EXTM3U\n#EXT-X-DEFINE:NAME="token",VALUE="x"'])await assert.rejects(rewriteManifest(source,base,item.id,secret,100,env));
  assert.throws(()=>upstreamUrl('https://customer-testcustomer.cloudflarestream.com.evil.example/a',base,env));
  const image={id:item.id,kind:'image',provider_id:item.provider_id};
  await assert.rejects(deliver(new Request('https://ishare.js.gripe/i/'+item.id+'/public'),env,image,'public',{delivery:()=>{}}, {waitUntil:()=>{}},{cache:null,requestUpstream:async()=>new Response(null,{status:302,headers:{Location:'https://origin.example/secret'}})}),/media_unavailable/);
});
test('image delivery returns bytes without leaking provider headers or redirects',async()=>{
  const image={id:item.id,kind:'image',provider_id:item.provider_id};
  const response=await deliver(new Request('https://ishare.js.gripe/i/'+item.id+'/public'),env,image,'public',{delivery:()=>{}}, {waitUntil:()=>{}},{cache:null,requestUpstream:async(url,options)=>{assert.equal(url.hostname,'api.cloudflare.com');assert.ok(url.pathname.endsWith('/blob'));assert.equal(options.headers.Authorization,'Bearer '+env.MEDIA_API_TOKEN);assert.equal(options.redirect,'manual');assert.equal(url.search,'');return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'image/png',Location:'https://origin.example','Content-Location':'https://origin.example','Link':'<https://origin.example>'}});}});
  assert.equal(response.status,200);for(const name of ['Location','Content-Location','Link'])assert.equal(response.headers.get(name),null);assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[1,2,3]);
});

test('long video segments renew private upstream tokens without changing public resource tickets',async()=>{
  const {store,database}=repository(),settings=environment(store),now=Math.floor(Date.now()/1000),video={...item,owner:'42',duration:7200};delete settings.STREAM_SIGNING_KEY;delete settings.STREAM_SIGNING_KEY_ID;
  const expired='header.'+b64(new TextEncoder().encode(JSON.stringify({sub:item.provider_id,exp:now-100})))+'.expired',fresh='header.'+b64(new TextEncoder().encode(JSON.stringify({sub:item.provider_id,exp:now+3600})))+'.fresh';
  let minted=0,deliveries=0;try{const ticket=await sealResource(new URL('https://customer-testcustomer.cloudflarestream.com/'+expired+'/video/segment.ts'),item.id,await store.key(),now+7500,4);
    const options={cache:null,requestProvider:async(url,options)=>{if(options.method==='POST'){minted++;return Response.json({success:true,result:{token:fresh}});}return Response.json({success:true,result:{requireSignedURLs:true,playback:{hls:'https://customer-testcustomer.cloudflarestream.com/'+item.provider_id+'/manifest/video.m3u8'}}});},requestUpstream:async url=>{assert.equal(url.pathname,'/'+fresh+'/video/segment.ts');deliveries++;return new Response('segment',{headers:{'Content-Type':'video/mp2t'}});}};
    for(let i=0;i<2;i++){const response=await deliver(new Request('https://ishare.js.gripe/v/'+item.id+'/'+ticket),settings,video,ticket,store,{waitUntil:()=>{}},options);assert.equal(response.status,200);await response.text();}
    assert.equal(minted,1);assert.equal(deliveries,2);assert.equal(store.account('42',{},'99',now).usage.videoDeliverySeconds,8);
  }finally{database.close();}
});
