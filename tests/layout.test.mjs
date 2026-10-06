import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {extname} from 'node:path';
import {chromium} from 'playwright';

test('home and native Pages load local art and icons across locales, mobile sizes and color schemes',async()=>{
  const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
  const errors=[],external=[],apiCalls=[];
  try{
    const context=await browser.newContext({locale:'zh-CN'});
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin!=='https://ishare.js.gripe'){external.push(url.href);return route.abort();}
      if(url.pathname==='/api'){
        const action=route.request().headers()['x-service-action'];apiCalls.push(action);assert.ok(['session','feed'].includes(action));if(action==='feed')return route.fulfill({contentType:'application/json',body:JSON.stringify({items:[],next:null})});
        return route.fulfill({contentType:'application/json',body:JSON.stringify({user:null,csrf:null,loginAvailable:true,canPublish:false,isAdmin:false,account:null,imagesAvailable:true,videosAvailable:true,maxVideoDuration:600,maxVideoBytes:29999999999})});
      }
      const path=url.pathname.endsWith('/')?url.pathname.slice(1)+'index.html':url.pathname.slice(1);
      const types={'.mp4':'video/mp4','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.json':'application/json'};
      try{return route.fulfill({contentType:types[extname(path)]||'text/html',body:await readFile('dist/'+path)});}
      catch{errors.push('Missing local resource: '+path);return route.fulfill({status:404,body:''});}
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    for(const scheme of ['light','dark'])for(const width of [360,390,768,1280]){
      await page.emulateMedia({colorScheme:scheme});await page.setViewportSize({width,height:900});
      for(const path of ['/','/zh-CN/','/zh-TW/','/mine/','/zh-CN/guide/','/zh-TW/privacy/','/admin/','/profile/','/zh-CN/profile/','/zh-TW/profile/']){
        const before=apiCalls.length;await page.goto('https://ishare.js.gripe'+path);await page.waitForLoadState('networkidle');
        assert.equal(await page.locator('html').getAttribute('lang'),path.startsWith('/zh-TW/')?'zh-TW':path.startsWith('/zh-CN/')?'zh-CN':'en');assert.equal(await page.locator('main').count(),1);assert.equal(await page.locator('h1').count(),1);
        if(['/','/zh-CN/','/zh-TW/'].includes(path))assert.equal(await page.title(),path==='/zh-CN/'?'爱分享':path==='/zh-TW/'?'愛分享':'ishare');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,path+' width '+width);
        await page.locator('img').evaluateAll(nodes=>Promise.all(nodes.map(async node=>{node.loading='eager';await node.decode().catch(()=>{});}))); 
        assert.deepEqual(await page.locator('img').evaluateAll(nodes=>nodes.filter(node=>!node.complete||node.naturalWidth===0).map(node=>node.src)),[],path+' images must decode');
        const privacy=JSON.parse(await page.locator('#edgepress-privacy-config').textContent());assert.deepEqual(privacy.privacy.integrations,[]);
        assert.equal(await page.locator('.privacy-panel').isVisible(),false,'No consent prompt for zero optional services');
        if(!['/','/zh-CN/','/zh-TW/','/mine/','/admin/','/profile/','/zh-CN/profile/','/zh-TW/profile/'].includes(path))assert.equal(apiCalls.length,before,'Guide/privacy pages do not call business APIs');
        if(process.env.ISHARE_CAPTURE_DESIGN==='1'&&scheme==='light'&&[390,1280].includes(width)&&path==='/'){
          await mkdir('docs/images',{recursive:true});await page.screenshot({path:'docs/images/home-'+(width===1280?'desktop':'mobile')+'.png'});
        }
      }
    }
    await page.goto('https://ishare.js.gripe/');await page.locator('.privacy-settings-button').click();await page.locator('.privacy-panel').waitFor({state:'visible'});await page.keyboard.press('Escape');assert.equal(await page.locator('.privacy-panel').isVisible(),false);
    await page.locator('.hero-actions a[href="/mine/"]').click();await page.waitForURL('https://ishare.js.gripe/mine/');assert.equal(await page.locator('input[name=listed]').isChecked(),false);
    assert.deepEqual(external,[]);assert.deepEqual(errors,[]);await context.close();
  }finally{await browser.close();}
});
