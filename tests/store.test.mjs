import test from 'node:test';
import assert from 'node:assert/strict';
import {repository,media,limits,now} from './helpers.mjs';

test('upload reservations enforce user, daily and global storage budgets atomically',()=>{
  const {store,database}=repository();try{
    store.reserve(media(),limits,now());store.reserve(media({id:'b'.repeat(32),owner:'43'}),limits,now());
    assert.throws(()=>store.reserve(media({id:'c'.repeat(32)}),limits,now()),/storage_quota/);
    store.failed('a'.repeat(32));store.reserve(media({id:'c'.repeat(32)}),limits,now());
    assert.throws(()=>store.reserve(media({id:'d'.repeat(32)}),{...limits,defaults:{...limits.defaults,dailyUploads:2}},now()),/upload_quota/);
    assert.throws(()=>store.reserve(media({id:'e'.repeat(32),kind:'video',duration:121}),{...limits,defaults:{...limits.defaults,videoDuration:180}},now()),/storage_quota/);
  }finally{database.close();}
});
test('ownership, processing state, duration and uncertain outcomes keep quotas safe',()=>{
  const {store,database}=repository();try{
    store.reserve(media({kind:'video',duration:120}),limits,now());
    assert.throws(()=>store.publish('a'.repeat(32),'42',20,now()),/invalid_state/);
    store.attach('a'.repeat(32),'upstream-identifier-123456','https://upload.cloudflarestream.com/temporary',now());
    assert.throws(()=>store.publish('a'.repeat(32),'other',20,now()),/not_found/);
    assert.throws(()=>store.publish('a'.repeat(32),'42',121,now()),/invalid_duration/);
    assert.equal(store.publish('a'.repeat(32),'42',30,now()).duration,30);
    store.reserve(media({id:'b'.repeat(32)}),limits,now());store.uncertain('b'.repeat(32));
    store.cleanup(now()+200000);assert.equal(store.get('b'.repeat(32)).state,'uncertain');assert.equal(store.get('a'.repeat(32)).state,'published');
    assert.throws(()=>store.prepareRemoval('a'.repeat(32),'other',false,[],false),/not_found/);
    store.prepareRemoval('a'.repeat(32),'42',false,[],false);assert.equal(store.get('a'.repeat(32)).state,'deleting');store.deleted('a'.repeat(32));assert.equal(store.get('a'.repeat(32)).provider_id,null);
  }finally{database.close();}
});
test('OAuth state is single-use and expired authentication cannot create a session',()=>{
  const {store,database}=repository();try{
    store.beginAuth('state','verifier',100);assert.equal(store.consumeAuth('state',101),'verifier');assert.equal(store.consumeAuth('state',102),undefined);
    store.beginAuth('expired','verifier',100);assert.equal(store.consumeAuth('expired',701),undefined);
    store.makeSession('session',{id:'42'},'csrf',100);assert.equal(store.session('session',101).csrf,'csrf');assert.equal(store.session('session',100000),null);
    store.rate('ip-hash',1,100);assert.throws(()=>store.rate('ip-hash',1,100),/rate_limited/);
  }finally{database.close();}
});
