type Properties=Record<string,string|number|boolean>;
export const ANALYTICS_PROPERTY_KEYS=new Set(['surface','commune','listing_id','kind','area','origin','verified','review','sponsor_id','category','scope','presence','count','keyword_count','visible_ms']);
// The only permitted external analytics destination; never takes a caller URL.
export async function sendPosthogEvent(projectKey:string,event:string,distinctId:string,properties:Properties,transport:typeof fetch=globalThis.fetch){
 if(!/^[a-f0-9]{64}$/.test(distinctId))throw Error('analytics_daily_identity_required');
 const safe=Object.fromEntries(Object.entries(properties).filter(([key])=>ANALYTICS_PROPERTY_KEYS.has(key)).map(([key,value])=>[key,typeof value==='string'?value.slice(0,160):value]));
 const payload=JSON.stringify({api_key:projectKey,event,properties:{...safe,distinct_id:distinctId,'$process_person_profile':false}});
 if(Buffer.byteLength(payload)>4096)throw Error('analytics_payload_limit');
 const response=await transport('https://us.i.posthog.com/capture/',{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:payload,signal:AbortSignal.timeout(5000)});
 return response.ok;
}
