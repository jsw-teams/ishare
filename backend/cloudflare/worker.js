import { DurableObject } from 'cloudflare:workers';
import { Repository } from './store.js';
import { handle } from './service.js';
import { provider } from './provider.js';
import { ServiceError } from './security.js';
import {finishRemoval,removeMedia} from './removal.js';

export class ShareStore extends DurableObject {
  constructor(ctx,env){super(ctx,env);this.repository=new Repository(ctx.storage.sql,fn=>ctx.storage.transactionSync(fn));ctx.blockConcurrencyWhile(()=>this.scheduleCleanup());}
  async scheduleCleanup(){const due=this.repository.nextCleanup(Math.floor(Date.now()/1000)),current=await this.ctx.storage.getAlarm();if(due===null){if(current!==null)await this.ctx.storage.deleteAlarm();}else if(current===null||due*1000<current)await this.ctx.storage.setAlarm(Math.max(Date.now()+1000,due*1000));}
  async invoke(method,args){try{const result=this.repository[method](...args);if(['reserve','attach','uncertain','prepareRemoval','deleted','failed','publish','deletePost','erase','cleanup','makeSession','beginAuth','consumeAuth','logout','rate','delivery','setAccount','setQuotaSettings','resolveRight','discardPost'].includes(method))await this.scheduleCleanup();return result;}catch(error){if(error instanceof ServiceError)return {__ishareError:error.message,status:error.status};throw error;}}
  async alarm(){const store=this.repository,upstream=provider(this.env),now=Math.floor(Date.now()/1000);for(const item of store.cleanup(now)){try{await finishRemoval(item,store,upstream);}catch{/* The next alarm retries only remaining work. */}}for(const item of store.pendingCleanup(now)){try{await removeMedia(item,store,upstream,item.owner,true,now,true);}catch{/* Unknown allocation is discovered by its exact application metadata. */}}store.cleanup(Math.floor(Date.now()/1000));await this.scheduleCleanup();}
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
  videoCover(...args){return this.invoke('videoCover',args);}
  saveVideoCover(...args){return this.invoke('saveVideoCover',args);}
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
  pendingCleanup(...args){return this.invoke('pendingCleanup',args);}
  discardPost(...args){return this.invoke('discardPost',args);}
  removalPlan(...args){return this.invoke('removalPlan',args);}
  prepareRemoval(...args){return this.invoke('prepareRemoval',args);}
  publish(...args){return this.invoke('publish',args);}
  list(...args){return this.invoke('list',args);}
  deleted(...args){return this.invoke('deleted',args);}
  cleanup(...args){return this.invoke('cleanup',args);}
}
export default {
  fetch(request,env,ctx){return handle(request,env,ctx);},
};
