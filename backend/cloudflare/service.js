import { ServiceError, fail, requestOrigin, text, number, id, digest, cookie, jsonBody, json, headers } from './security.js';
import { authReady, readSession, requireSite, requireCsrf, authorize, callback, logout } from './auth.js';
import { provider, resourceConfiguration } from './provider.js';
import { publicRecord, oembed, shareId, renderPage, renderProfile } from './views.js';
import { deliver } from './delivery.js';
import {removeMedia} from './removal.js';
import { changes, accountId, exceeds, settingsChange } from './quotas.js';
import { rpcStore } from './rpc.js';
const imageTypes=['image/jpeg','image/png','image/gif','image/webp','image/avif'];
const videoTypes=['video/mp4','video/webm','video/quicktime','video/x-matroska'];
const methodFor={'admin-diagnostics':'GET','discard-upload':'POST','discard-post':'POST','profile-feed':'GET','profile-avatar':'GET','profile':'GET','set-profile':'POST',avatar:'GET',feed:'GET',history:'GET','create-post':'POST','delete-post':'POST','set-visibility':'POST','admin-settings':'GET','admin-set-settings':'POST',session:'GET',get:'GET',oembed:'GET','create-upload':'POST',publish:'POST',delete:'POST',logout:'POST','admin-users':'GET','admin-user':'GET','admin-set-user':'POST','admin-list':'GET','admin-audit':'GET','admin-rights':'GET','admin-resolve-right':'POST',export:'GET',rights:'GET','request-right':'POST','erase-account':'POST'};
const privateActions=new Set(Object.keys(methodFor).filter(key=>!['get','oembed','feed','profile','profile-feed','profile-avatar'].includes(key)));
const accountActions=new Set(['request-right','export','create-post','create-upload','publish']);
const settingsActions=new Set([...accountActions,'admin-settings','admin-set-settings','admin-users','admin-user','admin-set-user']);
const ready=(env,kind)=>{try{resourceConfiguration(env,kind);return true;}catch{return false;}};
const allowedPublisher=(env,user)=>user?.id===env.OWNER_GITHUB_ID||!env.PUBLISHER_IDS||env.PUBLISHER_IDS==='*'||env.PUBLISHER_IDS.split(',').map(s=>s.trim()).includes(user?.id);
const admin=(env,user)=>!!user&&(user.id===env.OWNER_GITHUB_ID||env.ADMIN_IDS?.split(',').map(s=>s.trim()).includes(user.id));
function resource(request){const value=request.headers.get('X-Service-Resource')||'';try{return decodeURIComponent(value);}catch{fail('invalid_resource');}}
const width=value=>value===null?640:number(value,640,1920);
const height=value=>value===null?480:number(value,480,1440);

export async function handle(request,env,context,{requestProvider=fetch,requestGithub=fetch,requestUpstream=fetch}={}) {
  const url=new URL(request.url),site=requestOrigin(request),now=Math.floor(Date.now()/1000);
  const store=rpcStore(env);
  // Public metadata is shareable; private actions remain same-origin and never receive CORS.
  const cors={'Access-Control-Allow-Origin':'*'};
  try {
    if(request.method==='OPTIONS'&&url.pathname==='/api') {
      const requested=(request.headers.get('Access-Control-Request-Headers')||'').split(',').map(value=>value.trim().toLowerCase()).filter(Boolean);
      if(request.headers.get('Access-Control-Request-Method')!=='GET'||requested.some(value=>!['x-service-action','x-service-resource'].includes(value)))fail('forbidden_origin',403);
      return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':'GET','Access-Control-Allow-Headers':'X-Service-Action, X-Service-Resource','Access-Control-Max-Age':'600'}});
    }
    if(url.pathname==='/auth'||url.pathname==='/auth/callback'){
      if(request.method!=='GET')fail('method_not_allowed',405);
      if(url.pathname==='/auth'){
        if(url.search)fail('invalid_query');await store.rate('auth:'+await digest(request.headers.get('CF-Connecting-IP')||'unknown'),10,now,600);
        return await authorize(request,env,store,now);
      }
      return await callback(request,env,store,now,requestGithub);
    }
    const person=url.pathname.match(/^\/u\/([1-9][0-9]{0,19})\/?$/);
    if(person){if(!['GET','HEAD'].includes(request.method))fail('method_not_allowed',405);if(url.search)fail('invalid_query');return await renderProfile(await store.profile(accountId(person[1])),env,site,request.headers.get('Accept-Language'));}
    const match=url.pathname.match(/^\/(s|embed|i|v)\/([a-f0-9]{32})(?:\/([^/]+))?$/);
    if(match){
      if(!['GET','HEAD'].includes(request.method))fail('method_not_allowed',405);if(url.search)fail('invalid_query');
      const item=await store[match[1]==='s'||match[1]==='embed'?'publicShare':'publicGet'](match[2],env.OWNER_GITHUB_ID,now);
      if(match[1]==='s'||match[1]==='embed'){if(match[3])fail('not_found',404);return await renderPage(item,env,site,match[1]==='embed');}
      if((match[1]==='i')!==(item.kind==='image')||!match[3])fail('not_found',404);
      return await deliver(request,env,item,match[3],store,context,{requestUpstream,requestProvider});
    }
    if(url.pathname==='/oembed'){
      if(request.method!=='GET')fail('method_not_allowed',405);
      for(const name of url.searchParams.keys())if(!['url','format','maxwidth','maxheight'].includes(name))fail('invalid_query');
      if(url.searchParams.has('format')&&url.searchParams.get('format')!=='json')fail('unsupported_format',501);
      const item=await store.publicShare(shareId(url.searchParams.get('url'),site),env.OWNER_GITHUB_ID,now);
      return json(oembed(item,site,width(url.searchParams.get('maxwidth')),height(url.searchParams.get('maxheight'))),200,{'Cache-Control':'public, max-age=30',...cors});
    }
    if(url.pathname!=='/api')fail('not_found',404);
    if(url.search)fail('invalid_query');
    const action=request.headers.get('X-Service-Action');if(!Object.hasOwn(methodFor,action||''))fail('unknown_action',404);
    if(request.method!==methodFor[action])fail('method_not_allowed',405);
    if(privateActions.has(action))requireSite(request);
    if(action==='session'){
      const page=resource(request);if(!['','mine','profile','admin','appeal'].includes(page))fail('invalid_resource');
      const token=cookie(request,'__Host-ishare-session'),hash=/^[\w-]{43}$/.test(token)?await digest(token):null;
      const {session,settings,account,initial}=await store.snapshot(hash,page,env.OWNER_GITHUB_ID,(env.ADMIN_IDS||'').split(',').map(value=>value.trim()),now);
      if(initial?.history)initial.history.items=initial.history.items.map(item=>publicRecord(item,site));
      return json({user:session?.user||null,profile:session?.profile||null,csrf:session?.csrf||null,loginAvailable:authReady(env),canPublish:!!session&&allowedPublisher(env,session.user)&&!account.blocked&&!account.sharingBlocked,isAdmin:admin(env,session?.user),account,initial,imagesAvailable:ready(env,'image'),videosAvailable:ready(env,'video'),maxVideoDuration:account?.limits.videoDuration??36000,maxVideoBytes:29_999_999_999,quotaNotice:settings.pending?{effective:settings.pending.effective,note:settings.note}:null});
    }
    const session=privateActions.has(action)?await readSession(request,store,now):null;
    if(action==='feed'){const cursor=resource(request);if(cursor)id(cursor);const data=await store.feed(cursor,env.OWNER_GITHUB_ID,now);return json({...data,items:data.items.map(item=>publicRecord(item,site))},200,{...cors,'Cache-Control':'public, max-age=30',Vary:'X-Service-Action, X-Service-Resource'});}
    if(action==='get'||action==='oembed'){
      const key=action==='oembed'?shareId(resource(request),site):id(resource(request));
      const item=await store.publicShare(key,env.OWNER_GITHUB_ID,now);return json(action==='get'?publicRecord(item,site):oembed(item,site),200,cors);
    }
    if(action==='profile'){const profile=await store.profile(accountId(resource(request)));return json({...profile,url:site+'/u/'+profile.id},200,{...cors,'Cache-Control':'public, max-age=30',Vary:'X-Service-Action, X-Service-Resource'});}
    if(action==='profile-feed'){
      let query;try{query=JSON.parse(resource(request));}catch{fail('invalid_resource');}
      if(!query||Object.keys(query).some(key=>!['owner','cursor'].includes(key)))fail('invalid_resource');const owner=accountId(query.owner),cursor=query.cursor?id(query.cursor):'';await store.profile(owner);
      const data=await store.feed(cursor,env.OWNER_GITHUB_ID,now,owner);return json({...data,items:data.items.map(item=>publicRecord(item,site))},200,{...cors,'Cache-Control':'public, max-age=30',Vary:'X-Service-Action, X-Service-Resource'});
    }
    if(action==='avatar'||action==='profile-avatar'){
      if(action==='avatar'&&!session)fail('login_required',401);const owner=action==='avatar'?accountId(session.user.id):accountId(resource(request));if(action==='profile-avatar')await store.profile(owner);
      let image;try{image=await requestUpstream('https://avatars.githubusercontent.com/u/'+owner+'?s=96',{redirect:'manual',signal:AbortSignal.timeout(15000)});}catch{fail('avatar_unavailable',503);}
      const type=(image.headers.get('Content-Type')||'').split(';')[0];if(!image.ok||!['image/png','image/jpeg','image/webp','image/gif'].includes(type))fail('avatar_unavailable',503);
      return new Response(image.body,{headers:headers({'Content-Type':type,'Cache-Control':action==='avatar'?'private, max-age=3600':'public, max-age=300',Vary:'Cookie, X-Service-Action, X-Service-Resource'})});
    }
    if(!session)fail('login_required',401);
    const settings=settingsActions.has(action)?await store.quotaSettings(now):null,base=settings?.defaults,account=accountActions.has(action)?await store.account(session.user.id,base,env.OWNER_GITHUB_ID,now):null;
    if(action.startsWith('admin-')){
      if(!admin(env,session.user))fail('admin_required',403);
      if(action==='admin-settings'||action==='admin-set-settings'){if(session.user.id!==env.OWNER_GITHUB_ID)fail('owner_required',403);if(action==='admin-settings')return json(settings);requireCsrf(request,session);return json(await store.setQuotaSettings(settingsChange(await jsonBody(request)),session.user.id,now));}
      if(action==='admin-users')return json(await store.users(resource(request),base,env.OWNER_GITHUB_ID,now));
      if(action==='admin-diagnostics'){if(session.user.id!==env.OWNER_GITHUB_ID)fail('owner_required',403);const upstream=provider(env,requestProvider),[images,stream]=await Promise.all([upstream.health('image'),upstream.health('video')]);return json({loginConfigured:authReady(env),ownerMatches:true,images,stream});}
      if(action==='admin-audit')return json({items:await store.audit()});
      if(action==='admin-rights')return json({items:await store.rightsQueue()});
      if(action==='admin-resolve-right'){requireCsrf(request,session);const body=await jsonBody(request);await store.resolveRight(resource(request),text(body.response,2000),session.user.id,now);return json({ok:true});}
      if(action==='admin-list'){const data=await store.list(accountId(resource(request)));return json({...data,items:data.items.map(item=>publicRecord(item,site))});}
      const target=accountId(resource(request));
      if(action==='admin-user')return json(await store.account(target,base,env.OWNER_GITHUB_ID,now));
      requireCsrf(request,session);const change=changes(await jsonBody(request));await store.setAccount(target,change,session.user.id,env.OWNER_GITHUB_ID,now,base);return json(await store.account(target,base,env.OWNER_GITHUB_ID,now));
    }
    if(action==='history'){const cursor=resource(request);if(cursor)id(cursor);const data=await store.history(session.user.id,cursor);return json({...data,items:data.items.map(item=>publicRecord(item,site))});}
    if(action==='rights')return json({items:await store.rights(session.user.id)});
    if(action==='export'){const cursor=resource(request);if(cursor)id(cursor);const data=await store.history(session.user.id,cursor);return json({identity:session.user,profile:session.profile,account,requests:await store.rights(session.user.id),...data,items:data.items.map(item=>publicRecord(item,site))});}
    requireCsrf(request,session);
    if(action==='set-profile'){const body=await jsonBody(request);if(Object.keys(body).some(key=>!['displayName','bio'].includes(key)))fail('invalid_field');await store.rate('profile:'+session.user.id,30,now,3600);return json(await store.setProfile(session.user.id,text(body.displayName,60),text(body.bio,500,true),now));}
    if(action==='logout')return await logout(request,store);
    if(action==='erase-account')return json(await store.erase(session.user.id,now),202);
    const body=await jsonBody(request),upstream=provider(env,requestProvider);
    if(action==='request-right'){if(body.kind==='appeal'&&(account.erasing||allowedPublisher(env,session.user)&&!account.blocked&&!account.sharingBlocked))fail('appeal_not_available',403);if(!['appeal','rectify','restrict','delete','other'].includes(body.kind))fail('invalid_request');return json(await store.requestRight(session.user.id,body.kind,text(body.message,2000),now),201);}
    if(action==='discard-post')return json(await store.discardPost(id(resource(request)),session.user.id));
    if(action==='delete-post')return json(await store.deletePost(id(resource(request)),session.user.id,admin(env,session.user)),202);
    if(action==='set-visibility'){if(typeof body.listed!=='boolean')fail('invalid_field');return json(publicRecord(await store.visibility(id(resource(request)),session.user.id,body.listed,env.OWNER_GITHUB_ID),site));}
    if(action==='create-post'){
      if(!allowedPublisher(env,session.user)||account.blocked||account.sharingBlocked)fail('publishing_suspended',403);
      if(Object.keys(body).some(key=>!['title','caption','mediaIds','listed'].includes(key))||!Array.isArray(body.mediaIds)||body.mediaIds.length>50||typeof body.listed!=='boolean')fail('invalid_post');
      const data={id:resource(request)?id(resource(request)):crypto.randomUUID().replaceAll('-',''),owner:session.user.id,author:session.user,title:text(body.title,200),caption:text(body.caption,5000,true),sourceUrl:'',sourceName:'',mediaIds:body.mediaIds.map(id),listed:body.listed};
      if(session.user.id!==env.OWNER_GITHUB_ID)await store.rate('posts:'+session.user.id,100,now,86400);return json(publicRecord(await store.createPost(data,env.OWNER_GITHUB_ID,now),site),201);
    }
    if(action==='create-upload'){
      if(!allowedPublisher(env,session.user)||account.blocked||account.sharingBlocked)fail('publishing_suspended',403);
      for(const key of Object.keys(body))if(!['kind','title','caption','bytes','mime','duration'].includes(key))fail('invalid_field');
      if(!['image','video'].includes(body.kind))fail('invalid_kind');resourceConfiguration(env,body.kind);
      if(!(body.kind==='image'?imageTypes:videoTypes).includes(body.mime))fail('unsupported_media_type',415);
      const bytes=body.bytes;if(!Number.isSafeInteger(bytes)||bytes<1)fail('invalid_size');if(bytes>(body.kind==='image'?10_000_000:29_999_999_999))fail('file_too_large',413);
      const duration=body.kind==='image'?0:body.duration;if(!Number.isSafeInteger(duration)||duration<0||body.kind==='video'&&(duration<1||duration>36000))fail('invalid_duration');
      if(body.kind==='video'&&exceeds(duration,account.limits.videoDuration))fail('upload_quota',429);
      const sourceUrl='';
      const title=text(body.title,200),caption=text(body.caption,5000,true),sourceName='';
      const applicationId=resource(request)?id(resource(request)):crypto.randomUUID().replaceAll('-','');
      const item=await store.reserve({id:applicationId,owner:session.user.id,author:session.user,kind:body.kind,title,caption,sourceUrl,sourceName,bytes,mime:body.mime,duration},{defaults:base,ownerId:env.OWNER_GITHUB_ID,...settings.shared},now);
      try{const grant=await upstream.create(item,now);await store.attach(applicationId,grant.providerId,grant.uploadUrl,now);return json({id:applicationId,uploadUrl:grant.uploadUrl,protocol:grant.protocol},201);}catch(error){if(error.providerId){const allocated=await store.attach(applicationId,error.providerId,'',now);try{await removeMedia(allocated,store,upstream,session.user.id,false,now,true);}catch{/* Persist cleanup for the existing scheduled job. */}}else if(error.safeToRelease)await store.failed(applicationId);else await store.uncertain(applicationId);throw error;}
    }
    const mediaId=id(resource(request)),item=await store.get(mediaId);
    if(!item||(item.owner!==session.user.id&&!(action==='delete'&&admin(env,session.user))))fail('not_found',404);
    if(action==='publish'){
      if(!allowedPublisher(env,session.user)||account.blocked||account.sharingBlocked)fail('publishing_suspended',403);
      if(item.state==='published')return json(publicRecord(item,site));if(item.state!=='uploading')fail('invalid_state',409);
      const duration=await upstream.ready(item);return json(publicRecord(await store.publish(mediaId,session.user.id,duration,now,env.OWNER_GITHUB_ID),site));
    }
    if(action==='delete'||action==='discard-upload'){
      await removeMedia(item,store,upstream,session.user.id,action==='delete'&&admin(env,session.user),now,action==='discard-upload');
      return json({ok:true});
    }
    fail('unknown_action',404);
  } catch(error) {
    const code=error instanceof ServiceError?error.message:'service_unavailable';
    if(url.pathname==='/auth/callback'&&!request.headers.get('Accept')?.includes('application/json'))return new Response(null,{status:303,headers:{Location:site+'/mine/#login-error='+encodeURIComponent(code),'Cache-Control':'no-store','Referrer-Policy':'no-referrer','Set-Cookie':'__Host-ishare-oauth=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0'}});
    const diagnostics=url.pathname==='/api'&&privateActions.has(request.headers.get('X-Service-Action'));
    return json({error:code,...(diagnostics&&error.stage?{stage:error.stage}:{}),...(diagnostics&&Number.isInteger(error.upstreamStatus)?{upstreamStatus:error.upstreamStatus}:{})},error instanceof ServiceError?error.status:503);
  }
}
