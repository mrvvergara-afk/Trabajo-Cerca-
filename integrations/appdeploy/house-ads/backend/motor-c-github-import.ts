import {createPublicKey,verify} from 'node:crypto';
import {importReview} from './radar-review-inbox';
const ISSUER='https://token.actions.githubusercontent.com';
const AUDIENCE='trabajo-cerca-motor-c-import';
const REPOSITORY='mrvvergara-afk/radar-laboral-motor-c.';
const decode=(s:string)=>JSON.parse(Buffer.from(s,'base64url').toString('utf8')) as Record<string,unknown>;
export async function importMotorCGitHubOidc(ctx:{body:unknown;event:any}){
 try {
  const headers=ctx.event?.headers||{};
  const auth=String(headers.authorization||headers.Authorization||'');
  if(!auth.startsWith('Bearer ')||auth.length>10000)return {statusCode:401,headers:{'content-type':'application/json'},body:'{"error":"unauthorized"}'};
  const jwt=auth.slice(7),segments=jwt.split('.');
  if(segments.length!==3)return {statusCode:401,headers:{'content-type':'application/json'},body:'{"error":"invalid_token"}'};
  const header=decode(segments[0]),claims=decode(segments[1]);
  const now=Math.floor(Date.now()/1000);
  if(header.alg!=='RS256'||typeof header.kid!=='string'||claims.iss!==ISSUER||
    claims.aud!==AUDIENCE||claims.repository!==REPOSITORY||
    claims.ref!=='refs/heads/main'||typeof claims.exp!=='number'||claims.exp<now||
    claims.exp>now+7200||typeof claims.iat!=='number'||claims.iat>now+60||
    typeof claims.workflow_ref!=='string'||!claims.workflow_ref.endsWith('/.github/workflows/rastreo.yml@refs/heads/main'))
   return {statusCode:403,headers:{'content-type':'application/json'},body:'{"error":"claims_rejected"}'};
  const res=await fetch('https://token.actions.githubusercontent.com/.well-known/jwks',{signal:AbortSignal.timeout(6000)});
  if(!res.ok)throw Error('oidc_keys_unavailable');
  const jwks=await res.json() as {keys:Array<Record<string,unknown>>};
  const jwk=jwks.keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&k.use==='sig');
  if(!jwk||!verify('RSA-SHA256',Buffer.from(segments[0]+'.'+segments[1]),createPublicKey({key:jwk as any,format:'jwk'}),Buffer.from(segments[2],'base64url')))
   return {statusCode:403,headers:{'content-type':'application/json'},body:'{"error":"signature_rejected"}'};
  const input=ctx.body as {items?:unknown};
  if(!Array.isArray(input?.items)||input.items.length>35)return {statusCode:400,headers:{'content-type':'application/json'},body:'{"error":"invalid_batch"}'};
  const outcome=await importReview(input);
  return {statusCode:200,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify({...outcome,verified:0,published:0})};
 }catch(e){console.warn('MOTOR_C_IMPORT_ERROR '+String(e).slice(0,160));return {statusCode:503,headers:{'content-type':'application/json'},body:'{"error":"integration_unavailable"}'};}
}
