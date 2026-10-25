"""Regression for the real seven-link Mulchén bulletin; no network or publishing."""
import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path

from scripts import radar_v2_pilot as pilot
from scripts.common import Budget
from scripts.radar_v2_store import PilotStore


NOW=dt.datetime(2026,10,17,22,tzinfo=dt.timezone.utc)
ROOT=Path(__file__).resolve().parents[1]
INDEX='https://www.munimulchen.cl/pagina-central-ofertas-laborales/'
SLUGS=(
    'secretaria-administrativa-contable',
    'jefe-de-terreno',
    'enbalaje-de-frutas',
    'convocatoria-conaf-temporada-2026-2027',
    'manipulador-de-alimentos-chef-maestro-de-cocina-08-cupos',
    'conductor-camion-tolva-proyecto-rucalhue',
    'operador-cargador-frontal-proyecto-rucalhue',
)
URLS=['https://www.munimulchen.cl/oferta-laboral-'+slug+'/' for slug in SLUGS]
DIRECTORY=('<title>Ofertas laborales OMIL</title>'+''.join(
    '<a href="'+url+'">Postulación Cerrada: '+slug+'</a>'
    for url,slug in zip(URLS,SLUGS))).encode()


def config():
    value=json.loads((ROOT/'config/radar-v2-pilot.json').read_text())
    source=next(row for row in value['sources'] if row['key']=='omil-mulchen')
    return {**value,'sources':[source]}


class MulchenDiscoveryTests(unittest.TestCase):
    def test_bulletin_links_survive_restart_and_bounded_runs_without_publishing_undated_notices(self):
        cfg=config();calls=[]

        def fetch(url,*args,**kwargs):
            calls.append(url)
            if url==INDEX:return DIRECTORY,url,'text/html',200
            self.assertIn(url,URLS)
            # Fixture content has no original date, matching the actual unresolved field.
            return b'<title>Oferta laboral</title><article>Se necesita personal. Oficina OMIL.</article>',url,'text/html',200

        with tempfile.TemporaryDirectory() as folder:
            store=PilotStore(folder)
            first=pilot.run(store,cfg,{'captures':[]},now=NOW,limit=1,fetcher=fetch)
            self.assertEqual(first['processed'],1)
            self.assertEqual({row['payload']['url'] for row in store.results()
                              if row['kind']=='web' and row['status']=='queued'},set(URLS))
            store.close()
            store=PilotStore(folder)
            second=pilot.run(store,cfg,{'captures':[]},now=NOW,limit=4,fetcher=fetch)
            self.assertLessEqual(second['processed'],4)
            final=pilot.run(store,cfg,{'captures':[]},now=NOW,limit=30,fetcher=fetch)
            self.assertEqual(set(calls),{INDEX,*URLS})
            self.assertEqual(len(calls),8)
            self.assertTrue(all(row['status']=='done' for row in store.results() if row['kind']=='web'))
            self.assertEqual(final['eligible_local_notices'],0)
            self.assertEqual(final['published'],0)
            before=store.counts()['jobs']
            pilot.run(store,cfg,{'captures':[]},now=NOW,limit=30,fetcher=fetch)
            self.assertEqual(store.counts()['jobs'],before)
            self.assertEqual(len(calls),8)
            store.close()

    def test_invalid_source_limit_is_rejected_before_requesting_a_page(self):
        source=config()['sources'][0]
        with tempfile.TemporaryDirectory() as folder:
            store=PilotStore(folder)
            try:
                for limit in (0,13,True,'12',1.5):
                    with self.subTest(limit=limit):
                        with self.assertRaisesRegex(ValueError,'invalid_candidate_limit'):
                            pilot.web_work(store,{'url':INDEX,'source':{**source,'candidate_limit':limit}},
                                Budget(5),lambda *args:self.fail('invalid configuration opened a URL'),NOW)
            finally:store.close()


if __name__=='__main__':unittest.main()
