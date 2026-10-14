import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {extname} from 'node:path';
import {chromium} from 'playwright';
import {repository,environment,login,request,now,media,limits} from './helpers.mjs';
import {handle} from '../backend/cloudflare/service.js';

test('personal key UI, author editing, embedded previews and progressive WebMCP work across locales and mobile themes', {timeout:180000},async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-extensions']}),image=await readFile('content/assets/brand/bear-icon.3754101e8d6380da.png'),axe=await readFile('node_modules/axe-core/axe.min.js','utf8');
 try{for(const prefix of ['', '/zh-CN','/zh-TW'])for(const width of [320,1280]){
  const {store,database}=repository(),env={...environment(store),OWNER_GITHUB_ID:'99'},user=await login(store),postId='d'.repeat(32),mediaId='a'.repeat(32),clock=now(),jobs=[],ctx={waitUntil(job){jobs.push(job);}};
  store.reserve(media({id:mediaId}),limits,clock);store.attach(mediaId,'private-fixture','',clock);store.publish(mediaId,'42',0,clock,'99');store.createPost({id:postId,owner:'42',author:{id:'42',login:'publisher',name:'Publisher'},caption:'Original caption',mediaIds:[mediaId],listed:false,sourceUrl:'',sourceName:''},'99',clock);
  env.ASSETS={fetch:async req=>new Response(await readFile('dist'+new URL(req.url).pathname))};
  const context=await browser.newContext({viewport:{width,height:900},locale:prefix==='/zh-TW'?'zh-TW':prefix==='/zh-CN'?'zh-CN':'en',colorScheme:width===320?'light':'dark',bypassCSP:true}),errors=[];
  await context.addCookies([{name:'__Host-ishare-session',value:user.cookie.split('=')[1],url:'https://ishare.js.gripe',httpOnly:true,secure:true,sameSite:'Lax'}]);
  await context.addInitScript(()=>{window.registered={};Object.defineProperty(document,'modelContext',{value:{registerTool(tool,{signal}={}){window.registered[tool.name]=tool;signal?.addEventListener('abort',()=>delete window.registered[tool.name],{once:true});}}});});
  await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());assert.equal(url.origin,'https://ishare.js.gripe');
   if(url.pathname.startsWith('/i/'))return route.fulfill({contentType:'image/png',body:image});
   if(url.pathname==='/api'&&['avatar','profile-avatar'].includes(req.headers()['x-service-action']))return route.fulfill({contentType:'image/png',body:image});
   if(url.pathname==='/api'||url.pathname.startsWith('/embed/')){const response=await handle(new Request(req.url(),{method:req.method(),headers:await req.allHeaders(),body:req.method()==='POST'?req.postData():undefined}),env,ctx);return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});}
   const path=url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname,types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.json':'application/json','.woff2':'font/woff2'};try{return route.fulfill({contentType:types[extname(path)]||'application/octet-stream',body:await readFile('dist'+path)});}catch{return route.fulfill({status:404,body:''});}
  });
  try{const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('https://ishare.js.gripe'+prefix+'/profile/');await page.locator('#api-key-panel').waitFor();
   await page.locator('#api-key-form [name=name]').fill('AI studio');await page.locator('#api-key-form button[type=submit]').click();await page.locator('#api-key-result').waitFor();const secret=await page.locator('#api-key-secret').inputValue();assert.match(secret,/^ishare_[\w-]{43}$/);assert.equal(store.apiKeys('42').length,1);
   await page.waitForFunction(()=>window.registered.ishare_list_api_keys);assert.equal(JSON.parse(await page.evaluate(()=>registered.ishare_list_api_keys.execute({}))).items[0].name,'AI studio');
   await page.addScriptTag({content:axe});assert.deepEqual(await page.evaluate(async()=>{const result=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});return result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}));}),[]);
   await page.locator('#api-key-hide').click();assert.equal(await page.locator('#api-key-secret').inputValue(),'');const keyId=store.apiKeys('42')[0].id;await page.evaluate(id=>registered.ishare_revoke_api_key.execute({id}),keyId);await page.waitForFunction(()=>document.querySelector('#api-key-list button').disabled);assert.ok(store.apiKeys('42')[0].revoked);
   await page.reload();assert.equal(await page.locator('#api-key-secret').inputValue(),'');
   await page.waitForFunction(()=>window.registered.ishare_create_api_key);const generated=JSON.parse(await page.evaluate(()=>registered.ishare_create_api_key.execute({name:'WebMCP uploader',days:30})));assert.match(generated.key,/^ishare_[\w-]{43}$/);assert.equal(await page.locator('#api-key-secret').inputValue(),generated.key);assert.equal(store.apiKeys('42').length,2);
   await page.goto('https://ishare.js.gripe'+prefix+'/mine/#edit='+postId);await page.waitForFunction(()=>document.querySelector('[name=caption]').value==='Original caption');assert.equal(await page.locator('.attachment-tile').count(),1);assert.equal(await page.locator('[name=listed]').isChecked(),false);
   await page.waitForFunction(()=>window.registered.ishare_publish_selected_post);const before=JSON.parse(await page.evaluate(id=>registered.ishare_get_my_post.execute({id}),postId));assert.equal(before.revision,0);
   const published=JSON.parse(await page.evaluate(()=>registered.ishare_publish_selected_post.execute({caption:'Edited with WebMCP',listed:true})));assert.equal(published.id,postId);assert.equal(published.revision,1);assert.equal(store.post(postId).caption,'Edited with WebMCP');assert.equal(await page.locator('#upload-bytes').textContent(),'');assert.equal(store.feed('','99',clock).items.length,1);
   await page.frameLocator('#published-preview iframe').locator('.media-gallery').waitFor();assert.match(await page.frameLocator('#published-preview iframe').locator('.shared-post .caption').textContent(),/Edited with WebMCP/);assert.equal(await page.frameLocator('#published-preview iframe').locator('img[data-media]').count(),1);assert.equal(await page.frameLocator('#published-preview iframe').locator('body').evaluate(()=>Object.keys(window.registered).some(name=>name.startsWith('ishare_'))),false);
   if(prefix==='/zh-CN'){await mkdir('.wrangler/author-tools',{recursive:true});await page.locator('#upload-status').screenshot({path:'.wrangler/author-tools/embed-'+width+'.png'});}
   await page.locator('#upload-dismiss').click();await page.locator('#published-preview iframe').waitFor({state:'detached'});assert.equal(await page.locator('#published-preview iframe').count(),0);
   await page.evaluate(id=>registered.ishare_set_homepage_visibility.execute({id,listed:false}),postId);assert.equal(store.feed('','99',clock).items.length,0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
   await page.evaluate(()=>{const button=document.querySelector('#logout');button.click();});await page.waitForFunction(()=>!Object.keys(registered).some(name=>name.startsWith('ishare_')));
  }finally{await Promise.all(jobs);await context.close();database.close();}
 }}finally{await browser.close();}
});
