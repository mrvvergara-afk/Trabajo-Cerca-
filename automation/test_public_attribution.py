import unittest
from automation.reconcile_public_attribution import reconcile, source_key


class PublicAttribution(unittest.TestCase):
    def test_exact_producer_and_corroboration_stay_separate(self):
        url = 'https://www.chiletrabajos.cl/trabajo/tecnico-3931100'
        aid = 'cg_' + '1' * 20
        public = [{'id': 'chatgpt_' + aid, 'url': url, 'title': 'Técnico', 'company': 'Empresa'}]
        a = {'id_fuente': aid, 'url_original': url, 'cargo': 'Técnico', 'empresa': 'Empresa'}
        d = {'id_fuente': 'd_' + '2' * 20, 'url_original': url, 'cargo': 'Tecnico', 'empresa': 'Empresa'}
        counts, rows = reconcile(public, [('CHATGPT', 'one', a), ('D', 'two', d)])
        self.assertEqual(counts, {'id_exacto_CHATGPT': 1, 'corroboracion_multiple': 1})
        self.assertEqual(rows[0]['motor_por_id'], 'CHATGPT')
        self.assertEqual(rows[0]['motores_que_corroboran'], ['CHATGPT', 'D'])
        self.assertEqual(source_key({'url': 'https://example.org/?position=1'}), None)

    def test_shared_source_with_different_title_is_not_corroboration(self):
        url = 'https://munilumaco.cl/concursos'
        public = [{'id': 'test', 'url': url, 'title': 'Técnico', 'company': 'Empresa'}]
        alternate = {'id_fuente': 'd_' + '2' * 20, 'url_original': url, 'cargo': 'Médico', 'empresa': 'Empresa'}
        counts, rows = reconcile(public, [('D', 'two', alternate)])
        self.assertEqual(counts, {'sin_evidencia_publica': 1})
        self.assertEqual(rows, [])
