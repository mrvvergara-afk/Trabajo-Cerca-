import copy
import hashlib
import json
import tempfile
import unittest
from datetime import datetime,timezone
from pathlib import Path
from unittest.mock import patch
from scripts import cmpc_reviewed_handoff as handoff


class CmpcReviewedHandoffTests(unittest.TestCase):
    def setUp(self):
        self.fixture=json.loads(Path('tests/fixtures/cmpc-public-18859.json').read_text())
        self.now=datetime(2026,10,19,23,45,tzinfo=timezone.utc)

    def prepare(self,fixture):
        with tempfile.TemporaryDirectory() as folder,patch.object(handoff,'ROLES',{18859:handoff.ROLES[18859]}):
            page=fixture['page'];digest=page['public_job_api_responses'][0]['sha256']
            Path(folder,digest).write_text(fixture['api_raw'])
            return handoff.prepare({'sources':[page]},folder,now=self.now)

    def test_exact_archived_public_bytes_prepare_one_role_without_claiming_publication(self):
        queue=self.prepare(self.fixture)
        self.assertEqual(queue['published_count'],0)
        self.assertEqual(queue['ready_count'],1)
        role=queue['records'][0]
        self.assertEqual(role['work_commune'],'Collipulli')
        self.assertEqual(role['work_site'],'Ubicación: Planta Pacífico - Mininco.')
        self.assertEqual(role['source_published_at'],'2026-10-13T03:00:00.000Z')
        self.assertEqual(role['candidate_id'],hashlib.sha256(role['source_url'].encode()).hexdigest()[:24])

    def test_changed_title_missing_contact_or_tampered_original_fail_before_signing(self):
        for field,value in [('text','No hay aviso individual'),('access','blocked_or_unavailable')]:
            fixture=copy.deepcopy(self.fixture);fixture['page'][field]=value
            with self.assertRaises(ValueError):self.prepare(fixture)
        fixture=copy.deepcopy(self.fixture);fixture['api_raw']+=' '
        with self.assertRaisesRegex(ValueError,'hash_mismatch'):self.prepare(fixture)

    def test_closed_original_does_not_get_a_fresh_date_from_capture(self):
        self.now=datetime(2027,1,10,tzinfo=timezone.utc)
        with self.assertRaisesRegex(ValueError,'not_recent_or_closed'):self.prepare(self.fixture)

    def test_original_date_order_and_conservative_deadline_respect_chilean_timezone(self):
        self.assertEqual(handoff.source_date('10/20/2026'),'2026-10-20T03:00:00.000Z')
        self.assertEqual(handoff.source_date('6/20/2026'),'2026-06-20T04:00:00.000Z')
        with self.assertRaises(ValueError):handoff.source_date('31/10/2026')
