export function serviceClient(){
 let session=null;
 async function request(action,{resource,body,signal}={}){
  const headers={'X-Service-Action':action};if(resource)headers['X-Service-Resource']=encodeURIComponent(resource);
  if(body){headers['Content-Type']='application/json';headers['X-CSRF-Token']=session?.csrf||'';}
  const response=await fetch('/api',{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,credentials:'same-origin',cache:'no-store',redirect:'error',signal});
  const data=await response.json();if(!response.ok){const error=new Error(data.error||'request_failed');error.status=response.status;throw error;}return data;
 }
 return {request,async read(){session=await request('session');return session;}};
}
let avatarUser=null,avatarUrl=null,generation=0;
export function showAccount(session){
 const identity=document.querySelector('#identity'),logout=document.querySelector('#logout'),admin=document.querySelector('#admin-link');
 logout.hidden=!session.user;admin.hidden=!session.isAdmin;identity.hidden=!session.user;
 if(avatarUser===session.user?.id)return;
 avatarUser=session.user?.id;const current=++generation;if(avatarUrl)URL.revokeObjectURL(avatarUrl);avatarUrl=null;identity.replaceChildren();
 if(!session.user)return;
 const image=document.createElement('img'),name=document.createElement('span');image.className='user-avatar';image.width=36;image.height=36;image.alt='';image.src='/brand/bear-favicon.52039e84b2f38015.png';name.textContent='@'+session.user.login;identity.append(image,name);
 void (async()=>{try{const response=await fetch('/api',{headers:{'X-Service-Action':'avatar'},credentials:'same-origin',redirect:'error'});if(!response.ok)return;const blob=await response.blob();if(current!==generation)return;avatarUrl=URL.createObjectURL(blob);image.src=avatarUrl;}catch{}})();
}
window.addEventListener('pagehide',()=>{generation++;if(avatarUrl)URL.revokeObjectURL(avatarUrl);},{once:true});
