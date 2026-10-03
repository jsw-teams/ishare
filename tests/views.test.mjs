import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderPage} from '../backend/cloudflare/views.js';
test('public and embedded media use the EdgePress shell, escape content and keep business UI out of viewers',async()=>{
 const site='https://share.js.gripe',env={SITE_ORIGIN:site,ASSETS:{fetch:async request=>new Response(await readFile('dist'+new URL(request.url).pathname))}};
 const item={id:'a'.repeat(32),kind:'video',title:'<script>bad()</script>',caption:'Caption <img src=x onerror=bad()>',author:JSON.stringify({id:'42',name:'Author',login:'author'}),source_name:'Source',source_url:'https://example.com/original',created:1,published:2,state:'published',provider_id:'private-upstream-uid'};
 const response=await renderPage(item,env),html=await response.text();assert.equal(response.status,200);assert.match(html,/<nav aria-label="Main navigation"/);assert.match(html,/href="https:\/\/js.gripe"/);assert.match(html,/&lt;script&gt;bad\(\)&lt;\/script&gt;/);assert.match(html,/Caption &lt;img/);assert.doesNotMatch(html,/ISHARE_[A-Z_]+_TOKEN|private-upstream-uid|publish-form|id="site-language"|<script>bad/);assert.equal((html.match(/<!doctype html>/gi)||[]).length,1);assert.match(html,/\/ishare\/player\.[a-f0-9]{16}\.js/);
 const embedded=await renderPage(item,env,true),frame=await embedded.text();assert.match(frame,/class="embedded"/);assert.doesNotMatch(frame,/<header|<footer class="site-footer"|edgepress-privacy-config/);assert.match(embedded.headers.get('Content-Security-Policy'),/frame-ancestors https:/);
});
