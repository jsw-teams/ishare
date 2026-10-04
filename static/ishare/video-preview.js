export async function videoPreview(file){
 const video=document.createElement('video'),url=URL.createObjectURL(file);
 video.muted=true;video.preload='auto';
 try{return await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(new Error('unsupported')),10000);
  const finish=value=>{clearTimeout(timeout);resolve(value);};
  video.onerror=()=>{clearTimeout(timeout);reject(new Error('unsupported'));};
  video.onloadedmetadata=()=>{if(!Number.isFinite(video.duration)){clearTimeout(timeout);reject(new Error('unsupported'));}};
  video.onloadeddata=()=>{const duration=Math.ceil(video.duration);if(!Number.isFinite(duration)||duration<1)return;const canvas=document.createElement('canvas');canvas.width=480;canvas.height=Math.round(480*video.videoHeight/video.videoWidth)||270;canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);canvas.toBlob(blob=>finish({duration,preview:blob?URL.createObjectURL(blob):null}),'image/webp',.8);};
  video.src=url;
 });}finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
}
