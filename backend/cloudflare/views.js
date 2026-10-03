import { escape, https, origin, headers, fail } from './security.js';

export function publicRecord(item,env) {
  const site=origin(env.SITE_ORIGIN),author=JSON.parse(item.author);
  return {id:item.id,kind:item.kind,title:item.title,caption:item.caption||'',author:{id:author.id,name:author.name,login:author.login,url:'https://github.com/'+author.login},source:{name:item.source_name,url:item.source_url},created:item.created,published:item.published,state:item.state,bytes:item.bytes,mime:item.mime,duration:item.duration,shareUrl:site+'/s/'+item.id,embedUrl:site+'/embed/'+item.id,mediaUrl:site+(item.kind==='image'?'/i/'+item.id+'/public':'/v/'+item.id+'/master.m3u8')};
}
export function oembed(item,env,width=640,height=480) {
  width=Math.max(160,Math.min(1920,width));height=Math.max(120,Math.min(1440,height));
  const record=publicRecord(item,env);
  return {version:'1.0',type:item.kind==='video'?'video':'rich',title:item.title,author_name:record.author.name||record.author.login,author_url:record.author.url,provider_name:'ishare',provider_url:origin(env.SITE_ORIGIN),width,height,html:`<iframe src="${record.embedUrl}" title="${escape(item.title)}" width="${width}" height="${height}" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-presentation" allow="fullscreen" allowfullscreen></iframe>`};
}
export function shareId(address,env) {
  const url=https(address);if(url.origin!==origin(env.SITE_ORIGIN)||url.search||url.hash||!/^\/s\/[a-f0-9]{32}$/.test(url.pathname))fail('invalid_share_url',404);
  return url.pathname.slice(3);
}
export async function renderPage(item,env,embedded=false) {
  const record=publicRecord(item,env),assetResponse=await env.ASSETS.fetch(new Request(origin(env.SITE_ORIGIN)+'/assets.json'));
  if(!assetResponse.ok)fail('assets_unavailable',503);const assets=await assetResponse.json();
  const media=item.kind==='image'?`<img src="${record.mediaUrl}" alt="${escape(item.title)}" decoding="async">`:`<video controls playsinline preload="none" data-source="${record.mediaUrl}" aria-label="${escape(item.title)}"><p><a href="${record.mediaUrl}">Open video</a></p></video>`;
  const attribution=`<footer class="attribution"><a href="${record.author.url}" target="_blank" rel="noopener noreferrer">${escape(record.author.name||record.author.login)} (@${escape(record.author.login)})</a>${record.source.url?`<span> / </span><a href="${escape(record.source.url)}" target="_blank" rel="noopener noreferrer">${escape(record.source.name||'Source')}</a>`:''}<a href="${record.shareUrl}" target="_blank" rel="noopener noreferrer">ishare</a></footer>`;
  const discovery=`<link rel="alternate" type="application/json+oembed" href="${origin(env.SITE_ORIGIN)}/oembed?url=${encodeURIComponent(record.shareUrl)}">`;
  const body=`<!doctype html><html lang="en"${embedded?' class="embedded"':''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(item.title)} | ishare</title><link rel="canonical" href="${record.shareUrl}">${discovery}<link rel="stylesheet" href="${assets.style}"><meta property="og:title" content="${escape(item.title)}"><meta property="og:type" content="${item.kind==='video'?'video.other':'article'}"><meta property="og:url" content="${record.shareUrl}">${item.kind==='image'?`<meta property="og:image" content="${origin(env.SITE_ORIGIN)}/i/${item.id}/thumbnail">`:''}</head><body>${!embedded?'<a class="skip" href="#main">Skip to media</a><header class="topbar"><a href="/">ishare</a><a href="/privacy.html">Privacy</a></header>':''}<main id="main" class="viewer">${!embedded?`<h1>${escape(item.title)}</h1>`:''}<figure>${media}${item.caption?`<figcaption class="caption">${escape(item.caption)}</figcaption>`:''}${attribution}</figure>${!embedded?`<section class="share-tools" aria-label="Share"><label>Share URL<input readonly value="${record.shareUrl}"></label><label>Embed code<textarea readonly rows="3">${escape(oembed(item,env).html)}</textarea></label><p>Source information is supplied by the publisher. A GitHub identity does not verify ownership of a website.</p></section>`:''}</main>${item.kind==='video'?`<script type="module" src="${assets.player}"></script>`:''}</body></html>`;
  return new Response(body,{headers:headers({'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=30','Content-Security-Policy':`default-src 'none'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; media-src 'self' blob:; worker-src blob:; base-uri 'none'; form-action 'none'; frame-ancestors ${embedded?'https:':"'none'"}`},embedded)});
}
