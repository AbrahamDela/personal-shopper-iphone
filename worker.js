'use strict';
importScripts('runtime/pyodide.js');
let py,db,snapshot,queue=Promise.resolve();
const DBPATH='/data/shopper.sqlite';
const BLOCK_SIZE=4*1024*1024;
const BACKUP_DIR='/backup-input';
function transaction(mode,action){return new Promise((resolve,reject)=>{
  const tx=db.transaction('state',mode);let result;
  tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Almacenamiento cancelado'));
  action(tx.objectStore('state'),value=>{result=value;});
});}
async function initialize(){
  db=await new Promise((resolve,reject)=>{const request=indexedDB.open('al-dia-local',1);request.onupgradeneeded=()=>request.result.createObjectStore('state');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  const config=await (await fetch('runtime-config.json')).json();
  py=await loadPyodide({indexURL:new URL('runtime/',self.location).href});
  await py.loadPackage(config.packages);
  py.globals.set('wheel_urls',config.wheels.map(path=>new URL(path,self.location).href));
  await py.runPythonAsync('import micropip\nawait micropip.install(list(wheel_urls), deps=False)');
  const archive=await (await fetch('shopper.zip')).arrayBuffer();
  py.unpackArchive(archive,'zip',{extractDir:'/app'});
  py.FS.writeFile('/app/local_wsgi.py',await (await fetch('local_wsgi.py')).text());
  py.FS.mkdirTree('/data');
  py.FS.mkdirTree(BACKUP_DIR);
  snapshot=await loadSnapshot();
  const secret=snapshot?.secret||Array.from(crypto.getRandomValues(new Uint8Array(32))).map(n=>n.toString(16).padStart(2,'0')).join('');
  py.globals.set('local_secret',secret);
  await py.runPythonAsync("import sys\nsys.path.insert(0,'/app')\nimport local_wsgi\nlocal_wsgi.start('/data/shopper.sqlite',local_secret)");
  await persist(secret);
  return true;
}
async function persist(secret=snapshot.secret){
  const size=py.FS.stat(DBPATH).size;
  const next={secret,size,blocks:Math.ceil(size/BLOCK_SIZE)};
  const file=py.FS.open(DBPATH,'r');
  try{
    await transaction('readwrite',store=>{
      const write=index=>{
        try{
          if(index===next.blocks){
            for(let i=index;i<(snapshot?.blocks||0);i++)store.delete(`database:${i}`);
            store.put(next,'database');return;
          }
          const offset=index*BLOCK_SIZE,block=new Uint8Array(Math.min(BLOCK_SIZE,size-offset));
          if(py.FS.read(file,block,0,block.length,offset)!==block.length)throw Error('Lectura incompleta');
          store.put(block,`database:${index}`).onsuccess=()=>write(index+1);
        }catch{store.transaction.abort();}
      };
      write(0);
    });
    snapshot=next;
  }finally{py.FS.close(file);}
}
function readStorage(key){
  return transaction('readonly',(store,done)=>{const request=store.get(key);request.onsuccess=()=>done(request.result);});
}
async function loadSnapshot(){
  const saved=await readStorage('database');
  if(!saved)return undefined;
  if(saved.bytes){
    // Migrate older single-buffer snapshots on the next successful save.
    py.FS.writeFile(DBPATH,new Uint8Array(saved.bytes));
    return {secret:saved.secret,blocks:0};
  }
  const file=py.FS.open(DBPATH,'w');
  try{
    py.FS.truncate(DBPATH,saved.size);
    for(let index=0;index<saved.blocks;index++){
      const block=await readStorage(`database:${index}`),offset=index*BLOCK_SIZE;
      if(block?.length!==Math.min(BLOCK_SIZE,saved.size-offset))throw Error('Base local incompleta');
      py.FS.write(file,block,0,block.length,offset);
    }
  }finally{py.FS.close(file);}
  return saved;
}
async function handle(message){
  if(message.kind==='init')return initialize();
  if(message.kind==='gemini'){py.globals.set('enabled',message.enabled);py.runPython("local_wsgi.app.config['GEMINI_API_KEY']='local-session' if enabled else None");return true;}
  py.globals.set('request_path',message.path);py.globals.set('request_method',message.method||'GET');
  py.globals.set('request_body',new Uint8Array(message.body||new ArrayBuffer(0)));
  py.globals.set('request_type',message.contentType||null);
  let result;
  const mounted=!!message.backupFile;
  if(mounted)py.FS.mount(py.FS.filesystems.WORKERFS,{blobs:[{name:'respaldo.json',data:message.backupFile}]},BACKUP_DIR);
  try{
    py.globals.set('mounted_backup',mounted);
    result=JSON.parse(py.runPython('local_wsgi.dispatch(request_path,request_method,request_body.to_py(),request_type,mounted_backup)'));
  }finally{
    if(mounted)py.FS.unmount(BACKUP_DIR);
    py.globals.delete('request_body');
  }
  try{if(message.method==='POST'&&result.status<400)await persist();}catch(error){
    // Do not acknowledge a write that IndexedDB did not commit.
    snapshot=await loadSnapshot();
    py.runPython("local_wsgi.client=local_wsgi.app.test_client()");
    throw Error('No se pudo guardar en el dispositivo. Libera espacio y vuelve a abrir la app. La operación no fue guardada.');
  }
  return result;
}
self.onmessage=event=>{const {id,...message}=event.data;queue=queue.then(async()=>{
  try{self.postMessage({id,result:await handle(message)});}catch(error){console.error(error);self.postMessage({id,error:message.kind==='init'?'No se pudo iniciar la app local. Comprueba la descarga y el espacio disponible.':String(error.message||error)});}
});};
