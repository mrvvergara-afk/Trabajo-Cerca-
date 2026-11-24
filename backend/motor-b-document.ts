import {createHash} from 'node:crypto';
import {PNG} from 'pngjs';
import {imageSize} from 'image-size';
import {getDocument,OPS} from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import {readPackagedSpanish} from './packaged-ocr';

Object.assign(globalThis,{pdfjsWorker});
export type BDocument={kind:'pdf'|'image';url:string;sha256:string;text:string;method:string;status:'extracted'|'needs_ocr'|'failed';reason?:string};
const MAX_BYTES=6_000_000;
const MAX_IMAGE_PIXELS=12_000_000;
const MAX_RASTER_PIXELS=2_000_000;

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
   const page=await doc.getPage(n);
   const ops=await page.getOperatorList();
   const index=ops.fnArray.indexOf(OPS.paintImageXObject);
   if(index<0)continue;
   const ref=String(ops.argsArray[index][0]);
   const pool=ref.startsWith('g_')?page.commonObjs:page.objs;
   const image=await new Promise<{width:number;height:number;kind:number;data:Uint8Array}|null>(resolve=>{
    pool.get(ref,result=>resolve(result));
   });
   if(!image?.data || !image.width || !image.height || image.width*image.height>MAX_RASTER_PIXELS)continue;
   const {width,height,kind,data}=image;
   const png=new PNG({width,height});
   for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const index=y*width+x,i=index*4;
    if(kind===1){
     const byte=data[y*Math.ceil(width/8)+Math.floor(x/8)];
     const shade=(byte & (128>>(x%8)))?255:0;
     png.data.fill(shade,i,i+3);png.data[i+3]=255;
    }else if(kind===2||kind===3){
     const step=kind===2?3:4;
     png.data[i]=data[index*step];png.data[i+1]=data[index*step+1];png.data[i+2]=data[index*step+2];
     png.data[i+3]=step===4?data[index*step+3]:255;
    }
   }
   if([1,2,3].includes(kind))images.push(PNG.sync.write(png));
  }
  return {text:images.length?await readPackagedSpanish(images):'',method:'pdfjs_tesseract_local_spa'};
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
   if(dim.width*dim.height>MAX_RASTER_PIXELS)throw Error('image_ocr_pixel_limit');
   result={text:await readPackagedSpanish([Buffer.from(bytes)]),method:'tesseract_local_spa'};
  }
  return {...base,...result,status:result.text.length>=26?'extracted':'needs_ocr',
   ...(result.text.length<26?{reason:'document_no_legible_text'}:{})};
 }catch(error){return {...base,text:'',method:'bounded_document_reader',status:'failed',
  reason:error instanceof Error?error.message.slice(0,120):'document_read_failed'};}
}
