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
  const statuses=[['Motor A','recent','Registro reciente'],['Motor B','recent','0 procesados en el ciclo'],
   ['Motor C','error','Con error'],['Motor D','stale','Registro antiguo'],
   ['ChatGPT','unreported','Sin reporte'],['Gemini','recent','Registro reciente']];
  for(const [name,status,label] of statuses){
   const card=page.getByRole('button',{name:'Ver detalle de '+name,exact:true});
   assert.equal(await card.locator('.tcCmdDot.'+status).count(),1);
   assert.match(await card.locator('.tcCmdWhen').innerText(),new RegExp(label));
  }
  for (const engine of ['B','C']) {
   await page.getByRole('button',{name:'Ver detalle de Motor '+engine,exact:true}).click();
   const panel=page.getByRole('dialog',{name:'Detalle de Motor '+engine});
   assert.equal(await panel.getByText(engine==='B'?/0 procesados.*Etapa finalizada/:/Conteo no disponible.*Etapa con error/).count(),1);
   await panel.getByRole('button',{name:'Historial',exact:true}).click();
   const expected=engine==='B'?['0%','50%','100%']:['50%','100%'];
   assert.deepEqual(await panel.locator('.tcCmdHistory .tcCmdTrack i').evaluateAll(nodes=>nodes.map(node=>node.style.width)),expected);
   await panel.getByRole('button',{name:'Cerrar detalle',exact:true}).click();
  }
  await page.getByRole('button',{name:'Ver detalle de ChatGPT',exact:true}).click();
  const missing=page.getByRole('dialog',{name:'Detalle de ChatGPT'});
  assert.equal(await missing.locator('.tcCmdDetailGrid').getByText('Sin datos',{exact:true}).count(),4);
  await missing.getByRole('button',{name:'Historial',exact:true}).click();
  assert.equal(await missing.getByText(/todavía no dispone de una serie histórica/).count(),1);
  await missing.getByRole('button',{name:'Cerrar detalle',exact:true}).click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  assert.deepEqual(errors,[]);
  console.log('Panel simulado: '+width+' px OK');
  await page.close();
 }
}finally{await browser.close();await server.close();}
