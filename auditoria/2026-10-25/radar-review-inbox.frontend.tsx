import { useState } from 'react';
import { api } from '@appdeploy/client';
import './radar-review-inbox.css';

type Entry={id:string;url:string;sourceId:string;territories:string[];
  publishedEvidence:string|null;deadlineEvidence:string|null;status:string};
export function RadarReviewInbox(){
  const [items,setItems]=useState<Entry[]>([]);
  const [jsonInput,setJsonInput]=useState('');
  const [busy,setBusy]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [feedback,setFeedback]=useState('Importa el informe diario de GitHub para revisar candidatos.');
  async function refresh(){
    setBusy(true);
    try{
      const response=await api.get('/api/admin/radar-review');
      if(response.data?.schema!=='trabajo-cerca.review-inbox.v1'||!Array.isArray(response.data.items))
        throw Error('invalid_data');
      setItems(response.data.items);setLoaded(true);
      setFeedback('Bandeja actualizada. Ningún candidato ha sido publicado.');
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
      if(Array.isArray(updated.data?.items)){setItems(updated.data.items);setLoaded(true);}
    }catch{setFeedback('No se completó la importación. Revisa el JSON y tu sesión antes de volver a intentar.');}
    finally{setBusy(false);}
  }
  async function mark(id:string,status:string){
    setBusy(true);
    try{
      await api.post('/api/admin/radar-review/decision',{id,status});
      setItems(current=>current.map(item=>item.id===id?{...item,status}:item));
      setFeedback('Cambio guardado solo en la bandeja privada. No se publicó la oferta.');
    }catch{setFeedback('No se pudo actualizar; vuelve a cargar la bandeja.');}
    finally{setBusy(false);}
  }
  return <section className='tcReviewInbox' aria-label='Bandeja laboral privada'>
    <div className='tcReviewHead'>
      <div><h3>Revisión de avisos detectados</h3><p>Solo administración · Sin publicación automática</p></div>
      <button type='button' onClick={()=>void refresh()} disabled={busy}>Actualizar</button>
    </div>
    <details><summary>Importar candidatos desde GitHub (JSON)</summary>
      <p>Abre el radar diario en GitHub Actions, descarga el archivo «candidatos_revision.json» del artefacto y pega aquí su contenido. Nunca introduzcas contraseñas ni datos privados.</p>
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
    {loaded&&items.length===0&&<p>Sin candidatos importados todavía.</p>}
    <div className='tcReviewGrid'>{items.map(item=><article className='tcReviewEntry' key={item.id}>
      <div className='tcReviewHead'><strong>{item.sourceId||'Fuente sin identificar'}</strong>
        <small>{item.status==='discarded'?'Descartado':item.status==='needs_evidence'?'Falta evidencia':
          item.status==='ready_for_final_check'?'Revisión final pendiente':'Pendiente'}</small>
      </div>
      <p>{item.territories.join(', ')||'Ubicación por verificar'} · Publicación: {item.publishedEvidence||'no acreditada'}</p>
      <a href={item.url} rel='noopener noreferrer' target='_blank'>Abrir fuente original</a>
      <div className='tcReviewActions'>
        <button type='button' disabled={busy} onClick={()=>void mark(item.id,'needs_evidence')}>Falta evidencia</button>
        <button type='button' disabled={busy} onClick={()=>void mark(item.id,'discarded')}>Descartar</button>
        <button type='button' disabled={busy} onClick={()=>void mark(item.id,'ready_for_final_check')}>Revisión final</button>
      </div>
    </article>)}</div>
  </section>;
}
