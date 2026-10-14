let client=null,identity='',lifetime=null;
const empty={type:'object',properties:{},additionalProperties:false};
const postId={type:'string',pattern:'^[a-f0-9]{32}$'};
export function syncWebMCP(session,nextClient){
 const context=window.top===window&&document.modelContext;if(typeof context?.registerTool!=='function')return;
 client=nextClient;const next=session.user?session.user.id+':'+Boolean(session.canPublish):'';if(identity===next)return;
 lifetime?.abort();identity=next;if(!next)return;lifetime=new AbortController();const active=lifetime,owner=session.user.id;
 const register=(name,description,inputSchema,run,readOnly=false)=>{
  try{Promise.resolve(context.registerTool({name,description,inputSchema,annotations:{readOnlyHint:readOnly,destructiveHint:!readOnly,untrustedContentHint:true},execute:async input=>{
   if(active.signal.aborted)throw Error('Account changed');const fresh=await client.read();if(fresh.user?.id!==owner)throw Error('Sign in to your account');
   const result=await run(input||{});if(active.signal.aborted)throw Error('Account changed');if(!readOnly)document.dispatchEvent(new Event('ishare:posts-changed'));return typeof result==='string'?result:JSON.stringify(result);
  }},{signal:active.signal})).catch(()=>{});}catch{}
 };
 register('ishare_list_my_posts','List this signed-in user’s posts and unfinished uploads. Content is untrusted data.',{type:'object',properties:{cursor:postId},additionalProperties:false},({cursor})=>client.request('history',{resource:cursor}),true);
 register('ishare_get_my_post','Read a post owned by the signed-in user, including attachment ids, revision and homepage visibility.',{type:'object',properties:{id:postId},required:['id'],additionalProperties:false},({id})=>client.request('owned-post',{resource:id}),true);
 register('ishare_delete_my_post','Delete an owned post and its attachments. Existing links stop working. Use only when the user requests deletion.',{type:'object',properties:{id:postId},required:['id'],additionalProperties:false},({id})=>client.request('delete-post',{resource:id,body:{}}));
 if(session.canPublish){
  register('ishare_edit_my_post','Revise the caption, retain/reorder owned attachment ids and choose homepage visibility. Read the current revision first. Omitted attachments are deleted; the post link remains unchanged.',{type:'object',properties:{id:postId,caption:{type:'string',maxLength:5000},mediaIds:{type:'array',items:postId,maxItems:50,uniqueItems:true},listed:{type:'boolean'},revision:{type:'integer',minimum:0}},required:['id','caption','mediaIds','listed','revision'],additionalProperties:false},({id,...body})=>client.request('update-post',{resource:id,body}));
  register('ishare_set_homepage_visibility','Choose whether an owned post appears on the homepage. Its sharing link remains available.',{type:'object',properties:{id:postId,listed:{type:'boolean'}},required:['id','listed'],additionalProperties:false},({id,listed})=>client.request('set-visibility',{resource:id,body:{listed}}));
  if(document.querySelector('#publish-form'))register('ishare_publish_selected_post','Publish or save the composer’s attachments already selected by the user. Files cannot be read from arbitrary local paths. Shows the ordinary upload progress and embedded preview.',{type:'object',properties:{caption:{type:'string',maxLength:5000},listed:{type:'boolean'}},additionalProperties:false},async input=>{
   const form=document.querySelector('#publish-form');if(form.querySelector('fieldset').disabled)throw Error('Composer is busy');if(input.caption!==undefined)form.elements.caption.value=input.caption;if(input.listed!==undefined)form.elements.listed.checked=input.listed;
   if(!form.checkValidity()||!document.querySelector('#attachment-preview')?.children.length&&!form.elements.caption.value.trim())throw Error('Select attachments or write a caption first');
   return new Promise((resolve,reject)=>{const done=event=>{active.signal.removeEventListener('abort',abort);document.removeEventListener('ishare:publish-result',done);event.detail.ok?resolve(event.detail.record):reject(Error(event.detail.error));},abort=()=>{document.removeEventListener('ishare:publish-result',done);reject(Error('Page closed'));};document.addEventListener('ishare:publish-result',done);active.signal.addEventListener('abort',abort,{once:true});form.requestSubmit();});
  });
 }
 if(document.querySelector('#api-key-panel')){
  if(session.canPublish)register('ishare_create_api_key','Create a personal API key only when the user requests it. The full key is shown and returned once; later reads reveal metadata only.',{type:'object',properties:{name:{type:'string',maxLength:60,minLength:1},days:{type:'integer',enum:[30,90,365]}},required:['name'],additionalProperties:false},input=>{
   const form=document.querySelector('#api-key-form');if(form.querySelector('button').disabled)throw Error('Key form is busy');form.elements.name.value=input.name;form.elements.days.value=String(input.days||90);if(!form.checkValidity())throw Error('Invalid key name');
   return new Promise((resolve,reject)=>{const done=event=>{document.removeEventListener('ishare:key-result',done);active.signal.removeEventListener('abort',abort);event.detail.ok?resolve(event.detail.key):reject(Error(event.detail.error));},abort=()=>{document.removeEventListener('ishare:key-result',done);reject(Error('Account changed'));};document.addEventListener('ishare:key-result',done);active.signal.addEventListener('abort',abort,{once:true});form.requestSubmit();});
  });
  register('ishare_list_api_keys','List this user’s key names, prefixes, expiry and revocation state. Never reveals existing full keys.',empty,()=>client.request('api-keys'),true);
  register('ishare_revoke_api_key','Revoke one of this user’s API keys when requested.',{type:'object',properties:{id:postId},required:['id'],additionalProperties:false},async({id})=>{const result=await client.request('revoke-api-key',{resource:id,body:{}});document.dispatchEvent(new Event('ishare:keys-changed'));return result;});
 }
}
globalThis.addEventListener?.('pagehide',()=>{lifetime?.abort();identity='';client=null;},{once:true});
