'use strict';
// Same-origin embedded server HTML, executed only by the local app shell.
window.fetch=(path,options)=>parent.localRequest(path,options);
document.addEventListener('click',event=>{
  const anchor=event.target.closest('a[href]');if(!anchor||event.defaultPrevented)return;
  const url=new URL(anchor.href);
  if(url.origin!==parent.location.origin){anchor.target='_blank';anchor.rel='noopener';return;}
  event.preventDefault();parent.localNavigate(anchor.href);
});
document.addEventListener('submit',event=>{
  if(event.defaultPrevented)return;event.preventDefault();
  const form=event.target,body=new FormData(form,event.submitter);
  const path=parent.localPath(form.getAttribute('action')||parent.localCurrentPath||'/');
  if(form.method.toUpperCase()==='GET'){
    const url=new URL(path,parent.location.origin);url.search=new URLSearchParams(body).toString();parent.localNavigate(url.pathname+url.search);
  }else parent.localNavigate(path,{method:'POST',body});
});
document.addEventListener('DOMContentLoaded',()=>{
  const back=document.querySelector('#go-back');if(back){const replacement=back.cloneNode(true);back.replaceWith(replacement);replacement.onclick=()=>parent.history.back();}
});
