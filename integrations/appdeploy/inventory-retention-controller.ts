// Exact edited controller excerpts; test input, not a backend entrypoint.
function projectFeedListing(value:Record<string, unknown> & { id:string }) {
  const item=value as unknown as ListingRecord & { id:string };
  if (item.kind!=='job_offer') return isCurrentlyActive(item) ? publicRecord(item) : null;
  if (offerRetentionReason(value)) return null;
  if (publicJobExclusion(value)) return null;
  if (!item.workCommunes?.some(commune=>PILOT.some(target=>normalizeText(target).toLocaleLowerCase('es-CL')===normalizeText(commune).toLocaleLowerCase('es-CL')))) return null;
  const evidence=[item.title,item.company,item.note,item.url,item.sourceDomain].filter(Boolean).join(' ');
  if (unsafeContentReason(evidence,item.url)) return null;
  const published=parseDiscoveryDate(item.sourcePublishedAt || item.date);
  if (!published || published>Date.now()) return null;
  return { ...publicRecord(item),revalidationDue:offerRecheckDue(value) };
}

function feedRefreshAt(item:Record<string, unknown>) {
  const now=Date.now(),deadline=confirmedOfferDeadline(item);
  const candidates:number[]=[];
  if (deadline!==null) candidates.push(deadline+1);
  const checked=Date.parse(String(item.lastVerifiedAt || item.externalVerifiedAt || item.verifiedAt || ''));
  if (Number.isFinite(checked)) candidates.push(checked+86400000+1);
  const first=Date.parse(String(item.firstPublishedAt || item.createdAt || ''));
  if (Number.isFinite(first)) candidates.push(first+86400000+1,first+7*86400000+1);
  const upcoming=candidates.filter(time=>Number.isFinite(time)&&time>now);
  return upcoming.length ? Math.min(...upcoming) : null;
}

async function verifyPendingOffer(item:ListingRecord & { id:string }) {
  const checkedAt = new Date().toISOString();
  const { id, ...record } = item;
  const pending = (reason:string, method='Revisión automática') => ({ id, record:{ ...record, review:true, verified:false, status:'Por confirmar', verificationCheckedAt:checkedAt, verificationReason:reason, verificationMethod:method, verificationVersion:VERIFICATION_VERSION } });
  const inconclusive = (reason:string, method='Revalidación técnica') => {
    const canKeep = record.verified === true && record.review === false && Boolean(record.verifiedAt) && Boolean(record.sourcePublishedAt) && !offerRetentionReason(record as unknown as Record<string,unknown>);
    if (canKeep) return { id, record:{ ...record, active:true, review:false, verified:true, status:'Verificada', verificationCheckedAt:checkedAt, verificationReason:reason, verificationMethod:method, verificationVersion:VERIFICATION_VERSION } };
    return pending(reason, method);
  };
  const reject = (reason:string) => ({ id, record:{ ...record, review:false, verified:false, active:false, status:'Descartada', verificationCheckedAt:checkedAt, verificationReason:reason, verificationMethod:'Revisión automática', verificationVersion:VERIFICATION_VERSION } });
  const verify = (reason:string, method:string, publishedAt:string) => ({ id, record:{ ...record, area:/por confirmar|señal/i.test(record.area) ? 'Oferta laboral verificada' : record.area, date:sourceDateLabel(publishedAt), sourcePublishedAt:publishedAt, review:false, verified:true, active:true, status:'Verificada', verificationCheckedAt:checkedAt, verificationReason:reason, verificationMethod:method, verificationVersion:VERIFICATION_VERSION, verifiedAt:record.verifiedAt || record.firstVerifiedAt || checkedAt, firstVerifiedAt:record.firstVerifiedAt || record.verifiedAt || checkedAt, lastVerifiedAt:checkedAt } });

  const qualityReason=publicJobExclusion(record as unknown as Record<string,unknown>);
  if (qualityReason) return pending('Procedencia o ubicación por revisar: '+qualityReason,'Validación de fuente individual');
  const safetyEvidence = [record.title, record.company, record.note, record.source, record.sourceDomain, record.url].filter(Boolean).join(' ');
  const unsafeReason = unsafeContentReason(safetyEvidence, record.url);
  if (unsafeReason) return reject(unsafeReason);
  if (!isLikelyJobOpportunity(safetyEvidence, record.url)) return reject('La publicación no corresponde a una oferta de trabajo concreta.');
  const publicAdapter=record.url ? publicSourceAdapter(record.url) : null;
  if (publicAdapter) {
    const page=await fetchPublicPage(record.url!,record.url!);
    const checked=page.error ? { status:'pending',reason:page.error } as PublicVerification : evaluatePublicJob(record.url!,page.raw,page.url,page.status);
    if (checked.status==='rejected') return reject(checked.reason);
    if (checked.status!=='verified') return inconclusive(checked.reason,'Fuente pública · revalidación pendiente');
    return { id,record:{ ...record,...verifiedPublicRecord(checked) as unknown as ListingRecord,
      date:sourceDateLabel(checked.source_published_at!),createdAt:record.createdAt,
      firstVerifiedAt:record.firstVerifiedAt || record.verifiedAt || checkedAt,
      verificationVersion:VERIFICATION_VERSION,verificationCheckedAt:checkedAt } };
  }
  const sourceDateEvidence = record.sourcePublishedAt || record.date || '';
  if (!record.verifiedAt && parseDiscoveryDate(sourceDateEvidence) && staleDiscoveryDate(sourceDateEvidence)) return reject('La publicación supera la antigüedad máxima de 45 días.');
  if (record.expiresAt && Date.parse(record.expiresAt) < Date.now()) return reject('La fecha de postulación o vigencia ya terminó.');
  const targets = verificationTargets(record);
  if (!targets.length) return pending('Falta confirmar una comuna objetivo como lugar de trabajo o reclutamiento.');
  const visualEvidence = Boolean(record.socialEvidence) || /radar-social-(?:visual|text)/.test(record.discoveredBy || '');
  if (visualEvidence) {
    const blocked=socialVerificationBlock(record,extractCommunes);
    if (blocked) return pending(blocked,'Afiche o publicación social · evidencia incompleta');
  }
  if (!record.url) return pending(record.evidenceImagePath ? 'El aviso fotográfico es útil, pero todavía falta una fuente pública o confirmación de vigencia.' : 'Falta un enlace público específico para confirmar la publicación.');
  if (!isSpecificJobResult(record.title, record.url)) {
    const trusted = sourceVerificationTier(verificationHost(record.url, record.sourceDomain));
    const publishedTs = parseDiscoveryDate(record.sourcePublishedAt || '');
    if ((trusted === 'official' || trusted === 'portal') && typeof publishedTs === 'number' && !staleDiscoveryDate(record.sourcePublishedAt || '') && Boolean(record.title) && Boolean(record.note) && Boolean(record.contact) && moderate(safetyEvidence)) return verify('Aviso accionable en fuente institucional o portal reconocido; fecha, comuna y contacto documentados, aunque no exista página individual.', 'Fuente reconocida · evidencia estructurada', new Date(publishedTs).toISOString());
    return pending('El enlace apunta a una página general o listado, no a una publicación individual.');
  }

  const host = verificationHost(record.url, record.sourceDomain);
  const tier = sourceVerificationTier(host);
  const indexedEvidence = [record.title, record.note, record.url].filter(Boolean).join(' ');
  const indexedTarget = hasTargetEvidence(indexedEvidence, record);
  const indexedJob = isLikelyJobOpportunity(indexedEvidence, record.url) && moderate(indexedEvidence);
  const ageMs = Date.now() - Date.parse(record.createdAt);
  const verifyTrustedIndexed = () => {
    if ((tier !== 'official' && tier !== 'portal') || !indexedJob || !indexedTarget || !record.sourcePublishedAt || !record.url) return null;
    const publishedTs = parseDiscoveryDate(record.sourcePublishedAt);
    if (!publishedTs) return null;
    const publishedAt = new Date(publishedTs).toISOString();
    if (staleDiscoveryDate(publishedAt)) return null;
    const sourceType = tier === 'official' ? 'Fuente oficial' : 'Portal laboral';
    return verify(`${sourceType} temporalmente limitada para lectura automática; URL específica, cargo, comuna y fecha reciente ya estaban confirmados por evidencia indexada del hallazgo.`, `${sourceType} · evidencia indexada reforzada`, publishedAt);
  };
  let scrapeFallback: Promise<ReturnType<typeof verify> | ReturnType<typeof reject> | null> | null = null;
  const verifyViaScrape = () => {
    if (visualEvidence) return Promise.resolve(null);
    if (scrapeFallback) return scrapeFallback;
    scrapeFallback = (async () => {
      try {
        const scraped = await ai.scrape({ url:record.url! });
        if (scraped.status === 404 || scraped.status === 410) return reject('La publicación original ya no está disponible en la fuente.');
        if (scraped.status >= 400 || !scraped.text) return null;
        const scrapeText = [scraped.title, scraped.text, record.url].filter(Boolean).join(' ').slice(0, 220000);
        if (unavailableSourceSignal(scrapeText)) return reject('La publicación original ya no está disponible en la fuente.');
        if (expiredSourceSignal(scrapeText)) return reject('La fuente indica que la oferta o postulación está cerrada o vencida.');
        const scrapeUnsafeReason = unsafeContentReason(scrapeText, record.url);
        if (scrapeUnsafeReason) return reject(scrapeUnsafeReason);
        if (!moderate(scrapeText)) return reject('La publicación contiene una señal de riesgo o una condición incompatible con las reglas de Trabajo Cerca.');
        if (!isLikelyJobOpportunity(scrapeText, record.url)) return null;
        if (!hasTargetEvidence(scrapeText, record)) return null;
        const publishedTs = parseDiscoveryDate(record.sourcePublishedAt || record.date) ?? parseDiscoveryDate(scrapeText.slice(0, 70000));
        if (!publishedTs) return null;
        const publishedAt = new Date(publishedTs).toISOString();
        if (staleDiscoveryDate(publishedAt)) return reject('La publicación supera la antigüedad máxima de 45 días.');
        if (tier === 'official') return verify('Fuente pública/oficial comprobada mediante extracción reforzada; cargo, comuna y fecha reciente confirmados.', 'Fuente oficial · lectura reforzada', publishedAt);
        if (tier === 'portal') return verify('Portal laboral reconocido comprobado mediante extracción reforzada; cargo, comuna y fecha reciente confirmados.', 'Portal laboral · lectura reforzada', publishedAt);
        if (tier === 'social' && ageMs <= DISCOVERY_MAX_AGE_DAYS * 86400000) return verify('Publicación social pública comprobada mediante extracción reforzada; trabajo, comuna y fecha reciente confirmados.', 'Publicación social · lectura reforzada', publishedAt);
        if (tier === 'secondary') return null;
        return verify('Página pública específica comprobada mediante extracción reforzada; trabajo, comuna y fecha reciente confirmados.', 'Publicación pública · lectura reforzada', publishedAt);
      } catch {
        return null;
      }
    })();
    return scrapeFallback;
  };

  try {
    const response = await fetch(record.url, {
      headers:{ 'user-agent':'Mozilla/5.0 TrabajoCercaVerifier/1.0', 'accept':'text/html,application/xhtml+xml' },
      redirect:'follow',
      signal:AbortSignal.timeout(4000),
    });
    if (response.status === 404 || response.status === 410) return reject('La publicación original ya no está disponible en la fuente.');
    if (response.status === 401 || response.status === 403 || response.status === 429) {
      const reinforced = await verifyViaScrape();
      return reinforced ?? verifyTrustedIndexed() ?? inconclusive('La fuente bloquea temporalmente la comprobación automática y la lectura reforzada tampoco pudo confirmarla.', 'Revalidación temporalmente bloqueada');
    }
    if (!response.ok) {
      const reinforced = await verifyViaScrape();
      return reinforced ?? verifyTrustedIndexed() ?? inconclusive('La fuente respondió HTTP ' + response.status + ' y la lectura reforzada tampoco pudo confirmarla.', 'Revalidación temporalmente no disponible');
    }
    const finalUrl = response.url || record.url;
    if (visualEvidence && !sameSocialPost(record.url,finalUrl)) return pending('La fuente redirigió a otra publicación; falta comprobar el aviso original.','Identidad social no confirmada');
    if (!isSpecificJobResult(record.title, finalUrl)) {
      const reinforced = await verifyViaScrape();
      return reinforced ?? reject('El enlace original redirige a una página general o ya no conserva la publicación individual.');
    }

    const raw = (await response.text()).slice(0, 600000);
    const pageText = cleanHtml(raw).slice(0, 180000);
    if (unavailableSourceSignal(pageText)) return reject('La publicación original ya no está disponible en la fuente.');
    if (expiredSourceSignal(pageText)) return reject('La fuente indica que la oferta o postulación está cerrada o vencida.');
    const sourceOnlyEvidence = [pageText, raw.slice(0, 180000), finalUrl].filter(Boolean).join(' ');
    const pageUnsafeReason = unsafeContentReason(sourceOnlyEvidence, record.url);
    if (pageUnsafeReason) return reject(pageUnsafeReason);
    if (!moderate(sourceOnlyEvidence)) return reject('La publicación contiene una señal de riesgo o una condición incompatible con las reglas de Trabajo Cerca.');
    const pageJob = structuredJobSignal(raw) || isLikelyJobOpportunity(sourceOnlyEvidence, finalUrl);
    const targetMatch = hasTargetEvidence(sourceOnlyEvidence, record);
    if (!pageJob) {
      const reinforced = await verifyViaScrape();
      if (reinforced) return reinforced;
      const indexedFallback = verifyTrustedIndexed();
      if (indexedFallback) return indexedFallback;
      if (tier === 'portal' || tier === 'social') return inconclusive('La fuente abre, pero ni la vista técnica ni la lectura reforzada permiten confirmar el cargo en esta pasada.', 'Revalidación técnica limitada');
      return reject('La fuente actual no confirma una oferta de trabajo concreta.');
    }
    if (!targetMatch) {
      const reinforced = await verifyViaScrape();
      if (reinforced) return reinforced;
      const indexedFallback = verifyTrustedIndexed();
      if (indexedFallback) return indexedFallback;
      if (tier === 'portal' || tier === 'social') return inconclusive('La fuente abre, pero ni la vista técnica ni la lectura reforzada permiten confirmar la ubicación en esta pasada.', 'Revalidación técnica limitada');
      return reject('La fuente original actual no confirma una comuna objetivo como lugar real de trabajo o reclutamiento.');
    }
    const publishedTs = parseDiscoveryDate(record.sourcePublishedAt || record.date) ?? parseDiscoveryDate(sourceOnlyEvidence.slice(0, 50000));
    if (!publishedTs) {
      const reinforced = await verifyViaScrape();
      return reinforced ?? verifyTrustedIndexed() ?? inconclusive('La oferta parece laboral y territorialmente correcta, pero la fecha no pudo releerse ni con la lectura reforzada.', 'Revalidación de fecha limitada');
    }
    const publishedAt = new Date(publishedTs).toISOString();
    if (staleDiscoveryDate(publishedAt)) return reject('La publicación supera la antigüedad máxima de 45 días.');

    if (tier === 'official') return verify('Fuente pública/oficial accesible; cargo, comuna y fecha reciente confirmados.', 'Fuente oficial contrastada', publishedAt);
    if (tier === 'portal') return verify('Portal laboral reconocido accesible; cargo, comuna y fecha reciente confirmados.', 'Portal laboral contrastado', publishedAt);
    if (tier === 'social' && ageMs <= DISCOVERY_MAX_AGE_DAYS * 86400000) return verify('Publicación social pública y específica accesible; trabajo, comuna y fecha reciente confirmados.', 'Publicación social pública contrastada', publishedAt);
    if (tier === 'secondary') return pending('La publicación existe en un agregador secundario; falta contrastar la fuente original antes de marcarla como verificada.');
    if (pageText.length >= 300 && indexedJob) return verify('Página pública específica accesible; trabajo, comuna y fecha reciente confirmados.', 'Publicación pública contrastada', publishedAt);
    return pending('La publicación abre, pero la evidencia disponible todavía no alcanza el estándar de verificación.');
  } catch {
    const reinforced = await verifyViaScrape();
    return reinforced ?? verifyTrustedIndexed() ?? inconclusive('No fue posible comprobar la fuente original ni mediante la lectura reforzada en esta pasada.', 'Revalidación temporalmente no disponible');
  }
}

type RadarPageCursor = { nextToken?:string | null; updatedAt?:string };
