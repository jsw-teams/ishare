import test from 'node:test';
import assert from 'node:assert/strict';
import {authorize,callback,readSession} from '../backend/cloudflare/auth.js';
import {handle} from '../backend/cloudflare/service.js';
import {repository,environment,now} from './helpers.mjs';

async function start(store,env,accept='application/json'){
 const response=await authorize(new Request('https://ishare.js.gripe/auth'),env,store,now());
 const state=new URL(response.headers.get('Location')).searchParams.get('state');
 return new Request('https://ishare.js.gripe/auth/callback?code=fixture-code&state='+state,{headers:{Cookie:response.headers.get('Set-Cookie').split(';')[0],Accept:accept}});
}
test('OAuth exchanges PKCE once, trims credentials and stores a numeric GitHub identity',async()=>{
 const {store,database}=repository(),env={...environment(store),GITHUB_CLIENT_ID:' fixture-id\n',GITHUB_CLIENT_SECRET:' fixture-secret\n'};let calls=0;
 try{
 const request=await start(store,env),response=await callback(request,env,store,now(),async(url,options)=>{
  calls++;assert.equal(options.headers['User-Agent'],'ishare');assert.equal(options.redirect,'manual');
  if(url.endsWith('/access_token')){const body=Object.fromEntries(new URLSearchParams(options.body));assert.equal(options.headers['Content-Type'],'application/x-www-form-urlencoded');assert.equal(body.client_id,'fixture-id');assert.equal(body.client_secret,'fixture-secret');assert.match(body.code_verifier,/^[\w-]{43}$/);assert.equal(body.redirect_uri,'https://ishare.js.gripe/auth/callback');return Response.json({access_token:'fixture-token',token_type:'bearer'});}
  assert.equal(options.headers.Authorization,'Bearer fixture-token');return Response.json({id:42,login:'publisher',name:'Publisher'});
 });
 assert.equal(response.status,303);assert.equal(response.headers.get('Location'),'https://ishare.js.gripe/mine/');
 const cookie=response.headers.get('Set-Cookie').match(/__Host-ishare-session=([\w-]+)/)[0];assert.equal((await readSession(new Request('https://ishare.js.gripe/api',{headers:{Cookie:cookie}}),store,now())).user.id,'42');
 await assert.rejects(callback(request,env,store,now(),()=>{throw Error('must not replay');}),/expired_oauth_state/);assert.equal(calls,2);
 }finally{database.close();}
});
test('OAuth reports known upstream errors without returning tokens or descriptions',async()=>{
 const {store,database}=repository(),env={...environment(store),GITHUB_CLIENT_ID:'fixture',GITHUB_CLIENT_SECRET:'fixture'};
 try{for(const [error,expected]of [['incorrect_client_credentials','github_credentials_invalid'],['redirect_uri_mismatch','github_callback_mismatch'],['bad_verification_code','github_code_expired']]){
  const response=await handle(await start(store,env),env,{},{requestGithub:async()=>Response.json({error,error_description:'private-fixture-value',access_token:'private-fixture-token'})});assert.deepEqual(await response.json(),{error:expected});
 }
 for(const [status,expected]of [[404,'github_exchange_not_found'],[403,'github_exchange_denied'],[429,'github_rate_limited']]){const response=await handle(await start(store,env),env,{},{requestGithub:async()=>new Response('private-details',{status})});assert.deepEqual(await response.json(),{error:expected});}
 const unavailable=await handle(await start(store,env),env,{},{requestGithub:async()=>{throw Error('private-network-details');}});assert.deepEqual(await unavailable.json(),{error:'github_exchange_network'});
 const request=await start(store,env);let calls=0;const response=await handle(request,env,{},{requestGithub:async()=>++calls===1?Response.json({access_token:'private',token_type:'bearer'}):Response.json({message:'private-details'},{status:401})});assert.deepEqual(await response.json(),{error:'github_identity_unavailable'});
 }finally{database.close();}
});
test('browser callback failures return to the publisher with a safe error and clear the state cookie',async()=>{
 const {store,database}=repository(),env={...environment(store),GITHUB_CLIENT_ID:'fixture',GITHUB_CLIENT_SECRET:'fixture'};
 try{const response=await handle(await start(store,env,'text/html'),env,{},{requestGithub:async()=>Response.json({error:'incorrect_client_credentials',error_description:'private-details'})});assert.equal(response.status,303);assert.equal(response.headers.get('Location'),'https://ishare.js.gripe/mine/#login-error=github_credentials_invalid');assert.match(response.headers.get('Set-Cookie'),/Max-Age=0/);assert.equal(response.headers.get('Cache-Control'),'no-store');}finally{database.close();}
});
