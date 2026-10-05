import {icons} from './icons.js';
export function quotaCard(key,label,used,limit,format,t){
 const card=document.createElement('div');card.className='quota-card';if(limit!==null&&used>=limit)card.classList.add('quota-full');
 const fraction=limit===null?0:limit>0?Math.min(1,used/limit):1,ring=document.createElement('div');ring.className='quota-ring';
 ring.setAttribute('aria-hidden','true');ring.innerHTML=`<svg viewBox="0 0 72 72" width="72" height="72" fill="none" aria-hidden="true" focusable="false"><circle class="ring-track" cx="36" cy="36" r="31" stroke-width="5"/><circle class="ring-fill" cx="36" cy="36" r="31" stroke-width="5" stroke-linecap="round" stroke-dasharray="194.78" stroke-dashoffset="${194.78*(1-fraction)}" transform="rotate(-90 36 36)"/></svg>`+icons[key];
 const dt=document.createElement('dt');dt.id=key+'-quota-label';dt.textContent=label;
 const dd=document.createElement('dd');dd.id=key+'-usage';dd.textContent=format.format(used)+' / '+(limit===null?t('unlimited'):format.format(limit));
 const bar=document.createElement('progress');bar.id=key+'-quota';bar.setAttribute('aria-labelledby',dt.id);bar.setAttribute('aria-valuetext',dd.textContent);bar.max=limit||1;bar.value=limit===null?0:used;bar.className='quota-accessible';bar.hidden=limit===null;
 dt.append(ring);dd.append(bar);card.append(dt,dd);return card;
}
