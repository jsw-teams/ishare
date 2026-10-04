const encoder = new TextEncoder();
export class ServiceError extends Error {
  constructor(code, status = 400) { super(code); this.status = status; }
}
export const fail = (code, status = 400) => { throw new ServiceError(code, status); };
export const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
export const unb64 = value => Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')), c => c.charCodeAt(0));
export const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
export const digest = async text => b64(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
export const id = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value) ? value : fail('invalid_id');
export function origin(value) {
  try { const url=new URL(value); if(url.protocol==='https:'&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash)return url.origin; } catch {}
  fail('invalid_origin',503);
}
// Cloudflare's routed request supplies the origin. Never trust forwarded host headers.
export const requestOrigin = request => origin(new URL(request.url).origin);
export function https(value, max=2048) {
  if(typeof value!=='string'||value.length>max||/[\x00-\x20\x7f]/.test(value))fail('invalid_url');
  try { const url=new URL(value);if(url.protocol==='https:'&&!url.username&&!url.password)return url; } catch {}
  fail('invalid_url');
}
export function text(value, max, optional=false) {
  if(optional&&(value===undefined||value===''))return '';
  if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))fail('invalid_text');
  return value.trim();
}
export const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function number(value, fallback, max) { const n=Number(value??fallback);if(!Number.isSafeInteger(n)||n<1||n>max)fail('invalid_configuration',503);return n; }
export async function jsonBody(request) {
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))fail('unsupported_media_type',415);
  const reader=request.body?.getReader();if(!reader)return {};
  const chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>32768){await reader.cancel();fail('body_too_large',413);}chunks.push(value);}
  const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
  try { const body=JSON.parse(new TextDecoder().decode(data));if(body&&typeof body==='object'&&!Array.isArray(body))return body; } catch {}
  fail('invalid_json');
}
export const cookie = (request,name) => (request.headers.get('cookie')||'').split(';').map(part=>part.trim()).find(part=>part.startsWith(name+'='))?.slice(name.length+1)||'';
export const setCookie = (name,value,seconds) => `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${seconds}`;
export function headers(extra={}, embedded=false) {
  return new Headers({ 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()',...(!embedded?{'X-Frame-Options':'DENY'}:{}),...extra });
}
export const json = (data,status=200,extra={}) => new Response(JSON.stringify(data),{status,headers:headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra})});
