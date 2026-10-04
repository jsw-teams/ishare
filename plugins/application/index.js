import {readFile} from 'node:fs/promises';
import {messages} from '../../static/ishare/i18n.js';
import {localizedUrl} from 'edgepress/src/i18n.js';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function translate(html,locale){const text=messages(locale);return html.replace(/(<[a-z][^>]*\bdata-i18n="([^"]+)"[^>]*>)([^<]*)(<\/[^>]+>)/gi,(_m,start,key,_value,end)=>start+escape(text[key]||key)+end);}
export default function application(api){
  api.registerFilter('html:beforeLayout',async(html,{page,config})=>{
    if(page.urlPath===localizedUrl(config,page.locale,''))return translate(await readFile(new URL('./application.html',import.meta.url),'utf8'),page.locale);
    if(page.urlPath===localizedUrl(config,page.locale,'mine/'))return translate(await readFile(new URL('./mine.html',import.meta.url),'utf8'),page.locale);
    if(page.urlPath===localizedUrl(config,page.locale,'admin/'))return translate(await readFile(new URL('./admin.html',import.meta.url),'utf8'),page.locale);
    if(page.urlPath===localizedUrl(config,page.locale,'profile/'))return translate(await readFile(new URL('./profile.html',import.meta.url),'utf8'),page.locale);
    if(page.urlPath===localizedUrl(config,page.locale,'appeal/'))return translate(await readFile(new URL('./appeal.html',import.meta.url),'utf8'),page.locale);
    return html;
  });
  api.registerFilter('html:afterLayout',(html,{page,config})=>{
    html=translate(html,page.locale);
    const brand=messages(page.locale).brand;
    html=html.replaceAll('<span>ishare</span>','<span>'+brand+'</span>').replaceAll('aria-label="ishare"','aria-label="'+brand+'"').replaceAll('content="ishare"','content="'+brand+'"').replaceAll(' - ishare</title>',' - '+brand+'</title>');
    for(const path of ['mine/','guide/','admin/','profile/','appeal/'])html=html.replaceAll('href="/'+path+'"','href="'+localizedUrl(config,page.locale,path)+'"');
    html=html.replaceAll('class="brand" href="/"','class="brand" href="'+localizedUrl(config,page.locale,'')+'"');
    if(html.includes('id="publish-form"'))return html.replace('</body>','<script type="module" src="/ishare/app.js"></script></body>');
    if(html.includes('id="admin-gate"'))return html.replace('</body>','<script type="module" src="/ishare/admin-page.js"></script></body>');
    if(html.includes('id="appeal-form"'))return html.replace('</body>','<script type="module" src="/ishare/appeal.js"></script></body>');
    if(html.includes('id="profile-form"'))return html.replace('</body>','<script type="module" src="/ishare/profile.js"></script></body>');
    if(html.includes('id="public-profile"'))return html.replace('</body>','<script type="module" src="/ishare/public-profile.js"></script></body>');
    if(html.includes('id="feed"'))return html.replace('</body>','<script type="module" src="/ishare/feed.js"></script></body>');
    // Privacy pages do not initialize the publishing application or call /api.
    return html.replace(/<div class="account-controls">[\s\S]*?<\/details><\/div>/,'');
  });
  api.registerGenerator('ishare-assets',async({config,renderLayout})=>[
    ...await Promise.all(['en','zh-CN','zh-TW'].map(async locale=>({path:'profile-shell-'+locale+'.html',body:await renderLayout({title:'PROFILE_NAME_TOKEN',locale,urlPath:'/profile-shell-'+locale+'.html',structuredData:false},translate(await readFile(new URL('./public-profile.html',import.meta.url),'utf8'),locale))}))),
    {path:'assets.json',contentType:'application/json',body:JSON.stringify({app:config.assetManifest['/ishare/app.js'],media:config.assetManifest['/ishare/media-viewer.js'],avatars:config.assetManifest['/ishare/avatars.js'],style:config.assetManifest['/style.css'],shells:Object.fromEntries(['en','zh-CN','zh-TW'].map(locale=>[locale,'/share-shell-'+locale+'.html']))})},
    ...await Promise.all(['en','zh-CN','zh-TW'].map(async locale=>({path:'share-shell-'+locale+'.html',body:await renderLayout({title:'ISHARE_TITLE_TOKEN',locale,urlPath:'/share-shell-'+locale+'.html',structuredData:false},'ISHARE_BODY_TOKEN')})))
  ]);
}
