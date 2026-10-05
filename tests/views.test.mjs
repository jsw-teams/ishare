import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderPage} from '../backend/cloudflare/views.js';
test('public and embedded media use the EdgePress shell, escape content and keep business UI out of viewers',async()=>{
 const site='https://ishare.js.gripe',env={ASSETS:{fetch:async request=>new Response(await readFile('dist'+new URL(request.url).pathname))}};
 const item={id:'a'.repeat(32),kind:'video',title:'<script>bad()</script>',caption:'Caption <img src=x onerror=bad()>',author:JSON.stringify({id:'42',name:'Author',login:'author'}),source_name:'Source',source_url:'https://example.com/original',created:1,published:2,state:'published',provider_id:'private-upstream-uid'};
 const response=await renderPage(item,env,site),html=await response.text();assert.equal(response.status,200);assert.match(html,/<nav aria-label="Main navigation"/);assert.match(html,/href="https:\/\/js.gripe"/);assert.match(html,/&lt;script&gt;bad\(\)&lt;\/script&gt;/);assert.match(html,/Caption &lt;img/);assert.doesNotMatch(html,/ISHARE_[A-Z_]+_TOKEN|private-upstream-uid|publish-form|id="site-language"|<script>bad/);assert.equal((html.match(/<!doctype html>/gi)||[]).length,1);assert.match(html,/\/ishare\/media-viewer\.[a-f0-9]{16}\.js/);
 const embedded=await renderPage(item,env,site,true),frame=await embedded.text();assert.match(frame,/class="embedded"/);assert.doesNotMatch(frame,/<header|<footer class="site-footer"|edgepress-privacy-config/);assert.match(embedded.headers.get('Content-Security-Policy'),/frame-ancestors https:/);
});


test('localized post viewers derive discovery metadata from the caption without rendering a duplicate heading or GitHub handle',async()=>{
 const site='https://ishare.js.gripe',env={ASSETS:{fetch:async req=>new Response(await readFile('dist'+new URL(req.url).pathname))}},post={id:'b'.repeat(32),kind:'post',caption:'Only this story',author:JSON.stringify({id:'42',name:'Bear',login:'jsw-teams'}),media:[],source_name:'',source_url:'',created:1,published:2,state:'published'};
 for(const locale of ['en','zh-CN','zh-TW']){const response=await renderPage(post,env,site,true,locale),html=await response.text();assert.match(html,new RegExp('<html lang="'+locale+'" class="embedded">'));assert.match(html,/<p class="caption">Only this story<\/p>/);assert.doesNotMatch(html,/<h1|post-title|@jsw-teams|share-shell|undefined/);assert.match(response.headers.get('Vary'),/Accept-Language/);}
});


test('post images are lazy previews with explicit originals and video poster and duration are available before playing',async()=>{
 const site='https://ishare.js.gripe',env={ASSETS:{fetch:async request=>new Response(await readFile('dist'+new URL(request.url).pathname))}},base={author:JSON.stringify({id:'42',name:'Bear',login:'bear'}),caption:'',title:'Attachment',source_name:'',source_url:'',created:1,published:2,state:'published'},post={...base,id:'c'.repeat(32),kind:'post',media:[{...base,id:'a'.repeat(32),kind:'image'},{...base,id:'b'.repeat(32),kind:'video',duration:119}]};
 const html=await(await renderPage(post,env,site)).text();assert.match(html,/<link rel="preload" as="image" href="https:\/\/ishare.js.gripe\/v\/[a-f0-9]+\/thumbnail">/);assert.match(html,/<video[^>]+data-duration="119"/);assert.match(html,/<img data-media[^>]+data-original="https:\/\/ishare.js.gripe\/i\/[a-f0-9]+\/original"[^>]+src="https:\/\/ishare.js.gripe\/i\/[a-f0-9]+\/public"[^>]+loading="lazy"/);
});
