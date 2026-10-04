import test from 'node:test';
import assert from 'node:assert/strict';
import {repository,media,limits,environment,login,request,now} from './helpers.mjs';
import {handle} from '../backend/cloudflare/service.js';
import {publicRecord,renderPage} from '../backend/cloudflare/views.js';
import {readFile} from 'node:fs/promises';
const ctx={waitUntil(){}};
function upload(store,key,owner='42',kind='image'){store.reserve(media({id:key,owner,kind,duration:kind==='video'?30:0}),{...limits,images:100},now());store.attach(key,'private-provider-'+key,'https://upload.imagedelivery.net/temporary',now());store.publish(key,owner,kind==='video'?30:0,now());}

test('multi-attachment posts require ownership, are idempotent and enter the feed only by opt-in',async()=>{
 const {store,database}=repository(),env=environment(store);env.OWNER_GITHUB_ID='99';
 try{const publisher=await login(store),post='d'.repeat(32),first='a'.repeat(32),second='b'.repeat(32),other='c'.repeat(32);upload(store,first);upload(store,second);upload(store,other,'43');
 const body={title:'A shared day',caption:'First the story\nThen the pictures',mediaIds:[first,second],listed:false};
 assert.equal((await handle(request('create-post',{...publisher,resource:post,body:{...body,mediaIds:[first,other]}}),env,ctx)).status,409);assert.equal(store.post(post),null);
 assert.equal((await handle(request('create-post',{...publisher,resource:post,csrf:'bad',body}),env,ctx)).status,403);
 for(let i=0;i<2;i++){const response=await handle(request('create-post',{...publisher,resource:post,body}),env,ctx);assert.equal(response.status,201);const record=await response.json();assert.equal(record.media.length,2);assert.match(record.markdown,new RegExp('/i/'+first+'/public'));assert.match(record.markdown,new RegExp('/i/'+second+'/public'));assert.match(record.embedCode,new RegExp('/embed/'+post));assert.doesNotMatch(JSON.stringify(record),/provider|upload\.imagedelivery/);}
 assert.equal(store.history('42').items.length,1);assert.equal(store.feed('',env.OWNER_GITHUB_ID,now()).items.length,0);assert.equal(store.publicShare(post,'99',now()).caption,body.caption);
 const otherUser=await login(store,{id:'43',login:'other'});assert.equal((await handle(request('set-visibility',{...otherUser,resource:post,body:{listed:true}}),env,ctx)).status,404);
 await handle(request('set-visibility',{...publisher,resource:post,body:{listed:true}}),env,ctx);const feed=await handle(request('feed',{origin:'https://external.example'}),env,ctx);assert.equal(feed.status,200);assert.equal(feed.headers.get('Access-Control-Allow-Origin'),'*');assert.equal((await feed.json()).items[0].id,post);
 await handle(request('set-visibility',{...publisher,resource:post,body:{listed:false}}),env,ctx);assert.equal(store.feed('','99',now()).items.length,0);
 await handle(request('set-visibility',{...publisher,resource:post,body:{listed:true}}),env,ctx);store.setAccount('42',{sharingBlocked:true,urgent:true,note:'Abuse review'},'99','99',now(),store.quotaSettings(now()).defaults);assert.equal(store.feed('','99',now()).items.length,0);
 assert.equal((await handle(request('export',publisher),env,ctx)).status,200);
 assert.equal((await handle(request('delete-post',{...publisher,resource:post,body:{}}),env,ctx)).status,202);assert.throws(()=>store.publicShare(post,'99',now()),/not_found/);assert.equal(store.get(first).state,'deleting');assert.equal(store.get(second).state,'deleting');assert.equal(store.get(other).state,'published');const pendingExport=await(await handle(request('export',publisher),env,ctx)).json();assert.equal(pendingExport.items[0].kind,'post');assert.equal(pendingExport.items[0].state,'deleting');assert.equal(pendingExport.items[0].media.length,2);assert.equal(store.cleanup(now()).length,2);
 store.deleted(first);store.deleted(second);store.cleanup(now()+1);assert.equal(store.post(post),null);
 }finally{database.close();}
});

test('full-post oEmbed contains escaped text and all images/videos with private upstreams hidden',async()=>{
 const {store,database}=repository();try{upload(store,'a'.repeat(32));upload(store,'b'.repeat(32),'42','video');const post=store.createPost({id:'d'.repeat(32),owner:'42',author:media().author,title:'<script>title</script>',caption:'Story <img onerror=bad()>',sourceUrl:'',sourceName:'',mediaIds:['a'.repeat(32),'b'.repeat(32)],listed:true},'99',now());
 const env={ASSETS:{fetch:async request=>new Response(await readFile('dist'+new URL(request.url).pathname))}},site='https://ishare.js.gripe';const response=await renderPage(post,env,site,true),body=await response.text();assert.match(body,/Story &lt;img/);assert.match(body,new RegExp('/i/'+post.media[0].id+'/public'));assert.match(body,new RegExp('/v/'+post.media[1].id+'/master.m3u8'));assert.equal((body.match(/class="post-attachment"/g)||[]).length,2);assert.doesNotMatch(body,/private-provider|cloudflarestream|<header|publish-form|onerror=bad\(\)>/);assert.match(body,/player\.[a-f0-9]+\.js/);assert.match(publicRecord(post,site).markdown,/\[.*\]\(https:\/\/ishare.js.gripe\/s\//);
 }finally{database.close();}
});

test('owner quota settings are stored online, preserve existing user defaults and scheduled reductions',async()=>{
 const {store,database}=repository(),env=environment(store);env.OWNER_GITHUB_ID='99';try{const user=await login(store),owner=await login(store,{id:'99',login:'operator'}),clock=now(),original=store.quotaSettings(clock);
 store.setAccount('42',{limits:{images:500},note:'Planned reduction'},'99','99',clock,original.defaults);
 const change={defaults:{...original.defaults,images:2000},shared:{...original.shared,images:5000},note:'Shared capacity adjustment',urgent:false};
 assert.equal((await handle(request('admin-set-settings',{...user,body:change}),env,ctx)).status,403);assert.equal((await handle(request('admin-set-settings',{...owner,csrf:'bad',body:change}),env,ctx)).status,403);
 assert.equal((await handle(request('admin-set-settings',{...owner,body:change}),env,ctx)).status,200);const updated=store.quotaSettings(clock);assert.equal(updated.defaults.images,2000);assert.equal(updated.shared.images,10000);assert.equal(updated.pending.shared.images,5000);assert.equal(store.account('42',updated.defaults,'99',clock).limits.images,1000);assert.equal(store.account('42',updated.defaults,'99',clock).notice.limits.images,500);
 await login(store,{id:'43',login:'new'});assert.equal(store.account('43',updated.defaults,'99',clock).limits.images,2000);assert.equal(store.quotaSettings(clock+604801).shared.images,5000);assert.equal(store.account('42',updated.defaults,'99',clock+604801).limits.images,500);assert.equal(store.account('99',updated.defaults,'99',clock).limits.images,null);
 const malformed={...change,defaults:{...change.defaults,videoBytes:0}};assert.equal((await handle(request('admin-set-settings',{...owner,body:malformed}),env,ctx)).status,400);
 }finally{database.close();}
});

test('files above the former 1 GiB cap can receive video grants using one shared account Secret',async()=>{
 const {store,database}=repository(),env=environment(store);
 try{const user=await login(store);let allocations=0;const network=async(url,options)=>{allocations++;assert.match(url,new RegExp('/accounts/'+env.STREAM_ACCOUNT_ID+'/stream\\?direct_user=true$'));assert.equal(options.headers['Upload-Length'],'5000000000');assert.match(options.headers['Upload-Metadata'],/(?:^|,)requiresignedurls(?:,|$)/);assert.doesNotMatch(options.headers['Upload-Metadata'],/requiresignedurls /);return new Response(null,{status:201,headers:{Location:'https://upload.videodelivery.net/temporary','stream-media-id':'private-provider-123456789012345'}});};
 const body={kind:'video',title:'Large video',bytes:5000000000,mime:'video/mp4',duration:30};assert.equal((await handle(request('create-upload',{...user,body}),env,ctx,{requestProvider:network})).status,201);assert.equal((await handle(request('create-upload',{...user,body:{...body,bytes:30000000000}}),env,ctx,{requestProvider:network})).status,413);assert.equal(allocations,1);
 }finally{database.close();}
});
