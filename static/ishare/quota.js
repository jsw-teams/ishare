const paths={image:'M8 10h20v16H8z M8 22l6-6 5 5 3-3 6 6 M22 14h.01',video:'M10 8h16v20H10z M10 13h16 M10 23h16 M10 18h16',daily:'M18 27V9 M11 16l7-7 7 7 M9 27h18'};
export function quotaCard(key,label,used,limit,format,t){
 const card=document.createElement('div');card.className='quota-card';if(limit!==null&&used>=limit)card.classList.add('quota-full');
 const fraction=limit===null?0:limit>0?Math.min(1,used/limit):1,ring=document.createElement('div');ring.className='quota-ring';
 ring.innerHTML=`<svg viewBox="0 0 72 72" width="72" height="72" fill="none" aria-hidden="true"><circle class="ring-track" cx="36" cy="36" r="31" stroke-width="5"/><circle class="ring-fill" cx="36" cy="36" r="31" stroke-width="5" stroke-linecap="round" stroke-dasharray="194.78" stroke-dashoffset="${194.78*(1-fraction)}" transform="rotate(-90 36 36)"/><g transform="translate(18 18)" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[key]||paths.image}"/></g></svg>`;
 const dt=document.createElement('dt');dt.id=key+'-quota-label';dt.textContent=label;
 const dd=document.createElement('dd');dd.id=key+'-usage';dd.textContent=format.format(used)+' / '+(limit===null?t('unlimited'):format.format(limit));
 const bar=document.createElement('progress');bar.id=key+'-quota';bar.setAttribute('aria-labelledby',dt.id);bar.setAttribute('aria-valuetext',dd.textContent);bar.max=limit||1;bar.value=limit===null?0:used;bar.className='quota-accessible';bar.hidden=limit===null;
 card.append(ring,dt,dd,bar);return card;
}
