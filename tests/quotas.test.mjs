import test from 'node:test';
import assert from 'node:assert/strict';
import {repository,environment,media,limits,login,request,now} from './helpers.mjs';
import {defaults,changes} from '../backend/cloudflare/quotas.js';
import {handle} from '../backend/cloudflare/service.js';
const base=defaults(),ctx={waitUntil:()=>{}};

test('the verified operator bypasses every application quota and remains protected from administrators',()=>{
  const {store,database}=repository();try{const cap={...limits,images:0,videoSeconds:0,daily:0,ownerId:'42',defaults:Object.fromEntries(Object.keys(base).map(key=>[key,0]))};
    for(let i=0;i<8;i++)store.reserve(media({id:String(i).padStart(32,'0'),kind:'video',duration:3000,bytes:20_000_000_000}),cap,now());
    const owner=store.account('42',base,'42',now());assert.equal(owner.unlimited,true);assert.ok(Object.values(owner.limits).every(value=>value===null));
    store.delivery('42','image',1000000,now());store.delivery('42','video',1000000,now());
    assert.throws(()=>store.setAccount('42',{blocked:true,note:'test'},'43','42',now(),base),/owner_protected/);
  }finally{database.close();}
});
test('reductions have seven days of notice, suspension preserves media, and reinstatement works',()=>{
  const {store,database}=repository();try{const clock=now();store.makeSession('x',media().author,'csrf',clock);store.reserve(media(),limits,clock);store.attach(media().id,'provider-id-123456789012345','https://upload.imagedelivery.net/a',clock);store.publish(media().id,'42',0,clock);
    store.setAccount('42',{limits:{images:0},note:'Capacity change'},'99','99',clock,base);
    assert.equal(store.account('42',base,'99',clock).limits.images,1000);assert.equal(store.account('42',base,'99',clock).notice.effective,clock+604800);
    const lowered=store.account('42',base,'99',clock+604801);assert.equal(lowered.limits.images,0);assert.equal(store.get(media().id).state,'published');
    assert.throws(()=>store.reserve(media({id:'b'.repeat(32)}),limits,clock+604801),/storage_quota/);
    store.setAccount('42',{blocked:true,urgent:true,note:'Repeated abusive uploads'},'99','99',clock+604802,base);
    assert.throws(()=>store.assertPublisher('42','99'),/publishing_suspended/);assert.equal(store.get(media().id).state,'published');
    store.setAccount('42',{reset:true,blocked:false,note:'Appeal accepted'},'99','99',clock+604803,base);assert.equal(store.account('42',base,'99',clock+604803).blocked,false);assert.equal(store.audit().length,3);
  }finally{database.close();}
});
test('delivery counts and durations are monitoring metrics without viewer quotas',()=>{
  const {store,database}=repository();try{const clock=now();store.makeSession('x',media().author,'csrf',clock);store.delivery('42','image',1000001,clock);store.delivery('42','video',1000001,clock);const account=store.account('42',base,'99',clock);assert.equal(account.usage.imageDeliveries,1000001);assert.equal(account.usage.videoDeliverySeconds,1000001);assert.equal(account.limits.imageDeliveries,undefined);assert.equal(account.limits.videoDeliverySeconds,undefined);store.delivery('42','image',1,clock+32*86400);assert.equal(store.account('42',base,'99',clock+32*86400).usage.imageDeliveries,1);}finally{database.close();}
});
test('suspended users retain export, deletion and appeal; admin operations need authorization and CSRF',async()=>{
  const {store,database}=repository(),env=environment(store);env.OWNER_GITHUB_ID='99';try{const user=await login(store),administrator=await login(store,{id:'99',login:'operator',name:'Operator'});
    assert.equal((await handle(request('admin-users',user),env,ctx)).status,403);
    assert.equal((await handle(request('admin-set-user',{...administrator,csrf:'bad',resource:'42',body:{blocked:true,note:'Abuse',urgent:true}}),env,ctx)).status,403);
    assert.equal((await handle(request('admin-set-user',{...administrator,resource:'42',body:{blocked:true,note:'Abuse',urgent:true}}),env,ctx)).status,200);
    assert.equal((await handle(request('create-upload',{...user,body:{kind:'image',title:'Test',bytes:1024,mime:'image/png'}}),env,ctx)).status,403);
    const exported=await handle(request('export',user),env,ctx);assert.equal(exported.status,200);assert.equal((await exported.json()).identity.id,'42');
    const appeal=await handle(request('request-right',{...user,body:{kind:'appeal',message:'Please review this restriction'}}),env,ctx);assert.equal(appeal.status,201);const ticket=await appeal.json();
    assert.equal(store.rightsQueue()[0].id,ticket.id);await handle(request('admin-resolve-right',{...administrator,resource:ticket.id,body:{response:'Human review completed'}}),env,ctx);assert.equal(store.rights('42')[0].response,'Human review completed');
    assert.equal((await handle(request('erase-account',{...user,body:{}}),env,ctx)).status,202);assert.equal(store.account('42',base,'99',now()).erasing,true);
    assert.throws(()=>changes({blocked:true,note:''}),/reason_required/);
  }finally{database.close();}
});
test('rights deadlines use a calendar month and account erasure scrubs personal records after media deletion',()=>{
  const {store,database}=repository();try{const clock=Date.UTC(2026,0,31,12)/1000;store.makeSession('x',media().author,'csrf',clock);const ticket=store.requestRight('42','rectify','Correct my information',clock);assert.equal(new Date(ticket.due*1000).toISOString(),'2026-02-28T12:00:00.000Z');store.erase('42',clock);store.cleanup(clock+1);assert.equal(store.one('SELECT * FROM users WHERE id=?','42'),null);assert.equal(store.session('x',clock+1),null);assert.equal(store.rights('42').length,0);
  }finally{database.close();}
});

test('documented sharing suspension stops public delivery without erasing media and can be appealed',async()=>{
  const {store,database}=repository(),env=environment(store);env.OWNER_GITHUB_ID='99';try{const clock=now(),user=await login(store);store.reserve(media(),limits,clock);store.attach(media().id,'provider-id-123456789012345','https://upload.imagedelivery.net/a',clock);store.publish(media().id,'42',0,clock);store.setAccount('42',{sharingBlocked:true,urgent:true,note:'Documented bulk commercial abuse'},'99','99',clock,base);
    assert.equal((await handle(request('get',{resource:media().id}),env,ctx)).status,403);assert.equal(store.get(media().id).state,'published');assert.equal((await handle(request('export',user),env,ctx)).status,200);assert.equal((await handle(request('request-right',{...user,body:{kind:'appeal',message:'Please review'}}),env,ctx)).status,201);
    store.setAccount('42',{sharingBlocked:false,note:'Human review accepted appeal'},'99','99',clock,base);assert.equal((await handle(request('get',{resource:media().id}),env,ctx)).status,200);
  }finally{database.close();}
});
