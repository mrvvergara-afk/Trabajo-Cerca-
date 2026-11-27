import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';

const source=await readFile(new URL('./free-public-sources.ts',import.meta.url),'utf8');
const policy=source.slice(source.indexOf('export function publicDocumentUrl'),source.indexOf('export function publicPageLinks'));
const handoff=source.slice(source.indexOf('export function publicDocumentWork'),source.indexOf('export function pendingCandidateIndex'));
const code=stripTypeScriptTypes((policy+handoff).replaceAll('export ',''));
const work=new Function('safePublicUrl','publicSourceAdapter','publicPublisher',code+'\nreturn publicDocumentWork;')(
 value=>value||null,
 ()=>({family:'local'}),
 value=>({group:new URL(value).hostname})
);
const host='https://munimulchen.cl';
function document(path){return {url:host+path,source:'Municipalidad',publisherPage:host+'/omil'};}

test('a theme asset is excluded while a WordPress flyer remains available for B',()=>{
 const asset=document('/wp-content/themes/mulchen/imagenes/redes-sociales/facebook.png');
 const flyer=document('/wp-content/uploads/convocatoria.png');
 const result=work({documentPending:[asset,flyer],pending:[]},true);
 assert.equal(result.rawDocumentInputs,2);
 assert.equal(result.excludedDocumentInputs,1);
 assert.deepEqual(result.items.map(row=>row.url),[flyer.url]);
});

test('B receives all unique admitted document URLs beyond the public export limit',()=>{
 const items=Array.from({length:110},(_,index)=>document('/adjunto-'+index+'.pdf'));
 const checkpoint={documentPending:items,pending:[items[30]]};
 assert.equal(work(checkpoint).items.length,100);
 assert.equal(work(checkpoint,true).items.length,110);
 assert.equal(work(null,true).eligibleDocuments,null);
});
