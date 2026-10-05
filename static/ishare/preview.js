// Only display renditions are adapted. Explicit originals keep their source.
export function preparePreview(image){
 const source=image.dataset.previewSrcset||image.getAttribute('srcset');if(!source)return;
 const connection=navigator.connection,rate=Number(connection?.downlink),type=connection?.effectiveType;
 const maximum=connection?.saveData||['slow-2g','2g','3g'].includes(type)||rate>0&&rate<1.5?640:rate>=5?2048:1280;
 const candidates=source.split(',').map(value=>value.trim().match(/^(\S+)\s+(\d+)w$/)).filter(Boolean).map(match=>({url:match[1],width:Number(match[2])})).sort((a,b)=>a.width-b.width);
 if(!candidates.length)return;const selected=candidates.filter(item=>item.width<=maximum);if(!selected.length)selected.push(candidates[0]);
 if(selected.length===1){image.removeAttribute('srcset');image.src=selected[0].url;}
 else image.srcset=selected.map(item=>item.url+' '+item.width+'w').join(', ');
}
