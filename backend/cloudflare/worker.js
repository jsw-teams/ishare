import { DurableObject } from 'cloudflare:workers';
import { Repository } from './store.js';
import { handle } from './service.js';
import { provider } from './provider.js';
import { ServiceError } from './security.js';
import { rpcStore } from './rpc.js';

export class ShareStore extends DurableObject {
  constructor(ctx,env){super(ctx,env);this.repository=new Repository(ctx.storage.sql,fn=>ctx.storage.transactionSync(fn));}
  invoke(method,args){try{return this.repository[method](...args);}catch(error){if(error instanceof ServiceError)return {__ishareError:error.message,status:error.status};throw error;}}
  profile(...args){return this.invoke('profile',args);}
  setProfile(...args){return this.invoke('setProfile',args);}
  get(id){return this.invoke('get',[id]);}
  quotaSettings(...args){return this.invoke('quotaSettings',args);}
  setQuotaSettings(...args){return this.invoke('setQuotaSettings',args);}
  publicShare(...args){return this.invoke('publicShare',args);}
  createPost(...args){return this.invoke('createPost',args);}
  visibility(...args){return this.invoke('visibility',args);}
  history(...args){return this.invoke('history',args);}
  feed(...args){return this.invoke('feed',args);}
  deletePost(...args){return this.invoke('deletePost',args);}
  publicGet(...args){return this.invoke('publicGet',args);}
  key(){return this.invoke('key',[]);}
  videoToken(...args){return this.invoke('videoToken',args);}
  saveVideoToken(...args){return this.invoke('saveVideoToken',args);}
  rate(...args){return this.invoke('rate',args);}
  beginAuth(...args){return this.invoke('beginAuth',args);}
  consumeAuth(...args){return this.invoke('consumeAuth',args);}
  makeSession(...args){return this.invoke('makeSession',args);}
  session(...args){return this.invoke('session',args);}
  snapshot(...args){return this.invoke('snapshot',args);}
  account(...args){return this.invoke('account',args);}
  users(...args){return this.invoke('users',args);}
  setAccount(...args){return this.invoke('setAccount',args);}
  audit(){return this.invoke('audit',[]);}
  delivery(...args){return this.invoke('delivery',args);}
  rights(...args){return this.invoke('rights',args);}
  requestRight(...args){return this.invoke('requestRight',args);}
  rightsQueue(){return this.invoke('rightsQueue',[]);}
  resolveRight(...args){return this.invoke('resolveRight',args);}
  erase(...args){return this.invoke('erase',args);}
  logout(...args){return this.invoke('logout',args);}
  reserve(...args){return this.invoke('reserve',args);}
  attach(...args){return this.invoke('attach',args);}
  failed(...args){return this.invoke('failed',args);}
  uncertain(...args){return this.invoke('uncertain',args);}
  reconcile(...args){return this.invoke('reconcile',args);}
  publish(...args){return this.invoke('publish',args);}
  list(...args){return this.invoke('list',args);}
  markDelete(...args){return this.invoke('markDelete',args);}
  deleted(...args){return this.invoke('deleted',args);}
  cleanup(...args){return this.invoke('cleanup',args);}
}
export default {
  fetch(request,env,ctx){return handle(request,env,ctx);},
  async scheduled(_event,env){
    const store=rpcStore(env);
    const items=await store.cleanup(Math.floor(Date.now()/1000)),upstream=provider(env);
    for(const item of items){try{await upstream.remove(item);await store.deleted(item.id);}catch{/* Retain the quota reservation and retry next hour. */}}
  },
};
