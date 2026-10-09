import {avatarFor} from './account.js';
function refresh(){for(const image of document.querySelectorAll('[data-author-avatar]'))avatarFor(image.dataset.authorAvatar,image);}
refresh();
document.addEventListener('edgepress:data-media',refresh);
