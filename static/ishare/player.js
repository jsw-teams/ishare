import {mountVideo as mount} from '@jsw-teams/media-viewer/video';
import {messages} from './i18n.js';
export const mountVideo=video=>mount(video,{labels:messages(document.documentElement.lang)});
