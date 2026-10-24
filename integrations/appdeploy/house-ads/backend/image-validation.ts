// Bounded raster inspection; uploads never accept SVG/HTML or remote URLs.
// Client decoding/re-encoding strips EXIF and scales; server independently bounds bytes/dimensions.
export function inspectCreative(content:string,mime:string) {
 if(typeof content!=='string'||content.length>280000)throw Error('Imagen demasiado grande.');
 const b=Buffer.from(content,'base64');if(b.length<24||b.length>200000||b.toString('base64')!==content)throw Error('Archivo inválido o superior a 200 KB.');
 let width=0,height=0;
 if(mime==='image/png'){
  if(!b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('PNG inválido.');
  let pos=8,ended=false,header=false,data=false;
  while(pos+12<=b.length){const n=b.readUInt32BE(pos),type=b.toString('ascii',pos+4,pos+8);if(pos+12+n>b.length)throw Error('PNG truncado.');
   if(type==='IHDR'){if(header||pos!==8||n!==13)throw Error('Cabecera PNG inválida.');header=true;width=b.readUInt32BE(pos+8);height=b.readUInt32BE(pos+12);}
   if(type==='acTL')throw Error('Usa una imagen estática.');if(type==='IDAT')data=true;
   pos+=12+n;if(type==='IEND'){if(n!==0||pos!==b.length)throw Error('PNG inválido.');ended=true;break;}}
  if(!ended||!header||!data)throw Error('PNG incompleto.');
 }else if(mime==='image/jpeg'){
  if(b[0]!==255||b[1]!==216||b[b.length-2]!==255||b[b.length-1]!==217)throw Error('JPEG inválido.');
  let pos=2;while(pos+4<b.length){if(b[pos++]!==255)throw Error('JPEG inválido.');while(b[pos]===255)pos++;const marker=b[pos++];if(marker===0xda)break;const length=b.readUInt16BE(pos);if(length<2||pos+length>b.length)throw Error('JPEG truncado.');if([0xc0,0xc1,0xc2].includes(marker)){if(length<8)throw Error('JPEG inválido.');height=b.readUInt16BE(pos+3);width=b.readUInt16BE(pos+5);}pos+=length;}
 }else if(mime==='image/webp'){
  if(b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WEBP'||b.readUInt32LE(4)+8!==b.length)throw Error('WebP inválido.');
  let pos=12;while(pos+8<=b.length){const type=b.toString('ascii',pos,pos+4),size=b.readUInt32LE(pos+4),start=pos+8;if(start+size>b.length)throw Error('WebP truncado.');
   if(type==='ANIM'||type==='ANMF')throw Error('Usa una imagen estática.');
   if(type==='VP8X'&&size>=10){if(b[start]&2)throw Error('WebP animado no admitido.');width=1+b.readUIntLE(start+4,3);height=1+b.readUIntLE(start+7,3);}
   else if(type==='VP8 '&&size>=10){if(b[start+3]!==0x9d||b[start+4]!==1||b[start+5]!==0x2a)throw Error('WebP inválido.');width=b.readUInt16LE(start+6)&0x3fff;height=b.readUInt16LE(start+8)&0x3fff;}
   else if(type==='VP8L'&&size>=5){if(b[start]!==0x2f)throw Error('WebP inválido.');const bits=b.readUInt32LE(start+1);width=(bits&0x3fff)+1;height=((bits>>>14)&0x3fff)+1;}
   pos=start+size+(size%2);
  }
 }else throw Error('Usa PNG, JPEG o WebP.');
 if(!width||!height||width>1600||height>1600||width*height>2000000)throw Error('Dimensiones inválidas: máximo 1600 px y 2 megapíxeles.');
 return {width,height,bytes:b.length,mime};
}
