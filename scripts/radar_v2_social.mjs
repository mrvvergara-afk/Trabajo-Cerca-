// Literal public Story extraction; never uses crawl time, relative labels or a login cookie.
import { createHash } from 'node:crypto';

export const hiring = text => /ofertas? laboral(?:es)?|vacantes?|se (?:busca|necesita|requiere)|enviar? (?:cv|curr[ií]culum)|postulaciones|omil/i.test(text || '');

export function postIdentity(value, profile) {
  try {
    const url=new URL(value),publisher=new URL(profile);
    if (url.protocol!=='https:' || url.username || url.password || url.port ||
        !['facebook.com','www.facebook.com','web.facebook.com','m.facebook.com'].includes(url.hostname)) return null;
    const owner=publisher.pathname.replace(/^\/+|\/+$/g,'');
    const parts=url.pathname.split('/').filter(Boolean);
    if (parts.length!==3 || parts[0].toLowerCase()!==owner.toLowerCase() || parts[1]!=='posts' ||
        !/^(?:pfbid[A-Za-z0-9]{20,}|\d{5,})$/.test(parts[2])) return null;
    return 'https://www.facebook.com/'+owner+'/posts/'+parts[2];
  } catch {return null;}
}

function mediaFrom(value) {
  const found=new Set(),stack=[{value,depth:0}];let visited=0;
  while(stack.length && visited++<3000) {
    const {value:node,depth}=stack.pop();
    if(depth>8 || !node || typeof node!=='object')continue;
    if(node.__typename==='Story')continue;
    for(const [key,item] of Object.entries(node)) {
      if(['uri','url'].includes(key) && typeof item==='string') {
        try {const url=new URL(item);if(url.protocol==='https:' && !url.username && !url.password && /\.fbcdn\.net$/.test(url.hostname))found.add(url.toString());}catch{}
      }
      if(item && typeof item==='object')stack.push({value:item,depth:depth+1});
    }
  }
  return [...found].slice(0,6);
}

export function extractStories(payload,profile,now=Date.now(),sourceHash='') {
  const groups=new Map(),stack=[payload];let visited=0;
  while(stack.length && visited++<80000) {
    const node=stack.pop();if(!node || typeof node!=='object')continue;
    if(node.__typename==='Story') {
      const url=postIdentity(node.permalink_url || node.url,profile);
      const id=typeof node.id==='string' && node.id.length<500 ? node.id : url;
      if(id) {
        const group=groups.get(id) || {urls:new Set(),times:new Set(),texts:new Set(),media:new Set(),invalidTime:false};
        if(url)group.urls.add(url);
        const timestamp=node.creation_time;
        if((typeof timestamp==='number' || typeof timestamp==='string') && /^\d{10}$/.test(String(timestamp))) {
          const epoch=Number(timestamp)*1000;
          if(epoch>=Date.UTC(2006,0,1) && epoch<=now)group.times.add(epoch);else group.invalidTime=true;
        }
        if(typeof node.message?.text==='string')group.texts.add(node.message.text);
        for(const item of mediaFrom(node.attachments || node.attached_story?.attachments || []))group.media.add(item);
        groups.set(id,group);
      }
    }
    for(const item of Object.values(node))if(item && typeof item==='object')stack.push(item);
  }
  const result=[];
  for(const [id,group] of groups) {
    if(group.urls.size!==1)continue;
    const url=[...group.urls][0],epoch=group.times.size===1&&!group.invalidTime?[...group.times][0]:null;
    const text=[...group.texts].join('\n'),selected=hiring(text);
    result.push({url,profile,source_published_at:epoch?new Date(epoch).toISOString():null,
      date_proof:epoch?{kind:'facebook_story_creation_time',story_id:id,post_url:url,literal_epoch:epoch/1000,source_sha256:sourceHash}:null,
      text:selected?text.slice(0,18000):'',text_truncated:selected && text.length>18000,
      hiring_language:selected,media:[...group.media].slice(0,6),
      reason:epoch?'literal_story_date':'source_date_missing_or_conflicting'});
  }
  return result.slice(0,20);
}

export function extractJsonText(raw,profile,now=Date.now()) {
  if(typeof raw!=='string' || Buffer.byteLength(raw)>4*1024*1024)return [];
  const hash=createHash('sha256').update(raw).digest('hex'),parts=[];
  try {parts.push(JSON.parse(raw.replace(/^for\s*\(;;\);\s*/,'')));}
  catch {for(const line of raw.split('\n').slice(0,30)){try{parts.push(JSON.parse(line.replace(/^for\s*\(;;\);\s*/,'')));}catch{}}}
  return parts.flatMap(part=>extractStories(part,profile,now,hash)).slice(0,20);
}

export function mergeStories(rows) {
  const map=new Map();
  for(const row of rows) {
    const prior=map.get(row.url);
    if(!prior){map.set(row.url,row);continue;}
    const conflict=prior.reason==='conflicting_story_date' || row.reason==='conflicting_story_date' || prior.source_published_at && row.source_published_at && prior.source_published_at!==row.source_published_at;
    map.set(row.url,{...prior,...row,text:row.text || prior.text,media:[...new Set([...(prior.media||[]),...(row.media||[])])].slice(0,6),
      source_published_at:conflict?null:prior.source_published_at || row.source_published_at,
      date_proof:conflict?null:prior.date_proof || row.date_proof,reason:conflict?'conflicting_story_date':row.reason});
  }
  return [...map.values()].slice(0,20);
}
