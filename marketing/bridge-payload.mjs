import { readFileSync } from 'node:fs';
import {
  BANK_URL, HASH, INSTITUTIONAL_APP, SOCIAL_BRAND, SOCIAL_CAMPAIGN, validatePublicManifest,
} from '../shared/house-autonomy.ts';

const modes = ['archive', 'metrics', 'plan'];
const [mode, ...args] = process.argv.slice(2);
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const emit = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

function validPlan(p) {
  return p && p.brandId === SOCIAL_BRAND && SOCIAL_CAMPAIGN.test(p.id) &&
    p.earliestDay === p.id.slice('tc-organico-'.length) &&
    Array.isArray(p.networks) && p.networks.join(',') === 'facebook,instagram' &&
    typeof p.caption === 'string' && p.caption.includes('#' + p.id.replaceAll('-', '')) &&
    p.caption.length <= 600 && !/[<>]/.test(p.caption) &&
    typeof p.imageUrl === 'string' && p.imageUrl.startsWith(BANK_URL) &&
    /^[a-f0-9]{64}\.jpg$/.test(p.imageUrl.slice(BANK_URL.length)) &&
    p.landingUrl === 'https://' + INSTITUTIONAL_APP.prod +
      '.v2.appdeploy.ai/?utm_source=metricool&utm_medium=organic_social&utm_campaign=' + p.id;
}

if (!modes.includes(mode)) throw Error('Operación no reconocida');

if (mode === 'archive') {
  const [source] = args;
  const { releases } = read(source);
  if (!Array.isArray(releases) || releases.length > 4) throw Error('Cola inválida');
  const archives = releases.map(({ id, release }) => {
    const manifest = validatePublicManifest(release?.manifest);
    if (!manifest || manifest.revision !== id || !HASH.test(release.bankHash) ||
      !validPlan(release.campaign) || release.campaign.earliestDay !== manifest.period ||
      !Array.isArray(release.media) || release.media.length !== 6 ||
      !release.media.every((file, i) => HASH.test(file.sha256) && manifest.slides[i].imageUrl.endsWith(file.sha256) &&
        Number.isInteger(file.bytes) && file.bytes >= 1000 && file.bytes <= 200000 && file.width === 840 && file.height === 560))
      throw Error('Manifiesto no verificable');
    return { path: 'marketing/archive/' + id + '.json', content: JSON.stringify(release, null, 2) + '\n' };
  });
  emit(archives);
}

if (mode === 'metrics') {
  const [fbPath, igPath, from, to] = args;
  if (!dayPattern.test(from) || !dayPattern.test(to) || from > to ||
    Date.parse(to) - Date.parse(from) > 31 * 86_400_000) throw Error('Periodo inválido');
  function rows(path, columns) {
    const { rows } = read(path);
    if (!Array.isArray(rows) || rows.length > 500 ||
      rows.some(row => !Array.isArray(row) || row.length !== columns || !/^\d{8}$/.test(row[0])))
      throw Error('Respuesta inválida de Metricool');
    return rows;
  }
  function sum(rows, index) {
    const values = rows.map(row => row[index]).filter(value => value !== '' && value !== null);
    if (!values.length) return null;
    if (values.some(value => !/^\d+$/.test(String(value)))) throw Error('La métrica no es numérica');
    const total = values.reduce((n, value) => n + Number(value), 0);
    if (!Number.isSafeInteger(total)) throw Error('La métrica supera el rango permitido');
    return total;
  }
  const fb = rows(fbPath, 4);
  const ig = rows(igPath, 3);
  emit({ schema: 1, brandId: SOCIAL_BRAND, from, to, networks: [
    { network: 'Facebook', clicks: sum(fb, 1), impressions: sum(fb, 2), reach: sum(fb, 3), views: null },
    { network: 'Instagram', reach: sum(ig, 1), views: sum(ig, 2), clicks: null, impressions: null },
  ] });
}

if (mode === 'plan') {
  const [path, nowText] = args;
  const message = read(path);
  const p = message.plan;
  if (message.target !== 'prod' || message.organicEnabled !== true || !validPlan(p)) {
    emit(null);
  } else {
    const now = nowText ? new Date(nowText) : new Date();
    const monday = new Date(p.earliestDay + 'T00:00:00Z');
    if (!Number.isFinite(now.getTime()) || !Number.isFinite(monday.getTime()) || monday.getUTCDay() !== 1)
      throw Error('Fecha inválida');
    const zone = 'America/Santiago';
    const dates = [3, 4, 5].map(days => {
      const day = new Date(monday.getTime() + days * 86_400_000).toISOString().slice(0, 10);
      const dateTime = day + 'T19:00:00';
      const offset = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'longOffset' })
        .formatToParts(new Date(dateTime + 'Z')).find(part => part.type === 'timeZoneName').value.slice(3);
      return { dateTime, offset };
    });
    const next = dates.find(slot => Date.parse(slot.dateTime + slot.offset) > now.getTime() + 3_600_000);
    if (!next) emit(null);
    else emit({
      id: p.id,
      key: '#' + p.id.replaceAll('-', ''),
      receiptPath: 'marketing/social/' + p.id + '.json',
      blogId: SOCIAL_BRAND,
      date: next.dateTime + next.offset,
      info: {
        publicationDate: { dateTime: next.dateTime, timezone: zone },
        text: p.caption + '\n\n' + p.landingUrl,
        providers: [{ network: 'facebook' }, { network: 'instagram' }],
        draft: false, autoPublish: true, saveExternalMediaFiles: true,
      },
      mediaFiles: [p.imageUrl],
    });
  }
}
