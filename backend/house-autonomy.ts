import { createHash, randomUUID } from 'node:crypto';
import { db, error, isAppDatabaseError, json, storage, type RouterContext } from '@appdeploy/sdk';
import { METRICOOL_TARGET, metricoolBridgeKey, metricoolMetrics } from './house-metricool';
import {
  BANK_BRANCH, BANK_URL, HASH, MAX_IMAGE_BYTES, SOCIAL_BRAND,
  editorialPeriod, editorialPlan, validateBank, validatePublicManifest,
  type BankAsset, type InstitutionalManifest,
} from '../shared/house-autonomy';

const STATE = 'growth_house_autonomy';
const VERSIONS = 'growth_house_versions';
const CHECK_MS = 6 * 3_600_000;
const LEASE_MS = 90_000;
const BACKUP_LIMIT = 16;
const ARCHIVE_URL = BANK_URL.replace('/bank/', '/archive/');
const APP = 'https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/';
const sha = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const pathFor = (hash: string) => 'institutional-bank/' + hash + '.webp';

type SocialPlan = {
  id: string;
  brandId: typeof SOCIAL_BRAND;
  networks: ['facebook', 'instagram'];
  imageUrl: string;
  caption: string;
  landingUrl: string;
  earliestDay: string;
};
type Release = {
  manifest: InstitutionalManifest;
  bankHash: string;
  media: BankAsset['web'][];
  campaign: SocialPlan;
};
type Pending = { id: string; attempts: number; nextAt: number };
type State = {
  id: 'current';
  generation: string;
  leaseUntil: number;
  nextAt: number;
  active: Release | null;
  previous: Release | null;
  pending: Pending[];
  checkedAt: string | null;
  exception: 'banco_no_verificado' | 'respaldo_pendiente' | 'sin_version_valida' | null;
  pausedPeriod?: string;
};

async function readBounded(url: string, maximum: number, optional = false) {
  const response = await fetch(url, {
    redirect: 'error', signal: AbortSignal.timeout(6000),
    headers: { Accept: '*/*' },
  });
  if (optional && response.status === 404) {
    await response.body?.cancel();
    return null;
  }
  if (!response.ok || !response.body || Number(response.headers.get('content-length') ?? 0) > maximum) {
    await response.body?.cancel();
    throw Error('origen_no_disponible');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maximum) throw Error('archivo_fuera_de_limite');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks, size);
}
function webpSize(bytes: Buffer) {
  if (bytes.length < 30 || bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 12) !== 'WEBP' || bytes.readUInt32LE(4) + 8 !== bytes.length)
    throw Error('webp_invalido');
  // The offline encoder emits a single static VP8 frame. Reject other container structures.
  const payloadSize = bytes.readUInt32LE(16);
  if (bytes.toString('ascii', 12, 16) !== 'VP8 ' ||
    20 + payloadSize + (payloadSize % 2) !== bytes.length ||
    (bytes[20] & 1) || bytes.readUIntBE(23, 3) !== 0x9d012a)
    throw Error('webp_invalido');
  return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
}
export function verifyWebp(bytes: Buffer, media: BankAsset['web']) {
  if (bytes.length !== media.bytes || bytes.length > MAX_IMAGE_BYTES || sha(bytes) !== media.sha256)
    throw Error('huella_de_imagen_invalida');
  const [width, height] = webpSize(bytes);
  if (width !== media.width || height !== media.height) throw Error('dimensiones_de_imagen_invalidas');
}
function verifySocial(bytes: Buffer, media: BankAsset['social']) {
  if (bytes.length !== media.bytes || sha(bytes) !== media.sha256 || !bytes.subarray(0, 3).equals(Buffer.from([255,216,255])))
    throw Error('imagen_social_invalida');
}
async function mirror(media: BankAsset['web']) {
  const path = pathFor(media.sha256);
  const [stored] = await storage.read([path]);
  if (stored?.content) {
    try {
      verifyWebp(Buffer.from(stored.content, 'base64'), media);
      return;
    } catch {/* Recover the immutable asset from its source. */}
  }
  const original = await readBounded(BANK_URL + media.sha256 + '.webp', MAX_IMAGE_BYTES);
  if (!original) throw Error('imagen_no_disponible');
  verifyWebp(original, media);
  const [ok] = await storage.write([{ path, content: original.toString('base64'), contentType: 'image/webp' }]);
  if (!ok) throw Error('imagen_no_guardada');
  const [confirmed] = await storage.read([path]);
  verifyWebp(Buffer.from(confirmed?.content || '', 'base64'), media);
}
async function available(release: Release | null) {
  if (!release || !validatePublicManifest(release.manifest)) return false;
  try {
    for (let i = 0; i < release.media.length; i += 2)
      await Promise.all(release.media.slice(i, i + 2).map(mirror));
    return true;
  } catch {
    return false;
  }
}
async function buildRelease(bank: Buffer, now: Date): Promise<Release> {
  const p = editorialPlan(validateBank(JSON.parse(bank.toString('utf8'))), now);
  const slides = p.slides.map(({ slot, asset, title, message, mobile }) => ({
    slot, imageUrl: '/api/growth/institutional/media/' + asset.web.sha256,
    alt: asset.alt, title, message, mobile,
  }));
  const body = { schema: 1 as const, period: p.period, territory: p.territory, season: p.season, slides };
  const bankHash = sha(bank);
  const manifest = { ...body, revision: sha(JSON.stringify(body) + bankHash) };
  const id = 'tc-organico-' + p.period;
  const url = new URL(APP);
  url.search = new URLSearchParams({ utm_source: 'metricool', utm_medium: 'organic_social', utm_campaign: id }).toString();
  const campaign: SocialPlan = {
    id, brandId: SOCIAL_BRAND, networks: ['facebook', 'instagram'],
    imageUrl: BANK_URL + p.campaign.asset.social.sha256 + '.jpg',
    caption: p.campaign.title + '. ' + p.campaign.message + '\n\nImagen ilustrativa generada con IA.\n#TrabajoCerca #' + id.replace(/-/g, ''),
    landingUrl: url.href, earliestDay: p.period,
  };
  const release = { manifest, bankHash, media: p.slides.map(s => s.asset.web), campaign };
  if (!await available(release)) throw Error('banco_no_disponible');
  const social = await readBounded(campaign.imageUrl, MAX_IMAGE_BYTES);
  if (!social) throw Error('imagen_social_invalida');
  verifySocial(social, p.campaign.asset.social);
  return release;
}

function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => [key, normalized(item)]));
}
const emptyState = (): State => ({
  id: 'current', generation: randomUUID(), leaseUntil: 0, nextAt: 0,
  active: null, previous: null, pending: [], checkedAt: null, exception: null,
});
async function state() {
  const [row] = await db.get<State>(STATE, ['current'], { consistent: true });
  return row;
}
async function lease(now: number, force: boolean) {
  let row = await state();
  if (!row) {
    await db.tx.add(STATE, [emptyState()]);
    row = await state();
  }
  if (!row || row.leaseUntil > now || (!force && row.nextAt > now)) return null;
  const updated = { ...row, generation: randomUUID(), leaseUntil: now + LEASE_MS };
  const [taken] = await db.tx.update(STATE, [{
    id: 'current', if: { generation: row.generation },
    record: { generation: updated.generation, leaseUntil: updated.leaseUntil },
  }], { patch: true });
  return taken ? updated : null;
}
function privateResult(value: unknown) {
  const response = json(value);
  response.headers['Cache-Control'] = 'private, no-store';
  return response;
}
function publicResult(value: unknown) {
  const response = json(value);
  response.headers['Cache-Control'] = 'public, max-age=60, stale-if-error=3600';
  return response;
}
async function reconcileBackups(pending: Pending[], now: number) {
  const next = [...pending];
  const due = next.filter(item => item.nextAt <= now).slice(0, 4);
  for (const item of due) {
    try {
      const bytes = await readBounded(ARCHIVE_URL + item.id + '.json', 24_000, true);
      const [stored] = await db.get<{ release: Release }>(VERSIONS, [item.id], { consistent: true });
      if (!stored) throw Error('version_ausente');
      if (bytes && JSON.stringify(normalized(JSON.parse(bytes.toString('utf8')))) === JSON.stringify(normalized(stored.release))) {
        next.splice(next.indexOf(item), 1);
        continue;
      }
    } catch {/* Preserve the durable job for another attempt. */}
    const attempts = item.attempts + 1;
    next[next.indexOf(item)] = {
      ...item, attempts,
      nextAt: now + Math.min(48, 2 ** Math.min(attempts, 8)) * 3_600_000,
    };
  }
  return next;
}
async function writeState(locked: State, record: State, newRelease?: Release) {
  const generation = randomUUID();
  const update = () => db.tx.update(STATE, [{
    id: 'current', if: { generation: locked.generation }, record: { ...record, generation, leaseUntil: 0 },
  }], { patch: true });
  if (!newRelease) {
    const [changed] = await update();
    return changed;
  }
  const id = newRelease.manifest.revision;
  try {
    await db.transact([db.tx.add(VERSIONS, [{ id, release: newRelease }]), update()]);
    return true;
  } catch (cause) {
    if (!isAppDatabaseError(cause)) throw cause;
    if (cause.code === 'AppDatabaseUnknownOutcome') {
      return (await state())?.generation === generation;
    }
    if (cause.code === 'AppDatabaseConflict' || cause.code === 'AppDatabaseConditionFailed' ||
      cause.code === 'AppDatabaseDuplicateId') return false;
    throw cause;
  }
}
export async function refreshInstitutional(force = false, now = Date.now()) {
  const locked = await lease(now, force);
  if (!locked) return 'sin_cambios';
  const next: State = {
    ...locked, checkedAt: new Date(now).toISOString(), nextAt: now + CHECK_MS,
    pending: await reconcileBackups(locked.pending, now),
  };
  let newRelease: Release | undefined;
  try {
    const bank = await readBounded(BANK_URL + 'index.json', 64_000);
    if (!bank) throw Error('banco_no_disponible');
    const period = editorialPeriod(new Date(now)).period;
    const currentOkay = await available(locked.active);
    if (locked.pausedPeriod === period && currentOkay && !force) {
      // A manual rollback remains active until the next editorial period.
    } else if (!currentOkay || locked.active?.manifest.period !== period || locked.active.bankHash !== sha(bank)) {
      const candidate = await buildRelease(bank, new Date(now));
      const id = candidate.manifest.revision;
      const [known] = await db.get<{ release: Release }>(VERSIONS, [id], { consistent: true });
      if (!known && next.pending.length === BACKUP_LIMIT) throw Error('respaldo_pendiente');
      if (!known) {
        next.pending.push({ id, attempts: 0, nextAt: now });
        newRelease = candidate;
      }
      next.previous = currentOkay && locked.active?.manifest.revision !== id ? locked.active : locked.previous;
      next.active = candidate;
      next.pausedPeriod = undefined;
    }
    next.exception = next.pending.some(item => item.attempts >= 4) ? 'respaldo_pendiente' : null;
  } catch (cause) {
    next.exception = cause instanceof Error && cause.message === 'respaldo_pendiente'
      ? 'respaldo_pendiente' : 'banco_no_verificado';
    if (!await available(locked.active)) {
      next.active = await available(locked.previous) ? locked.previous : null;
      if (!next.active) next.exception = 'sin_version_valida';
    }
  }
  const committed = await writeState(locked, next, newRelease);
  return committed ? next.exception || 'comprobado' : 'concurrente';
}

let publicCache: { until: number; manifest: InstitutionalManifest | null } | null = null;
let publicRead: Promise<InstitutionalManifest | null> | undefined;
export async function publicInstitutional() {
  let manifest = publicCache?.manifest ?? null;
  if (!publicCache || publicCache.until <= Date.now()) {
    publicRead ??= (async () => {
      const current = await state();
      if (!current?.active || current.nextAt <= Date.now()) {
        await refreshInstitutional();
        return validatePublicManifest((await state())?.active?.manifest);
      }
      return validatePublicManifest(current.active.manifest);
    })().catch(() => publicCache?.manifest ?? null).finally(() => { publicRead = undefined; });
    manifest = await publicRead;
    publicCache = { until: Date.now() + (manifest ? 60_000 : 15_000), manifest };
  }
  return publicResult({ manifest });
}

export async function institutionalMedia({ params }: RouterContext) {
  if (!HASH.test(params.hash || '')) return error('Imagen inválida.', 404);
  const [file] = await storage.url([pathFor(params.hash)]);
  const url = file?.url ? new URL(file.url) : null;
  if (!url || url.protocol !== 'https:' || url.username || url.password ||
    !/\.(amazonaws\.com|appdeploy\.ai)$/.test(url.hostname)) return error('Imagen indisponible.', 404);
  return {
    statusCode: 307,
    headers: { Location: url.href, 'Cache-Control': 'public, max-age=300' },
    body: '',
  };
}

export async function institutionalBridge() {
  const [current, analyticsPublicKey] = await Promise.all([state(), metricoolBridgeKey()]);
  return publicResult({
    target: METRICOOL_TARGET, analyticsPublicKey,
    organicEnabled: METRICOOL_TARGET === 'prod',
    plan: current?.active?.campaign ?? null,
  });
}

export async function institutionalArchiveQueue() {
  const current = await state();
  // Only public editorial material is exposed to the GitHub worker.
  const ids = (current?.pending || []).slice(0, 4).map(item => item.id);
  const rows = ids.length ? await db.get<{ id: string; release: Release }>(VERSIONS, ids, { consistent: true }) : [];
  return publicResult({ branch: BANK_BRANCH, releases: rows.flatMap(row => row ? [{ id: row.id, release: row.release }] : []) });
}

export async function institutionalAdmin({ body }: RouterContext) {
  const action = (body as { action?: string; revision?: string } | null)?.action;
  if (action === 'refresh') await refreshInstitutional(true);
  if (action === 'restore') {
    const expected = (body as { revision?: string }).revision;
    if (!expected || !HASH.test(expected)) return error('Versión inválida.', 400);
    const locked = await lease(Date.now(), true);
    if (!locked) return error('Ya se está actualizando el manifiesto.', 409);
    if (locked.active?.manifest.revision !== expected || !locked.previous || !await available(locked.previous)) {
      await writeState(locked, locked);
      return error('La versión anterior no está disponible o la revisión cambió.', 409);
    }
    if (!await writeState(locked, {
      ...locked, active: locked.previous, previous: locked.active,
      pausedPeriod: editorialPeriod(new Date()).period,
    })) return error('La revisión cambió durante la restauración.', 409);
  }
  if (action && action !== 'restore' && action !== 'refresh') return error('Acción inválida.', 400);
  const [row, socialMetrics] = await Promise.all([state(), metricoolMetrics(Boolean(action)).catch(() => null)]);
  if (action) publicCache = null;
  return privateResult({
    active: row?.active?.manifest ?? null, previousRevision: row?.previous?.manifest.revision ?? null,
    pendingBackups: row?.pending.length ?? 0, checkedAt: row?.checkedAt ?? null,
    exception: row?.exception ?? null, organicPlan: row?.active?.campaign ?? null, socialMetrics,
  });
}

export async function institutionalCron() {
  await refreshInstitutional();
  return { statusCode: 200 };
}
