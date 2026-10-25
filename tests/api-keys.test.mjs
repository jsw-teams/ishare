import test from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../backend/ishare/service.js';
import {repository,environment,login,request,now,media,limits} from './helpers.mjs';
import {digest} from '../backend/ishare/security.js';
const ctx={waitUntil(){}};
function ai(action,key,{resource,body,origin}={}){return new Request('https://ishare.js.gripe/api',{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,'X-Service-Action':action,...(resource?{'X-Service-Resource':resource}:{}),...(body?{'Content-Type':'application/json'}:{}),...(origin?{Origin:origin}:{})},body:body?JSON.stringify(body):undefined});}
async function keyFor(store,env,user,name='AI uploader'){return (await(await handle(request('create-api-key',{...user,body:{name,days:90}}),env,ctx)).json());}

test('API keys are owner-bound hashed credentials, expire and revoke, without relaxing browser CSRF or CORS',async()=>{
 const {store,database}=repository(),env={...environment(store),OWNER_GITHUB_ID:'99'};
 try{const user=await login(store),other=await login(store,{id:'43',login:'other'}),key=await keyFor(store,env,user);
  assert.match(key.key,/^ishare_[\w-]{43}$/);assert.equal(store.one('SELECT hash FROM api_keys WHERE id=?',key.id).hash,await digest(key.key));assert.doesNotMatch(JSON.stringify(store.apiKeys('42')),new RegExp(key.key));
  assert.equal((await handle(request('create-api-key',{...user,csrf:'wrong',body:{name:'Bad'}}),env,ctx)).status,403);
  assert.equal((await handle(ai('history',key.key,{origin:'https://evil.example'}),env,ctx)).status,403);
  assert.equal((await handle(ai('admin-users',key.key),env,ctx)).status,403);assert.equal((await handle(ai('create-api-key',key.key,{body:{name:'Escalation'}}),env,ctx)).status,403);
  assert.equal((await handle(request('revoke-api-key',{...other,resource:key.id,body:{}}),env,ctx)).status,404);
  assert.equal((await handle(ai('history',key.key),env,ctx)).status,200);assert.ok(store.apiKeys('42')[0].lastUsed);
  assert.equal(store.apiKeySession(await digest(key.key),key.expires),null);
  await handle(request('revoke-api-key',{...user,resource:key.id,body:{}}),env,ctx);assert.equal((await handle(ai('history',key.key),env,ctx)).status,401);
  const next=await keyFor(store,env,user);store.erase('42',now());assert.equal((await handle(ai('history',next.key),env,ctx)).status,401);store.cleanup(now()+1);assert.equal(store.apiKeys('42').length,0);
 }finally{database.close();}
});

test('AI completes image and video publication, gets Markdown post/media links, and stays off the homepage',async()=>{
 const {store,database}=repository(),env={...environment(store),OWNER_GITHUB_ID:'99'},resources=new Map();
 const upstream=async(address,options={})=>{
  const url=new URL(address);
  if(url.pathname.endsWith('/direct_upload')){const app=JSON.parse(options.body.get('metadata')).ishare,pid='image-'+resources.size;resources.set(pid,{kind:'image',app});return Response.json({success:true,result:{id:pid,uploadURL:'https://upload.imagedelivery.net/'+pid}});}
  if(options.method==='POST'&&url.searchParams.get('direct_user')==='true'){const metadata=Object.fromEntries(options.headers['Upload-Metadata'].split(',').map(part=>{const [k,v]=part.split(' ');return [k,v?atob(v):''];})),pid='video-'+resources.size;resources.set(pid,{kind:'video',app:metadata.name});return new Response(null,{status:201,headers:{Location:'https://upload.cloudflarestream.com/'+pid,'stream-media-id':pid}});}
  const pid=url.pathname.split('/').at(-1),item=resources.get(pid);assert.ok(item);
  return Response.json({success:true,result:item.kind==='image'?{id:pid,uploaded:'2026-10-14',draft:false,requireSignedURLs:true,meta:{ishare:item.app}}:{uid:pid,readyToStream:true,requireSignedURLs:true,duration:10,status:{state:'ready'}}});
 };
 try{const user=await login(store),key=await keyFor(store,env,user),ids=[];
  for(const kind of ['image','video']){const response=await handle(ai('create-upload',key.key,{body:{kind,title:kind==='image'?'picture.png':'movie.mp4',bytes:1024,mime:kind==='image'?'image/png':'video/mp4',duration:kind==='image'?0:10}}),env,ctx,{requestProvider:upstream});assert.equal(response.status,201);const grant=await response.json();ids.push(grant.id);assert.match(grant.uploadUrl,/^https:\/\/upload\./);assert.equal((await handle(ai('publish',key.key,{resource:grant.id,body:{}}),env,ctx,{requestProvider:upstream})).status,200);}
  const post='d'.repeat(32),body={caption:'Uploaded by AI',mediaIds:ids};
  assert.equal((await handle(ai('create-post',key.key,{resource:post,body:{...body,listed:true}}),env,ctx)).status,403);
  const response=await handle(ai('create-post',key.key,{resource:post,body}),env,ctx);assert.equal(response.status,201);assert.match(response.headers.get('Content-Type'),/^text\/markdown/);assert.equal(response.headers.get('Cache-Control'),'no-store');
  const markdown=await response.text();assert.ok(markdown.includes('[Post](https://ishare.js.gripe/s/'+post+')'));assert.match(markdown,new RegExp('/i/'+ids[0]+'/public'));assert.match(markdown,new RegExp('/v/'+ids[1]+'/master.m3u8'));assert.doesNotMatch(markdown,/provider|uploadUrl|embedCode|Bearer|csrf/);
  assert.equal(store.post(post).listed,false);assert.equal(store.feed('','99',now()).items.length,0);assert.equal(store.usage('42',now()).images,1);assert.equal(store.usage('42',now()).videoSeconds,10);
  assert.equal(await(await handle(ai('create-post',key.key,{resource:post,body}),env,ctx)).text(),markdown);
  assert.equal((await handle(ai('discard-upload',key.key,{resource:ids[0],body:{}}),env,ctx)).status,409);
  store.setAccount('42',{blocked:true,urgent:true,note:'Restricted'},'99','99',now(),store.quotaSettings(now()).defaults);assert.equal((await handle(ai('create-upload',key.key,{body:{kind:'image',title:'blocked.png',bytes:1024,mime:'image/png',duration:0}}),env,ctx)).status,403);
 }finally{resources.clear();database.close();}
});

test('original authors can revise attachments and visibility through cookies or keys, with stable links and conflict protection',async()=>{
 const {store,database}=repository(),env={...environment(store),OWNER_GITHUB_ID:'99',PUBLISHER_IDS:'*'},jobs=[],context={waitUntil(job){jobs.push(job);}};
 try{const user=await login(store),other=await login(store,{id:'43',login:'other'}),key=await keyFor(store,env,user),clock=now(),first='a'.repeat(32),second='b'.repeat(32),postId='d'.repeat(32);
  for(const id of [first,second]){store.reserve(media({id}),{...limits,images:100},clock);store.attach(id,'private-'+id,'',clock);store.publish(id,'42',0,clock,'99');}
  const post=store.createPost({id:postId,owner:'42',author:{id:'42',login:'publisher'},caption:'Before',sourceUrl:'',sourceName:'',mediaIds:[first],listed:false},'99',clock);
  const body={caption:'After',mediaIds:[second],listed:true,revision:0};
  assert.equal((await handle(request('update-post',{...other,resource:postId,body}),env,ctx)).status,404);assert.equal((await handle(request('update-post',{...user,csrf:'wrong',resource:postId,body}),env,ctx)).status,403);
  const response=await handle(request('update-post',{...user,resource:postId,body}),env,context,{requestProvider:async()=>Response.json({success:true,result:null})});assert.equal(response.status,200);const saved=await response.json();assert.equal(saved.shareUrl,'https://ishare.js.gripe/s/'+post.id);assert.equal(saved.revision,1);assert.equal(saved.created,post.created);assert.equal(saved.caption,'After');assert.deepEqual(saved.media.map(m=>m.id),[second]);assert.equal(store.feed('','99',clock).items[0].caption,'After');assert.throws(()=>store.publicGet(first,'99',clock),/not_found/);
  assert.equal((await handle(request('update-post',{...user,resource:postId,body}),env,ctx)).status,409);
  assert.equal((await handle(ai('set-visibility',key.key,{resource:postId,body:{listed:false}}),env,ctx)).status,200);assert.equal(store.feed('','99',clock).items.length,0);
  const updated=await handle(ai('update-post',key.key,{resource:postId,body:{...body,caption:'AI revision',listed:false,revision:2}}),env,ctx);assert.equal(updated.status,200);assert.match(updated.headers.get('Content-Type'),/^text\/markdown/);
  await Promise.all(jobs);assert.equal(store.usage('42',clock).images,1);
  assert.equal((await handle(ai('delete-post',key.key,{resource:postId,body:{}}),env,context,{requestProvider:async()=>Response.json({success:true,result:null})})).status,202);assert.throws(()=>store.publicShare(postId,'99',clock),/not_found/);await Promise.all(jobs);
 }finally{await Promise.all(jobs);database.close();}
});
