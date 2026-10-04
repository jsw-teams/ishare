export function videoMetadata(file){
 const video=document.createElement('video'),url=URL.createObjectURL(file);
 let resolveMetadata,finished=false;
 const metadata=new Promise(resolve=>{resolveMetadata=resolve;});
 function finish(){
  if(finished)return;finished=true;clearTimeout(timeout);const duration=Math.ceil(video.duration);
  resolveMetadata(Number.isFinite(duration)&&duration>0?duration:null);
  video.onloadedmetadata=video.onerror=null;video.removeAttribute('src');video.load();URL.revokeObjectURL(url);
 }
 const timeout=setTimeout(finish,10000);video.preload='metadata';video.muted=true;video.playsInline=true;video.onloadedmetadata=finish;video.onerror=finish;video.src=url;
 return {metadata,dispose:finish};
}
