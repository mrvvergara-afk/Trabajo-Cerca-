import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import publication_queue, verify_candidates
from scripts.public_source_adapters import source_adapter
from scripts.state import State

NOW = dt.datetime(2026,10,13,12,tzinfo=dt.timezone.utc)
URL = 'https://cl.indeed.com/viewjob?jk=0123456789abcdef'


def page(url=URL, *, form=False, deadline=True):
    job = {'@type':'JobPosting','url':url,'title':'Operador','hiringOrganization':{'name':'Empresa de prueba'},
           'jobLocation':{'address':{'addressLocality':'Angol','addressCountry':'CL'}},'datePosted':'2026-10-12T12:00:00Z'}
    if deadline:job['validThrough']='2026-10-25T12:00:00Z'
    return '<title>Operador</title><main>Requisitos de empleo</main><script type="application/ld+json">'+json.dumps(job)+'</script>'+(
        '<form method="post" action="/postular/123"><button type="submit">Postular</button></form>' if form else '<a href="/postular/123">Postula</a>')


class PublicAdapterTests(unittest.TestCase):
    def test_chiletrabajos_uses_the_same_civil_date_parser_as_the_app(self):
        url='https://www.chiletrabajos.cl/trabajo/operador-1234567'
        raw=page(url).replace('2026-10-12T12:00:00Z','2026-10-08 11:58:01').replace('2026-10-25T12:00:00Z','2026-12-22T11:58:01')
        result=verify_candidates.evaluate({'url':url},raw,url,now=NOW)
        self.assertEqual(result['status'],'verified')
        self.assertEqual(result['source_published_at'],'2026-10-08T14:58:01.000Z')
        self.assertEqual(result['source_date_evidence']['date_posted'],'2026-10-08 11:58:01')

    def test_supported_portals_are_selected_for_verification_without_network(self):
        urls = [URL,'https://cl.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-operador-AB12',
                'https://cl.linkedin.com/jobs/view/operador-4456391320/',
                'https://www.laborum.cl/empleos/operador-123456789.html',
                'https://www.opcionempleo.cl/jobad/cl0123456789abcdef']
        with tempfile.TemporaryDirectory() as folder:
            store = State(Path(folder)/'state.sqlite3')
            try:
                store.ingest([{'url':url,'commune_query':'Angol'} for url in urls],NOW)
                self.assertEqual(len(store.choose(10,NOW)),5)
            finally:store.close()

    def test_shared_parser_verifies_the_individual_page_of_each_primary_portal(self):
        urls = [URL,'https://cl.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-operador-AB12',
                'https://cl.linkedin.com/jobs/view/operador-4456391320/',
                'https://www.laborum.cl/empleos/operador-123456789.html']
        for url in urls:
            with self.subTest(url=url):
                result = verify_candidates.evaluate({'url':url},page(url),url,now=NOW)
                self.assertEqual(result['status'],'verified')
                self.assertEqual(result['source'],source_adapter(url)['name'])

    def test_a_current_application_form_enters_the_queue_without_a_fictitious_closing_date(self):
        with tempfile.TemporaryDirectory() as folder:
            store = State(Path(folder)/'state.sqlite3')
            try:
                store.ingest([{'url':URL}],NOW)
                item = store.choose(1,NOW)[0]
                result = verify_candidates.evaluate(item,page(form=True,deadline=False),URL,now=NOW)
                self.assertEqual(result['status'],'verified')
                store.record_result(item,result,NOW)
                report = publication_queue.prepare(store,output=Path(folder),now=NOW)
                self.assertEqual(report['ready_count'],1)
                self.assertEqual(report['records'][0]['valid_through'],'')
                self.assertEqual(report['records'][0]['validity_method'],'live_application')
                self.assertEqual(publication_queue.prepare(store,output=Path(folder),now=NOW+dt.timedelta(hours=25))['ready_count'],0)
            finally:store.close()

    def test_aggregator_resolves_only_unambiguous_supported_original_links(self):
        raw=f'<a href="{URL}">Ver oferta original</a><a href="https://attacker.test/job">Postular</a>'
        self.assertEqual(verify_candidates.original_source_links(raw,'https://www.opcionempleo.cl/jobad/cl0123456789abcdef'),[URL])
        self.assertEqual(verify_candidates.original_source_links('<a href="https://cl.indeed.com/jobs">Postular</a>',URL),[])

    def test_redirect_guard_blocks_other_jobs_before_following(self):
        import urllib.request
        with self.assertRaisesRegex(ValueError,'redirected_outside_job'):
            verify_candidates.JobRedirectGuard(URL).redirect_request(urllib.request.Request(URL),None,302,'Found',{},URL.replace('0123456789abcdef','abcdef0123456789'))


if __name__ == '__main__':unittest.main()
