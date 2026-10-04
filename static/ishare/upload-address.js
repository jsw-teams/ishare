export function uploadAddress(value,kind){
 const reject=reason=>{const error=new Error('invalid_upload_url');error.reason=reason;throw error;};
 let url;try{url=new URL(value);}catch{reject(value?'invalid_url':'missing_url');}
 const host=kind==='image'?'upload.imagedelivery.net':'upload.cloudflarestream.com';
 if(url.protocol!=='https:')reject('scheme');
 if(url.hostname!==host){const family=url.hostname==='api.cloudflare.com'?'api':/^customer-[a-z0-9]+\.cloudflarestream\.com$/.test(url.hostname)?'customer':url.hostname==='upload.cloudflarestream.com'?'stream_upload':'other';reject('host_'+family);}
 if(url.port||url.username||url.password||url.hash)reject('url_components');
 return url;
}
