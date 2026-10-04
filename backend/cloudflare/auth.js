import { random, digest, cookie, setCookie, requestOrigin, json, fail } from './security.js';
const sessionName='__Host-ishare-session', oauthName='__Host-ishare-oauth';
const credentials=env=>({id:String(env.GITHUB_CLIENT_ID||'').trim(),secret:String(env.GITHUB_CLIENT_SECRET||'').trim()});
export const authReady = env => !!(credentials(env).id&&credentials(env).secret);
export async function readSession(request,store,now) {
  const token=cookie(request,sessionName);if(!/^[\w-]{43}$/.test(token))return null;
  return store.session(await digest(token),now);
}
export function requireSite(request) {
  const site=requestOrigin(request), source=request.headers.get('Origin');
  if(source&&source!==site)fail('forbidden_origin',403);
  if(request.headers.get('Sec-Fetch-Site')==='cross-site')fail('forbidden_origin',403);
}
export function requireCsrf(request,session) {
  requireSite(request);
  if(!session)fail('login_required',401);
  if(request.headers.get('Origin')!==requestOrigin(request)||request.headers.get('X-CSRF-Token')!==session.csrf)fail('invalid_csrf',403);
}
async function github(url,options={},request=fetch,stage='exchange') {
  const unavailable=stage==='identity'?'github_identity_unavailable':'github_exchange_unavailable';
  let response;try{response=await request(url,{...options,headers:{'User-Agent':'ishare',...options.headers},redirect:'manual',signal:AbortSignal.timeout(15000)});}catch{fail(stage==='identity'?'github_identity_unavailable':'github_exchange_network',503);}
  const result=await response.json().catch(()=>null);
  // Return only known error codes, never upstream descriptions, codes or tokens.
  const errors={incorrect_client_credentials:'github_credentials_invalid',redirect_uri_mismatch:'github_callback_mismatch',bad_verification_code:'github_code_expired',incorrect_code_verifier:'github_pkce_failed',unverified_user_email:'github_email_unverified'};
  if(Object.hasOwn(errors,result?.error||''))fail(errors[result.error],result.error==='bad_verification_code'?400:503);
  if(stage==='exchange'&&response.status>=300&&response.status<400)fail('github_exchange_redirected',503);
  if(stage==='exchange'&&!response.ok)fail(response.status===404?'github_exchange_not_found':response.status===403?'github_exchange_denied':response.status===429?'github_rate_limited':'github_exchange_rejected',503);
  if(!response.ok||!result||result.error)fail(unavailable,503);return result;
}
export async function authorize(request,env,store,now) {
  if(!authReady(env))fail('login_unavailable',503);requireSite(request);
  const state=random(),verifier=random();
  await store.beginAuth(await digest(state),verifier,now);
  const address=new URL('https://github.com/login/oauth/authorize');
  for(const [key,value]of Object.entries({client_id:credentials(env).id,redirect_uri:requestOrigin(request)+'/auth/callback',state,code_challenge:await digest(verifier),code_challenge_method:'S256'}))address.searchParams.set(key,value);
  return new Response(null,{status:303,headers:{Location:address.href,'Cache-Control':'no-store','Set-Cookie':setCookie(oauthName,state,600),'Referrer-Policy':'no-referrer'}});
}
export async function callback(request,env,store,now,requestGithub=fetch) {
  const url=new URL(request.url),state=url.searchParams.get('state'),expected=cookie(request,oauthName);
  if(!state||!/^[\w-]{43}$/.test(state)||state!==expected)fail('invalid_oauth_state',403);
  const verifier=await store.consumeAuth(await digest(state),now);
  if(!verifier)fail('expired_oauth_state',403);
  const code=url.searchParams.get('code');if(!code||code.length>1024)fail('login_cancelled',400);
  const client=credentials(env);
  const data=await github('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:client.id,client_secret:client.secret,redirect_uri:requestOrigin(request)+'/auth/callback',code,code_verifier:verifier}).toString()},requestGithub);
  if(typeof data.access_token!=='string'||data.token_type?.toLowerCase()!=='bearer')fail('github_exchange_unavailable',503);
  const user=await github('https://api.github.com/user',{headers:{Authorization:'Bearer '+data.access_token,Accept:'application/vnd.github+json','User-Agent':'ishare','X-GitHub-Api-Version':'2022-11-28'}},requestGithub,'identity');
  if(!Number.isSafeInteger(user.id)||user.id<1||typeof user.login!=='string'||!/^[a-z\d-]{1,39}$/i.test(user.login))fail('invalid_identity',503);
  const identity={id:String(user.id),login:user.login,name:typeof user.name==='string'?user.name.slice(0,100):user.login};
  const token=random(),hash=await digest(token);await store.makeSession(hash,identity,random(),now);
  const {account}=await store.snapshot(hash,'',env.OWNER_GITHUB_ID,[],now),allowed=identity.id===env.OWNER_GITHUB_ID||!env.PUBLISHER_IDS||env.PUBLISHER_IDS==='*'||env.PUBLISHER_IDS.split(',').map(value=>value.trim()).includes(identity.id);
  const destination=account.erasing?'/profile/':!allowed||account.blocked||account.sharingBlocked?'/appeal/':'/mine/';
  const response=new Response(null,{status:303,headers:{Location:requestOrigin(request)+destination, 'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  response.headers.append('Set-Cookie',setCookie(oauthName,'',0));response.headers.append('Set-Cookie',setCookie(sessionName,token,86400));return response;
}
export async function logout(request,store) {const token=cookie(request,sessionName);if(token)await store.logout(await digest(token));return json({ok:true},200,{'Set-Cookie':setCookie(sessionName,'',0)});}
