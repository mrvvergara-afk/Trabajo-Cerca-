"""Append-only audit history and persistent candidates in a local SQLite file."""
import collections
import hashlib
import json
import sqlite3
from pathlib import Path

try:
    from .common import COMMUNES, canonical_url, utcnow
except ImportError:
    from common import COMMUNES, canonical_url, utcnow


def choose_candidates(items, limit):
    """Finite round-robin, including missing and unexpected commune hints."""
    if limit < 0:
        raise ValueError('Verification limit cannot be negative')
    groups = collections.defaultdict(collections.deque)
    for item in items:
        group = item.get('commune_query') or item.get('commune_hint') or item.get('commune') or ''
        groups[group].append(item)
    order = [place for place in COMMUNES if place in groups]
    order.extend(sorted(key for key in groups if key not in order))
    chosen = []
    while len(chosen) < limit:
        added = False
        for group in order:
            if groups[group] and len(chosen) < limit:
                chosen.append(groups[group].popleft())
                added = True
        if not added:
            break
    return chosen


class State:
    def __init__(self, path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(path)
        self.connection.row_factory = sqlite3.Row
        self.connection.executescript('''
            CREATE TABLE IF NOT EXISTS candidates (
                id TEXT PRIMARY KEY, url TEXT UNIQUE NOT NULL,
                payload TEXT NOT NULL, first_seen_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL, last_attempt_at TEXT,
                status TEXT NOT NULL DEFAULT 'pending', result TEXT
            );
            CREATE TABLE IF NOT EXISTS observations (
                id INTEGER PRIMARY KEY, candidate_id TEXT NOT NULL,
                seen_at TEXT NOT NULL, payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS attempts (
                id INTEGER PRIMARY KEY, candidate_id TEXT NOT NULL,
                checked_at TEXT NOT NULL, result TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS checkpoints (
                source TEXT PRIMARY KEY, updated_at TEXT NOT NULL,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS runs (
                id INTEGER PRIMARY KEY, completed_at TEXT NOT NULL,
                summary TEXT NOT NULL
            );
        ''')

    def close(self):
        self.connection.close()

    def ingest(self, items, now=None):
        stamp = (now or utcnow()).isoformat()
        fresh = 0
        with self.connection:
            for item in items:
                url = canonical_url(item['url'])
                identifier = hashlib.sha256(url.encode()).hexdigest()[:24]
                previous = self.connection.execute(
                    'SELECT payload FROM candidates WHERE id=?', (identifier,)).fetchone()
                old = json.loads(previous['payload']) if previous else {}
                merged = {**old, **item, 'id': identifier, 'url': url}
                hints = set(old.get('commune_queries', [])) | set(item.get('commune_queries', []))
                for record in (old, item):
                    if record.get('commune_query'):
                        hints.add(record['commune_query'])
                merged['commune_queries'] = sorted(hints)
                if old.get('commune_query'):
                    merged['commune_query'] = old['commune_query']
                # Empty recollection fields must not erase earlier evidence.
                for key in ('title', 'title_hint', 'text', 'published_at'):
                    if old.get(key) and not item.get(key):
                        merged[key] = old[key]
                payload = json.dumps(merged, ensure_ascii=False)
                if previous:
                    self.connection.execute(
                        'UPDATE candidates SET payload=?,last_seen_at=? WHERE id=?',
                        (payload, stamp, identifier))
                else:
                    fresh += 1
                    self.connection.execute(
                        'INSERT INTO candidates(id,url,payload,first_seen_at,last_seen_at) VALUES(?,?,?,?,?)',
                        (identifier, url, payload, stamp, stamp))
                self.connection.execute(
                    'INSERT INTO observations(candidate_id,seen_at,payload) VALUES(?,?,?)',
                    (identifier, stamp, json.dumps(item, ensure_ascii=False)))
        return fresh

    def choose(self, limit, now=None):
        # First exhaust never-attempted work. Then rotate through older attempts.
        import datetime as dt
        cutoff = ((now or utcnow()) - dt.timedelta(hours=24)).isoformat()
        rows = self.connection.execute('''
            SELECT * FROM candidates
            WHERE status NOT IN ('rejected', 'published')
              AND (status != 'verified' OR last_attempt_at < ?)
            ORDER BY last_attempt_at IS NOT NULL, last_attempt_at, first_seen_at, id
        ''', (cutoff,)).fetchall()
        never = [dict(json.loads(row['payload'])) for row in rows if row['last_attempt_at'] is None]
        tried = [dict(json.loads(row['payload'])) for row in rows if row['last_attempt_at'] is not None]
        # Unsupported adapters need no HTTP quota and remain visible in the inventory.
        try:
            from .verify_candidates import supported_url
        except ImportError:
            from verify_candidates import supported_url
        never = [item for item in never if supported_url(item['url'])]
        tried = [item for item in tried if supported_url(item['url'])]
        selected = choose_candidates(never, limit)
        # Keep the oldest-attempt ordering; round-robin would starve other groups
        # when the limit is lower than the number of communes.
        return selected + tried[:max(0, limit - len(selected))]

    def record_result(self, item, result, now=None):
        stamp = (now or utcnow()).isoformat()
        payload = json.dumps({**result, 'checked_at': stamp}, ensure_ascii=False)
        with self.connection:
            self.connection.execute(
                'INSERT INTO attempts(candidate_id,checked_at,result) VALUES(?,?,?)',
                (item['id'], stamp, payload))
            self.connection.execute(
                'UPDATE candidates SET status=?,result=?,last_attempt_at=? WHERE id=?',
                (result['status'], payload, stamp, item['id']))

    def inventory(self):
        rows = self.connection.execute('SELECT * FROM candidates ORDER BY first_seen_at,id').fetchall()
        return [{**json.loads(r['payload']), 'state': r['status'],
                 'first_seen_at': r['first_seen_at'], 'last_seen_at': r['last_seen_at'],
                 'last_attempt_at': r['last_attempt_at'],
                 'verification': json.loads(r['result']) if r['result'] else None} for r in rows]

    def checkpoints(self):
        return {r['source']: json.loads(r['payload']) for r in
                self.connection.execute('SELECT * FROM checkpoints')}

    def checkpoint(self, source, value, now=None):
        with self.connection:
            self.connection.execute('''
                INSERT INTO checkpoints(source,updated_at,payload) VALUES(?,?,?)
                ON CONFLICT(source) DO UPDATE SET updated_at=excluded.updated_at,payload=excluded.payload
            ''', (source, (now or utcnow()).isoformat(), json.dumps(value, ensure_ascii=False)))

    def record_run(self, summary, now=None):
        with self.connection:
            self.connection.execute('INSERT INTO runs(completed_at,summary) VALUES(?,?)',
                                    ((now or utcnow()).isoformat(), json.dumps(summary, ensure_ascii=False)))
