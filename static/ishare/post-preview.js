export function postEmbedPreview(root,record,label){
 root.replaceChildren();let url;try{url=new URL(record.embedUrl||'/embed/'+record.id,location.origin);}catch{return;}
 if(url.origin!==location.origin||!/^\/embed\/[a-f0-9]{32}$/.test(url.pathname)||url.search||url.hash)return;
 const frame=document.createElement('iframe');frame.src=url.href;frame.title=label;frame.referrerPolicy='no-referrer';frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-presentation');frame.allow='fullscreen';frame.allowFullscreen=true;root.append(frame);
}
