import {messages} from './i18n.js';
import {serviceClient,showAccount,bindAccount} from './account.js';
import {adminPanel} from './admin.js';
const dictionary=messages(document.documentElement.lang),t=key=>dictionary[key]||key,status=document.querySelector('#status'),client=serviceClient(),api=client.request;
const notice=()=>{status.className='feedback feedback-error';status.textContent=t('error');};
async function refresh(){try{const session=await client.read();showAccount(session);const gate=document.querySelector('#admin-gate');gate.hidden=!!session.isAdmin;gate.textContent=t(session.user?'adminDenied':'adminLogin');management.update(session);}catch{notice();}}
const management=adminPanel({api,t,notice,refresh});
bindAccount({client,refresh,notice});
void refresh();
