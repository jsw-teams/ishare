import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {handle} from '../backend/cloudflare/service.js';
import {repository,environment,login,request,now} from './helpers.mjs';
const ctx={waitUntil(){}};

test('profile editing preserves GitHub identity, enforces CSRF and ownership, survives sign-in and exports personal data',async()=>{
 const {store,database}=repository(),env=environment(store);
 try{
  const publisher=await login(store);await login(store,{id:'43',login:'other',name:'Other'});
  assert.equal((await handle(request('set-profile',{body:{displayName:'Anonymous',bio:''}}),env,ctx)).status,401);
  assert.equal((await handle(request('set-profile',{...publisher,csrf:'wrong',body:{displayName:'Bad',bio:''}}),env,ctx)).status,403);
  assert.equal((await handle(request('set-profile',{...publisher,body:{id:'43',displayName:'Bad',bio:''}}),env,ctx)).status,400);
  assert.equal((await handle(request('set-profile',{...publisher,body:{displayName:' ',bio:''}}),env,ctx)).status,400);
  assert.equal((await handle(request('set-profile',{...publisher,body:{displayName:'Bear',bio:'a'.repeat(501)}}),env,ctx)).status,400);
  const update={displayName:'黑熊 <script>bad()</script>',bio:'山里的照片\n<img src=x onerror=bad()>'};
  assert.equal((await handle(request('set-profile',{...publisher,body:update}),env,ctx)).status,200);
  const fresh=await login(store,{id:'42',login:'publisher',name:'Original GitHub Name'});
  const session=await (await handle(request('session',fresh),env,ctx)).json();assert.equal(session.user.id,'42');assert.equal(session.user.login,'publisher');assert.equal(session.user.name,update.displayName);assert.equal(session.profile.bio,update.bio);assert.equal(store.profile('43').displayName,'Other');
  const exported=await (await handle(request('export',publisher),env,ctx)).json();assert.equal(exported.profile.bio,update.bio);
  const profile=await (await handle(request('profile',{resource:'42',origin:'https://other.example'}),env,ctx)).json();assert.equal(profile.url,'https://ishare.js.gripe/u/42');assert.equal(profile.login,'publisher');assert.equal(profile.displayName,update.displayName);assert.equal(profile.csrf,undefined);
  env.ASSETS={fetch:async req=>new Response(await readFile('dist'+new URL(req.url).pathname))};
  const response=await handle(new Request('https://ishare.js.gripe/u/42',{headers:{'Accept-Language':'zh-TW'}}),env,ctx),html=await response.text();assert.equal(response.status,200);assert.match(response.headers.get('Vary'),/Accept-Language/);assert.match(html,/<html lang="zh-TW"/);assert.match(html,/&lt;script&gt;bad/);assert.match(html,/&lt;img src=x/);assert.match(html,/rel="canonical" href="https:\/\/ishare.js.gripe\/u\/42"/);assert.doesNotMatch(html,/PROFILE_[A-Z]+_TOKEN|<script>bad/);
  assert.equal((await handle(new Request('https://ishare.js.gripe/u/404'),env,ctx)).status,404);
  await handle(request('erase-account',{...publisher,body:{}}),env,ctx);assert.equal((await handle(request('profile',{resource:'42'}),env,ctx)).status,404);assert.equal((await handle(request('set-profile',{...publisher,body:{displayName:'Again',bio:''}}),env,ctx)).status,404);
  const pending=await (await handle(request('export',publisher),env,ctx)).json();assert.equal(pending.profile.bio,update.bio);store.cleanup(now()+1);assert.equal(store.one('SELECT * FROM profiles WHERE id=?','42'),null);assert.equal(store.one('SELECT * FROM users WHERE id=?','42'),null);
 }finally{database.close();}
});

test('public author history includes unlisted published posts with owner-bound pagination and excludes removed or restricted posts',async()=>{
 const {store,database}=repository(),env=environment(store),clock=now();env.OWNER_GITHUB_ID='99';
 try{
  await login(store);await login(store,{id:'43',login:'other'});
  const post=(n,owner,listed)=>store.createPost({id:n.toString(16).padStart(32,'0'),owner,author:{id:owner,login:owner==='42'?'publisher':'other'},title:'Post '+n,caption:'Public story',mediaIds:[],listed,sourceUrl:'',sourceName:''},'99',clock+n);
  for(let i=1;i<=23;i++)post(i,'42',i===1);post(24,'43',true);post(25,'43',false);store.deletePost('00000000000000000000000000000017','42');
  const homepage=await (await handle(request('feed'),env,ctx)).json();assert.equal(homepage.items.length,2);
  const page1=await (await handle(request('profile-feed',{resource:JSON.stringify({owner:'42'})}),env,ctx)).json();assert.equal(page1.items.length,20);assert.ok(page1.next);assert.ok(page1.items.every(item=>item.author.id==='42'&&item.author.url==='https://ishare.js.gripe/u/42'));assert.ok(page1.items.some(item=>!item.listed));
  const page2=await (await handle(request('profile-feed',{resource:JSON.stringify({owner:'42',cursor:page1.next})}),env,ctx)).json();assert.equal(page2.items.length,2);assert.equal(page2.next,null);assert.equal(new Set([...page1.items,...page2.items].map(item=>item.id)).size,22);
  assert.equal((await handle(request('profile-feed',{resource:JSON.stringify({owner:'42',cursor:'00000000000000000000000000000018'})}),env,ctx)).status,400);
  let avatarCalls=0;const upstream=async address=>{avatarCalls++;assert.equal(address,'https://avatars.githubusercontent.com/u/42?s=96');return new Response('png',{headers:{'Content-Type':'image/png'}});};
  assert.equal((await handle(request('profile-avatar',{resource:'42'}),env,ctx,{requestUpstream:upstream})).status,200);assert.equal(avatarCalls,1);
  store.setAccount('42',{sharingBlocked:true,urgent:true,note:'Abuse review'},'99','99',clock,store.quotaSettings(clock).defaults);
  assert.equal((await (await handle(request('profile-feed',{resource:JSON.stringify({owner:'42'})}),env,ctx)).json()).items.length,0);
  store.erase('42',clock);assert.equal((await handle(request('profile-avatar',{resource:'42'}),env,ctx,{requestUpstream:upstream})).status,404);assert.equal(avatarCalls,1);assert.equal((await handle(request('profile-feed',{resource:JSON.stringify({owner:'42'})}),env,ctx)).status,404);
 }finally{database.close();}
});
