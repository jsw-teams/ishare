import {messages} from './i18n.js';
import {uploadFile} from './upload.js';
import {serviceClient,showAccount} from './account.js';
import {rightsPanel} from './rights.js';
import {postPreview,emptyState} from './cards.js';
const form=document.querySelector('#publish-form'),status=document.querySelector('#status'),library=document.querySelector('#library');
const dictionary=messages(document.documentElement.lang),t=key=>dictionary[key]||key;
let session=null,controller=null,entries=[],resuming=null,items=[],next=null,postId=crypto.randomUUID().replaceAll('-','');
const client=serviceClient(),api=client.request;
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
 }else{const p=document.createElement('p');p.textContent=item.title+' / '+t(item.state==='uncertain'?'unknown':item.state==='deleting'?'deleting':'pending');card.append(p);if(item.state==='uploading'){
   card.append(button('resume',async()=>{if(controller)return;resuming=item;form.elements.caption.value=item.caption;form.elements.file.focus();notify('selectResume');}));
   card.append(button('publish',async()=>{const record=await publish(item.id);if(entries.length<50&&!entries.some(entry=>entry.record?.id===record.id))entries.push({record});preview();await refresh();notify('attachmentReady');}));
 }}
 card.append(button('remove',async()=>{if(!confirm(t('confirm')))return;await api(item.kind==='post'?'delete-post':'delete',{resource:item.id,body:{}});await refresh();}));library.append(card);}
}
function showQuotas(account){
 const root=document.querySelector('#quota-summary');root.hidden=!account;if(!account)return;
 const format=new Intl.NumberFormat(document.documentElement.lang,{maximumFractionDigits:1});
 for(const [key,field,scale]of [['image','images',1],['video','videoSeconds',60],['daily','dailyUploads',1]]){
  const used=account.usage[field]||0,limit=account.limits[field],bar=document.querySelector('#'+key+'-quota');
  const value=format.format(used/scale)+' / '+(limit===null?t('unlimited'):format.format(limit/scale));document.querySelector('#'+key+'-usage').textContent=value;
  bar.hidden=limit===null;bar.max=Math.max(1,limit||0);bar.value=Math.min(used,bar.max);bar.setAttribute('aria-valuetext',value);
 }
}
async function refresh(){
 try{session=await client.read();showAccount(session);showQuotas(session.account);form.querySelector('fieldset').disabled=!session.canPublish||!!controller;form.classList.toggle('publisher-locked',!session.canPublish);const gate=document.querySelector('#publisher-gate'),login=document.querySelector('#publisher-login');gate.hidden=!!session.canPublish;document.querySelector('#gate-title').textContent=t(!session.user?'gateTitle':'gateSuspended');document.querySelector('#gate-message').textContent=t(!session.loginAvailable?'gateUnavailable':!session.user?'gateHint':'gateAccountHint');login.hidden=!!session.user||!session.loginAvailable;
 if(session.user){const data=await api('history');items=data.items;next=data.next;}else{items=[];next=null;}render();document.querySelector('#more').hidden=!next;rights.update(session);
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
   entry.grant??=await api('create-upload',{body:{kind,title:file.name.slice(0,200),caption:form.elements.caption.value,bytes:file.size,mime:file.type,duration},signal:controller.signal});
   if(!entry.uploaded)await uploadFile(file,entry.grant,value=>{progress.value=(index+value)/entries.length;status.textContent=t('progress')+' '+(index+1)+' / '+entries.length+' — '+Math.round(value*100)+'%';},{signal:controller.signal});entry.uploaded=true;entry.record=await publish(entry.grant.id,controller.signal);
 }
 await api('create-post',{resource:postId,body:{title:form.elements.caption.value.trim().split('\n')[0].slice(0,100)||t('newPostTitle'),caption:form.elements.caption.value,mediaIds:entries.map(entry=>entry.record.id),listed:form.elements.listed.checked},signal:controller.signal});clearDraft();notify('success');
 }catch(error){notice(error);}finally{controller=null;progress.hidden=true;cancel.hidden=true;const message=status.textContent;await refresh();status.textContent=message;}
});
const rights=rightsPanel({api,t,notice});
document.querySelector('#more').addEventListener('click',async()=>{try{const data=await api('history',{resource:next});items.push(...data.items);next=data.next;render();document.querySelector('#more').hidden=!next;}catch(error){notice(error);}});
const loginError=new URLSearchParams(location.hash.slice(1)).get('login-error');if(loginError){const box=document.querySelector('#login-error'),keys={github_credentials_invalid:'loginCredentials',github_callback_mismatch:'loginCallback',github_code_expired:'loginExpired',expired_oauth_state:'loginExpired',invalid_oauth_state:'loginExpired',github_pkce_failed:'loginExpired',github_email_unverified:'loginEmail',github_identity_unavailable:'loginIdentity',github_exchange_unavailable:'loginExchange',github_exchange_network:'loginNetwork',github_exchange_not_found:'loginEndpoint',github_exchange_denied:'loginDenied',github_exchange_redirected:'loginDenied',github_exchange_rejected:'loginExchange',github_rate_limited:'loginRate',login_cancelled:'loginCancelled'};box.hidden=false;box.textContent=t(keys[loginError]||'loginFailed');box.focus();history.replaceState(null,'',location.pathname);}
window.addEventListener('pagehide',()=>{for(const entry of entries)if(entry.preview)URL.revokeObjectURL(entry.preview);controller?.abort();},{once:true});void refresh();
