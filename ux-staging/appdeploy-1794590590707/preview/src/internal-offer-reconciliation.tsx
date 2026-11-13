import { useEffect, useState } from 'react';
import { api } from '@appdeploy/client';

type Row = {id:string;cargo:string;empresa:string;comuna:string[];fuente:string;url:string;fecha:string;plazo:string;active:boolean;verified:boolean;review:boolean;checkDue:boolean;group:string;reason:string;discoveredBy?:string;verificationReason:string;retentionReason:string|null;exclusionReason:string|null};
type Audit = {readOnly:boolean;checkedAt:string;inventoryComplete:boolean;publicComplete:boolean;totalInternalJobRecords:number;publicFeedEntries:number;counts:Record<string,number>;originCounts?:Record<string,number>;items:Row[];note:string};
const groups=[
  ['publicada','Publicadas o duplicadas con la portada'],
  ['apta_no_visible','Aptas pero ausentes del catálogo'],
  ['apta_bloqueada','Aprobadas bloqueadas por proyección'],
  ['reverificar','Necesitan nueva verificación'],
  ['revisar_inactiva','Inactivas por analizar'],
  ['archivada_sin_evidencia','Archivadas tras revisión inconclusa'],
  ['descartable_confirmada','Plazo de postulación vencido'],
] as const;
export function InternalOfferReconciliation(){
  const [audit,setAudit]=useState<Audit|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [group,setGroup]=useState('todas');
  const [archival,setArchival]=useState<{available:boolean;latest?:{checkedAt?:string;inspected?:number;archived?:number;missingDeadline?:number;hasMore?:boolean}}|null>(null);
  const [recovery,setRecovery]=useState<{available:boolean;latest?:{checkedAt?:string;state?:string;scanned?:number;eligibleMissing?:number;queued?:number;diagnostic?:Record<string,number>;communes?:Record<string,{records:number;published:number;pending:number;blocked:number;eligibleAbsent:number}>}}|null>(null);
  useEffect(()=>{
    let live=true;
    void api.get('/api/admin/internal-offer-reconciliation').then(r=>{if(live)setAudit(r.data as Audit);}).catch(()=>{if(live)setError('No se pudo cargar la conciliación automáticamente.');});
    void api.get('/api/admin/gap-recovery-status').then(r=>{if(live)setRecovery(r.data);}).catch(()=>undefined);
    void api.get('/api/admin/archive-cleanup-status').then(r=>{if(live)setArchival(r.data);}).catch(()=>undefined);
    return ()=>{live=false;};
  },[]);
  async function run(){
    setBusy(true);setError('');
    try{const response=await api.get('/api/admin/internal-offer-reconciliation');setAudit(response.data as Audit);}
    catch{setError('No se pudo leer el inventario completo. Confirma tu sesión administrativa y vuelve a intentarlo.');}
    finally{setBusy(false);}
  }
  function download(){
    if(!audit)return;
    const columns=['id','cargo','empresa','comuna','fuente','fecha','plazo','active','verified','review','checkDue','group','reason','discoveredBy','verificationReason','retentionReason','exclusionReason','url'] as const;
    const q=(v:unknown)=>'"'+String(v??'').replace(/"/g,'""')+'"';
    const lines=[columns.join(','),...audit.items.map(r=>columns.map(k=>q(k==='comuna'?r.comuna.join(' / '):r[k])).join(','))];
    const blob=new Blob([String.fromCharCode(0xFEFF)+lines.join('\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='trabajo-cerca-conciliacion-interna.csv';a.click();URL.revokeObjectURL(url);
  }
  const visible=audit?.items.filter(r=>group==='todas'||r.group===group)||[];
  return <section className="opsCard" aria-label="Conciliación de ofertas internas">
    <h3>Conciliación: registros internos vs. catálogo público</h3>
    <p>Clasificación completa y de solo lectura. No borra ni reactiva avisos. Distingue descartes con plazo explícito de casos que requieren revisión humana o nueva búsqueda en origen.</p>
    <button type="button" onClick={()=>void run()} disabled={busy}>{busy?'Actualizando…':'Actualizar conciliación'}</button>
    <h4>Limpieza y archivo automático</h4>
    {!archival?.available&&<p>El archivador aún no registra una ejecución. Solo archivará avisos con plazo explícito vencido; conservará todo el historial.</p>}
    {archival?.available&&archival.latest&&<p>Última pasada: {archival.latest.checkedAt?new Date(archival.latest.checkedAt).toLocaleString('es-CL'):'Sin fecha'} · {archival.latest.inspected??0} examinadas · <strong>{archival.latest.archived??0} archivadas por cierre acreditado</strong> · {archival.latest.missingDeadline??0} sin cierre explícito; {archival.latest.hasMore?'continúa en próxima pasada':'pasada finalizada'}.</p>}
    <h4>Recuperación automática</h4>
    {!recovery?.available&&<p>Sin ejecución registrada del nuevo recuperador. Se comprobará en el cron de publicación.</p>}
    {recovery?.available&&recovery.latest&&<>
      <p>Última revisión automática: {recovery.latest.checkedAt?new Date(recovery.latest.checkedAt).toLocaleString('es-CL'):'Sin fecha'} · {recovery.latest.scanned??0} registros examinados · {recovery.latest.eligibleMissing??0} aptos ausentes · {recovery.latest.queued??0} enviados a publicación.</p>
      <p>{Object.entries(recovery.latest.diagnostic||{}).filter(([,n])=>n>0).map(([label,n])=>label+': '+n).join(' · ')}</p>
      <h4>Cobertura diagnosticada por comuna</h4>
      <div style={{maxHeight:300,overflow:'auto'}}><table><thead><tr><th>Comuna</th><th>Registros</th><th>Visibles/equivalentes</th><th>Pendientes</th><th>Bloqueados</th><th>Aptos ausentes</th></tr></thead><tbody>{Object.entries(recovery.latest.communes||{}).sort((a,b)=>a[0].localeCompare(b[0],'es')).map(([city,stats])=><tr key={city}><td>{city}</td><td>{stats.records}</td><td>{stats.published}</td><td>{stats.pending}</td><td>{stats.blocked}</td><td>{stats.eligibleAbsent}</td></tr>)}</tbody></table></div>
    </>}
    {error&&<p role="alert">{error}</p>}
    {audit&&<>
      <p><strong>{audit.totalInternalJobRecords}</strong> registros internos de empleo · <strong>{audit.publicFeedEntries}</strong> elementos públicos (incluye otros tipos de publicación) · {new Date(audit.checkedAt).toLocaleString('es-CL')}</p>
      {(!audit.inventoryComplete||!audit.publicComplete)&&<p role="alert">Lectura parcial: no tomar esta clasificación como definitiva.</p>}
      <div className="tcAdminStatGrid">
        {groups.map(([key,label])=><article key={key}><small>{label}</small><strong>{audit.counts[key]||0}</strong></article>)}
      </div>
      <p>{audit.note}</p>
      <details><summary>Origen de los registros por motor o proceso</summary>
        <p>El origen refleja metadatos guardados, no una atribución inventada a un motor.</p>
        <table><thead><tr><th>Procedencia guardada</th><th>Registros</th></tr></thead><tbody>{Object.entries(audit.originCounts||{}).sort((a,b)=>b[1]-a[1]).map(([key,n])=><tr key={key}><td>{key}</td><td>{n}</td></tr>)}</tbody></table>
      </details>
      <label>Filtrar grupo <select value={group} onChange={e=>setGroup(e.target.value)}><option value="todas">Todos los registros</option>{groups.map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label>
      <button type="button" onClick={download}>Exportar conciliación CSV</button>
      <div style={{maxHeight:510,overflow:'auto'}}><table><thead><tr><th>Cargo / empresa</th><th>Comuna</th><th>Diagnóstico</th><th>Fuente original</th></tr></thead><tbody>{visible.map(r=><tr key={r.id}><td><strong>{r.cargo||r.id}</strong><div>{r.empresa}</div></td><td>{r.comuna.join(', ')}</td><td><strong>{groups.find(g=>g[0]===r.group)?.[1]||r.group}</strong><div>{r.reason}</div></td><td>{r.url?<a href={r.url} target="_blank" rel="noopener noreferrer">Abrir fuente</a>:'Sin enlace'}</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}
