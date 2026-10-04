import Hls from 'hls.js';
import {mediaFeedback} from './media.js';
import {playerControls} from './player-controls.js';
export function mountVideo(video){
 let hls=null,failed=false;
 const play=()=>{if(!hls&&!video.hasAttribute('src'))start();if(!failed)void video.play().catch(()=>{});},controls=playerControls(video,play),feedback=mediaFeedback(video,()=>{failed=false;play();});
 function fail(key='videoUnavailable'){if(failed)return;failed=true;video.pause();hls?.destroy();hls=null;video.removeAttribute('src');video.load();controls.failed();feedback.failed(key);}
 function start(){
  failed=false;controls.ready();
  if(video.canPlayType('application/vnd.apple.mpegurl'))video.src=video.dataset.source;
  else if(Hls.isSupported()){
   hls=new Hls({autoStartLoad:false,maxBufferLength:20,maxMaxBufferLength:40});hls.loadSource(video.dataset.source);hls.attachMedia(video);
   hls.on(Hls.Events.ERROR,(_event,data)=>{const status=data.response?.code||data.networkDetails?.status;if(data.fatal||data.type===Hls.ErrorTypes.NETWORK_ERROR)fail([404,410].includes(status)?'mediaMissing':'videoUnavailable');});
  }else fail('videoUnsupported');
 }
 video.addEventListener('play',()=>hls?.startLoad());
 video.addEventListener('loadeddata',()=>{if(!failed)feedback.ready();});
 video.addEventListener('error',()=>{if(!failed)fail();});
 return ()=>{video.pause();hls?.destroy();hls=null;video.removeAttribute('src');video.load();};
}
