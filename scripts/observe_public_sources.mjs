// Exercise the supported frontend SDK by pressing the app's free-source button.
import { spawn } from 'node:child_process';
import { mkdtempSync,writeFileSync,rmSync,mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const profile=mkdtempSync(join(tmpdir(),'tc-public-proof-'));
const environment={ ...process.env };
delete environment.GITHUB_TOKEN;delete environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
const browser=spawn('google-chrome',['--headless','--disable-gpu','--no-first-run','--disable-background-networking',
  '--disable-background-timer-throttling','--disable-renderer-backgrounding',
  '--remote-debugging-port=9227','--user-data-dir='+profile,'about:blank'],{ stdio:'ignore',env:environment });
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let socket;
const diagnostics={ responseStatuses:{},failedRequests:0,exceptions:[],page:null };
let command;
const saveDiagnostics=async()=>{
  try {
    const page=await command('Runtime.evaluate',{ expression:"JSON.stringify({url:location.origin+location.pathname,hash:location.hash,readyState:document.readyState,hasProof:!!document.getElementById('radar-public-check'),hasButton:!!document.getElementById('free-source-run'),heading:document.querySelector('h1')?.textContent,error:document.querySelector('.opsError')?.textContent,proof:document.getElementById('radar-public-check')?.textContent})",returnByValue:true });
    diagnostics.page=JSON.parse(page.result?.value || 'null');
  } catch { diagnostics.page={ readable:false }; }
  mkdirSync('output/public-sources',{recursive:true});
  writeFileSync('output/public-sources/app-public-source-diagnostic.json',JSON.stringify(diagnostics,null,2)+'\n');
  console.log('APP_PUBLIC_SOURCE_DIAGNOSTIC '+JSON.stringify(diagnostics));
};
try {
  let tabs;
  for (let attempt=0;attempt<30;attempt++) {
    try { tabs=await (await fetch('http://127.0.0.1:9227/json')).json();if (tabs.length) break; } catch {}
    await pause(200);
  }
  if (!tabs?.length) throw new Error('Read-only browser unavailable');
  const tab=tabs.find(item=>item.type==='page');
  if (!tab) throw new Error('Browser page unavailable');
  socket=new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let serial=0;const pending=new Map();
  socket.onmessage=event=>{
    const message=JSON.parse(event.data),callback=pending.get(message.id);
    if (callback) {pending.delete(message.id);clearTimeout(callback.timer);message.error?callback.reject(new Error('Browser command failed: '+message.error.message)):callback.resolve(message.result);}
    if (message.method==='Network.responseReceived') {const status=message.params.response.status;diagnostics.responseStatuses[status]=(diagnostics.responseStatuses[status]||0)+1;}
    if (message.method==='Network.loadingFailed') diagnostics.failedRequests++;
    if (message.method==='Runtime.exceptionThrown') diagnostics.exceptions.push(message.params.exceptionDetails.text);
  };
  command=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Browser command timeout: '+method));},10000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  await command('Page.enable');await command('Runtime.enable');await command('Network.enable');
  const navigation=await command('Page.navigate',{ url:'https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/?radar-public-proof=1#operacion' });
  if (navigation.errorText) throw new Error('Browser navigation failed: '+navigation.errorText);
  await command('Page.bringToFront');
  const read=async()=>{
    const result=await command('Runtime.evaluate',{ expression:"document.getElementById('radar-public-check')?.textContent || ''",returnByValue:true });
    return result.result?.value ? JSON.parse(result.result.value) : null;
  };
  let proof;
  for (let attempt=0;attempt<120;attempt++){proof=await read();if (proof?.state) break;await pause(500);}
  if (!proof?.state || proof.state.providerCalls!==0) throw new Error('Public source status unavailable');
  await command('Runtime.evaluate',{ expression:"document.getElementById('free-source-run')?.click()" });
  for (let attempt=0;attempt<180;attempt++){
    proof=await read();if (proof?.result && !proof.running) break;await pause(500);
  }
  if (!proof?.result || proof.running) throw new Error('Free source invocation did not complete');
  if (proof.result.providerCalls!==0 || proof.state.providerCalls!==0) throw new Error('Unexpected provider calls');
  mkdirSync('output/public-sources',{recursive:true});
  writeFileSync('output/public-sources/app-public-source-observation.json',JSON.stringify(proof,null,2)+'\n');
  console.log('APP_PUBLIC_SOURCE_READ '+JSON.stringify(proof));
} catch (error) {
  await saveDiagnostics();throw error;
} finally {
  socket?.close();browser.kill('SIGTERM');await pause(250);rmSync(profile,{recursive:true,force:true});
}
