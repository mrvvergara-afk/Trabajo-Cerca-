const CACHE='trabajo-cerca-shell-brand-20261120';
const SHARE_CACHE='trabajo-cerca-share-v1';
const CORE=['./','./manifest.webmanifest','./brand/trabajo-cerca-oficial.svg','./brand/trabajo-cerca-simbolo.svg'];
self.addEventListener('install',event=>{event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);await cache.addAll(CORE);
 try{const html=await (await fetch('./',{cache:'reload'})).text();
 const assets=[...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)].map(m=>new URL(m[1],self.registration.scope)).filter(u=>u.origin===self.location.origin&&/\/assets\//.test(u.pathname)).slice(0,30);
 await Promise.all(assets.map(async u=>{try{await cache.add(u.toString());}catch{}}));}catch{}
 await self.skipWaiting();})());});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE&&key!==SHARE_CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin) return;
  if(request.method==='POST'&&url.pathname.endsWith('/share-target')){
    event.respondWith((async()=>{
      const form=await request.formData();
      const title=String(form.get('share_title')||'');
      const text=String(form.get('share_text')||'');
      const sharedUrl=String(form.get('share_url')||'');
      const file=form.get('share_image');
      const params=new URLSearchParams({share_target:'1'});
      if(title) params.set('share_title',title);
      if(text) params.set('share_text',text);
      if(sharedUrl) params.set('share_url',sharedUrl);
      if(file&&typeof file.arrayBuffer==='function'&&file.size>0){
        const mime=String(file.type||'').toLowerCase();
        if(!['image/jpeg','image/png','image/webp'].includes(mime)||file.size>3*1024*1024)
          return new Response('Imagen incompatible o mayor de 3 MB.',{status:413});
        const cache=await caches.open(SHARE_CACHE);
        const sharedRequest=new Request(new URL('./__shared_job_image__',self.registration.scope));
        await cache.put(sharedRequest,new Response(file,{headers:{
          'Content-Type':mime,'X-TC-Shared-At':String(Date.now()),
          'Cache-Control':'private, no-store'
        }}));
        params.set('share_image','1');
      }
      return Response.redirect(new URL('./?'+params.toString(),self.registration.scope).toString(),303);
    })());
    return;
  }
  if(request.method!=='GET') return;
  if(url.pathname.startsWith('/api/')){event.respondWith(fetch(request));return;}
  // Reuse immutable hashed app code without a network request every visit.
  if(/\/assets\/[^/]+\.(?:js|css)$/.test(url.pathname)){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE),stored=await cache.match(request);
      if(stored)return stored;
      const r=await fetch(request);if(r.ok)event.waitUntil(cache.put(request,r.clone()));return r;
    })());return;
  }
  // SVG campaign artwork: render immediately from cache, refresh unobtrusively.
  if(/\/house-creatives\/[^/]+\.svg$/.test(url.pathname)){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE),stored=await cache.match(request);
      if(stored){
        event.waitUntil(fetch(request).then(r=>r.ok?cache.put(request,r):undefined).catch(()=>undefined));
        return stored;
      }
      const r=await fetch(request);if(r.ok)event.waitUntil(cache.put(request,r.clone()));return r;
    })());return;
  }
  if(url.pathname.endsWith('/__shared_job_image__')){
    event.respondWith((async()=>{
      const cache=await caches.open(SHARE_CACHE);
      const response=await cache.match(request);
      if(!response) return new Response('',{status:404});
      const savedAt=Number(response.headers.get('X-TC-Shared-At')||0);
      event.waitUntil(cache.delete(request));
      if(!Number.isFinite(savedAt)||savedAt<=0||Date.now()-savedAt>5*60*1000)
        return new Response('La imagen compartida caducó.',{status:410});
      return response;
    })());
    return;
  }
  const privateQuery=['security-proof','radar-proof','radar-local-proof','radar-public-proof','radar-receiver-proof','admin-proof'];
  if(privateQuery.some(key=>url.searchParams.has(key))||url.pathname.includes('__appdeploy')){event.respondWith(fetch(request));return;}
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).then(response=>{
      if(response.ok&&url.pathname===new URL(self.registration.scope).pathname&&/text\/html/i.test(response.headers.get('content-type')||'')&&!/private|no-store/i.test(response.headers.get('cache-control')||'')){const copy=response.clone();void caches.open(CACHE).then(cache=>cache.put('./',copy));}
      return response;
    }).catch(async()=>await caches.match('./')||new Response('Sin conexión. Abre Trabajo Cerca cuando recuperes internet.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})));
    return;
  }
  event.respondWith(fetch(request).then(response=>{
    if(response.ok&&!/private|no-store/i.test(response.headers.get('cache-control')||'')){
      const copy=response.clone();
      void caches.open(CACHE).then(cache=>cache.put(request,copy));
    }
    return response;
  }).catch(()=>caches.match(request)));
});
