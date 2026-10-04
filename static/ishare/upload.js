import {uploadAddress} from './upload-address.js';
function failure(code,status){const error=new Error(code);if(status)error.status=status;return error;}
function imageUpload(url,file,onProgress,signal,createRequest){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new DOMException('Upload paused','AbortError'));return;}
    const xhr=createRequest(),abort=()=>xhr.abort(),finish=(error)=>{signal?.removeEventListener('abort',abort);if(error)reject(error);else{onProgress(1);resolve();}};
    xhr.open('POST',url.href);xhr.withCredentials=false;xhr.responseType='json';
    xhr.upload.addEventListener('progress',event=>{if(event.lengthComputable&&event.total>0)onProgress(Math.min(1,event.loaded/event.total));});
    xhr.addEventListener('load',()=>{if(xhr.status<200||xhr.status>=300||xhr.response?.success!==true||xhr.responseURL!==url.href)finish(failure('upload_failed',xhr.status));else finish();});
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
  const readOffset=response=>{const raw=response.headers.get('Upload-Offset'),n=Number(raw);if(!/^\d+$/.test(raw||'')||!Number.isSafeInteger(n)||n<0||n>file.size)throw failure('invalid_upload_offset',response.status);return n;};
  const head=async()=>{const response=await send({method:'HEAD',headers:{'Tus-Resumable':'1.0.0'}});if(!response.ok)throw failure('upload_failed',response.status);return readOffset(response);};
  // Every grant is new. TUS creation establishes offset zero; HEAD is needed only after an interrupted PATCH.
  onProgress(0);
  while(offset<file.size){
    if(signal?.aborted)throw new DOMException('Upload paused','AbortError');
    try{
      const end=Math.min(offset+10*1024*1024,file.size);
      const response=await send({method:'PATCH',headers:{'Tus-Resumable':'1.0.0','Upload-Offset':String(offset),'Content-Type':'application/offset+octet-stream'},body:file.slice(offset,end)});
      if(!response.ok)throw failure('upload_failed',response.status);const next=readOffset(response);
      if(next!==end)throw failure('invalid_upload_offset',response.status);offset=next;attempts=0;onProgress(offset/file.size);
    }catch(error){
      if(signal?.aborted||error.message==='invalid_upload_offset'||[400,401,403,404,410,413,415,422].includes(error.status)||++attempts>3)throw error;
      await new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new DOMException('Upload cancelled','AbortError'));},timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},attempts*1000);signal?.addEventListener('abort',abort,{once:true});});offset=await head();onProgress(offset/file.size);
    }
  }
}
