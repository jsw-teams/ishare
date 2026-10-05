import { fail, ServiceError } from './security.js';
import {uploadAddress} from '../../static/ishare/upload-address.js';
const providerId = value => typeof value==='string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : fail('invalid_upstream',502);
function upstreamFailure(stage,reason,status,data){const error=new ServiceError('upstream_unavailable',503);error.stage=stage;error.reason=reason;if(status)error.upstreamStatus=status;const codes=(Array.isArray(data?.errors)?data.errors:[]).map(item=>item?.code).filter(Number.isSafeInteger).slice(0,5);if(codes?.length)error.providerCodes=codes;console.warn('ishare_upstream_failure',{stage,reason,upstreamStatus:status||0,...(error.providerCodes?{providerCodes:error.providerCodes}:{})});return error;}
function grant(kind,identifier,destination){
 let uid,url;try{uid=providerId(identifier);}catch(error){error.stage='upload_identifier';error.reason=identifier?'invalid_id':'missing_id';console.warn('ishare_upload_rejected',{kind,stage:error.stage,reason:error.reason});throw error;}
 try{url=uploadAddress(destination,kind);}catch(cause){const error=new ServiceError('invalid_upstream',502);error.providerId=uid;error.stage='upload_destination';error.reason=cause.reason;console.warn('ishare_upload_rejected',{kind,stage:error.stage,reason:error.reason});throw error;}
 return {providerId:uid,uploadUrl:url.href,protocol:kind==='image'?'post':'tus'};
}

export function resourceConfiguration(env,kind) {
  const account=env.STREAM_ACCOUNT_ID?.trim(),token=env.MEDIA_API_TOKEN?.trim();
  if(!/^[a-f0-9]{32}$/.test(account||'')||typeof token!=='string'||token.length<10)fail('service_unavailable',503);
  return {account,token};
}
export function provider(env,request=fetch) {
  async function call(kind,path,options={}) {
    const {account,token}=resourceConfiguration(env,kind);
    const stage=options.method==='POST'?'upload_allocation':'provider_api';
    let response;
    try{response=await request(`https://api.cloudflare.com/client/v4/accounts/${account}/${path}`,{...options,headers:{Authorization:'Bearer '+token,...options.headers},redirect:'manual',signal:AbortSignal.timeout(20000)});}catch(cause){throw upstreamFailure(stage,['TimeoutError','AbortError'].includes(cause.name)?'timeout':'network');}
    if(options.method==='DELETE'&&[404,410].includes(response.status)){await response.body?.cancel();return {};}
    if([404,410].includes(response.status)&&/^((images\/v1|stream)\/[^/]+)(\/token)?$/.test(path)){await response.body?.cancel();fail('media_missing',404);}
    if(options.method==='DELETE'&&kind==='video'&&response.ok){await response.body?.cancel();return {};}
    const result=await response.json().catch(()=>null);
    if(!response.ok){const error=upstreamFailure(stage,'http_status',response.status,result);error.safeToRelease=[400,401,403,422].includes(response.status);throw error;}
    if(!result?.success||options.method!=='DELETE'&&!result.result)throw upstreamFailure(stage,!result?'invalid_json':!result.success?'api_rejected':'missing_result',response.status,result);
    return result.result;
  }
  return {
    imageInfo(item){return call('image',`images/v1/${providerId(item.provider_id)}`);},
    imageVariants(){return call('image','images/v1/variants');},
    imageVariant(id,options,exists){return call('image','images/v1/variants'+(exists?'/'+id:''),{method:exists?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...(!exists?{id}:{}),options,neverRequireSignedURLs:false})});},
    imageKeys(){return call('image','images/v1/keys');},
    createImageKey(){return call('image','images/v1/keys/ishare',{method:'PUT'});},
    async health(kind){try{const path=kind==='image'?'images/v2?per_page=10':'stream?limit=1';await call(kind,path);return {configured:true,readable:true};}catch(error){return {configured:error.message!=='service_unavailable',readable:false,error:error.message};}},
    async locate(item){
      const query=new URLSearchParams({creator:'ishare:'+item.owner});
      if(item.kind==='image'){query.set('per_page','100');query.set('meta.ishare[eq]',item.id);}else{query.set('limit','1000');query.set('after',new Date((item.created-120)*1000).toISOString());}
      const found=[];let complete=false;
      for(let page=0;page<5;page++){
        const data=await call(item.kind,(item.kind==='image'?'images/v2':'stream')+'?'+query),items=item.kind==='image'?data.images:data;
        if(!Array.isArray(items))fail('upstream_unavailable',503);
        for(const candidate of items)if(candidate.creator==='ishare:'+item.owner&&(item.kind==='image'?candidate.meta?.ishare:candidate.meta?.name)===item.id)found.push(providerId(item.kind==='image'?candidate.id:candidate.uid));
        if(item.kind==='video'){complete=items.length<1000;break;}
        if(!data.continuation_token){complete=true;break;}query.set('continuation_token',data.continuation_token);
      }
      return {ids:[...new Set(found)],complete};
    },
    async playbackAddress(item) {const result=await call('video',`stream/${providerId(item.provider_id)}`);const url=new URL(result.playback?.hls||'https://invalid');if(result.requireSignedURLs!==true||url.protocol!=='https:'||!/^customer-[a-z0-9]+\.cloudflarestream\.com$/.test(url.hostname)||url.port||url.username||url.password||url.pathname!==`/${item.provider_id}/manifest/video.m3u8`)fail('invalid_upstream',502);return url;},
    async playbackToken(item) {const result=await call('video',`stream/${providerId(item.provider_id)}/token`,{method:'POST'});if(typeof result.token!=='string'||!/^[A-Za-z0-9_.-]+$/.test(result.token)||result.token.length>4096)fail('invalid_upstream',502);return result.token;},
    async create(item,now) {
      if(item.kind==='image') {
        const body=new FormData();body.set('requireSignedURLs','true');body.set('creator','ishare:'+item.owner);body.set('metadata',JSON.stringify({ishare:item.id}));body.set('expiry',new Date((now+900)*1000).toISOString());
        const data=await call('image','images/v2/direct_upload',{method:'POST',body});
        return grant('image',data.id,data.uploadURL);
      }
      // Stream enforces the byte length and maximum duration, rather than trusting browser metadata.
      const meta={maxDurationSeconds:String(item.duration),requiresignedurls:'',expiry:new Date((now+3600)*1000).toISOString(),name:item.id};
      const metadata=Object.entries(meta).map(([key,value])=>value?key+' '+btoa(value):key).join(',');
      const {account,token}=resourceConfiguration(env,'video');
      let response;try{response=await request(`https://api.cloudflare.com/client/v4/accounts/${account}/stream?direct_user=true`,{method:'POST',headers:{Authorization:'Bearer '+token,'Tus-Resumable':'1.0.0','Upload-Length':String(item.bytes),'Upload-Metadata':metadata,'Upload-Creator':'ishare:'+item.owner},redirect:'manual',signal:AbortSignal.timeout(20000)});}catch(cause){throw upstreamFailure('upload_allocation',['TimeoutError','AbortError'].includes(cause.name)?'timeout':'network');}
      if(response.status!==201){const error=upstreamFailure('upload_allocation','http_status',response.status,await response.json().catch(()=>null));error.safeToRelease=[400,401,403,422].includes(response.status);throw error;}
      await response.body?.cancel();
      return grant('video',response.headers.get('stream-media-id'),response.headers.get('Location'));
    },
    async ready(item) {
      providerId(item.provider_id);
      const result=await call(item.kind,item.kind==='image'?`images/v1/${item.provider_id}`:`stream/${item.provider_id}`);
      if(result.requireSignedURLs!==true)fail('unsafe_upstream',409);
      if(item.kind==='image'){
        if(result.draft===true||!result.uploaded)fail('processing',409);
        if(result.meta?.ishare!==item.id)fail('invalid_upstream',409);
        return 0;
      }
      if(result.readyToStream!==true)fail(result.status?.state==='error'?'upload_failed':'processing',409);
      const duration=Math.ceil(result.duration);if(!Number.isFinite(duration)||duration<1||duration>item.duration)fail('invalid_duration',409);
      return duration;
    },
    async remove(item) {if(item.provider_id)await call(item.kind,item.kind==='image'?`images/v1/${providerId(item.provider_id)}`:`stream/${providerId(item.provider_id)}`,{method:'DELETE'});},
  };
}

export function imageAddress(env,item) {
  const {account}=resourceConfiguration(env,'image');
  return new URL(`https://api.cloudflare.com/client/v4/accounts/${account}/images/v1/${providerId(item.provider_id)}/blob`);
}
export async function videoAddress(env,item,now,store,request=fetch) {
  resourceConfiguration(env,'video');providerId(item.provider_id);
  const cached=await store.videoToken(item.id,now);if(cached?.startsWith('https://'))return new URL(cached);
  const upstream=provider(env,request),address=await upstream.playbackAddress(item);
  const token=cached||await upstream.playbackToken(item);address.pathname=`/${token}/manifest/video.m3u8`;await store.saveVideoToken(item.id,address.href,now+3300);return address;
}
