import {avatarFor} from './account.js';
for(const image of document.querySelectorAll('[data-author-avatar]'))avatarFor(image.dataset.authorAvatar,image);
