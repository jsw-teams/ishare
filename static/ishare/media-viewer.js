import {mountGallery} from '@jsw-teams/media-viewer/gallery';
import {preparePreview} from './preview.js';
import {messages} from './i18n.js';
if(document.documentElement.classList.contains('embedded')&&window.parent!==window){
 let parentOrigin=null,lastHeight=0,scheduled=0;
 const report=()=>{scheduled=0;if(!parentOrigin)return;const height=Math.ceil(document.querySelector('main').getBoundingClientRect().height);if(height>=120&&height<=4096&&height!==lastHeight){lastHeight=height;window.parent.postMessage({type:'edgepress:embed-size',height},parentOrigin);}};
 const schedule=()=>{if(!scheduled)scheduled=requestAnimationFrame(report);};
 window.addEventListener('message',event=>{
  if(event.source!==window.parent||event.origin==='null'||!/^https?:\/\//.test(event.origin)||event.data?.type!=='edgepress:embed-theme')return;
  parentOrigin=event.origin;const aliases={'--paper':'--bg'},keys=new Set(['--accent','--ink','--muted','--line','--paper','--surface']);
  for(const [key,value] of Object.entries(event.data.colors||{}))if(keys.has(key)&&typeof value==='string'&&value.length<=160&&CSS.supports('color',value)){document.documentElement.style.setProperty(key,value);if(aliases[key])document.documentElement.style.setProperty(aliases[key],value);}
  schedule();
 });
 const observer=new ResizeObserver(schedule);observer.observe(document.querySelector('main'));window.parent.postMessage({type:'edgepress:embed-ready'},'*');
 window.addEventListener('pagehide',()=>{observer.disconnect();cancelAnimationFrame(scheduled);},{once:true});
}
for(const gallery of document.querySelectorAll('[data-gallery]')){
 const dispose=mountGallery(gallery,{labels:messages(document.documentElement.lang),onChange:({stage})=>stage.querySelectorAll('img[data-media]').forEach(preparePreview),mountVideo:async(video,{isCurrent})=>{const {mountVideo}=await import('./player.js');if(isCurrent())return mountVideo(video);}});
 window.addEventListener('pagehide',dispose,{once:true});
}
