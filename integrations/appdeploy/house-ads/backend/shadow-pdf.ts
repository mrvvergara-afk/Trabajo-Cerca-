import { db } from '@appdeploy/sdk';
import { createHash } from 'node:crypto';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { checkPublicRobots } from './public-robots';
import { publicPublisher, safePublicUrl } from './public-source-adapters';
import { freePublicSourceStatus, publicDocumentUrl } from './free-public-sources';
import { recordCandidate } from './radar-trace';
import { PRIMARY_PLACES } from '../shared/territories';

type Row=Record<string,unknown>;
const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const pdfId=(url:string)=>'pdf-'+createHash('sha256').update(url).digest('hex').slice(0,42);

export async function extractPublicPdf(address:string) {
  const clean=safePublicUrl(address);
  const url=clean?.startsWith('http:')&&publicPublisher(clean)?safePublicUrl('https:'+clean.slice(5)):clean;
  const publisher=url?publicPublisher(url):null;
  if (!url || !publisher || !url.startsWith('https:')) throw new Error('publisher_not_allowed');
  let current=url,response:Response|undefined;
  for (let hop=0;hop<4;hop++) {
    const policy=await checkPublicRobots(current);
    if (!policy.allowed) throw new Error(policy.error||'robots_disallowed');
    response=await fetch(current,{headers:{accept:'application/pdf','user-agent':'TrabajoCercaPublic/1.0'},redirect:'manual',signal:AbortSignal.timeout(12000)});
    if (![301,302,303,307,308].includes(response.status)) break;
    const next=safePublicUrl(response.headers.get('location')||'',current);
    await response.body?.cancel();
    if (!next || !next.startsWith('https:') || publicPublisher(next)?.group!==publisher.group) throw new Error('pdf_redirect_identity_unconfirmed');
    current=next;response=undefined;
  }
  if (!response) throw new Error('pdf_redirect_budget_exhausted');
  if (response.status!==200) {await response.body?.cancel();throw new Error('HTTP '+response.status);}
  if (!/application\/pdf|octet-stream/i.test(response.headers.get('content-type')||'')) {await response.body?.cancel();throw new Error('not_pdf');}
  const maxBytes=1500000;
  if (Number(response.headers.get('content-length')||0)>maxBytes) {await response.body?.cancel();throw new Error('pdf_byte_limit');}
  const reader=response.body?.getReader();
  if (!reader) throw new Error('pdf_stream_unavailable');
  const parts:Uint8Array[]=[];let size=0;
  for (;;) {
    const chunk=await reader.read();if (chunk.done) break;
    size+=chunk.value.byteLength;
    if (size>maxBytes) {await reader.cancel();throw new Error('pdf_byte_limit');}
    parts.push(chunk.value);
  }
  const bytes=new Uint8Array(size);let offset=0;
  for (const part of parts) {bytes.set(part,offset);offset+=part.length;}
  if (String.fromCharCode(...bytes.slice(0,5))!=='%PDF-') throw new Error('invalid_pdf_header');
  const sha256=createHash('sha256').update(bytes).digest('hex');
  const task=getDocument({data:bytes,useSystemFonts:false,disableFontFace:true,isEvalSupported:false});
  const document=await task.promise;
  let text='',pagesRead=0;const ocrPages:number[]=[];
  const pageCount=document.numPages;
  try {
    for (let number=1;number<=Math.min(pageCount,12);number++) {
      const page=await document.getPage(number),content=await page.getTextContent();
      const value=content.items.map(x=>'str' in x?String(x.str):'').join(' ');
      if (value.trim().length<40) ocrPages.push(number);
      if (text.length+value.length>32000) break;
      text+='\n'+value;pagesRead++;
    }
  } finally {await document.destroy();}
  const complete=pagesRead===pageCount && ocrPages.length===0;
  const workCommunes=PRIMARY_PLACES.filter(t=>new RegExp('(?:^|[^a-z])'+fold(t)+'(?:$|[^a-z])').test(fold(text)));
  const jobTitles=[...new Set([...text.matchAll(/(?:cargo|puesto|vacante)\s*[:\-]\s*([^.;\n]{6,100})/gi)].map(m=>m[1].trim()))].slice(0,20);
  const hiring=/concurso p[uú]blico|llamado a concurso|se requiere|oferta laboral|convocatoria laboral|se busca|vacante/i.test(text);
  const closed=/postulaciones cerradas|concurso finalizado|proceso cerrado/i.test(text);
  const reason=closed?'explicit_closure':ocrPages.length?'ocr_required':!complete?'partial_pdf_read':hiring&&jobTitles.length?'pdf_job_evidence_requires_verification':'not_a_confirmed_job_document';
  return {url,originalUrl:address,finalUrl:current,sha256,pageCount,pagesRead,complete,ocrPages,textLength:text.length,textExcerpt:text.slice(0,1200),
    jobTitles,workCommunes,reason,stage:closed?'closed':ocrPages.length||!complete?'recoverable':'needs_review',
    // Location mentions and extracted titles are evidence for review, not verified work sites.
    publicEligible:false};
}

export async function shadowPdfBatch() {
  const status=await freePublicSourceStatus();
  const [workCursor]=await db.get<Row>('radar_shadow_pdf_work_cursor',['current'],{consistent:true});
  const token=typeof workCursor?.nextToken==='string'?workCursor.nextToken:undefined;
  const ledger=await db.list<Row>('radar_candidate_trace',{limit:20,...(token?{nextToken:token}:{})});
  const recovered=ledger.items.filter(x=>typeof x.url==='string'&&publicDocumentUrl(x.url)&&!/\.(?:png|jpe?g|webp)(?:[?#]|$)/i.test(x.url)).map(x=>({
    url:String(x.url),source:String(x.source),publisher_page:String(x.publisherPage||x.url),kind:'document'}));
  const docs=[...new Map([...status.documentWork.items,...recovered]
    .filter(x=>x.kind==='document'&&!/\.(?:png|jpe?g|webp)(?:[?#]|$)/i.test(x.url)).map(x=>[x.url,x])).values()]
    .sort((a,b)=>a.url.localeCompare(b.url));
  const [cursor]=await db.get<Row>('radar_shadow_pdf_cursor',['current'],{consistent:true});
  const last=String(cursor?.lastUrl||'');
  const after=docs.filter(x=>x.url>last),selected=(after.length?after:docs).slice(0,3);
  const outcomes:Row[]=[];
  for (const source of selected) {
    const clean=safePublicUrl(source.url);
    const url=clean?.startsWith('http:')&&publicPublisher(clean)?safePublicUrl('https:'+clean.slice(5)):clean;
    if (!url) continue;
    const id=pdfId(url),[old]=await db.get<Row>('radar_shadow_pdf',[id],{consistent:true});
    if (Date.parse(String(old?.nextAttemptAt||''))>Date.now()) continue;
    let item:Row={id,url,source:source.source,publisherPage:source.publisher_page,
      scannedAt:new Date().toISOString(),attempts:Number(old?.attempts||0)+1,publicEligible:false};
    try {item={...item,...await extractPublicPdf(source.url)};}
    catch (e) {item={...item,stage:'blocked',reason:e instanceof Error?e.message.slice(0,160):'pdf_read_failed'};}
    item.nextAttemptAt=new Date(Date.now()+(item.stage==='blocked'?6:24)*3600000).toISOString();
    const [ok]=old?await db.tx.update('radar_shadow_pdf',[{id,record:item}]):await db.tx.add('radar_shadow_pdf',[item]);
    if (!ok) throw new Error('PDF evidence write failed; cursor retained');
    await recordCandidate(url,{source:source.source,documentId:id,reading:item.reason==='ocr_required'?'ocr_required':item.complete?'complete':'partial',
      state:item.stage==='blocked'?'inaccessible':item.stage==='closed'?'rejected':item.stage==='recoverable'?'recoverable':'review',
      reason:item.reason,documentSha256:item.sha256||null,pagesRead:item.pagesRead||0,pageCount:item.pageCount||0,nextAttemptAt:item.nextAttemptAt});
    outcomes.push({url,stage:item.stage,reason:item.reason,pagesRead:item.pagesRead,pageCount:item.pageCount});
  }
  const checkpoint={lastUrl:selected.at(-1)?.url||'',updatedAt:new Date().toISOString(),cycleComplete:!selected.length||selected.at(-1)?.url===docs.at(-1)?.url};
  const [ok]=cursor?await db.tx.update('radar_shadow_pdf_cursor',[{id:'current',record:checkpoint}]):await db.tx.add('radar_shadow_pdf_cursor',[{id:'current',...checkpoint}]);
  if (!ok) throw new Error('PDF cursor write failed');
  const workCheckpoint={nextToken:ledger.nextToken||null,updatedAt:new Date().toISOString()};
  const [workOk]=workCursor
    ?await db.tx.update('radar_shadow_pdf_work_cursor',[{id:'current',record:workCheckpoint}])
    :await db.tx.add('radar_shadow_pdf_work_cursor',[{id:'current',...workCheckpoint}]);
  if (!workOk) throw new Error('PDF recovery cursor write failed');
  return {totalDocuments:docs.length,processed:outcomes.length,outcomes};
}
