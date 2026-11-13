// QA-only mock: no platform SDK, no database and no outbound API calls.
// Deliberately isolated from all production sources and config.
const emptySummary = {
  items: [], nextCursor:null, updatedAt:'2026-11-13T00:00:00Z',
  totalItems:0,totalJobOffers:0,totalVerifiedJobOffers:0,totalProvisionalJobOffers:0,
  recentJobOffers7d:0,recentJobOffers24h:0,
  kindStats:{jobs:0,people:0,needs:0,services:0},communeStats:{},feedState:'authoritative_empty',
};
const reply=(data:unknown={})=>Promise.resolve({data});
export const api={
  get: (url:string)=>reply(url.startsWith('/api/listings?') ? emptySummary
    : url.startsWith('/api/local-directory?') ? {items:[]} : {}),
  post: (_url:string,_body?:unknown)=>reply({}),
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
