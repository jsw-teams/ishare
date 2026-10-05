import {mediaFeedback as feedback,watchImage as watch} from '@jsw-teams/media-viewer/image';
import {messages} from './i18n.js';
const labels=messages(document.documentElement.lang);
export const mediaFeedback=(element,retry)=>feedback(element,retry,labels);
export const watchImage=image=>watch(image,{labels});
