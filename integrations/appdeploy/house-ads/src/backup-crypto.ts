const encoder = new TextEncoder();
const decoder = new TextDecoder();
const FORMAT = 'trabajo-cerca.encrypted-backup.v1';
const ITERATIONS = 310000;
export type CipherPart = { iv: string; content: string };
export type BackupEnvelope = { format: string; id: string; salt: string; iterations: number; parts: CipherPart[] };

function base64(bytes: Uint8Array): string {
  let text = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) text += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(text);
}
function bytes(text: string): Uint8Array {
  return Uint8Array.from(atob(text), character => character.charCodeAt(0));
}
async function keyFor(password: string, salt: Uint8Array) {
  const input = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: ITERATIONS, hash: 'SHA-256' }, input, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function beginEncryptedBackup(password: string) {
  if (password.length < 12) throw new Error('Usa una contraseña de al menos 12 caracteres.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const envelope: BackupEnvelope = { format: FORMAT, id: crypto.randomUUID(), salt: base64(salt), iterations: ITERATIONS, parts: [] };
  return { envelope, key: await keyFor(password, salt) };
}
export async function appendEncrypted(envelope: BackupEnvelope, key: CryptoKey, value: unknown) {
  if (envelope.parts.length >= 2000) throw new Error('Límite de páginas alcanzado. La copia no está completa.');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const additionalData = encoder.encode(FORMAT + ':' + envelope.id + ':' + envelope.parts.length);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData }, key, encoder.encode(JSON.stringify(value)));
  envelope.parts.push({ iv: base64(iv), content: base64(new Uint8Array(ciphertext)) });
}
export async function verifyEncryptedBackup(text: string, password: string, visit?: (block: Record<string, unknown>) => Promise<void>) {
  if (text.length > 60000000) throw new Error('El archivo supera el límite de comprobación.');
  const envelope = JSON.parse(text) as BackupEnvelope;
  if (envelope.format !== FORMAT || envelope.iterations !== ITERATIONS || typeof envelope.id !== 'string' || envelope.id.length > 100 || !Array.isArray(envelope.parts) || envelope.parts.length < 1 || envelope.parts.length > 2000) throw new Error('Formato de respaldo no válido.');
  const salt = bytes(envelope.salt);
  if (salt.length !== 16) throw new Error('Sal de cifrado inválida.');
  const key = await keyFor(password, salt);
  const tables = new Map<string, Set<string>>();
  const paths = new Set<string>();
  let manifest: { kind: string; complete: boolean; parts: number; tables: Array<{ table: string; count: number }>; files: number } | null = null;
  for (let index = 0; index < envelope.parts.length; index++) {
    const part = envelope.parts[index];
    const iv = bytes(part.iv);
    if (iv.length !== 12) throw new Error('Bloque cifrado inválido.');
    const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv.buffer as ArrayBuffer, additionalData: encoder.encode(FORMAT + ':' + envelope.id + ':' + index) }, key, bytes(part.content).buffer as ArrayBuffer);
    const value = JSON.parse(decoder.decode(clear));
    if (value.kind === 'manifest') {
      if (index !== envelope.parts.length - 1 || manifest) throw new Error('Orden del manifiesto inválido.');
      manifest = value;
    } else if (value.kind === 'table') {
      if (typeof value.table !== 'string' || !Array.isArray(value.items)) throw new Error('Página inválida.');
      const ids = tables.get(value.table) || new Set<string>();
      for (const row of value.items) {
        if (typeof row.id !== 'string' || !row.id || ids.has(row.id)) throw new Error('ID duplicado o ausente. Repite el respaldo.');
        ids.add(row.id);
      }
      tables.set(value.table, ids);
    } else if (value.kind === 'file') {
      if (typeof value.path !== 'string' || typeof value.content !== 'string' || paths.has(value.path)) throw new Error('Archivo duplicado o inválido.');
      paths.add(value.path);
    } else throw new Error('Bloque desconocido.');
    if (visit) await visit(value);
  }
  if (!manifest?.complete || manifest.parts !== envelope.parts.length - 1 || !Array.isArray(manifest.tables) || manifest.tables.length !== tables.size || manifest.files !== paths.size) throw new Error('Respaldo incompleto.');
  const listed = new Set<string>();
  for (const entry of manifest.tables) {
    if (listed.has(entry.table) || !tables.has(entry.table) || tables.get(entry.table)!.size !== entry.count) throw new Error('Inventario de tablas inconsistente.');
    listed.add(entry.table);
  }
  return { tables: tables.size, records: [...tables.values()].reduce((sum, ids) => sum + ids.size, 0), files: paths.size, platformRestoreTested: false };
}

