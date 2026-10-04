import {messages,language} from './i18n.js';
import {uploadFile} from './upload.js';
import {adminPanel} from './admin.js';
import {rightsPanel} from './rights.js';
import {postPreview,emptyState} from './cards.js';
const form=document.querySelector('#publish-form'),status=document.querySelector('#status'),library=document.querySelector('#library');
const dictionary=messages(language(document.documentElement.lang)),t=key=>dictionary[key]||key;
let session=null,controller=null,entries=[],resuming=null,items=[],next=null,postId=crypto.randomUUID().replaceAll('-','');
async function api(action,{resource,body,signal}={}){
 const headers={'X-Service-Action':action};if(resource)headers['X-Service-Resource']=encodeURIComponent(resource);
 if(body){headers['Content-Type']='application/json';headers['X-CSRF-Token']=session?.csrf||'';}
 const response=await fetch('/api',{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,credentials:'same-origin',cache:'no-store',redirect:'error',signal});
 const data=await response.json();if(!response.ok){const error=new Error(data.error||'request_failed');error.status=response.status;throw error;}return data;
}
const notify=key=>status.textContent=t(key);
const notice=error=>notify(error.name==='AbortError'?'stopped':['upload_quota','storage_quota','rate_limited'].includes(error.message)?'quota':error.message==='file_too_large'?'tooLarge':error.message==='manual_reconciliation_required'?'unknown':error.status===503?'unavailable':'error');
function button(label,action){const node=document.createElement('button');node.type='button';node.textContent=t(label);node.addEventListener('click',()=>void action().catch(notice));return node;}
function linkField(card,label,value){const row=document.createElement('label'),name=document.createElement('span'),input=document.createElement(['embed','markdown'].includes(label)?'textarea':'input');name.textContent=t(label);input.readOnly=true;input.value=value;if(input.tagName==='TEXTAREA')input.rows=3;row.append(name,input,button('copy',async()=>{try{await navigator.clipboard.writeText(value);notify('copied');}catch{input.focus();input.select();}}));card.append(row);}
function preview(){const root=document.querySelector('#attachment-preview');root.replaceChildren();document.querySelector('#selected-file').hidden=!entries.length;document.querySelector('#selected-file').textContent=t('attachments')+': '+entries.length+' / 50';for(const entry of entries){const card=document.createElement('div');card.className='attachment-tile';const name=document.createElement('p');name.textContent=entry.file?.name||entry.record?.title||t('pending');if(entry.file?.type.startsWith('image/')){entry.preview??=URL.createObjectURL(entry.file);const img=document.createElement('img');img.src=entry.preview;img.alt=entry.file.name;card.append(img);}else if(entry.record?.kind==='image'){const img=document.createElement('img');img.src='/i/'+entry.record.id+'/thumbnail';img.alt=entry.record.title;card.append(img);}card.append(name,button('removeAttachment',async()=>{if(controller)return;if(entry.preview)URL.revokeObjectURL(entry.preview);entries=entries.filter(value=>value!==entry);preview();}));root.append(card);}}
function render(){
 library.replaceChildren();if(!items.length){emptyState(library,t('empty'));return;}
 for(const item of items){const card=item.state==='published'?postPreview(item,t):document.createElement('article');if(item.state==='published'){
   linkField(card,'share',item.shareUrl);linkField(card,'embed',item.embedCode);linkField(card,'markdown',item.markdown);
   if(item.kind==='post'){const label=document.createElement('label'),check=document.createElement('input'),span=document.createElement('span');label.className='check';check.type='checkbox';check.checked=item.listed;span.textContent=t('listed');label.append(check,span);check.addEventListener('change',async()=>{check.disabled=true;try{await api('set-visibility',{resource:item.id,body:{listed:check.checked}});item.listed=check.checked;}catch(error){check.checked=item.listed;notice(error);}finally{check.disabled=false;}});card.append(label);}
   else card.append(button('attachExisting',async()=>{if(entries.length>=50||entries.some(entry=>entry.record?.id===item.id))return;entries.push({record:item});preview();notify('attachmentReady');}));
 }else{const p=document.createElement('p');p.textContent=item.title+' / '+t(item.state==='uncertain'?'unknown':'pending');card.append(p);if(item.state==='uploading'){
   card.append(button('resume',async()=>{if(controller)return;resuming=item;form.elements.title.value=item.title;form.elements.caption.value=item.caption;form.elements.sourceUrl.value=item.source.url;form.elements.sourceName.value=item.source.name;form.elements.file.focus();notify('selectResume');}));
   card.append(button('publish',async()=>{const record=await publish(item.id);if(entries.length<50&&!entries.some(entry=>entry.record?.id===record.id))entries.push({record});preview();await refresh();notify('attachmentReady');}));
 }}
 card.append(button('remove',async()=>{if(!confirm(t('confirm')))return;await api(item.kind==='post'?'delete-post':'delete',{resource:item.id,body:{}});await refresh();}));library.append(card);}
}
async function refresh(){
 try{session=await api('session');document.querySelector('#login').hidden=!session.loginAvailable||!!session.user;document.querySelector('#logout').hidden=!session.user;document.querySelector('#identity').textContent=session.user?'@'+session.user.login:'';form.querySelector('fieldset').disabled=!session.canPublish||!!controller;
 document.querySelector('#limits').textContent=session.user?(session.account.unlimited?t('unlimited'):t('images')+': '+session.account.usage.images+' / '+(session.account.limits.images??t('unlimited'))+'; '+t('videoSeconds')+': '+(session.account.usage.videoSeconds/60).toFixed(1)+' / '+(session.account.limits.videoSeconds===null?t('unlimited'):session.account.limits.videoSeconds/60)):'';
 if(session.user){const data=await api('history');items=data.items;next=data.next;}else{items=[];next=null;}render();document.querySelector('#more').hidden=!next;management.update(session);rights.update(session);
 const accountNotice=document.querySelector('#account-notice');accountNotice.hidden=!session.account?.note&&!session.account?.erasing&&!session.quotaNotice;accountNotice.textContent=session.account?.erasing?t('erasePending'):(session.account?.note||'')+(session.account?.notice?' / '+t('scheduled')+': '+new Date(session.account.notice.effective*1000).toLocaleString():'')+(session.quotaNotice?' / '+session.quotaNotice.note+' / '+t('scheduled')+': '+new Date(session.quotaNotice.effective*1000).toLocaleString():'');
 if(!controller)notify(!session.loginAvailable?'unavailable':!session.user?'loginRequired':!session.canPublish?'unavailable':'available');
 }catch(error){notice(error);}
}
function clearDraft(){for(const entry of entries)if(entry.preview)URL.revokeObjectURL(entry.preview);entries=[];resuming=null;postId=crypto.randomUUID().replaceAll('-','');form.reset();preview();}
document.querySelector('#logout').addEventListener('click',async()=>{try{await api('logout',{body:{}});clearDraft();await refresh();}catch(error){notice(error);}});
form.elements.file.addEventListener('change',()=>{const files=[...form.elements.file.files];if(resuming){if(files.length!==1||files[0].size!==resuming.bytes||files[0].type!==resuming.mime){notify('differentFile');return;}entries.push({file:files[0],grant:{id:resuming.id},resume:true});resuming=null;}else for(const file of files){if(entries.length>=50){notify('attachmentLimit');break;}if(!entries.some(entry=>entry.file&&entry.file.name===file.name&&entry.file.size===file.size&&entry.file.lastModified===file.lastModified))entries.push({file});}form.elements.file.value='';preview();});
document.querySelector('#cancel').addEventListener('click',()=>controller?.abort());
async function durationOf(file){const video=document.createElement('video'),url=URL.createObjectURL(file);try{return await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{video.src='';reject(new Error('unsupported'));},10000);video.onloadedmetadata=()=>{clearTimeout(timeout);resolve(Math.ceil(video.duration));};video.onerror=()=>{clearTimeout(timeout);reject(new Error('unsupported'));};video.preload='metadata';video.src=url;});}finally{video.src='';URL.revokeObjectURL(url);}}
async function publish(id,signal){for(let attempt=0;attempt<12;attempt++){try{return await api('publish',{resource:id,body:{},signal});}catch(error){if(error.message!=='processing')throw error;notify('processing');await new Promise(resolve=>setTimeout(resolve,3000));if(signal?.aborted)throw new DOMException('Paused','AbortError');}}throw new Error('processing');}
form.addEventListener('submit',async event=>{
 event.preventDefault();if(controller)return;if(!entries.length&&!form.elements.caption.value.trim()){notify('emptyPost');return;}
 for(const entry of entries){if(entry.record)continue;const file=entry.file,kind=file.type.startsWith('image/')?'image':file.type.startsWith('video/')?'video':null;if(!kind){notify('unsupported');return;}if(!session[kind==='image'?'imagesAvailable':'videosAvailable']){notify('unavailable');return;}if(file.size>(kind==='image'?10_000_000:29_999_999_999)){notify('tooLarge');return;}}
 controller=new AbortController();const progress=document.querySelector('#progress'),cancel=document.querySelector('#cancel');progress.hidden=false;cancel.hidden=false;form.querySelector('fieldset').disabled=true;
 try{for(const [index,entry]of entries.entries()){
   if(entry.record)continue;const file=entry.file,kind=file.type.startsWith('image/')?'image':'video',duration=kind==='video'?await durationOf(file):0;
   if(!Number.isFinite(duration)||duration>session.maxVideoDuration){notify('tooLong');return;}
   if(entry.resume){entry.grant=await api('get-upload',{resource:entry.grant.id,signal:controller.signal});entry.resume=false;}
   entry.grant??=await api('create-upload',{body:{kind,title:file.name.slice(0,200),caption:form.elements.caption.value,sourceUrl:form.elements.sourceUrl.value,sourceName:form.elements.sourceName.value,bytes:file.size,mime:file.type,duration},signal:controller.signal});
   if(!entry.uploaded)await uploadFile(file,entry.grant,value=>{progress.value=(index+value)/entries.length;status.textContent=t('progress')+' '+(index+1)+' / '+entries.length+' — '+Math.round(value*100)+'%';},{signal:controller.signal});entry.uploaded=true;entry.record=await publish(entry.grant.id,controller.signal);
 }
 await api('create-post',{resource:postId,body:{title:form.elements.title.value,caption:form.elements.caption.value,sourceUrl:form.elements.sourceUrl.value,sourceName:form.elements.sourceName.value,mediaIds:entries.map(entry=>entry.record.id),listed:form.elements.listed.checked},signal:controller.signal});clearDraft();notify('success');
 }catch(error){notice(error);}finally{controller=null;progress.hidden=true;cancel.hidden=true;const message=status.textContent;await refresh();status.textContent=message;}
});
const management=adminPanel({api,t,notice,refresh}),rights=rightsPanel({api,t,notice});
document.querySelector('#more').addEventListener('click',async()=>{try{const data=await api('history',{resource:next});items.push(...data.items);next=data.next;render();document.querySelector('#more').hidden=!next;}catch(error){notice(error);}});
window.addEventListener('pagehide',()=>{for(const entry of entries)if(entry.preview)URL.revokeObjectURL(entry.preview);controller?.abort();},{once:true});void refresh();
