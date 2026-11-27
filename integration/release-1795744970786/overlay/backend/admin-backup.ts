import { db, storage, json, error, isAppDatabaseError, type RouterContext } from '@appdeploy/sdk';

const BACKUP_REVISION = 'application-backup-v3';

export const BACKUP_TABLES = [
  'radar_admin_verification_queue',
  'radar_admin_verification_control',
  'radar_review_inbox',
  'free_public_source_cursor_v3',
  'fast_bc_state_v2',
  'fast_bc_documents_v1',
  'tc_document_attempts_v1',
  'tc_document_receipts_v1',
  'motor_b_c_idle_cursor_v2',
  'gemini_github_pull_status',
  'fast_bc_html_decisions_v1', 'fast_bc_html_status_v1', 'bc_stage_execution_receipts_v1', 'fast_bc_pipeline_latest',
  'trabajando_targeted_state', 'motor_d_bridge_status', 'engine_telemetry_snapshots_v1',
  'growth_commercial_metrics', 'growth_commercial_events', 'growth_commercial_config', 'growth_trial_entitlements', 'growth_commercial_audit', 'growth_house_config', 'growth_house_metrics', 'growth_house_events', 'community_posts', 'free_public_run_leases', 'free_public_source_reads', 'free_public_source_runs',
  'growth_advertiser_leads', 'growth_campaigns', 'growth_social_queue', 'hard_exa_cursor', 'motor3_web_cursor',
  'notification_dispatch_log', 'notification_dispatch_state', 'notification_preferences', 'notification_user_dispatch',
  'tc_local_directory_v1', 'tc_local_reviews_v1', 'tc_local_reports_v1',
  'public_feed_last_good',
  'public_feed_build_state', 'public_feed_changes', 'public_feed_control', 'public_feed_identity_policy',
  'public_feed_manifests', 'public_feed_versions', 'radar_candidates', 'radar_document_revalidation_receipts',
  'radar_document_revalidation_state', 'radar_empty_recovery', 'radar_enrichment_cursor',
  'radar_external_pull_state', 'radar_jobs', 'radar_live_tests', 'radar_local_contact_rechecks',
  'radar_meta', 'radar_social_recovery_cursor', 'radar_sources', 'radar_verification_cursor',
  'security_request_limits', 'chatgpt_import_receipts', 'motor_d_import_receipts',
  'social_capture_runs', 'social_notice_evidence', 'source_audits', 'source_meta', 'source_scan_state'
];

export function backupTableAllowed(table: unknown): table is string {
  return typeof table === 'string' && (BACKUP_TABLES.includes(table) || /^radar_external_[a-f0-9]{32}$/.test(table) || /^public_feed_page_[0-9]{1,8}$/.test(table));
}

function privateResponse(data: unknown) {
  const response = json(data);
  response.headers = { ...response.headers, 'Cache-Control': 'no-store, private', 'Vary': 'Authorization', 'X-Content-Type-Options': 'nosniff' };
  return response;
}

// Mounted only after requireAuth + requireAdminEmailAllowlist in index.ts.
// Reads one bounded page or one object. No writes, retries or growing-table drain.
async function readBackupPage(ctx: RouterContext) {
  const body = (ctx.body || {}) as Record<string, unknown>;
  if (body.kind === 'scope') return privateResponse({ kind: 'scope', tables: BACKUP_TABLES, revision: BACKUP_REVISION, consistency: 'rolling_non_atomic', fullPlatformBackup: false, restoreValidated: false, warning: 'Exportación parcial paginada; no es un respaldo restaurable verificado. Conservar todos los cursores y validar restauración en entorno aislado.' });
  if (body.revision !== undefined && body.revision !== BACKUP_REVISION)
    return error('La versión del exportador cambió durante la copia.', 409);
  const cursor = body.cursor;
  if (cursor !== undefined && cursor !== null && (typeof cursor !== 'string' || cursor.length > 16000)) return error('Cursor inválido.', 400);
  const options = { limit: 5, ...(typeof cursor === 'string' && cursor ? { nextToken: cursor } : {}) };
  if (body.kind === 'table') {
    if (!backupTableAllowed(body.table)) return error('Tabla fuera del ámbito autorizado.', 400);
    const page = await db.list(body.table, { ...options, appdeploy_system_id: true });
    if (page.items.some(row => typeof row.__appdeploy_ddb_id !== 'string' || !row.__appdeploy_ddb_id))
      return error('Página sin clave física de base de datos.', 409);
    if (Buffer.byteLength(JSON.stringify(page), 'utf8') > 1500000) return error('Página demasiado grande para una descarga segura.', 413);
    return privateResponse({ kind: 'table', revision: BACKUP_REVISION, table: body.table, items: page.items, nextToken: page.nextToken || null });
  }
  if (body.kind === 'storage') {
    const page = await storage.list({ ...options, limit: 5 });
    if (Buffer.byteLength(JSON.stringify(page), 'utf8') > 1500000) return error('Página de archivos demasiado grande.', 413);
    return privateResponse({ kind: 'storage', revision: BACKUP_REVISION, paths: page.paths, nextToken: page.nextToken || null });
  }
  if (body.kind === 'file' || body.kind === 'file-status') {
    const path = body.path;
    if (typeof path !== 'string' || !path || path.length > 1024 || path.startsWith('/') || path.includes('\\') || path.split('/').some(part => !part || part === '..' || part === '.')) return error('Ruta inválida.', 400);
    const [file] = await storage.read([path]);
    if (body.kind === 'file-status') return privateResponse({ kind: 'file-status', available: Boolean(file && file.path === path && typeof file.content === 'string'), bytes: file?.content === null || file?.content === undefined ? null : Buffer.byteLength(file.content, 'utf8') });
    if (!file || file.path !== path || file.content === null) return error('El archivo no está disponible. La copia está incompleta.', 409);
    if (Buffer.byteLength(file.content, 'utf8') > 1500000) return error('Archivo demasiado grande para este exportador. Requiere respaldo de plataforma.', 413);
    return privateResponse({ kind: 'file', revision: BACKUP_REVISION, path, content: file.content });
  }
  return error('Operación de respaldo inválida.', 400);
}

export async function adminBackupPage(ctx: RouterContext) {
  try {
    return await readBackupPage(ctx);
  } catch (cause: unknown) {
    const code = isAppDatabaseError(cause) ? cause.code : 'UnknownReadFailure';
    const quota = code === 'AppDatabaseQuotaExceeded';
    const incomplete = code === 'AppDatabaseReadIncomplete';
    const body = (ctx.body || {}) as Record<string, unknown>;
    console.warn('backup_export_read_failed', {
      kind: ['scope','table','storage','file','file-status'].includes(String(body.kind)) ? body.kind : 'unknown',
      table: backupTableAllowed(body.table) ? body.table : undefined,
      code
    });
    const response = json({ error: quota ? 'Cuota de lectura alcanzada.' : 'No se completó la lectura del respaldo.', code: quota ? 'backup_quota' : incomplete ? 'backup_read_incomplete' : 'backup_read_failed' }, quota ? 429 : 503);
    response.headers = { ...response.headers, 'Cache-Control': 'no-store, private', 'Vary': 'Authorization' };
    return response;
  }
}

