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
  const docs=status.documentWork.items.filter(x=>x.kind==='document' && /\.pdf(?:[?#]|$)/i.test(x.url));
  const cursor=(await db.list<Row>('radar_shadow_pdf_cursor',{limit:1})).items[0];
  const start=Number(cursor?.position||0)%Math.max(1,docs.length);
  const selected=docs.slice(start).concat(docs.slice(0,start)).slice(0,3);
  const outcomes:Row[]=[];
  for(const source of selected) {
    const url=safePublicUrl(source.url);
    if(!url || !publicPublisher(url) || !url.startsWith('https:'))continue;
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
          const bytes=new Uint8Array(await response.arrayBuffer());
          if(bytes.byteLength>1500000)item.reason='pdf_byte_limit';
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
    const [old]=await db.get<Row>('radar_shadow_pdf',[id],{consistent:true});
    if(old)await db.update('radar_shadow_pdf',[{id,record:item}]);
    else await db.add('radar_shadow_pdf',[item]);
    outcomes.push({url,stage:item.stage,reason:item.reason,jobTitles:item.jobTitles,workCommunes:item.workCommunes});
  }
  const next={position:(start+selected.length)%Math.max(1,docs.length),updatedAt:new Date().toISOString()};
  if(cursor)await db.update('radar_shadow_pdf_cursor',[{id:cursor.id,record:next}]);
  else await db.add('radar_shadow_pdf_cursor',[next]);
  console.warn('SHADOW_PDF_READER '+JSON.stringify({totalDocuments:docs.length,processed:outcomes.length,outcomes}).slice(0,12000));
  return {totalDocuments:docs.length,processed:outcomes.length,outcomes};
}
