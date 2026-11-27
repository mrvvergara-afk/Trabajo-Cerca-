import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import Core from 'tesseract.js-core/tesseract-core-lstm.wasm.js';
import {compressedSpanishModel,modelSha256} from './ocr-spa-model';

// The WASM and signed-by-hash data are bundled with the backend. This path needs
// neither native Canvas, a worker filesystem path nor a network fetch.
export async function readPackagedSpanish(images:Buffer[]):Promise<string>{
 const compressed=Buffer.from(compressedSpanishModel,'base64');
 if(createHash('sha256').update(compressed).digest('hex')!==modelSha256)throw Error('ocr_model_integrity');
 const language=gunzipSync(compressed,{maxOutputLength:12_000_000});
 const engine=await Core({TesseractProgress:()=>{}});
 const api=new engine.TessBaseAPI();
 try{
  engine.FS.writeFile('/spa.traineddata',language);
  if(api.Init('/','spa',1,undefined)!==0)throw Error('ocr_engine_initialization');
  const chunks:string[]=[];
  for(const image of images.slice(0,2)){
   engine.FS.writeFile('/input',image);
   if(api.SetImageFile(1,0)!==0)throw Error('ocr_image_decode');
   if(api.Recognize(null)!==0)throw Error('ocr_recognition_failed');
   chunks.push(String(api.GetUTF8Text()));
  }
  return chunks.join('\n').slice(0,20_000).trim();
 }finally{api.End();}
}
