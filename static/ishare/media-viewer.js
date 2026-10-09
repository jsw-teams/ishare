let runtime;
function refresh(){
 if(!document.querySelector('[data-gallery]'))return;
 runtime ||= import('./gallery-runtime.js');
 void runtime.then(module=>module.mountGalleries());
}
refresh();
document.addEventListener('edgepress:data-media',refresh);
