import {api as isolatedApi} from './sdk-browser-stub';
export {auth, image, notifications} from './sdk-browser-stub';
const titles=[
  'Operación de maquinaria agrícola · ensayo visual',
  'Mantenimiento industrial y eléctrico · ensayo visual',
  'Asistencia administrativa contable · ensayo visual',
  'Bodega y logística · ensayo visual',
  'Conducción de transporte de carga · ensayo visual',
  'Carpintería y terminaciones · ensayo visual',
];
const areas=['Agricultura','Industria','Administración','Logística','Transporte','Construcción'];
// Use the existing fixture's pagination and states, with realistic text lengths.
// These values are explicitly synthetic; no Stitch employer, vacancy or distance is copied.
export const api={...isolatedApi,get:async(path:string)=>{
  const response=await isolatedApi.get(path);
  if(path.startsWith('/api/growth/advertising')){
    const data=response.data as {house:Array<{creatives:Array<{imageUrl?:string}>}>};
    return {...response,data:{...data,house:data.house.map(c=>({...c,creatives:c.creatives.map(v=>({...v,...(v.imageUrl?.startsWith('https://raw.githubusercontent.com/')?{imageUrl:'/resources/'+v.imageUrl.split('/').pop()}:{} )}))}))}};
  }
  if((window as Window & {houseFixture?:string}).houseFixture!=='territory'||!path.startsWith('/api/listings'))return response;
  const present=(item:Record<string,unknown>)=>{
    if(item.kind!=='job_offer')return item;
    const n=Number(String(item.id).replace('territory-',''));
    return {...item,title:titles[n%titles.length],company:'Empleador sintético '+(n+1),area:areas[n%areas.length],date:'27-10-2026',originalPosterUrl:undefined};
  };
  const data=response.data as {items?:Array<Record<string,unknown>>;item?:Record<string,unknown>};
  return {...response,data:{...data,...(data.items?{items:data.items.map(present)}:{}),...(data.item?{item:present(data.item)}:{})}};
}};
