'use strict';
const PREFIX='al-dia-iphone-';
const CACHE=PREFIX+'360c18fc23bf6460b701e203';
// Install the entire distribution atomically, including Python and all wheels.
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const manifest=await (await fetch('assets.json',{cache:'no-store'})).json();
  const name=CACHE;
  const cache=await caches.open(name);
  try{
    for(const [file,hash] of Object.entries(manifest)){
      const url=new URL(file,self.registration.scope);const response=await fetch(url,{cache:'no-store'});
      if(!response.ok)throw Error(`No se pudo descargar ${file}`);
      const bytes=await response.clone().arrayBuffer();
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      const actual=Array.from(new Uint8Array(digest)).map(n=>n.toString(16).padStart(2,'0')).join('');
      if(actual!==hash)throw Error(`Descarga incompleta: ${file}`);
      await cache.put(url,response);
    }
    await cache.put(new URL('assets.json',self.registration.scope),new Response(JSON.stringify(manifest)));
    await cache.put(new URL('./',self.registration.scope),await cache.match(new URL('index.html',self.registration.scope)));
  }catch(error){await caches.delete(name);throw error;}
  // An update waits until all currently running app windows close.
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=(await caches.keys()).filter(key=>key.startsWith(PREFIX)&&key!==CACHE);
  for(const key of keys)await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||!url.href.startsWith(self.registration.scope))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    return (await cache.match(event.request))||fetch(event.request);
  })());
});
