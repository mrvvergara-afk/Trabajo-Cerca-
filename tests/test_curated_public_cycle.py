import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path

from scripts import curated_public_cycle, social_access_probe
from scripts.common import Budget
from scripts.state import State

NOW = dt.datetime(2026,10,13,23,tzinfo=dt.timezone.utc)
URL = 'https://www.bne.gob.cl/oferta/2026-112312'


class CuratedCycleTests(unittest.TestCase):
    def config(self, folder, sources):
        path = Path(folder)/'sources.json'; path.write_text(json.dumps({'sources':sources}))
        return path

    def offer(self, url=URL):
        return {'key':url,'url':url,'family':'official','scope':'curated_real_pilot','identity_evidence':'reviewed primary page'}

    def test_only_reviewed_individual_offers_can_consume_the_official_reader(self):
        with tempfile.TemporaryDirectory() as folder:
            good=self.offer()
            sources=[good,self.offer('https://bne.gob.cl/oferta/2026-112312/'),
                     {**good,'identity_requires_check':True}, {**good,'family':'social'},
                     {**good,'identity_evidence':''}, self.offer('https://www.bne.gob.cl/ofertas'),
                     self.offer('https://unknown.example/job/1')]
            self.assertEqual(len(curated_public_cycle.reviewed_offers(self.config(folder,sources))),1)

    def test_full_source_verification_is_required_and_errors_retain_history(self):
        result={'status':'verified','reason':'source_checked','url':URL,'title':'Coordinador de visual',
          'company':'Example SA','source':'Bolsa Nacional de Empleo','work_commune':'Traiguén',
          'work_location_verified':True,'source_published_at':'2026-09-22T03:00:00Z',
          'valid_through':'2026-11-17T03:00:00Z','application':URL,
          'verification_method':'Bolsa Nacional de Empleo individual page + official labelled offer'}
        with tempfile.TemporaryDirectory() as folder:
            path=self.config(folder,[self.offer()]); store=State(Path(folder)/'state.db')
            records,report=curated_public_cycle.run(store,folder,path=path,checker=lambda *a,**k:result,now=NOW)
            self.assertEqual(len(records),1);self.assertEqual(report['published'],0)
            def fail(*args,**kwargs): raise RuntimeError('unreadable')
            records,_=curated_public_cycle.run(store,folder,path=path,checker=fail,now=NOW+dt.timedelta(hours=19))
            self.assertEqual(records,[]);self.assertEqual(len(store.inventory()),1)
            self.assertEqual(store.connection.execute('SELECT count(*) FROM attempts').fetchone()[0],2)
            store.close()

    def test_expired_notices_and_the_capture_time_never_enter_a_batch(self):
        with tempfile.TemporaryDirectory() as folder:
            store=State(Path(folder)/'state.db');path=self.config(folder,[self.offer()])
            calls=[]
            def check(row,**kwargs):calls.append(row['url']);return {'status':'rejected','reason':'expired_deadline'}
            records,_=curated_public_cycle.run(store,folder,path=path,checker=check,now=NOW)
            self.assertEqual(records,[])
            curated_public_cycle.run(store,folder,path=path,checker=check,now=NOW+dt.timedelta(hours=1))
            self.assertEqual(calls,[URL]);store.close()

    def test_official_budget_and_merge_preserve_document_priority_and_three_offer_bound(self):
        with tempfile.TemporaryDirectory() as folder:
            store=State(Path(folder)/'state.db')
            sources=[self.offer(URL[:-6]+str(100000+i)) for i in range(5)]
            calls=[]
            def check(row,**kwargs):calls.append(row['url']);return {'status':'pending','reason':'missing_original_date'}
            _,report=curated_public_cycle.run(store,folder,path=self.config(folder,sources),checker=check,now=NOW,budget=Budget(10))
            self.assertEqual(report['checked'],3);self.assertEqual(len(store.inventory()),5)
            store.close()
        doc={'source_url':'https://munilumaco.cl/empleo.pdf'}
        portals=[{'source_url':URL},{'source_url':'https://bne.gob.cl/oferta/2026-112312/'},
                 {'source_url':'https://www.bne.gob.cl/oferta/2026-107065'},
                 {'source_url':'https://www.bne.gob.cl/oferta/2026-109726'}]
        batch=curated_public_cycle.merge_batch({'records':[doc]},portals)
        self.assertEqual(batch['ready_count'],3);self.assertEqual(batch['records'][0],doc)

    def test_social_probe_distinguishes_a_login_wall_and_does_not_store_the_response(self):
        row={'url':'https://www.facebook.com/municipio','territory':'Lumaco','discovered_from':'https://munilumaco.cl/'}
        for title, expected in [('Log in to Facebook','login_required'),('Municipio','no_readable_posts')]:
            raw=('<title>'+title+'</title><input value="private-cookie"><script>token="private-token"</script>').encode()
            result=social_access_probe.inspect_channel(row,Budget(5),fetcher=lambda *a,**k:(raw,row['url'],'text/html',200))
            self.assertEqual(result['access'],expected);self.assertFalse(result['coverage_complete'])
            self.assertNotIn('private-token',json.dumps(result));self.assertNotIn('private-cookie',json.dumps(result))

    def test_large_social_shell_has_a_separate_byte_bound_and_is_not_an_access_denial(self):
        row={'url':'https://www.facebook.com/municipio'}
        calls=[]
        def fetcher(url,budget,**kwargs):
            calls.append(kwargs['max_bytes'])
            return b'<title>Municipio</title><script>'+b' '*900001+b'</script>',url,'text/html',200
        result=social_access_probe.inspect_channel(row,Budget(5),fetcher=fetcher)
        self.assertEqual(calls,[4*1024*1024]);self.assertGreater(result['bytes'],900000)
        self.assertEqual(result['access'],'no_readable_posts');self.assertFalse(result['coverage_complete'])


if __name__ == '__main__':unittest.main()
