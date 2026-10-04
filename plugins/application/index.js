import {readFile} from 'node:fs/promises';
import {messages} from '../../static/ishare/i18n.js';
import {localizedUrl} from 'edgepress/src/i18n.js';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function translate(html,locale){const text=messages(locale);return html.replace(/(<[a-z][^>]*\bdata-i18n="([^"]+)"[^>]*>)([^<]*)(<\/[^>]+>)/gi,(_m,start,key,_value,end)=>start+escape(text[key]||key)+end);}
export default function application(api){
  api.registerFilter('html:beforeLayout',async(html,{page,config})=>{
    if(page.urlPath===localizedUrl(config,page.locale,''))return translate(await readFile(new URL('./application.html',import.meta.url),'utf8'),page.locale);
    return html;
  });
  api.registerFilter('html:afterLayout',(html,{page,config})=>{
    html=translate(html,page.locale);
    html=html.replaceAll('class="brand" href="/"','class="brand" href="'+localizedUrl(config,page.locale,'')+'"');
    if(html.includes('id="publish-form"'))return html.replace('</body>','<script type="module" src="/ishare/app.js"></script></body>');
    // Privacy pages do not initialize the publishing application or call /api.
    return html.replace(/<a class="button button-primary" id="login"[\s\S]*?<span id="identity"><\/span>/,'');
  });
  api.registerGenerator('ishare-assets',async({config,renderLayout})=>[
    {path:'assets.json',contentType:'application/json',body:JSON.stringify({app:config.assetManifest['/ishare/app.js'],player:config.assetManifest['/ishare/player.js'],style:config.assetManifest['/style.css'],shell:'/share-shell.html'})},
    {path:'share-shell.html',body:await renderLayout({title:'ISHARE_TITLE_TOKEN',locale:'en',urlPath:'/share-shell.html',structuredData:false},'ISHARE_BODY_TOKEN')}
  ]);
}
