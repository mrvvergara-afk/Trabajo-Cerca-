import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { publicPublisher, safePublicUrl } from './public-source-adapters';
const PUBLIC_CRAWLER='TrabajoCercaPublic/1.0';
type Policy={checkedAt:number;raw:string;error?:string;url:string;status:number;sha256?:string};
const publicPolicies=new Map<string,Policy>();

export function publicRobotsAllow(raw:string,address:string) {
  const groups:Array<{agents:string[];rules:Array<{path:string;allow:boolean}>}>=[];
  let group:{agents:string[];rules:Array<{path:string;allow:boolean}>} | null=null;
  let hasRules=false;
  for (const line of raw.split(/\r?\n/)) {
    const clean=line.replace(/#.*$/,'').trim(),colon=clean.indexOf(':');
    if (colon<0) continue;
    const key=clean.slice(0,colon).trim().toLowerCase(),value=clean.slice(colon+1).trim();
    if (key==='user-agent') {
      if (!group || hasRules) {group={agents:[],rules:[]};groups.push(group);hasRules=false;}
      group.agents.push(value.toLowerCase());
    } else if (group && ['allow','disallow'].includes(key)) {hasRules=true;if(value)group.rules.push({path:value,allow:key==='allow'});}
  }
  const scores=groups.map(value=>Math.max(-1,...value.agents.map(agent=>agent==='*'?0:PUBLIC_CRAWLER.toLowerCase().startsWith(agent)?agent.length:-1)));
  const best=Math.max(-1,...scores),url=new URL(address),path=url.pathname+url.search;
  const matches:Array<{allow:boolean;length:number}>=[];
  groups.forEach((value,index)=>{
    if (best<0 || scores[index]!==best) return;
    for (const rule of value.rules) {
      const end=rule.path.endsWith('$'),part=end?rule.path.slice(0,-1):rule.path;
      const pattern=part.split('*').map(text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*');
      if (new RegExp('^'+pattern+(end?'$':'')).test(path)) matches.push({allow:rule.allow,length:rule.path.replace(/[*$]/g,'').length});
    }
  });
  matches.sort((a,b)=>b.length-a.length || Number(b.allow)-Number(a.allow));
  return !matches.length || matches[0].allow;
}

export async function checkPublicRobots(address:string,now=Date.now()) {
  const origin=new URL(address).origin,publisher=publicPublisher(address);
  if (!publisher) return {allowed:false,error:'publisher_not_allowed'};
  let policy=publicPolicies.get(origin);
  if (!policy || now-policy.checkedAt>3600000) {
    let url=origin+'/robots.txt';
    policy={checkedAt:now,raw:'',url,status:0,error:'robots_policy_unavailable'};
    try {
      for (let attempt=0;attempt<4;attempt++) {
        const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(6500),headers:{'user-agent':PUBLIC_CRAWLER,'accept':'text/plain,text/html'}});
        policy.url=url;policy.status=response.status;
        if ([301,302,303,307,308].includes(response.status)) {
          const next=safePublicUrl(response.headers.get('location') || '',url);await response.body?.cancel();
          if (!next || publicPublisher(next)?.group!==publisher.group) break;
          url=next;continue;
        }
        if (response.status===404) {await response.body?.cancel();policy.error=undefined;break;}
        if (response.status!==200) {await response.body?.cancel();break;}
        const reader=response.body?.getReader(),parts:Uint8Array[]=[];let size=0;
        if (reader) for (;;) {
          const chunk=await reader.read();if(chunk.done)break;
          size+=chunk.value.byteLength;if(size>50000){await reader.cancel();throw new Error('policy_byte_limit');}parts.push(chunk.value);
        }
        else {const body=new Uint8Array(await response.arrayBuffer());if(body.length>50000)throw new Error('policy_byte_limit');parts.push(body);}
        const data=Buffer.concat(parts),mime=(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
        policy.sha256=createHash('sha256').update(data).digest('hex');policy.raw=data.toString('utf8');
        if (mime!=='text/plain' && !(mime==='text/html' && /^\s*user-agent\s*:/im.test(policy.raw))) break;
        policy.error=undefined;break;
      }
    } catch { /* Unknown policy never grants access. */ }
    if (publicPolicies.size>=64) publicPolicies.delete(publicPolicies.keys().next().value!);
    publicPolicies.set(origin,policy);
  }
  const allowed=!policy.error && publicRobotsAllow(policy.raw,address);
  return {allowed,error:policy.error || (allowed?undefined:'robots_disallowed'),robotsUrl:policy.url,robotsHttp:policy.status,robotsSha256:policy.sha256};
}
