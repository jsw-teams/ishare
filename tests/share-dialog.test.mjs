import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {extname} from 'node:path';
import {chromium} from 'playwright';
import {renderPage} from '../backend/cloudflare/views.js';

test('compact posts share through a themed accessible dialog without loading media originals or exposing permanent fields',async()=>{
 const site='https://ishare.js.gripe',id='a'.repeat(32),env={ASSETS:{fetch:async req=>new Response(await readFile('dist'+new URL(req.url).pathname))}};
 const base={id,kind:'image',caption:'A quiet afternoon',title:'By the water',author:JSON.stringify({id:'42',name:'Bear',login:'bear'}),source_name:'',source_url:'',created:1,published:2,state:'published'};
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})}),axe=await readFile('node_modules/axe-core/axe.min.js','utf8'),picture=await readFile('content/assets/brand/bear-icon.3754101e8d6380da.png');
 try{for(const locale of ['en','zh-CN','zh-TW'])for(const colorScheme of ['light','dark']){
  const context=await browser.newContext({locale,colorScheme,bypassCSP:true,viewport:{width:320,height:844}}),page=await context.newPage(),errors=[],paths=[];page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());assert.equal(url.origin,site);paths.push(url.pathname);if(url.pathname==='/s/'+id){const response=await renderPage(base,env,site,false,locale);return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});}if(url.pathname==='/api'||url.pathname.startsWith('/i/'))return route.fulfill({contentType:'image/png',body:picture});const types={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};return route.fulfill({contentType:types[extname(url.pathname)]||'text/html',body:await readFile('dist'+url.pathname)});});
  await page.goto(site+'/s/'+id);await page.locator('.share-post-button').waitFor();assert.equal(await page.locator('.share-tools,textarea,input').count(),0);assert.equal(await page.locator('.post-brand img').count(),1);
  for(const width of [320,1280]){
   await page.setViewportSize({width,height:844});await page.locator('.share-post-button').click();await page.locator('.share-sheet').waitFor();assert.equal(await page.locator('#share-sheet-value').inputValue(),site+'/s/'+id);await page.locator('.share-options button').nth(1).click();assert.match(await page.locator('#share-sheet-value').inputValue(),/<iframe/);await page.locator('.share-options button').nth(2).click();assert.match(await page.locator('#share-sheet-value').inputValue(),/\/i\//);
   await page.addScriptTag({content:axe});const result=await page.evaluate(async()=>{const report=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});return report.violations.map(issue=>({id:issue.id,nodes:issue.nodes.map(node=>node.target)}));});assert.deepEqual(result,[],JSON.stringify({locale,colorScheme,width,result}));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.keyboard.press('Escape');await page.locator('.share-sheet').waitFor({state:'detached'});assert.equal(await page.locator('.share-post-button').evaluate(node=>node===document.activeElement),true);
  }
  assert.ok(!paths.some(path=>path.endsWith('/original')));assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();}
});
