import {messages} from './i18n.js';
import {serviceClient,showAccount,bindAccount,avatarFor} from './account.js';
import {postPreview,emptyState} from './cards.js';
const dictionary=messages(document.documentElement.lang),t=key=>dictionary[key]||key,owner=document.querySelector('#public-profile').dataset.owner,root=document.querySelector('#profile-posts'),more=document.querySelector('#profile-more'),status=document.querySelector('#status');let cursor=null;
async function load(append=false){more.disabled=true;try{const response=await fetch('/api',{headers:{'X-Service-Action':'profile-feed','X-Service-Resource':JSON.stringify({owner,cursor:append?cursor:null})},credentials:'omit',redirect:'error'});if(!response.ok)throw Error();const data=await response.json();if(!append)root.replaceChildren();for(const item of data.items)root.append(postPreview(item,t));if(!root.children.length)emptyState(root,t('profileEmpty'));cursor=data.next;more.hidden=!cursor;status.textContent='';}catch{status.textContent=t('feedUnavailable');}finally{more.disabled=false;}}
more.addEventListener('click',()=>void load(true));avatarFor(owner,document.querySelector('#public-profile-avatar'));void load();
const client=serviceClient(),refresh=async()=>showAccount(await client.read());bindAccount({client,refresh,notice:()=>{}});void refresh().catch(()=>{});
