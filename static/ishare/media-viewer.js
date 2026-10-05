import {mountGallery} from '@jsw-teams/media-viewer/gallery';
import {messages} from './i18n.js';
for(const gallery of document.querySelectorAll('[data-gallery]')){
 const dispose=mountGallery(gallery,{labels:messages(document.documentElement.lang),mountVideo:async(video,{isCurrent})=>{const {mountVideo}=await import('./player.js');if(isCurrent())return mountVideo(video);}});
 window.addEventListener('pagehide',dispose,{once:true});
}
