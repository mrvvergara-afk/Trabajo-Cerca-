import {db} from '@appdeploy/sdk';
import {createHash} from 'node:crypto';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
(globalThis as any).pdfjsWorker = pdfjsWorker;
import {checkPublicRobots} from './public-robots';
import {publicPublisher,safePublicUrl} from './public-source-adapters';
import {freePublicSourceStatus} from './free-public-sources';

type Row=Record<string,unknown>;
const fold=(v:string)=>v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const locales=['Angol','Collipulli','Ercilla','Renaico','Mininco','Nacimiento','Negrete','Mulchén','Los Sauces','Purén','Traiguén','Lumaco','Victoria'];
export async function shadowPdfBatch() {
  const status=await freePublicSourceStatus();
  const [done]=await db.get<{resolved?:Record<string,unknown>}>('fast_bc_state_v2',['current'],{consistent:true});
  const resolved=(done?.resolved || {}) as Record<string,{reason?:string}>;
  // Retry once only the documents blocked by the former 1.5MB cap.
  const docs=status.documentWork.items.filter(x=>x.kind==='document' && (/\.pdf(?:[?#]|$)/i.test(x.url) || /\/index\.php\/component\/phocadownload\/category\/1-concursos(?:\?|$)/i.test(x.url)) && (!resolved[x.url] || resolved[x.url]?.reason==='pdf_byte_limit'));
  // Unresolved documents outside this PDF reader must remain visible as work.
  const pendingOtherDocumentInputs=status.documentWork.items.filter(x=>x.kind==='document' && !resolved[x.url] && !docs.some(d=>d.url===x.url)).length;
  const cursor=(await db.list<Row>('fast_bc_pdf_cursor_v1',{limit:1})).items[0];
  const retries=docs.filter(item=>resolved[item.url]?.reason==='pdf_byte_limit');
  const fresh=docs.filter(item=>!resolved[item.url]);
  const start=Number(cursor?.position||0)%Math.max(1,fresh.length);
  const selected=[...retries.slice(0,4),...fresh.slice(start).concat(fresh.slice(0,start)).slice(0,Math.max(0,4-retries.length))].slice(0,4);
  const newlySelected=selected.filter(item=>!resolved[item.url]).length;
  const outcomes:Row[]=[];
  await Promise.all(selected.map(async source => {
    const url=safePublicUrl(source.url);
    if(!url || !publicPublisher(url) || !url.startsWith('https:'))return;
    const id='pdf-'+createHash('sha256').update(url).digest('hex').slice(0,42);
    let item:Row={id,url,source:source.source,publisherPage:source.publisher_page,scannedAt:new Date().toISOString(),stage:'blocked',reason:'unreadable'};
    try{
      const policy=await checkPublicRobots(url);
      if(!policy.allowed){item.reason=policy.error||'robots_disallowed';}
      else {
        const response=await fetch(url,{headers:{accept:'application/pdf','user-agent':'TrabajoCercaPublic/1.0'},redirect:'manual',signal:AbortSignal.timeout(12000)});
        if(response.status!==200) item.reason='HTTP '+response.status;
        else if(!/application\/pdf|octet-stream/i.test(response.headers.get('content-type')||''))item.reason='not_pdf';
        else {
          const reader=response.body?.getReader();
          if(!reader)throw Error('document_body_missing');
          const chunks:Uint8Array[]=[];let size=0;
          try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>6000000)throw Error('pdf_byte_limit_6mb');chunks.push(part.value);}}
          finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
          const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
          if(bytes.byteLength>6000000)item.reason='pdf_byte_limit_6mb';
          else if(String.fromCharCode(...bytes.slice(0,5))!=='%PDF-')item.reason='invalid_pdf_header';
          else {
            const task=getDocument({data:bytes,useSystemFonts:false,disableFontFace:true,isEvalSupported:false});
            const document=await task.promise;
            const pages=Math.min(document.numPages,6);
            let text='';
            for(let pageNo=1;pageNo<=pages;pageNo++){
              const page=await document.getPage(pageNo);
              const extracted=await page.getTextContent();
              text+=' '+extracted.items.map(x=>('str' in x?String(x.str):'')).join(' ');
              if(text.length>16000)break;
            }
            await document.destroy();
            const work=locales.filter(place=>fold(text).includes(fold(place)));
            const hiring=/concurso p[uú]blico|llamado a concurso|se requiere|oferta laboral|convocatoria laboral|se busca|vacante/i.test(text);
            const closed=/postulaciones cerradas|concurso finalizado|proceso cerrado/i.test(text);
            const jobs=[...new Set([...text.matchAll(/(?:cargo|puesto|vacante)\s*[:\-]\s*([^.;\n]{6,100})/gi)].slice(0,8).map(x=>x[1].trim()))];
            item={...item,stage:closed?'closed':hiring&&jobs.length>0?'recoverable':'needs_review',
              reason:closed?'explicit_closure':hiring?'pdf_text_extracted':'no_job_text_evidence',
              pageCount:document.numPages,textLength:text.length,workCommunes:work,jobTitles:jobs,
              sha256:createHash('sha256').update(bytes).digest('hex'),textExcerpt:text.slice(0,550),publicEligible:false};
          }
        }
      }
    }catch(error){item.reason=error instanceof Error?error.message.slice(0,140):'pdf_read_failed';}
    const [old]=await db.get<Row>('fast_bc_documents_v1',[id],{consistent:true});
    if(old){const [ok]=await db.update('fast_bc_documents_v1',[{id,record:item}]);if(!ok)throw Error('fast_bc_document_update_failed');}
    else{const [created]=await db.tx.add('fast_bc_documents_v1',[item]);if(!created)throw Error('fast_bc_document_create_failed');}
    outcomes.push({url,stage:item.stage,reason:item.reason,jobTitles:item.jobTitles,workCommunes:item.workCommunes});
  }));
  const next={position:(start+newlySelected)%Math.max(1,fresh.length),updatedAt:new Date().toISOString()};
  if(cursor)await db.update('fast_bc_pdf_cursor_v1',[{id:cursor.id,record:next}]);
  else await db.add('fast_bc_pdf_cursor_v1',[next]);
  console.warn('SHADOW_PDF_READER '+JSON.stringify({totalDocuments:docs.length,processed:outcomes.length,outcomes}).slice(0,12000));
  return {pendingOtherDocumentInputs,totalDocuments:docs.length,processed:outcomes.length,outcomes,rawDocumentInputs:status.documentWork.items.filter(x=>x.kind==='document').length,eligibleDocumentInputs:docs.length,imageInputs:status.documentWork.items.filter(x=>x.kind==='document'&&/\.(?:png|jpe?g|webp)(?:[?#]|$)/i.test(x.url)).length};
}
