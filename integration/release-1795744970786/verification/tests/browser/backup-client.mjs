const revision = 'application-backup-v4';
export const tables = [
  'growth_house_autonomy', 'growth_house_versions', 'growth_house_organic_metrics',
  'growth_house_organic_effects', 'municipal_open_recheck_state', 'territory_repair_audit',
];
export const auth = {};
export const api = {
  async post(path, body) {
    if (path !== '/api/admin/backup/page') throw new Error('Ruta de prueba inesperada');
    window.tcBackupReads ??= [];
    window.tcBackupReads.push(body);
    if (body.kind === 'scope') return { data: { kind: 'scope', revision, tables } };
    if (body.revision !== revision) throw new Error('Revisión de prueba inesperada');
    if (body.kind === 'table') {
      const offset = body.cursor === 'second' ? 2 : 1;
      if (offset === 2 && !window.tcBackupInterrupted) {
        window.tcBackupInterrupted = true;
        throw Object.assign(new Error('Interrupción simulada'), { status: 503 });
      }
      const nextToken = body.table === tables[0] && offset === 1 ? 'second' : null;
      return { data: {
        kind: 'table', revision, table: body.table, nextToken,
        items: [{ id: 'same-logical-id', __appdeploy_ddb_id: body.table + ':' + offset, sample: 'contenido-privado-sintetico' }],
      } };
    }
    const pathInBackup = 'institutional-bank/foto-qa.webp';
    if (body.kind === 'storage') return { data: { kind: 'storage', revision, paths: [pathInBackup] } };
    if (body.kind === 'file' && body.path === pathInBackup) return {
      data: { kind: 'file', revision, path: pathInBackup, content: 'AAECAw==' },
    };
    throw new Error('Lectura de prueba inesperada');
  },
};
