"""Verified SQLite snapshots. Git history supplies retention; never overwrite on restore failure."""
import gzip
import hashlib
import json
import os
import sqlite3
import tempfile
from pathlib import Path

MAX_BACKUP_BYTES = 16 * 1024 * 1024


def counts(connection):
    tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    required = {'candidates', 'observations', 'attempts', 'checkpoints', 'runs'}
    if not required.issubset(tables):
        raise ValueError('Backup is missing required history tables')
    return {name: connection.execute('SELECT count(*) FROM ' + name).fetchone()[0]
            for name in sorted(required)}


def inspect(path):
    with sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True) as connection:
        if connection.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise ValueError('SQLite integrity check failed')
        return counts(connection)


def snapshot(state_path, destination):
    state_path, destination = Path(state_path), Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=destination) as temporary:
        copy = Path(temporary) / 'snapshot.sqlite3'
        with sqlite3.connect(state_path.resolve().as_uri() + '?mode=ro', uri=True) as source:
            with sqlite3.connect(copy) as target:
                source.backup(target)
        history = inspect(copy)
        data = copy.read_bytes()
        if len(data) > MAX_BACKUP_BYTES:
            raise ValueError('Backup exceeds the bounded Git storage size; preserve state and review storage')
        compressed = gzip.compress(data, mtime=0)
        archive = destination / 'radar.sqlite3.gz'
        manifest = {'schema':'trabajo-cerca.backup.v1', 'sqlite_sha256':hashlib.sha256(data).hexdigest(),
                    'archive_sha256':hashlib.sha256(compressed).hexdigest(), 'bytes':len(data),
                    'archive_bytes':len(compressed), 'counts':history}
        archive.write_bytes(compressed)
        (destination / 'manifest.json').write_text(json.dumps(manifest, sort_keys=True) + '\n')
        return manifest


def restore(archive, manifest, target):
    target = Path(target)
    if target.exists():
        raise ValueError('Restore never replaces an existing history database')
    archive = Path(archive).read_bytes()
    manifest = json.loads(Path(manifest).read_text())
    if manifest.get('schema') != 'trabajo-cerca.backup.v1' or len(archive) > MAX_BACKUP_BYTES:
        raise ValueError('Invalid or oversized backup')
    if len(archive) != manifest.get('archive_bytes') or hashlib.sha256(archive).hexdigest() != manifest.get('archive_sha256'):
        raise ValueError('Backup archive hash mismatch')
    import io
    with gzip.GzipFile(fileobj=io.BytesIO(archive)) as handle:
        data = handle.read(MAX_BACKUP_BYTES + 1)
    if len(data) > MAX_BACKUP_BYTES or len(data) != manifest.get('bytes') or hashlib.sha256(data).hexdigest() != manifest.get('sqlite_sha256'):
        raise ValueError('SQLite backup hash or size mismatch')
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(data)
        if inspect(temporary) != manifest.get('counts'):
            raise ValueError('Backup history counts mismatch')
        # Link creation is atomic and refuses an existing target, even in a race.
        os.link(temporary, target)
    finally:
        if temporary:
            temporary.unlink(missing_ok=True)
    return manifest
