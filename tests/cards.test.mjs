import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {extname} from 'node:path';
import {chromium} from 'playwright';
import {renderProfile} from '../backend/cloudflare/views.js';

test('feed and X-style profiles load one cover for a long mixed post and omit GitHub identity labels',async()=>{
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})}),site='https://ishare.js.gripe',assets={ASSETS:{fetch:async req=>new Response(await readFile('dist'+new URL(req.url).pathname))}},cover=await readFile('content/assets/brand/bear-banner.ed22b23efa24f8a8.webp'),avatar=await readFile('content/assets/brand/bear-icon.3754101e8d6380da.png'),media=Array.from({length:50},(_,n)=>({id:n.toString(16).padStart(32,'0'),kind:n===0?'video':'image',title:'Attachment '+n})),post={id:'f'.repeat(32),kind:'post',caption:'山间的一个午后。'+('今天拍下了沿途的风景。'.repeat(400)),media,state:'published',created:1,published:2,author:{id:'42',name:'旅行黑熊',login:'jsw-teams'},shareUrl:site+'/s/'+ 'f'.repeat(32)};
 try{const context=await browser.newContext({locale:'zh-CN'}),errors=[],requests=[];
 await context.route('**/*',async route=>{const url=new URL(route.request().url());assert.equal(url.origin,site);
 if(url.pathname==='/u/42')return route.fulfill({contentType:'text/html',body:await(await renderProfile({id:'42',displayName:'旅行黑熊',bio:'用照片记录旅途与日常。',login:'jsw-teams'},assets,site,'zh-CN')).text()});
 if(/^\/[iv]\//.test(url.pathname)){requests.push(url.pathname);return route.fulfill({contentType:'image/webp',body:cover});}
 if(url.pathname==='/api'){const action=route.request().headers()['x-service-action'];if(action==='profile-avatar')return route.fulfill({contentType:'image/png',body:avatar});return route.fulfill({contentType:'application/json',body:JSON.stringify(action==='session'?{user:null,isAdmin:false}:{items:[post],next:null})});}
 const path=url.pathname.endsWith('/')?url.pathname.slice(1)+'index.html':url.pathname.slice(1),types={'.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};return route.fulfill({contentType:types[extname(path)]||'text/html',body:await readFile('dist/'+path)});
 });const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 for(const width of [390,1280])for(const path of ['/','/u/42']){requests.length=0;await page.setViewportSize({width,height:960});await page.goto(site+path);await page.locator('.post-preview img').scrollIntoViewIfNeeded();await page.locator('.post-preview img').evaluate(node=>node.decode());assert.equal(await page.locator('.post-card img').count(),2);assert.deepEqual(requests,['/v/'+media[0].id+'/thumbnail']);assert.equal(await page.locator('.post-preview a').getAttribute('href'),post.shareUrl);assert.equal(await page.locator('.attachment-count').textContent(),'1 / 50');assert.doesNotMatch(await page.locator('.post-card').textContent(),/@jsw-teams|undefined/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 if(path==='/u/42'){assert.equal(await page.locator('.profile-banner img').count(),1);assert.equal(await page.locator('#public-profile h1').textContent(),'旅行黑熊');assert.doesNotMatch(await page.locator('#public-profile').textContent(),/@jsw-teams/);const overlap=await page.locator('#public-profile-avatar').evaluate(node=>node.getBoundingClientRect().top<document.querySelector('.profile-banner').getBoundingClientRect().bottom);assert.equal(overlap,true);await mkdir('.wrangler/design',{recursive:true});await page.locator('#public-profile').screenshot({path:'.wrangler/design/profile-'+width+'.png'});}
 }
 assert.deepEqual(errors,[]);await context.close();
 }finally{await browser.close();}
});
