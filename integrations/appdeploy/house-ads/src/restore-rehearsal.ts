import { verifyEncryptedBackup } from './backup-crypto';

export type StoredRestoreRow = { key: number; iv: Uint8Array; content: ArrayBuffer };
export type IsolatedRestoreStore = {
  write(rows: StoredRestoreRow[]): Promise<void>;
  read(offset: number, limit: number): Promise<StoredRestoreRow[]>;
  dispose(): Promise<void>;
};

export async function createBrowserRestoreStore(): Promise<IsolatedRestoreStore> {
  const name = 'tc-restore-rehearsal-' + crypto.randomUUID();
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('records', { keyPath: 'key' });
    request.onerror = () => reject(new Error('No se pudo crear la base temporal en este navegador.'));
    request.onsuccess = () => resolve(request.result);
  });
  let disposed = false;
  return {
    async write(rows) {
      if (disposed) throw new Error('temporary_store_closed');
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('records', 'readwrite');
        for (const row of rows) tx.objectStore('records').add(row);
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => reject(new Error('No se pudo guardar el lote temporal.'));
      });
    },
    async read(offset, limit) {
      if (disposed) throw new Error('temporary_store_closed');
      return new Promise<StoredRestoreRow[]>((resolve, reject) => {
        const tx = db.transaction('records', 'readonly');
        const request = tx.objectStore('records').getAll(IDBKeyRange.bound(offset, offset + limit - 1), limit);
        let rows: StoredRestoreRow[] = [];
        request.onsuccess = () => { rows = request.result; };
        tx.oncomplete = () => resolve(rows);
        tx.onerror = tx.onabort = () => reject(new Error('No se pudo leer el lote temporal.'));
      });
    },
    async dispose() {
      if (disposed) return;
      db.close();
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => { disposed = true; resolve(); };
        request.onerror = request.onblocked = () => reject(new Error('No se pudo eliminar la base temporal cifrada.'));
      });
    }
  };
}

async function fingerprint(bytes: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function rehearseRestore(
  text: string,
  password: string,
  options: { createStore?: () => Promise<IsolatedRestoreStore>; progress?: (message: string) => void; cancelled?: () => boolean } = {}
) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  // Temporary records use a new, non-exportable key held only in this call.
  // Neither the backup password nor private cleartext is persisted in IndexedDB.
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const store = await (options.createStore || createBrowserRestoreStore)();
  const expected: string[] = [];
  let bytes = 0;
  let files = 0;
  let rows = 0;
  let checked = 0;
  let cleanupConfirmed = false;
  const checkCancelled = () => { if (options.cancelled?.()) throw new Error('Prueba cancelada.'); };
  try {
    const summary = await verifyEncryptedBackup(text, password, async block => {
      checkCancelled();
      const payloads: unknown[] = [];
      if (block.kind === 'manifest') {
        if (block.appId !== 'trabajo-cerca-laboratorio-3ojgro') throw new Error('La copia pertenece a otra aplicación.');
      } else if (block.kind === 'table' && Array.isArray(block.items)) {
        for (const row of block.items) payloads.push({ kind: 'record', table: block.table, record: row });
        rows += block.items.length;
      } else if (block.kind === 'file') {
        payloads.push({ kind: 'file', path: block.path, content: block.content });
        files += 1;
      }
      const batch: StoredRestoreRow[] = [];
      for (const payload of payloads) {
        checkCancelled();
        const clear = encoder.encode(JSON.stringify(payload));
        bytes += clear.byteLength;
        if (bytes > 50000000 || expected.length >= 50000) throw new Error('La copia supera el límite de esta prueba local.');
        const index = expected.length;
        const hash = await fingerprint(clear);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const content = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(String(index)) }, key, clear);
        batch.push({ key: index, iv, content });
        expected.push(hash);
      }
      if (batch.length) await store.write(batch);
      options.progress?.(`Reconstruyendo: ${rows} registros y ${files} archivos.`);
    });
    if (summary.records !== rows || summary.files !== files) throw new Error('El manifiesto no coincide con los datos reconstruidos.');
    for (let offset = 0; offset < expected.length; offset += 50) {
      checkCancelled();
      const batch = await store.read(offset, 50);
      if (batch.length !== Math.min(50, expected.length - offset)) throw new Error('Faltan elementos en la reconstrucción temporal.');
      for (let index = 0; index < batch.length; index++) {
        const item = batch[index];
        const position = offset + index;
        if (item.key !== position) throw new Error('El orden de reconstrucción no coincide.');
        const clear = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: item.iv.buffer as ArrayBuffer, additionalData: encoder.encode(String(position)) }, key, item.content));
        // Read back and parse real reconstructed payloads, then compare every
        // ID, closed-state flag, contact and original date through SHA-256.
        const rebuilt = encoder.encode(JSON.stringify(JSON.parse(decoder.decode(clear))));
        if (await fingerprint(rebuilt) !== expected[position]) throw new Error('Un registro recuperado difiere del original.');
        checked += 1;
      }
      options.progress?.(`Comparando: ${checked} de ${expected.length} elementos.`);
    }
    const encryptedFileSha256 = await fingerprint(encoder.encode(text));
    await store.dispose(); cleanupConfirmed = true;
    return {
      schema: 'trabajo-cerca.local-restore-rehearsal.v1', checkedAt: new Date().toISOString(),
      tables: summary.tables, records: rows, files, comparedElements: checked, mismatches: 0,
      encryptedFileSha256, temporaryStoreDeleted: true, privateValuesStoredEncrypted: true,
      networkRequests: 0, productionWrites: 0, platformRestoreTested: false,
      limitations: ['No certifica recuperación funcional en AppDeploy.', 'No certifica tablas sin referencias ni elementos ausentes de la copia.', 'Un total de cero archivos no acredita que el almacenamiento de origen esté vacío.']
    };
  } finally {
    if (!cleanupConfirmed) await store.dispose();
  }
}

