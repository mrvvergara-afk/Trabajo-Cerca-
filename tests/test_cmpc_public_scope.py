import unittest
from scripts.public_document_http import public_url
from scripts.render_public_documents import diagnostic_url,public_job_rows


class CMPCPublicScopeTests(unittest.TestCase):
    def test_only_the_observed_public_job_search_and_its_robots_policy_are_allowed(self):
        for path in ['/robots.txt','/rec-job-search/external/jobs']:
            self.assertEqual(public_url('https://us.api.csod.com'+path),'https://us.api.csod.com'+path)
        for url in ['https://us.api.csod.com/candidates','https://another.api.csod.com/rec-job-search/external/jobs','https://us.api.csod.com/rec-job-search/external/jobs?token=secret']:
            with self.assertRaises(ValueError):public_url(url)

    def test_diagnostics_redact_keys_and_only_public_job_fields_are_reported(self):
        self.assertNotIn('secret',diagnostic_url('https://example.org/file?key=secret&lang=es'))
        rows=public_job_rows({'data':[{'title':'Operador','requisitionId':123,'location':'Nacimiento','accessToken':'secret','jobDescription':'long text'}]})
        self.assertEqual(rows,[{'title':'Operador','requisitionId':123,'location':'Nacimiento'}])

class SpanishPublicJobResponseTests(unittest.TestCase):
    def test_public_portal_job_fields_are_retained_without_tokens_or_personal_account_fields(self):
        rows=public_job_rows({'content':[{'id':123,'titulo':'Operador','empresa':{'nombre':'Empresa local'},
            'fechaPublicacion':'2026-10-19','ubicacion':'Nacimiento','accessToken':'secret','password':'private'}]})
        self.assertEqual(rows[0]['titulo'],'Operador')
        self.assertEqual(rows[0]['fechaPublicacion'],'2026-10-19')
        self.assertNotIn('accessToken',rows[0]);self.assertNotIn('password',rows[0])
