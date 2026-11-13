import { useState } from 'react';
import { api } from '@appdeploy/client';

type Offer = { id:string; title?:string; company?:string; workCommunes?:string[]; source?:string; origin?:string|null; discoveredBy?:string|null; provenance?:string; engineAttribution?:string; url?:string; inPublicFeed:boolean; verified:boolean };
type Page = { items:Offer[]; nextCursor:string|null; reportedVerifiedJobs:number; hasMore:boolean; available:boolean };
export function PublicInventoryAudit() {
  const [rows,setRows]=useState<Offer[]>([]);
  const [count,setCount]=useState<number|null>(null);
  const [complete,setComplete]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('Consulta paginada del catálogo público; no cambia publicaciones.');
  async function readAll() {
    setBusy(true);setRows([]);setComplete(false);setMessage('Consultando páginas del catálogo…');
    let cursor:string|null=null;
    const found:Offer[]=[];
    const visited=new Set<string>();
    try {
      for(let step=0;step<100;step++) {
        const suffix=cursor?'?cursor='+encodeURIComponent(cursor):'';
        const response=await api.get('/api/admin/feed-audit'+suffix);
        const data=response.data as Page;
        if(!data.available)throw Error('El manifiesto público todavía no está disponible.');
        setCount(data.reportedVerifiedJobs);
        found.push(...data.items);
        setRows([...found]);
        if(!data.hasMore||!data.nextCursor){setComplete(true);setMessage('Auditoría completa.');return;}
        if(visited.has(data.nextCursor))throw Error('Cursor repetido: lectura incompleta.');
        visited.add(data.nextCursor);cursor=data.nextCursor;
      }
      setMessage('Límite de páginas alcanzado: resultado parcial.');
    }catch(cause){setMessage(cause instanceof Error?cause.message:'No fue posible completar la auditoría.');}
    finally{setBusy(false);}
  }
  const verified=rows.filter(row=>row.verified&&row.inPublicFeed);
  const byCity=new Map<string,number>();
  for(const row of verified)for(const city of new Set(row.workCommunes||[]))byCity.set(city,(byCity.get(city)||0)+1);
  const byOrigin=new Map<string,number>();
  for(const row of verified){const origin=row.discoveredBy||row.origin||'Sin procedencia registrada';byOrigin.set(origin,(byOrigin.get(origin)||0)+1);}
  const missing=count===null?null:count-verified.length;
  function exportCsv(){
    const cols=['id','title','company','workCommunes','source','discoveredBy','origin','url'];
    const quote=(s:unknown)=>'"'+String(s??'').replace(/"/g,'""')+'"';
    const text=[cols.join(','),...rows.map(row=>cols.map(key=>quote(key==='workCommunes'?(row.workCommunes||[]).join(' / '):row[key as keyof Offer])).join(','))].join('\n');
    const objectUrl=URL.createObjectURL(new Blob([String.fromCharCode(0xFEFF)+text],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=objectUrl;link.download='trabajo-cerca-auditoria-publica.csv';link.click();URL.revokeObjectURL(objectUrl);
  }
  return <section className='opsCard' aria-label='Auditoría de ofertas públicas'>
    <h3>Inventario y trazabilidad del catálogo</h3>
    <p>Informe interno de solo lectura; cuenta cada aviso una vez y permite identificar su fuente.</p>
    <button disabled={busy} onClick={()=>void readAll()}>{busy?'Consultando…':'Auditar catálogo completo'}</button>
    <p role='status'>{message}</p>
    <p><strong>{count??'—'}</strong> verificadas informadas · <strong>{verified.length}</strong> verificadas recuperadas · {complete?'Lectura completa':'Lectura no concluida'}{missing!==null&&missing!==0?' · Diferencia por investigar: '+missing:''}</p>
    {rows.length>0&&<><button onClick={exportCsv}>Exportar detalle CSV</button>
    <h4>Distribución por comuna</h4>
    <p>{[...byCity].sort((a,b)=>b[1]-a[1]).map(([name,n])=>name+': '+n).join(' · ')||'Sin ubicaciones disponibles'}</p>
    <h4>Procedencia registrada</h4>
    <p>{[...byOrigin].sort((a,b)=>b[1]-a[1]).map(([name,n])=>name+': '+n).join(' · ')}</p>
    <div style={{overflowX:'auto',maxHeight:450,overflowY:'auto'}}><table><thead><tr><th>Cargo</th><th>Comuna</th><th>Fuente / motor</th><th>Estado</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{row.title||row.id}</td><td>{(row.workCommunes||[]).join(', ')}</td><td>{row.discoveredBy||row.origin||'Sin atribución'} · {row.source||''}</td><td>{row.verified?'En manifiesto verificado':'En manifiesto, sin bandera verificada'}</td></tr>)}</tbody></table></div></>}
  </section>;
}
