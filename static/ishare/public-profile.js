import {messages} from './i18n.js';
import {serviceClient,showAccount,bindAccount,avatarFor} from './account.js';
import {postPreview,emptyState} from './cards.js';
import {confirmAction} from './dialog.js';
import {openShare} from './sharing.js';
const dictionary=messages(document.documentElement.lang),t=key=>dictionary[key]||key,owner=document.querySelector('#public-profile').dataset.owner,root=document.querySelector('#profile-posts'),more=document.querySelector('#profile-more'),status=document.querySelector('#status');
const client=serviceClient();let cursor=null,owned=false,generation=0;
function controls(card,item){
 const actions=document.createElement('div');actions.className='profile-post-actions';
 if(item.state==='published'){const share=document.createElement('button');share.type='button';share.textContent=t('sharePost');share.addEventListener('click',()=>openShare(item,share));actions.append(share);}
 if(item.kind==='post'&&item.state==='published'){
  const label=document.createElement('label'),check=document.createElement('input'),text=document.createElement('span');label.className='check';check.type='checkbox';check.checked=item.listed;text.textContent=t('listed');label.append(check,text);
  check.addEventListener('change',async()=>{check.disabled=true;try{await client.request('set-visibility',{resource:item.id,body:{listed:check.checked}});item.listed=check.checked;status.textContent=t('saved');}catch{check.checked=item.listed;status.textContent=t('error');}finally{check.disabled=false;}});actions.append(label);
 }
 const remove=document.createElement('button');remove.type='button';remove.className='button-danger';remove.textContent=t('remove');
 remove.addEventListener('click',async()=>{if(!await confirmAction(t('confirm')))return;remove.disabled=true;try{await client.request(item.kind==='post'?'delete-post':'delete',{resource:item.id,body:{}});card.remove();if(!root.children.length)emptyState(root,t('profileEmpty'));status.textContent=t('removed');}catch{status.textContent=t('error');}finally{remove.disabled=false;}});actions.append(remove);card.append(actions);
}
async function load(append=false){
 const version=++generation;more.disabled=true;root.setAttribute('aria-busy','true');
 try{
  let data;if(owned)data=await client.request('history',{resource:append?cursor:null});
  else{const response=await fetch('/api',{headers:{'X-Service-Action':'profile-feed','X-Service-Resource':JSON.stringify({owner,cursor:append?cursor:null})},credentials:'omit',redirect:'error'});if(!response.ok)throw Error();data=await response.json();}
  if(version!==generation)return;if(!append)root.replaceChildren();
  for(const item of data.items){const card=item.state==='published'?postPreview(item,t):document.createElement('article');if(item.state!=='published'){const text=document.createElement('p');text.textContent=(item.title||'')+' / '+t('pending');card.append(text);}if(owned)controls(card,item);root.append(card);}
  if(!root.children.length)emptyState(root,t('profileEmpty'));cursor=data.next;more.hidden=!cursor;status.textContent='';
 }catch{status.textContent=t('feedUnavailable');}finally{more.disabled=false;root.removeAttribute('aria-busy');}
}
async function refresh(){const session=await client.read();showAccount(session);const previous=owned;owned=String(session.user?.id)===owner;if(owned||previous!==owned)await load();}
more.addEventListener('click',()=>void load(true));avatarFor(owner,document.querySelector('#public-profile-avatar'));
bindAccount({client,refresh,notice:()=>{status.textContent=t('error');}});void load();void refresh().catch(()=>{});
