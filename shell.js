const frame=document.querySelector('#app'),status=document.querySelector('#status');
const root=new URL('./',location.href);let worker,sequence=0,ready=false,offline=false,key='',model='gemini-flash-latest';
const pending=new Map();let navigation=Promise.resolve(),imageURLs=[];
function rpc(message){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});worker.postMessage({id,...message});});}
function bytes(text){return Uint8Array.from(atob(text),c=>c.charCodeAt(0));}
function response(result){return new Response(bytes(result.body),{status:result.status,headers:result.headers});}
const notice=()=>{status.textContent=offline?'Lista para usar sin conexión · Datos guardados en este dispositivo':'App abierta · Espera a que termine la descarga para usarla sin conexión';};
window.localPath=value=>{
  const url=new URL(value,root);
  if(url.origin!==root.origin)throw Error('Este enlace no es una página local.');
  let path=url.pathname;
  if(path.startsWith(root.pathname))path='/'+path.slice(root.pathname.length);
  return path+url.search;
};
window.localRequest=async(path,options={})=>{
  path=window.localPath(path);
  let body=options.body,contentType;
  if(Object.prototype.toString.call(body)==='[object FormData]'){const req=new Request(root,{method:'POST',body});body=await req.arrayBuffer();contentType=req.headers.get('Content-Type');}
  else if(Object.prototype.toString.call(body)==='[object URLSearchParams]'){contentType='application/x-www-form-urlencoded;charset=UTF-8';body=new TextEncoder().encode(body.toString()).buffer;}
  else if(typeof body==='string'){body=new TextEncoder().encode(body).buffer;contentType='text/plain';}
  if(path==='/compras/analizar-fotos'){
    if(!key)return Response.json({error:'Configura Gemini desde Instalación y Gemini.'},{status:400});
    const prepared=response(await rpc({path:'/__local/ai/prepare',method:'POST',body,contentType}));
    if(!prepared.ok||!prepared.headers.get('Content-Type')?.includes('application/json'))return prepared;
    const {parts}=await prepared.json();
    try{
      const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),90000);
      let reply;
      try{reply=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
        method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},
        body:JSON.stringify({contents:[{parts}],generationConfig:{responseMimeType:'application/json',temperature:0}}),signal:abort.signal,
      });}finally{clearTimeout(timer);}
      if(!reply.ok)throw Error(reply.status===429?'Gemini alcanzó su cuota.':reply.status===403||reply.status===401?'Revisa la clave y los permisos de Gemini.':'Gemini rechazó la solicitud. Revisa el modelo y las imágenes.');
      const result=await reply.json();
      const json=result.candidates?.[0]?.content?.parts?.filter(part=>!part.thought&&part.text).map(part=>part.text).join('');
      const csrf=frame.contentDocument.querySelector('#purchase-v2 [name=csrf]').value;
      return window.localRequest('/__local/ai/normalize',{method:'POST',body:new URLSearchParams({csrf,result:JSON.stringify(JSON.parse(json))})});
    }catch(error){return Response.json({error:error.name==='TypeError'?'No se pudo conectar con Gemini. Comprueba Internet.':error.message},{status:400});}
  }
  return response(await rpc({path,method:options.method||'GET',body,contentType}));
};
async function download(result){
  const blob=new Blob([bytes(result.body)],{type:result.headers['Content-Type']||'application/octet-stream'});
  const name=result.headers['Content-Disposition']?.match(/filename="?([^";]+)"?/)?.[1]||'archivo';
  const dialog=document.createElement('dialog'),title=document.createElement('h2');title.textContent='Archivo listo';dialog.append(title);
  const save=document.createElement('a');save.textContent='Guardar archivo';save.download=name;save.href=URL.createObjectURL(blob);dialog.append(save);
  if(navigator.canShare?.({files:[new File([blob],name,{type:blob.type})]})){
    const share=document.createElement('button');share.textContent='Compartir / Guardar en Archivos';share.onclick=async()=>{try{await navigator.share({files:[new File([blob],name,{type:blob.type})]});}catch(error){if(error.name!=='AbortError')status.textContent='Usa Guardar archivo para descargarlo.';}};dialog.append(share);
  }
  const close=document.createElement('button');close.textContent='Cerrar';close.onclick=()=>{URL.revokeObjectURL(save.href);dialog.close();dialog.remove();};dialog.append(close);document.body.append(dialog);dialog.showModal();
}
window.localNavigate=(path,options={},history=true)=>{
  navigation=navigation.then(async()=>{
    status.textContent='Abriendo y comprobando guardado local…';
    const normalized=window.localPath(path);
    let body=options.body,contentType;
    if(Object.prototype.toString.call(body)==='[object FormData]'){const req=new Request(root,{method:'POST',body});body=await req.arrayBuffer();contentType=req.headers.get('Content-Type');}
    const result=await rpc({path:normalized,method:options.method||'GET',body,contentType});
    if(result.headers['Content-Disposition']?.includes('attachment')){await download(result);notice();return;}
    if(!result.headers['Content-Type']?.includes('text/html'))throw Error('Respuesta local inesperada.');
    for(const url of imageURLs)URL.revokeObjectURL(url);imageURLs=[];
    const doc=new DOMParser().parseFromString(new TextDecoder().decode(bytes(result.body)),'text/html');
    // Keep the embedded app inside this static distribution, including subpath hosting.
    for(const node of doc.querySelectorAll('[href],[src],[action]'))for(const attr of ['href','src','action']){
      const value=node.getAttribute(attr);if(value?.startsWith('/')&&!value.startsWith('//'))node.setAttribute(attr,new URL(value.slice(1),root).href);
    }
    for(const img of doc.images){img.dataset.localSrc=img.getAttribute('src');img.removeAttribute('src');}
    const base=doc.createElement('base');base.href=root.href;doc.head.prepend(base);
    const bridge=doc.createElement('script');bridge.src=new URL('bridge.js',root).href;doc.head.insertBefore(bridge,base.nextSibling);
    window.localCurrentPath=result.path;
    window.history[history?'pushState':'replaceState'](null,'',`#${result.path}`);
    frame.hidden=false;
    frame.onload=async()=>{
      for(const img of frame.contentDocument.querySelectorAll('img[data-local-src]')){
        const src=img.dataset.localSrc;
        try{const reply=await window.localRequest(src);if(!reply.ok)continue;const url=URL.createObjectURL(await reply.blob());imageURLs.push(url);img.src=url;}catch{img.alt='No se pudo abrir la foto';}
      }
    };
    frame.srcdoc='<!doctype html>'+doc.documentElement.outerHTML;
    notice();
  }).catch(error=>{status.textContent=error.message||'No se pudo completar la operación.';});
  return navigation;
};
window.addEventListener('popstate',()=>{if(ready)window.localNavigate(location.hash.slice(1)||'/',{},false);});
const settings=document.querySelector('#local-settings');
document.querySelector('#settings').onclick=()=>settings.showModal();
document.querySelector('#close-settings').onclick=()=>settings.close();
document.querySelector('#persist').onclick=async()=>{const granted=await navigator.storage?.persist?.();document.querySelector('#persistence').textContent=granted?'Almacenamiento persistente concedido. Conserva también respaldos externos.':'Safari decide si puede proteger el almacenamiento. Abre la app desde la pantalla de inicio y conserva respaldos.';};
document.querySelector('#gemini-settings').onsubmit=async event=>{
  event.preventDefault();key=document.querySelector('#gemini-key').value.trim();model=document.querySelector('#gemini-model').value.trim();document.querySelector('#gemini-key').value='';
  if(ready){await rpc({kind:'gemini',enabled:!!key});await window.localNavigate(location.hash.slice(1)||'/',{},false);}settings.close();
};
async function launch(){
  if(!isSecureContext||!navigator.serviceWorker)throw Error('Para instalar en iPhone, abre la app desde una dirección HTTPS.');
  if(!navigator.locks)throw Error('Actualiza iOS para usar el almacenamiento local de forma segura.');
  const registration=await navigator.serviceWorker.register(new URL('sw.js',root));
  function observe(){if(registration.active){offline=true;notice();}}
  navigator.serviceWorker.addEventListener('controllerchange',observe);
  registration.addEventListener('updatefound',()=>{registration.installing?.addEventListener('statechange',()=>{if(registration.installing?.state==='redundant')status.textContent='No terminó la descarga offline. Reabre con Internet.';observe();});});
  navigator.serviceWorker.ready.then(()=>{offline=true;notice();});observe();
  await navigator.locks.request('al-dia-local-database',{ifAvailable:true},async lock=>{
    if(!lock)throw Error('La app ya está abierta en otra ventana. Ciérrala antes de continuar.');
    worker=new Worker(new URL('worker.js',root));worker.onmessage=event=>{const request=pending.get(event.data.id);if(!request)return;pending.delete(event.data.id);event.data.error?request.reject(Error(event.data.error)):request.resolve(event.data.result);};
    worker.onerror=()=>{status.textContent='El motor local se detuvo. Vuelve a abrir la app.';for(const request of pending.values())request.reject(Error('Motor local detenido'));pending.clear();};
    await rpc({kind:'init'});ready=true;
    if(key)await rpc({kind:'gemini',enabled:true});
    await window.localNavigate(location.hash.slice(1)||'/',{},false);
    // Lock lasts for the lifetime of this page, avoiding stale copies in two tabs.
    await new Promise(()=>{});
  });
}
launch().catch(error=>{status.textContent=error.message;});
