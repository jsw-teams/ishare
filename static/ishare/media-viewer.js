import {watchImage} from './media.js';
for(const image of document.querySelectorAll('img[data-media]'))watchImage(image);
