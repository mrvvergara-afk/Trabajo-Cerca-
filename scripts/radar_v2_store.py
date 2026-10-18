"""Isolated durable work queue and content-addressed evidence. Never deletes legacy data."""
import datetime as dt
import base64
import gzip
import hashlib
import json
import os
import sqlite3
import tempfile
import uuid
from pathlib import Path

from .common import utcnow

MAX_OBJECT_BYTES = 8 * 1024 * 1024
# Scanned municipal bases can exceed the image/object limit. Keep the archive
# ceiling unchanged, and use the larger limit only for original PDF bytes.
MAX_PDF_BYTES = 16 * 1024 * 1024
MAX_ARCHIVE_BYTES = 32 * 1024 * 1024
KINDS = {'web','social','media','page','evaluate'}
OBSERVATION_ENCODING='trabajo-cerca.pilot-observation.gzip.v1'


def compact_payload(raw):
    """Losslessly encode large repeated audit payloads; keep every observation."""
    data=raw.encode()
    if len(data)<512:return raw
    value=json.dumps({'schema':OBSERVATION_ENCODING,'sha256':hashlib.sha256(data).hexdigest(),
                      'gzip_base64':base64.b64encode(gzip.compress(data,mtime=0)).decode()},sort_keys=True)
    return value if len(value.encode())<len(data) else raw


def observation_payload(raw):
    import io
    value=json.loads(raw)
    if value.get('schema')!=OBSERVATION_ENCODING:return raw
    with gzip.GzipFile(fileobj=io.BytesIO(base64.b64decode(value['gzip_base64'],validate=True))) as handle:
        data=handle.read(80001)
    if len(data)>80000 or hashlib.sha256(data).hexdigest()!=value['sha256']:
        raise ValueError('Observation payload integrity failure')
    return data.decode()


class PilotStore:
    def __init__(self, root):
        self.root=Path(root);self.root.mkdir(parents=True,exist_ok=True)
        (self.root/'objects').mkdir(exist_ok=True)
        self.connection=sqlite3.connect(self.root/'pilot.sqlite3')
        self.connection.row_factory=sqlite3.Row
        self.connection.executescript('''
          CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,kind TEXT,key TEXT,payload TEXT,
            status TEXT DEFAULT 'queued',attempts INTEGER DEFAULT 0,available_at TEXT,
            lease_until TEXT,lease_token TEXT,result TEXT,created_at TEXT);
          CREATE TABLE IF NOT EXISTS attempts(id INTEGER PRIMARY KEY,job_id TEXT,attempt INTEGER,
            started_at TEXT,finished_at TEXT,result TEXT);
          CREATE TABLE IF NOT EXISTS observations(id INTEGER PRIMARY KEY,job_id TEXT,observed_at TEXT,payload TEXT);
          CREATE TABLE IF NOT EXISTS runs(id INTEGER PRIMARY KEY,completed_at TEXT,summary TEXT);
          CREATE TABLE IF NOT EXISTS objects(sha256 TEXT PRIMARY KEY,bytes INTEGER,mime TEXT);
        ''')

    def close(self):self.connection.close()

    def enqueue(self,kind,key,payload,now=None):
        if kind not in KINDS:raise ValueError('Unsupported pilot work kind')
        if not isinstance(key,str) or not key or len(key)>3000:raise ValueError('Invalid work identity')
        raw=json.dumps(payload,ensure_ascii=False,sort_keys=True)
        if len(raw.encode())>80000:raise ValueError('Work payload exceeds budget')
        stamp=(now or utcnow()).isoformat();identity=hashlib.sha256((kind+'\0'+key).encode()).hexdigest()
        self.connection.execute('INSERT OR IGNORE INTO jobs(id,kind,key,payload,available_at,created_at) VALUES(?,?,?,?,?,?)',
          (identity,kind,key,raw,stamp,stamp))
        self.connection.execute('INSERT INTO observations(job_id,observed_at,payload) VALUES(?,?,?)',(identity,stamp,compact_payload(raw)))
        return identity

    def seed(self,kind,key,payload,now=None):
        with self.connection:return self.enqueue(kind,key,payload,now)

    def claim(self,now=None,lease_seconds=150,*,kinds=None):
        now=now or utcnow();stamp=now.isoformat()
        if kinds is not None and (not kinds or not set(kinds)<=KINDS):raise ValueError('Unsupported work filter')
        clause=' AND kind IN ('+','.join('?' for _ in kinds)+')' if kinds else ''
        self.connection.execute('BEGIN IMMEDIATE')
        try:
            self.connection.execute("UPDATE jobs SET status='retry',available_at=?,lease_token=NULL,lease_until=NULL WHERE status='running' AND lease_until<=?",(stamp,stamp))
            row=self.connection.execute("SELECT * FROM jobs WHERE status IN ('queued','retry') AND available_at<=?"+clause+
                " ORDER BY CASE WHEN kind='evaluate' THEN 0 ELSE 1 END,attempts,created_at,id LIMIT 1",
                (stamp,*(kinds or ()))).fetchone()
            if not row:self.connection.commit();return None
            token=uuid.uuid4().hex;until=(now+dt.timedelta(seconds=lease_seconds)).isoformat()
            attempt=row['attempts']+1
            self.connection.execute("UPDATE jobs SET status='running',attempts=?,lease_token=?,lease_until=? WHERE id=?",(attempt,token,until,row['id']))
            self.connection.execute('INSERT INTO attempts(job_id,attempt,started_at) VALUES(?,?,?)',(row['id'],attempt,stamp))
            self.connection.commit()
            return {**dict(row),'payload':json.loads(row['payload']),'attempts':attempt,'lease_token':token}
        except BaseException:self.connection.rollback();raise

    def finish(self,job,result,children=(),now=None):
        now=now or utcnow();raw=json.dumps(result,ensure_ascii=False,sort_keys=True)
        with self.connection:
            row=self.connection.execute('SELECT * FROM jobs WHERE id=?',(job['id'],)).fetchone()
            if not row or row['status']!='running' or row['lease_token']!=job['lease_token'] or row['lease_until']<=now.isoformat():
                raise ValueError('Stale work lease; preserve newer attempt')
            for kind,key,payload in children:self.enqueue(kind,key,payload,now)
            self.connection.execute("UPDATE jobs SET status='done',result=?,lease_token=NULL,lease_until=NULL WHERE id=?",(raw,job['id']))
            self.connection.execute('UPDATE attempts SET finished_at=?,result=? WHERE job_id=? AND attempt=?',
              (now.isoformat(),raw,job['id'],job['attempts']))

    def fail(self,job,reason,now=None):
        now=now or utcnow();delay=min(14400,60*2**min(job['attempts']-1,8))
        raw=json.dumps({'status':'pending','reason':reason})
        with self.connection:
            cursor=self.connection.execute("UPDATE jobs SET status=?,available_at=?,result=?,lease_token=NULL,lease_until=NULL WHERE id=? AND status='running' AND lease_token=?",
              ('blocked' if job['attempts']>=3 else 'retry',(now+dt.timedelta(seconds=delay)).isoformat(),raw,job['id'],job['lease_token']))
            if cursor.rowcount!=1:raise ValueError('Stale failed work lease')
            self.connection.execute('UPDATE attempts SET finished_at=?,result=? WHERE job_id=? AND attempt=?',(now.isoformat(),raw,job['id'],job['attempts']))

    def put(self,data,mime):
        if not isinstance(data,bytes):raise ValueError('Evidence object exceeds budget')
        maximum=MAX_PDF_BYTES if mime=='application/pdf' and data.startswith(b'%PDF-') else MAX_OBJECT_BYTES
        if len(data)>maximum:raise ValueError('Evidence object exceeds budget')
        identity=hashlib.sha256(data).hexdigest();path=self.root/'objects'/identity
        if path.exists():
            if hashlib.sha256(path.read_bytes()).hexdigest()!=identity:raise ValueError('Stored evidence hash mismatch')
        else:
            total=self.connection.execute('SELECT coalesce(sum(bytes),0) FROM objects').fetchone()[0]
            known=self.connection.execute('SELECT bytes FROM objects WHERE sha256=?',(identity,)).fetchone()
            if total+(0 if known else len(data))>MAX_ARCHIVE_BYTES:raise ValueError('Evidence archive budget reached; retain previous data')
            with tempfile.NamedTemporaryFile(dir=path.parent,delete=False) as file:
                temporary=Path(file.name);file.write(data)
            try:
                try:os.link(temporary,path)
                except FileExistsError:
                    if hashlib.sha256(path.read_bytes()).hexdigest()!=identity:raise ValueError('Evidence identity conflict')
            finally:temporary.unlink(missing_ok=True)
        with self.connection:self.connection.execute('INSERT OR IGNORE INTO objects VALUES(?,?,?)',(identity,len(data),mime))
        return identity

    def object(self,identity):
        if not isinstance(identity,str) or len(identity)!=64 or any(c not in '0123456789abcdef' for c in identity):raise ValueError('Invalid evidence identity')
        path=self.root/'objects'/identity
        if hashlib.sha256(path.read_bytes()).hexdigest()!=identity:raise ValueError('Evidence hash mismatch')
        return path

    def results(self):
        return [{'id':row['id'],'kind':row['kind'],'key':row['key'],'status':row['status'],'attempts':row['attempts'],
                 'completed_at':row['completed_at'],
                 'payload':json.loads(row['payload']),'result':json.loads(row['result']) if row['result'] else None}
                for row in self.connection.execute('''SELECT jobs.*,
                  (SELECT finished_at FROM attempts WHERE job_id=jobs.id ORDER BY attempt DESC LIMIT 1) AS completed_at
                  FROM jobs ORDER BY created_at,id''')]

    def counts(self):
        return {'jobs':self.connection.execute('SELECT count(*) FROM jobs').fetchone()[0],
          'runs':self.connection.execute('SELECT count(*) FROM runs').fetchone()[0],
          'observed_days':self.connection.execute('SELECT count(DISTINCT substr(completed_at,1,10)) FROM runs').fetchone()[0],
          'attempts':self.connection.execute('SELECT count(*) FROM attempts').fetchone()[0],
          'observations':self.connection.execute('SELECT count(*) FROM observations').fetchone()[0],
          'objects':self.connection.execute('SELECT count(*) FROM objects').fetchone()[0],
          'statuses':{row[0]:row[1] for row in self.connection.execute('SELECT status,count(*) FROM jobs GROUP BY status')}}

    def snapshot(self,destination):
        destination=Path(destination);destination.mkdir(parents=True,exist_ok=True)
        # Earlier snapshots repeated uncompressed OCR text on every assembly pass.
        # Encode that text reversibly; neither rows nor original evidence are deleted.
        with self.connection:
            for row in self.connection.execute('SELECT id,payload FROM observations').fetchall():
                raw=row['payload']
                if json.loads(raw).get('schema')==OBSERVATION_ENCODING:
                    observation_payload(raw)
                    continue
                compact=compact_payload(raw)
                if compact!=raw:self.connection.execute('UPDATE observations SET payload=? WHERE id=?',(compact,row['id']))
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'copy.sqlite3'
            with sqlite3.connect(path) as target:self.connection.backup(target)
            with sqlite3.connect(path) as checked:
                checked.execute('VACUUM')
                if checked.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise ValueError('Pilot SQLite integrity failure')
            data=path.read_bytes()
        if len(data)>16*1024*1024:raise ValueError('Pilot state snapshot exceeds budget')
        archive=gzip.compress(data,mtime=0)
        objects={row['sha256']:{'bytes':row['bytes'],'mime':row['mime']} for row in self.connection.execute('SELECT * FROM objects')}
        for identity in objects:self.object(identity)
        manifest={'schema':'trabajo-cerca.radar-v2-backup.v1','sqlite_sha256':hashlib.sha256(data).hexdigest(),
          'archive_sha256':hashlib.sha256(archive).hexdigest(),'bytes':len(data),'archive_bytes':len(archive),'counts':self.counts(),'objects':objects}
        (destination/'pilot.sqlite3.gz').write_bytes(archive)
        (destination/'manifest.json').write_text(json.dumps(manifest,sort_keys=True)+'\n')
        return manifest


def restore(archive,manifest_path,root,object_reader):
    root=Path(root)
    root.parent.mkdir(parents=True,exist_ok=True)
    if (root/'pilot.sqlite3').exists():raise ValueError('Refuse to replace an existing pilot database')
    metadata=json.loads(Path(manifest_path).read_text());raw=Path(archive).read_bytes()
    if metadata.get('schema')!='trabajo-cerca.radar-v2-backup.v1' or hashlib.sha256(raw).hexdigest()!=metadata.get('archive_sha256') or len(raw)!=metadata.get('archive_bytes'):
        raise ValueError('Pilot archive mismatch')
    import io
    with gzip.GzipFile(fileobj=io.BytesIO(raw)) as handle:data=handle.read(16*1024*1024+1)
    if len(data)>16*1024*1024 or len(data)!=metadata['bytes'] or hashlib.sha256(data).hexdigest()!=metadata['sqlite_sha256']:raise ValueError('Pilot SQLite hash mismatch')
    with tempfile.TemporaryDirectory(dir=root.parent) as folder:
        temporary=Path(folder);(temporary/'pilot.sqlite3').write_bytes(data)
        staged=PilotStore(temporary)
        try:
            actual=staged.counts();declared=metadata['counts']
            required={'jobs','attempts','observations','objects','statuses'}
            if (staged.connection.execute('PRAGMA integrity_check').fetchone()[0]!='ok' or
                    not required.issubset(declared) or any(actual.get(key)!=value for key,value in declared.items())):raise ValueError('Pilot snapshot integrity failure')
            for identity,fields in metadata['objects'].items():
                if len(identity)!=64 or any(c not in '0123456789abcdef' for c in identity):raise ValueError('Invalid evidence identity in snapshot')
                value=object_reader(identity)
                if len(value)!=fields['bytes'] or staged.put(value,fields['mime'])!=identity:raise ValueError('Pilot evidence object mismatch')
        finally:staged.close()
        root.mkdir(parents=True,exist_ok=True);(root/'objects').mkdir(exist_ok=True)
        for source in (temporary/'objects').iterdir():
            target=root/'objects'/source.name
            if target.exists() and target.read_bytes()!=source.read_bytes():raise ValueError('Existing evidence conflict')
            if not target.exists():os.link(source,target)
        os.link(temporary/'pilot.sqlite3',root/'pilot.sqlite3')
    return metadata
