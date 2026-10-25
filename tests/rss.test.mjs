import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handle } from '../backend/ishare/service.js';
import { repository, environment, login, now, media, limits } from './helpers.mjs';

const site = 'https://ishare.js.gripe';
const ctx = { waitUntil() {} };
const postId = char => char.repeat(32);
const response = (env, path, options = {}) => handle(new Request(site + path, options), env, ctx);

function publish(store, id, owner, author, caption, listed, timestamp) {
  return store.createPost({
    id, owner, author, caption, mediaIds: [], listed, sourceUrl: '', sourceName: ''
  }, '99', timestamp);
}

test('live RSS distinguishes multiple authors, with safe content and no private metadata', async () => {
  const {store, database} = repository(), env = environment(store);
  env.OWNER_GITHUB_ID = '99';
  const timestamp = now();
  try {
    await login(store, { id: '42', login: 'alice', name: 'Alice & Friends' });
    await login(store, { id: '43', login: 'bob', name: 'Bob' });
    const alice = postId('a'), bob = postId('b'), unlisted = postId('c');
    publish(store, alice, '42', {id:'42', login:'alice', name:'Alice & Friends'}, 'A <script>alert(1)</script> & stories\n\nSecond paragraph', true, timestamp - 100);
    publish(store, bob, '43', {id:'43', login:'bob', name:'Bob'}, 'Bob writes for ishare', true, timestamp - 90);
    publish(store, unlisted, '42', {id:'42', login:'alice', name:'Alice & Friends'}, 'Only on my public profile', false, timestamp - 80);

    const publicFeed = await response(env, '/rss.xml');
    const xml = await publicFeed.text();
    assert.equal(publicFeed.status, 200);
    assert.match(publicFeed.headers.get('Content-Type'), /^application\/rss\+xml/);
    assert.equal(publicFeed.headers.get('Cache-Control'), 'no-store');
    assert.equal(publicFeed.headers.get('Access-Control-Allow-Origin'), '*');
    assert.match(xml, /<rss version="2\.0"/);
    assert.match(xml, /xmlns:content=/);
    assert.equal((xml.match(/<item>/g)||[]).length, 2);
    assert.ok(xml.includes('<dc:creator>Alice &amp; Friends</dc:creator>'));
    assert.ok(xml.includes('<dc:creator>Bob</dc:creator>'));
    assert.ok(xml.includes('href="' + site + '/u/42" rel="author"'));
    assert.ok(xml.includes('href="' + site + '/u/43" rel="author"'));
    assert.ok(xml.includes('/s/' + alice));
    assert.ok(xml.includes('/s/' + bob));
    assert.ok(!xml.includes('/s/' + unlisted));
    assert.ok(xml.includes('&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;'));
    assert.ok(!xml.includes('provider-id-') && !xml.includes('private-provider-'));
    assert.ok(xml.includes('Second paragraph'));
    assert.ok(!xml.includes('<script>') && !xml.includes('imagedelivery.net'));
    assert.ok(xml.includes('<pubDate>') && xml.includes('<dc:date>'));
    assert.ok(xml.includes('<content:encoded>'));
    assert.ok(xml.includes('<guid isPermaLink="true">'));

    assert.equal((await response(env, '/rss.xml', {method:'HEAD'})).status, 200);
    assert.equal(await (await response(env, '/rss.xml', {method:'HEAD'})).text(), '');
    assert.equal((await response(env, '/rss.xml', {method:'POST'})).status, 405);
    assert.equal((await response(env, '/rss.xml?from=42')).status, 400);
    // Old and locale-prefixed subscriptions must never become static 404s.
    for(const alias of ['/feed.xml','/zh-CN/rss.xml','/zh-TW/rss.xml','/en/rss.xml']){
      const redirect=await response(env,alias,{redirect:'manual'});
      assert.equal(redirect.status,308,alias);
      assert.equal(redirect.headers.get('Location'),site+'/rss.xml');
      assert.equal(redirect.headers.get('Cache-Control'),'no-store');
      assert.equal((await response(env,alias,{method:'HEAD'})).status,308);
    }
    assert.equal((await response(env,'/zh-CN/rss.xml?x=1')).status,400);
    assert.equal((await response(env,'/feed.xml',{method:'POST'})).status,405);
    assert.equal((await response(env, '/u/0/rss.xml')).status, 404);
    assert.equal((await response(env, '/u/404/rss.xml')).status, 404);

    store.setProfile('42', 'Alice <Bear>', '', timestamp);
    const authorFeed = await response(env, '/u/42/rss.xml');
    const authorXml = await authorFeed.text();
    assert.equal(authorFeed.status, 200);
    assert.ok(authorXml.includes('Alice &lt;Bear&gt; — ishare'));
    assert.equal((authorXml.match(/<item>/g)||[]).length, 2);
    assert.ok(authorXml.includes('/s/' + unlisted));
    assert.ok(!authorXml.includes('/s/' + bob));
    assert.ok(authorXml.includes('<dc:creator>Alice &amp; Friends</dc:creator>'));
    assert.ok(authorXml.includes('href="' + site + '/u/42/rss.xml" rel="self"'));

    const settings = store.quotaSettings(timestamp);
    store.setAccount('43', {sharingBlocked:true, urgent:true, note:'Review'}, '99', '99', timestamp, settings.defaults);
    assert.ok(!(await (await response(env, '/rss.xml')).text()).includes('/s/' + bob));
    store.deletePost(alice, '42');
    assert.ok(!(await (await response(env, '/rss.xml')).text()).includes('/s/' + alice));
    assert.ok(!(await (await response(env, '/u/42/rss.xml')).text()).includes('/s/' + alice));
    store.erase('42', timestamp);
    assert.equal((await response(env, '/u/42/rss.xml')).status, 404);

    const wrangler = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
    assert.ok(wrangler.assets.run_worker_first.includes('/rss.xml'), 'dynamic XML must take precedence over EdgePress static XML');
    for(const url of ['/feed.xml','/zh-CN/rss.xml','/zh-TW/rss.xml','/en/rss.xml']){
      assert.ok(wrangler.assets.run_worker_first.includes(url),url+' must reach Worker before static 404');
    }
  } finally {
    database.close();
  }
});


test('RSS includes images and videos only through public same-origin media routes', async () => {
  const {store,database}=repository(),env=environment(store),clock=now();
  env.OWNER_GITHUB_ID='99';
  try {
    await login(store,{id:'42',login:'alice',name:'Alice'});
    const imageId=postId('e'), videoId=postId('f'), shareId=postId('d');
    for(const [mediaId,kind] of [[imageId,'image'],[videoId,'video']]){
      store.reserve(media({id:mediaId,owner:'42',kind,title:'Caption <unsafe> & alt',duration:kind==='video'?30:0}),
        {...limits,images:100},clock);
      store.attach(mediaId,'private-provider-'+mediaId,'https://upload.imagedelivery.net/temporary',clock);
      store.publish(mediaId,'42',kind==='video'?30:0,clock);
    }
    store.createPost({
      id:shareId,owner:'42',author:{id:'42',login:'alice',name:'Alice'},
      caption:'See both attachments',mediaIds:[imageId,videoId],listed:true,sourceUrl:'',sourceName:''
    },'99',clock);
    const xml=await (await response(env,'/rss.xml')).text();
    assert.ok(xml.includes(site+'/i/'+imageId+'/public'));
    assert.ok(xml.includes(site+'/v/'+videoId+'/thumbnail'));
    assert.ok(xml.includes(site+'/s/'+videoId));
    assert.ok(xml.includes('&amp;lt;unsafe&amp;gt;'));
    assert.ok(xml.includes('<category>video</category>'));
    assert.ok(xml.includes('<category>image</category>'));
    assert.ok(!xml.includes('private-provider-'));
    assert.ok(!xml.includes('upload.imagedelivery.net'));
    assert.ok(!xml.includes('master.m3u8'));
  } finally {
    database.close();
  }
});
