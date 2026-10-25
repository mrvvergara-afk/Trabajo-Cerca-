import {useState} from 'react';
import {safeAdImage} from '../shared/ad-images';
export function AdImage({url,logo=false}:{url?:string;logo?:boolean}) {
 const [failed,setFailed]=useState<string|null>(null);const safe=safeAdImage(url);
 if(!safe||failed===safe)return null;
 const photo=!!safe&&/\/house-[a-z-]+-photo-v2-640\.webp$/.test(safe);
 return <img srcSet={photo?`${safe} 640w, ${safe!.replace('-640.webp','-1200.webp')} 1200w`:undefined} sizes={photo?'(max-width: 800px) 100vw, 380px':undefined} className={logo?'tcAdLogo':'tcAdImage'} src={safe} alt='' width={logo?40:photo?640:120} height={logo?40:photo?427:90} loading='lazy' decoding='async' referrerPolicy='no-referrer' onError={()=>setFailed(safe)}/>;
}
