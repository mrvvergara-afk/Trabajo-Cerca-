import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const m=JSON.parse(read('public/manifest.webmanifest'));
assert.equal(m.id,'./');assert.equal(m.start_url,'./');assert.equal(m.scope,'./');assert.equal(m.share_target.action,'./share-target');
const html=read('index.html'),sw=read('public/sw.js');
for(const icon of m.icons){assert.ok(icon.src.includes('tc-brand-20261126-v6'));assert.ok(sw.includes(icon.src));if(icon.type==='image/png'){const png=readFileSync(new URL('../public/'+icon.src.slice(2),import.meta.url));const size=Number(icon.sizes.split('x')[0]);assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);}}
assert.ok(html.includes('src="./brand/tc-brand-20261126-v6.svg"'));assert.ok(html.includes('manifest.webmanifest?v=tc-brand-20261126-v6'));assert.ok(!html.includes('rounded-20261121'));
assert.ok(493*.75<1024*.4);console.log('PWA brand contract OK');
