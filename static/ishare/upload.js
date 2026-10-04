import {uploadAddress} from './upload-address.js';
function imageUpload(url,file,onProgress,signal,createRequest){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new DOMException('Upload paused','AbortError'));return;}
    const xhr=createRequest(),abort=()=>xhr.abort(),finish=(error)=>{signal?.removeEventListener('abort',abort);if(error)reject(error);else{onProgress(1);resolve();}};
    xhr.open('POST',url.href);xhr.withCredentials=false;xhr.responseType='json';
    xhr.upload.addEventListener('progress',event=>{if(event.lengthComputable&&event.total>0)onProgress(Math.min(1,event.loaded/event.total));});
    xhr.addEventListener('load',()=>{if(xhr.status<200||xhr.status>=300||xhr.response?.success!==true||xhr.responseURL!==url.href)finish(new Error('upload_failed'));else finish();});
    xhr.addEventListener('error',()=>finish(new Error('upload_failed')));
    xhr.addEventListener('abort',()=>finish(new DOMException('Upload paused','AbortError')));
    signal?.addEventListener('abort',abort,{once:true});
    const body=new FormData();body.set('file',file,file.name);onProgress(0);xhr.send(body);
  });
}
export async function uploadFile(file,grant,onProgress=()=>{},{signal,request=fetch,createRequest=()=>new XMLHttpRequest()}={}) {
  if(!['post','tus'].includes(grant.protocol))throw new Error('invalid_upload_protocol');
  const url=uploadAddress(grant.uploadUrl,grant.protocol==='post'?'image':'video');
  const send=options=>request(url,{...options,credentials:'omit',redirect:'error',signal});
  if(grant.protocol==='post'){
    await imageUpload(url,file,onProgress,signal,createRequest);return;
  }
  let offset=0,attempts=0;
  const head=async()=>{const response=await send({method:'HEAD',headers:{'Tus-Resumable':'1.0.0'}});if(!response.ok)throw new Error('upload_failed');const n=Number(response.headers.get('Upload-Offset'));if(!Number.isSafeInteger(n)||n<0||n>file.size)throw new Error('invalid_upload_offset');const length=Number(response.headers.get('Upload-Length'));if(length!==file.size)throw new Error('different_file');return n;};
  offset=await head();onProgress(offset/file.size);
  while(offset<file.size){
    if(signal?.aborted)throw new DOMException('Upload paused','AbortError');
    try{
      const end=Math.min(offset+10*1024*1024,file.size);
      const response=await send({method:'PATCH',headers:{'Tus-Resumable':'1.0.0','Upload-Offset':String(offset),'Content-Type':'application/offset+octet-stream'},body:file.slice(offset,end)});
      if(!response.ok)throw new Error('upload_failed');const next=Number(response.headers.get('Upload-Offset'));
      if(!Number.isSafeInteger(next)||next!==end)throw new Error('invalid_upload_offset');offset=next;attempts=0;onProgress(offset/file.size);
    }catch(error){
      if(signal?.aborted||++attempts>3)throw error;
      await new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new DOMException('Upload cancelled','AbortError'));},timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},attempts*1000);signal?.addEventListener('abort',abort,{once:true});});offset=await head();
    }
  }
}
