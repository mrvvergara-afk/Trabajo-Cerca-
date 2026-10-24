import json
import unittest
from scripts.portal_index import portal_index_links

class PortalIndexTests(unittest.TestCase):
    def test_all_twenty_one_roles_are_found_without_recruiting_keywords_or_twelve_link_cap(self):
        raw=''.join(f'<a href="/empleos/vendedor-{1118400000+i}.html">Vendedor {i}</a>' for i in range(21))
        result=portal_index_links(raw,'https://www.laborum.cl/empleos-busqueda-angol.html')
        self.assertEqual(len(result['links']),21)
        self.assertFalse(result['truncated']);self.assertFalse(result['coverage_complete'])
        self.assertEqual(result['published'],0)

    def test_duplicate_variant_identity_and_foreign_or_general_pages_are_not_jobs(self):
        raw='<a href="/empleos/uno-1118400001.html">Uno</a><a href="/empleos/otro-1118400001.html">Otro</a>'
        raw+='<a href="https://www.chiletrabajos.cl/trabajo/un-empleo-12">Otro portal</a><a href="/empresas">Empresas</a>'
        result=portal_index_links(raw,'https://www.laborum.cl/empleos-busqueda-angol.html')
        self.assertEqual(result['individual_links_found'],1)

    def test_item_list_urls_are_discovered_but_search_dates_never_become_job_dates(self):
        value={'@type':'ItemList','datePublished':'2026-10-20','itemListElement':[{'url':'https://www.laborum.cl/empleos/test-1118400001.html','name':'Cargo'}]}
        result=portal_index_links('<script type="application/ld+json">'+json.dumps(value)+'</script>','https://www.laborum.cl/empleos-busqueda-angol.html')
        self.assertEqual(result['individual_links_found'],1)
        self.assertNotIn('source_published_at',result['links'][0])
        self.assertFalse(result['links'][0]['work_location_verified'])

    def test_an_explicit_byte_safe_output_cap_is_reported_as_truncation(self):
        raw=''.join(f'<a href="/empleos/cargo-{1118400000+i}.html">Cargo</a>' for i in range(10))
        result=portal_index_links(raw,'https://www.laborum.cl/empleos-busqueda-angol.html',limit=3)
        self.assertEqual(result['individual_links_found'],10);self.assertEqual(result['returned_links'],3)
        self.assertTrue(result['truncated'])

if __name__=='__main__':unittest.main()

class ExpandedSelectionTests(unittest.TestCase):
    def test_visible_identity_and_variants_are_skipped_and_each_town_gets_a_turn(self):
        from scripts.expanded_source_pass import select_unread
        rows=[{'url':f'https://www.laborum.cl/empleos/a-{1118400000+i}.html','territory':town} for town in ('Angol','Lumaco') for i in range(3)]
        rows[3:]=[{'url':f'https://www.laborum.cl/empleos/a-{1118500000+i}.html','territory':'Lumaco'} for i in range(3)]
        selected=select_unread(rows,{'https://www.laborum.cl/empleos/oferta-1118400000.html'},limit=2)
        self.assertEqual([row['territory'] for row in selected],['Angol','Lumaco'])
        self.assertIn('1118400001',selected[0]['url'])
