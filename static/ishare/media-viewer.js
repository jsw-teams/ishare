import {watchImage} from './media.js';
import {mountVideo} from './player.js';
import {messages} from './i18n.js';
const t=messages(document.documentElement.lang);
for(const gallery of document.querySelectorAll('[data-gallery]')){
 const stage=gallery.querySelector('.gallery-stage'),slides=[...gallery.querySelectorAll('template')],previous=gallery.querySelector('[data-previous]'),next=gallery.querySelector('[data-next]'),counter=gallery.querySelector('.gallery-count');let index=0,dispose=()=>{},touch=null;
 previous.setAttribute('aria-label',t.previousAttachment);next.setAttribute('aria-label',t.nextAttachment);stage.setAttribute('aria-label',t.attachments);
 function mount(){const image=stage.querySelector('img[data-media]'),video=stage.querySelector('video');if(image)watchImage(image);dispose=video?mountVideo(video):()=>{};previous.disabled=index===0;next.disabled=index===slides.length-1;counter.textContent=(index+1)+' / '+slides.length;}
 function show(value){if(value<0||value>=slides.length||value===index)return;dispose();index=value;stage.replaceChildren(slides[index].content.cloneNode(true));stage.getAnimations().forEach(animation=>animation.cancel());stage.animate([{opacity:.4,transform:'translateY(5px)'},{opacity:1,transform:'none'}],{duration:matchMedia('(prefers-reduced-motion:reduce)').matches?0:180});mount();}
 previous.addEventListener('click',()=>show(index-1));next.addEventListener('click',()=>show(index+1));
 stage.addEventListener('keydown',event=>{if(event.target!==stage||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();show(index+(event.key==='ArrowLeft'?-1:1));});
 stage.addEventListener('touchstart',event=>{const point=event.touches[0];touch={x:point.clientX,y:point.clientY};},{passive:true});
 stage.addEventListener('touchend',event=>{if(!touch)return;const point=event.changedTouches[0],dx=point.clientX-touch.x,dy=point.clientY-touch.y;touch=null;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.4)show(index+(dx<0?1:-1));},{passive:true});
 window.addEventListener('pagehide',()=>dispose(),{once:true});mount();
}
