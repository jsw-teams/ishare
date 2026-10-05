import test from 'node:test';
import assert from 'node:assert/strict';
import {deliver} from '../backend/cloudflare/delivery.js';
import {environment} from './helpers.mjs';

test('display variants are private, signed, responsive and cached by format; originals require the explicit save route',async()=>{
 const env=environment({}),item={id:'a'.repeat(32),owner:'42',kind:'image',provider_id:'private-image',title:'photo.png',mime:'image/png'},signing='existing-private-signing-key',calls=[],upstreams=[],entries=new Map(),pending=[];
 const context={waitUntil(promise){pending.push(promise);}},store={delivery(){}},cache={async match(key){return entries.get(key.url)?.clone();},async put(key,response){entries.set(key.url,response);}};
 const requestProvider=async(address,options)=>{
  const path=new URL(address).pathname;calls.push({path,method:options.method||'GET'});
  if(path.endsWith('/images/v1/private-image'))return Response.json({success:true,result:{requireSignedURLs:true,variants:['https://imagedelivery.net/accountHash/private-image/public']}});
  if(path.endsWith('/variants')&&!options.method)return Response.json({success:true,result:{variants:{'isharePreview':{neverRequireSignedURLs:true,options:{}}}}});
  if(['PATCH','POST'].includes(options.method)){const body=JSON.parse(options.body);assert.equal(body.neverRequireSignedURLs,false);assert.equal(body.options.fit,'scale-down');assert.equal(body.options.metadata,'none');assert.equal(body.options.height,body.options.width);return Response.json({success:true,result:{variant:{}}});}
  if(path.endsWith('/keys'))return Response.json({success:true,result:{keys:[{name:'existing',value:signing}]}});
  throw Error('Unexpected provider call');
 },requestUpstream=async(url,options)=>{
  upstreams.push(url.pathname);
  if(url.pathname.endsWith('/blob')){assert.equal(options.headers.Authorization,'Bearer '+env.MEDIA_API_TOKEN);return new Response('original',{headers:{'Content-Type':'image/png'}});}
  assert.equal(url.hostname,'imagedelivery.net');assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers.Accept,'image/webp,image/*');
  const signature=url.searchParams.get('sig'),unsigned=new URL(url);unsigned.searchParams.delete('sig');const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(signing),{name:'HMAC',hash:'SHA-256'},false,['sign']);const bytes=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(unsigned.pathname+'?'+unsigned.searchParams));assert.equal(signature,Buffer.from(bytes).toString('hex'));
  return new Response('optimized',{headers:{'Content-Type':'image/webp',Location:url.href}});
 },options={cache,requestProvider,requestUpstream};
 for(const variant of ['thumbnail','medium','public']){
  const request=new Request('https://ishare.js.gripe/i/'+item.id+'/'+variant,{headers:{Accept:'image/webp,image/*'}}),response=await deliver(request,env,item,variant,store,context,options);assert.equal(response.headers.get('Vary'),'Accept');assert.equal(response.headers.get('Location'),null);assert.equal(await response.text(),'optimized');await Promise.all(pending);
  assert.equal(await(await deliver(request,env,item,variant,store,context,options)).text(),'optimized');
 }
 assert.deepEqual(upstreams,['/accountHash/private-image/isharePreview','/accountHash/private-image/ishareMedium','/accountHash/private-image/ishareDisplay']);assert.equal(calls.filter(call=>call.path.endsWith('/keys')).length,1);assert.equal(calls.filter(call=>call.method==='PATCH').length,1);assert.equal(calls.filter(call=>call.method==='POST').length,2);
 const original=await deliver(new Request('https://ishare.js.gripe/i/'+item.id+'/original'),env,item,'original',store,context,options);assert.equal(await original.text(),'original');assert.match(original.headers.get('Content-Disposition'),/^attachment;/);assert.equal(original.headers.get('Cache-Control'),'no-store');
});

test('optimized image failures never fall back to original downloads',async()=>{
 let originalCalls=0;await assert.rejects(deliver(new Request('https://ishare.js.gripe/i/'+('a'.repeat(32))+'/public'),environment({}),{id:'a'.repeat(32),kind:'image',provider_id:'private-image'},'public',{delivery(){}},{waitUntil(){}},{cache:null,requestProvider:async()=>Response.json({success:true,result:{requireSignedURLs:false,variants:[]}}),requestUpstream:async()=>{originalCalls++;return new Response('original');}}),/unsafe_upstream/);assert.equal(originalCalls,0);
});
