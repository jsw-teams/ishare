import {open,readFile,stat} from 'node:fs/promises';
import {basename,extname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as pause} from 'node:timers/promises';
import {uploadAddress} from '../../static/ishare/upload-address.js';
const types={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.avif':'image/avif','.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime','.mkv':'video/x-matroska'};
const error=code=>new Error(/^[a-z_]{1,64}$/.test(code||'')?code:'upload_failed');
export async function uploadWithKey({files,key,caption='',origin='https://ishare.js.gripe',durationSeconds,request=fetch,signal,onProgress=()=>{}}){
 const site=new URL(origin);if(site.protocol!=='https:'||site.username||site.password||site.pathname!=='/'||site.search||site.hash)throw error('invalid_origin');
 if(!/^ishare_[\w-]{43}$/.test(key||''))throw error('invalid_api_key');if(!files?.length||files.length>50)throw error('invalid_files');
 const api=async(action,resource,body)=>{const response=await request(new URL('/api',site),{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,'X-Service-Action':action,...(resource?{'X-Service-Resource':resource}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal});if(!response.ok)throw error((await response.json().catch(()=>null))?.error);return response;};
 const entries=[],postId=crypto.randomUUID().replaceAll('-','');let completed=false;
 try{
  for(const file of files){
   signal?.throwIfAborted();const mime=types[extname(file).toLowerCase()];if(!mime)throw error('unsupported_media_type');const kind=mime.startsWith('image/')?'image':'video',info=await stat(file);if(!info.isFile())throw error('invalid_file');let duration=0;
   if(kind==='video'){if(durationSeconds!==undefined)duration=Math.ceil(durationSeconds);else{try{const {stdout}=await promisify(execFile)('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',resolve(file)]);duration=Math.ceil(Number(stdout));}catch{throw error('video_duration_required');}}if(!Number.isSafeInteger(duration)||duration<1)throw error('invalid_duration');}
   const entry={id:crypto.randomUUID().replaceAll('-',''),file};entries.push(entry);
   const grant=await(await api('create-upload',entry.id,{kind,title:basename(file).slice(0,200),bytes:info.size,mime,duration})).json(),url=uploadAddress(grant.uploadUrl,kind);
   if(kind==='image'){const form=new FormData();form.append('file',new Blob([await readFile(file)],{type:mime}),basename(file));const response=await request(url,{method:'POST',body:form,redirect:'error',signal});if(!response.ok||(await response.json()).success!==true)throw error('upload_failed');onProgress({file:basename(file),loaded:info.size,total:info.size});}
   else{
    if(grant.protocol!=='tus')throw error('invalid_upload_protocol');const handle=await open(file,'r');let offset=0,retries=0;
    try{while(offset<info.size){const chunk=Buffer.alloc(Math.min(10*1024*1024,info.size-offset)),{bytesRead}=await handle.read(chunk,0,chunk.length,offset);if(bytesRead!==chunk.length)throw error('file_changed');
     try{const response=await request(url,{method:'PATCH',headers:{'Tus-Resumable':'1.0.0','Upload-Offset':String(offset),'Content-Type':'application/offset+octet-stream'},body:chunk,redirect:'error',signal});if(!response.ok)throw error('upload_failed');const next=Number(response.headers.get('Upload-Offset'));if(next!==offset+bytesRead)throw error('invalid_upload_offset');offset=next;retries=0;onProgress({file:basename(file),loaded:offset,total:info.size});}
     catch(failure){if(signal?.aborted||++retries>3||failure.message==='file_changed')throw failure;await pause(retries*1000,undefined,{signal});const response=await request(url,{method:'HEAD',headers:{'Tus-Resumable':'1.0.0'},redirect:'error',signal});const raw=response.headers.get('Upload-Offset'),next=Number(raw);if(!response.ok||!/^\d+$/.test(raw||'')||!Number.isSafeInteger(next)||next<0||next>info.size)throw error('invalid_upload_offset');offset=next;}
    }}finally{await handle.close();}
   }
  }
  for(const entry of entries){for(;;){const data=await(await api('publish',entry.id,{})).json();if(data.state!=='processing')break;await pause(3000,undefined,{signal});}}
  const body={caption,mediaIds:entries.map(entry=>entry.id),listed:false};let response;
  for(let attempt=0;;attempt++){try{response=await api('create-post',postId,body);break;}catch(failure){if(signal?.aborted||attempt>=2||failure.message==='api_visibility_restricted')throw failure;await pause(1000,undefined,{signal});}}
  if(!/^text\/markdown\b/.test(response.headers.get('Content-Type')||''))throw error('invalid_publication_response');const markdown=await response.text();completed=true;return markdown;
 }finally{
  if(!completed)for(const entry of entries){try{await request(new URL('/api',site),{method:'POST',headers:{Authorization:'Bearer '+key,'X-Service-Action':'discard-upload','X-Service-Resource':entry.id,'Content-Type':'application/json'},body:'{}',redirect:'error',signal:AbortSignal.timeout(15000)});}catch{/* Existing reservation cleanup remains scheduled server-side. */}}
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const controller=new AbortController();process.once('SIGINT',()=>controller.abort());
 try{const markdown=await uploadWithKey({files:process.argv.slice(2),key:process.env.ISHARE_API_KEY,origin:process.env.ISHARE_ORIGIN||'https://ishare.js.gripe',caption:process.env.ISHARE_CAPTION||'',durationSeconds:process.env.ISHARE_VIDEO_SECONDS?Number(process.env.ISHARE_VIDEO_SECONDS):undefined,signal:controller.signal,onProgress:({file,loaded,total})=>process.stderr.write(file+': '+loaded+'/'+total+' bytes\n')});process.stdout.write(markdown);}catch(failure){process.stderr.write(/^[a-z_]{1,64}$/.test(failure.message)?failure.message+'\n':'upload_failed\n');process.exitCode=1;}
}
