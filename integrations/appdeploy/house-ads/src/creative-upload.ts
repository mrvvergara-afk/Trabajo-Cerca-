import {api} from '@appdeploy/client';
export async function uploadCreative(file:File) {
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024)throw Error('Usa PNG, JPEG o WebP hasta 8 MB.');
 const bitmap=await createImageBitmap(file);try{
  if(bitmap.width*bitmap.height>40000000)throw Error('La imagen excede 40 megapíxeles.');
  const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);
  for(const quality of [.85,.72,.58]){const data=canvas.toDataURL('image/webp',quality);const mime=data.slice(5,data.indexOf(';'));const content=data.split(',')[1];if(atob(content).length<=200000){const r=await api.post('/api/admin/marketing/creative',{content,mime});return r.data.storagePath as string;}}
  throw Error('No se pudo comprimir a 200 KB; usa una imagen más sencilla.');
 }finally{bitmap.close();}
}
