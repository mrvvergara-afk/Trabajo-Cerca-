"""Restore the durable data ref, or import every bounded available legacy archive before first use."""
import os
import zipfile
from pathlib import Path, PurePosixPath

try:
    from .import_artifacts import import_reports
    from .laboratory_exchange import restore_from_git
    from .state import State
except ImportError:
    from import_artifacts import import_reports
    from laboratory_exchange import restore_from_git
    from state import State


def import_archives(directory, state_path):
    archives = sorted(Path(directory).glob('*.zip'))
    if not archives:
        raise ValueError('No legacy archives: first initialization requires review, not an empty reset')
    if len(archives) > 64:
        raise ValueError('Legacy import exceeds bounded archive count')
    imported = []
    for archive in archives:
        destination = archive.parent / archive.stem
        with zipfile.ZipFile(archive) as handle:
            if sum(info.file_size for info in handle.infolist()) > 16 * 1024 * 1024:
                raise ValueError('Legacy archive exceeds byte budget')
            for info in handle.infolist():
                path = PurePosixPath(info.filename)
                if path.is_absolute() or '..' in path.parts or '\\' in info.filename:
                    raise ValueError('Unsafe legacy archive path')
            handle.extractall(destination)
        import_reports(destination, state_path)
        imported.append(archive.stem)
    store = State(state_path)
    try:
        store.checkpoint('legacy_artifacts_imported', {'artifact_ids':imported, 'complete_available_archive_import':True})
    finally:
        store.close()
    return imported


if __name__ == '__main__':
    path = Path('state/radar.sqlite3')
    if os.environ.get('RADAR_DATA_PARENT'):
        parent = restore_from_git(path)
        if parent != os.environ['RADAR_DATA_PARENT']:
            raise SystemExit('Data branch advanced: restore and retry; do not overwrite history')
        print('LABORATORY_HISTORY restored verified durable snapshot')
    else:
        imported = import_archives('historical_archives', path)
        print('LABORATORY_HISTORY imported legacy archives:', len(imported))
