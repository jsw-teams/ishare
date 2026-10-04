import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFile} from 'node:fs/promises';

test('real Cloudflare runtime initializes SQLite and RPC while static assets bypass the Worker',async()=>{
  const bundled=await build({stdin:{contents:`import worker,{ShareStore as Base} from './backend/cloudflare/worker.js';export class ShareStore extends Base{alarmState(){return this.ctx.storage.getAlarm();}testAlarm(){return this.alarm();}}export default {async fetch(req,env,ctx){if(new URL(req.url).pathname==='/fixture/alarms'){const store=env.SHARE_STORE.get(env.SHARE_STORE.idFromName('ishare-v1')),now=Math.floor(Date.now()/1000),item={id:'a'.repeat(32),owner:'42',author:{id:'42'},kind:'image',title:'Fixture',caption:'',sourceUrl:'',sourceName:'',bytes:100,mime:'image/png',duration:0};await store.reserve(item,{defaults:{},ownerId:'42'},now);const pending=await store.alarmState();await store.failed(item.id);await store.cleanup(now+2592001);const empty=await store.alarmState();await store.reserve({...item,id:'b'.repeat(32)},{defaults:{},ownerId:'42'},now);await store.attach('b'.repeat(32),null,'',now);await store.prepareRemoval('b'.repeat(32),'42',false,[],true);await store.testAlarm();const state=(await store.get('b'.repeat(32))).state;await store.cleanup(now+2592001);return Response.json({pending,empty,finished:await store.alarmState(),state});}return worker.fetch(req,env,ctx);}}`,resolveDir:process.cwd(),sourcefile:'runtime-fixture.js'},bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers'],write:false});
  const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
  const mf=new Miniflare(convertV4MiniflareOptions({name:'ishare-runtime-test',modules:true,script:bundled.outputFiles[0].text,compatibilityDate:config.compatibility_date,bindings:config.vars,durableObjects:{SHARE_STORE:{className:'ShareStore',useSQLite:true}},assets:{directory:'dist',run_worker_first:[...config.assets.run_worker_first,'/fixture/*'],routerConfig:{has_user_worker:true},assetConfig:{not_found_handling:'404-page',html_handling:'auto-trailing-slash'}}}));
  try{
    assert.equal(config.triggers,undefined);const cleanupResponse=await mf.dispatchFetch('https://ishare.js.gripe/fixture/alarms'),cleanupText=await cleanupResponse.text();assert.equal(cleanupResponse.status,200,cleanupText);const cleanup=JSON.parse(cleanupText);assert.ok(cleanup.pending>Date.now());assert.equal(cleanup.empty,null);assert.equal(cleanup.finished,null);assert.equal(cleanup.state,'deleted');
    const root=await mf.dispatchFetch('https://ishare.js.gripe/');assert.equal(root.status,200);assert.match(await root.text(),/id="feed"/);const mine=await mf.dispatchFetch('https://ishare.js.gripe/mine/');assert.equal(mine.status,200);const mineHtml=await mine.text();assert.match(mineHtml,/id="publish-form"/);assert.doesNotMatch(mineHtml,/id="admin"/);const admin=await mf.dispatchFetch('https://ishare.js.gripe/admin/');assert.equal(admin.status,200);assert.match(await admin.text(),/id="admin-gate"/);
    const manifest=await(await mf.dispatchFetch('https://ishare.js.gripe/assets.json')).json();const asset=await mf.dispatchFetch('https://ishare.js.gripe'+manifest.app);assert.match(asset.headers.get('cache-control'),/31536000.*immutable/);
    const api=await mf.dispatchFetch('https://ishare.js.gripe/api',{headers:{'X-Service-Action':'session',Cookie:'__Host-ishare-session='+'a'.repeat(43)}});assert.equal(api.status,200);assert.equal((await api.json()).user,null);
    const auth=await mf.dispatchFetch('https://ishare.js.gripe/auth',{redirect:'manual'});assert.equal(auth.status,503);assert.equal((await auth.json()).error,'login_unavailable');
    assert.equal((await mf.dispatchFetch('https://ishare.js.gripe/.env')).status,404);
    assert.equal((await mf.dispatchFetch('https://ishare.js.gripe/s/'+'a'.repeat(32))).status,404);
    for(let i=0;i<9;i++)await mf.dispatchFetch('https://ishare.js.gripe/auth',{redirect:'manual'});
    const limited=await mf.dispatchFetch('https://ishare.js.gripe/auth',{redirect:'manual'});assert.equal(limited.status,429);assert.equal((await limited.json()).error,'rate_limited');
  }finally{await mf.dispose();}
});
