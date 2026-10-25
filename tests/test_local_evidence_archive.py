import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import local_evidence_archive as archive


class LocalEvidenceArchiveTests(unittest.TestCase):
    def test_append_preserves_parent_and_pushes_only_the_separate_evidence_branch(self):
        calls=[]
        def fake(*args,data=None,env=None):
            calls.append((args,data))
            return b'commit-sha\n' if args[0]=='commit-tree' else b'tree-or-blob\n'
        with tempfile.TemporaryDirectory() as folder:
            for name in archive.FILES:Path(folder,name).write_text('{}')
            with patch.object(archive,'git',side_effect=fake):
                self.assertEqual(archive.archive(folder,'123',parent='old-evidence-parent'),'commit-sha')
        commands=[call[0] for call in calls]
        self.assertIn(('read-tree','old-evidence-parent'),commands)
        self.assertIn(('push','origin','commit-sha:refs/heads/radar-local-evidence'),commands)
        self.assertFalse(any('--force' in args for args in commands))
        paths=[args[-1].split(',')[-1] for args in commands if args[0]=='update-index']
        self.assertEqual(len(paths),10)
        self.assertTrue(all(path.startswith(('latest/','history/123/')) for path in paths))

    def test_a_missing_or_invalid_checkpoint_never_replaces_an_existing_cursor(self):
        previous=Path.cwd()
        with tempfile.TemporaryDirectory() as folder:
            try:
                os.chdir(folder);Path('state').mkdir()
                target=Path('state/local-social-checkpoint.json');target.write_text('previous cursor')
                def fake(*args,**kwargs):
                    if args[0]=='ls-remote':return b'abc refs/heads/radar-local-evidence\n'
                    if args[0]=='show':return json.dumps({'schema':'wrong'}).encode()
                    return b'abc\n'
                with patch.object(archive,'git',side_effect=fake),self.assertRaisesRegex(ValueError,'checkpoint'):
                    archive.restore_checkpoint()
                self.assertEqual(target.read_text(),'previous cursor')
            finally:os.chdir(previous)


if __name__=='__main__':unittest.main()
