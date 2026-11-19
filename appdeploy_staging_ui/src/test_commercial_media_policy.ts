import assert from 'node:assert/strict';
import {gallerySlides,persistentBusinessLogo} from './commercial-media-policy';
const logo='https://images.appdeploy.ai/logo.webp';
const photo1='https://images.appdeploy.ai/products.webp';
const photo2='https://images.appdeploy.ai/shop.webp';
const shop={headline:'Ferretería Mininco',imageUrl:logo,
 slides:[{id:'products1',kind:'image' as const,title:'Herramientas',body:'Variedad para tu proyecto',imageUrl:photo1},
 {id:'products2',kind:'image' as const,title:'Materiales',body:'Productos de ferretería',imageUrl:photo2},
 {id:'hours',kind:'hours' as const,title:'Horarios',body:'Consulta horarios confirmados'}]};
assert.equal(persistentBusinessLogo(shop),logo);
assert.deepEqual(gallerySlides(shop).map(s=>s.id),['products1','products2','hours']);
assert.equal(gallerySlides(shop).length,3);
assert.equal(gallerySlides({headline:'Solo logo',imageUrl:logo}).length,1);
assert.equal(persistentBusinessLogo({headline:'Solo logo',imageUrl:logo}),undefined);
assert.equal(persistentBusinessLogo({headline:'Sin logo',slides:shop.slides}),undefined);
assert.equal(gallerySlides({headline:'Sin logo',slides:shop.slides}).length,3);
const separate={...shop,logoUrl:'https://images.appdeploy.ai/brand.png',imageUrl:photo1};
assert.equal(persistentBusinessLogo(separate),separate.logoUrl);
assert.equal(gallerySlides(separate)[0].id,'cover');
assert.equal(gallerySlides(separate)[0].imageUrl,photo1);
assert.equal(gallerySlides({...shop,slides:shop.slides.concat(shop.slides)}).length,4);
console.log('COMMERCIAL_BRAND_AND_GALLERY_PASS');
