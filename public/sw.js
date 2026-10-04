const SHELL='nkrando-shell-v6'
const MAP='nkrando-map-v6'
const RUNTIME='nkrando-runtime-v6'
const CORE=['/','/manifest.webmanifest','/icon-192.png','/icon-512.png']

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(SHELL).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))
})
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>![SHELL,MAP,RUNTIME].includes(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))
})

async function cacheFirst(req,cacheName){
  const cache=await caches.open(cacheName)
  const hit=await cache.match(req)
  if(hit)return hit
  const res=await fetch(req)
  if(res && (res.ok || res.type==='opaque')) cache.put(req,res.clone()).catch(()=>{})
  return res
}
async function stale(req){
  const cache=await caches.open(RUNTIME)
  const hit=await cache.match(req)
  const net=fetch(req).then(res=>{if(res.ok)cache.put(req,res.clone()).catch(()=>{});return res}).catch(()=>null)
  return hit || net || caches.match('/')
}
self.addEventListener('fetch',event=>{
  const req=event.request
  if(req.method!=='GET')return
  const url=new URL(req.url)
  if(url.hostname==='tiles.openfreemap.org'||url.hostname==='server.arcgisonline.com'||url.hostname==='tiles.bergfex.at'){
    event.respondWith(cacheFirst(req,MAP));return
  }
  if(req.mode==='navigate'){
    event.respondWith(fetch(req).then(res=>{const c=res.clone();caches.open(RUNTIME).then(x=>x.put(req,c)).catch(()=>{});return res}).catch(()=>caches.match(req).then(r=>r||caches.match('/'))));return
  }
  if(url.origin===location.origin) event.respondWith(stale(req))
})
