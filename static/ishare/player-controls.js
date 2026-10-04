import {messages} from './i18n.js';
export function playerControls(video){
 const t=messages(document.documentElement.lang),root=document.createElement('div');root.className='player-controls';
 const button=(key,action)=>{const node=document.createElement('button');node.type='button';node.textContent=t[key];node.addEventListener('click',action);root.append(node);return node;};
 const play=button('play',()=>{if(video.paused)void video.play().catch(()=>{});else video.pause();});
 const seek=document.createElement('input');seek.type='range';seek.min='0';seek.max='1000';seek.value='0';seek.setAttribute('aria-label',t.seek);root.append(seek);
 const time=document.createElement('span');time.className='player-time';root.append(time);
 const mute=button('mute',()=>{video.muted=!video.muted;});button('fullscreen',()=>{const container=video.parentElement;if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});else void container.requestFullscreen?.().catch(()=>{});});
 const stamp=value=>Math.floor((value||0)/60)+':'+String(Math.floor((value||0)%60)).padStart(2,'0');
 const update=()=>{play.textContent=t[video.paused?'play':'pause'];play.setAttribute('aria-label',play.textContent);mute.textContent=t[video.muted?'unmute':'mute'];seek.disabled=!Number.isFinite(video.duration)||!video.duration;seek.value=seek.disabled?'0':String(video.currentTime/video.duration*1000);time.textContent=stamp(video.currentTime)+' / '+stamp(Number.isFinite(video.duration)?video.duration:0);};
 for(const name of ['play','pause','timeupdate','durationchange','volumechange','emptied'])video.addEventListener(name,update);
 seek.addEventListener('input',()=>{if(Number.isFinite(video.duration))video.currentTime=Number(seek.value)*video.duration/1000;});
 video.tabIndex=0;video.addEventListener('keydown',event=>{if(event.key===' '){event.preventDefault();play.click();}else if(['ArrowLeft','ArrowRight'].includes(event.key)&&Number.isFinite(video.duration)){event.preventDefault();video.currentTime=Math.max(0,Math.min(video.duration,video.currentTime+(event.key==='ArrowLeft'?-5:5)));}});
 video.after(root);update();return {failed(){root.hidden=true;},ready(){root.hidden=false;update();}};
}
