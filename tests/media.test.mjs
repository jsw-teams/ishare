import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {extname} from 'node:path';
import {chromium} from 'playwright';
import {renderPage} from '../backend/cloudflare/views.js';
import {handle} from '../backend/cloudflare/service.js';
import {repository,environment,media,limits,now,login} from './helpers.mjs';

test('deleted Images and Stream resources return safe uncached errors and retain published records',async()=>{
 const {store,database}=repository(),env=environment(store),clock=now();
 try{
  await login(store);const image=media(),video=media({id:'b'.repeat(32),kind:'video',mime:'video/mp4',duration:10});
  for(const item of [image,video]){store.reserve(item,limits,clock);store.attach(item.id,'provider-id-123456789012345','https://upload.example/test',clock);store.publish(item.id,'42',item.duration,clock,'99');}
  for(const item of [image,video])for(const status of [404,410,500]){
   const response=await handle(new Request('https://ishare.js.gripe/'+(item.kind==='image'?'i/':'v/')+item.id+'/'+(item.kind==='image'?'original':'master.m3u8')),env,{waitUntil(){}},{requestUpstream:async()=>new Response('private provider URL',{status}),requestProvider:async()=>new Response('private provider URL',{status})});
   assert.equal(response.status,status===500?(item.kind==='video'?503:502):404);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.deepEqual(await response.json(),{error:status===500?(item.kind==='video'?'upstream_unavailable':'media_unavailable'):'media_missing'});assert.equal(store.get(item.id).state,'published');
  }
  const response=await handle(new Request('https://ishare.js.gripe/i/'+image.id+'/original'),env,{waitUntil(){}},{requestUpstream:async()=>{throw Error('upstream secret');}});assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'media_unavailable'});
 }finally{database.close();}
});

test('the local player renders icons, uses keyboard controls and stops when the gallery leaves a video',async()=>{
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})}),site='https://ishare.js.gripe',assets={ASSETS:{fetch:async req=>new Response(await readFile('dist'+new URL(req.url).pathname))}},author=JSON.stringify({id:'42',name:'Bear',login:'bear'}),base={caption:'',author,source_name:'',source_url:'',created:1,published:2,state:'published'},video={...base,id:'b'.repeat(32),kind:'video',title:'Video'},image={...base,id:'a'.repeat(32),kind:'image',title:'Image'},post={...base,id:'c'.repeat(32),kind:'post',media:[video,image]};
 try{for(const width of [320,1280]){
  const context=await browser.newContext({viewport:{width,height:844}});let playbackCalls=0,originalCalls=0;const errors=[];
  await context.route('**/*',async route=>{const url=new URL(route.request().url());assert.equal(url.origin,site);
   if(url.pathname==='/s/'+post.id){const response=await renderPage(post,assets,site,false,'zh-CN');return route.fulfill({headers:Object.fromEntries(response.headers),body:(await response.text()).replaceAll('data-source="'+site+'/v/'+video.id+'/master.m3u8"','data-type="native" data-source="/fixture.webm"').replaceAll('data-source=&quot;'+site+'/v/'+video.id+'/master.m3u8&quot;','data-type=&quot;native&quot; data-source=&quot;/fixture.webm&quot;')});}
   if(url.pathname.endsWith('/original'))originalCalls++;
   if(url.pathname==='/fixture.webm'){playbackCalls++;return route.fulfill({contentType:'video/webm',body:await readFile('tests/fixtures/preview.webm')});}
   if(url.pathname.startsWith('/v/')||url.pathname.startsWith('/i/')||url.pathname==='/api')return route.fulfill({contentType:'image/png',body:await readFile('content/assets/brand/bear-icon.3754101e8d6380da.png')});
   const types={'.js':'text/javascript','.css':'text/css','.webm':'video/webm','.png':'image/png','.svg':'image/svg+xml'};return route.fulfill({contentType:types[extname(url.pathname)]||'text/html',body:await readFile('dist'+url.pathname)});
  });const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(site+'/s/'+post.id);await page.locator('.plyr').waitFor();assert.equal(playbackCalls,0);await page.locator('video').evaluate(video=>{video.dataset.source='/fixture.webm';video.dataset.type='native';});
  assert.equal(await page.locator('.plyr__control--overlaid use').evaluate(use=>use.getBBox().width>0),true);
  await page.locator('.plyr__control--overlaid').click();await page.waitForFunction(()=>document.querySelector('video').currentTime>.1);await page.locator('video').evaluate(video=>video.pause());
  await page.locator('[data-plyr=mute]').click();assert.equal(await page.locator('video').evaluate(video=>video.muted),true);
  await page.locator('.plyr').focus();await page.keyboard.press('k');await page.waitForFunction(()=>document.querySelector('video').currentTime>.1,{},{timeout:5000});await page.keyboard.press('k');assert.equal(await page.locator('video').evaluate(video=>video.paused),true);assert.equal(playbackCalls,1);
  await page.locator('[data-plyr=settings]').first().click();await page.locator('.plyr__menu__container:not([hidden])').waitFor();assert.match(await page.locator('.plyr__menu__container').textContent(),/播放速度/);
  await page.locator('[data-next]').click();assert.equal(await page.locator('.plyr').count(),0);assert.equal(originalCalls,0);assert.equal(await page.locator('[data-save-original]').count(),0);await page.waitForFunction(()=>document.querySelector('img[data-media]').naturalWidth>0);await page.locator('img[data-media]').click();await page.locator('.image-lightbox[open]').waitFor();assert.equal(originalCalls,1);await page.getByRole('button',{name:'关闭图片',exact:true}).click();await page.locator('.image-lightbox').waitFor({state:'detached'});
  await page.locator('[data-previous]').click();await page.locator('.plyr').waitFor();assert.equal(playbackCalls,1);assert.equal(await page.locator('video').evaluate(video=>!video.hasAttribute('src')),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();}
});

test('share pages and embeds keep post text, show media errors and recover images only on explicit retry',async()=>{
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 const site='https://ishare.js.gripe',assets={ASSETS:{fetch:async req=>new Response(await readFile('dist'+new URL(req.url).pathname))}},author=JSON.stringify({id:'42',name:'Bear',login:'bear'});
 const child=(id,kind)=>({id,kind,title:kind,caption:'',author,source_name:'',source_url:'',created:1,published:2,state:'published'}),image=child('a'.repeat(32),'image'),video=child('b'.repeat(32),'video'),post={...child('c'.repeat(32),'post'),title:'My story',caption:'Keep this story visible.',media:[image,video]};
 try{
  for(const embedded of [false,true]){
   const context=await browser.newContext({viewport:{width:390,height:844}}),errors=[];let imageCalls=0,videoCalls=0;if(!embedded)await context.addInitScript(()=>{HTMLMediaElement.prototype.canPlayType=()=>'';});
   await context.route('**/*',async route=>{const url=new URL(route.request().url());assert.equal(url.origin,site);
    if(url.pathname==='/s/'+post.id||url.pathname==='/embed/'+post.id)return route.fulfill({contentType:'text/html',body:await(await renderPage(post,assets,site,embedded)).text()});
    if(url.pathname.startsWith('/i/')){imageCalls++;if(imageCalls===1)return route.fulfill({status:404,contentType:'application/json',headers:{'Cache-Control':'no-store'},body:'{"error":"media_missing"}'});return route.fulfill({contentType:'image/png',body:await readFile('content/assets/brand/bear-icon.3754101e8d6380da.png')});}
    if(url.pathname.endsWith('/thumbnail'))return route.fulfill({contentType:'image/png',body:await readFile('content/assets/brand/bear-icon.3754101e8d6380da.png')});if(url.pathname.startsWith('/v/')){videoCalls++;return route.fulfill({status:410,contentType:'application/json',headers:{'Cache-Control':'no-store'},body:'{"error":"media_missing"}'});}
    if(url.pathname==='/api')return route.fulfill({contentType:'image/png',body:await readFile('content/assets/brand/bear-icon.3754101e8d6380da.png')});
    const path=url.pathname.slice(1),types={'.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};return route.fulfill({contentType:types[extname(path)]||'text/html',body:await readFile('dist/'+path)});
   });
   const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(site+(embedded?'/embed/':'/s/')+post.id);
   assert.equal(await page.locator('.gallery-stage figure').count(),1);assert.equal(imageCalls,0);assert.equal(videoCalls,0);
   await page.locator('[data-plyr=play]').first().click();const videoFailure=page.locator('.gallery-stage .media-feedback');await videoFailure.waitFor({state:'visible'});assert.match(await videoFailure.textContent(),/no longer available|deleted/);assert.equal(videoCalls,1);
   const retryResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/v/'+video.id+'/master.m3u8');await videoFailure.getByRole('button',{name:'Retry loading'}).click();await retryResponse;await videoFailure.waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('.gallery-stage .media-feedback button')?.disabled===false);assert.equal(videoCalls,2);assert.equal(imageCalls,0);
   await page.locator('[data-next]').click();const failure=page.locator('.gallery-stage .media-feedback');await failure.waitFor({state:'visible'});assert.match(await failure.textContent(),/deleted|unavailable/);assert.match(await page.locator('.shared-post>.caption').textContent(),/Keep this story/);assert.equal(imageCalls,1);assert.equal(await page.locator('video').count(),0);
   await failure.getByRole('button',{name:'Retry loading'}).click();await failure.waitFor({state:'hidden'});assert.equal(await page.locator('img[data-media]').evaluate(node=>node.naturalWidth>0&&!node.hidden),true);assert.equal(imageCalls,2);assert.equal(await page.locator('.gallery-count').textContent(),'2 / 2');
   await page.locator('.gallery-stage').focus();await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('.gallery-stage video').count(),1);assert.equal(await page.locator('.gallery-count').textContent(),'1 / 2');assert.equal(videoCalls,2);await page.locator('.gallery-stage').evaluate(stage=>{stage.dispatchEvent(new TouchEvent('touchstart',{touches:[new Touch({identifier:0,target:stage,clientX:300,clientY:100})]}));stage.dispatchEvent(new TouchEvent('touchend',{changedTouches:[new Touch({identifier:0,target:stage,clientX:100,clientY:100})]}));});assert.equal(await page.locator('.gallery-count').textContent(),'2 / 2');
   assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await context.close();
  }
 }finally{await browser.close();}
});
