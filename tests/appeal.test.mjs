import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {extname} from 'node:path';
import {chromium} from 'playwright';
import {authorize,callback} from '../backend/cloudflare/auth.js';
import {handle} from '../backend/cloudflare/service.js';
import {repository,environment,login,request,now} from './helpers.mjs';

test('restricted sign-ins go to a dedicated appeal page while unrestricted users cannot create appeals',async()=>{
 const {store,database}=repository(),env={...environment(store),OWNER_GITHUB_ID:'99',GITHUB_CLIENT_ID:'fixture',GITHUB_CLIENT_SECRET:'fixture'};
 try{const user=await login(store);assert.equal((await handle(request('request-right',{...user,body:{kind:'appeal',message:'Review'}}),env,{})).status,403);store.setAccount('42',{blocked:true,urgent:true,note:'Review restriction'},'99','99',now(),store.quotaSettings(now()).defaults);
 const auth=await authorize(new Request('https://ishare.js.gripe/auth'),env,store,now()),state=new URL(auth.headers.get('Location')).searchParams.get('state');const answer=await callback(new Request('https://ishare.js.gripe/auth/callback?code=fixture&state='+state,{headers:{Cookie:auth.headers.get('Set-Cookie').split(';')[0]}}),env,store,now(),async url=>Response.json(url.endsWith('/access_token')?{access_token:'fixture',token_type:'bearer'}:{id:42,login:'publisher'}));assert.equal(answer.headers.get('Location'),'https://ishare.js.gripe/appeal/');assert.equal((await handle(request('request-right',{...user,body:{kind:'appeal',message:'Please review'}}),env,{})).status,201);assert.equal(store.snapshot(null,'profile','99',[],now()).session,null);
 }finally{database.close();}
});

test('restriction appeals are separate from personal data rights and show submission feedback',async()=>{
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})}),rights=[],errors=[];
 try{const context=await browser.newContext(),image=await readFile('content/assets/brand/bear-icon.3754101e8d6380da.png');await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());assert.equal(url.origin,'https://ishare.js.gripe');if(url.pathname==='/api'){const action=req.headers()['x-service-action'];if(action==='avatar')return route.fulfill({contentType:'image/png',body:image});let data;if(action==='session'){assert.equal(req.headers()['x-service-resource'],'appeal');data={user:{id:'42',login:'publisher'},canPublish:false,isAdmin:false,csrf:'fixture',account:{blocked:true,note:'需要复核的限制'},initial:{rights:{items:rights}},loginAvailable:true};}else if(action==='request-right'){assert.equal(req.headers()['x-csrf-token'],'fixture');assert.equal(req.postDataJSON().kind,'appeal');rights.push({message:req.postDataJSON().message,state:'open'});data={ok:true};}else throw Error(action);return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});}const path=url.pathname.endsWith('/')?url.pathname.slice(1)+'index.html':url.pathname.slice(1),types={'.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};return route.fulfill({contentType:types[extname(path)]||'text/html',body:await readFile('dist/'+path)});});const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto('https://ishare.js.gripe/appeal/');await page.locator('#appeal-center').waitFor({state:'visible'});assert.equal(await page.locator('#restriction-reason').textContent(),'需要复核的限制');await page.locator('#appeal-form textarea').fill('请复核限制原因');await page.locator('#appeal-form button').click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='申诉已提交。');assert.match(await page.locator('#appeal-history').textContent(),/请复核限制原因/);const profile=await readFile('dist/profile/index.html','utf8');assert.doesNotMatch(profile,/<option value="appeal"/);assert.deepEqual(errors,[]);await context.close();
 }finally{rights.length=0;await browser.close();}
});
