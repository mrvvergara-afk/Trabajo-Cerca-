type Finding = Record<string, unknown>;
export type SocialEvidence = {
  version:'local-social-evidence-v1'; text:string; textTruncated:boolean;
  originalLength:number; postUrl:string; postDate:string | null;
  capturedAt:string; title:string; company:string; workplace:string; contact:string;
  deadline:string | null; missing:string[];
};

function literal(value:unknown, limit=300) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function fold(value:string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function socialSourceDate(value:unknown, endOfDay=false):string | null {
  const raw=literal(value, 150);
  const months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  let year:number, month:number, day:number;
  const iso=raw.match(/^(20\d{2})-(\d{2})-(\d{2})(?:T.*)?$/);
  const numeric=raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](20\d{2})$/);
  const spanish=fold(raw).match(/^(\d{1,2}) (?:de )?([a-z]+) (?:de )?(20\d{2})$/);
  if (iso) { year=Number(iso[1]); month=Number(iso[2]); day=Number(iso[3]); }
  else if (numeric) { year=Number(numeric[3]); month=Number(numeric[2]); day=Number(numeric[1]); }
  else if (spanish) { year=Number(spanish[3]); month=months.indexOf(spanish[2])+1; day=Number(spanish[1]); }
  else return null;
  const midday=new Date(Date.UTC(year,month-1,day,12));
  if (month<1 || month>12 || day<1 || midday.getUTCFullYear()!==year || midday.getUTCMonth()!==month-1 || midday.getUTCDate()!==day) return null;
  if (iso && raw.includes('T')) {
    if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) return null;
    const stamp=Date.parse(raw);
    return Number.isFinite(stamp) ? new Date(stamp).toISOString() : null;
  }
  const offsetText=new Intl.DateTimeFormat('en-US',{ timeZone:'America/Santiago',timeZoneName:'longOffset' }).formatToParts(midday).find(part=>part.type==='timeZoneName')?.value ?? '';
  const offset=offsetText.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!offset) return null;
  const minutes=(Number(offset[2])*60+Number(offset[3]))*(offset[1]==='-'?-1:1);
  return new Date(Date.UTC(year,month-1,day,endOfDay?23:0,endOfDay?59:0,endOfDay?59:0,endOfDay?999:0)-minutes*60000).toISOString();
}

export function preservedSocialFinding(input:Finding):Finding {
  const original=typeof input.text==='string' ? input.text.trim().replace(/\r\n?/g,'\n') : '';
  const result:Finding={};
  for (const field of ['postUrl','mediaUrl','postDate','extractedAt','medium','title','company','commune','contact','requirements','deadline']) {
    result[field]=literal(input[field],field==='postUrl'||field==='mediaUrl'?4000:field==='requirements'?1000:600);
  }
  const previous=Number(input.textOriginalLength);
  const originalLength=Number.isSafeInteger(previous) && previous>=original.length ? previous : original.length;
  return { ...result,text:original.slice(0,6000),textTruncated:input.textTruncated===true || originalLength>6000,textOriginalLength:originalLength };
}

export function originalSocialDate(post:Finding):string {
  const value=post.date_posted ?? post.datePosted ?? post.published_at ?? post.datetime ?? post.date;
  const numeric=typeof value==='number' ? value : typeof value==='string' && /^\d{10}(?:\d{3})?$/.test(value) ? Number(value) : null;
  if (numeric!==null && Number.isFinite(numeric)) {
    const stamp=numeric<100000000000 ? numeric*1000 : numeric;
    const date=new Date(stamp);
    return date.getUTCFullYear()>=2000 && date.getUTCFullYear()<2100 ? date.toISOString() : '';
  }
  return socialSourceDate(value) || '';
}

export function captionSocialFinding(post:Finding, now=Date.now()):Finding | null {
  const text=[post.content,post.caption,post.message,post.text,post.description].find(value => typeof value==='string' && value.trim()) as string | undefined || '';
  const url=literal(post.post_url || post.url,4000);
  if (!specificSocialPost(url) || !/se necesita|se busca|se requiere|buscamos|vacante|oferta laboral|enviar (?:cv|curr[ií]culum)|contrata/i.test(text)) return null;
  const field=(pattern:RegExp)=>text.match(pattern)?.[1]?.trim() || '';
  const title=field(/(?:^|\n)\s*(?:cargo|puesto|se necesita|se busca|se requiere|buscamos)\s*[:\-]?\s*([^\n]{3,180})/i) || text.split('\n')[0].trim().slice(0,180);
  const company=field(/(?:^|\n)\s*(?:empresa|empleador)\s*[:\-]\s*([^\n]{3,180})/i);
  const commune=field(/(?:lugar de trabajo|ubicaci[oó]n de (?:la )?faena|faena en|trabajo en)\s*[:\-]?\s*([^\n]{3,180})/i);
  const contact=text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,15}/i)?.[0] ||
    text.match(/(?<!\d)(?:\+?56[\s-]*)?(?:9(?:[\s-]*\d){8}|(?:43|45)(?:[\s-]*\d){7})(?!\d)/)?.[0] || '';
  const deadline=field(/(?:postulaciones? hasta|fecha l[ií]mite|cierre)\s*[:\-]?\s*([^\n]{3,150})/i);
  return preservedSocialFinding({ postUrl:url,postDate:originalSocialDate(post),extractedAt:new Date(now).toISOString(),
    medium:'text',text,title,company,commune,contact,deadline });
}

// OCR and caption are complementary evidence owned by one original post.
// A poster without a date/contact must retain those literal caption fields.
export function socialPosterFinding(post:Finding, poster:Finding, now=Date.now()):Finding | null {
  const postUrl=literal(post.post_url || post.url,4000);
  if (!specificSocialPost(postUrl) || poster.postUrl && !sameSocialPost(postUrl,String(poster.postUrl))) return null;
  const caption=[post.content,post.caption,post.message,post.text,post.description]
    .find(value=>typeof value==='string' && value.trim()) as string | undefined || '';
  const imageText=typeof poster.text==='string' ? poster.text.trim() : '';
  const parts=[caption.trim() ? '[TEXTO DE LA PUBLICACIÓN]\n'+caption.trim() : '',
    imageText ? '[TEXTO DEL AFICHE]\n'+imageText : ''].filter(Boolean);
  const text=parts.join('\n\n');
  const statedLength=Number(poster.textOriginalLength);
  const omitted=Number.isSafeInteger(statedLength) && statedLength>imageText.length ? statedLength-imageText.length : 0;
  const captionFields=captionSocialFinding(post,now);
  const captionCompany=caption.match(/(?:^|\n)\s*(?:empresa|empleador)\s*[:\-]\s*([^\n]{3,180})/i)?.[1]?.trim() || '';
  return preservedSocialFinding({ ...poster,postUrl,postDate:originalSocialDate(post),medium:'image',
    extractedAt:new Date(now).toISOString(),title:literal(poster.title) || captionFields?.title,
    company:literal(poster.company) || captionFields?.company || captionCompany,
    text,textOriginalLength:text.length+omitted,textTruncated:poster.textTruncated===true || omitted>0 });
}

function specificSocialPost(value:string) {
  try {
    const url=new URL(value);
    if (url.protocol!=='https:' || url.username || url.password || url.port) return false;
    const host=url.hostname.replace(/^(www\.|m\.)/,'');
    if ([...url.searchParams.keys()].some(key=>/^(access_token|token|api_key|apikey)$/i.test(key))) return false;
    return host==='instagram.com' ? /^\/(?:p|reel)\/[^/]+\/?$/.test(url.pathname) :
      host==='facebook.com' && (/\/(?:posts|permalink)\/[^/]+/.test(url.pathname) || /^\/(?:photo(?:\.php)?|permalink\.php)$/.test(url.pathname) && Boolean(url.searchParams.get('fbid')||url.searchParams.get('story_fbid')));
  } catch { return false; }
}

export function sameSocialPost(left:string, right:string) {
  const identity=(value:string)=>{
    if (!specificSocialPost(value)) return null;
    const url=new URL(value), host=url.hostname.replace(/^(www\.|m\.)/,'');
    const match=url.pathname.match(/\/(posts|permalink|p|reel)\/([^/]+)/);
    if (match) return host+':'+match[1]+':'+match[2];
    return host+':photo:'+String(url.searchParams.get('fbid') || url.searchParams.get('story_fbid'));
  };
  const expected=identity(left);
  return expected!==null && expected===identity(right);
}

function supportedContact(text:string, claimed:string) {
  const compact=text.toLowerCase().replace(/\s+/g,'');
  const emails=text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,15}/gi) ?? [];
  const phones=text.match(/(?<!\d)(?:\+?56[\s-]*)?(?:9(?:[\s-]*\d){8}|(?:43|45)(?:[\s-]*\d){7})(?!\d)/g) ?? [];
  const contacts=[...emails,...phones];
  const claim=claimed.replace(/\D/g,'');
  return contacts.find(contact=>compact.includes(claimed.toLowerCase().replace(/\s+/g,'')) && claimed.toLowerCase().includes(contact.toLowerCase()) ||
    claim.length>=9 && contact.replace(/\D/g,'')===claim) ?? contacts[0] ?? '';
}

export function prepareSocialEvidence(input:Finding, capturedAt:string, places:(text:string)=>string[], now=Date.now()) {
  const row=preservedSocialFinding(input);
  const text=literal(row.text,6000), postUrl=literal(row.postUrl,4000);
  const claimCompany=literal(row.company);
  const company=claimCompany && fold(text).includes(fold(claimCompany)) ? claimCompany : '';
  const contact=supportedContact(text,literal(row.contact,600));
  const workplaceMatch=text.match(/(?:lugar de trabajo|ubicaci[oó]n de (?:la )?faena|faena en|trabajo en|para trabajar en)\s*[:\-]?\s*([^\n;.]{2,160})/i);
  const workplace=workplaceMatch?.[1].split(/\b(?:empresa|contacto|enviar cv|plazo|requisitos)\s*:/i)[0].trim() ?? '';
  const workCommunes=places(workplace);
  const published=socialSourceDate(row.postDate);
  const deadlineMatch=text.match(/(?:fecha l[ií]mite|fecha de cierre|plazo(?: de postulaci[oó]n)?|postulaciones? hasta|postular hasta|recepci[oó]n de (?:cv|curr[ií]culum) hasta)\s*[:\-]?\s*([^\n;.]{8,100})/i);
  const deadlineText=deadlineMatch?.[1].trim() ?? '';
  const dateInDeadline=deadlineText.match(/20\d{2}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]20\d{2}|\d{1,2}\s+(?:de\s+)?[a-záéíóú]+\s+(?:de\s+)?20\d{2}/i)?.[0];
  const deadline=socialSourceDate(dateInDeadline,true);
  const claimedDeadline=socialSourceDate(row.deadline,true);
  const missing:string[]=[];
  if (row.textTruncated===true) missing.push('transcripción completa');
  if (!specificSocialPost(postUrl)) missing.push('enlace específico de la publicación');
  if (!literal(row.title) || !fold(text).includes(fold(literal(row.title)))) missing.push('cargo respaldado por el texto');
  if (!company) missing.push('empresa ofertante');
  if (workCommunes.length!==1) missing.push('lugar real de trabajo inequívoco');
  if (!contact) missing.push('contacto literal');
  if (!published || Date.parse(published)>now || now-Date.parse(published)>45*86400000) missing.push('fecha original reciente');
  if (!deadline || Date.parse(deadline)<=now || published && Date.parse(deadline)<=Date.parse(published) || claimedDeadline && deadline!==claimedDeadline) missing.push('plazo vigente explícito y coherente');
  if (!/(?:oferta laboral|se necesita|se busca|se requiere|buscamos|vacante|enviar cv|contrata)/i.test(text)) missing.push('vacante concreta');
  const evidence:SocialEvidence={ version:'local-social-evidence-v1',text,textTruncated:row.textTruncated===true,
    originalLength:Number(row.textOriginalLength),postUrl,postDate:published,capturedAt,title:literal(row.title),
    company,workplace,contact,deadline,missing };
  return { row,evidence,workCommunes,company,contact,workplace,published,deadline,ready:missing.length===0 };
}

export function socialVerificationBlock(record:{ socialEvidence?:SocialEvidence }, places:(text:string)=>string[], now=Date.now()):string | null {
  const evidence=record.socialEvidence;
  if (!evidence || evidence.version!=='local-social-evidence-v1') return 'Falta la transcripción original para comprobar empresa, lugar real, contacto y plazo del aviso social.';
  const captured=Date.parse(evidence.capturedAt);
  if (!Number.isFinite(captured) || captured>now || now-captured>86400000) return 'La evidencia social necesita una lectura reciente de la publicación original.';
  const checked=prepareSocialEvidence({ text:evidence.text,textTruncated:evidence.textTruncated,textOriginalLength:evidence.originalLength,
    title:evidence.title,company:evidence.company,contact:evidence.contact,postUrl:evidence.postUrl,
    postDate:evidence.postDate,deadline:evidence.deadline },evidence.capturedAt,places,now);
  return checked.evidence.missing.length ? 'Falta confirmar: '+checked.evidence.missing.join(', ')+'.' : null;
}
