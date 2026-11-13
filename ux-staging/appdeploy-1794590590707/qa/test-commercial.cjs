const assert=require('node:assert/strict');
const {allocateAdvertising,HOUSE_DEFAULTS}=require('./dist/shared/house-ads.js');
const now=Date.UTC(2026,10,13,20,0,0);
const ad=(id,overrides={})=>({
 id,businessName:'Negocio de prueba',headline:'Promoción',detail:'Descripción',
 communes:['Angol'],category:'Ferretería',status:'active',startAt:'2026-11-01T00:00:00Z',endAt:'2026-11-20T00:00:00Z',
 priority:5,placements:['search','listing'],pages:['home'],adType:'COMMERCIAL_FREE',...overrides
});
const allocate=(options={})=>allocateAdvertising({house:HOUSE_DEFAULTS,commercial:[],complete:true,place:'Angol',category:'Todas',page:'home',
 now,turn:1,seen:{},completed:[],slots:['search','listing','featured','form'],...options});
let pass=0;const check=(name,fn)=>{fn();pass++;console.log('PASS '+name)};
check('Four slots always have fallback',()=>{const s=allocate();for(const k of ['search','listing','featured','form'])assert.equal(s[k].type,'HOUSE_AD')});
check('Catalog loading must never expose assumed paid advertiser',()=>{const s=allocate({complete:false,commercial:[ad('ad1')]});assert.equal(s.search.type,'HOUSE_AD')});
check('Commercial campaign uses explicitly chosen search placement',()=>{const s=allocate({commercial:[ad('ad1',{placements:['search']})]});assert.equal(s.search.type,'COMMERCIAL');assert.equal(s.listing.type,'HOUSE_AD')});
check('Commercial campaign supports multiple placements',()=>{const s=allocate({commercial:[ad('ad1',{placements:['search','listing','featured']})]});for(const k of ['search','listing','featured'])assert.equal(s[k].type,'COMMERCIAL');assert.equal(s.form.type,'HOUSE_AD')});
check('Expired commercial uses institutional fallback',()=>{const s=allocate({commercial:[ad('ad1',{endAt:'2026-11-10T00:00:00Z'})]});assert.equal(s.search.type,'HOUSE_AD')});
check('Paused commercial uses institutional fallback',()=>{const s=allocate({commercial:[ad('ad1',{status:'paused'})]});assert.equal(s.search.type,'HOUSE_AD')});
check('Wrong municipality never places advertiser',()=>{const s=allocate({place:'Nacimiento',commercial:[ad('ad1')]});assert.equal(s.search.type,'HOUSE_AD')});
check('Paid beats free in same area',()=>{const s=allocate({commercial:[ad('free',{priority:100}),ad('paid',{priority:1,adType:'COMMERCIAL_PAID'})]});assert.equal(s.search.campaign.id,'paid')});
check('Missing HOUSE_AD inventory still fills slots',()=>{const s=allocate({house:[],commercial:[]});for(const k of ['search','listing','featured','form'])assert.equal(s[k].type,'HOUSE_AD')});
check('No campaign survives its precise end timestamp',()=>{const s=allocate({now:Date.parse('2026-11-20T00:00:00Z'),commercial:[ad('ad1')]});assert.equal(s.search.type,'HOUSE_AD')});
console.log(pass+' advertising allocation tests passed');