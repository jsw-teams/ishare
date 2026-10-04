import {messages} from './i18n.js';
export function confirmAction(message){
 const t=messages(document.documentElement.lang);
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog'),text=document.createElement('p'),actions=document.createElement('div'),cancel=document.createElement('button'),accept=document.createElement('button');
  dialog.className='action-dialog';dialog.setAttribute('aria-label',message);text.textContent=message;actions.className='dialog-actions';cancel.type=accept.type='button';cancel.textContent=t.keepContent;accept.textContent=t.confirmDelete;accept.className='button-danger';actions.append(cancel,accept);dialog.append(text,actions);document.body.append(dialog);
  const finish=value=>{dialog.close();dialog.remove();resolve(value);};cancel.addEventListener('click',()=>finish(false));accept.addEventListener('click',()=>finish(true));dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});dialog.showModal();cancel.focus();
 });
}
