import {messages,language} from './i18n.js';
import {uploadFile} from './upload.js';
import {adminPanel} from './admin.js';
import {rightsPanel} from './rights.js';
const form=document.querySelector('#publish-form'),status=document.querySelector('#status'),library=document.querySelector('#library');
const locale=document.querySelector('#language');
let session=null,controller=null,resuming=null,items=[],next=null;
try{locale.value=language(localStorage.getItem('ishare-language')||navigator.language);}catch{locale.value=language(navigator.language);}
const t=key=>messages(locale.value)[key]||key;
function translate(){document.documentElement.lang=locale.value;document.querySelectorAll('[data-i18n]').forEach(node=>node.textContent=t(node.dataset.i18n));}
function notify(key){status.textContent=t(key);}
locale.addEventListener('change',()=>{try{localStorage.setItem('ishare-language',locale.value);}catch{}translate();void refresh();});translate();
async function api(action,{resource,body,signal}={}){
  const headers={'X-Service-Action':action};if(resource)headers['X-Service-Resource']=encodeURIComponent(resource);
  if(body){headers['Content-Type']='application/json';headers['X-CSRF-Token']=session?.csrf||'';}
  const response=await fetch('/api',{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,credentials:'same-origin',cache:'no-store',redirect:'error',signal});
  const data=await response.json();if(!response.ok){const error=new Error(data.error||'request_failed');error.status=response.status;throw error;}return data;
}
const notice=error=>notify(error.name==='AbortError'?'stopped':['upload_quota','storage_quota','rate_limited'].includes(error.message)?'quota':error.message==='manual_reconciliation_required'?'unknown':error.status===503?'unavailable':'error');
function button(label,action){const node=document.createElement('button');node.type='button';node.textContent=t(label);node.addEventListener('click',()=>void action().catch(notice));return node;}
function linkField(card,label,value){const row=document.createElement('label'),name=document.createElement('span'),input=document.createElement(label==='embed'?'textarea':'input');name.textContent=t(label);input.readOnly=true;input.value=value;if(label==='embed')input.rows=3;row.append(name,input,button('copy',async()=>{try{await navigator.clipboard.writeText(value);notify('copied');}catch{input.focus();input.select();}}));card.append(row);}
function render(records){
  const items=records;
  library.replaceChildren();if(!items.length){const p=document.createElement('p');p.textContent=t('empty');library.append(p);return;}
  for(const item of items){const card=document.createElement('article'),heading=document.createElement('h3');heading.textContent=item.title;card.append(heading);
    if(item.state==='published'){
      if(item.kind==='image'){const img=document.createElement('img');img.src='/i/'+item.id+'/thumbnail';img.alt=item.title;img.loading='lazy';card.append(img);}
      linkField(card,'share',item.shareUrl);linkField(card,'raw',item.mediaUrl);
      linkField(card,'embed',`<iframe src="${item.embedUrl}" title="ishare" width="640" height="480" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-presentation" allow="fullscreen" allowfullscreen></iframe>`);
    }else{const p=document.createElement('p');p.textContent=item.state==='uncertain'?t('unknown'):t('pending');card.append(p);
      if(item.state==='uploading'){
        card.append(button('resume',async()=>{resuming=item;form.reset();form.elements.title.value=item.title;form.elements.caption.value=item.caption;form.elements.sourceUrl.value=item.source.url;form.elements.sourceName.value=item.source.name;form.elements.file.focus();notify('stopped');}));
        card.append(button('publish',async()=>{await publish(item.id);await refresh();}));
      }
    }
    card.append(button('remove',async()=>{if(!confirm(t('confirm')))return;await api('delete',{resource:item.id,body:{}});await refresh();}));library.append(card);
  }
}
async function refresh(){
  try{session=await api('session');document.querySelector('#login').hidden=!session.loginAvailable||!!session.user;document.querySelector('#logout').hidden=!session.user;
    document.querySelector('#identity').textContent=session.user?'@'+session.user.login:'';
    form.querySelector('fieldset').disabled=!session.canPublish||(!session.imagesAvailable&&!session.videosAvailable)||!!controller;
    document.querySelector('#limits').textContent=session.user?(session.account.unlimited?t('unlimited'):t('images')+': '+session.account.usage.images+' / '+(session.account.limits.images??t('unlimited'))+'; '+t('videoSeconds')+': '+(session.account.usage.videoSeconds/60).toFixed(1)+' / '+(session.account.limits.videoSeconds===null?t('unlimited'):session.account.limits.videoSeconds/60)):'';
    if(session.user){const data=await api('list');items=data.items;next=data.next;render(items);}else{items=[];next=null;render(items);}
    document.querySelector('#more').hidden=!next;management.update(session);rights.update(session);
    const accountNotice=document.querySelector('#account-notice');accountNotice.hidden=!session.account?.note&&!session.account?.erasing;accountNotice.textContent=session.account?.erasing?t('erasePending'):(session.account?.note||'')+(session.account?.notice?' / '+t('scheduled')+': '+new Date(session.account.notice.effective*1000).toLocaleString():'');
    if(!controller)notify(!session.loginAvailable?'unavailable':!session.user?'loginRequired':!session.canPublish?'unavailable':'available');
  }catch(error){notice(error);}
}
document.querySelector('#logout').addEventListener('click',async()=>{try{await api('logout',{body:{}});resuming=null;await refresh();}catch(error){notice(error);}});
document.querySelector('#cancel').addEventListener('click',()=>controller?.abort());
async function durationOf(file){const video=document.createElement('video'),url=URL.createObjectURL(file);try{return await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{video.src='';reject(new Error('unsupported'));},10000);video.onloadedmetadata=()=>{clearTimeout(timeout);resolve(Math.ceil(video.duration));};video.onerror=()=>{clearTimeout(timeout);reject(new Error('unsupported'));};video.preload='metadata';video.src=url;});}finally{video.src='';URL.revokeObjectURL(url);}}
async function publish(id,signal){for(let attempt=0;attempt<12;attempt++){try{return await api('publish',{resource:id,body:{},signal});}catch(error){if(error.message!=='processing')throw error;notify('processing');await new Promise(resolve=>setTimeout(resolve,3000));if(signal?.aborted)throw new DOMException('Paused','AbortError');}}throw new Error('processing');}
form.addEventListener('submit',async event=>{
  event.preventDefault();if(controller)return;const file=form.elements.file.files[0];if(!file)return;
  const kind=file.type.startsWith('image/')?'image':file.type.startsWith('video/')?'video':null;
  if(!kind){notify('unsupported');return;}if(file.size>(kind==='image'?10_000_000:session.maxVideoBytes)){notify('tooLarge');return;}
  controller=new AbortController();const progress=document.querySelector('#progress'),cancel=document.querySelector('#cancel');progress.hidden=false;cancel.hidden=false;form.querySelector('fieldset').disabled=true;
  try{
    const duration=kind==='video'?await durationOf(file):0;if(!Number.isFinite(duration)||duration>session.maxVideoDuration){notify('tooLong');return;}
    let grant;
    if(resuming){if(resuming.bytes!==file.size||resuming.mime!==file.type)throw new Error('different_file');grant=await api('get-upload',{resource:resuming.id,signal:controller.signal});}
    else grant=await api('create-upload',{body:{kind,title:form.elements.title.value,caption:form.elements.caption.value,sourceUrl:form.elements.sourceUrl.value,sourceName:form.elements.sourceName.value,bytes:file.size,mime:file.type,duration},signal:controller.signal});
    resuming={id:grant.id,bytes:file.size,mime:file.type};notify('progress');
    await uploadFile(file,grant,value=>{progress.value=value;status.textContent=t('progress')+' '+Math.round(value*100)+'%';},{signal:controller.signal});
    await publish(grant.id,controller.signal);resuming=null;form.reset();notify('success');
  }catch(error){notice(error);}finally{controller=null;progress.hidden=true;cancel.hidden=true;const message=status.textContent;await refresh();status.textContent=message;}
});
const management=adminPanel({api,t,notice,refresh}),rights=rightsPanel({api,t,notice});
document.querySelector('#more').addEventListener('click',async()=>{try{const data=await api('list',{resource:next});items.push(...data.items);next=data.next;render(items);document.querySelector('#more').hidden=!next;}catch(error){notice(error);}});
void refresh();
