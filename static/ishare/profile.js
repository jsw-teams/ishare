import {messages} from './i18n.js';
import {serviceClient,showAccount,bindAccount} from './account.js';
import {rightsPanel} from './rights.js';
const dictionary=messages(document.documentElement.lang),t=key=>dictionary[key]||key,client=serviceClient(),api=client.request,form=document.querySelector('#profile-form'),status=document.querySelector('#status');
let session=null;
const notice=()=>{status.className='feedback feedback-error';status.textContent=t('error');};
function preview(){document.querySelector('#preview-name').textContent=form.elements.displayName.value;document.querySelector('#preview-bio').textContent=form.elements.bio.value;const avatar=document.querySelector('#identity img');if(avatar)document.querySelector('#profile-avatar').src=avatar.src;}
async function refresh(){try{session=await client.read();showAccount(session);document.querySelector('#profile-gate').hidden=!!session.user;document.querySelector('#profile-center').hidden=!session.user;form.querySelectorAll('input,textarea,button').forEach(node=>node.disabled=!session.user||!!session.account?.erasing);if(session.user){const profile=session.profile||{displayName:session.user.name||session.user.login,bio:''};form.elements.displayName.value=profile.displayName;form.elements.bio.value=profile.bio;document.querySelector('#public-profile-link').href='/u/'+session.user.id;preview();}rights.update(session);}catch{notice();}}
form.addEventListener('input',preview);document.addEventListener('ishare:avatar',event=>document.querySelector('#profile-avatar').src=event.detail);
form.addEventListener('submit',async event=>{event.preventDefault();const save=form.querySelector('button');save.disabled=true;save.textContent=t('saving');form.setAttribute('aria-busy','true');try{await api('set-profile',{body:{displayName:form.elements.displayName.value,bio:form.elements.bio.value}});await refresh();status.className='feedback feedback-success';status.textContent=t('profileSaved');}catch{notice();}finally{save.disabled=!!session?.account?.erasing;save.textContent=t('save');form.removeAttribute('aria-busy');}});
const rights=rightsPanel({api,t,notice,refresh});bindAccount({client,refresh,notice});void refresh();
