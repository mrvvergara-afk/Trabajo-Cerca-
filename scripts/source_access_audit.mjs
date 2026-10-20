// Read public primary entrypoints through the same robots and link parser used
// by the app. No database SDK, login, application submission or paid provider.
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const output='output/source-access-baseline';
mkdirSync(output+'/objects',{recursive:true});
const context=vm.createContext({URL,Buffer,TextDecoder,AbortSignal,fetch,createHash,console});
for(const name of ['social-evidence.ts','public-source-adapters.ts','public-robots.ts','public-source-http.ts','public-source-verifier.ts','free-public-sources.ts']) {
  const raw=readFileSync(new URL('../integrations/appdeploy/'+name,import.meta.url),'utf8');
  vm.runInContext(stripTypeScriptTypes(raw,{mode:'strip'}).replace(/^import .*;$/gm,'').replace(/^export /gm,''),context);
}
const config=JSON.parse(readFileSync(new URL('../config/portal-source-priorities.json',import.meta.url),'utf8'));
const targets=config.sources.map(source=>({source:source.name,url:source.search.replace('{place}','Angol').replace('{slug}','angol')}));
targets.push({source:'Municipalidad de Negrete · RSS',url:'https://www.muninegrete.cl/feed/'},
  {source:'Municipalidad de Mulchén · RSS',url:'https://www.munimulchen.cl/?feed=rss2&s=oferta+laboral'},
  {source:'Las Noticias de Malleco · índice',url:'https://lasnoticiasdemalleco.cl/'},
  {source:'WOF Chile · enlace visible en afiche aportado',url:'https://wof-chile.com/postular/'});
const sources=[],started=Date.now();
for(const target of targets) {
  if(Date.now()-started>190000)break;
  const page=await context.fetchPublicPage(target.url);
  const policy=await context.checkPublicRobots(target.url);
  const links=page.status===200 && !page.error ? context.publicPageLinks(page.raw,page.url) : {candidates:[],archives:[]};
  const row={...target,final_url:page.url,http:page.status,error:page.error || null,robots:policy,
    candidate_links:links.candidates,archive_links:links.archives,verified:0,published:0,coverage_complete:false};
  if(page.raw){const digest=createHash('sha256').update(page.raw).digest('hex');writeFileSync(output+'/objects/'+digest,page.raw);row.decoded_html_sha256=digest;}
  sources.push(row);
  console.log('SOURCE_ACCESS '+JSON.stringify({...row,candidate_links:row.candidate_links.slice(0,8)}));
}
writeFileSync(output+'/public-access.json',JSON.stringify({checked_at:new Date().toISOString(),sources,published:0,paid_provider_calls:0,coverage_complete:false},null,2)+'\n');
