import test from 'node:test';
import assert from 'node:assert/strict';
import {provider} from '../backend/cloudflare/provider.js';
import {uploadFile} from '../static/ishare/upload.js';
import {repository,environment,media,limits,login,request,now} from './helpers.mjs';
import {handle} from '../backend/cloudflare/service.js';

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
  const post=await handle(request('create-post',{...owner,body:{title:'My photo',caption:'Story',mediaIds:[item.id],listed:false}}),env,ctx);assert.equal(post.status,201);assert.equal((await post.json()).media[0].id,item.id);
 }finally{database.close();}
});

function transport(){
 const xhr=new EventTarget();xhr.upload=new EventTarget();xhr.open=(_method,url)=>{xhr.responseURL=url;};xhr.send=body=>{xhr.body=body;};xhr.abort=()=>xhr.dispatchEvent(new Event('abort'));
 xhr.progress=(loaded,total)=>{const event=new Event('progress');Object.assign(event,{loaded,total,lengthComputable:true});xhr.upload.dispatchEvent(event);};
 xhr.complete=(status=200,response={success:true})=>{xhr.status=status;xhr.response=response;xhr.dispatchEvent(new Event('load'));};
 return xhr;
}
const image=new File([new Uint8Array(100)],'picture.png',{type:'image/png'}),grant={protocol:'post',uploadUrl:'https://upload.imagedelivery.net/capability'};
test('image transport reports real byte progress, verifies provider success and supports immediate cancellation',async()=>{
 const xhr=transport(),progress=[],abort=new AbortController(),task=uploadFile(image,grant,value=>progress.push(value),{createRequest:()=>xhr,signal:abort.signal});
 assert.equal(xhr.withCredentials,false);assert.equal(xhr.body.get('file').name,'picture.png');xhr.progress(25,100);xhr.progress(75,100);assert.deepEqual(progress,[0,.25,.75]);xhr.complete();await task;assert.equal(progress.at(-1),1);
 for(const [status,result]of [[400,{success:false}],[200,{success:false}],[200,null]]){const failure=transport(),promise=uploadFile(image,grant,()=>{},{createRequest:()=>failure});failure.complete(status,result);await assert.rejects(promise,/upload_failed/);}
 const pending=transport(),signal=new AbortController(),cancelled=uploadFile(image,grant,()=>{},{createRequest:()=>pending,signal:signal.signal});signal.abort();await assert.rejects(cancelled,{name:'AbortError'});
 const stopped=new AbortController();stopped.abort();await assert.rejects(uploadFile(image,grant,()=>{},{signal:stopped.signal,createRequest:()=>{throw Error('must not start');}}),{name:'AbortError'});
 await assert.rejects(uploadFile(image,{...grant,uploadUrl:'https://evil.example/upload'}),/invalid_upload_url/);
});
