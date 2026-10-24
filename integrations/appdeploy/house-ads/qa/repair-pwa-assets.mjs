// Deterministic format/size repair from the existing valid icon; no new artwork.
import {readFileSync,writeFileSync} from 'node:fs';
import {inflateSync,deflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const source=readFileSync(new URL('../public/icon-192.png',import.meta.url));
if(source.readUInt32BE(16)!==192||source.readUInt32BE(20)!==192||source[24]!==8||source[25]!==6)throw Error('unexpected_source_icon');
const parts=[];
for(let offset=8;offset<source.length;){const n=source.readUInt32BE(offset);const type=source.toString('ascii',offset+4,offset+8);if(type==='IDAT')parts.push(source.subarray(offset+8,offset+8+n));offset+=n+12;}
const raw=inflateSync(Buffer.concat(parts));const pixels=Buffer.alloc(192*192*4);
const paeth=(a,b,c)=>{const p=a+b-c;const x=Math.abs(p-a),y=Math.abs(p-b),z=Math.abs(p-c);return x<=y&&x<=z?a:y<=z?b:c;};
for(let y=0;y<192;y++){const filter=raw[y*769];if(filter>4)throw Error('invalid_filter');for(let x=0;x<768;x++){const i=y*768+x;const a=x>=4?pixels[i-4]:0,b=y?pixels[i-768]:0,c=y&&x>=4?pixels[i-772]:0;const f=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];pixels[i]=(raw[y*769+x+1]+f)&255;}}
const crc=b=>{let c=0xffffffff;for(const v of b){c^=v;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
function chunk(type,body){const name=Buffer.from(type);const length=Buffer.alloc(4);length.writeUInt32BE(body.length);const checksum=Buffer.alloc(4);checksum.writeUInt32BE(crc(Buffer.concat([name,body])));return Buffer.concat([length,name,body,checksum]);}
function encode(maskable){const scan=Buffer.alloc(512*2049);const size=maskable?360:512;const pad=(512-size)/2;
 for(let y=0;y<512;y++)for(let x=0;x<512;x++){const out=y*2049+1+x*4;const inside=x>=pad&&y>=pad&&x<pad+size&&y<pad+size;const s=inside?(Math.floor((y-pad)*192/size)*192+Math.floor((x-pad)*192/size))*4:-1;
  if(maskable){const alpha=s<0?0:pixels[s+3]/255;scan[out]=Math.round((s<0?0:pixels[s])*alpha+6*(1-alpha));scan[out+1]=Math.round((s<0?0:pixels[s+1])*alpha+35*(1-alpha));scan[out+2]=Math.round((s<0?0:pixels[s+2])*alpha+28*(1-alpha));scan[out+3]=255;}
  else pixels.copy(scan,out,s,s+4);
 }
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(512,0);ihdr.writeUInt32BE(512,4);ihdr[8]=8;ihdr[9]=6;
 return Buffer.concat([source.subarray(0,8),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]);}
for(const [file,maskable] of [['icon-512.png',false],['icon-maskable-512.png',true]]){const data=encode(maskable);writeFileSync(new URL('../public/'+file,import.meta.url),data);console.log(file,data.length,createHash('sha256').update(data).digest('hex'));}
