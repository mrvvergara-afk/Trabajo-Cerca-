import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const baselineDirectory = process.argv[2];
if (!baselineDirectory) throw Error('Indica el directorio del código exportado de la versión activa.');
const official = 'trabajo-cerca-laboratorio-3ojgro';
const manifest = JSON.parse(await readFile(new URL('./manifest.json', import.meta.url), 'utf8'));
if (manifest.appId !== official || manifest.expectedBaseline !== manifest.codeRollback)
  throw Error('El manifiesto no identifica la versión base y la reversión de Trabajo Cerca oficial.');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const verifiedPath = path => {
  if (!/^(?:(?:backend|src|shared|public|marketing)\/[\w./-]+|package\.json|cron\.json|appdeploy\.auth-login\.json)$/.test(path) || path.split('/').includes('..'))
    throw Error('Ruta fuera del paquete: ' + path);
  return path;
};
async function requireBaseline(path, expected) {
  const bytes = await readFile(resolve(baselineDirectory, verifiedPath(path))).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if ((bytes && digest(bytes)) !== expected) throw Error('La versión base difiere en ' + path);
}
for (const [path, sha] of Object.entries(manifest.verifiedPreservedSha256)) await requireBaseline(path, sha);
const files = [];
const used = new Set();
for (const { path, baseSha256, candidateSha256 } of manifest.runtimeFiles) {
  if (used.has(path) || Object.hasOwn(manifest.verifiedPreservedSha256, path)) throw Error('Ruta repetida o protegida: ' + path);
  used.add(path);
  await requireBaseline(path, baseSha256);
  const content = await readFile(new URL('./overlay/' + verifiedPath(path), import.meta.url));
  if (digest(content) !== candidateSha256) throw Error('El archivo candidato difiere del manifiesto: ' + path);
  files.push({ filename: path, content: content.toString('utf8') });
}
const payload = { app_id: official, app_name: 'Trabajo Cerca', app_type: 'frontend+backend',
  intent: 'Integrar procesamiento, telemetría y respaldo de Trabajo Cerca', model: 'chat', initiator: 'agent',
  type: 'fix', files, mcp_version: '2.13' };
process.stdout.write(JSON.stringify(payload) + '\n');
