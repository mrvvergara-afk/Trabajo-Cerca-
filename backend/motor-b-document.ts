import {createHash} from 'node:crypto';
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
(globalThis as any).pdfjsWorker = pdfjsWorker;
export type BDocument={kind:'pdf'|'image';url:string;sha256:string;text:string;method:string;status:'extracted'|'needs_ocr'|'failed';reason?:string};
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export async function extractBDocument(url:string,bytes:Uint8Array,mime:string):Promise<BDocument>{
 const kind=mime.includes('pdf')||/\.pdf(?:\?|$)/i.test(url)?'pdf':'image';
 const base={kind,url,sha256:sha(bytes)} as const;
 if(kind==='pdf'){
  try{
   const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
   const pdf=await pdfjs.getDocument({data:bytes,useSystemFonts:true,disableFontFace:true,isEvalSupported:false}).promise;
   const parts:string[]=[];
   for(let n=1;n<=Math.min(pdf.numPages,12);n++){
    const page=await pdf.getPage(n),content=await page.getTextContent();
    parts.push(content.items.map((item)=>'str' in item?String(item.str):'').join(' '));
   }
   const text=parts.join('\n').slice(0,30000).trim();
   return {...base,text,method:'pdfjs_local',status:text.length>25?'extracted':'needs_ocr',reason:text.length>25?undefined:'pdf_scanned_or_no_text'};
  }catch(e){return {...base,text:'',method:'pdfjs_local',status:'failed',reason:String(e).slice(0,170)};}
 }
 try{
  const tesseract=await import('tesseract.js');
  const worker=await tesseract.createWorker('spa',1,{cacheMethod:'none'});
  try{
   const out=await worker.recognize(Buffer.from(bytes));
   const text=out.data.text.trim().slice(0,20000);
   return {...base,text,method:'tesseract_local_spa',status:text.length>25?'extracted':'needs_ocr',reason:text.length>25?undefined:'image_no_legible_text'};
  }finally{await worker.terminate();}
 }catch(e){return {...base,text:'',method:'tesseract_local_spa',status:'needs_ocr',reason:'local_ocr_unavailable: '+String(e).slice(0,120)};}
}
