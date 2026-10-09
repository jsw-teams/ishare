import {icons} from './icons.js';
import {avatarFor} from './account.js';
import {preparePreview} from './preview.js';
export function postPreview(item,t){
  const card=document.createElement('article');card.className='post-card';
  const attachments=item.kind==='post'?item.media:[item],first=attachments[0];
  if(first){
    const media=document.createElement('div'),link=document.createElement('a'),img=document.createElement('img');media.className='post-preview';link.href=item.shareUrl;link.setAttribute('aria-label',t('openPost'));
    img.alt=first.title||t('openPost');img.loading='lazy';img.decoding='auto';
    const activate=()=>{img.src='/'+(first.kind==='image'?'i':'v')+'/'+first.id+'/thumbnail';if(first.kind==='image'){img.dataset.previewSrcset='/i/'+first.id+'/thumbnail 640w, /i/'+first.id+'/medium 1280w';img.sizes='(max-width: 720px) 100vw, 600px';preparePreview(img);}link.prepend(img);void import('./media.js').then(({watchImage})=>watchImage(img));};
    const placeholder=window.edgepressDataSaver?.deferMedia(link,activate,img.alt);if(!window.edgepressDataSaver)activate();
    if(first.kind==='video'){const badge=document.createElement('span');badge.className='video-badge';badge.innerHTML=icons.play;badge.append(document.createTextNode(t('openVideo')));link.append(badge);}
    if(attachments.length>1){const count=document.createElement('span');count.className='attachment-count';count.textContent='1 / '+attachments.length;link.append(count);}
    media.append(placeholder||link);if(placeholder){const open=document.createElement('a');open.href=item.shareUrl;open.textContent=t('openPost');media.append(open);}card.append(media);
  }
  if(item.caption){const caption=document.createElement('p'),link=document.createElement('a');caption.className='post-caption';link.href=item.shareUrl;link.textContent=item.caption;caption.append(link);card.append(caption);}
  else if(!first){const link=document.createElement('a');link.href=item.shareUrl;link.textContent=t('openPost');card.append(link);}
  const author=document.createElement('p');author.className='post-author';const person=document.createElement('a'),portrait=document.createElement('img'),name=document.createElement('span'),date=document.createElement('time');person.href='/u/'+item.author.id;name.textContent=item.author.name||item.author.login;person.setAttribute('aria-label',name.textContent);if(window.edgepressDataSaver?.mode!=='text'){portrait.src='/brand/bear-favicon.52039e84b2f38015.png';portrait.alt='';portrait.width=32;portrait.height=32;person.append(portrait);avatarFor(item.author.id,portrait);}person.append(name);date.dateTime=new Date((item.published||item.created)*1000).toISOString();date.textContent=new Date((item.published||item.created)*1000).toLocaleDateString();author.append(person,date);card.append(author);return card;
}
export function emptyState(root,message){const box=document.createElement('div'),img=document.createElement('img'),p=document.createElement('p');box.className='empty-library';if(window.edgepressDataSaver?.mode!=='text'){img.src=root.dataset.emptyMascot;img.alt='';img.width=135;img.height=135;box.append(img);}p.textContent=message;box.append(p);root.append(box);}
