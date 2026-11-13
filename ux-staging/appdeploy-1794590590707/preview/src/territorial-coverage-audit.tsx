import {useEffect,useState} from 'react';
import {api} from '@appdeploy/client';
type Row={city:string;publicJobs:number;sourceConfigured:number;sourceChecked:number;sourceFailed:number;sourceWithFindings:number;latestSweep:string|null;internalPending:number;internalBlocked:number;unpublishedEligible:number};
type Report={checkedAt:string;feedComplete:boolean;sourceAuditComplete:boolean;recoveryCheckedAt:string|null;communes:Row[];note:string};
export function TerritorialCoverageAudit(){
 const [report,setReport]=useState<Report|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const load=async()=>{setLoading(true);setError('');try{const r=await api.get('/api/admin/territorial-coverage');setReport(r.data as Report);}catch{setError('No fue posible consultar la cobertura territorial.');}finally{setLoading(false);}};
 useEffect(()=>{void load();},[]);
 return <section className="opsCard" aria-label="Cobertura de las doce comunas">
  <h3>Cobertura de las 12 comunas</h3>
  <p>Compara publicaciones visibles con fuentes realmente consultadas. Mininco corresponde a Collipulli; Coihue a Negrete; Capitán Pastene a Lumaco. Excluye ciudades fuente y Quilaco.</p>
  <button type="button" onClick={()=>void load()} disabled={loading}>{loading?'Consultando…':'Actualizar cobertura'}</button>
  {error&&<p role="alert">{error}</p>}
  {report&&<>
   {(!report.feedComplete||!report.sourceAuditComplete)&&<p role="status">Lectura parcial: la cobertura puede estar subestimada.</p>}
   <p>{report.note} · {new Date(report.checkedAt).toLocaleString('es-CL')}</p>
   <div style={{maxHeight:520,overflow:'auto'}}><table><thead><tr><th>Comuna</th><th>Publicadas</th><th>Fuentes configuradas</th><th>Fuentes con revisión registrada</th><th>Con hallazgos</th><th>Con fallo</th><th>Pendientes internos</th><th>Aptas ausentes</th></tr></thead><tbody>
   {report.communes.map(row=><tr key={row.city}><td><strong>{row.city}</strong></td><td>{row.publicJobs}</td><td>{row.sourceConfigured}</td><td>{row.sourceChecked}</td><td>{row.sourceWithFindings}</td><td>{row.sourceFailed}</td><td>{row.internalPending}</td><td>{row.unpublishedEligible}</td></tr>)}
   </tbody></table></div>
  </>}
 </section>;
}
