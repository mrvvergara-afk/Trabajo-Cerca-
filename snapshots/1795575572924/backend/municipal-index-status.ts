export function municipalOfferStatusFromHtml(html:string,detailUrl:string,indexUrl:string):'open'|'closed'|'unknown' {
  // A municipal index can mix open and closed cards. Read the label on
  // THE SAME anchor, not the preceding unrelated card or page header.
  const target=new URL(detailUrl,indexUrl);
  const links=/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi;
  let match:RegExpExecArray|null;
  while((match=links.exec(html))!==null){
    let resolved:URL;
    try{resolved=new URL(match[2].replace(/&amp;/gi,'&'),indexUrl);}catch{continue;}
    if(resolved.origin!==target.origin||resolved.pathname.replace(/\/$/,'')!==target.pathname.replace(/\/$/,''))continue;
    const label=match[3].replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').toLowerCase();
    const open=/postulacion(?:es)? abierta(?:s)?/.test(label);
    const closed=/postulacion(?:es)? cerrada(?:s)?/.test(label);
    if(open!==closed)return open?'open':'closed';
  }
  return 'unknown';
}
