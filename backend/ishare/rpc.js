import { ServiceError } from './security.js';

// RPC transfers built-in Errors without custom properties or their original class.
// Send expected service failures as plain data and restore them in the caller.
export function rpcStore(env){
  const stub=env.SHARE_STORE.get(env.SHARE_STORE.idFromName('ishare-v1'));
  return new Proxy(stub,{get(target,method){return async(...args)=>{const value=await target[method](...args);if(value?.__ishareError)throw new ServiceError(value.__ishareError,value.status);return value;};}});
}
