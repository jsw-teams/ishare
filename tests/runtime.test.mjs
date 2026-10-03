import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFile} from 'node:fs/promises';

test('real Cloudflare runtime initializes SQLite and RPC while static assets bypass the Worker',async()=>{
  const bundled=await build({entryPoints:['backend/cloudflare/worker.js'],bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers'],write:false});
  const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
  const mf=new Miniflare(convertV4MiniflareOptions({name:'ishare-runtime-test',modules:true,script:bundled.outputFiles[0].text,compatibilityDate:config.compatibility_date,bindings:config.vars,durableObjects:{SHARE_STORE:{className:'ShareStore',useSQLite:true}},assets:{directory:'dist',run_worker_first:config.assets.run_worker_first,routerConfig:{has_user_worker:true},assetConfig:{not_found_handling:'404-page',html_handling:'auto-trailing-slash'}}}));
  try{
    const root=await mf.dispatchFetch('https://share.js.gripe/');assert.equal(root.status,200);assert.match(await root.text(),/id="admin"/);
    const manifest=await(await mf.dispatchFetch('https://share.js.gripe/assets.json')).json();const asset=await mf.dispatchFetch('https://share.js.gripe'+manifest.app);assert.match(asset.headers.get('cache-control'),/31536000.*immutable/);
    const api=await mf.dispatchFetch('https://share.js.gripe/api',{headers:{'X-Service-Action':'session',Cookie:'__Host-ishare-session='+'a'.repeat(43)}});assert.equal(api.status,200);assert.equal((await api.json()).user,null);
    const auth=await mf.dispatchFetch('https://share.js.gripe/auth',{redirect:'manual'});assert.equal(auth.status,503);assert.equal((await auth.json()).error,'login_unavailable');
    assert.equal((await mf.dispatchFetch('https://share.js.gripe/.env')).status,404);
    assert.equal((await mf.dispatchFetch('https://share.js.gripe/s/'+'a'.repeat(32))).status,404);
    for(let i=0;i<9;i++)await mf.dispatchFetch('https://share.js.gripe/auth',{redirect:'manual'});
    const limited=await mf.dispatchFetch('https://share.js.gripe/auth',{redirect:'manual'});assert.equal(limited.status,429);assert.equal((await limited.json()).error,'rate_limited');
  }finally{await mf.dispose();}
});
