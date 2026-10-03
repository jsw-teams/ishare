import { b64, unb64, fail, ServiceError } from './security.js';
const encoder=new TextEncoder();
const providerId = value => typeof value==='string' && /^[a-zA-Z0-9-]{20,64}$/.test(value) ? value : fail('invalid_upstream',502);

export function resourceConfiguration(env,kind) {
  const p=kind==='image'?'IMAGES':'STREAM';
  const account=env[p+'_ACCOUNT_ID'],token=env[p+'_API_TOKEN'];
  if(!/^[a-f0-9]{32}$/.test(account||'')||typeof token!=='string'||token.length<10)fail('service_unavailable',503);
  if(kind==='video'&&!/^[a-z0-9]{4,100}$/.test(env.STREAM_CUSTOMER_CODE||''))fail('service_unavailable',503);
  return {account,token};
}
export function provider(env,request=fetch) {
  async function call(kind,path,options={}) {
    const {account,token}=resourceConfiguration(env,kind);
    let response;
    try{response=await request(`https://api.cloudflare.com/client/v4/accounts/${account}/${path}`,{...options,headers:{Authorization:'Bearer '+token,...options.headers},redirect:'error',signal:AbortSignal.timeout(20000)});}catch{fail('upstream_unavailable',503);}
    if(options.method==='DELETE'&&response.status===404)return {};
    if(!response.ok){const error=new ServiceError('upstream_unavailable',503);error.safeToRelease=[400,401,403,422].includes(response.status);throw error;}
    const result=await response.json().catch(()=>null);
    if(!result?.success||!result.result)fail('upstream_unavailable',503);
    return result.result;
  }
  return {
    async playbackToken(item) {const result=await call('video',`stream/${providerId(item.provider_id)}/token`,{method:'POST'});if(typeof result.token!=='string'||!/^[A-Za-z0-9_.-]+$/.test(result.token)||result.token.length>4096)fail('invalid_upstream',502);return result.token;},
    async create(item,now) {
      if(item.kind==='image') {
        const body=new FormData();body.set('requireSignedURLs','true');body.set('creator','ishare:'+item.owner);body.set('metadata',JSON.stringify({ishare:item.id}));body.set('expiry',new Date((now+900)*1000).toISOString());
        const data=await call('image','images/v2/direct_upload',{method:'POST',body});
        const url=new URL(data.uploadURL);if(url.protocol!=='https:'||url.hostname!=='upload.imagedelivery.net'||url.username||url.password||url.hash)fail('invalid_upstream',502);
        return {providerId:providerId(data.id),uploadUrl:url.href,protocol:'post'};
      }
      // Stream enforces the byte length and maximum duration, rather than trusting browser metadata.
      const meta={maxDurationSeconds:String(item.duration),requiresignedurls:'',expiry:new Date((now+3600)*1000).toISOString(),name:item.id};
      const metadata=Object.entries(meta).map(([key,value])=>key+' '+btoa(value)).join(',');
      const {account,token}=resourceConfiguration(env,'video');
      let response;try{response=await request(`https://api.cloudflare.com/client/v4/accounts/${account}/stream`,{method:'POST',headers:{Authorization:'Bearer '+token,'Tus-Resumable':'1.0.0','Upload-Length':String(item.bytes),'Upload-Metadata':metadata,'Upload-Creator':'ishare:'+item.owner},redirect:'error',signal:AbortSignal.timeout(20000)});}catch{fail('upstream_unavailable',503);}
      if(response.status!==201){const error=new ServiceError('upstream_unavailable',503);error.safeToRelease=[400,401,403,422].includes(response.status);throw error;}
      const url=new URL(response.headers.get('Location'));if(url.protocol!=='https:'||url.hostname!=='upload.videodelivery.net'||url.username||url.password||url.hash)fail('invalid_upstream',502);
      return {providerId:providerId(response.headers.get('stream-media-id')),uploadUrl:url.href,protocol:'tus'};
    },
    async ready(item) {
      providerId(item.provider_id);
      const result=await call(item.kind,item.kind==='image'?`images/v1/${item.provider_id}`:`stream/${item.provider_id}`);
      if(result.requireSignedURLs!==true)fail('unsafe_upstream',409);
      if(item.kind==='image'){
        if(result.draft===true||!result.uploaded)fail('processing',409);
        if(result.metadata?.ishare!==item.id)fail('invalid_upstream',409);
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
  if(!env.STREAM_SIGNING_KEY&&!env.STREAM_SIGNING_KEY_ID){let token=await store.videoToken(item.id,now);if(!token){token=await provider(env,request).playbackToken(item);await store.saveVideoToken(item.id,token,now+3300);}return new URL(`https://customer-${env.STREAM_CUSTOMER_CODE}.cloudflarestream.com/${token}/manifest/video.m3u8`);}
  let jwk;try{jwk=JSON.parse(new TextDecoder().decode(unb64(env.STREAM_SIGNING_KEY)));}catch{fail('service_unavailable',503);}
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']).catch(()=>fail('service_unavailable',503));
  const header=b64(encoder.encode(JSON.stringify({alg:'RS256',kid:env.STREAM_SIGNING_KEY_ID})));
  const payload=b64(encoder.encode(JSON.stringify({sub:item.provider_id,kid:env.STREAM_SIGNING_KEY_ID,exp:now+7200,nbf:now-30})));
  const token=header+'.'+payload+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,encoder.encode(header+'.'+payload)));
  return new URL(`https://customer-${env.STREAM_CUSTOMER_CODE}.cloudflarestream.com/${token}/manifest/video.m3u8`);
}
