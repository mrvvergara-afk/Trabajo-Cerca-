import {useState} from 'react';
import {safeAdImage} from '../shared/ad-images';
export function AdImage({url,logo=false}:{url?:string;logo?:boolean}) {
 const [failed,setFailed]=useState<string|null>(null);const safe=safeAdImage(url);
 if(!safe||failed===safe)return null;
 return <img className={logo?'tcAdLogo':'tcAdImage'} src={safe} alt='' width={logo?40:120} height={logo?40:90} loading='lazy' decoding='async' referrerPolicy='no-referrer' onError={()=>setFailed(safe)}/>;
}
