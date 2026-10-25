import {checkBoundary, limitsWith, readBody, parseStrictJson} from '@cloud-api-shield/shield/http-boundary';
import {protectStream} from '@cloud-api-shield/shield/protocols';

/** Native business ingress. Authentication/ownership/CSRF stay in each real service. */
export function createBusinessIngress(service, handler, profile) {
  const limits = limitsWith({maxBodyBytes:profile.maxBodyBytes, bodyTimeoutMs:5000});
  let active = 0;
  return async (incoming, env, context) => {
    const requestId = crypto.randomUUID();
    const reject = status => Response.json({error:'request_rejected', requestId}, {status,
      headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    if (active >= profile.maxConcurrentRequests) return reject(503);
    active++;
    let released = false, streaming = false;
    const abort = new AbortController();
    const onAbort = () => abort.abort();
    incoming.signal.addEventListener('abort',onAbort,{once:true});
    const release = () => {
      if (released) return;
      released = true; active--;
      incoming.signal.removeEventListener('abort',onAbort);
    };
    const operation = async () => {
      let hosts = env.SHIELD_ALLOWED_HOSTS;
      if (typeof hosts === 'string') { try { hosts = JSON.parse(hosts); } catch { throw new Error('Invalid host configuration'); } }
      if (!Array.isArray(hosts) || !hosts.length || hosts.length > 16 || hosts.some(host => typeof host !== 'string' || !/^[a-z0-9.-]+(?::[0-9]{1,5})?$/.test(host)))
        throw new Error('A fixed host allowlist is required');
      const upgrade = incoming.headers.has('upgrade');
      const mode = upgrade ? 'websocket' : 'http';
      const {url,path} = checkBoundary(incoming,limits,hosts,undefined,mode);
      if (url.protocol !== 'https:') throw Object.assign(new Error('TLS required'),{status:400});
      if (upgrade && !(profile.webSocketPaths || []).includes(path))
        throw Object.assign(new Error('Protocol unsupported'),{status:426});
      const type = (incoming.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (type.startsWith('application/grpc')) throw Object.assign(new Error('Protocol unsupported'),{status:415});
      const body = await readBody(incoming,limits);
      if (body.length && type === 'application/json') {
        try { parseStrictJson(new TextDecoder('utf-8',{fatal:true}).decode(body)); }
        catch { throw Object.assign(new Error('Invalid JSON'),{status:400}); }
      }
      const headers = new Headers(incoming.headers);
      for (const name of [...headers.keys()]) {
        if (name === 'forwarded' || name === 'x-real-ip' || name.startsWith('x-forwarded-') ||
          name.startsWith('x-shield-') || ['host','content-length','transfer-encoding','connection'].includes(name))
          headers.delete(name);
        if (profile.platform !== 'cloudflare' && name.startsWith('cf-')) headers.delete(name);
      }
      const request = new Request(incoming.url,{method:incoming.method,headers,signal:abort.signal,
        ...(!['GET','HEAD'].includes(incoming.method) && body.length ? {body} : {})});
      if (abort.signal.aborted || incoming.signal.aborted) throw Object.assign(new Error('Cancelled'),{status:408});
      const response = await handler(request,env,context);
      if (abort.signal.aborted) {
        void response.body?.cancel().catch(()=>{});
        throw Object.assign(new Error('Deadline'),{status:504});
      }
      // Native opaque upgrades retain their service's authentication and transport. No message-inspection claim.
      if (response.status === 101) return response;
      const outputHeaders = new Headers(response.headers);
      for (const name of ['server','x-powered-by','x-shield-origin-auth']) outputHeaders.delete(name);
      outputHeaders.set('X-Content-Type-Options','nosniff');
      outputHeaders.set('X-Shield-Service',service);
      outputHeaders.set('X-Shield-Request-Id',requestId);
      if (headers.has('authorization') || headers.has('cookie') || outputHeaders.has('set-cookie'))
        outputHeaders.set('Cache-Control','no-store');
      if (!response.body || incoming.method === 'HEAD' || [204,205,304].includes(response.status)) {
        void response.body?.cancel().catch(()=>{});
        return new Response(null,{status:response.status,headers:outputHeaders});
      }
      streaming = true;
      const stream = protectStream(response.body,{maxBytes:profile.maxResponseBytes,idleTimeoutMs:30000,
        signal:abort.signal,abort:()=>abort.abort(),complete:release});
      return new Response(stream,{status:response.status,headers:outputHeaders});
    };
    // Ignoring cancellation cannot free admission slots and create an unbounded background backlog.
    const pending = operation().finally(()=>{if(!streaming)release();});
    let timer;
    try {
      return await Promise.race([pending,new Promise((_,rejectTimeout)=>{
        timer=setTimeout(()=>{abort.abort();rejectTimeout(Object.assign(new Error('Deadline'),{status:504}));},30000);
      })]);
    } catch (error) {
      return reject(Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 503);
    } finally {clearTimeout(timer);}
  };
}
