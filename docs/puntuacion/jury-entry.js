const teacher=document.querySelector('#jury-teacher');
const link=document.querySelector('#jury-open');
const note=document.querySelector('#jury-setup');
let target=null;
try{
 const raw=window.CONCURSO_CONFIG?.appsScriptUrl;
 const u=typeof raw==='string'?new URL(raw.trim()):null;
 if(u&&u.protocol==='https:'&&u.hostname==='script.google.com'&&!u.port&&!u.username&&!u.password&&/^\/(?:a\/)?macros\/(?:[^/]+\/)?s\/[A-Za-z0-9_-]+\/exec\/?$/.test(u.pathname)){u.hash='';u.searchParams.set('view','jurado');target=u;}
}catch(_){}
function update(){if(!target)return;target.searchParams.set('teacher',teacher.value);link.href=target.href;link.removeAttribute('aria-disabled');note.hidden=true;}
teacher.addEventListener('change',update);
link.addEventListener('click',event=>{if(!target){event.preventDefault();note.hidden=false;}});
update();
