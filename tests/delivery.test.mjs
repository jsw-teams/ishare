import test from 'node:test';
import assert from 'node:assert/strict';
import {rewriteManifest,openResource,deliver,upstreamUrl,sealResource} from '../backend/cloudflare/delivery.js';
import {b64,random} from '../backend/cloudflare/security.js';
import {environment,repository,media,limits,now} from './helpers.mjs';
import {videoAddress} from '../backend/cloudflare/provider.js';
const env=environment({}),item={id:'a'.repeat(32),kind:'video',provider_id:'provider-id-123456789012345'};
const token='header.'+b64(new TextEncoder().encode(JSON.stringify({sub:item.provider_id})))+'.signature';
const base='https://customer-testcustomer.cloudflarestream.com/'+token+'/manifest/video.m3u8';

test('cold playback resolves address and signature concurrently and reuses the private result',async()=>{
 let calls=0,cached=null,tokenStarted=false;const store={videoToken:async()=>cached,saveVideoToken:async(_id,value)=>{cached=value;}};
 const request=async(_url,options)=>{
  calls++;
  if(options.method==='POST'){tokenStarted=true;return Response.json({success:true,result:{token}});}
  await new Promise(resolve=>setTimeout(resolve,30));assert.equal(tokenStarted,true,'Token request starts before metadata completes');
  return Response.json({success:true,result:{requireSignedURLs:true,playback:{hls:'https://customer-testcustomer.cloudflarestream.com/'+item.provider_id+'/manifest/video.m3u8'}}});
 };
 assert.equal((await videoAddress(env,item,now(),store,request)).href,base);assert.equal(calls,2);
 assert.equal((await videoAddress(env,item,now(),store,request)).href,base);assert.equal(calls,2,'Cache bypasses both provider calls');
});

test('video thumbnails proxy signed image bytes through an opaque URL without playback billing',async()=>{
 const {store,database}=repository(),settings=environment(store),video={...item,owner:'42',mime:'video/mp4',duration:10};let tokens=0,fetches=0;store.reserve(media({...video}),limits,now());store.attach(video.id,video.provider_id,'',now());store.publish(video.id,'42',10,now());
 const options={cache:null,requestProvider:async(_url,options)=>{if(options.method==='POST'){tokens++;return Response.json({success:true,result:{token}});}return Response.json({success:true,result:{requireSignedURLs:true,playback:{hls:'https://customer-testcustomer.cloudflarestream.com/'+item.provider_id+'/manifest/video.m3u8'}}});},requestUpstream:async(url,options)=>{assert.equal(options.headers.Range,undefined);fetches++;assert.equal(url.hostname,'customer-testcustomer.cloudflarestream.com');assert.equal(url.pathname,'/'+token+'/thumbnails/thumbnail.jpg');assert.equal(url.searchParams.get('width'),'1280');assert.equal(url.searchParams.get('height'),'1280');assert.equal(url.searchParams.get('time'),'1s');return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'image/jpeg',Location:url.href}});}};
 try{const url='https://ishare.js.gripe/v/'+item.id+'/thumbnail',response=await deliver(new Request(url,{headers:{Range:'bytes=0-1'}}),settings,video,'thumbnail',store,{waitUntil(){}},options);assert.equal(response.headers.get('Content-Type'),'image/jpeg');assert.equal(response.headers.get('Location'),null);assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[1,2,3]);const head=await deliver(new Request(url,{method:'HEAD'}),settings,video,'thumbnail',store,{waitUntil(){}},options);assert.equal(head.headers.get('Content-Type'),'image/jpeg');const reused=await deliver(new Request(url),settings,video,'thumbnail',store,{waitUntil(){}},options);assert.deepEqual([...new Uint8Array(await reused.arrayBuffer())],[1,2,3]);assert.equal(tokens,1);assert.equal(fetches,1);store.prepareRemoval(video.id,'42',false,[video.provider_id],false);store.deleted(video.id);assert.equal(store.videoCover(video.id),null);assert.equal(store.account('42',{},'99',Math.floor(Date.now()/1000)).usage.videoDeliverySeconds,0);
 }finally{database.close();}
});

test('existing video cover tables migrate once, replace old generated frames and retain supplied covers',async()=>{
 const {store,database}=repository('CREATE TABLE video_covers (media_id TEXT PRIMARY KEY,body BLOB NOT NULL,mime TEXT NOT NULL)');
 const video={...item,owner:'42',mime:'video/mp4',duration:10},settings=environment(store),url='https://ishare.js.gripe/v/'+item.id+'/thumbnail';
 try{
  store.reserve(media(video),limits,now());store.attach(video.id,video.provider_id,'',now());store.publish(video.id,'42',10,now());
  database.prepare('INSERT INTO video_covers(media_id,body,mime) VALUES (?,?,?)').run(video.id,new Uint8Array([0]),'image/jpeg');assert.equal(store.videoCover(video.id).source,'frame-0s');
  let calls=0;const options={cache:null,requestProvider:async(_url,options)=>Response.json({success:true,result:options.method==='POST'?{token}:{requireSignedURLs:true,playback:{hls:'https://customer-testcustomer.cloudflarestream.com/'+item.provider_id+'/manifest/video.m3u8'}}}),requestUpstream:async url=>{calls++;assert.equal(url.searchParams.get('time'),'1s');return new Response(new Uint8Array([1]),{headers:{'Content-Type':'image/jpeg'}});}};
  for(let i=0;i<2;i++){const response=await deliver(new Request(url),settings,video,'thumbnail',store,{waitUntil(){}},options);assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[1]);}
  assert.equal(calls,1);assert.equal(store.videoCover(video.id).source,'frame-1s');
  database.prepare('DELETE FROM video_covers WHERE media_id=?').run(video.id);store.saveVideoCover(video.id,new Uint8Array([2]),'image/jpeg','provided');
  store.saveVideoCover(video.id,new Uint8Array([3]),'image/jpeg');
  const response=await deliver(new Request(url),settings,video,'thumbnail',store,{waitUntil(){}},{cache:null,requestProvider(){throw Error('Stored cover must not fetch upstream');}});assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[2]);assert.equal(store.videoCover(video.id).source,'provided');
 }finally{database.close();}
});

test('sub-second video covers use their first frame rather than an out-of-range timestamp',async()=>{
 const {store,database}=repository(),video={...item,owner:'42',duration:1},settings=environment(store);
 try{store.reserve(media(video),limits,now());store.attach(video.id,video.provider_id,'',now());store.publish(video.id,'42',1,now());const response=await deliver(new Request('https://ishare.js.gripe/v/'+item.id+'/thumbnail'),settings,video,'thumbnail',store,{waitUntil(){}},{cache:null,requestProvider:async(_url,options)=>Response.json({success:true,result:options.method==='POST'?{token}:{requireSignedURLs:true,playback:{hls:'https://customer-testcustomer.cloudflarestream.com/'+item.provider_id+'/manifest/video.m3u8'}}}),requestUpstream:async url=>{assert.equal(url.searchParams.get('time'),'0s');return new Response(new Uint8Array([1]),{headers:{'Content-Type':'image/jpeg'}});}});assert.equal(response.status,200);}finally{database.close();}
});

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
  await assert.rejects(deliver(new Request('https://ishare.js.gripe/i/'+item.id+'/original'),env,image,'original',{delivery:()=>{}}, {waitUntil:()=>{}},{cache:null,requestUpstream:async()=>new Response(null,{status:302,headers:{Location:'https://origin.example/secret'}})}),/media_unavailable/);
});
test('image delivery returns bytes without leaking provider headers or redirects',async()=>{
  const image={id:item.id,kind:'image',provider_id:item.provider_id};
  const response=await deliver(new Request('https://ishare.js.gripe/i/'+item.id+'/original'),env,image,'original',{delivery:()=>{}}, {waitUntil:()=>{}},{cache:null,requestUpstream:async(url,options)=>{assert.equal(url.hostname,'api.cloudflare.com');assert.ok(url.pathname.endsWith('/blob'));assert.equal(options.headers.Authorization,'Bearer '+env.MEDIA_API_TOKEN);assert.equal(options.redirect,'manual');assert.equal(url.search,'');return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'image/png',Location:'https://origin.example','Content-Location':'https://origin.example','Link':'<https://origin.example>'}});}});
  assert.equal(response.status,200);for(const name of ['Location','Content-Location','Link'])assert.equal(response.headers.get(name),null);assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[1,2,3]);
});

test('a slow original continues streaming beyond the upstream response-header deadline', {timeout:30000},async t=>{
 const image={id:item.id,kind:'image',provider_id:item.provider_id};let timer,upstreamSignal;
 t.after(()=>clearTimeout(timer));
 const response=await deliver(new Request('https://ishare.js.gripe/i/'+item.id+'/original'),env,image,'original',{delivery(){}},{waitUntil(){}},{cache:null,requestUpstream:async(_url,{signal})=>{
  upstreamSignal=signal;
  return new Response(new ReadableStream({start(controller){
   const abort=()=>{clearTimeout(timer);controller.error(new Error('stream interrupted'));};signal.addEventListener('abort',abort,{once:true});
   controller.enqueue(new Uint8Array([1]));timer=setTimeout(()=>{signal.removeEventListener('abort',abort);controller.enqueue(new Uint8Array([2]));controller.close();},20100);
  },cancel(){clearTimeout(timer);}}),{headers:{'Content-Type':'image/png'}});
 }});
 const reader=response.body.getReader();assert.deepEqual([...(await reader.read()).value],[1]);
 assert.deepEqual([...(await reader.read()).value],[2]);assert.equal((await reader.read()).done,true);assert.equal(upstreamSignal.aborted,false);
});

test('long video segments renew private upstream tokens without changing public resource tickets',async()=>{
  const {store,database}=repository(),settings=environment(store),now=Math.floor(Date.now()/1000),video={...item,owner:'42',duration:7200};
  const expired='header.'+b64(new TextEncoder().encode(JSON.stringify({sub:item.provider_id,exp:now-100})))+'.expired',fresh='header.'+b64(new TextEncoder().encode(JSON.stringify({sub:item.provider_id,exp:now+3600})))+'.fresh';
  let minted=0,deliveries=0;try{const ticket=await sealResource(new URL('https://customer-testcustomer.cloudflarestream.com/'+expired+'/video/segment.ts'),item.id,await store.key(),now+7500,4);
    const options={cache:null,requestProvider:async(url,options)=>{if(options.method==='POST'){minted++;return Response.json({success:true,result:{token:fresh}});}return Response.json({success:true,result:{requireSignedURLs:true,playback:{hls:'https://customer-testcustomer.cloudflarestream.com/'+item.provider_id+'/manifest/video.m3u8'}}});},requestUpstream:async url=>{assert.equal(url.pathname,'/'+fresh+'/video/segment.ts');deliveries++;return new Response('segment',{headers:{'Content-Type':'video/mp2t'}});}};
    for(let i=0;i<2;i++){const response=await deliver(new Request('https://ishare.js.gripe/v/'+item.id+'/'+ticket),settings,video,ticket,store,{waitUntil:()=>{}},options);assert.equal(response.status,200);await response.text();}
    assert.equal(minted,1);assert.equal(deliveries,2);assert.equal(store.account('42',{},'99',now).usage.videoDeliverySeconds,8);
  }finally{database.close();}
});


test('Stream independently signed fMP4 segments keep their video namespace and signatures behind opaque tickets',async()=>{
 const {store,database}=repository(),settings=environment(store),clock=now(),video={...item,owner:'42',duration:30};
 try{const playlist='#EXTM3U\n#EXT-X-MAP:URI="/'+item.provider_id+'/video/init.mp4?p=fixture&s=signature"\n#EXTINF:4,\n/'+item.provider_id+'/video/segment.mp4?p=fixture&s=signature\n#EXT-X-ENDLIST',rewritten=await rewriteManifest(playlist,base,item.id,await store.key(),clock+3600,settings);
 assert.doesNotMatch(rewritten,/provider-id|fixture|signature|cloudflarestream/);const tickets=[...rewritten.matchAll(/\/v\/[a-f0-9]{32}\/([A-Za-z0-9_-]+)/g)].map(match=>match[1]);assert.equal(tickets.length,2);
 for(const ticket of tickets){const response=await deliver(new Request('https://ishare.js.gripe/v/'+item.id+'/'+ticket,{headers:{Range:'bytes=0-'}}),settings,video,ticket,store,{waitUntil(){}},{cache:null,requestProvider(){throw Error('Signed segments must not replace their namespace with a playback JWT');},requestUpstream:async url=>{assert.ok(url.pathname.startsWith('/'+item.provider_id+'/'));assert.equal(url.searchParams.get('p'),'fixture');assert.equal(url.searchParams.get('s'),'signature');return new Response('fragment',{headers:{'Content-Type':'video/iso.segment','Content-Length':'8'}});}});assert.equal(response.status,200);assert.equal(await response.text(),'fragment');}
 await assert.rejects(rewriteManifest('#EXTM3U\n/other-video/video/segment.mp4?p=fixture&s=signature',base,item.id,await store.key(),clock+3600,settings),/invalid_manifest/);
 const response=await deliver(new Request('https://ishare.js.gripe/v/'+item.id+'/master.m3u8',{headers:{Range:'bytes=0-15'}}),settings,video,'master.m3u8',store,{waitUntil(){}},{cache:null,requestProvider:async(_url,options)=>Response.json({success:true,result:options.method==='POST'?{token}:{requireSignedURLs:true,playback:{hls:'https://customer-testcustomer.cloudflarestream.com/'+item.provider_id+'/manifest/video.m3u8'}}}),requestUpstream:async(_url,options)=>{assert.equal(options.headers.Range,undefined);return new Response(playlist,{headers:{'Content-Type':'application/vnd.apple.mpegurl'}});}});assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
 }finally{database.close();}
});
