import { HOUSE_DEFAULTS } from '../shared/house-ads';
const state=window as unknown as {houseFixture?:string;houseCalls?:Array<{method:string;path:string;body:unknown}>;houseConfig?:unknown;houseRows?:unknown[];houseTrials?:unknown[]};
state.houseCalls=[];
let config={revision:'defaults-v1',campaigns:structuredClone(HOUSE_DEFAULTS)};
const emptyFeed={items:[],nextCursor:null,totalItems:0,totalJobOffers:0,totalVerifiedJobOffers:0,totalProvisionalJobOffers:0,recentJobOffers7d:0,kindStats:{jobs:0,people:0,needs:0,services:0},communeStats:{},feedState:'fresh',state:'fresh'};
export const auth={isSignedIn:()=>state.houseFixture==='admin',signIn:async()=>{},signOut:async()=>{},getAccessToken:async()=>''};
export const notifications={configure:async()=>{},onMessage:(_callback:unknown)=>()=>{},getEnableGuidance:async()=>({kind:'unsupported'}),getStatus:async()=>({enabled:false}),isSupported:()=>false,enable:async()=>{},disable:async()=>{},subscribe:async()=>{},unsubscribe:async()=>{}};
export const image={resizeIfNeeded:async()=>({data:'fixture',mimeType:'image/png'})};
const commercial=(id:string,communes:string[],placements=['search'])=>({id,communes,businessName:'Empresa ficticia solo en pruebas',headline:'Anuncio de prueba',detail:'Nunca se publica este fixture',category:'Comercio local',status:'active',priority:10,startAt:'2000-01-01T00:00:00Z',endAt:'2099-01-01T00:00:00Z',placements,adType:'COMMERCIAL_PAID',url:'https://example.org'});
async function call(method:string,path:string,body?:Record<string,unknown>){
 state.houseCalls!.push({method,path,body});
 if(path.startsWith('/api/growth/advertising'))return {data:{complete:true,house:config.campaigns,commercial:state.houseFixture==='paid'?[commercial('paid-angol',['Angol'])]:[]}};
 if(path.startsWith('/api/growth/house-events'))return {data:{received:true,type:'HOUSE_AD',billing:false}};
 if(path.startsWith('/api/listings')&&method==='GET')return {data:emptyFeed};
 if(path==='/api/listings'&&method==='POST')return {data:{item:{id:'fixture-published',kind:body?.kind},ownerToken:'fixture-owner-only'}};
 if(path==='/api/growth/advertiser-leads')return {data:{id:'fixture-lead',received:true,trialState:'pending_review'}};
 if(path==='/api/admin/session'){if(state.houseFixture!=='admin')throw {response:{status:401}};return {data:{administrator:true,backupExportEnabled:true}};}
 if(path.startsWith('/api/admin/marketing/house')){if(state.houseFixture!=='admin')throw {response:{status:401}};if(method==='PUT')config={revision:'saved-fixture',campaigns:body!.campaigns as typeof HOUSE_DEFAULTS};return {data:{...config,stats:[],nextToken:null}};}
 if(path.startsWith('/api/admin/marketing/trials'))return {data:{items:[],nextToken:null}};
 if(path.startsWith('/api/ops/summary'))return {data:{totalActive:0,totalPending:0,totalInternal:0,totalDirect:0,totalSources:0,growth:{advertiserLeads:0,socialDrafts:0,activeCampaigns:0},health:{},sources:[],communes:[]}};
 if(path.startsWith('/api/notifications'))return {data:{active:false,communes:[],keywords:[]}};
 return {data:{items:[],runs:[],sources:[],total:0,readOnly:true,growth:{advertiserLeads:0,socialDrafts:0,activeCampaigns:0}}};
}
export const api={get:(p:string)=>call('GET',p),post:(p:string,b?:Record<string,unknown>)=>call('POST',p,b),put:(p:string,b?:Record<string,unknown>)=>call('PUT',p,b),delete:(p:string,b?:Record<string,unknown>)=>call('DELETE',p,b)};
