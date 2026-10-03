import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {defaults} from '../backend/cloudflare/quotas.js';

test('browser administration uses header actions, handles reductions, exports data and works at mobile width',async()=>{
  const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
  const account={id:'77',identity:{id:'77',login:'demo-user',name:'Demo'},limits:defaults(),usage:{images:2,videoSeconds:30,imageDeliveries:12,videoDeliverySeconds:16,dailyUploads:1},blocked:false,unlimited:false,note:''};
  const operator={id:'228026986',identity:{id:'228026986',login:'jsw-teams',name:'JS.GRIPE'},limits:Object.fromEntries(Object.keys(defaults()).map(key=>[key,null])),usage:{images:0,videoSeconds:0,imageDeliveries:0,videoDeliverySeconds:0,dailyUploads:0},blocked:false,unlimited:true,note:''};
  const session={user:operator.identity,csrf:'fixture-csrf',isAdmin:true,account:operator,loginAvailable:true,canPublish:true,imagesAvailable:true,videosAvailable:true,maxVideoDuration:36000,maxVideoBytes:29_999_999_999};
  let change,requests=0;const errors=[];
  try{
    const context=await browser.newContext({locale:'zh-CN',viewport:{width:1280,height:960}});
    await context.route('**/*',async route=>{const url=new URL(route.request().url());assert.equal(url.origin,'https://share.js.gripe');if(url.pathname==='/api'){
      assert.equal(url.search,'');const headers=route.request().headers(),action=headers['x-service-action'];let body;
      if(route.request().method()==='POST'){assert.equal(headers['x-csrf-token'],'fixture-csrf');body=route.request().postDataJSON();}
      let data;
      switch(action){case 'session':data=session;break;case 'list':case 'admin-list':data={items:[],next:null};break;case 'admin-users':data={items:[operator,account],next:null};break;case 'admin-user':data=account;break;case 'admin-set-user':change=body;account.note=body.note;account.notice={limits:body.limits,blocked:body.blocked,effective:Math.floor(Date.now()/1000)+604800};data=account;break;case 'rights':case 'admin-audit':case 'admin-rights':data={items:[]};break;case 'export':data={identity:operator.identity,account:operator,items:[],requests:[],next:null};break;case 'request-right':requests++;data={id:'fixture-right',due:Math.floor(Date.now()/1000)+2592000};break;default:throw Error('Unexpected action '+action);}
      return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
    }
      const path=url.pathname==='/'?'index.html':url.pathname.slice(1);try{return route.fulfill({contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html',body:await readFile('dist/'+path)});}catch{return route.fulfill({status:404,body:''});}
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto('https://share.js.gripe/');await page.locator('#admin-users button').nth(1).click();await page.locator('#admin-editor form').waitFor();
    await page.getByLabel('图片存储（张）',{exact:true}).fill('1');await page.getByLabel('原因（对应用户可见）').fill('演示：容量调整，提前七天通知');await page.getByRole('button',{name:'保存',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#admin-editor').textContent.includes('生效时间'));assert.equal(change.limits.images,1);assert.equal(change.urgent,false);assert.equal(change.note,'演示：容量调整，提前七天通知');
    if(process.env.ISHARE_CAPTURE_DOCS==='1'){await mkdir('docs/images',{recursive:true});await page.locator('#admin').screenshot({path:'docs/images/admin-preview.png'});}
    await page.locator('#rights-form textarea').fill('请人工复核我的额度');await page.getByRole('button',{name:'提交请求',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#rights-form textarea').value==='');assert.equal(requests,1);
    const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出我的数据',exact:true}).click();assert.equal((await download).suggestedFilename(),'ishare-data.json');
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);await context.close();
  }finally{await browser.close();}
});
