export function uploadAddress(value,kind){
 let url;try{url=new URL(value);}catch{throw new Error('invalid_upload_url');}
 const host=kind==='image'?'upload.imagedelivery.net':'upload.videodelivery.net';
 if(url.protocol!=='https:'||url.hostname!==host||url.port||url.username||url.password||url.hash)throw new Error('invalid_upload_url');
 return url;
}
