import {useEffect,useState} from 'react';
import {api} from '@appdeploy/client';
type Source={id:string;communes?:string[];status?:string;checkedAt?:string|null;candidates?:number|null};
type Response={sources?:Source[];sourceAuditComplete?:boolean;checkedAt?:string};
export function SourceManagement(){
 const [data,setData]=useState<Response|null>(null);
 const [error,setError]=useState(false);
 const [loading,setLoading]=useState(true);
 const [filter,setFilter]=useState('');
 const refresh=()=>{setLoading(true);setError(false);void api.get('/api/admin/territorial-coverage').then(r=>{
 const v=r.data as Response; if(!Array.isArray(v?.sources))throw new Error('missing_sources');
 setData(v);
 }).catch(()=>{setError(true);setData(null)}).finally(()=>setLoading(false));};
 useEffect(()=>{refresh()},[]);
 const sources=(data?.sources||[]).filter(s=>s.id.toLowerCase().includes(filter.toLowerCase()));
 return <section className='tcSourceManagement'><header><h3>Gestión de fuentes</h3><button type='button' onClick={refresh} disabled={loading}>{loading?'Consultando…':'Actualizar'}</button></header>
 <p>Diagnóstico del inventario consultado. Acceso, lectura y extracción son etapas distintas; un estado no comprobado no se considera exitoso.</p>
 {error&&<p role='alert'>No fue posible consultar las fuentes. No se muestran estados inventados.</p>}
 {data&&<p role='status'>{data.sources?.length??0} fuentes devueltas · {data.sourceAuditComplete?'Consulta marcada completa':'Consulta parcial'} · {data.checkedAt?new Date(data.checkedAt).toLocaleString('es-CL'):'Sin fecha'}</p>}
 <label>Buscar fuente <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder='OMIL, municipio, empresa, portal…'/></label>
 <div className='tcSourceTableWrap'><table><thead><tr><th>Fuente</th><th>Acceso registrado</th><th>Extracción</th><th>Avisos detectados</th><th>Última revisión</th></tr></thead><tbody>
 {sources.map(s=><tr key={s.id}><th scope='row'>{s.id}</th><td>{s.status==='ok'?'Consulta registrada':s.status==='not_checked'?'Sin comprobar':s.status||'Sin diagnóstico'}</td><td>No acreditada por esta auditoría</td><td>{typeof s.candidates==='number'?s.candidates:'Sin datos'}</td><td>{s.checkedAt?new Date(s.checkedAt).toLocaleString('es-CL'):'Sin registro'}</td></tr>)}
 </tbody></table></div>
 <p>Para distinguir lectura de fichas, extracción útil, bloqueo temporal o estructural y publicación confirmada se requiere conciliar los recibos de cada motor con el inventario completo. Esta vista no afirma esas capacidades sin evidencia.</p>
 </section>;
}