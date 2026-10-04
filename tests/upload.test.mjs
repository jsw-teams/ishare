import test from 'node:test';
import assert from 'node:assert/strict';
import {provider} from '../backend/cloudflare/provider.js';
import {uploadFile} from '../static/ishare/upload.js';
import {uploadAddress} from '../static/ishare/upload-address.js';
import {repository,environment,media,limits,login,request,now} from './helpers.mjs';
import {handle} from '../backend/cloudflare/service.js';

test('Stream REST allocation and browser validation accept the current cloudflarestream upload origin',async()=>{
 const {store,database}=repository(),env=environment(store),clock=now();
 try{const owner=await login(store),destination='https://upload.cloudflarestream.com/tus/capability?token=fixture',response=await handle(request('create-upload',{...owner,resource:'e'.repeat(32),body:{kind:'video',title:'clip.mp4',bytes:1024,mime:'video/mp4',duration:30}}),env,{waitUntil(){}},{requestProvider:async(url,options)=>{assert.match(url,new RegExp('/accounts/'+env.STREAM_ACCOUNT_ID+'/stream\\?direct_user=true$'));assert.equal(options.headers.Authorization,'Bearer '+env.MEDIA_API_TOKEN);return new Response(null,{status:201,headers:{Location:destination,'stream-media-id':'provider-video-id'}});}});
 assert.equal(response.status,201);const grant=await response.json();assert.equal(grant.uploadUrl,destination);assert.equal(grant.protocol,'tus');assert.equal(uploadAddress(grant.uploadUrl,'video').href,destination);assert.equal(store.get(grant.id).state,'uploading');
 for(const host of ['upload.videodelivery.net','customer-test.cloudflarestream.com','upload.cloudflarestream.com.evil.example','evil.example'])assert.throws(()=>uploadAddress('https://'+host+'/capability','video'),/invalid_upload_url/);
 for(const url of ['http://upload.cloudflarestream.com/a','https://user:password@upload.cloudflarestream.com/a','https://upload.cloudflarestream.com:8080/a','https://upload.cloudflarestream.com/a#fragment'])assert.throws(()=>uploadAddress(url,'video'),/invalid_upload_url/);
 assert.throws(()=>uploadAddress(destination,'image'),/invalid_upload_url/);assert.equal(store.usage('42',clock).videoSeconds,30);
 }finally{database.close();}
});

test('Cloudflare Images meta confirms publication while drafts, foreign metadata and unsigned images remain rejected',async()=>{
 const {store,database}=repository(),env=environment(store),ctx={waitUntil(){}};
 try{
  const owner=await login(store),item=media();store.reserve(item,limits,now());store.attach(item.id,'provider-id-123456789012345','https://upload.imagedelivery.net/capability',now());
  const detail={id:'provider-id-123456789012345',uploaded:'2026-10-04T12:00:00Z',requireSignedURLs:true,meta:{ishare:item.id},creator:'ishare:42'};
  const answer=data=>async()=>Response.json({success:true,result:data});
  const upstream=provider(env,answer(detail));assert.equal(await upstream.ready(store.get(item.id)),0);
  await assert.rejects(provider(env,answer({...detail,draft:true})).ready(store.get(item.id)),/processing/);
  await assert.rejects(provider(env,answer({...detail,meta:{ishare:'b'.repeat(32)}})).ready(store.get(item.id)),/invalid_upstream/);
  await assert.rejects(provider(env,answer({...detail,meta:undefined,metadata:detail.meta})).ready(store.get(item.id)),/invalid_upstream/);
  await assert.rejects(provider(env,answer({...detail,requireSignedURLs:false})).ready(store.get(item.id)),/unsafe_upstream/);
  const published=await handle(request('publish',{...owner,resource:item.id,body:{}}),env,ctx,{requestProvider:answer(detail)});assert.equal(published.status,200);assert.equal((await published.json()).state,'published');assert.equal(store.get(item.id).state,'published');
  const post=await handle(request('create-post',{...owner,body:{caption:'Story',mediaIds:[item.id],listed:false}}),env,ctx);assert.equal(post.status,201);assert.equal((await post.json()).media[0].id,item.id);
 }finally{database.close();}
});

test('private allocation errors retain sanitized provider status and release rejected reservations',async()=>{
 const {store,database}=repository(),env=environment(store);
 try{const owner=await login(store),response=await handle(request('create-upload',{...owner,resource:'d'.repeat(32),body:{kind:'video',title:'clip.mp4',caption:'',bytes:100,mime:'video/mp4',duration:10}}),env,{waitUntil(){}},{requestProvider:async()=>new Response('secret upstream details',{status:403})});assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'upstream_unavailable',stage:'upload_allocation',reason:'http_status',upstreamStatus:403});assert.equal(store.get('d'.repeat(32)).state,'failed');assert.equal(store.usage('42',now()).videoSeconds,0);
 }finally{database.close();}
});

function transport(){
 const xhr=new EventTarget();xhr.upload=new EventTarget();xhr.open=(_method,url)=>{xhr.responseURL=url;};xhr.send=body=>{xhr.body=body;};xhr.abort=()=>xhr.dispatchEvent(new Event('abort'));
 xhr.progress=(loaded,total)=>{const event=new Event('progress');Object.assign(event,{loaded,total,lengthComputable:true});xhr.upload.dispatchEvent(event);};
 xhr.complete=(status=200,response={success:true})=>{xhr.status=status;xhr.response=response;xhr.dispatchEvent(new Event('load'));};
 return xhr;
}
const image=new File([new Uint8Array(100)],'picture.png',{type:'image/png'}),grant={protocol:'post',uploadUrl:'https://upload.imagedelivery.net/capability'};
test('fresh TUS uploads start with PATCH, respect chunk offsets and never probe Upload-Length',async()=>{
 const file=new File([new Uint8Array(10*1024*1024+512)],'clip.mp4',{type:'video/mp4'}),methods=[],progress=[],videoGrant={protocol:'tus',uploadUrl:'https://upload.cloudflarestream.com/capability'};
 await uploadFile(file,videoGrant,value=>progress.push(value),{request:async(_url,options)=>{methods.push(options.method);assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');const offset=Number(options.headers['Upload-Offset']),expected=methods.length===1?0:10*1024*1024;assert.equal(offset,expected);return new Response(null,{status:204,headers:{'Upload-Offset':String(offset+options.body.size)}});}});
 assert.deepEqual(methods,['PATCH','PATCH']);assert.equal(progress[0],0);assert.equal(progress.at(-1),1);assert.ok(progress[1]>0&&progress[1]<1);
});

test('TUS recovers partially accepted bytes using HEAD without relying on an exposed Upload-Length',async()=>{
 const file=new File([new Uint8Array(1024)],'clip.mp4',{type:'video/mp4'}),methods=[],grant={protocol:'tus',uploadUrl:'https://upload.cloudflarestream.com/capability'};
 await uploadFile(file,grant,()=>{},{request:async(_url,options)=>{methods.push(options.method);if(methods.length===1)throw new TypeError('Network interrupted');if(options.method==='HEAD')return new Response(null,{headers:{'Upload-Offset':'512'}});assert.equal(options.headers['Upload-Offset'],'512');assert.equal(options.body.size,512);return new Response(null,{status:204,headers:{'Upload-Offset':'1024'}});}});
 assert.deepEqual(methods,['PATCH','HEAD','PATCH']);
});

test('TUS rejects absent or corrupt offsets and permanent HTTP failures with diagnostic status',async()=>{
 const file=new File([new Uint8Array(1024)],'clip.mp4',{type:'video/mp4'}),grant={protocol:'tus',uploadUrl:'https://upload.cloudflarestream.com/capability'};
 for(const offset of [null,'','NaN','-1','1025','1']){let requests=0;await assert.rejects(uploadFile(file,grant,()=>{},{request:async()=>{requests++;return new Response(null,{status:204,headers:offset===null?{}:{'Upload-Offset':offset}});}}),{message:'invalid_upload_offset',status:204});assert.equal(requests,1);}
 let requests=0;await assert.rejects(uploadFile(file,grant,()=>{},{request:async()=>{requests++;return new Response(null,{status:403});}}),{message:'upload_failed',status:403});assert.equal(requests,1);
 const abort=new AbortController(),task=uploadFile(file,grant,()=>{},{signal:abort.signal,request:async()=>{setTimeout(()=>abort.abort(),25);throw new TypeError('Network interrupted');}});await assert.rejects(task,{name:'AbortError'});
});
test('image transport reports real byte progress, verifies provider success and supports immediate cancellation',async()=>{
 const xhr=transport(),progress=[],abort=new AbortController(),task=uploadFile(image,grant,value=>progress.push(value),{createRequest:()=>xhr,signal:abort.signal});
 assert.equal(xhr.withCredentials,false);assert.equal(xhr.body.get('file').name,'picture.png');xhr.progress(25,100);xhr.progress(75,100);assert.deepEqual(progress,[0,.25,.75]);xhr.complete();await task;assert.equal(progress.at(-1),1);
 for(const [status,result]of [[400,{success:false}],[200,{success:false}],[200,null]]){const failure=transport(),promise=uploadFile(image,grant,()=>{},{createRequest:()=>failure});failure.complete(status,result);await assert.rejects(promise,/upload_failed/);}
 const pending=transport(),signal=new AbortController(),cancelled=uploadFile(image,grant,()=>{},{createRequest:()=>pending,signal:signal.signal});signal.abort();await assert.rejects(cancelled,{name:'AbortError'});
 const stopped=new AbortController();stopped.abort();await assert.rejects(uploadFile(image,grant,()=>{},{signal:stopped.signal,createRequest:()=>{throw Error('must not start');}}),{name:'AbortError'});
 await assert.rejects(uploadFile(image,{...grant,uploadUrl:'https://evil.example/upload'}),/invalid_upload_url/);
});


test('expected Stream processing is accepted and keeps the reservation until publication',async()=>{
 const {store,database}=repository(),env=environment(store);try{const owner=await login(store),item=media({kind:'video',duration:30,mime:'video/mp4'});store.reserve(item,limits,now());store.attach(item.id,'fixture-video','',now());
 const response=await handle(request('publish',{...owner,resource:item.id,body:{}}),env,{}, {requestProvider:async()=>Response.json({success:true,result:{requireSignedURLs:true,readyToStream:false,status:{state:'inprogress'}}})});assert.equal(response.status,202);assert.deepEqual(await response.json(),{state:'processing',retryAfter:3});assert.equal(store.get(item.id).state,'uploading');assert.equal(store.usage('42',now()).videoSeconds,30);
 }finally{database.close();}
});
