import {copyFileSync,existsSync,mkdirSync} from 'node:fs';
mkdirSync('qa-output/radar',{recursive:true});
for(const file of ['crawl.json','target-proof.json']){
 const source='qa-output/previous/qa-output/radar/'+file;
 if(existsSync(source))copyFileSync(source,'qa-output/radar/'+file);
}
