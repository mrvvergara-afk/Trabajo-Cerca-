export type AdMedia={storagePath?:string;approved?:boolean;reviewedAt?:string;imageUrl?:string};
export const validCreativePath=(path:unknown):path is string=>typeof path==='string'&&/^house-creatives\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(path);
export function safeAdImage(url:unknown):string|undefined {
 if(typeof url!=='string')return;
 if(/^\/resources\/house-(professionals|advertisers|employers|explore|inclusion|local-business)-photo-v2-(640|1200)\.webp$/.test(url))return url;
 if(/^\/house-creatives\/[a-z-]+\.svg$/.test(url))return url;
 try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)return;
 if(u.hostname.endsWith('.amazonaws.com')||u.hostname.endsWith('.appdeploy.ai'))return u.href;}catch{/* Untrusted arbitrary external URL is not an approved creative. */}
}
