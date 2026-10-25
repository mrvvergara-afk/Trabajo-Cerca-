const CACHE='trabajo-cerca-shell-closure-20261025';
const SHARE_CACHE='trabajo-cerca-share-v1';
const CORE=['./','./manifest.webmanifest','./icon-192.png'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});
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
        const cache=await caches.open(SHARE_CACHE);
        const sharedRequest=new Request(new URL('./__shared_job_image__',self.registration.scope));
        await cache.put(sharedRequest,new Response(file,{headers:{'Content-Type':file.type||'image/jpeg'}}));
        params.set('share_image','1');
      }
      return Response.redirect(new URL('./?'+params.toString(),self.registration.scope).toString(),303);
    })());
    return;
  }
  if(request.method!=='GET') return;
  if(url.pathname.startsWith('/api/')){event.respondWith(fetch(request));return;}
  if(url.pathname.endsWith('/__shared_job_image__')){
    event.respondWith((async()=>{
      const cache=await caches.open(SHARE_CACHE);
      const response=await cache.match(request);
      if(!response) return new Response('',{status:404});
      event.waitUntil(cache.delete(request));
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
  }).catch(async()=>await caches.match(request)||new Response('Recurso no disponible sin conexión.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})));
});
