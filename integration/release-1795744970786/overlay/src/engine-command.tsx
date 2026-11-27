import {useState} from 'react';
import {knownCount,percent,type EngineId,type EngineRow,type Telemetry} from './executive-metrics';
import './engine-command.css';
const GROUPS=[
 {title:'Rastreo de fuentes',subtitle:'Cobertura y acceso',ids:['A','D'] as EngineId[]},
 {title:'Procesamiento de colas',subtitle:'Documentos y pendientes',ids:['B','C'] as EngineId[]},
 {title:'Rastreo independiente',subtitle:'Ondas y barridos',ids:['CHATGPT','GEMINI'] as EngineId[]}
];
const short=(id:EngineId)=>id==='CHATGPT'?'ChatGPT':id==='GEMINI'?'Gemini':'Motor '+id;
const fmt=(date:string|null)=>date&&Number.isFinite(Date.parse(date))?new Date(date).toLocaleString('es-CL',{timeZone:'America/Santiago',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'Sin registro';
function assessment(row:EngineRow){
 if(row.status==='error')return 'No se pudo consultar el registro de actividad. Revisar la conexión antes de evaluar resultados.';
 if(!row.observedAt)return 'No existe una medición conectada para este motor. Es necesario registrar sus ejecuciones en el origen.';
 if(row.status==='stale')return 'El último registro es antiguo. Comprobar si el motor ejecutó sus tareas programadas.';
 const c=row.counts;
 if(row.role==='documents'&&c.queued!==null&&c.processed!==null&&c.queued>c.processed)return 'La cola pendiente supera el volumen procesado en el último registro. Revisar la tendencia antes de ajustar capacidad.';
 if(c.attempted!==null&&c.blocked!==null&&c.attempted>0&&c.blocked/c.attempted>.25)return 'Más de una cuarta parte de las consultas presenta bloqueos o fallos. Revisar fuentes afectadas.';
 return 'Hay actividad registrada. Los resultados deben contrastarse con las publicaciones confirmadas antes de evaluar la efectividad.';
}
function MiniDonut({value,label}:{value:number|null;label:string}){
 const v=value===null?0:Math.max(0,Math.min(100,value));
 return <div className="tcCmdRing" style={{background:`conic-gradient(#16845b ${v}%,#e8f0eb ${v}% 100%)`}} aria-label={value===null?label+': sin datos':label+': '+value+'%'}>
  <div><strong>{value===null?'—':value+'%'}</strong><small>{label}</small></div>
 </div>;
}
function Bar({label,value,total,scale=total}:{label:string;value:number|null;total:number|null;scale?:number|null}){
 const pct=percent(value,scale);
 return <div className="tcCmdBar"><div><span>{label}</span><b>{knownCount(value)}{total!==null?' / '+total:''}</b></div><div className="tcCmdTrack"><i style={{width:(pct??0)+'%'}}/></div></div>;
}
export function EngineCommand({telemetry}:{telemetry:Telemetry|null}){
 const [selected,setSelected]=useState<EngineId|null>(null);
 const [period,setPeriod]=useState<'last'|'week'>('last');
 const engines=telemetry?.engines||[];
 const active=engines.find(e=>e.id===selected);
 const activeOps=selected==='B'?telemetry?.bcOperations?.pdf:selected==='C'?telemetry?.bcOperations?.html:null;
 const activeStage=selected==='B'||selected==='C'?telemetry?.stageRead?.find(s=>s.engine===selected)?.latest:null;
 const isLegacyBC=active?.id==='B'||active?.id==='C';
 const history=(telemetry?.history||[]).filter(point=>point.engine===active?.id&&
  point.measure===(isLegacyBC?'docs_processed':'sources_attempted'));
 const historyScale=Math.max(1,...history.map(point=>point.value));
 return <section className="tcCmd" aria-label="Rendimiento y diagnóstico de motores">
 <div className="tcCmdHeading"><div><h4>Rendimiento de los motores</h4><p>Toca un motor para ver resultados y problemas.</p></div><span>{knownCount(telemetry?.rollup.reporting)} de 6 con reporte</span></div>
 <div className="tcCmdGroups">{GROUPS.map(group=><section className="tcCmdGroup" key={group.title}>
 <header><strong>{group.title}</strong><small>{group.subtitle}</small></header>
 <div className="tcCmdTwins">{group.ids.map(id=>{const row=engines.find(e=>e.id===id);
 const c=row?.counts;
 const stage=(id==='B'||id==='C')?telemetry?.stageRead?.find(s=>s.engine===id)?.latest:null;
 const ops=id==='B'?telemetry?.bcOperations?.pdf:id==='C'?telemetry?.bcOperations?.html:null;
 const stageCount=id==='B'?telemetry?.bcOperations?.pdf.processed:id==='C'?telemetry?.bcOperations?.html.checked:null;
 const base=row?.role==='documents'?c?.processed??null:c?.attempted??null;
 const done=row?.role==='documents'?c?.processed??null:c?.useful??null;
 const ratio=row?.role==='documents'?null:percent(done,base);
 return <button className="tcCmdMotor" data-role={row?.role||'unreported'} key={id} type="button" onClick={()=>setSelected(id)} aria-label={'Ver detalle de '+short(id)}>
 <span className="tcCmdMotorTitle"><b>{short(id)}</b><span className={'tcCmdDot '+(stage?.at?'recent':row?.status||'unreported')}/></span>
 {row?.role!=='documents'&&<MiniDonut value={ratio} label='Lectura'/>}
 <span className="tcCmdMotorFacts"><span><small>{ops?(id==='B'?'Documentos revisados':'HTML revisados'):stage?'Etapa reciente':row?.role==='documents'?'Procesados':'Consultadas'}</small><b>{knownCount(ops?stageCount:stage?stage.processed:base)}</b></span><span><small>{ops?(id==='B'?'Documentos pendientes':'Enlaces de A'):stage?'Cola actual':row?.role==='documents'?'En cola':'Candidatos'}</small><b>{knownCount(ops?(id==='B'?telemetry?.bcOperations?.pdf.pending:telemetry?.bcOperations?.html.found):stage?null:row?.role==='documents'?row?.status==='stale'?null:c?.queued:c?.candidates)}</b></span></span>
 <small className="tcCmdWhen">{stage?'Etapa conjunta: '+fmt(stage.at):row?.status==='stale'?'Registro individual antiguo · '+fmt(row?.observedAt||null):fmt(row?.observedAt||null)}</small><span className="tcCmdOpen">Ver detalle ›</span>
 </button>})}</div>
 </section>)}</div>
 <p className="tcCmdDataNote">Lectura: fuentes accesibles sobre consultadas. B/C: documentos y colas. Toca cada motor para investigar.</p>
 {active&&<div className="tcCmdOverlay" role="presentation" onClick={()=>setSelected(null)}>
 <section className="tcCmdDrawer" role="dialog" aria-modal="true" aria-label={'Detalle de '+short(active.id)} onClick={e=>e.stopPropagation()}>
 <header className="tcCmdDrawerHead"><div><small>DETALLE DEL MOTOR</small><h4>{short(active.id)}</h4><p>{active.id==='CHATGPT'?'Rastreo por ondas; el último informe no equivale al día completo.':active.id==='GEMINI'?'Rastreo por barridos completos.':active.role==='documents'?'Procesamiento de documentos y colas.':'Consulta de fuentes y verificación.'}</p></div><button type="button" onClick={()=>setSelected(null)} aria-label="Cerrar detalle">✕</button></header>
 <div className="tcCmdLast">{isLegacyBC?<>Último registro independiente: <strong>{fmt(active.observedAt)}</strong> · {active.status==='stale'?'Antiguo':'Registro individual'}</>:<>Última medición: <strong>{fmt(active.observedAt)}</strong> · {active.status==='recent'?'Registro reciente':active.status==='stale'?'Registro antiguo':active.status==='error'?'Error de lectura':'Sin medición'}</>}</div>
 {isLegacyBC&&activeOps&&<div className='tcCmdOps'><strong>Resultados del último ciclo</strong><div className='tcCmdOpsGrid'>{(active.id==='B'?[['Documentos revisados',telemetry?.bcOperations?.pdf.processed],['Documentos pendientes',telemetry?.bcOperations?.pdf.pending],['Elegibles de A',telemetry?.bcOperations?.pdf.eligible],['Reintentos en espera',telemetry?.bcOperations?.pdf.deferred],['Sin oferta',telemetry?.bcOperations?.pdf.decisions?.not_job],['Bloqueados',telemetry?.bcOperations?.pdf.decisions?.blocked]]:[['Enlaces recibidos desde A',telemetry?.bcOperations?.html.found],['Páginas revisadas',telemetry?.bcOperations?.html.checked],['Verificados',telemetry?.bcOperations?.html.verified],['Ya revisados',telemetry?.bcOperations?.html.already],['Bloqueados',telemetry?.bcOperations?.html.blocked],['Diferidos por cupo',telemetry?.bcOperations?.html.budgetDeferred],['Sin lector compatible',telemetry?.bcOperations?.html.unsupported],['Índices diferidos',telemetry?.bcOperations?.html.deferredIndex]]).map(([label,value])=><div key={String(label)}><small>{label}</small><b>{knownCount(value)}</b></div>)}</div><small>Último recibo {fmt(telemetry?.bcOperations?.at||null)}. La entrada C procede del Motor A e incluye enlaces ya revisados. No son nuevas ofertas ni totales acumulados.</small></div>}
 {isLegacyBC&&<div className="tcCmdLast"><strong>{active.id==='B'?'Etapa documental del procesador conjunto':'Etapa HTML del procesador conjunto'}</strong><p>{activeStage?`Última ejecución: ${fmt(activeStage.at)} · ${knownCount(activeStage.processed)} procesados · ${activeStage.status==='completed'?'Etapa finalizada':'Etapa con error'}`:'Sin recepción individual reciente de esta etapa.'}</p><small>No acredita que el motor independiente esté ejecutándose. La cola histórica no es la cola actual.</small></div>}
 <div className="tcCmdDetailGrid">{[
 [active.role==='documents'?'Procesados':'Fuentes consultadas',isLegacyBC?(activeStage?.processed??null):active.role==='documents'?active.counts.processed:active.counts.attempted],
 [active.role==='documents'?'En cola actual':'Lecturas útiles',isLegacyBC?null:active.role==='documents'?active.counts.queued:active.counts.useful],
 [active.role==='documents'?'Candidatos':'Bloqueadas',isLegacyBC?null:active.role==='documents'?active.counts.candidates:active.counts.blocked],
 ['Publicadas confirmadas',active.counts.publishedConfirmed]
 ].map(([label,val])=><div key={String(label)}><small>{label}</small><strong>{knownCount(val)}</strong></div>)}</div>
 <div className="tcCmdPeriod" role="group" aria-label="Vista de resultados"><button type="button" aria-pressed={period==='last'} onClick={()=>setPeriod('last')}>Último registro</button><button type="button" aria-pressed={period==='week'} onClick={()=>setPeriod('week')}>Historial</button></div>
 {period==='last'?<div className="tcCmdDetailBars">
 {active.role==='documents'?<><Bar label={isLegacyBC?'Procesados en etapa conjunta':'Documentos procesados'} value={isLegacyBC?(activeStage?.processed??null):active.counts.processed} total={isLegacyBC?null:active.counts.attempted}/><p>{isLegacyBC?'Los indicadores individuales antiguos no describen la cola actual. La etapa conjunta es distinta del motor independiente.':'El inventario de la cola debe medirse en el productor; una publicación requiere confirmación del catálogo.'}</p></>:<>
 <Bar label="Fuentes consultadas" value={active.counts.attempted} total={active.counts.scheduled}/>
 <Bar label="Lecturas útiles" value={active.counts.useful} total={active.counts.attempted}/>
 <Bar label="Bloqueadas" value={active.counts.blocked} total={active.counts.attempted}/>
 </>}</div>:<div className="tcCmdHistory">{history.length?history.map(point=><Bar key={point.day} label={point.day} value={point.value} total={null} scale={historyScale}/>):<p>Este motor todavía no dispone de una serie histórica conectada.</p>}<small>Historial de ejecuciones registradas.</small></div>}
 <div className="tcCmdDiagnosis"><strong>Diagnóstico</strong><p>{isLegacyBC?'No hay evidencia de programación activa del motor independiente en las tareas actuales. La etapa conjunta sí tiene ejecución registrada; falta conciliación de cola y publicaciones.':assessment(active)}</p></div>
 {active.notes?.length>0&&<details className="tcCmdNotes"><summary>Observaciones de la medición</summary>{active.notes.map((note,i)=><p key={i}>{note}</p>)}</details>}
 <p className="tcCmdDataNote">Las publicaciones sin atribución comprobada no se adjudican a este motor. No se ejecutan rastreos al abrir esta pantalla.</p>
 </section></div>}
 </section>;
}
