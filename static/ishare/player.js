import Hls from 'hls.js';
import {mediaFeedback} from './media.js';
for(const video of document.querySelectorAll('video[data-source]')){
 let hls=null,failed=false;
 const feedback=mediaFeedback(video,()=>{start();if(!failed)void video.play().catch(()=>{});});
 function fail(key='videoUnavailable'){if(failed)return;failed=true;video.pause();hls?.destroy();hls=null;video.removeAttribute('src');video.load();feedback.failed(key);}
 function start(){
  failed=false;
  if(video.canPlayType('application/vnd.apple.mpegurl'))video.src=video.dataset.source;
  else if(Hls.isSupported()){
   hls=new Hls({autoStartLoad:false,maxBufferLength:20,maxMaxBufferLength:40});hls.loadSource(video.dataset.source);hls.attachMedia(video);
   hls.on(Hls.Events.ERROR,(_event,data)=>{const status=data.response?.code||data.networkDetails?.status;if(data.fatal||data.type===Hls.ErrorTypes.NETWORK_ERROR)fail([404,410].includes(status)?'mediaMissing':'videoUnavailable');});
  }else fail('videoUnsupported');
 }
 video.addEventListener('play',()=>hls?.startLoad());
 video.addEventListener('loadeddata',()=>{if(!failed)feedback.ready();});
 video.addEventListener('error',()=>{if(!failed)fail();});
 window.addEventListener('pagehide',()=>hls?.destroy(),{once:true});
 start();
}
