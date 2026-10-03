import { DurableObject } from 'cloudflare:workers';
import { Repository } from './store.js';
import { handle } from './service.js';
import { provider } from './provider.js';

export class ShareStore extends DurableObject {
  constructor(ctx,env){super(ctx,env);this.repository=new Repository(ctx.storage.sql,fn=>ctx.storage.transactionSync(fn));}
  get(id){return this.repository.get(id);}
  key(){return this.repository.key();}
  videoToken(...args){return this.repository.videoToken(...args);}
  saveVideoToken(...args){return this.repository.saveVideoToken(...args);}
  rate(...args){return this.repository.rate(...args);}
  beginAuth(...args){return this.repository.beginAuth(...args);}
  consumeAuth(...args){return this.repository.consumeAuth(...args);}
  makeSession(...args){return this.repository.makeSession(...args);}
  session(...args){return this.repository.session(...args);}
  account(...args){return this.repository.account(...args);}
  users(...args){return this.repository.users(...args);}
  setAccount(...args){return this.repository.setAccount(...args);}
  audit(){return this.repository.audit();}
  delivery(...args){return this.repository.delivery(...args);}
  rights(...args){return this.repository.rights(...args);}
  requestRight(...args){return this.repository.requestRight(...args);}
  rightsQueue(){return this.repository.rightsQueue();}
  resolveRight(...args){return this.repository.resolveRight(...args);}
  erase(...args){return this.repository.erase(...args);}
  logout(...args){return this.repository.logout(...args);}
  reserve(...args){return this.repository.reserve(...args);}
  attach(...args){return this.repository.attach(...args);}
  failed(...args){return this.repository.failed(...args);}
  uncertain(...args){return this.repository.uncertain(...args);}
  reconcile(...args){return this.repository.reconcile(...args);}
  publish(...args){return this.repository.publish(...args);}
  list(...args){return this.repository.list(...args);}
  markDelete(...args){return this.repository.markDelete(...args);}
  deleted(...args){return this.repository.deleted(...args);}
  cleanup(...args){return this.repository.cleanup(...args);}
}
export default {
  fetch(request,env,ctx){return handle(request,env,ctx);},
  async scheduled(_event,env){
    const store=env.SHARE_STORE.get(env.SHARE_STORE.idFromName('ishare-v1'));
    const items=await store.cleanup(Math.floor(Date.now()/1000)),upstream=provider(env);
    for(const item of items){try{await upstream.remove(item);await store.deleted(item.id);}catch{/* Retain the quota reservation and retry next hour. */}}
  },
};
