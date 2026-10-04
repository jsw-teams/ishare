import {messages} from './i18n.js';
export function serviceClient(page=''){
 let session=null;const pending=new Map();
 async function transport(action,{resource,body,signal}={}){
  const headers={'X-Service-Action':action};if(resource)headers['X-Service-Resource']=encodeURIComponent(resource);
  if(body){headers['Content-Type']='application/json';headers['X-CSRF-Token']=session?.csrf||'';}
  const response=await fetch('/api',{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,credentials:'same-origin',cache:'no-store',redirect:'error',signal});
  const data=await response.json();if(!response.ok){const error=new Error(data.error||'request_failed');error.status=response.status;if(['upload_destination','upload_allocation','provider_api'].includes(data.stage))error.stage=data.stage;if(Number.isInteger(data.upstreamStatus))error.upstreamStatus=data.upstreamStatus;throw error;}return data;
 }
 function request(action,options={}){if(options.body||options.signal)return transport(action,options);const key=JSON.stringify([action,options.resource||'']);if(!pending.has(key))pending.set(key,transport(action,options).finally(()=>pending.delete(key)));return pending.get(key);}
 return {request,async read(){session=await request('session',{resource:page});return session;}};
}
let avatarUser=null,avatarUrl=null,generation=0;
const publicAvatars=new Map();
export function avatarFor(id,image){
 if(!/^[1-9][0-9]{0,19}$/.test(id))return;
 if(!publicAvatars.has(id))publicAvatars.set(id,(async()=>{const response=await fetch('/api',{headers:{'X-Service-Action':'profile-avatar','X-Service-Resource':id},credentials:'omit',redirect:'error'});if(!response.ok)throw Error();return URL.createObjectURL(await response.blob());})());
 void publicAvatars.get(id).then(url=>{if(image.isConnected)image.src=url;}).catch(()=>publicAvatars.delete(id));
}
export function showAccount(session){
 const menu=document.querySelector('#account-menu');if(!menu)return;
 const identity=document.querySelector('#identity'),admin=document.querySelector('#admin-link');menu.hidden=!session.user;admin.hidden=!session.isAdmin;identity.setAttribute('aria-label',messages(document.documentElement.lang).accountMenu);
 if(!session.user){menu.open=false;document.querySelector('#menu-name').textContent='';document.querySelector('#menu-login').textContent='';}
 else{const name=session.profile?.displayName||session.user.name||session.user.login;document.querySelector('#menu-name').textContent=name;document.querySelector('#menu-login').textContent='@'+session.user.login;identity.querySelector('.account-label').textContent=name;}
 if(avatarUser===session.user?.id)return;
 avatarUser=session.user?.id;const current=++generation;if(avatarUrl)URL.revokeObjectURL(avatarUrl);avatarUrl=null;const slot=identity.querySelector('.account-avatar-slot');slot.replaceChildren();if(!session.user)return;
 const image=document.createElement('img');image.className='user-avatar';image.width=36;image.height=36;image.alt='';image.src='/brand/bear-favicon.52039e84b2f38015.png';slot.append(image);
 void (async()=>{try{const response=await fetch('/api',{headers:{'X-Service-Action':'avatar'},credentials:'same-origin',redirect:'error'});if(!response.ok)return;const blob=await response.blob();if(current!==generation)return;avatarUrl=URL.createObjectURL(blob);image.src=avatarUrl;document.dispatchEvent(new CustomEvent('ishare:avatar',{detail:avatarUrl}));}catch{}})();
}
export function bindAccount({client,refresh,notice}){
 const menu=document.querySelector('#account-menu');if(!menu)return;
 const summary=document.querySelector('#identity'),items=()=>[...menu.querySelectorAll('.account-dropdown a,.account-dropdown button')].filter(node=>!node.hidden);
 const close=(focus=false)=>{menu.open=false;if(focus)summary.focus();};
 menu.addEventListener('toggle',()=>summary.setAttribute('aria-expanded',String(menu.open)));
 document.addEventListener('click',event=>{if(!menu.contains(event.target))close();});
 menu.addEventListener('focusout',()=>setTimeout(()=>{if(!menu.contains(document.activeElement))close();},0));
 menu.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close(true);}else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();menu.open=true;const nodes=items(),index=nodes.indexOf(document.activeElement),step=event.key==='ArrowUp'?-1:1;nodes[event.key==='Home'?0:event.key==='End'?nodes.length-1:index===-1?(step===1?0:nodes.length-1):(index+step+nodes.length)%nodes.length]?.focus();}});
 document.querySelector('#logout').addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;try{await client.request('logout',{body:{}});close();await refresh();const target=document.querySelector('#publisher-login')||document.querySelector('.topbar nav a');target?.focus();}catch(error){notice(error);}finally{button.disabled=false;}});
}
window.addEventListener('pagehide',()=>{generation++;if(avatarUrl)URL.revokeObjectURL(avatarUrl);for(const promise of publicAvatars.values())void promise.then(url=>URL.revokeObjectURL(url)).catch(()=>{});publicAvatars.clear();},{once:true});
