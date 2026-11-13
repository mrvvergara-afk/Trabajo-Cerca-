import { db, storage, json, error, increment } from '@appdeploy/sdk';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

type Kind = 'service' | 'business';
type Status = 'pending' | 'approved' | 'hidden';
type Entry = {
  id: string; kind: Kind; title: string; category: string; description: string;
  commune: string; coverage: string[]; phone: string; email: string;
  ownerEmailHash: string; showPhone: boolean; showEmail: boolean; photos: string[];
  ownerHash: string; status: Status; createdAt: string;
  reviewCount: number; ratingTotal: number; approvedAt?: string;
};
type Review = { id: string; entryId: string; emailHash: string; rating: number;
  status: 'pending' | 'approved'; createdAt: string };
type Report = { id: string; entryId: string; emailHash: string; reason: string;
  status: 'pending' | 'resolved'; createdAt: string };
const TABLE = 'tc_local_directory_v1';
const REVIEWS = 'tc_local_reviews_v1';
const REPORTS = 'tc_local_reports_v1';
const COMMUNES = [
  'Angol', 'Collipulli', 'Ercilla', 'Lumaco', 'Los Sauces', 'Purén',
  'Renaico', 'Traiguén', 'Victoria', 'Mulchén', 'Negrete', 'Nacimiento',
];
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const text = (value: unknown, max: number) =>
  String(value ?? '').trim().replace(/[<>]/g, '').slice(0, max);
const emailValid = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const phoneValid = (value: string) => /^\+?[0-9()\s-]{8,20}$/.test(value) && value.replace(/\D/g, '').length >= 8;
function localCommune(value: unknown): string | null {
  const normalized = text(value, 100).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (normalized === 'mininco' || normalized === 'villa mininco') return 'Collipulli';
  if (normalized === 'coihue' || normalized === 'coigue') return 'Negrete';
  if (normalized === 'capitan pastene') return 'Lumaco';
  return COMMUNES.find(place =>
    place.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === normalized) ?? null;
}
async function getEntry(id: string) {
  if (!/^local_[a-f0-9-]{36}$/.test(id)) return null;
  const [entry] = await db.get<Entry>(TABLE, [id], { consistent: true });
  return entry ? { ...entry, id } : null;
}
export async function listLocalDirectory(query: Record<string, string>) {
  const place = query.place === 'Todas' ? null : localCommune(query.place || 'Angol');
  if (!place && query.place !== 'Todas') return error('La comuna no pertenece al territorio.', 400);
  const kind = query.kind === 'business' ? 'business' : 'service';
  const result = await db.list<Entry>(TABLE, { limit: 120 });
  const matching = result.items.filter(item =>
    item.status === 'approved' && item.kind === kind &&
    (!place || item.commune === place || item.coverage.includes(place))).slice(0, 48);
  const paths = matching.flatMap(item => item.photos).slice(0, 120);
  const urls = paths.length ? await storage.url(paths) : [];
  const map = new Map(urls.map(item => [item.path, item.url]));
  return json({
    items: matching.map(item => ({
      id: item.id, kind: item.kind, title: item.title, category: item.category,
      description: item.description, commune: item.commune, coverage: item.coverage,
      photos: item.photos.map(path => map.get(path)).filter(Boolean),
      createdAt: item.createdAt, contactAvailable: item.showPhone || item.showEmail,
      reviewCount: item.reviewCount,
      rating: item.reviewCount >= 3
        ? Math.round((item.ratingTotal / item.reviewCount) * 10) / 10 : null,
      reviewsAreVerified: false,
    })),
    partial: Boolean(result.nextToken),
  });
}
export async function createLocalDirectory(body: unknown) {
  const input = (body ?? {}) as Record<string, unknown>;
  const kind = input.kind === 'service' || input.kind === 'business' ? input.kind : null;
  const commune = localCommune(input.commune);
  const title = text(input.title, 90);
  const category = text(input.category, 60);
  const description = text(input.description, 750);
  const phone = text(input.phone, 24);
  const email = text(input.email, 120).toLowerCase();
  if (!kind || !commune || title.length < 3 || !category || description.length < 15)
    return error('Completa el oficio o negocio, la comuna y la descripción.', 400);
  if (!emailValid(email) || !phoneValid(phone))
    return error('Debes informar un correo y teléfono de contacto válidos.', 400);
  if (input.consent !== true || (input.showEmail !== true && input.showPhone !== true))
    return error('Autoriza la publicación y al menos una vía de contacto.', 400);
  const images = Array.isArray(input.photos) ? input.photos : [];
  if (images.length > 3) return error('Se admiten hasta tres fotografías.', 400);
  const encodedImages: string[] = [];
  for (const original of images) {
    if (typeof original !== 'string' || original.length > 310000 || !/^[A-Za-z0-9+/]+=*$/.test(original))
      return error('La fotografía tiene un formato o tamaño inválido.', 400);
    let bytes: string;
    try { bytes = atob(original); }
    catch { return error('El archivo de imagen no se pudo decodificar.', 400); }
    if (bytes.length < 300 || bytes.length > 225000 ||
        bytes.charCodeAt(0) !== 0xff || bytes.charCodeAt(1) !== 0xd8 || bytes.charCodeAt(2) !== 0xff ||
        bytes.includes('Exif\u0000\u0000') || bytes.includes('http://ns.adobe.com/xap/'))
      return error('Solo se aceptan JPEG optimizados sin EXIF.', 400);
    encodedImages.push(original);
  }
  const id = 'local_' + randomUUID();
  const ownerToken = randomBytes(24).toString('hex');
  const paths = encodedImages.map((_, index) => 'local-directory/' + id + '/' + index + '.jpg');
  if (paths.length) {
    const result = await storage.write(paths.map((path, index) => ({
      path, content: encodedImages[index], contentType: 'image/jpeg',
    })));
    if (result.length !== paths.length || result.some(ok => !ok))
      return error('No se pudieron guardar las imágenes.', 503);
  }
  const entry: Entry = {
    id, kind, title, category, description, commune, coverage: [commune],
    phone, email, ownerEmailHash: sha(email), showPhone: input.showPhone === true,
    showEmail: input.showEmail === true, photos: paths, ownerHash: sha(ownerToken),
    status: 'pending', createdAt: new Date().toISOString(),
    reviewCount: 0, ratingTotal: 0,
  };
  try {
    const [saved] = await db.tx.add(TABLE, [entry]);
    if (!saved) return error('No se pudo confirmar el envío.', 503);
    return json({ received: true, pendingModeration: true, id, ownerToken }, 202);
  } catch (cause) {
    console.warn('LOCAL_DIRECTORY_UNCERTAIN ' + String(cause).slice(0, 140));
    return error('No se confirmó el registro. Solicita revisión antes de repetir el envío.', 503);
  }
}
export async function localDirectoryContact(id: string) {
  const entry = await getEntry(id);
  if (!entry || entry.status !== 'approved') return error('Publicación no disponible.', 404);
  if (!entry.showPhone && !entry.showEmail) return error('El contacto no está autorizado.', 404);
  return json({ phone: entry.showPhone ? entry.phone : null,
    email: entry.showEmail ? entry.email : null });
}
export async function localDirectoryRemove(id: string, body: unknown) {
  const entry = await getEntry(id);
  const token = text((body as Record<string, unknown> | null)?.ownerToken, 80);
  if (!entry || !token || sha(token) !== entry.ownerHash) return error('Sin autorización.', 403);
  const [ok] = await db.tx.update(TABLE, [{
    id, record: { status: 'hidden', phone: '', email: '', showPhone: false, showEmail: false },
  }], { patch: true });
  if (!ok) return error('No fue posible retirar la publicación.', 503);
  if (entry.photos.length) await storage.delete(entry.photos);
  return json({ removed: true });
}
export async function submitLocalReview(id: string, body: unknown) {
  const entry = await getEntry(id);
  const input = (body ?? {}) as Record<string, unknown>;
  const email = text(input.email, 120).toLowerCase();
  const rating = Number(input.rating);
  if (!entry || entry.status !== 'approved' || entry.kind !== 'service')
    return error('Servicio no disponible.', 404);
  if (!emailValid(email) || !Number.isInteger(rating) || rating < 1 || rating > 5 || input.hired !== true)
    return error('Se requiere un correo, la puntuación y declaración de contratación.', 400);
  const digest = sha(email);
  if (digest === entry.ownerEmailHash) return error('No puedes evaluar tu propio servicio.', 400);
  const reviewId = 'review_' + sha(id + ':' + digest);
  const review: Review = {
    id: reviewId, entryId: id, emailHash: digest, rating,
    status: 'pending', createdAt: new Date().toISOString(),
  };
  const [ok] = await db.tx.add(REVIEWS, [review]);
  if (!ok) return error('Este contacto ya evaluó el servicio.', 409);
  return json({ received: true, pendingModeration: true, verifiedHire: false }, 202);
}
export async function reportLocalDirectory(id: string, body: unknown) {
  const entry = await getEntry(id);
  const input = (body ?? {}) as Record<string, unknown>;
  const email = text(input.email, 120).toLowerCase();
  const reason = text(input.reason, 80);
  if (!entry || entry.status !== 'approved' || !emailValid(email) ||
      !['Información incorrecta', 'Posible estafa', 'Imágenes no autorizadas', 'Otro'].includes(reason))
    return error('Denuncia inválida.', 400);
  const report: Report = {
    id: 'report_' + randomUUID(), entryId: id, emailHash: sha(email), reason,
    status: 'pending', createdAt: new Date().toISOString(),
  };
  const [ok] = await db.tx.add(REPORTS, [report]);
  return ok ? json({ received: true }, 202) : error('No se pudo registrar la denuncia.', 503);
}
export async function adminLocalQueue() {
  const [entries, reviews, reports] = await Promise.all([
    db.list<Entry>(TABLE, { limit: 100 }),
    db.list<Review>(REVIEWS, { limit: 100 }),
    db.list<Report>(REPORTS, { limit: 100 }),
  ]);
  return json({
    entries: entries.items.filter(item => item.status === 'pending'),
    reviews: reviews.items.filter(item => item.status === 'pending'),
    reports: reports.items.filter(item => item.status === 'pending'),
    partial: Boolean(entries.nextToken || reviews.nextToken || reports.nextToken),
  });
}
export async function adminLocalDecision(id: string, status: 'approved' | 'hidden') {
  const entry = await getEntry(id);
  if (!entry || entry.status !== 'pending') return error('Ficha no pendiente.', 409);
  const [ok] = await db.tx.update(TABLE, [{
    id, record: { status, approvedAt: status === 'approved' ? new Date().toISOString() : null },
    if: { status: 'pending' },
  }], { patch: true });
  return ok ? json({ status }) : error('Estado no confirmado.', 409);
}
export async function adminApproveLocalReview(id: string) {
  if (!/^review_[a-f0-9]{64}$/.test(id)) return error('Evaluación inválida.', 400);
  const [review] = await db.get<Review>(REVIEWS, [id], { consistent: true });
  if (!review || review.status !== 'pending') return error('Evaluación no pendiente.', 409);
  const entry = await getEntry(review.entryId);
  if (!entry || entry.status !== 'approved') return error('Servicio no disponible.', 409);
  await db.transact([
    db.tx.update(REVIEWS, [{ id, record: { status: 'approved' }, if: { status: 'pending' } }], { patch: true }),
    db.tx.update(TABLE, [{
      id: review.entryId,
      record: { reviewCount: increment(1), ratingTotal: increment(review.rating) },
    }], { patch: true }),
  ]);
  return json({ approved: true });
}
export async function adminResolveLocalReport(id: string) {
  if (!/^report_[a-f0-9-]{36}$/.test(id)) return error('Denuncia inválida.', 400);
  const [ok] = await db.tx.update(REPORTS, [{ id, record: { status: 'resolved' } }], { patch: true });
  return ok ? json({ resolved: true }) : error('Denuncia no encontrada.', 404);
}
