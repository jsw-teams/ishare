import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {extname} from 'node:path';
import {chromium} from 'playwright';
import {handle} from '../backend/cloudflare/service.js';
import {repository,environment,login,request} from './helpers.mjs';

for(const scenario of [{name:'image then video',order:['image','video']},{name:'video then image',order:['video','image']},{name:'browser cannot decode metadata',order:['image','video'],preview:'metadata'},{name:'video upload rejected',order:['image','video'],rejected:'video'},{name:'image rejected after video completes',order:['image','video'],rejected:'image'}])test('mixed post: '+scenario.name,async()=>{
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})}),{store,database}=repository(),env={...environment(store),OWNER_GITHUB_ID:'99',GITHUB_CLIENT_ID:'fixture',GITHUB_CLIENT_SECRET:'fixture'},owner=await login(store),context=await browser.newContext({locale:'zh-CN',viewport:{width:390,height:844}}),resources=new Map(),errors=[],logs=[],actions=[],methods=[];
 const image=await readFile('content/assets/brand/bear-icon.3754101e8d6380da.png'),video=await readFile('tests/fixtures/preview.webm'),ctx={waitUntil(){}};
 const provider=async(address,options={})=>{
  const url=new URL(address),method=options.method||'GET';assert.equal(url.hostname,'api.cloudflare.com');assert.equal(options.headers.Authorization,'Bearer '+env.MEDIA_API_TOKEN);
  if(method==='DELETE'){resources.delete(url.pathname.split('/').at(-1));return Response.json({success:true,result:null});}
  if(url.pathname.endsWith('/direct_upload')){const meta=JSON.parse(options.body.get('metadata'));assert.equal(options.body.get('creator'),'ishare:42');const id='image-'+resources.size;resources.set(id,{id,app:meta.ishare,kind:'image',received:false});return Response.json({success:true,result:{id,uploadURL:'https://upload.imagedelivery.net/'+id}});}
  if(method==='POST'&&url.searchParams.get('direct_user')==='true'){
   const metadata=Object.fromEntries(options.headers['Upload-Metadata'].split(',').map(part=>{const [key,value]=part.split(' ');return [key,value?atob(value):''];})),id='video-'+resources.size;
   assert.equal(options.headers['Upload-Creator'],'ishare:42');assert.equal(Number(options.headers['Upload-Length']),video.length);assert.equal(Number(metadata.maxDurationSeconds),scenario.preview?600:1);assert.ok(Object.hasOwn(metadata,'requiresignedurls'));
   resources.set(id,{id,app:metadata.name,kind:'video',received:false});return new Response(null,{status:201,headers:{Location:'https://upload.videodelivery.net/'+id,'stream-media-id':id}});
  }
  const item=resources.get(url.pathname.split('/').at(-1));assert.ok(item);
  return Response.json({success:true,result:item.kind==='image'?{id:item.id,uploaded:item.received?'2026-10-04':null,draft:!item.received,requireSignedURLs:true,meta:{ishare:item.app}}:{uid:item.id,readyToStream:item.received,requireSignedURLs:true,duration:1,status:{state:item.received?'ready':'inprogress'}}});
 };
 try{
  await context.addCookies([{name:'__Host-ishare-session',value:owner.cookie.split('=')[1],url:'https://ishare.js.gripe',httpOnly:true,secure:true,sameSite:'Lax'}]);
  if(scenario.preview)await context.addInitScript(()=>{
   const create=document.createElement.bind(document);document.createElement=(tag,...args)=>{const node=create(tag,...args);if(tag==='video'){
    const descriptor=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'src');Object.defineProperty(node,'src',{get:()=>descriptor.get.call(node),set(value){if(String(value).startsWith('blob:')){queueMicrotask(()=>node.dispatchEvent(new Event('error')));}else descriptor.set.call(node,value);}});
   }return node;};
  });
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.hostname==='upload.imagedelivery.net'){const item=resources.get(url.pathname.slice(1));assert.equal(req.method(),'POST');assert.match(req.headers()['content-type'],/^multipart/);if(scenario.rejected==='image')return route.fulfill({status:403,contentType:'application/json',body:'{"success":false}'});item.received=true;return route.fulfill({contentType:'application/json',body:'{"success":true}'});}
   if(url.hostname==='upload.videodelivery.net'){
    methods.push(req.method());assert.equal(req.method(),'PATCH');const item=resources.get(url.pathname.slice(1));assert.equal(req.headers()['upload-offset'],'0');assert.equal(req.headers()['tus-resumable'],'1.0.0');assert.deepEqual(req.postDataBuffer(),video);
    if(scenario.rejected==='video')return route.fulfill({status:403,body:''});item.received=true;return route.fulfill({status:204,headers:{'Upload-Offset':String(video.length),'Access-Control-Expose-Headers':'Upload-Offset'},body:''});
   }
   assert.equal(url.origin,'https://ishare.js.gripe');
   if(url.pathname==='/api'){
    assert.equal(url.search,'');const headers=await req.allHeaders(),action=headers['x-service-action'];actions.push(action);
    if(['avatar','profile-avatar'].includes(action))return route.fulfill({contentType:'image/png',body:image});
    const response=await handle(new Request(req.url(),{method:req.method(),headers,body:req.method()==='POST'?req.postData():undefined}),env,ctx,{requestProvider:provider});
    return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
   }
   if(url.pathname.startsWith('/i/')||url.pathname.startsWith('/v/'))return route.fulfill({contentType:'image/png',body:image});
   const path=url.pathname.endsWith('/')?url.pathname.slice(1)+'index.html':url.pathname.slice(1),types={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png'};
   return route.fulfill({contentType:types[extname(path)]||'text/html',body:await readFile('dist/'+path)});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='warning')logs.push(message.text());});
  await page.goto('https://ishare.js.gripe/mine/');await page.waitForFunction(()=>!document.querySelector('#publish-form fieldset').disabled);
  await page.locator('[name=caption]').fill('一条帖子里的图片和视频');await page.locator('[name=file]').setInputFiles(scenario.order.map(kind=>kind==='image'?{name:'photo.png',mimeType:'image/png',buffer:image}:{name:'clip.webm',mimeType:'video/webm',buffer:video}));
  await page.waitForFunction(()=>document.querySelector('.video-preview-placeholder')?.textContent.includes('上传后'));assert.equal(await page.locator('.attachment-tile img').count(),1);assert.match(await page.locator('.attachment-tile').first().textContent(),/clip.webm/);
  await page.locator('#publish-form button[type=submit]').click();await page.waitForFunction(()=>['success','error'].includes(document.querySelector('#upload-status').dataset.state)&&!document.querySelector('#publish-form fieldset').disabled);
  assert.deepEqual(methods,['PATCH']);assert.deepEqual(errors,[]);
  if(scenario.rejected){
   assert.equal(await page.locator('#upload-status').getAttribute('data-state'),'error');const result=await page.locator('#upload-result').textContent();assert.match(result,scenario.rejected==='image'?/photo.png/:/clip.webm/);assert.match(result,/403/);assert.match(result,/附件已移除/);assert.match(result,/上传/);assert.equal(actions.filter(action=>action==='create-post').length,0);assert.equal(actions.filter(action=>action==='discard-upload').length,scenario.rejected==='image'?2:1);assert.equal(resources.size,0);assert.equal(store.usage('42',Math.floor(Date.now()/1000)).images,0);assert.equal(store.usage('42',Math.floor(Date.now()/1000)).videoSeconds,0);assert.equal(logs.length,1);assert.match(logs[0],/sendingMedia/);assert.doesNotMatch(logs[0],/https:|csrf|secret|Bearer|uploadUrl/);
  }else{
   assert.equal(await page.locator('#upload-status').getAttribute('data-state'),'success',await page.locator('#upload-result').textContent());assert.equal(actions.filter(action=>action==='create-post').length,1);assert.equal(await page.locator('#library article').count(),1);
   const history=store.history('42');assert.equal(history.items.length,1);const post=history.items[0];assert.equal(post.kind,'post');assert.equal(post.caption,'一条帖子里的图片和视频');assert.deepEqual(post.media.map(item=>item.kind),['video','image']);assert.equal(store.usage('42',Math.floor(Date.now()/1000)).videoSeconds,1);assert.equal(store.usage('42',Math.floor(Date.now()/1000)).images,1);assert.match(await page.getByLabel('Markdown 媒体链接').inputValue(),/\/i\//);assert.match(await page.getByLabel('Markdown 媒体链接').inputValue(),/\/s\//);
   const deleted=await handle(request('delete-post',{...owner,resource:post.id,body:{}}),env,ctx,{requestProvider:provider});assert.equal(deleted.status,202);
   for(const item of post.media){const removed=await handle(request('delete',{...owner,resource:item.id,body:{}}),env,ctx,{requestProvider:provider});assert.equal(removed.status,200);}assert.equal(resources.size,0);assert.equal(store.history('42').items.every(item=>item.state!=='published'),true);
  }
 }finally{await context.close();await browser.close();resources.clear();database.close();}
});
