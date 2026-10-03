import { build } from 'esbuild';
import { mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
await mkdir('dist/assets',{recursive:true});
for(const name of await readdir('dist/assets'))if(/^(?:app|player|style)\.[a-f0-9]{16}\.(?:js|css)$/.test(name))await unlink('dist/assets/'+name);
const assets={};
for(const name of ['app','player']){
  const result=await build({entryPoints:['static/'+name+'.js'],bundle:true,minify:true,format:'esm',target:['es2022'],write:false,legalComments:'eof'});
  const data=result.outputFiles[0].contents,hash=createHash('sha256').update(data).digest('hex').slice(0,16),path='/assets/'+name+'.'+hash+'.js';
  await writeFile('dist'+path,data);assets[name]=path;
}
const css=await readFile('static/style.css'),hash=createHash('sha256').update(css).digest('hex').slice(0,16);assets.style='/assets/style.'+hash+'.css';await writeFile('dist'+assets.style,css);
for(const page of ['index','privacy']){let html=await readFile('static/'+page+'.html','utf8');for(const[key,value]of Object.entries(assets))html=html.replaceAll('{{'+key+'}}',value);await writeFile('dist/'+page+'.html',html);}
await writeFile('dist/404.html','<!doctype html><html lang="en"><meta charset="utf-8"><title>404</title><h1>404</h1><a href="/">ishare</a></html>');
await writeFile('dist/assets.json',JSON.stringify(assets));
await writeFile('dist/_headers',`/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self' https://upload.imagedelivery.net https://upload.videodelivery.net; media-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'\n  Cache-Control: public, max-age=0, must-revalidate\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n`);
console.log('Built hashed frontend assets and static pages.');
