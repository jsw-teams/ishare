import { b64, unb64, digest, fail, headers } from './security.js';
import { imageAddress, videoAddress } from './provider.js';
const encoder=new TextEncoder();
async function key(secret){return crypto.subtle.importKey('raw',unb64(secret),'AES-GCM',false,['encrypt','decrypt']);}
export function upstreamUrl(value,base,env) {
  let url;try{url=base?new URL(value,base):new URL(value);}catch{fail('invalid_manifest',502);}
  const host=`customer-${env.STREAM_CUSTOMER_CODE}.cloudflarestream.com`;
  if(url.protocol!=='https:'||url.hostname!==host||url.port||url.username||url.password||url.hash||url.href.length>3072)fail('invalid_manifest',502);
  // Every resource must remain in this video's signed namespace; no generic forward proxy.
  if(base&&url.pathname.split('/')[1]!==new URL(base).pathname.split('/')[1])fail('invalid_manifest',502);
  if(/%(?:2f|5c|2e|00)/i.test(url.pathname)||url.pathname.includes('\\'))fail('invalid_manifest',502);
  return url;
}
export async function sealResource(url,media,secret,expires,seconds=0) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const body=encoder.encode(JSON.stringify({id:media,exp:expires,url:url.href,seconds}));
  const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(media)},await key(secret),body));
  const result=new Uint8Array(iv.length+cipher.length);result.set(iv);result.set(cipher,iv.length);return b64(result);
}
export async function openResource(ticket,media,secret,now,env,item) {
  if(!/^[A-Za-z0-9_-]{40,6000}$/.test(ticket))fail('invalid_ticket',404);
  let payload;try{const data=unb64(ticket);payload=JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:data.slice(0,12),additionalData:encoder.encode(media)},await key(secret),data.slice(12))));}catch{fail('invalid_ticket',404);}
  if(payload.id!==media||!Number.isSafeInteger(payload.exp)||payload.exp<now||payload.exp>now+7200)fail('expired_ticket',404);
  const url=upstreamUrl(payload.url,null,env);
  if(!Number.isFinite(payload.seconds)||payload.seconds<0||payload.seconds>120)fail('invalid_ticket',404);url.ishareSeconds=payload.seconds;
  try {const token=JSON.parse(new TextDecoder().decode(unb64(url.pathname.split('/')[1].split('.')[1])));if(token.sub!==item.provider_id)fail('invalid_ticket',404);} catch {fail('invalid_ticket',404);}
  return url;
}
export async function rewriteManifest(body,base,media,secret,expires,env) {
  if(!body.startsWith('#EXTM3U')||body.length>1_000_000||/#EXT-X-(SESSION-DATA|CONTENT-STEERING|DEFINE|PART|PRELOAD-HINT)\b/.test(body))fail('invalid_manifest',502);
  const address=async (raw,seconds=0)=>'/v/'+media+'/'+await sealResource(upstreamUrl(raw,base,env),media,secret,expires,seconds);
  const lines=[];
  let seconds=0;
  for(const line of body.split(/\r?\n/)){
    if(line.startsWith('#EXTINF:')){seconds=Number(line.slice(8).split(',')[0]);if(!Number.isFinite(seconds)||seconds<=0||seconds>120)fail('invalid_manifest',502);}
    if(line&& !line.startsWith('#')) {lines.push(await address(line.trim(),seconds));seconds=0;continue;}
    let result=line;
    const matches=[...line.matchAll(/\bURI="([^"]+)"/g)];
    for(const match of matches)result=result.replace(match[0],'URI="'+await address(match[1])+'"');
    // Reject rather than exposing unrecognized URI syntax or an absolute provider URL.
    if(/(?:https?:\/\/|cloudflarestream\.com|videodelivery\.net)|\bURI=(?!")/i.test(result))fail('invalid_manifest',502);
    lines.push(result);
  }
  return lines.join('\n');
}

export async function deliver(request,env,item,resource,store,context,{requestUpstream=fetch,requestProvider=fetch,cache=globalThis.caches?.default}={}) {
  const now=Math.floor(Date.now()/1000);
  let upstream,manifest=false;
  if(item.kind==='image') {
    if(!['public','thumbnail'].includes(resource))fail('invalid_variant',404);
    upstream=imageAddress(env,item);
  }else {
    upstream=resource==='master.m3u8'?await videoAddress(env,item,now,store,requestProvider):await openResource(resource,item.id,await store.key(),now,env,item);
    manifest=/\.m3u8$/.test(upstream.pathname);
  }
  const range=request.headers.get('range');if(range&&!/^bytes=\d+-\d*$/.test(range))fail('invalid_range',416);
  if(request.method==='HEAD')return new Response(null,{headers:headers({'Content-Type':manifest?'application/vnd.apple.mpegurl':item.kind==='image'?item.mime||'image/jpeg':'application/octet-stream','Cache-Control':'no-store'},true)});
  if(item.kind==='image'||upstream.ishareSeconds>0)await store.delivery(item.owner,item.kind,item.kind==='image'?1:upstream.ishareSeconds,now);
  // Internal cache identities omit expiring signatures; upstream content is immutable per media ID.
  const path=item.kind==='video'?upstream.pathname.split('/').slice(2).join('/')+'?'+upstream.searchParams.toString():'blob';
  const cacheKey=new Request(new URL('/__ishare-cache/'+item.id+'/'+await digest(path),env.SITE_ORIGIN));
  if(!manifest&&!range&&cache){const hit=await cache.match(cacheKey);if(hit)return new Response(request.method==='HEAD'?null:hit.body,{status:hit.status,headers:hit.headers});}
  let response;
  try{response=await requestUpstream(upstream,{method:'GET',headers:{...(item.kind==='image'?{Authorization:'Bearer '+env.IMAGES_API_TOKEN}:{}),...(range?{Range:range}:{})},redirect:'manual',signal:AbortSignal.timeout(20000)});}catch{fail('media_unavailable',503);}
  if(![200,206].includes(response.status)){await response.body?.cancel();fail('media_unavailable',response.status===404?404:502);}
  const mime=(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
  if(item.kind==='image'&&!/^image\/(jpeg|png|webp|avif|gif)$/.test(mime)){await response.body?.cancel();fail('invalid_upstream',502);}
  if(item.kind==='video'&&!/^(application\/(vnd\.apple\.mpegurl|x-mpegurl|octet-stream)|video\/(mp2t|mp4)|audio\/(mp4|aac|mpeg)|text\/vtt)$/.test(mime)){await response.body?.cancel();fail('invalid_upstream',502);}
  const resultHeaders=headers({'Content-Type':manifest?'application/vnd.apple.mpegurl':mime,'Cache-Control':manifest?'public, max-age=20':'public, max-age=300','Cross-Origin-Resource-Policy':'cross-origin'},true);
  if(range){for(const name of ['Content-Range','Accept-Ranges'])if(response.headers.has(name))resultHeaders.set(name,response.headers.get(name));}
  let body=response.body;
  if(manifest){const text=await response.text();body=await rewriteManifest(text,upstream,item.id,await store.key(),now+3600,env);}
  const result=new Response(body,{status:response.status,headers:resultHeaders});
  if(!manifest&&!range&&cache)context.waitUntil(cache.put(cacheKey,result.clone()).catch(()=>{}));
  return request.method==='HEAD'?new Response(null,{status:result.status,headers:result.headers}):result;
}
