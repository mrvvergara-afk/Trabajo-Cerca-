// QA-only mock: no platform SDK, no database and no outbound API calls.
// Deliberately isolated from all production sources and config.
const emptySummary = {
  items: [], nextCursor:null, updatedAt:'2026-11-13T00:00:00Z',
  totalItems:0,totalJobOffers:0,totalVerifiedJobOffers:0,totalProvisionalJobOffers:0,
  recentJobOffers7d:0,recentJobOffers24h:0,
  kindStats:{jobs:0,people:0,needs:0,services:0},communeStats:{},feedState:'authoritative_empty',
};
const reply=(data:unknown={})=>Promise.resolve({data});
const approvedDirectory=[
  {id:'local_aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',kind:'service',title:'Soldaduras de ejemplo',
    category:'Soldadura',description:'Rejas, reparaciones y trabajos metálicos de ejemplo.',
    commune:'Angol',coverage:['Angol'],photos:[],rating:4.6,reviewCount:5,contactAvailable:false},
  {id:'local_bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',kind:'business',title:'Pastelería de ejemplo',
    category:'Pastelería',description:'Tortas y productos de pastelería de ejemplo.',
    commune:'Angol',coverage:['Angol'],photos:[],rating:null,reviewCount:0,contactAvailable:false},
];
export const api={
  get: (url:string)=>reply(url.startsWith('/api/listings?') ? emptySummary
    : url.startsWith('/api/local-directory?') ? {
      items: approvedDirectory.filter(item=>{
        const kind=new URL(url,'https://qa.invalid').searchParams.get('kind');
        return kind==='all'||kind===item.kind;
      }),partial:false,
    } : {}),
  post: (url:string,_body?:unknown)=>reply(url.startsWith('/api/local-directory/local_') && url.endsWith('/status') ? {
    id:'local_12345678-1234-1234-1234-123456789abc',
    title:'Pastelería de prueba',commune:'Angol',kind:'business',status:'pending',photosCount:3,
    category:'Pastelería', description:'Tortas personalizadas por encargo.',
    previewPhotos:['data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22120%22%20height%3D%2290%22%3E%3Crect%20width%3D%22120%22%20height%3D%2290%22%20fill%3D%22%23f4e4cc%22%2F%3E%3C%2Fsvg%3E'],
  } : {}),
  put: (_url:string,_body?:unknown)=>reply({}),
  delete: (_url:string,_body?:unknown)=>reply({}),
};
export const auth={
  isSignedIn:()=>false,
  getUser:()=>Promise.resolve(null),
  signIn:()=>Promise.reject(new Error('QA SDK mock: sign-in disabled')),
  signInWithRedirect:()=>Promise.reject(new Error('QA SDK mock: sign-in disabled')),
  signOut:()=>Promise.resolve(),
};
export const notifications={
  configure:(_options?:unknown)=>Promise.resolve({ok:true}),
  onMessage:(_callback:(payload:unknown)=>void)=>()=>undefined,
  getEnvironment:()=>Promise.resolve({platform:'desktop',browser:'chrome',mode:'browser_tab',permission:'denied',isSupported:false,canRequestPermission:false}),
  getEnableGuidance:()=>Promise.resolve({kind:'unsupported',title:'QA',message:'Deshabilitado en simulación',steps:[]}),
  getPermission:()=>Promise.resolve('denied'),
  requestPermission:()=>Promise.resolve('denied'),
  subscribe:()=>Promise.resolve(null),
  unsubscribe:()=>Promise.resolve(),
  getSubscription:()=>Promise.resolve(null),
};
export const image={
  generate:()=>Promise.reject(new Error('QA SDK mock: image generation disabled')),
};
