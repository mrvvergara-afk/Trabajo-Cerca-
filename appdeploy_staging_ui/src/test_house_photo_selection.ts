import assert from 'node:assert/strict';
import {selectHousePhotoUrl} from './house-photo-selection';
const origin='https://raw.githubusercontent.com/mrvvergara-afk/Trabajo-Cerca-/c445112b9cdb78adfce9d8065e32411c4f412c4b/integrations/appdeploy/house-ads/public/resources/';
const artworks=['professionals','advertisers','employers','explore','inclusion','local-business'] as const;
for(const art of artworks) {
 const photo=origin+'house-'+art+'-photo-v2-640.webp';
 assert.equal(selectHousePhotoUrl({defaultUrl:photo,firstSlide:true}),photo,art+' main slide');
 assert.equal(selectHousePhotoUrl({defaultUrl:photo,firstSlide:false}),photo,art+' gallery slide');
 assert.equal(selectHousePhotoUrl({defaultUrl:photo,customUrl:photo,imageDisabled:true,firstSlide:true}),undefined,'withdrawal wins');
 assert.equal(selectHousePhotoUrl({defaultUrl:photo,imageDisabled:true,firstSlide:false}),undefined,'withdrawal suppresses galleries');
 assert.equal(selectHousePhotoUrl({defaultUrl:photo,customUrl:'https://attacker.invalid/evil.webp',firstSlide:true}),photo,'unsafe custom never bypasses approved fallback');
}
assert.equal(selectHousePhotoUrl({defaultUrl:'https://attacker.invalid/evil.webp',firstSlide:false}),undefined);
assert.equal(selectHousePhotoUrl({defaultUrl:'/house-creatives/explore.svg',firstSlide:false}),'/house-creatives/explore.svg');
assert.equal(selectHousePhotoUrl({defaultUrl:undefined,firstSlide:true}),undefined);
console.log('HOUSE_PHOTO_SELECTION_PASS',artworks.length);
