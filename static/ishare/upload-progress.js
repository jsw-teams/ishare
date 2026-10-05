import {icons} from './icons.js';
export function uploadProgress(t){
 const root=document.querySelector('#upload-status'),bar=document.querySelector('#progress'),stage=document.querySelector('#upload-stage'),current=document.querySelector('#upload-current'),percent=document.querySelector('#upload-percent'),bytes=document.querySelector('#upload-bytes'),result=document.querySelector('#upload-result'),cancel=document.querySelector('#cancel'),icon=document.querySelector('#upload-state-icon');
 const dismiss=document.querySelector('#upload-dismiss');dismiss.addEventListener('click',()=>root.close());
 cancel.setAttribute('aria-label',t('cancelUpload'));let entries=[],showAttachments=true;
 const size=entry=>entry.file?.size??entry.bytes??entry.record?.bytes??0;
 const format=value=>{const unit=value>=1073741824?'GB':value>=1048576?'MB':'KB',scale=unit==='GB'?1073741824:unit==='MB'?1048576:1024;return new Intl.NumberFormat(document.documentElement.lang,{maximumFractionDigits:1}).format(value/scale)+' '+unit;};
 function measure(){const total=entries.reduce((sum,entry)=>sum+size(entry),0),loaded=entries.reduce((sum,entry)=>sum+size(entry)*(entry.record||entry.uploaded?1:entry.loaded||0),0);bytes.textContent=total?t('sentBytes')+' '+format(loaded)+' / '+format(total):'';percent.hidden=!total;if(total){bar.value=loaded/total;percent.textContent=Math.round(loaded/total*100)+'%';}else bar.removeAttribute('value');}
 function attachment(index,phase,value){const entry=entries[index];if(!entry)return;entry.phase=phase;if(value!==undefined)entry.loaded=value;const tile=showAttachments?document.querySelector('#attachment-preview')?.children[index]:null,state=tile?.querySelector('.attachment-state');if(tile){tile.dataset.state=phase;if(state){state.hidden=false;state.textContent=phase==='uploading'?t('progress')+' '+Math.round((entry.loaded||0)*100)+'%':t(phase==='ready'?'uploadComplete':phase==='retry'?'pending':'processing');}}}
 return {
  close(){root.close();},
  start(items,attachments=true){entries=items;showAttachments=attachments;root.hidden=false;bar.hidden=false;root.dataset.state='active';result.textContent='';cancel.hidden=false;cancel.disabled=false;dismiss.hidden=true;stage.textContent=t('preparingUpload');current.textContent='';icon.innerHTML=icons.upload;for(const [index,entry]of entries.entries())if(entry.record)attachment(index,'ready');measure();if(!root.open)root.showModal();cancel.focus({preventScroll:true});},
  stage(key,index){stage.textContent=t(key);const entry=entries[index];current.textContent=entry?t('attachmentNumber')+' '+(index+1)+' / '+entries.length+' — '+(entry.file?.name||entry.title||entry.record?.title||''):'';if(entry&&key==='confirmingMedia')attachment(index,'processing');measure();},
  transfer(index,value){attachment(index,'uploading',value);measure();},
  ready(index){attachment(index,'ready');measure();},
  finish(success,message,title='publishedPost'){root.dataset.state=success?'success':'error';cancel.hidden=true;cancel.disabled=false;dismiss.hidden=false;stage.textContent=t(success?title:'uploadFailed');result.textContent=message;icon.innerHTML=icons[success?'success':'error'];if(success){bar.value=1;if(!percent.hidden)percent.textContent='100%';}else{for(const [index,entry]of entries.entries())if(['uploading','processing'].includes(entry.phase))attachment(index,'retry');if(!entries.some(entry=>entry.file||entry.bytes))bar.hidden=true;}},
 };
}
