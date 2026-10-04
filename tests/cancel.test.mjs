import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {extname} from 'node:path';
import {chromium} from 'playwright';
import {defaults} from '../backend/cloudflare/quotas.js';

test('a video gets a real preview frame and modal cancellation removes completed and delayed allocations without publishing',async()=>{
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})}),records=[],deleted=[],errors=[];let count=0,uploads=0,posts=0,release;
 const delay=new Promise(resolve=>{release=resolve;});
 try{const context=await browser.newContext({viewport:{width:390,height:844}}),image=await readFile('content/assets/brand/bear-icon.3754101e8d6380da.png'),video=await readFile('tests/fixtures/preview.webm'),identity={id:'42',login:'publisher'};
 await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.hostname==='upload.imagedelivery.net'){uploads++;return route.fulfill({contentType:'application/json',body:'{"success":true}'});}assert.equal(url.origin,'https://ishare.js.gripe');
 if(url.pathname==='/api'){const headers=req.headers(),action=headers['x-service-action'];let data;
 if(action==='avatar'||action==='profile-avatar')return route.fulfill({contentType:'image/png',body:image});
 if(action==='session')data={user:identity,csrf:'fixture',profile:null,account:{id:'42',limits:defaults(),usage:{images:0,videoSeconds:0}},isAdmin:false,canPublish:true,loginAvailable:true,imagesAvailable:true,videosAvailable:true,maxVideoDuration:600,initial:{history:{items:[],next:null}}};
 else{assert.equal(headers['x-csrf-token'],'fixture');const id=headers['x-service-resource'];switch(action){case 'create-upload':{count++;const body=req.postDataJSON();records.push({id,kind:body.kind,title:body.title});if(count===2){assert.equal(body.duration,1);await delay;}data={id,uploadUrl:'https://upload.'+(body.kind==='image'?'imagedelivery':'videodelivery')+'.net/'+id,protocol:body.kind==='image'?'post':'tus'};break;}case 'publish':data={...records.find(item=>item.id===id),state:'published'};break;case 'discard-upload':deleted.push(id);data={ok:true};break;case 'create-post':posts++;throw Error('Must not publish a cancelled attempt');default:throw Error(action);}}
 return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});}
 const path=url.pathname.endsWith('/')?url.pathname.slice(1)+'index.html':url.pathname.slice(1),types={'.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};return route.fulfill({contentType:types[extname(path)]||'text/html',body:await readFile('dist/'+path)});
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto('https://ishare.js.gripe/mine/');await page.waitForFunction(()=>!document.querySelector('#publish-form fieldset').disabled);await page.locator('[name=file]').setInputFiles([{name:'photo.png',mimeType:'image/png',buffer:image},{name:'clip.webm',mimeType:'video/webm',buffer:video}]);await page.waitForFunction(()=>document.querySelectorAll('.attachment-tile img').length===2&&[...document.querySelectorAll('.attachment-tile img')].every(image=>image.naturalWidth>0));assert.equal(await page.locator('[name=file]').evaluate(node=>getComputedStyle(node).opacity),'0');
 await page.locator('#publish-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#upload-current').textContent.includes('clip.webm'));await page.waitForTimeout(100);assert.equal(count,2);assert.equal(uploads,1);assert.equal(await page.locator('#upload-status').evaluate(node=>node.open&&node.matches(':modal')),true);await page.locator('#cancel').click();assert.equal(await page.locator('#cancel').isDisabled(),true);release();await page.waitForFunction(()=>document.querySelector('#upload-status').dataset.state==='error'&&!document.querySelector('#publish-form fieldset').disabled);assert.equal(deleted.length,2);assert.deepEqual(new Set(deleted),new Set(records.map(item=>item.id)));assert.equal(posts,0);assert.equal(await page.locator('.attachment-tile').count(),0);assert.match(await page.locator('#upload-result').textContent(),/已取消/);await page.locator('#upload-dismiss').click();assert.equal(await page.locator('#upload-status').isVisible(),false);assert.deepEqual(errors,[]);await context.close();
 }finally{release();records.length=0;deleted.length=0;await browser.close();}
});
