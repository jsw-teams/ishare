import {messages} from './i18n.js';
import {serviceClient,showAccount,bindAccount} from './account.js';
const dictionary=messages(document.documentElement.lang),t=key=>dictionary[key]||key,client=serviceClient('appeal'),form=document.querySelector('#appeal-form'),status=document.querySelector('#status');
const notice=()=>{status.className='feedback feedback-error';status.textContent=t('error');};
async function refresh(){status.className='feedback data-loading';status.textContent=t('loading');try{
 const session=await client.read();showAccount(session);const restricted=!!session.user&&!session.canPublish&&!session.account?.erasing;
 document.querySelector('#appeal-gate').hidden=!!session.user;document.querySelector('#appeal-clear').hidden=!session.user||restricted;document.querySelector('#appeal-center').hidden=!restricted;
 document.querySelector('#restriction-reason').textContent=session.account?.note||t('restrictionHint');const list=document.querySelector('#appeal-history');list.replaceChildren();
 if(restricted)for(const request of session.initial.rights.items){const row=document.createElement('article');row.className='appeal-record';row.textContent=request.message+' / '+t(request.state==='open'?'pending':'resolved')+(request.response?' / '+request.response:'');list.append(row);}
 status.textContent='';
 }catch{notice();}finally{status.classList.remove('data-loading');}}
form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('button');button.disabled=true;try{await client.request('request-right',{body:{kind:'appeal',message:form.elements.message.value}});form.reset();await refresh();status.className='feedback feedback-success';status.textContent=t('appealSent');}catch{notice();}finally{button.disabled=false;}});
bindAccount({client,refresh,notice});void refresh();
