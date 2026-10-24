import { verifyEncryptedBackup } from './backup-crypto';

type Page = { kind: string; paths?: string[]; nextToken?: string | null; available?: boolean; bytes?: number };
type Reader = (body: Record<string, unknown>) => Promise<Page>;
type State = 'current' | 'closed' | 'unknown';
const storageFields = new Set(['evidenceImagePath', 'storagePath']);
const mediaFields = new Set(['imageUrl', 'mediaUrl', 'thumbnailUrl', 'photoUrl', 'attachmentUrl', 'imagePath', 'mediaPath', 'filePath', 'attachmentPath']);
const staticAsset = /^(?:\/?resources\/|\/?public\/|\/?icon-(?:192|512|maskable-512)\.png$|\/?manifest\.webmanifest$|\/?sw\.js$)/;
const safePath = (value: string) => value.length > 0 && value.length <= 1024 && !value.startsWith('/') && !value.includes('\\') && !value.includes('://') && !value.split('/').some(part => !part || part === '.' || part === '..');

export function referenceCollector() {
  const local = new Map<string, State>();
  const captured = new Set<string>();
  const external = new Set<string>();
  const bundled = new Set<string>();
  const inline = new Set<string>();
  let unresolved = 0;
  let fields = 0;
  let applicationConfirmed = false;
  function scan(value: unknown, state: State, depth = 0) {
    if (depth > 25 || ++fields > 2000000) { unresolved += 1; return; }
    if (Array.isArray(value)) { value.forEach(item => scan(item, state, depth + 1)); return; }
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === 'string' && item.trim() && (storageFields.has(key) || mediaFields.has(key))) {
        const path = item.trim();
        if (/^data:/i.test(path)) inline.add(path);
        else if (/^https?:\/\//i.test(path)) {
          try {
            const parsed = new URL(path);
            if (parsed.hostname === 'trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai' && staticAsset.test(parsed.pathname)) bundled.add(parsed.pathname);
            else external.add(path);
          } catch { unresolved += 1; }
        } else if (storageFields.has(key) && safePath(path)) {
          const previous = local.get(path);
          if (!previous || state === 'current' || (state === 'unknown' && previous === 'closed')) local.set(path, state);
        } else if (staticAsset.test(path)) bundled.add(path);
        else unresolved += 1;
      }
      if (item && typeof item === 'object') scan(item, state, depth + 1);
    }
  }
  return {
    local, captured, external, bundled, inline,
    get unresolved() { return unresolved; },
    get applicationConfirmed() { return applicationConfirmed; },
    async visit(block: Record<string, unknown>) {
      if (block.kind === 'manifest') {
        applicationConfirmed = block.appId === 'trabajo-cerca-laboratorio-3ojgro';
        if (!applicationConfirmed) throw new Error('foreign_application');
      }
      if (block.kind === 'file' && typeof block.path === 'string') captured.add(block.path);
      if (block.kind === 'table' && Array.isArray(block.items)) {
        for (const row of block.items) {
          const payload = row.record && typeof row.record === 'object' ? row.record : row;
          const closed = payload.active === false || ['closed','expired','archived'].includes(String(payload.status));
          const state: State = closed ? 'closed' : payload.active === true ? 'current' : 'unknown';
          scan(row, state);
        }
      }
    }
  };
}

export async function auditBackupStorage(text: string, password: string, read: Reader, cancelled: () => boolean = () => false) {
  const refs = referenceCollector();
  const backup = await verifyEncryptedBackup(text, password, refs.visit);
  if (!refs.applicationConfirmed) throw new Error('foreign_application');
  const stored = new Set<string>();
  const tokens = new Set<string>();
  let cursor: string | null = null;
  let requests = 0;
  do {
    if (cancelled()) throw new Error('audit_cancelled');
    if (++requests > 200) throw new Error('storage_listing_budget');
    const page = await read({ kind: 'storage', cursor });
    if (page.kind !== 'storage' || !Array.isArray(page.paths) || page.paths.some(path => typeof path !== 'string')) throw new Error('storage_listing_incomplete');
    for (const path of page.paths) {
      if (stored.has(path)) throw new Error('storage_duplicate_path');
      stored.add(path);
    }
    if (page.nextToken !== undefined && page.nextToken !== null && typeof page.nextToken !== 'string') throw new Error('storage_cursor_invalid');
    cursor = page.nextToken || null;
    if (cursor && tokens.has(cursor)) throw new Error('storage_cursor_loop');
    if (cursor) tokens.add(cursor);
  } while (cursor);
  const absent = [...refs.local].filter(([path]) => !stored.has(path));
  const missing = { current: 0, closed: 0, unknown: 0 };
  let unknown = 0;
  let independentlyRead = 0;
  let foundOutsideListing = 0;
  for (const [path, state] of absent) {
    if (cancelled()) throw new Error('audit_cancelled');
    if (independentlyRead >= 50) { unknown += 1; continue; }
    const result = await read({ kind: 'file-status', path }); requests += 1; independentlyRead += 1;
    if (result.kind !== 'file-status' || typeof result.available !== 'boolean') throw new Error('file_status_incomplete');
    if (!result.available) missing[state] += 1;
    else foundOutsideListing += 1;
  }
  return {
    schema: 'trabajo-cerca.storage-reference-audit.v1', checkedAt: new Date().toISOString(),
    backupTables: backup.tables, backupRecords: backup.records, backupFiles: backup.files,
    currentSdkStorageObjects: stored.size, listingCompleted: true, independentlyCheckedReferences: independentlyRead,
    storageReferencesInBackup: refs.local.size, referencesFoundOutsideListing: foundOutsideListing,
    missingReferencedObjects: missing, unverifiedAbsentReferences: unknown,
    externalMediaReferences: refs.external.size, bundledAssetReferences: refs.bundled.size, inlineMediaReferences: refs.inline.size,
    unclassifiedReferenceValues: refs.unresolved,
    currentObjectsNotCapturedInBackup: [...stored].filter(path => !refs.captured.has(path)).length,
    capturedObjectsNotInCurrentListing: [...refs.captured].filter(path => !stored.has(path)).length,
    sdkRequests: requests, passwordUploaded: false, recordBodiesUploaded: false, originalMediaFetched: false,
    productionWrites: 0, fullPlatformStorageCertified: false,
    limitations: ['Compara una copia histórica con el almacenamiento SDK actual; no atribuye diferencias a pérdida o vencimiento.', 'Solo clasifica campos de archivo conocidos; referencias opacas o tablas fuera de la copia pueden quedar fuera.', 'Los archivos estáticos y las imágenes externas no pertenecen al listado SDK.']
  };
}

