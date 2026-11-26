import { constants, createCipheriv, publicEncrypt, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

const [bridgePath, reportPath] = process.argv.slice(2);
const bridge = JSON.parse(readFileSync(bridgePath, 'utf8'));
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
if (!['lab', 'prod'].includes(bridge.target) || typeof bridge.analyticsPublicKey !== 'string' ||
    report.schema !== 1 || report.brandId !== '7187503') throw Error('Destino o marca inválidos');
const key = randomBytes(32);
const nonce = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', key, nonce);
cipher.setAAD(Buffer.from('TrabajoCerca/Metricool/v1/' + bridge.target));
const payload = Buffer.concat([cipher.update(JSON.stringify(report), 'utf8'), cipher.final()]);
const encryptedKey = publicEncrypt({
  key: bridge.analyticsPublicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256',
}, key);
process.stdout.write(JSON.stringify({
  schema: 1, target: bridge.target, key: encryptedKey.toString('base64'),
  nonce: nonce.toString('base64'), tag: cipher.getAuthTag().toString('base64'),
  payload: payload.toString('base64'),
}) + '\n');
