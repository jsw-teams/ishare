import Hls from 'hls.js';
for(const video of document.querySelectorAll('video[data-source]')){
  const source=video.dataset.source;
  if(video.canPlayType('application/vnd.apple.mpegurl'))video.src=source;
  else if(Hls.isSupported()){
    const hls=new Hls({autoStartLoad:false,maxBufferLength:20,maxMaxBufferLength:40});hls.loadSource(source);hls.attachMedia(video);
    video.addEventListener('play',()=>hls.startLoad(),{once:true});
    hls.on(Hls.Events.ERROR,(_event,data)=>{if(data.fatal){video.setAttribute('aria-invalid','true');hls.destroy();}});
    window.addEventListener('pagehide',()=>hls.destroy(),{once:true});
  }else{const p=document.createElement('p');p.textContent='This browser cannot play this video format.';video.after(p);}
}
