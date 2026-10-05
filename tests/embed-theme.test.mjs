import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {extname} from 'node:path';
import {chromium} from 'playwright';
import {renderPage} from '../backend/cloudflare/views.js';

test('embedded galleries follow host colors, resize to natural content and ignore unrelated senders',async()=>{
 const site='https://ishare.js.gripe',host='https://article.example',assets={ASSETS:{fetch:async request=>new Response(await readFile('dist'+new URL(request.url).pathname))}},base={id:'a'.repeat(32),kind:'image',title:'Picture',caption:'',author:JSON.stringify({id:'42',name:'Bear',login:'bear'}),source_name:'',source_url:'',created:1,published:2,state:'published'},post={...base,id:'b'.repeat(32),kind:'post',caption:'A story with its pictures. '.repeat(12),media:[base,{...base,id:'c'.repeat(32)}]};
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 try{for(const width of [320,1000]){
  const context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',async route=>{const url=new URL(route.request().url());
   if(url.origin===host)return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><title>Embed fixture</title></head><body style="margin:0"><iframe title="Story" src="${site}/embed/${post.id}" style="width:100%;height:480px;border:0"></iframe><script>const frame=document.querySelector('iframe');window.addEventListener('message',event=>{if(event.source!==frame.contentWindow||event.origin!=='${site}')return;if(event.data.type==='edgepress:embed-ready')frame.contentWindow.postMessage({type:'edgepress:embed-theme',colors:{'--accent':'#7242b4','--paper':'#f2eff9','--surface':'#ffffff','--ink':'#231439','--muted':'#625874','--line':'#d3c9e4'}},'${site}');if(event.data.type==='edgepress:embed-size'){window.reportedHeight=event.data.height;frame.style.height=event.data.height+'px';}});</script></body></html>`});
   assert.equal(url.origin,site);
   if(url.pathname==='/embed/'+post.id){const response=await renderPage(post,assets,site,true);return route.fulfill({headers:Object.fromEntries(response.headers),body:await response.text()});}
   if(url.pathname.startsWith('/i/')||url.pathname==='/api')return route.fulfill({contentType:'image/png',body:await readFile('content/assets/brand/bear-icon.3754101e8d6380da.png')});
   return route.fulfill({body:await readFile('dist'+url.pathname),contentType:({'.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[extname(url.pathname)]||'text/html'});
  });
  await page.goto(host+'/');await page.waitForFunction(()=>window.reportedHeight>480);const frame=page.frameLocator('iframe');await frame.locator('.gallery-stage img').waitFor();
  const geometry=await frame.locator('main').evaluate(node=>({height:Math.ceil(node.getBoundingClientRect().height),scroll:document.documentElement.scrollHeight,width:document.documentElement.scrollWidth,viewport:innerWidth,accent:getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),background:getComputedStyle(document.documentElement).backgroundColor,caption:getComputedStyle(document.querySelector('.caption')).overflowY}));assert.equal(geometry.accent,'#7242b4');assert.equal(geometry.background,'rgb(242, 239, 249)');assert.equal(geometry.caption,'visible');assert.ok(geometry.width<=geometry.viewport+1);assert.equal(await page.evaluate(()=>window.reportedHeight),geometry.height);assert.ok(geometry.scroll<=geometry.height+1);
  await frame.locator('[data-next]').click();assert.equal(await frame.locator('.gallery-count').innerText(),'2 / 2');
  await frame.locator('main').evaluate(()=>window.dispatchEvent(new MessageEvent('message',{source:window,origin:'https://unrelated.example',data:{type:'edgepress:embed-theme',colors:{'--accent':'red'}}})));assert.equal(await frame.locator('main').evaluate(()=>document.documentElement.style.getPropertyValue('--accent')),'#7242b4');assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();}
});
