export function postPreview(item,t){
  const card=document.createElement('article');card.className='post-card';
  const heading=document.createElement('h3'),link=document.createElement('a');link.href=item.shareUrl;link.textContent=item.title;heading.append(link);card.append(heading);
  if(item.caption){const caption=document.createElement('p');caption.className='post-caption';caption.textContent=item.caption;card.append(caption);}
  const media=document.createElement('div');media.className='post-grid';
  for(const attachment of item.kind==='post'?item.media:[item]){
    const link=document.createElement('a');link.href=attachment.shareUrl;
    if(attachment.kind==='image'){const img=document.createElement('img');img.src='/i/'+attachment.id+'/thumbnail';img.alt=attachment.title;img.loading='lazy';img.decoding='async';link.append(img);}
    else{link.className='video-card';link.textContent='▶ '+t('openVideo')+' — '+attachment.title;}
    media.append(link);
  }
  card.append(media);
  const author=document.createElement('p');author.className='hint';author.textContent='@'+item.author.login+' / '+new Date((item.published||item.created)*1000).toLocaleString();card.append(author);return card;
}
export function emptyState(root,message){const box=document.createElement('div'),img=document.createElement('img'),p=document.createElement('p');box.className='empty-library';img.src=root.dataset.emptyMascot;img.alt='';img.width=135;img.height=135;p.textContent=message;box.append(img,p);root.append(box);}
