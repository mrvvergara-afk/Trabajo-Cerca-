import { constants, createDecipheriv, generateKeyPairSync, privateDecrypt } from 'node:crypto';
import { db } from '@appdeploy/sdk';
import { BANK_URL, SOCIAL_BRAND } from '../shared/house-autonomy';

const TABLE = 'growth_house_metricool';
const KEY = 'key';
const SNAPSHOT = 'snapshot';
export const METRICOOL_TARGET = 'lab' as 'lab' | 'prod';
type KeyPair = { id: string; publicKey: string; privateKey: string };
type Metric = number | null;
type Snapshot = {
  schema: 1;
  brandId: typeof SOCIAL_BRAND;
  from: string;
  to: string;
  networks: { network: 'Facebook' | 'Instagram'; reach: Metric; impressions: Metric; clicks: Metric; views: Metric }[];
};
type Saved = { id: string; snapshot: Snapshot; nextCheckAt: number };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
export function validateMetricoolSnapshot(value: unknown): Snapshot {
  const m = record(value);
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (m.schema !== 1 || m.brandId !== SOCIAL_BRAND || typeof m.from !== 'string' || typeof m.to !== 'string' ||
    !day.test(m.from) || !day.test(m.to) || m.from > m.to ||
    !Array.isArray(m.networks) || m.networks.length !== 2)
    throw Error('periodo_metricool_invalido');
  const [start, end] = [Date.parse(m.from), Date.parse(m.to)];
  if (!Number.isFinite(start) || !Number.isFinite(end) || end - start > 31 * 86_400_000 ||
    end > Date.now() + 86_400_000) throw Error('periodo_metricool_invalido');
  const networks = (['Facebook', 'Instagram'] as const).map(network => {
    const rows = (m.networks as unknown[]).map(record).filter(row => row.network === network);
    if (rows.length !== 1) throw Error('red_metricool_invalida');
    const metric = (field: string) => {
      const result = rows[0][field];
      if (result === null) return null;
      if (typeof result !== 'number' || !Number.isSafeInteger(result) || result < 0)
        throw Error('metrica_metricool_invalida');
      return result;
    };
    return { network, reach: metric('reach'), impressions: metric('impressions'), clicks: metric('clicks'), views: metric('views') };
  });
  return { schema: 1, brandId: SOCIAL_BRAND, from: m.from, to: m.to, networks };
}
async function keyPair(create: boolean) {
  const [known] = await db.get<KeyPair>(TABLE, [KEY], { consistent: true });
  if (known || !create) return known;
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const [created] = await db.tx.add(TABLE, [{ id: KEY, publicKey, privateKey }]);
  if (created) return { id: KEY, publicKey, privateKey };
  const [winner] = await db.get<KeyPair>(TABLE, [KEY], { consistent: true });
  return winner;
}
export async function metricoolBridgeKey() {
  return (await keyPair(true))?.publicKey ?? null;
}
function decode(input: unknown, min: number, max: number) {
  if (typeof input !== 'string' || input.length > Math.ceil(max / 3) * 4) throw Error('sobre_metricool_invalido');
  const bytes = Buffer.from(input, 'base64');
  if (bytes.length < min || bytes.length > max || bytes.toString('base64') !== input)
    throw Error('sobre_metricool_invalido');
  return bytes;
}
export function decryptMetricoolSnapshot(envelope: unknown, privateKey: string) {
  const e = record(envelope);
  if (e.schema !== 1 || e.target !== METRICOOL_TARGET) throw Error('destino_metricool_invalido');
  const aes = privateDecrypt({
    key: privateKey, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING,
  }, decode(e.key, 256, 256));
  const crypt = createDecipheriv('aes-256-gcm', aes, decode(e.nonce, 12, 12));
  crypt.setAAD(Buffer.from('TrabajoCerca/Metricool/v1/' + METRICOOL_TARGET));
  crypt.setAuthTag(decode(e.tag, 16, 16));
  return validateMetricoolSnapshot(JSON.parse(Buffer.concat([
    crypt.update(decode(e.payload, 1, 3000)), crypt.final(),
  ]).toString('utf8')));
}
let refresh: Promise<Snapshot | null> | undefined;
export async function metricoolMetrics(force: boolean) {
  const [saved] = await db.get<Saved>(TABLE, [SNAPSHOT], { consistent: true });
  if (!force && saved && saved.nextCheckAt > Date.now()) return saved.snapshot;
  refresh ??= (async () => {
    const keys = await keyPair(false);
    if (!keys) return saved?.snapshot ?? null;
    try {
      const url = BANK_URL.replace('/bank/', '/metricool/') + METRICOOL_TARGET + '.json';
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(4500) });
      if (!response.ok || !response.body) return saved?.snapshot ?? null;
      const reader = response.body.getReader();
      const chunks = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > 8000) {
          await reader.cancel();
          throw Error('sobre_metricool_excede_limite');
        }
        chunks.push(value);
      }
      const snapshot = decryptMetricoolSnapshot(JSON.parse(Buffer.concat(chunks).toString('utf8')), keys.privateKey);
      if (saved && saved.snapshot.to > snapshot.to) return saved.snapshot;
      const nextCheckAt = Date.now() + 3_600_000;
      if (saved) {
        await db.tx.update(TABLE, [{
          id: SNAPSHOT, record: { snapshot, nextCheckAt }, if: { nextCheckAt: saved.nextCheckAt },
        }], { patch: true });
      } else {
        await db.tx.add(TABLE, [{ id: SNAPSHOT, snapshot, nextCheckAt }]);
      }
      return snapshot;
    } catch {
      return saved?.snapshot ?? null;
    }
  })().finally(() => { refresh = undefined; });
  return refresh;
}
