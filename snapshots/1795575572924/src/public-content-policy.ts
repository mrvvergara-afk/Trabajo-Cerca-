/**
 * Public-facing copy only. The original source, URL, provenance and engine
 * evidence remain intact in backend records and the admin diagnostics.
 */
export function publicSourceLabel(source?:string|null):string {
  const text=(source||'').trim().replace(/\s+/g,' ');
  if(!text)return 'Fuente externa';
  // No URL, hostname, tracking suffix, technical provider label on cards.
  if(/https?:\/\/|(?:^|\s)www\.|[a-z0-9-]+\.(?:cl|com|org|net)(?:\/|\b)/i.test(text))return 'Fuente externa';
  if(/^(?:fuente externa|fuente p[úu]blica|portal de empleos?|portal laboral|fuente no informada|fuente desconocida)\b/i.test(text))
    return 'Fuente externa';
  // Official named publishers can help applicants identify who published it.
  const named=/^(?:(?:municipalidad|ilustre municipalidad)(?: de)?\s+[\p{L}0-9 .,'-]+|OMIL\s+[\p{L}0-9 .,'-]+|Hospital\s+[\p{L}0-9 .,'-]+|Servicio de Salud\s+[\p{L}0-9 .,'-]+|CONAF|Empleos P[úu]blicos|Bolsa Nacional de Empleo)$/iu;
  if(text.length<=53&&named.test(text)&&!/motor|pipeline|ocr|crawler|adapter/i.test(text))return text;
  return 'Fuente externa';
}
/** Don't present scanning, verification and batch-routing notes as job duties. */
export function publicOfferDetail(note?:string|null):string|null {
  const text=(note||'').trim().replace(/\s+/g,' ');
  if(!text||/^(?:sin descripci[oó]n adicional|n\/a|no informad[ao])\.?$/i.test(text))return null;
  if(/^(?:(?:motor\s*(?:[ABCD]|chat\s*gpt|gemini)|rastreador|radar interno|evidencia de fuente|origen chat\s*gpt|verificaci[oó]n t[ée]cnica|lector documental)\s*[:：—-])/i.test(text))return null;
  if(/\b(?:deduplicaci[oó]n|pipeline|catalog[oa] p[úu]blico|proyecci[oó]n p[úu]blica|batch(?:_id)?|revisi[oó]n express|fecha original, empresa, lugar de trabajo|publicaci[oó]n de hoy o ayer|ficha individual, fecha original)\b/i.test(text))return null;
  return text;
}
