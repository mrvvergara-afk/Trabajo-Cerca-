import { appendEncrypted, beginEncryptedBackup, verifyEncryptedBackup, type BackupEnvelope } from './backup-crypto';

type Row = Record<string, unknown> & { id: string };
export type BackupPage = { kind: string; table?: string; tables?: string[]; revision?: string; items?: Row[]; paths?: string[]; path?: string; content?: string; nextToken?: string | null };
export type BackupReader = (body: Record<string, unknown>) => Promise<BackupPage>;
export type BackupRun = {
  envelope: BackupEnvelope; key: CryptoKey; startedAt: string; phase: 'scope' | 'tables' | 'storage' | 'files' | 'finish' | 'complete';
  tables: string[]; index: number; cursor: string | null; tokens: string[]; ids: Record<string, string[]>;
  paths: string[]; pendingPaths: string[]; storageNext: string | null; storageTokens: string[]; revision: string;
  calls: number; encryptedBytes: number;
};
const dynamicTable = /^(radar_external_[a-f0-9]{32}|public_feed_page_[0-9]{1,8})$/;
function discover(value: unknown, tables: string[]) {
  if (typeof value === 'string' && dynamicTable.test(value) && !tables.includes(value)) tables.push(value);
  else if (Array.isArray(value)) value.forEach(item => discover(item, tables));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => discover(item, tables));
}
export async function newBackupRun(password: string): Promise<BackupRun> {
  const encrypted = await beginEncryptedBackup(password);
  return { ...encrypted, startedAt: new Date().toISOString(), phase: 'scope', tables: [], index: 0, cursor: null, tokens: [], ids: {}, paths: [], pendingPaths: [], storageNext: null, storageTokens: [], revision: '', calls: 0, encryptedBytes: 0 };
}
export function backupProgress(state: BackupRun) {
  if (state.phase === 'scope') return 'Preparando el inventario';
  if (state.phase === 'tables') return `Datos: tabla ${state.index + 1}/${state.tables.length} (${state.tables[state.index]})`;
  if (state.phase === 'storage' || state.phase === 'files') return `Archivos: ${state.paths.length} completados`;
  return 'Comprobando integridad';
}

// A step works on a copy. Failed reads/encryption never change the last
// committed checkpoint, its encrypted parts, IDs or pagination cursors.
export async function advanceBackup(original: BackupRun, read: BackupReader): Promise<BackupRun> {
  if (original.phase === 'complete') return original;
  if (original.calls >= 5000 || original.tables.length > 500) throw new Error('backup_limit');
  const state: BackupRun = { ...original, envelope: { ...original.envelope, parts: [...original.envelope.parts] }, tables: [...original.tables], tokens: [...original.tokens], ids: { ...original.ids }, paths: [...original.paths], pendingPaths: [...original.pendingPaths], storageTokens: [...original.storageTokens] };
  const ask = async (body: Record<string, unknown>) => { state.calls += 1; return read(body); };
  const add = async (value: unknown) => {
    await appendEncrypted(state.envelope, state.key, value);
    state.encryptedBytes += state.envelope.parts[state.envelope.parts.length - 1].content.length;
    if (state.encryptedBytes > 45000000) throw new Error('backup_limit');
  };
  if (state.phase === 'scope') {
    const scope = await ask({ kind: 'scope' });
    if (!Array.isArray(scope.tables) || !scope.tables.length || scope.tables.some(table => typeof table !== 'string') || new Set(scope.tables).size !== scope.tables.length) throw new Error('invalid_scope');
    state.tables = [...scope.tables]; state.revision = scope.revision || ''; state.phase = 'tables';
  } else if (state.phase === 'tables') {
    const table = state.tables[state.index];
    const page = await ask({ kind: 'table', table, cursor: state.cursor });
    if (page.kind !== 'table' || page.table !== table || !Array.isArray(page.items)) throw new Error('invalid_page');
    const next = page.nextToken || null;
    if (next && state.tokens.includes(next)) throw new Error('pagination_loop');
    const ids = new Set(state.ids[table] || []);
    for (const row of page.items) {
      if (typeof row.id !== 'string' || !row.id || ids.has(row.id)) throw new Error('duplicate_id');
      ids.add(row.id);
    }
    discover(page.items, state.tables);
    await add({ kind: 'table', table, items: page.items });
    state.ids[table] = [...ids];
    state.cursor = next;
    if (next) state.tokens.push(next);
    else { state.index += 1; state.tokens = []; if (state.index === state.tables.length) state.phase = 'storage'; }
  } else if (state.phase === 'storage') {
    const page = await ask({ kind: 'storage', cursor: state.cursor });
    if (!Array.isArray(page.paths) || page.paths.some(path => typeof path !== 'string') || new Set(page.paths).size !== page.paths.length || page.paths.some(path => state.paths.includes(path))) throw new Error('invalid_storage_page');
    const next = page.nextToken || null;
    if (next && state.storageTokens.includes(next)) throw new Error('pagination_loop');
    state.pendingPaths = [...page.paths]; state.storageNext = next;
    if (next) state.storageTokens.push(next);
    state.phase = state.pendingPaths.length ? 'files' : next ? 'storage' : 'finish';
    if (!state.pendingPaths.length) state.cursor = next;
  } else if (state.phase === 'files') {
    const path = state.pendingPaths[0];
    const file = await ask({ kind: 'file', path });
    if (file.kind !== 'file' || file.path !== path || typeof file.content !== 'string') throw new Error('missing_file');
    await add({ kind: 'file', path, content: file.content });
    state.paths.push(path); state.pendingPaths.shift();
    if (!state.pendingPaths.length) { state.cursor = state.storageNext; state.phase = state.cursor ? 'storage' : 'finish'; }
  } else if (state.phase === 'finish') {
    await add({ kind: 'manifest', complete: true, appId: 'trabajo-cerca-laboratorio-3ojgro', revision: state.revision, startedAt: state.startedAt, finishedAt: new Date().toISOString(), consistency: 'rolling_non_atomic', fullPlatformBackup: false, dynamicCatalogueCertified: false, storageMetadataIncluded: false, tables: state.tables.map(table => ({ table, count: (state.ids[table] || []).length })), files: state.paths.length, parts: state.envelope.parts.length });
    state.phase = 'complete';
  }
  return state;
}

export async function checkBackupRun(state: BackupRun, password: string) {
  return verifyEncryptedBackup(JSON.stringify(state.envelope), password);
}

export function backupFailure(cause: unknown): { code: string; message: string; resumable: boolean } {
  const failure = cause as { message?: string; status?: number; statusCode?: number; response?: { status?: number; data?: { error?: string; code?: string } } };
  const status = failure?.response?.status ?? failure?.status ?? failure?.statusCode;
  const code = failure?.response?.data?.code;
  if (status === 429 || code === 'backup_quota') return { code: 'backup_quota', message: 'Se alcanzó una cuota de lectura. Espera antes de reanudar; no se reintentará automáticamente.', resumable: true };
  if (status === 401 || status === 403) return { code: 'backup_session', message: 'La sesión dejó de autorizar la lectura. Recupera la sesión antes de reanudar.', resumable: true };
  if (status === 413) return { code: 'backup_size', message: 'Una página o archivo supera el tamaño admitido. Este caso requiere ampliar el exportador; reanudar ahora repetirá el error.', resumable: false };
  if (status === 409) return { code: 'backup_source_changed', message: 'Un archivo no está disponible o la lectura quedó incompleta. Conserva la copia parcial y crea una copia nueva después de revisar la fuente.', resumable: false };
  const known = ['backup_limit', 'duplicate_id', 'pagination_loop', 'invalid_page', 'invalid_scope', 'invalid_storage_page', 'missing_file'];
  if (known.includes(failure?.message || '')) return { code: failure.message!, message: 'El exportador detectó un límite o una inconsistencia. Conserva la copia parcial; no es un respaldo completo.', resumable: false };
  return { code: code === 'backup_read_incomplete' ? code : 'backup_read_failed', message: 'La lectura no se completó. Puedes reanudar desde la última página confirmada, sin volver a copiar las anteriores.', resumable: true };
}
