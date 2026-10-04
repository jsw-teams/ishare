import test from 'node:test';
import assert from 'node:assert/strict';
import {repository,environment,media,limits,login,request,now} from './helpers.mjs';
import {provider} from '../backend/cloudflare/provider.js';
import {handle} from '../backend/cloudflare/service.js';
import {removeMedia,finishRemoval} from '../backend/cloudflare/removal.js';

test('invalid upload destinations remove known allocations immediately and scrub failed records',async()=>{
 const {store,database}=repository(),env=environment(store),session=await login(store),id='a'.repeat(32),calls=[];
 try{const response=await handle(request('create-upload',{...session,resource:id,body:{kind:'image',title:'Failed image',bytes:100,mime:'image/png'}}),env,{}, {requestProvider:async(url,options)=>{calls.push([url,options.method]);return Response.json({success:true,result:options.method==='DELETE'?{}:{id:'short-id',uploadURL:'https://evil.example/upload'}});}});
 assert.equal(response.status,502);assert.deepEqual(await response.json(),{error:'invalid_upstream',stage:'upload_destination',reason:'host_other'});assert.equal(calls.length,2);assert.match(calls[1][0],/images\/v1\/short-id$/);assert.equal(calls[1][1],'DELETE');assert.equal(store.get(id).state,'deleted');assert.equal(store.get(id).title,'');assert.equal(store.history('42').items.length,0);assert.equal(store.usage('42',now()).images,0);assert.equal(store.nextCleanup(now()),store.one('SELECT expires+1 AS deadline FROM sessions').deadline);
 }finally{database.close();}
});

test('unknown Stream allocations are found by exact creator and app ID, preserving unrelated media and quota until deletion succeeds',async()=>{
 const {store,database}=repository(),env=environment(store),clock=now(),item=media({kind:'video',duration:30,mime:'video/mp4',title:'滨海城市_随手记录_新版.mp4'}),deleted=[];let failed=true;
 try{store.reserve(item,limits,clock-180);store.uncertain(item.id);
 const network=async(url,options)=>{if(options.method==='DELETE'){const uid=url.split('/').at(-1);if(uid==='match-two'&&failed)throw Error('temporary outage');deleted.push(uid);return Response.json({success:true,result:{}});}assert.equal(new URL(url).searchParams.get('creator'),'ishare:42');return Response.json({success:true,result:[{uid:'match-one',creator:'ishare:42',meta:{name:item.id}},{uid:'match-two',creator:'ishare:42',meta:{name:item.id}},{uid:'unrelated',creator:'ishare:42',meta:{name:'b'.repeat(32)}},{uid:'other-owner',creator:'ishare:43',meta:{name:item.id}}]});};
 const upstream=provider(env,network);await assert.rejects(removeMedia(store.get(item.id),store,upstream,'42',false,clock,true),/upstream_unavailable/);assert.equal(store.get(item.id).state,'deleting');assert.deepEqual(store.removalPlan(item.id).ids,['match-one','match-two']);assert.equal(store.usage('42',clock).videoSeconds,30);failed=false;await finishRemoval(store.get(item.id),store,upstream);assert.equal(store.get(item.id).state,'deleted');assert.equal(store.get(item.id).title,'');assert.equal(store.usage('42',clock).videoSeconds,0);assert.deepEqual(deleted,['match-one','match-one','match-two']);assert.equal(store.removalPlan(item.id),null);
 }finally{database.close();}
});

test('absent unknown Images allocations release quotas only after a complete lookup and settlement delay',async()=>{
 const {store,database}=repository(),env=environment(store),clock=now(),item=media();
 try{store.reserve(item,limits,clock);store.uncertain(item.id);const upstream=provider(env,async url=>{const query=new URL(url).searchParams;assert.equal(query.get('meta.ishare[eq]'),item.id);return Response.json({success:true,result:{images:[]}});});await assert.rejects(removeMedia(store.get(item.id),store,upstream,'42',false,clock,true),/cleanup_pending/);assert.equal(store.usage('42',clock).images,1);await removeMedia(store.get(item.id),store,upstream,'42',false,clock+121,true);assert.equal(store.usage('42',clock).images,0);assert.equal(store.history('42').items.length,0);
 }finally{database.close();}
});

test('cancelling a post never removes reused media; late publication cannot recreate the cancelled post',async()=>{
 const {store,database}=repository(),clock=now(),post={id:'c'.repeat(32),owner:'42',author:media().author,title:'Story',caption:'Story',sourceUrl:'',sourceName:'',mediaIds:['a'.repeat(32)],listed:false};
 try{store.reserve(media(),limits,clock);store.attach('a'.repeat(32),'provider','https://upload.imagedelivery.net/x',clock);store.publish('a'.repeat(32),'42',0,clock);store.createPost(post,'99',clock);await assert.rejects(removeMedia(store.get('a'.repeat(32)),store,{remove(){throw Error('must not remove');}},'42',false,clock,true),/media_in_use/);assert.throws(()=>store.discardPost(post.id,'43'),/not_found/);store.discardPost(post.id,'42');assert.equal(store.post(post.id),null);assert.equal(store.get('a'.repeat(32)).state,'published');assert.throws(()=>store.createPost(post,'99',clock),/post_cancelled/);
 }finally{database.close();}
});

test('configuration diagnostics require the operator and never reveal resource credentials',async()=>{
 const {store,database}=repository(),env=environment(store);env.OWNER_GITHUB_ID='99';
 try{const user=await login(store),owner=await login(store,{id:'99',login:'owner'});assert.equal((await handle(request('admin-diagnostics',user),env,{})).status,403);const response=await handle(request('admin-diagnostics',owner),env,{}, {requestProvider:async()=>Response.json({success:true,result:[]})});assert.equal(response.status,200);const value=await response.text();assert.match(value,/"readable":true/);assert.doesNotMatch(value,/image-secret-token|bbbbbbbbbbbbbbbb|provider_id/);
 }finally{database.close();}
});
