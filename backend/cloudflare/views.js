import { escape, https, headers, fail } from './security.js';

export function publicRecord(item,site) {
  if(item.kind==='post'){const legacy=publicRecord({...item,kind:'image'},site),media=[...item.media].sort((a,b)=>Number(b.kind==='video')-Number(a.kind==='video')).map(child=>publicRecord(child,site));delete legacy.title;delete legacy.mediaUrl;delete legacy.bytes;delete legacy.mime;delete legacy.duration;return {...legacy,kind:'post',listed:!!item.listed,media,markdown:media.map(child=>child.kind==='image'?`![${markdownAlt(child.title)}](${child.mediaUrl})`:`[${markdownAlt(child.title)}](${child.shareUrl})`).join('\n\n'),embedCode:oembedCode(item,site)};}
  const author=JSON.parse(item.author);
  const mediaUrl=site+(item.kind==='image'?'/i/'+item.id+'/public':'/v/'+item.id+'/master.m3u8');
  return {id:item.id,kind:item.kind,title:item.title,caption:item.caption||'',author:{id:author.id,name:author.name,login:author.login,url:site+'/u/'+author.id,githubUrl:'https://github.com/'+author.login},source:{name:item.source_name,url:item.source_url},created:item.created,published:item.published,state:item.state,bytes:item.bytes,mime:item.mime,duration:item.duration,shareUrl:site+'/s/'+item.id,embedUrl:site+'/embed/'+item.id,mediaUrl,embedCode:oembedCode(item,site),markdown:item.kind==='image'?`![${markdownAlt(item.title)}](${mediaUrl})`:`[${markdownAlt(item.title)}](${site}/s/${item.id})`};
}
const postLabel=item=>(item.caption||'').trim().split('\n')[0].slice(0,100)||'ishare';
const markdownAlt=value=>String(value).replace(/[\\\[\]\r\n]/g,' ');
export function oembedCode(item,site,width=640,height=480){return `<iframe src="${site}/embed/${item.id}" title="${escape(item.kind==='post'?postLabel(item):item.title)}" width="${width}" height="${height}" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-presentation" allow="fullscreen" allowfullscreen></iframe>`;}
export function oembed(item,site,width=640,height=480) {
  width=Math.max(160,Math.min(1920,width));height=Math.max(120,Math.min(1440,height));
  const record=publicRecord(item,site);
  return {version:'1.0',type:item.kind==='video'?'video':'rich',title:item.kind==='post'?postLabel(item):item.title,author_name:record.author.name||record.author.login,author_url:record.author.url,provider_name:'ishare',provider_url:site,width,height,html:`<iframe src="${record.embedUrl}" title="${escape(item.kind==='post'?postLabel(item):item.title)}" width="${width}" height="${height}" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-presentation" allow="fullscreen" allowfullscreen></iframe>`};
}
export function shareId(address,site) {
  const url=https(address);if(url.origin!==site||url.search||url.hash||!/^\/s\/[a-f0-9]{32}$/.test(url.pathname))fail('invalid_share_url',404);
  return url.pathname.slice(3);
}
export async function renderPage(item,env,site,embedded=false,preferred='en') {
  const locale=localeFor(preferred),record=publicRecord(item,site),assetResponse=await env.ASSETS.fetch(new Request(site+'/assets.json'));
  if(!assetResponse.ok)fail('assets_unavailable',503);const assets=await assetResponse.json();
  const attachments=item.kind==='post'?record.media:[record],firstImage=attachments.find(child=>child.kind==='image');
  const figures=attachments.map(child=>`<figure class="post-attachment">${child.kind==='image'?`<img data-media data-original="${site}/i/${child.id}/original" src="${child.mediaUrl}" srcset="${site}/i/${child.id}/thumbnail 640w, ${site}/i/${child.id}/medium 1280w, ${child.mediaUrl} 2048w" sizes="(max-width: 720px) 100vw, 720px" loading="lazy" alt="${escape(child.title)}" decoding="async">`:`<video playsinline preload="none" poster="${site}/v/${child.id}/thumbnail" data-duration="${Number(child.duration)||0}" data-source="${child.mediaUrl}" aria-label="${escape(child.title)}"></video>`}</figure>`);
  const media=figures.length?`<div class="media-gallery" data-gallery><div class="gallery-stage" tabindex="0" aria-label="Media">${figures[0]}</div>${figures.map(figure=>`<template>${figure}</template>`).join('')}<div class="gallery-navigation" ${figures.length<2?'hidden':''}><button type="button" data-previous aria-label="Previous attachment">‹</button><span class="gallery-count" role="status" aria-live="polite">1 / ${figures.length}</span><button type="button" data-next aria-label="Next attachment">›</button></div></div>`:'';
  const attribution=`<footer class="attribution"><a href="${record.author.url}" target="_blank" rel="noopener noreferrer" class="author-link"><img width="32" height="32" alt="" src="/brand/bear-favicon.52039e84b2f38015.png" data-author-avatar="${record.author.id}">${escape(record.author.name||record.author.login)}</a>${record.source.url?`<span> / </span><a href="${escape(record.source.url)}" target="_blank" rel="noopener noreferrer">${escape(record.source.name||'Source')}</a>`:''}<a href="${record.shareUrl}" target="_blank" rel="noopener noreferrer">ishare</a></footer>`;
  const discovery=`<link rel="alternate" type="application/json+oembed" href="${site}/oembed?url=${encodeURIComponent(record.shareUrl)}">`;
  const shell=await env.ASSETS.fetch(new Request(site+assets.shells[locale]));if(!shell.ok)fail('assets_unavailable',503);
  const content=`${!embedded?'<h1 class="visually-hidden">ishare</h1>':''}<article class="shared-post">${media}${item.caption?`<p class="caption">${escape(item.caption)}</p>`:''}${attribution}</article>${!embedded?`<section class="share-tools" aria-label="Share"><label>Share URL<input readonly value="${record.shareUrl}"></label><label>Embed code<textarea readonly rows="3">${escape(oembed(item,site).html)}</textarea></label>${record.markdown?`<label>Markdown<textarea readonly rows="6">${escape(record.markdown)}</textarea></label>`:''}</section>`:''}`;
  const source=(await shell.text()).replace(firstImage?/<meta property="og:image"[^>]*>/g:/$^/g,'');
  let body=source.replaceAll('ISHARE_TITLE_TOKEN',escape(item.kind==='post'?postLabel(item):item.title)).replace(/https:\/\/[^"<>]+\/share-shell-[a-zA-Z-]+\.html/g,record.shareUrl).replace('ISHARE_BODY_TOKEN',content).replace('id="main"','id="main" class="viewer"').replace('</head>',`${attachments.length?`<link rel="stylesheet" href="${assets.playerStyle}">`:''}${discovery}<meta property="og:title" content="${escape(item.kind==='post'?postLabel(item):item.title)}"><meta property="og:type" content="${item.kind==='video'?'video.other':'article'}"><meta property="og:url" content="${record.shareUrl}">${firstImage?`<meta property="og:image" content="${site}/i/${firstImage.id}/thumbnail">`:''}</head>`);
  if(attachments[0]?.kind==='video')body=body.replace('</head>',`<link rel="preload" as="image" href="${site}/v/${attachments[0].id}/thumbnail"></head>`);
  body=body.replace(/<select id="site-language"[\s\S]*?<\/select>/,'');
  if(embedded)body=body.replace(/<html lang="([^"]+)">/,'<html lang="$1" class="embedded">').replace(/<header\b[\s\S]*?<\/header>/,'').replace(/<footer class="site-footer"[\s\S]*?<\/footer>/,'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
  if(assets.avatars)body=body.replace('</body>',`<script type="module" src="${assets.avatars}"></script></body>`);
  if(attachments.length)body=body.replace('</body>',`<script type="module" src="${assets.media}"></script></body>`);

  return new Response(body,{headers:headers({'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=30',Vary:'Accept-Language','Content-Security-Policy':`default-src 'none'; img-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self'; media-src 'self' blob:; worker-src blob:; base-uri 'none'; form-action 'none'; frame-ancestors ${embedded?'https:':"'none'"}`},embedded)});
}

function localeFor(preferred){const first=(preferred||'en').split(',')[0];return /^zh-(TW|HK|Hant)/i.test(first)?'zh-TW':/^zh/i.test(first)?'zh-CN':'en';}
export async function renderProfile(profile,env,site,preferred='zh-CN'){
 const locale=localeFor(preferred);
 const shell=await env.ASSETS.fetch(new Request(site+'/profile-shell-'+locale+'.html'));if(!shell.ok)fail('assets_unavailable',503);
 const values={PROFILE_NAME_TOKEN:profile.displayName,PROFILE_BIO_TOKEN:profile.bio,PROFILE_ID_TOKEN:profile.id};
 const body=(await shell.text()).replace(/PROFILE_(NAME|BIO|ID)_TOKEN/g,key=>escape(values[key])).replace(/https:\/\/[^"<>]+\/profile-shell-[a-zA-Z-]+\.html/g,site+'/u/'+profile.id).replace(/<select id="site-language"[\s\S]*?<\/select>/,'');
 return new Response(body,{headers:headers({'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=30',Vary:'Accept-Language','Content-Security-Policy':"default-src 'self'; img-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"})});
}
