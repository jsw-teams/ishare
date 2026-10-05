import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {extname} from 'node:path';
import {chromium} from 'playwright';

test('mobile pages pass axe and keep slow account loading from shifting content',async()=>{
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})}),axe=await readFile('node_modules/axe-core/axe.min.js','utf8'),results=[];
 try{for(const width of [320,390])for(const scheme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:844},locale:'zh-CN',colorScheme:scheme,bypassCSP:true}),page=await context.newPage();
  await page.addInitScript(()=>{window.shifts=[];new PerformanceObserver(list=>{for(const entry of list.getEntries())if(!entry.hadRecentInput)shifts.push({value:entry.value,sources:entry.sources.map(x=>x.node?.className)});}).observe({type:'layout-shift',buffered:true});});
  await context.route('**/*',async route=>{const url=new URL(route.request().url());assert.equal(url.origin,'https://ishare.js.gripe');if(url.pathname==='/api'){await new Promise(resolve=>setTimeout(resolve,1000));const action=route.request().headers()['x-service-action'];assert.ok(['session','feed'].includes(action));return route.fulfill({contentType:'application/json',body:JSON.stringify(action==='feed'?{items:[],next:null}:{user:null,csrf:null,loginAvailable:true,canPublish:false,isAdmin:false,account:null,imagesAvailable:true,videosAvailable:true,maxVideoDuration:600,maxVideoBytes:29999999999})});}const path=url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname,types={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.json':'application/json'};return route.fulfill({contentType:types[extname(path)]||'text/html',body:await readFile('dist'+path)});});
  for(const path of ['/','/mine/','/admin/','/profile/']){await page.goto('https://ishare.js.gripe'+path);await page.waitForLoadState('networkidle');await page.addScriptTag({content:axe});const result=await page.evaluate(async()=>{const a=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});return {issues:a.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),cls:shifts.reduce((s,x)=>s+x.value,0),shifts,overflow:document.documentElement.scrollWidth>innerWidth};});assert.deepEqual(result.issues,[],path+' '+scheme);assert.ok(result.cls<=.01,path+' CLS '+JSON.stringify(result.shifts));assert.equal(result.overflow,false);results.push({path,width,scheme,cls:result.cls,violations:0});}
  await context.close();
 }}finally{await browser.close();await mkdir('.wrangler/quality',{recursive:true});await writeFile('.wrangler/quality/pages.json',JSON.stringify(results,null,2));}
});
