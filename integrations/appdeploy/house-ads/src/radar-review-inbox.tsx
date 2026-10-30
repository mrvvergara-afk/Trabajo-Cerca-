import { useEffect, useState } from 'react';
import { api } from '@appdeploy/client';
import './radar-review-inbox.css';

type Entry={id:string;url:string;sourceId:string;territories:string[];
  publishedEvidence:string|null;deadlineEvidence:string|null;status:string;
  lastCheckedAt?:string|null;nextCheckAt?:string|null;lastCheck?:{reason?:string;status?:string};
  publication?:{state:string;published:boolean;lastCheckedAt?:string|null;reason?:string|null;url?:string;existingPublicUrl?:string};};
type CardNotice={tone:'info'|'success'|'warning';message:string};
const reasonLabels:Record<string,string>={
  official_original_date_endpoint_missing:'El índice mantiene la postulación abierta, pero falta un enlace oficial para acreditar la fecha original. No se usará la fecha del rastreo.',
  official_original_date_unavailable:'No se pudo consultar la fecha original en los metadatos oficiales. Se conserva pendiente; no significa que el aviso esté cerrado.',
  official_original_date_missing_or_future:'La fecha original oficial falta o es futura. La fecha de modificación no sustituye la publicación.',
  official_metadata_identity_mismatch:'Los metadatos no corresponden inequívocamente a este aviso. Falta acreditar su fecha original.',
  official_application_status_unconfirmed:'Falta confirmar el estado de esta oferta en su tarjeta del índice oficial; otras ofertas abiertas no sirven como evidencia.',
  official_application_closed:'La municipalidad marca esta oferta como Postulación Cerrada.',
  official_index_unavailable:'El índice oficial no estuvo accesible. No se interpreta como cierre ni se aprueba sin evidencia.',
  official_workplace_requires_review:'Falta acreditar el lugar efectivo de trabajo dentro del aviso, separado de la dirección de la OMIL.',
  official_application_instructions_missing:'Faltan instrucciones presenciales verificables para presentar los antecedentes.',
  official_status_recheck_required:'La comprobación del estado oficial necesita renovarse; no se inventa una fecha de cierre.',
  structured_jobposting_missing:'No se encontró JobPosting. Se requiere evidencia oficial alternativa del aviso; este formato ausente no prueba que la oferta sea falsa.',
  already_in_public_catalog:'La oferta ya está publicada en el catálogo actual. Se conserva su publicación existente.',
  public_duplicate_catalog_unavailable:'El catálogo no está disponible para terminar la revisión de duplicados.',
  already_in_internal_inventory:'La oferta ya está en el inventario o coincide con otra publicación.',
  duplicate_check_incomplete:'La revisión de duplicados todavía no termina.',
  duplicate_check_in_progress:'Revisando el inventario por páginas.',
  duplicate_scan_limit_reached:'El inventario requiere revisión adicional; no se aprobará sin completarla.',
  duplicate_scan_cursor_stalled:'El cursor del inventario no avanzó. No se aprobó.',
  duplicate_scan_concurrent_change:'La bandeja cambió durante la revisión. Vuelve a comprobar.',
  worksite_missing_or_multiple:'La fuente no demuestra una comuna única como lugar real de trabajo; no se puede asumir Angol solo por la categoría del portal.',
  primary_individual_source_required:'Se necesita la publicación individual de la fuente original, no un agregador.',
  workplace_conflicts_with_research:'La comuna del aviso no coincide con la investigación.',
  workplace_outside_territory:'La oferta no corresponde a una de las localidades objetivo.',
  invalid_future_publication_date:'La fecha de publicación original es inválida o futura.',
  mark_final_review_first:'Primero debes seleccionar Revisión final.',
  candidate_missing:'El candidato no está disponible en la bandeja.',
  review_missing:'El candidato no existe o se modificó.',
  needs_queue_reconciliation:'El envío está pendiente de conciliación.',
  already_in_feed:'La oferta ya se encuentra publicada.'
};
const readableReason=(value?:string)=>reasonLabels[value||'']||value?.replace(/_/g,' ')||'No se encontró evidencia suficiente.';
export function RadarReviewInbox(){
  const [items,setItems]=useState<Entry[]>([]);
  const [jsonInput,setJsonInput]=useState('');
  const [busy,setBusy]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [nextToken,setNextToken]=useState<string|null>(null);
  const [cursor,setCursor]=useState<string|undefined>();
  const [previous,setPrevious]=useState<Array<string|undefined>>([]);
  const [eligible,setEligible]=useState<string[]>([]);
  const [feedback,setFeedback]=useState('Importa el informe diario de GitHub para revisar candidatos.');
  const [notices,setNotices]=useState<Record<string,CardNotice>>({});
  const [activeId,setActiveId]=useState<string|null>(null);
  useEffect(()=>{
    let mounted=true;
    void api.get('/api/admin/radar-review').then(response=>{
      if(!mounted)return;
      if(response.data?.schema!=='trabajo-cerca.review-inbox.v1'||!Array.isArray(response.data.items))
        throw Error('invalid_review_inbox');
      setItems(response.data.items);setNextToken(response.data.nextToken||null);
      setLoaded(true);
      setFeedback('Estados cargados. Las aprobadas se verifican automáticamente cada 15 minutos, dentro del presupuesto del motor.');
    }).catch(()=>{
      if(mounted)setFeedback('No se pudo cargar la bandeja automáticamente. Pulsa Actualizar.');
    });
    return()=>{mounted=false;};
  },[]);
  function cardNotice(id:string,tone:CardNotice['tone'],message:string){
    setNotices(current=>({...current,[id]:{tone,message}}));
  }
  async function refresh(target:string|null=cursor||null){
    setBusy(true);
    try{
      const response=await api.get('/api/admin/radar-review'+(target?'?cursor='+encodeURIComponent(target):''));
      if(response.data?.schema!=='trabajo-cerca.review-inbox.v1'||!Array.isArray(response.data.items))
        throw Error('invalid_data');
      setItems(response.data.items);setNextToken(response.data.nextToken||null);setCursor(target||undefined);setLoaded(true);
      setEligible([]);setNotices({});
      setFeedback('Estados actualizados en conjunto. El resultado público se comprueba contra el catálogo actual.');
    }catch{setFeedback('No se pudo consultar la bandeja. Comprueba tu sesión.');}
    finally{setBusy(false);}
  }
  async function importItems(){
    setBusy(true);
    try{
      if(jsonInput.length>130000)throw Error('payload_too_long');
      const parsed=JSON.parse(jsonInput) as {items?:unknown[]};
      if(!Array.isArray(parsed.items)||parsed.items.length<1||parsed.items.length>35)
        throw Error('invalid_payload');
      const result=await api.post('/api/admin/radar-review/import',{items:parsed.items});
      setFeedback('Importados '+result.data.inserted+' · repetidos '+result.data.duplicates+
        ' · rechazados '+result.data.rejected+' · publicados 0.');
      setJsonInput('');
      const updated=await api.get('/api/admin/radar-review');
      if(Array.isArray(updated.data?.items)){setItems(updated.data.items);setNextToken(updated.data.nextToken||null);setCursor(undefined);setPrevious([]);setLoaded(true);}
    }catch{setFeedback('No se completó la importación. Revisa el JSON y tu sesión antes de volver a intentar.');}
    finally{setBusy(false);}
  }
  async function check(id:string){
    setBusy(true);
    setActiveId(id);
    cardNotice(id,'info','Comprobando fuente, fecha, localidad y duplicados…');
    try{
      let result={
        status:'pending',
        reason:'duplicate_check_in_progress',
        scanned:0
      } as {status:string;reason?:string;title?:string;workCommune?:string;publishedDate?:string;scanned?:number};
      for(let pass=0;pass<6;pass++){
        const response=await api.post('/api/admin/radar-review/check',{id});
        result=response.data;
        if(result.reason!=='duplicate_check_in_progress')break;
        cardNotice(id,'info','Revisando duplicados: '+(result.scanned||0)+' registros comprobados. Continuando…');
      }
      const approved=result.status==='verified_for_final_review';
      setEligible(old=>approved?[...new Set([...old,id])]:old.filter(key=>key!==id));
      if(approved){
        cardNotice(id,'success','Fuente confirmada: '+(result.title||'Oferta')+' · '+(result.workCommune||'Localidad comprobada')+' · '+(result.publishedDate||'Fecha comprobada')+'. Pulsa Enviar al verificador. Aún no está publicada.');
      }else if(result.reason==='duplicate_check_in_progress'){
        cardNotice(id,'info','Ya se revisaron '+(result.scanned||0)+' registros. El control aún no terminó. Pulsa Comprobar fuente y fecha para continuar sin reiniciar.');
      }else{
        cardNotice(id,'warning','No se pudo aprobar: '+readableReason(result.reason)+'. Estado: '+result.status+'.');
      }
      setFeedback('Resultado de comprobación disponible dentro de la tarjeta seleccionada.');
    }catch{
      setEligible(old=>old.filter(key=>key!==id));
      cardNotice(id,'warning','No se pudo conectar con el comprobador. Reintenta aquí. La oferta no se publicó.');
      setFeedback('Error de comprobación en la tarjeta seleccionada.');
    }finally{
      setBusy(false);
      setActiveId(null);
    }
  }
  async function send(id:string){
    setBusy(true);
    setActiveId(id);
    cardNotice(id,'info','Enviando al verificador…');
    try{
      const response=await api.post('/api/admin/radar-review/submit',{id});
      if(!response.data?.queued){
        const reason=String(response.data?.reason||'source_verification_required');
        if(reason==='duplicate_check_in_progress'){
          setEligible(current=>current.filter(candidateId=>candidateId!==id));
          cardNotice(id,'info','El servidor necesita terminar la revisión de duplicados. Pulsa Comprobar fuente y fecha para completar la revisión antes del envío. No se publicó.');
        }else{
          setEligible(current=>current.filter(candidateId=>candidateId!==id));
          cardNotice(id,'warning','Envío no realizado: '+readableReason(reason)+'. Debe comprobarse nuevamente. No se publicó.');
        }
        return;
      }
      setItems(rows=>rows.map(x=>x.id===id?{...x,status:'queued_for_verification'}:x));
      setEligible(old=>old.filter(x=>x!==id));
      cardNotice(id,'success','Enviado al verificador (ID: '+String(response.data.jobId||'asignado')+'). Todavía no publicado: consulta el resultado del motor.');
      setFeedback('El envío se registró en la tarjeta correspondiente.');
    }catch{
      cardNotice(id,'warning','La solicitud falló o no se pudo confirmar. Consulta la publicación antes de reintentar; no hay publicación confirmada.');
    }finally{
      setBusy(false);
      setActiveId(null);
    }
  }
  async function statusOf(id:string){
    setBusy(true);
    setActiveId(id);
    cardNotice(id,'info','Consultando estado de publicación…');
    try{
      const result=await api.post('/api/admin/radar-review/status',{id});
      const state=String(result.data?.state||'unknown');
      const labels:Record<string,string>={
        published_confirmed:'Aviso confirmado en el catálogo público.',
        inactive_or_rejected:'La oferta fue descartada o dejó de estar activa.',
        pending_verifier:'Pendiente de la revisión automática del motor.',
        waiting_for_feed:'El inventario público está reconstruyéndose.',
        waiting_for_feed_projection:'Verificada internamente, pero aún no visible en el catálogo.',
        queue_reconciliation_required:'Se necesita conciliar el recibo de la cola.',
        not_queued:'El candidato todavía no se ha enviado al motor.'
      };
      setItems(rows=>rows.map(row=>row.id===id?{...row,publication:result.data}:row));
      const published=state==='published_confirmed';
      cardNotice(id,published?'success':'info',labels[state]||'Estado del verificador: '+state);
      setFeedback('Estado actualizado dentro de la tarjeta correspondiente.');
    }catch{
      cardNotice(id,'warning','No se pudo comprobar el estado. Reintenta sin reenviar la misma oferta.');
    }finally{
      setBusy(false);
      setActiveId(null);
    }
  }
  async function mark(id:string,status:string){
    setBusy(true);
    setActiveId(id);
    cardNotice(id,'info','Guardando decisión…');
    try{
      await api.post('/api/admin/radar-review/decision',{id,status});
      setItems(current=>current.map(item=>item.id===id?{...item,status}:item));
      setEligible(old=>old.filter(key=>key!==id));
      cardNotice(id,'info','Decisión guardada en la bandeja. Todavía no se ha publicado.');
      setFeedback('Decisión registrada en la tarjeta correspondiente.');
    }catch{
      cardNotice(id,'warning','No fue posible guardar la decisión. Pulsa Actualizar y vuelve a intentarlo.');
    }finally{
      setBusy(false);
      setActiveId(null);
    }
  }
  return <section className='tcReviewInbox' aria-label='Bandeja laboral privada'>
    <div className='tcReviewHead'>
      <div><h3>Revisión de avisos detectados</h3><p>Solo administración · Verificación automática de avisos aprobados</p></div>
      <button type='button' onClick={()=>void refresh()} disabled={busy}>Actualizar estados</button>
    </div>
    <details><summary>Importar candidatos desde GitHub (JSON)</summary>
      <p>Selecciona el archivo JSON del radar o pega su contenido. No incluyas contraseñas ni datos personales.</p>
      <input type='file' accept='.json,application/json' aria-label='Seleccionar informe JSON'
        disabled={busy} onChange={event=>{
          const file=event.target.files?.[0];
          if(!file)return;
          if(file.size>130000){setFeedback('El archivo supera el límite de 130 KB.');return;}
          void file.text().then(contents=>{setJsonInput(contents);setFeedback('Archivo cargado; verifica e importa los candidatos.');})
            .catch(()=>setFeedback('No se pudo leer el archivo.'));
        }} />
      <textarea rows={4} maxLength={130000} value={jsonInput}
        onChange={event=>setJsonInput(event.target.value)}
        spellCheck={false} aria-label='Contenido JSON de candidatos'
        placeholder='[{"candidate_key":"..."}]'/>
      <div className='tcReviewActions'>
        <button type='button' disabled={busy||!jsonInput.trim()} onClick={()=>void importItems()}>Importar para revisar</button>
        <a href='https://github.com/mrvvergara-afk/Trabajo-Cerca-/actions/workflows/trabajo-cerca-radar-diario.yml'
           target='_blank' rel='noopener noreferrer'>Ver rastreos diarios</a>
      </div>
    </details>
    <p role='status' aria-live='polite'>{feedback}</p>
    {loaded&&<div className='tcReviewSummary' aria-label='Estado de los avisos en revisión'>
      <strong>Estados de esta página</strong>
      <span>{items.filter(x=>x.publication?.published).length} publicados · {items.filter(x=>x.publication?.state==='pending_verifier').length} pendientes de verificación · {items.filter(x=>x.publication?.state==='waiting_for_feed_projection').length} esperando catálogo</span>
      <ul className='tcReviewStateList' aria-label='Resultados del circuito de publicación'>
        {items.map(item=><li key={item.id}>
          <strong>{item.sourceId||item.id}</strong>
          <div><b>{item.publication?.published?'Publicada':item.publication?.state==='duplicate'?'Duplicada':item.publication?.state==='inactive_or_rejected'?'Rechazada o vencida':item.publication?.state==='blocked'?'Bloqueada':item.publication?.state==='waiting_for_feed_projection'?'Verificada · esperando catálogo':item.status==='queued_for_verification'?'En verificación':item.status==='discarded'?'Descartada':'Revisión administrativa'}</b>
          <small>Última comprobación: {item.publication?.lastCheckedAt||item.lastCheckedAt?new Date((item.publication?.lastCheckedAt||item.lastCheckedAt)!).toLocaleString('es-CL',{timeZone:'America/Santiago',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'Sin comprobación registrada'}</small>
          {(item.publication?.reason||item.lastCheck?.reason)&&<small>{readableReason(item.publication?.reason||item.lastCheck?.reason)}</small>}
          {item.nextCheckAt&&<small>Próxima revisión: {new Date(item.nextCheckAt).toLocaleString('es-CL',{timeZone:'America/Santiago',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</small>}
          </div>
          {item.publication?.published&&item.publication.url?<a href={item.publication.url} target='_blank' rel='noopener noreferrer'>Ver oferta</a>:item.publication?.state==='duplicate'&&item.publication.existingPublicUrl?<a href={item.publication.existingPublicUrl} target='_blank' rel='noopener noreferrer'>Ver existente</a>:null}
        </li>)}
      </ul>
      <nav aria-label='Páginas de la bandeja' className='tcReviewPagination'>
        <button type='button' disabled={busy||!previous.length} onClick={()=>{const history=previous.slice(0,-1),target=previous[previous.length-1];setPrevious(history);void refresh(target??null);}}>Página anterior</button>
        <button type='button' disabled={busy||!nextToken} onClick={()=>{if(!nextToken)return;setPrevious(history=>[...history,cursor]);void refresh(nextToken);}}>Siguiente página</button>
      </nav>
    </div>}
    {loaded&&items.length===0&&<p>Sin candidatos importados todavía.</p>}
    <div className='tcReviewGrid'>{items.map(item=><article className='tcReviewEntry' key={item.id}>
      <div className='tcReviewHead'><strong>{item.sourceId||'Fuente sin identificar'}</strong>
        <small>{item.status==='queued_for_verification'?'En verificación':item.status==='submitting'?'Procesando':item.status==='discarded'?'Descartado':item.status==='needs_evidence'?'Falta evidencia':
          item.status==='ready_for_final_check'?'Revisión final pendiente':'Pendiente'}</small>
      </div>
      <p>{item.territories.join(', ')||'Ubicación por verificar'} · Publicación: {item.publishedEvidence||'no acreditada'}</p>
      <a href={item.url} rel='noopener noreferrer' target='_blank'>Abrir fuente original</a>
      <div className='tcReviewActions'>
        {!['submitting','queued_for_verification'].includes(item.status)&&<>
        <button type='button' disabled={busy} onClick={()=>void mark(item.id,'needs_evidence')}>Falta evidencia</button>
        <button type='button' disabled={busy} onClick={()=>void mark(item.id,'discarded')}>Descartar</button>
        <button type='button' disabled={busy} onClick={()=>void mark(item.id,'ready_for_final_check')}>Revisión final</button>
        {item.status==='ready_for_final_check'&&<button type='button' className='tcReviewPrimary' disabled={busy}
          onClick={()=>void check(item.id)}>{busy&&activeId===item.id?'Comprobando…':'Comprobar fuente y fecha'}</button>}
        {item.status==='ready_for_final_check'&&eligible.includes(item.id)&&
          <button type='button' className='tcReviewPrimary' disabled={busy} onClick={()=>void send(item.id)}>
            {busy&&activeId===item.id?'Enviando…':'Enviar al verificador'}
          </button>}
        </>}
        {item.status==='queued_for_verification'&&
          <button type='button' className='tcReviewPrimary' disabled={busy} onClick={()=>void statusOf(item.id)}>
            {busy&&activeId===item.id?'Consultando…':'Consultar publicación'}
          </button>}
      </div>
      {notices[item.id]&&
        <p role='status' aria-live='polite' className={'tcReviewNotice tcReviewNotice--'+notices[item.id].tone}>
          {notices[item.id].message}
        </p>}
    </article>)}</div>
  </section>;
}
