import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

test('preview renditions respect network and data-saving hints without requesting originals',async()=>{
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 try{for(const [connection,maximum] of [[{saveData:true,effectiveType:'4g',downlink:10},640],[{effectiveType:'3g',downlink:1},640],[{effectiveType:'4g',downlink:3},1280],[{effectiveType:'4g',downlink:10},2048],[undefined,1280]]){
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2}),page=await context.newPage(),requests=[];
  await page.addInitScript(value=>Object.defineProperty(navigator,'connection',{value,configurable:true}),connection);
  await context.route('**/*',async route=>{const path=new URL(route.request().url()).pathname;
   if(path==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><title>Preview</title><style>img{width:100%;height:240px;object-fit:contain}</style><script type="module">import {preparePreview} from "/preview.js";const image=new Image();image.src="/thumbnail";image.dataset.previewSrcset="/thumbnail 640w, /medium 1280w, /public 2048w";image.sizes="100vw";image.dataset.original="/original";preparePreview(image);document.body.append(image);</script></html>'});
   if(path==='/preview.js')return route.fulfill({contentType:'text/javascript',body:await readFile('static/ishare/preview.js')});
   requests.push(path);return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#567"/></svg>'});
  });
  await page.goto('https://preview.test/');await page.waitForFunction(()=>document.querySelector('img')?.complete&&document.querySelector('img').naturalWidth>0);
  const source=await page.locator('img').getAttribute('srcset');if(maximum===640){assert.equal(source,null);assert.deepEqual(requests,['/thumbnail']);}else{assert.match(source,/1280w/);assert.equal(source.includes('2048w'),maximum===2048);}
  assert.ok(!requests.includes('/original'));assert.equal(await page.locator('img').getAttribute('data-original'),'/original');await context.close();
 }}finally{await browser.close();}
});
