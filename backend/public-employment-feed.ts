import {SaxesParser} from 'saxes';

export type EmploymentFeedLink={target:string;title:string;isAttachment:boolean};

export function employmentFeedLinks(xml:string):EmploymentFeedLink[]{
 if(xml.length>600_000 || !/^\s*(?:<\?xml[^>]*>\s*)?<(?:rss|feed)(?:\s|>)/i.test(xml))return [];
 const links:EmploymentFeedLink[]=[];
 const parser=new SaxesParser({xmlns:true});
 let level=0,entryLevel=0,field='',title='',text='';
 let URLs:Array<{target:string;isAttachment:boolean}>=[];
 parser.on('doctype',()=>{throw Error('feed_doctype_not_supported');});
 parser.on('error',error=>{throw error;});
 parser.on('opentag',tag=>{
  level++;
  if(level===1 && !['rss','feed'].includes(tag.local))throw Error('unsupported_feed');
  if(!entryLevel && ((tag.local==='item'&&level===3)||(tag.local==='entry'&&level===2))){
   entryLevel=level;field='';title='';text='';URLs=[];return;
  }
  if(!entryLevel || level!==entryLevel+1)return;
  if(tag.local==='title')field='title';
  if(tag.local==='link'||tag.local==='enclosure'){
   const attributes=Object.values(tag.attributes as Record<string,{local:string;value:string}>);
   const value=attributes.find(a=>a.local==='href'||a.local==='url')?.value;
   const relation=attributes.find(a=>a.local==='rel')?.value;
   const attachment=tag.local==='enclosure'||relation==='enclosure';
   if(value&&(attachment||!relation||relation==='alternate'))URLs.push({target:value,isAttachment:attachment});
   else if(!value&&tag.local==='link')field='link';
  }
 });
 const collect=(value:string)=>{if(field)text=(text+value).slice(0,2048);};
 parser.on('text',collect);
 parser.on('cdata',collect);
 parser.on('closetag',()=>{
  if(entryLevel && level===entryLevel+1){
   if(field==='title')title=text.trim().slice(0,200);
   if(field==='link'&&text.trim())URLs.push({target:text.trim(),isAttachment:false});
   field='';text='';
  }
  if(entryLevel&&level===entryLevel){
   for(const link of URLs.slice(0,5))if(links.length<200)links.push({...link,title});
   entryLevel=0;
  }
  level--;
 });
 try{parser.write(xml).close();return links;}
 catch{return [];}
}
