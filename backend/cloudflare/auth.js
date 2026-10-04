import { random, digest, cookie, setCookie, requestOrigin, json, fail } from './security.js';
const sessionName='__Host-ishare-session', oauthName='__Host-ishare-oauth';
export const authReady = env => !!(env.GITHUB_CLIENT_ID&&env.GITHUB_CLIENT_SECRET);
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
async function github(url,options={},request=fetch) {
  let response;try{response=await request(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});}catch{fail('login_unavailable',503);}
  if(!response.ok)fail('login_unavailable',503);
  const result=await response.json().catch(()=>null);if(!result)fail('login_unavailable',503);return result;
}
export async function authorize(request,env,store,now) {
  if(!authReady(env))fail('login_unavailable',503);requireSite(request);
  const state=random(),verifier=random();
  await store.beginAuth(await digest(state),verifier,now);
  const address=new URL('https://github.com/login/oauth/authorize');
  for(const [key,value]of Object.entries({client_id:env.GITHUB_CLIENT_ID,redirect_uri:requestOrigin(request)+'/auth/callback',state,code_challenge:await digest(verifier),code_challenge_method:'S256'}))address.searchParams.set(key,value);
  return new Response(null,{status:303,headers:{Location:address.href,'Cache-Control':'no-store','Set-Cookie':setCookie(oauthName,state,600),'Referrer-Policy':'no-referrer'}});
}
export async function callback(request,env,store,now,requestGithub=fetch) {
  const url=new URL(request.url),state=url.searchParams.get('state'),expected=cookie(request,oauthName);
  if(!state||!/^[\w-]{43}$/.test(state)||state!==expected)fail('invalid_oauth_state',403);
  const verifier=await store.consumeAuth(await digest(state),now);
  if(!verifier)fail('expired_oauth_state',403);
  const code=url.searchParams.get('code');if(!code||code.length>1024)fail('login_cancelled',400);
  const data=await github('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,redirect_uri:requestOrigin(request)+'/auth/callback',code,code_verifier:verifier})},requestGithub);
  if(typeof data.access_token!=='string'||data.token_type?.toLowerCase()!=='bearer')fail('login_unavailable',503);
  const user=await github('https://api.github.com/user',{headers:{Authorization:'Bearer '+data.access_token,Accept:'application/vnd.github+json','User-Agent':'ishare','X-GitHub-Api-Version':'2022-11-28'}},requestGithub);
  if(!Number.isSafeInteger(user.id)||user.id<1||typeof user.login!=='string'||!/^[a-z\d-]{1,39}$/i.test(user.login))fail('invalid_identity',503);
  const identity={id:String(user.id),login:user.login,name:typeof user.name==='string'?user.name.slice(0,100):user.login};
  const token=random();await store.makeSession(await digest(token),identity,random(),now);
  const response=new Response(null,{status:303,headers:{Location:requestOrigin(request)+'/mine/', 'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  response.headers.append('Set-Cookie',setCookie(oauthName,'',0));response.headers.append('Set-Cookie',setCookie(sessionName,token,86400));return response;
}
export async function logout(request,store) {const token=cookie(request,sessionName);if(token)await store.logout(await digest(token));return json({ok:true},200,{'Set-Cookie':setCookie(sessionName,'',0)});}
