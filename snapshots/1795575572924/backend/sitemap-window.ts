import {createHash} from 'node:crypto';
import {SaxesParser} from 'saxes';

export type SitemapCursor = {position:number; prefixHash:string};
export type SitemapWindow = {links:string[]; verifiedCursor:boolean; next?:SitemapCursor};

/** Resume by validated XML record prefix. Offsets refer to records, not compressed bytes. */
export async function sitemapWindow(
  stream:ReadableStream<Uint8Array>, cursor:SitemapCursor|undefined, limit:number,
  maxBytes=52_428_800
):Promise<SitemapWindow> {
  if (!Number.isSafeInteger(limit) || limit<1) throw Error('invalid_sitemap_window_limit');
  const reader=stream.getReader();
  const decoder=new TextDecoder('utf-8',{fatal:true});
  const parser=new SaxesParser({xmlns:true});
  const hash=createHash('sha256');
  const links:string[]=[];
  let position=0, depth=0, bytes=0, loc:string|null=null, root='', namespace='';
  let verifiedCursor=!cursor, reachedEnd=false;
  let next:SitemapCursor|undefined;
  const stop=Symbol('window_complete');
  const changed=Symbol('checkpoint_changed');
  parser.on('doctype',()=>{throw Error('sitemap_doctype_not_allowed');});
  parser.on('error',error=>{throw error;});
  parser.on('opentag',tag=>{
    depth++;
    if(depth===1){
      root=tag.local;namespace=tag.uri;
      if(!['urlset','sitemapindex'].includes(root) ||
         (namespace && namespace!=='http://www.sitemaps.org/schemas/sitemap/0.9'))
        throw Error('invalid_sitemap_root');
    }
    if(depth===2 && (tag.uri!==namespace || tag.local!==(root==='urlset'?'url':'sitemap')))
      throw Error('invalid_sitemap_entry');
    if(depth===3 && tag.uri===namespace && tag.local==='loc')loc='';
    if(depth>3 && loc!==null)throw Error('invalid_sitemap_loc');
  });
  const append=(value:string)=>{
    if(loc===null)return;
    loc+=value;
    if(loc.length>2048)throw Error('sitemap_loc_too_long');
  };
  parser.on('text',append);
  parser.on('cdata',append);
  parser.on('closetag',()=>{
    if(depth--!==3 || loc===null)return;
    const link=loc.trim();loc=null;
    if(!link)throw Error('empty_sitemap_loc');
    position++;
    hash.update(JSON.stringify(link)+'\n');
    if(cursor && position<=cursor.position){
      if(position===cursor.position){
        verifiedCursor=hash.copy().digest('hex')===cursor.prefixHash;
        if(!verifiedCursor)throw changed;
      }
      return;
    }
    links.push(link);
    if(links.length===limit){
      next={position,prefixHash:hash.copy().digest('hex')};
      throw stop;
    }
  });
  try {
    for (;;) {
      const chunk=await reader.read();
      if(chunk.done){reachedEnd=true;break;}
      bytes+=chunk.value.byteLength;
      if(bytes>maxBytes)throw Error('sitemap_byte_budget_exceeded');
      parser.write(decoder.decode(chunk.value,{stream:true}));
    }
    parser.write(decoder.decode()).close();
  } catch(error) {
    if(error===changed)return {links:[],verifiedCursor:false};
    if(error!==stop)throw error;
  } finally {
    if(!reachedEnd)await reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
  return {links,verifiedCursor,next};
}
