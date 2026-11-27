import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createServer,build} from 'vite';
import {chromium} from 'playwright';

const resolve={alias:{'@appdeploy/client':fileURLToPath(new URL('./client.mjs',import.meta.url))}};
await build({resolve,build:{write:false}});
const server=await createServer({resolve,server:{host:'127.0.0.1',port:4177,strictPort:true}});
await server.listen();
const browser=await chromium.launch({executablePath:process.env.TC_CHROMIUM||'/usr/bin/chromium',headless:true,
 args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 for(const width of [320,375,430,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const response=await page.goto('http://127.0.0.1:4177/tests/browser/panel.html');
  assert.equal(response.status(),200);
  await page.getByRole('button',{name:'Ver detalle de Gemini',exact:true}).waitFor();
  for (const engine of ['B','C']) {
   await page.getByRole('button',{name:'Ver detalle de Motor '+engine,exact:true}).click();
   const panel=page.getByRole('dialog',{name:'Detalle de Motor '+engine});
   await panel.getByRole('button',{name:'Historial',exact:true}).click();
   assert.equal(await panel.locator('.tcCmdHistory .tcCmdBar').count(),2);
   assert.deepEqual(await panel.locator('.tcCmdHistory .tcCmdTrack i').evaluateAll(nodes=>nodes.map(node=>node.style.width)),['50%','100%']);
   await panel.getByRole('button',{name:'Cerrar detalle',exact:true}).click();
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  assert.deepEqual(errors,[]);
  console.log('Panel simulado: '+width+' px OK');
  await page.close();
 }
}finally{await browser.close();await server.close();}
