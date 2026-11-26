import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Resvg} from '@resvg/resvg-js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const pub=resolve(root,'public');
const official=readFileSync(resolve(pub,'brand/trabajo-cerca-oficial.svg'),'utf8');
const expected=official.replace(/<text\b[^>]*>Trabajo Cerca<\/text>/,'').replace(/<path d="M309 904[^>]*\/>/,'');
const normal=readFileSync(resolve(pub,'brand/tc-brand-20261126-v6.svg'),'utf8');
if(normal.trim()!==expected.trim())throw Error('Icon must derive from canonical logo');
const mask=readFileSync(resolve(pub,'brand/tc-brand-20261126-v6-maskable.svg'),'utf8');
for(const [filename,size,art] of [['tc-brand-20261126-v6-192.png',192,normal],['tc-brand-20261126-v6-512.png',512,normal],['tc-brand-20261126-v6-maskable-512.png',512,mask],['icon-192.png',192,normal],['icon-512.png',512,normal],['icon-maskable-512.png',512,mask]]){
 const png=Buffer.from(new Resvg(art,{fitTo:{mode:'width',value:size}}).render().asPng());
 if(!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||png.readUInt32BE(16)!==size||png.readUInt32BE(20)!==size)throw Error('Invalid icon '+filename);
 writeFileSync(resolve(pub,filename),png);console.log('TC_ICON_OK',filename,size,png.length);
}
