import {icons} from './icons.js';
import {messages} from './i18n.js';

/** One reusable share sheet for published posts, cards and embedded viewers. */
export function openShare(record,opener=document.activeElement){
  const t=messages(document.documentElement.lang);
  const dialog=document.createElement('dialog');dialog.className='share-sheet';
  const heading=document.createElement('h2');heading.id='share-sheet-title';heading.textContent=t.sharePost;
  dialog.setAttribute('aria-labelledby',heading.id);
  const close=document.createElement('button');close.type='button';close.className='share-sheet-close';close.setAttribute('aria-label',t.close);close.innerHTML=icons.close;
  const status=document.createElement('p');status.className='share-sheet-status';status.setAttribute('role','status');
  dialog.append(heading,close);
  const options=[['shareLink',record.shareUrl],['embed',record.embedCode],['markdown',record.markdown]].filter(([,value])=>value);
  const tabs=document.createElement('div');tabs.className='share-options';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label',t.sharePost);
  const panel=document.createElement('div');panel.id='share-sheet-panel';panel.setAttribute('role','tabpanel');
  const label=document.createElement('label');label.htmlFor='share-sheet-value';
  const field=document.createElement('textarea');field.id='share-sheet-value';field.readOnly=true;field.rows=4;field.spellcheck=false;
  const copy=document.createElement('button');copy.type='button';copy.className='button-primary';copy.textContent=t.copy;
  const select=index=>{for(const [i,tab]of [...tabs.children].entries()){tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;}field.value=options[index][1];label.textContent=t[options[index][0]];panel.setAttribute('aria-labelledby','share-option-'+index);status.textContent='';};
  options.forEach(([key],index)=>{const tab=document.createElement('button');tab.type='button';tab.id='share-option-'+index;tab.setAttribute('role','tab');tab.setAttribute('aria-controls',panel.id);tab.textContent=t[key];tab.addEventListener('click',()=>select(index));tab.addEventListener('keydown',event=>{if(['ArrowRight','ArrowLeft','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?options.length-1:(index+(event.key==='ArrowRight'?1:-1)+options.length)%options.length;select(next);tabs.children[next].focus();}});tabs.append(tab);});
  copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(field.value);status.textContent=t.copied;}catch{field.focus();field.select();status.textContent=t.copyManually;}});
  panel.append(label,field,copy);dialog.append(tabs,panel,status);
  const dispose=()=>{dialog.remove();if(opener?.isConnected)opener.focus({preventScroll:true});};
  close.addEventListener('click',()=>dialog.close());dialog.addEventListener('close',dispose,{once:true});
  document.body.append(dialog);select(0);dialog.showModal();close.focus();
}

for(const button of document.querySelectorAll('[data-share-post]')){
  const data=document.getElementById(button.dataset.sharePost);
  if(data)button.addEventListener('click',()=>openShare(JSON.parse(data.textContent),button));
}
