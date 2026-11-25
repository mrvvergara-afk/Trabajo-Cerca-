import {useState} from 'react';
import {api} from '@appdeploy/client';
type Offer={id_fuente:string;cargo:string;empresa:string;comunas:string[];url_original:string;fecha_publicacion:string;fecha_cierre?:string|null;justificacion?:string};
type Result={id:string;status:string;existingId?:string};
export function ChatGPTDirectConnector(){
 const [offers,setOffers]=useState<Offer[]>([]);
 const [results,setResults]=useState<Result[]>([]);
 const [message,setMessage]=useState('Carga el lote JSON y simula antes de importar.');
 const [busy,setBusy]=useState(false),[previewed,setPreviewed]=useState(false);
 async function loadFile(file?:File){
  if(!file)return;
  try{const data=JSON.parse(await file.text()) as {offers?:Offer[]};if(!Array.isArray(data.offers))throw Error('Falta offers[]');
   setOffers(data.offers);setResults([]);setPreviewed(false);setMessage(data.offers.length+' ofertas cargadas.');
  }catch(cause){setMessage(cause instanceof Error?cause.message:'Archivo inválido');}
 }
 async function run(commit:boolean){
  if(!offers.length||(commit&&!previewed))return;
  if(commit&&!window.confirm('¿Incorporar directamente las ofertas aptas al catálogo?'))return;
  setBusy(true);
  try{const response=await api.post('/api/admin/chatgpt-direct-import',{offers,commit});
   const next=response.data.results as Result[];setResults(next);setPreviewed(!commit);
   const counts=new Map<string,number>();for(const x of next)counts.set(x.status,(counts.get(x.status)||0)+1);
   setMessage((commit?'Importación: ':'Simulación: ')+[...counts].map(([s,n])=>s+': '+n).join(' · '));
  }catch(cause){setPreviewed(false);const status=(cause as {response?:{status?:number}}).response?.status;setMessage('No se completó la consulta'+(status?' HTTP '+status:'')+'.');}
  finally{setBusy(false);}
 }
 return <section className='opsCard' aria-label='Importación ChatGPT'>
  <h3>Conector directo ChatGPT</h3><p>Solo administración · no usa las colas de verificación de los motores. Primero verifica en el catálogo vivo.</p>
  <input aria-label='Cargar lote JSON' type='file' accept='.json,application/json' onChange={e=>void loadFile(e.target.files?.[0])}/>
  <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}>
   <button disabled={busy||!offers.length} onClick={()=>void run(false)}>Simular</button>
   <button disabled={busy||!previewed||!results.some(x=>x.status==='ready_for_direct_import')} onClick={()=>void run(true)}>Importar aptas</button>
  </div>
  <p role='status'>{message}</p>
  <div style={{maxHeight:250,overflowY:'auto'}}>{results.map(x=><p key={x.id}>{x.id}: {x.status}</p>)}</div>
 </section>;
}