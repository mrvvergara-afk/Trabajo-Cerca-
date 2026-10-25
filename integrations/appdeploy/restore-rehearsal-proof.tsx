import { useEffect, useState } from 'react';
import { beginEncryptedBackup, appendEncrypted } from './backup-crypto';
import { rehearseRestore } from './restore-rehearsal';
import { auditBackupStorage } from './storage-audit';

export function RestoreRehearsalProof() {
  const [result, setResult] = useState<unknown>({ running: true });
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const password = 'synthetic-browser-fixture-only';
        const { envelope, key } = await beginEncryptedBackup(password);
        await appendEncrypted(envelope, key, { kind: 'table', table: 'community_posts', items: [{ id: 'fixture-old', active: false, evidenceImagePath: 'fixture-missing.png', mediaUrl: 'https://example.org/fixture.png', ownerToken: 'synthetic-fixture-only', sourcePublishedAt: '2026-10-01T00:00:00Z' }] });
        await appendEncrypted(envelope, key, { kind: 'table', table: 'notification_preferences', items: [{ id: 'fixture-preference', active: true, communes: ['Angol'] }] });
        await appendEncrypted(envelope, key, { kind: 'file', path: 'fixture.png', content: 'AAECAw==' });
        await appendEncrypted(envelope, key, { kind: 'manifest', appId: 'trabajo-cerca-laboratorio-3ojgro', complete: true, tables: [{ table: 'community_posts', count: 1 }, { table: 'notification_preferences', count: 1 }], files: 1, parts: envelope.parts.length });
        const report = await rehearseRestore(JSON.stringify(envelope), password);
        const storageAuditFixture = await auditBackupStorage(JSON.stringify(envelope), password, async body => body.kind === 'storage' ? { kind: 'storage', paths: [] } : { kind: 'file-status', available: false });
        if (active) setResult({ ...report, storageAuditFixture });
      } catch { if (active) setResult({ error: 'local_restore_fixture_failed' }); }
    })();
    return () => { active = false; };
  }, []);
  return <pre id='restore-local-proof' style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(result, null, 2)}</pre>;
}
