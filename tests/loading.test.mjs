import test from 'node:test';
import assert from 'node:assert/strict';
import {digest} from '../backend/cloudflare/security.js';
import {handle} from '../backend/cloudflare/service.js';
import {repository,environment,login,request,media,limits,now} from './helpers.mjs';

test('page snapshots use one DO call, preserve ownership and admin gates, and never cache private data',async()=>{
 const {store,database}=repository(),env=environment(store),clock=now(),calls=[];
 env.OWNER_GITHUB_ID='99';env.ADMIN_IDS='43';
 env.SHARE_STORE.get=()=>new Proxy(store,{get(target,key){return (...args)=>{calls.push(key);return target[key](...args);};}});
 try{
  const publisher=await login(store),moderator=await login(store,{id:'43',login:'moderator'}),owner=await login(store,{id:'99',login:'owner'});
  const item=media();store.reserve(item,limits,clock);store.attach(item.id,'provider-id-123456789012345','https://upload.imagedelivery.net/test',clock);store.publish(item.id,'42',0,clock,'99');store.requestRight('42','other','Only mine',clock);store.requestRight('43','other','Private other user',clock);
  async function read(identity,page){calls.length=0;const response=await handle(request('session',{...identity,resource:page}),env,{waitUntil(){}});assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);assert.deepEqual(calls,['snapshot']);return response.json();}
  assert.equal((await read({},'mine')).initial,null);
  const mine=await read(publisher,'mine');assert.equal(mine.initial.history.items[0].id,item.id);assert.equal(mine.initial.history.items[0].provider_id,undefined);assert.equal(mine.initial.history.items[0].upload_url,undefined);
  const profile=await read(publisher,'profile');assert.deepEqual(profile.initial.rights.items.map(item=>item.message),['Only mine']);
  assert.equal((await read(publisher,'admin')).initial,null);assert.equal((await read(publisher,'admin')).isAdmin,false);
  const admin=await read(moderator,'admin');assert.ok(admin.initial.users);assert.equal(admin.initial.settings,undefined);
  const operator=await read(owner,'admin');assert.ok(operator.initial.settings);assert.equal(operator.initial.users,undefined);
  assert.equal((await handle(request('session',{...publisher,resource:'other'}),env,{waitUntil(){}})).status,400);
  store.logout(await digest(publisher.cookie.split('=')[1]));assert.equal((await read(publisher,'mine')).user,null);
 }finally{database.close();}
});

test('browser client coalesces in-flight private reads without retaining sessions or merging writes and abortable requests',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch;let calls=0,release;
 globalThis.window={addEventListener(){}};
 try{
  const {serviceClient}=await import('../static/ishare/account.js');
  const wait=new Promise(resolve=>release=resolve);
  globalThis.fetch=async(_url,options)=>{calls++;if(options.headers['X-Service-Action']==='session'){await wait;return Response.json({csrf:'test',initial:null});}return Response.json({ok:true});};
  const client=serviceClient('mine'),a=client.read(),b=client.read();assert.equal(calls,1);release();await Promise.all([a,b]);
  await client.read();assert.equal(calls,2);
  await Promise.all([client.request('admin-user',{resource:'42'}),client.request('admin-user',{resource:'43'})]);assert.equal(calls,4);
  await Promise.all([client.request('logout',{body:{}}),client.request('logout',{body:{}})]);assert.equal(calls,6);
  const signal=new AbortController().signal;await Promise.all([client.request('history',{signal}),client.request('history',{signal})]);assert.equal(calls,8);
 }finally{globalThis.window=oldWindow;globalThis.fetch=oldFetch;}
});
