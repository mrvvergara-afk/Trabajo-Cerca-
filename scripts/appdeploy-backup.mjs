import { createHash } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
const encode = value => JSON.stringify(value);
const tableName = name => typeof name === 'string' && /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(name) && !name.includes('__');
const fail = message => { throw new Error(message); };

// No SDK imports, routes, credentials or production writes. The caller supplies
// authorized read adapters and an encrypted, private durable sink.
export function beginBackup({ tables, appId, sourceVersion, startedAt }) {
  if (!Array.isArray(tables) || !tables.length || tables.some(t => !tableName(t)) || new Set(tables).size !== tables.length) fail('invalid_table_inventory');
  if (!appId || !sourceVersion || !Number.isFinite(Date.parse(startedAt))) fail('invalid_backup_identity');
  return { schema: 'trabajo-cerca.backup.v1', appId, sourceVersion, startedAt,
    consistency: 'rolling_non_atomic', tableInventory: [...tables], tableIndex: 0,
    phase: 'tables', cursor: null, seenTokens: [], pages: [], files: [], complete: false };
}

// One bounded source call per step, except one bounded storage page plus one
// file read per path. Sink acknowledgement precedes advancement of checkpoint.
// Caller must persist the returned checkpoint before scheduling the next step.
export async function backupStep(checkpoint, source, sink) {
  const state = structuredClone(checkpoint);
  if (state.complete) return state;
  if (state.phase === 'tables') {
    const table = state.tableInventory[state.tableIndex];
    if (!tableName(table)) fail('invalid_checkpoint_table');
    const page = await source.listTable(table, { limit: 20, ...(state.cursor ? { nextToken: state.cursor } : {}) });
    if (!page || !Array.isArray(page.items) || page.items.length > 20) fail('invalid_table_page');
    const ids = new Set();
    for (const row of page.items) {
      if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id)) fail('duplicate_or_missing_record_id');
      ids.add(row.id);
    }
    const next = page.nextToken || null;
    if (next && (typeof next !== 'string' || next === state.cursor || state.seenTokens.includes(next))) fail('pagination_loop');
    const content = encode({ table, items: page.items });
    const digest = hash(content);
    const key = `pages/${digest}.json`;
    if (await sink.put(key, content) !== true) fail('backup_sink_not_acknowledged');
    state.pages.push({ key, sha256: digest, table, count: page.items.length });
    if (next) {
      state.seenTokens.push(next);
      state.cursor = next;
    } else {
      state.tableIndex += 1;
      state.cursor = null;
      state.seenTokens = [];
      if (state.tableIndex === state.tableInventory.length) state.phase = 'storage';
    }
  } else if (state.phase === 'storage') {
    const page = await source.listStorage({ limit: 5, ...(state.cursor ? { nextToken: state.cursor } : {}) });
    if (!page || !Array.isArray(page.paths) || page.paths.length > 5) fail('invalid_storage_page');
    const next = page.nextToken || null;
    if (next && (typeof next !== 'string' || next === state.cursor || state.seenTokens.includes(next))) fail('pagination_loop');
    const paths = new Set(state.files.map(file => file.path));
    for (const path of page.paths) {
      if (typeof path !== 'string' || !path || path.startsWith('/') || path.split('/').some(part => part === '..' || part === '.') || paths.has(path)) fail('invalid_or_duplicate_storage_path');
      paths.add(path);
      const file = await source.readStorage(path);
      if (!file || file.path !== path || typeof file.content !== 'string') fail('storage_object_missing');
      // Preserve SDK content verbatim: its encoding is not inferred from MIME.
      const content = encode(file);
      const digest = hash(content);
      const key = `files/${digest}.json`;
      if (await sink.put(key, content) !== true) fail('backup_sink_not_acknowledged');
      state.files.push({ key, sha256: digest, path });
    }
    state.cursor = next;
    if (next) state.seenTokens.push(next);
    else { state.complete = true; state.phase = 'complete'; }
  } else fail('invalid_backup_phase');
  return state;
}

// Validation/restoration to an isolated in-memory model only. Never takes a
// production database or SDK writer. Verify the whole archive before returning.
export async function restoreIsolated(manifest, sink, expected) {
  if (!manifest.complete || manifest.phase !== 'complete' || manifest.tableIndex !== manifest.tableInventory.length) fail('backup_incomplete');
  if (manifest.appId !== expected.appId || manifest.sourceVersion !== expected.sourceVersion) fail('backup_identity_mismatch');
  if (encode(manifest.tableInventory) !== encode(expected.tables)) fail('backup_scope_mismatch');
  const tables = new Map(manifest.tableInventory.map(table => [table, new Map()]));
  const covered = new Set();
  for (const ref of manifest.pages) {
    const content = await sink.get(ref.key);
    if (typeof content !== 'string' || hash(content) !== ref.sha256) fail('backup_page_corrupt');
    const page = JSON.parse(content);
    if (page.table !== ref.table || !tables.has(page.table) || !Array.isArray(page.items) || page.items.length !== ref.count) fail('backup_page_scope_mismatch');
    covered.add(page.table);
    const rows = tables.get(page.table);
    for (const row of page.items) {
      if (typeof row.id !== 'string' || !row.id || rows.has(row.id)) fail('duplicate_or_missing_record_id');
      rows.set(row.id, structuredClone(row));
    }
  }
  if (covered.size !== tables.size) fail('backup_table_missing');
  const files = new Map();
  for (const ref of manifest.files) {
    const content = await sink.get(ref.key);
    if (typeof content !== 'string' || hash(content) !== ref.sha256) fail('backup_file_corrupt');
    const file = JSON.parse(content);
    if (file.path !== ref.path || typeof file.content !== 'string' || files.has(file.path)) fail('backup_file_scope_mismatch');
    files.set(file.path, file.content);
  }
  return { tables, files, consistency: manifest.consistency, productionWrites: 0 };
}
