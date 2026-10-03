import { ServiceError, fail, origin, https, text, number, id, random, digest, jsonBody, json } from './security.js';
import { authReady, readSession, requireSite, requireCsrf, authorize, callback, logout } from './auth.js';
import { provider, resourceConfiguration } from './provider.js';
import { publicRecord, oembed, shareId, renderPage } from './views.js';
import { deliver } from './delivery.js';
import { defaults, changes, accountId, exceeds } from './quotas.js';
const imageTypes=['image/jpeg','image/png','image/gif','image/webp','image/avif'];
const videoTypes=['video/mp4','video/webm','video/quicktime','video/x-matroska'];
const alive=item=>item?.state==='published'?item:fail('not_found',404);
const methodFor={session:'GET',list:'GET','get-upload':'GET',get:'GET',oembed:'GET','create-upload':'POST',publish:'POST',delete:'POST',logout:'POST','admin-users':'GET','admin-user':'GET','admin-set-user':'POST','admin-list':'GET','admin-audit':'GET','admin-reconcile':'POST','admin-rights':'GET','admin-resolve-right':'POST',export:'GET',rights:'GET','request-right':'POST','erase-account':'POST'};
const privateActions=new Set(Object.keys(methodFor).filter(key=>!['get','oembed'].includes(key)));
const ready=(env,kind)=>{try{resourceConfiguration(env,kind);return true;}catch{return false;}};
const allowedPublisher=(env,user)=>user?.id===env.OWNER_GITHUB_ID||!env.PUBLISHER_IDS||env.PUBLISHER_IDS==='*'||env.PUBLISHER_IDS.split(',').map(s=>s.trim()).includes(user?.id);
const admin=(env,user)=>!!user&&(user.id===env.OWNER_GITHUB_ID||env.ADMIN_IDS?.split(',').map(s=>s.trim()).includes(user.id));
function resource(request){const value=request.headers.get('X-Service-Resource')||'';try{return decodeURIComponent(value);}catch{fail('invalid_resource');}}
const width=value=>value===null?640:number(value,640,1920);
const height=value=>value===null?480:number(value,480,1440);

export async function handle(request,env,context,{requestProvider=fetch,requestGithub=fetch,requestUpstream=fetch}={}) {
  const url=new URL(request.url),site=origin(env.SITE_ORIGIN),now=Math.floor(Date.now()/1000);
  const store=env.SHARE_STORE.get(env.SHARE_STORE.idFromName('ishare-v1'));
  const incoming=request.headers.get('Origin');
  const publicOrigins=new Set([site,...(env.WEBSITE_ORIGINS||'').split(',').filter(Boolean).map(origin)]);
  const cors=incoming&&publicOrigins.has(incoming)?{'Access-Control-Allow-Origin':incoming,Vary:'Origin'}:{};
  try {
    if(url.origin!==site)fail('not_found',404);
    if(request.method==='OPTIONS'&&url.pathname==='/api') {
      if(!incoming||!publicOrigins.has(incoming))fail('forbidden_origin',403);
      return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-Service-Action, X-Service-Resource, X-CSRF-Token','Access-Control-Max-Age':'600'}});
    }
    if(url.pathname==='/auth'||url.pathname==='/auth/callback'){
      if(request.method!=='GET')fail('method_not_allowed',405);
      if(url.pathname==='/auth'){
        if(url.search)fail('invalid_query');await store.rate('auth:'+await digest(request.headers.get('CF-Connecting-IP')||'unknown'),10,now,600);
        return await authorize(request,env,store,now);
      }
      return await callback(request,env,store,now,requestGithub);
    }
    const match=url.pathname.match(/^\/(s|embed|i|v)\/([a-f0-9]{32})(?:\/([^/]+))?$/);
    if(match){
      if(!['GET','HEAD'].includes(request.method))fail('method_not_allowed',405);if(url.search)fail('invalid_query');
      const item=alive(await store.get(match[2]));
      if(match[1]==='s'||match[1]==='embed'){if(match[3])fail('not_found',404);return await renderPage(item,env,match[1]==='embed');}
      if((match[1]==='i')!==(item.kind==='image')||!match[3])fail('not_found',404);
      return await deliver(request,env,item,match[3],store,context,{requestUpstream,requestProvider});
    }
    if(url.pathname==='/oembed'){
      if(request.method!=='GET')fail('method_not_allowed',405);
      for(const name of url.searchParams.keys())if(!['url','format','maxwidth','maxheight'].includes(name))fail('invalid_query');
      if(url.searchParams.has('format')&&url.searchParams.get('format')!=='json')fail('unsupported_format',501);
      const item=alive(await store.get(shareId(url.searchParams.get('url'),env)));
      return json(oembed(item,env,width(url.searchParams.get('maxwidth')),height(url.searchParams.get('maxheight'))),200,{'Cache-Control':'public, max-age=30',...cors});
    }
    if(url.pathname!=='/api')fail('not_found',404);
    if(url.search)fail('invalid_query');
    const action=request.headers.get('X-Service-Action');if(!Object.hasOwn(methodFor,action||''))fail('unknown_action',404);
    if(request.method!==methodFor[action])fail('method_not_allowed',405);
    if(incoming&&!publicOrigins.has(incoming))fail('forbidden_origin',403);
    if(privateActions.has(action))requireSite(request,env);
    const session=privateActions.has(action)?await readSession(request,store,now):null;
    const base=defaults(env),account=session?await store.account(session.user.id,base,env.OWNER_GITHUB_ID,now):null;
    if(action==='session')return json({user:session?.user||null,csrf:session?.csrf||null,loginAvailable:authReady(env),canPublish:!!session&&allowedPublisher(env,session.user)&&!account.blocked,isAdmin:admin(env,session?.user),account,imagesAvailable:ready(env,'image'),videosAvailable:ready(env,'video'),maxVideoDuration:account?.limits.videoDuration??36000,maxVideoBytes:account?.limits.videoBytes??29_999_999_999});
    if(action==='get'||action==='oembed'){
      const key=action==='oembed'?shareId(resource(request),env):id(resource(request));
      const item=alive(await store.get(key));return json(action==='get'?publicRecord(item,env):oembed(item,env),200,cors);
    }
    if(!session)fail('login_required',401);
    if(action.startsWith('admin-')){
      if(!admin(env,session.user))fail('admin_required',403);
      if(action==='admin-users')return json(await store.users(resource(request),base,env.OWNER_GITHUB_ID,now));
      if(action==='admin-reconcile'){if(session.user.id!==env.OWNER_GITHUB_ID)fail('owner_required',403);requireCsrf(request,env,session);const body=await jsonBody(request);if(body.confirmedAbsent!==true)fail('confirmation_required');return json(await store.reconcile(id(resource(request)),session.user.id,text(body.note,500),now));}
      if(action==='admin-audit')return json({items:await store.audit()});
      if(action==='admin-rights')return json({items:await store.rightsQueue()});
      if(action==='admin-resolve-right'){requireCsrf(request,env,session);const body=await jsonBody(request);await store.resolveRight(resource(request),text(body.response,2000),session.user.id,now);return json({ok:true});}
      if(action==='admin-list'){const data=await store.list(accountId(resource(request)));return json({...data,items:data.items.map(item=>publicRecord(item,env))});}
      const target=accountId(resource(request));
      if(action==='admin-user')return json(await store.account(target,base,env.OWNER_GITHUB_ID,now));
      requireCsrf(request,env,session);const change=changes(await jsonBody(request));await store.setAccount(target,change,session.user.id,env.OWNER_GITHUB_ID,now,base);return json(await store.account(target,base,env.OWNER_GITHUB_ID,now));
    }
    if(action==='rights')return json({items:await store.rights(session.user.id)});
    if(action==='export'){const cursor=resource(request);if(cursor)id(cursor);const data=await store.list(session.user.id,cursor);return json({identity:session.user,account,requests:await store.rights(session.user.id),...data,items:data.items.map(item=>publicRecord(item,env))});}
    if(action==='list'){const cursor=resource(request);if(cursor)id(cursor);const data=await store.list(session.user.id,cursor);return json({...data,items:data.items.map(item=>publicRecord(item,env))});}
    if(action==='get-upload'){if(account.blocked)fail('publishing_suspended',403);const item=await store.get(id(resource(request)));if(!item||item.owner!==session.user.id||item.state!=='uploading')fail('not_found',404);return json({id:item.id,bytes:item.bytes,mime:item.mime,uploadUrl:item.upload_url,protocol:item.kind==='video'?'tus':'post'});}
    requireCsrf(request,env,session);
    if(action==='logout')return await logout(request,store);
    if(action==='erase-account')return json(await store.erase(session.user.id,now),202);
    const body=await jsonBody(request),upstream=provider(env,requestProvider);
    if(action==='request-right'){if(!['appeal','rectify','restrict','delete','other'].includes(body.kind))fail('invalid_request');return json(await store.requestRight(session.user.id,body.kind,text(body.message,2000),now),201);}
    if(action==='create-upload'){
      if(!allowedPublisher(env,session.user)||account.blocked)fail('publishing_suspended',403);
      for(const key of Object.keys(body))if(!['kind','title','caption','sourceUrl','sourceName','bytes','mime','duration'].includes(key))fail('invalid_field');
      if(!['image','video'].includes(body.kind))fail('invalid_kind');resourceConfiguration(env,body.kind);
      if(!(body.kind==='image'?imageTypes:videoTypes).includes(body.mime))fail('unsupported_media_type',415);
      const bytes=number(body.bytes,0,body.kind==='image'?10_000_000:29_999_999_999);
      const duration=body.kind==='image'?0:number(body.duration,120,36000);
      if(body.kind==='video'&&(exceeds(bytes,account.limits.videoBytes)||exceeds(duration,account.limits.videoDuration)))fail('upload_quota',429);
      const sourceUrl=body.sourceUrl?https(body.sourceUrl).href:'';
      const title=text(body.title,200),caption=text(body.caption,5000,true),sourceName=text(body.sourceName,120,true);
      const applicationId=crypto.randomUUID().replaceAll('-','');
      const item=await store.reserve({id:applicationId,owner:session.user.id,author:session.user,kind:body.kind,title,caption,sourceUrl,sourceName,bytes,mime:body.mime,duration},{defaults:base,ownerId:env.OWNER_GITHUB_ID,images:number(env.MAX_IMAGES,1000,100000),videoSeconds:number(env.MAX_VIDEO_SECONDS,3600,10000000),daily:number(env.MAX_UPLOADS_PER_DAY,500,10000)},now);
      try{const grant=await upstream.create(item,now);await store.attach(applicationId,grant.providerId,grant.uploadUrl,now);return json({id:applicationId,uploadUrl:grant.uploadUrl,protocol:grant.protocol},201);}catch(error){if(error.safeToRelease)await store.failed(applicationId);else await store.uncertain(applicationId);throw error;}
    }
    const mediaId=id(resource(request)),item=await store.get(mediaId);
    if(!item||(item.owner!==session.user.id&&!(action==='delete'&&admin(env,session.user))))fail('not_found',404);
    if(action==='publish'){
      if(!allowedPublisher(env,session.user)||account.blocked)fail('publishing_suspended',403);
      if(item.state==='published')return json(publicRecord(item,env));if(item.state!=='uploading')fail('invalid_state',409);
      const duration=await upstream.ready(item);return json(publicRecord(await store.publish(mediaId,session.user.id,duration,now,env.OWNER_GITHUB_ID),env));
    }
    if(action==='delete'){
      if(item.state==='uncertain')fail('manual_reconciliation_required',409);
      const marked=await store.markDelete(mediaId,session.user.id,admin(env,session.user));
      await upstream.remove(marked);await store.deleted(mediaId);return json({ok:true});
    }
    fail('unknown_action',404);
  } catch(error) {return json({error:error instanceof ServiceError?error.message:'service_unavailable'},error instanceof ServiceError?error.status:503,cors);}
}
