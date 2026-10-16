// Ordinary public browsing of two reviewed profiles; no login, app actions or paid APIs.
import { spawn } from 'node:child_process';
import { readFileSync,writeFileSync,mkdtempSync,rmSync,existsSync,mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractJsonText,mergeStories,postIdentity,visiblePost } from './radar_v2_social.mjs';
import { postSnapshot,hoveredDate } from './radar_v2_dom.mjs';

const config=JSON.parse(readFileSync('config/radar-v2-pilot.json','utf8'));
if(config.paid_providers_enabled!==false || config.publish_enabled!==false)throw new Error('Pilot must remain isolated');
const selected=config.sources.filter(row=>row.kind==='social').slice(0,2);
const executable=['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
if(!executable)throw new Error('Public browser unavailable');
const directory=mkdtempSync(join(tmpdir(),'tc-v2-browser-')),environment={...process.env};
delete environment.GITHUB_TOKEN;delete environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
const browser=spawn(executable,['--headless','--disable-gpu','--no-sandbox','--disable-dev-shm-usage','--no-first-run','--disable-background-networking',
  '--remote-debugging-port=0','--user-data-dir='+directory,'about:blank'],{stdio:'ignore',env:environment});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let socket,active,serial=0;const pending=new Map(),responses=new Map(),captures=[];
const command=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(new Error('Public browser command timed out'));},10000);
  pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
});
try {
  let port;
  for(let i=0;i<60;i++){try{port=readFileSync(join(directory,'DevToolsActivePort'),'utf8').split('\n')[0];if(port)break;}catch{}await pause(200);}
  if(!port)throw new Error('Public browser did not start');
  const tabs=await (await fetch('http://127.0.0.1:'+port+'/json')).json();
  socket=new WebSocket(tabs.find(row=>row.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage=event=>{
    const msg=JSON.parse(event.data),callback=pending.get(msg.id);
    if(callback){pending.delete(msg.id);clearTimeout(callback.timer);msg.error?callback.reject(new Error('Public browser command failed')):callback.resolve(msg.result);}
    if(msg.method==='Network.responseReceived' && active) {
      const response=msg.params.response;
      try {
        const url=new URL(response.url);
        if(['www.facebook.com','facebook.com','web.facebook.com'].includes(url.hostname) && url.pathname==='/api/graphql/' && response.status===200 && responses.size<20)
          responses.set(msg.params.requestId,{source:active,ready:false});
      }catch{}
    }
    if(msg.method==='Network.loadingFinished' && responses.has(msg.params.requestId))responses.get(msg.params.requestId).ready=true;
  };
  await command('Page.enable');await command('Runtime.enable');await command('Network.enable');
  await command('Emulation.setTimezoneOverride',{timezoneId:'America/Santiago'});
  for(const source of selected) {
    active=source;responses.clear();const found=[];
    const result={key:source.key,url:source.url,read_only:true,paid_provider_calls:0,coverage_complete:false};
    try {
      const nav=await command('Page.navigate',{url:source.url});if(nav.errorText)throw new Error('Public navigation failed');
      await pause(5000);
      for(let round=0;round<3;round++) {
        const value=await command('Runtime.evaluate',{returnByValue:true,expression:`JSON.stringify({
          title:document.title,url:location.href,
          links:[...document.querySelectorAll('a[href]')].map(a=>a.href).slice(0,500),
          scripts:[...document.querySelectorAll('script[type="application/json"],script[type="application/ld+json"]')].map(s=>s.textContent).reduce((a,s)=>{if(a.bytes+s.length<4000000 && a.items.length<25){a.items.push(s);a.bytes+=s.length;}return a;},{bytes:0,items:[]}).items
        })`});
        const page=JSON.parse(value.result?.value || '{}');result.title=String(page.title||'').slice(0,180);
        for(const raw of page.scripts||[])found.push(...extractJsonText(raw,source.url));
        for(const link of page.links||[]) {
          const url=postIdentity(link,source.url);
          if(url)found.push({url,profile:source.url,source_published_at:null,date_proof:null,text:'',media:[],reason:'source_date_missing_or_conflicting'});
        }
        for(const [id,response] of [...responses])if(response.ready) {
          responses.delete(id);
          try {const body=await command('Network.getResponseBody',{requestId:id});if(!body.base64Encoded)found.push(...extractJsonText(body.body,source.url));}catch{}
        }
        if(round<2){await command('Runtime.evaluate',{expression:'window.scrollBy(0,Math.min(innerHeight*2,1500))'});await pause(1800);}
      }
      for(const post of mergeStories(found).slice(0,2)) {
        await command('Page.navigate',{url:post.url});await pause(2500);
        const value=await command('Runtime.evaluate',{returnByValue:true,expression:'JSON.stringify(('+postSnapshot.toString()+')('+JSON.stringify(post.url)+'))'});
        if(value.exceptionDetails)throw new Error('Public post DOM unavailable');
        const snapshot=JSON.parse(value.result?.value || '{}');
        if(snapshot.hover) {
          await command('Input.dispatchMouseEvent',{type:'mouseMoved',...snapshot.hover});await pause(700);
          const literal=await command('Runtime.evaluate',{returnByValue:true,expression:'JSON.stringify(('+hoveredDate.toString()+')())'});
          if(literal.exceptionDetails)throw new Error('Public date DOM unavailable');
          Object.assign(snapshot,JSON.parse(literal.result?.value || '{}'));
        }
        const observation=visiblePost(snapshot,source.url);if(observation)found.push(observation);
      }
      result.posts=mergeStories(found);result.access=result.posts.length?'public_posts_observed':'no_readable_posts';
      result.dated_posts=result.posts.filter(row=>row.source_published_at).length;
    }catch(error){result.access='unavailable';result.error=error.name || 'BrowserError';result.posts=mergeStories(found);}
    captures.push(result);active=null;
    console.log('RADAR_V2_SOCIAL '+JSON.stringify({key:source.key,access:result.access,posts:result.posts.length,dated_posts:result.dated_posts||0,media:result.posts.reduce((n,p)=>n+p.media.length,0),paid_provider_calls:0}));
  }
}finally {
  socket?.close();browser.kill('SIGTERM');await pause(250);rmSync(directory,{recursive:true,force:true});
}
mkdirSync('output/radar-v2',{recursive:true});
writeFileSync('output/radar-v2/social-observation.json',JSON.stringify({schema:'trabajo-cerca.radar-v2-social.v1',checked_at:new Date().toISOString(),read_only:true,paid_provider_calls:0,captures},null,2)+'\n');
