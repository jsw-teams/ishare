import {serviceClient,showAccount} from './account.js';
import {messages} from './i18n.js';
import {postPreview,emptyState} from './cards.js';
const dictionary=messages(document.documentElement.lang),t=key=>dictionary[key]||key;
const root=document.querySelector('#feed'),status=document.querySelector('#status'),more=document.querySelector('#more');let next=null;
async function load(append=false){
  more.disabled=true;
  try{const headers={'X-Service-Action':'feed'};if(append&&next)headers['X-Service-Resource']=next;const response=await fetch('/api',{headers,credentials:'omit',redirect:'error'});if(!response.ok)throw Error();const data=await response.json();if(!append)root.replaceChildren();for(const item of data.items)root.append(postPreview(item,t));if(!root.children.length)emptyState(root,t('feedEmpty'));next=data.next;more.hidden=!next;status.textContent='';}
  catch{status.textContent=t('feedUnavailable');}finally{more.disabled=false;}
}
more.addEventListener('click',()=>void load(true));void load();

const client=serviceClient();void client.read().then(session=>showAccount(session)).catch(()=>{});document.querySelector('#logout').addEventListener('click',async()=>{try{await client.request('logout',{body:{}});showAccount(await client.read());}catch{}});
