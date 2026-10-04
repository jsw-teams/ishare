import {fail} from './security.js';
export async function finishRemoval(item,store,upstream){
 const plan=await store.removalPlan(item.id),ids=plan?.ids|| (item.provider_id?[item.provider_id]:[]);
 for(const providerId of ids)await upstream.remove({...item,provider_id:providerId});
 await store.deleted(item.id,!!plan?.scrub);
}
export async function removeMedia(item,store,upstream,actor,administrator,now,discard=false){
 let ids=item.provider_id?[item.provider_id]:[];
 if(item.state==='uncertain'){
  const located=await upstream.locate(item);
  if(!located.complete||!located.ids.length&&now-item.created<120)fail('cleanup_pending',503);
  ids=[...new Set([...ids,...located.ids])];discard=true;
 }
 const marked=await store.prepareRemoval(item.id,actor,administrator,ids,discard);
 await finishRemoval(marked,store,upstream);
}
