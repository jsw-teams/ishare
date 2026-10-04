import {messages} from './i18n.js';
const dictionary=messages(document.documentElement.lang),t=key=>dictionary[key]||key;
export function mediaFeedback(element,retry){
 const box=document.createElement('div'),icon=document.createElement('span'),message=document.createElement('p'),button=document.createElement('button');
 box.className='media-feedback';box.hidden=true;box.setAttribute('role','status');icon.className='media-feedback-icon';icon.textContent='!';icon.setAttribute('aria-hidden','true');button.type='button';button.textContent=t('retryMedia');box.append(icon,message,button);element.after(box);
 button.addEventListener('click',()=>{button.disabled=true;message.textContent=t('loading');retry();});
 return {failed(key){element.hidden=true;element.setAttribute('aria-invalid','true');box.hidden=false;message.textContent=t(key);button.disabled=false;},ready(){element.hidden=false;element.removeAttribute('aria-invalid');box.hidden=true;button.disabled=false;}};
}
export function watchImage(image){
 // Keep the retry button outside the attachment's share link.
 const link=image.closest('a'),source=image.getAttribute('src'),anchor=link||image;
 const feedback=mediaFeedback(anchor,()=>{image.loading='eager';image.removeAttribute('src');image.src=source;});
 image.addEventListener('error',()=>feedback.failed('imageUnavailable'));
 image.addEventListener('load',()=>feedback.ready());
 if(image.complete&&image.naturalWidth===0)feedback.failed('imageUnavailable');
 return feedback;
}
