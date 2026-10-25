import {provider,resourceConfiguration} from './provider.js';
import {fail} from './security.js';
const variants={thumbnail:{id:'isharePreview',size:640},medium:{id:'ishareMedium',size:1280},public:{id:'ishareDisplay',size:2048}};
const caches=new WeakMap();
function configuration(env,request){
 const {account,token}=resourceConfiguration(env,'image');let cache=caches.get(request);
 if(!cache||cache.account!==account||cache.token!==token){cache={account,token,images:new Map()};caches.set(request,cache);}return cache;
}
async function settings(cache,api){
 if(cache.settings&&cache.expires>Date.now())return cache.settings;
 if(!cache.pending)cache.pending=(async()=>{
  const existing=(await api.imageVariants()).variants;
  if(!existing||typeof existing!=='object')fail('invalid_upstream',502);
  for(const {id,size} of Object.values(variants)){
   const options={width:size,height:size,fit:'scale-down',metadata:'none'},current=existing[id];
   if(!current||current.neverRequireSignedURLs!==false||Object.entries(options).some(([key,value])=>current.options?.[key]!==value))await api.imageVariant(id,options,!!current);
  }
  let keys=(await api.imageKeys()).keys;
  if(!Array.isArray(keys))fail('invalid_upstream',502);
  if(!keys.length)keys=(await api.createImageKey()).keys;
  const value=keys?.find(key=>typeof key.value==='string'&&key.value.length>=16)?.value;
  if(!value)fail('invalid_upstream',502);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(value),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  cache.settings={key};cache.expires=Date.now()+900000;return cache.settings;
 })().finally(()=>{cache.pending=null;});
 return cache.pending;
}
export async function optimizedImage(env,item,resource,request=fetch){
 const variant=variants[resource];if(!variant)fail('invalid_variant',404);
 const cache=configuration(env,request),api=provider(env,request);
 let cached=cache.images.get(item.provider_id);
 if(!cached||cached.expires<Date.now()){
  const info=await api.imageInfo(item);if(info.requireSignedURLs!==true||!Array.isArray(info.variants))fail('unsafe_upstream',502);
  let base;for(const address of info.variants){let url;try{url=new URL(address);}catch{continue;}const pieces=url.pathname.split('/');if(url.protocol==='https:'&&url.hostname==='imagedelivery.net'&&!url.port&&!url.username&&!url.password&&pieces.length===4&&pieces[2]===item.provider_id&&/^[a-zA-Z0-9_-]+$/.test(pieces[1])){base=url.origin+'/'+pieces[1]+'/'+pieces[2]+'/';break;}}
  if(!base)fail('invalid_upstream',502);cached={base,expires:Date.now()+300000};if(cache.images.size>=128)cache.images.delete(cache.images.keys().next().value);cache.images.set(item.provider_id,cached);
 }
 const {key}=await settings(cache,api),url=new URL(variant.id,cached.base);url.searchParams.set('exp',String(Math.floor(Date.now()/1000)+600));
 const signature=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(url.pathname+'?'+url.searchParams.toString()));
 url.searchParams.set('sig',Array.from(new Uint8Array(signature),byte=>byte.toString(16).padStart(2,'0')).join(''));return url;
}
