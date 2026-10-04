import test from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../backend/cloudflare/service.js';
import {authorize} from '../backend/cloudflare/auth.js';
import {repository,environment,media,limits,login,request,now} from './helpers.mjs';
const ctx={waitUntil:()=>{}};
test('routed origins work without domain variables, ignore forwarded hosts and keep private CORS closed',async()=>{
  const {store,database}=repository(),env=environment(store);
  try{
    store.reserve(media(),limits,now());store.attach('a'.repeat(32),'provider-id-123456789012345','https://upload.imagedelivery.net/capability',now());store.publish('a'.repeat(32),'42',0,now());
    const url='https://photos.example/api',headers={'X-Service-Action':'get','X-Service-Resource':'a'.repeat(32),Origin:'https://any-website.example','X-Forwarded-Host':'evil.example'};
    const response=await handle(new Request(url,{headers}),env,ctx);
    assert.equal(response.status,200);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'*');
    assert.equal((await response.json()).shareUrl,'https://photos.example/s/'+'a'.repeat(32));
    const preflight=await handle(new Request(url,{method:'OPTIONS',headers:{Origin:'https://any-website.example','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'X-Service-Action, X-Service-Resource'}}),env,ctx);assert.equal(preflight.status,204);
    const denied=await handle(new Request(url,{method:'OPTIONS',headers:{Origin:'https://any-website.example','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'X-CSRF-Token'}}),env,ctx);assert.equal(denied.status,403);assert.equal(denied.headers.get('Access-Control-Allow-Origin'),null);
    const privateRead=await handle(new Request(url,{headers:{Origin:'https://any-website.example','X-Service-Action':'session'}}),env,ctx);assert.equal(privateRead.status,403);assert.equal(privateRead.headers.get('Access-Control-Allow-Origin'),null);
    const oauth=await authorize(new Request('https://photos.example/auth',{headers:{'X-Forwarded-Host':'evil.example'}}),{...env,GITHUB_CLIENT_ID:'fixture',GITHUB_CLIENT_SECRET:'fixture'},store,now());
    assert.equal(new URL(oauth.headers.get('Location')).searchParams.get('redirect_uri'),'https://photos.example/auth/callback');
  }finally{database.close();}
});
test('authentication, CSRF, publisher permissions and ownership protect privileged requests',async()=>{
  const {store,database}=repository(),env=environment(store);let calls=0;const network=async()=>{calls++;throw Error('must not call');};
  try{
    const body={kind:'image',title:'Test',bytes:1024,mime:'image/png'};
    assert.equal((await handle(request('create-upload',{body}),env,ctx,{requestProvider:network})).status,401);
    const owner=await login(store);assert.equal((await handle(request('create-upload',{...owner,body,csrf:undefined}),env,ctx,{requestProvider:network})).status,403);
    assert.equal((await handle(request('create-upload',{...owner,body,origin:'https://evil.example'}),env,ctx,{requestProvider:network})).status,403);
    env.PUBLISHER_IDS='other';assert.equal((await handle(request('create-upload',{...owner,body}),env,ctx,{requestProvider:network})).status,403);
    store.reserve(media(),limits,now());store.attach('a'.repeat(32),'upstream-identifier-123456','https://upload.imagedelivery.net/secret',now());
    const other=await login(store,{id:'43',login:'other',name:'Other'});
    assert.equal((await handle(request('delete',{...other,resource:'a'.repeat(32),body:{}}),env,ctx,{requestProvider:network})).status,404);
    assert.equal(calls,0);
  }finally{database.close();}
});
test('direct upload uses the resource account token, private uploads and opaque application IDs',async()=>{
  const {store,database}=repository(),env=environment(store),owner=await login(store),calls=[];
  const network=async(url,options)=>{
    calls.push({url,options});assert.ok(url.includes('/accounts/'+env.IMAGES_ACCOUNT_ID+'/'));assert.equal(options.headers.Authorization,'Bearer '+env.MEDIA_API_TOKEN);
    assert.equal(options.body.get('requireSignedURLs'),'true');assert.equal(options.body.get('creator'),'ishare:42');assert.equal(options.body.has('id'),false);
    return Response.json({success:true,result:{id:'provider-id-123456789012345',uploadURL:'https://upload.imagedelivery.net/capability'}});
  };
  try{
    const response=await handle(request('create-upload',{...owner,body:{kind:'image',title:'Test',bytes:1024,mime:'image/png'}}),env,ctx,{requestProvider:network});assert.equal(response.status,201);
    const grant=await response.json();assert.match(grant.id,/^[a-f0-9]{32}$/);assert.equal(grant.providerId,undefined);assert.equal(store.get(grant.id).state,'uploading');assert.equal(calls.length,1);
    assert.equal(store.list('42').items.length,1);
  }finally{database.close();}
});
test('unknown upstream outcomes retain reservations and are never silently retried',async()=>{
  const {store,database}=repository(),env=environment(store),owner=await login(store);
  try{
    const response=await handle(request('create-upload',{...owner,body:{kind:'video',title:'Test',bytes:1024,mime:'video/mp4',duration:30}}),env,ctx,{requestProvider:async()=>{throw Error('timeout after allocation');}});
    assert.equal(response.status,503);assert.equal(store.list('42').items[0].state,'uncertain');
  }finally{database.close();}
});
test('public metadata and standard oEmbed preserve attribution without provider URLs or fetch-based discovery',async()=>{
  const {store,database}=repository(),env=environment(store);try{
    store.reserve(media(),limits,now());store.attach('a'.repeat(32),'provider-id-123456789012345','https://upload.imagedelivery.net/capability',now());store.publish('a'.repeat(32),'42',0,now());
    const response=await handle(request('get',{resource:'a'.repeat(32),origin:'https://website.example'}),env,ctx);assert.equal(response.status,200);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'*');
    const body=await response.text();assert.doesNotMatch(body,/provider-id|imagedelivery|API_TOKEN|upload_url/);assert.match(body,/publisher/);
    const embed=await handle(new Request('https://ishare.js.gripe/oembed?url='+encodeURIComponent('https://ishare.js.gripe/s/'+'a'.repeat(32))+'&maxwidth=400'),env,ctx);const data=await embed.json();assert.equal(data.version,'1.0');assert.equal(data.width,400);assert.match(data.html,/ishare.js.gripe\/embed\//);assert.doesNotMatch(data.html,/<script>|imagedelivery/);
    assert.equal((await handle(new Request('https://ishare.js.gripe/oembed?url=https://169.254.169.254/latest'),env,ctx)).status,404);
    assert.equal((await handle(new Request('https://ishare.js.gripe/api?action=get'),env,ctx)).status,400);
    assert.equal((await handle(new Request('https://ishare.js.gripe/.env'),env,ctx)).status,404);
  }finally{database.close();}
});
