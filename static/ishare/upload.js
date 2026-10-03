export async function uploadFile(file,grant,onProgress=()=>{},{signal,request=fetch}={}) {
  const url=new URL(grant.uploadUrl);
  if(url.protocol!=='https:'||url.username||url.password||!['upload.imagedelivery.net','upload.videodelivery.net'].includes(url.hostname))throw new Error('invalid_upload_url');
  const send=options=>request(url,{...options,credentials:'omit',redirect:'error',signal});
  if(grant.protocol==='post'){
    const body=new FormData();body.set('file',file,file.name);const response=await send({method:'POST',body});
    if(!response.ok)throw new Error('upload_failed');onProgress(1);return;
  }
  if(grant.protocol!=='tus'||url.hostname!=='upload.videodelivery.net')throw new Error('invalid_upload_protocol');
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
      await new Promise(resolve=>setTimeout(resolve,attempts*1000));offset=await head();
    }
  }
}
