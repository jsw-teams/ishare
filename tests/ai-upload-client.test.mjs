import test from 'node:test';
import assert from 'node:assert/strict';
import {uploadWithKey} from '../tools/upload/ai-upload.mjs';
import {repository,environment,login,request} from './helpers.mjs';
import {handle} from '../backend/ishare/service.js';
import {readFile} from 'node:fs/promises';
test('Node AI client transfers image/video bytes, confirms after all transfers and emits only Markdown links',async()=>{
 const {store,database}=repository(),env={...environment(store),OWNER_GITHUB_ID:'99'},resources=new Map(),sequence=[];
 const provider=async(address,options={})=>{
  const url=new URL(address);
  if(url.pathname.endsWith('/direct_upload')){const app=JSON.parse(options.body.get('metadata')).ishare,id='image-'+resources.size;resources.set(id,{kind:'image',app,uploaded:false});return Response.json({success:true,result:{id,uploadURL:'https://upload.imagedelivery.net/'+id}});}
  if(options.method==='POST'&&url.searchParams.get('direct_user')==='true'){const fields=Object.fromEntries(options.headers['Upload-Metadata'].split(',').map(part=>{const [name,value]=part.split(' ');return [name,value?atob(value):''];})),id='video-'+resources.size;resources.set(id,{kind:'video',app:fields.name,uploaded:false});return new Response(null,{status:201,headers:{Location:'https://upload.cloudflarestream.com/'+id,'stream-media-id':id}});}
  const id=url.pathname.split('/').at(-1),item=resources.get(id);assert.ok(item);assert.equal(item.uploaded,true);
  return Response.json({success:true,result:item.kind==='image'?{id,uploaded:'2026-10-14',draft:false,requireSignedURLs:true,meta:{ishare:item.app}}:{uid:id,readyToStream:true,requireSignedURLs:true,duration:1,status:{state:'ready'}}});
 };
 try{const user=await login(store),key=await(await handle(request('create-api-key',{...user,body:{name:'CLI fixture'}}),env,{waitUntil(){}})).json();
  const bytes=await readFile('tests/fixtures/preview.webm');
  const network=async(address,options={})=>{const url=new URL(address);
   if(url.origin==='https://ishare.js.gripe'){sequence.push(options.headers['X-Service-Action']);return handle(new Request(url,options),env,{waitUntil(){}},{requestProvider:provider});}
   assert.equal(options.headers?.Authorization,undefined,'Never forward the personal API key upstream');const item=resources.get(url.pathname.slice(1));assert.ok(item);sequence.push('transfer-'+item.kind);
   if(item.kind==='image'){assert.ok(options.body.get('file').size>0);item.uploaded=true;return Response.json({success:true});}
   assert.equal(options.method,'PATCH');assert.equal(options.headers['Upload-Offset'],'0');assert.deepEqual(options.body,bytes);item.uploaded=true;return new Response(null,{status:204,headers:{'Upload-Offset':String(bytes.length)}});
  };
  const output=await uploadWithKey({files:['content/assets/brand/bear-icon.3754101e8d6380da.png','tests/fixtures/preview.webm'],key:key.key,caption:'CLI upload',durationSeconds:1,request:network});
  assert.deepEqual(sequence,['create-upload','transfer-image','create-upload','transfer-video','publish','publish','create-post']);assert.match(output,/\[Post\]\(https:\/\/ishare.js.gripe\/s\/[a-f0-9]{32}\)/);assert.match(output,/\[Media 1\].*\/v\//);assert.match(output,/\[Media 2\].*\/i\//);assert.doesNotMatch(output,/Bearer|uploadUrl|embedCode/);assert.equal(store.history('42').items.length,1);assert.equal(store.feed('','99',Math.floor(Date.now()/1000)).items.length,0);
 }finally{resources.clear();database.close();}
});
