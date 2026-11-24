import assert from 'node:assert/strict';
import {test} from 'node:test';
import {deflateSync} from 'node:zlib';
import {createCanvas} from '@napi-rs/canvas';
import {registerHooks} from 'node:module';
const hook=registerHooks({resolve(specifier,context,next){
 if(context.parentURL?.endsWith('.ts') && specifier.startsWith('.') && !specifier.endsWith('.ts'))return next(specifier+'.ts',context);
 return next(specifier,context);
}});
const {extractBDocument}=await import('../backend/motor-b-document.ts');
test.after(()=>hook.deregister());

function flyer(){
 const canvas=createCanvas(950,250),ctx=canvas.getContext('2d');
 ctx.fillStyle='white';ctx.fillRect(0,0,950,250);ctx.fillStyle='black';ctx.font='38px sans-serif';
 ctx.fillText('OFERTA LABORAL: TECNICO',35,85);
 ctx.fillText('LUGAR DE TRABAJO: ANGOL',35,155);
 return canvas;
}
function imagePdf(canvas){
 const {width,height}=canvas, pixels=canvas.getContext('2d').getImageData(0,0,width,height).data;
 const rgb=Buffer.alloc(width*height*3);
 for(let i=0,j=0;i<pixels.length;i+=4){rgb[j++]=pixels[i];rgb[j++]=pixels[i+1];rgb[j++]=pixels[i+2];}
 const compressed=deflateSync(rgb);
 const picture=Buffer.concat([
  Buffer.from('<< /Type /XObject /Subtype /Image /Width '+width+' /Height '+height+
   ' /BitsPerComponent 8 /ColorSpace /DeviceRGB /Filter /FlateDecode /Length '+compressed.length+' >>\nstream\n'),
  compressed,Buffer.from('\nendstream')
 ]);
 const paint='q 475 0 0 125 0 0 cm /Im0 Do Q';
 const objects=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 475 125] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>',
  '<< /Length '+paint.length+' >>\nstream\n'+paint+'\nendstream',
  picture
 ];
 const buffers=[Buffer.from('%PDF-1.4\n')],offsets=[];
 for(let i=0,size=buffers[0].length;i<objects.length;i++){
  offsets.push(size);
  const frame=Buffer.concat([Buffer.from((i+1)+' 0 obj\n'),Buffer.from(objects[i]),Buffer.from('\nendobj\n')]);
  buffers.push(frame);size+=frame.length;
 }
 const index=buffers.reduce((sum,b)=>sum+b.length,0);
 const xref='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'+
  offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+
  'trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+index+'\n%%EOF\n';
 return Buffer.concat([...buffers,Buffer.from(xref)]);
}

test('actual Spanish OCR reads an image and image-only PDF using packaged language data',async()=>{
 const image=flyer();
 const png=await extractBDocument('https://fixture.invalid/aviso.png',image.toBuffer('image/png'),'image/png');
 assert.equal(png.method,'tesseract_local_spa');
 assert.equal(png.status,'extracted');
 assert.match(png.text,/TRABAJO: ANGOL/);
 const pdf=await extractBDocument('https://fixture.invalid/aviso.pdf',imagePdf(image),'application/pdf');
 assert.equal(pdf.method,'pdfjs_tesseract_local_spa');
 assert.equal(pdf.status,'extracted');
 assert.match(pdf.text,/TRABAJO: ANGOL/);
});

test('mismatched media and excess bytes stop before OCR',async()=>{
 const mismatch=await extractBDocument('https://fixture.invalid/aviso.jpg',flyer().toBuffer('image/png'),'image/jpeg');
 assert.equal(mismatch.reason,'document_mime_mismatch');
 const oversized=await extractBDocument('https://fixture.invalid/aviso.pdf',Buffer.alloc(6_000_001),'application/pdf');
 assert.equal(oversized.reason,'document_byte_limit');
});
