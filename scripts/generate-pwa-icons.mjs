import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Resvg} from '@resvg/resvg-js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const svg=readFileSync(resolve(root,'public/brand/trabajo-cerca-app-icon.svg'),'utf8');
if(!svg.includes('rx="242"'))throw Error('Trabajo Cerca rounded icon not found');
const interior=svg.replace(/^<svg[^>]*>/,'').replace(/<\/svg>\s*$/,'');
const maskable='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#062c23"/><g transform="translate(168 168) scale(.671875)">'+interior+'</g></svg>';
for(const [filename,size,art] of [
 ['icon-192.png',192,svg],['icon-512.png',512,svg],
 ['icon-maskable-512.png',512,maskable]
]){
 const png=new Resvg(art,{fitTo:{mode:'width',value:size}}).render().asPng();
 if(png.length<2500||!Buffer.from(png).subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Invalid icon '+filename);
 writeFileSync(resolve(root,'public',filename),png);
 console.log('TC_ICON_OK',filename,size,png.length);
}