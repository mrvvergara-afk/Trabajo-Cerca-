import { evaluatePublicJob, type PublicVerification } from './public-source-verifier';
import { fetchPublicPage, type PublicPage } from './public-source-http';
import { evaluateMunicipalOffer, municipalEvidenceRequests } from './municipal-offer-verification';

type Reader=(url:string,expected?:string,format?:'page'|'json')=>Promise<PublicPage>;
/** Shared final verification. Related evidence is read server-side through the same publisher/robots policy. */
export async function verifyPublicJobPage(url:string,page:PublicPage,now=Date.now(),read:Reader=fetchPublicPage):Promise<PublicVerification>{
  if(page.error)return {status:'pending',reason:page.error};
  const standard=evaluatePublicJob(url,page.raw,page.url,page.status,now);
  if(page.status!==200||standard.status==='rejected')return standard;
  const request=municipalEvidenceRequests(url,page.raw);
  if(!request)return standard;
  const index=await read(request.indexUrl);
  const metadata=request.metadataUrl?await read(request.metadataUrl,undefined,'json'):
    {url:'',raw:'',status:0,mime:'',bytes:0,error:'metadata_endpoint_missing'};
  const checkedAt=new Date(Math.max(now,Date.now())).toISOString();
  return evaluateMunicipalOffer(url,page.raw,{index,metadata,checkedAt},Math.max(now,Date.now()))||standard;
}
