import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {imageSize} from 'image-size';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import {createWorker,type Worker} from 'tesseract.js';

Object.assign(globalThis,{pdfjsWorker});
export type BDocument={kind:'pdf'|'image';url:string;sha256:string;text:string;method:string;status:'extracted'|'needs_ocr'|'failed';reason?:string};
const MAX_BYTES=6_000_000;
const MAX_IMAGE_PIXELS=12_000_000;
const MAX_RASTER_PIXELS=2_000_000;

async function ocr(images:Buffer[]):Promise<string>{
 const require=createRequire(import.meta.url);
 const langPath=join(dirname(require.resolve('@tesseract.js-data/spa/package.json')),'4.0.0_best_int');
 let timer:ReturnType<typeof setTimeout>|undefined, worker:Worker|undefined, timedOut=false;
 const timeout=new Promise<never>((_,reject)=>{
  timer=setTimeout(()=>{timedOut=true;reject(Error('ocr_timeout'));},22_000);
 });
 const reading=(async()=>{
  const current=await createWorker('spa',1,{langPath,cacheMethod:'none'});
  worker=current;
  if(timedOut){await current.terminate();throw Error('ocr_timeout');}
  const text:string[]=[];
  for(const image of images){
   if(timedOut)throw Error('ocr_timeout');
   text.push((await current.recognize(image)).data.text);
  }
  return text.join('\n').slice(0,20_000).trim();
 })();
 try{return await Promise.race([reading,timeout]);}
 finally{clearTimeout(timer);if(worker)await worker.terminate();}
}

async function pdfText(bytes:Uint8Array,allowOcr:boolean){
 const task=getDocument({data:Uint8Array.from(bytes),useSystemFonts:true,disableFontFace:true,
  isEvalSupported:false,maxImageSize:MAX_IMAGE_PIXELS});
 try{
  const doc=await task.promise;
  const parts:string[]=[];
  for(let n=1;n<=Math.min(doc.numPages,6);n++){
   const page=await doc.getPage(n),content=await page.getTextContent();
   parts.push(content.items.map(item=>'str' in item?String(item.str):'').join(' '));
  }
  const text=parts.join('\n').slice(0,30_000).trim();
  if(text.length>=26 || !allowOcr)return {text,method:'pdfjs_local'};
  const images:Buffer[]=[];
  for(let n=1;n<=Math.min(doc.numPages,2);n++){
   const page=await doc.getPage(n),base=page.getViewport({scale:1});
   const scale=Math.min(1.6,Math.sqrt((MAX_RASTER_PIXELS-6000)/(base.width*base.height)));
   const viewport=page.getViewport({scale});
   const width=Math.ceil(viewport.width),height=Math.ceil(viewport.height);
   if(width<1||height<1||width>4096||height>4096||width*height>MAX_RASTER_PIXELS)throw Error('pdf_raster_limit');
   const canvas=createCanvas(width,height);
   const canvasContext=canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
   await page.render({canvasContext,viewport}).promise;
   images.push(canvas.toBuffer('image/png'));
  }
  return {text:await ocr(images),method:'pdfjs_tesseract_local_spa'};
 }finally{await task.destroy();}
}

export async function extractBDocument(url:string,bytes:Uint8Array,mime:string,allowOcr=true):Promise<BDocument>{
 const pdf=Buffer.from(bytes.subarray(0,5)).toString('ascii')==='%PDF-';
 const kind=pdf?'pdf':'image';
 const base={kind,url,sha256:createHash('sha256').update(bytes).digest('hex')} as const;
 if(bytes.byteLength>MAX_BYTES)return {...base,text:'',method:'none',status:'failed',reason:'document_byte_limit'};
 try{
  let result:{text:string;method:string};
  if(pdf){
   if(!/^application\/(?:pdf|octet-stream)$/.test(mime))throw Error('pdf_mime_mismatch');
   result=await pdfText(bytes,allowOcr);
  }else{
   const dim=imageSize(bytes);
   const kindToMime:Record<string,string>={png:'image/png',jpg:'image/jpeg',webp:'image/webp'};
   if(!dim.type || kindToMime[dim.type]!==mime)throw Error('document_mime_mismatch');
   if(!dim.width || !dim.height || dim.width*dim.height>MAX_IMAGE_PIXELS)throw Error('image_pixel_limit');
   if(!allowOcr)return {...base,text:'',method:'none',status:'needs_ocr',reason:'ocr_budget_deferred'};
   const image=await loadImage(Buffer.from(bytes));
   const scale=Math.min(1,Math.sqrt((MAX_RASTER_PIXELS-6000)/(dim.width*dim.height)));
   const canvas=createCanvas(Math.max(1,Math.floor(dim.width*scale)),Math.max(1,Math.floor(dim.height*scale)));
   canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
   result={text:await ocr([canvas.toBuffer('image/png')]),method:'tesseract_local_spa'};
  }
  return {...base,...result,status:result.text.length>=26?'extracted':'needs_ocr',
   ...(result.text.length<26?{reason:'document_no_legible_text'}:{})};
 }catch(error){return {...base,text:'',method:'bounded_document_reader',status:'failed',
  reason:error instanceof Error?error.message.slice(0,120):'document_read_failed'};}
}
