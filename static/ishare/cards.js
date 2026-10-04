import {avatarFor} from './account.js';
import {watchImage} from './media.js';
export function postPreview(item,t){
  const card=document.createElement('article');card.className='post-card';
  const heading=document.createElement('h3'),link=document.createElement('a');link.href=item.shareUrl;link.textContent=item.title;heading.append(link);card.append(heading);
  if(item.caption){const caption=document.createElement('p');caption.className='post-caption';caption.textContent=item.caption;card.append(caption);}
  const media=document.createElement('div');media.className='post-grid';
  for(const attachment of item.kind==='post'?item.media:[item]){
    const link=document.createElement('a');link.href=attachment.shareUrl;
    const img=document.createElement('img');img.src='/'+(attachment.kind==='image'?'i':'v')+'/'+attachment.id+'/thumbnail';img.alt=attachment.title;img.loading='lazy';img.decoding='async';link.append(img);
    if(attachment.kind==='video'){link.className='video-card';const badge=document.createElement('span');badge.className='video-badge';badge.textContent='▶ '+t('openVideo');link.append(badge);}
    const tile=document.createElement('div');tile.className='post-media-tile';tile.append(link);media.append(tile);watchImage(img);
  }
  card.append(media);
  const author=document.createElement('p');author.className='post-author';const person=document.createElement('a'),portrait=document.createElement('img'),name=document.createElement('span'),date=document.createElement('time');person.href='/u/'+item.author.id;portrait.src='/brand/bear-favicon.52039e84b2f38015.png';portrait.alt='';portrait.width=32;portrait.height=32;name.textContent=item.author.name||item.author.login;person.setAttribute('aria-label',name.textContent);person.append(portrait,name);avatarFor(item.author.id,portrait);date.dateTime=new Date((item.published||item.created)*1000).toISOString();date.textContent=new Date((item.published||item.created)*1000).toLocaleDateString();author.append(person,date);card.append(author);return card;
}
export function emptyState(root,message){const box=document.createElement('div'),img=document.createElement('img'),p=document.createElement('p');box.className='empty-library';img.src=root.dataset.emptyMascot;img.alt='';img.width=135;img.height=135;p.textContent=message;box.append(img,p);root.append(box);}
