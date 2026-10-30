import { db } from '@appdeploy/sdk';
import { preservedSocialFinding } from './social-evidence';

type Finding=Record<string, unknown>;
const TABLE='social_notice_evidence';

// Full transcriptions live in individual records, apart from each capture's compact index.
export async function storeSocialFindings(findings:Finding[]) {
  if (findings.length>12) throw new Error('Social evidence write batch exceeds budget');
  if (!findings.length) return [];
  const originals=findings.map(preservedSocialFinding);
  const bytes=Buffer.byteLength(JSON.stringify(originals));
  if (bytes>900000 || originals.some(row=>Buffer.byteLength(JSON.stringify(row))>230000)) throw new Error('Social evidence byte budget exceeded');
  const ids=await db.add(TABLE,originals);
  if (ids.length!==originals.length || ids.some(id=>!id)) throw new Error('Partial social evidence insertion; capture cursor must remain unchanged');
  return originals.map((row,index)=>({ ...row,text:String(row.text).slice(0,1100),textExcerpt:String(row.text).length>1100,evidenceId:ids[index] }));
}

export async function hydrateSocialFindings(findings:Finding[]) {
  if (findings.length>60) throw new Error('Social evidence read batch exceeds budget');
  const ids=[...new Set(findings.map(row=>row.evidenceId).filter((id):id is string=>typeof id==='string' && /^[A-Za-z0-9_-]{1,160}$/.test(id)))];
  const records=ids.length ? await db.get<Finding>(TABLE,ids) : [];
  const byId=new Map(ids.map((id,index)=>[id,records[index]]));
  return findings.map(row=>{
    if (!row.evidenceId) return row;
    const full=byId.get(String(row.evidenceId));
    if (!full || full.postUrl!==row.postUrl || full.title!==row.title || full.mediaUrl!==row.mediaUrl) {
      return { ...row,textTruncated:true,transcriptionAvailable:false };
    }
    return { ...row,...preservedSocialFinding(full),transcriptionAvailable:true,textExcerpt:false };
  });
}
