"""Regression for archive pagination and binary URL rejection in Motor A."""
import unittest
from radar_patterns import ARCHIVE, DOCUMENT, OLD_YEAR


class RadarPatternsTest(unittest.TestCase):
    def test_numeric_pagination_is_followed(self):
        for url in (
            'https://mtraiguen.cl/page/2',
            'https://mtraiguen.cl/?paged=3',
            'https://municipalidad.cl/concursos?page=12',
            'https://municipalidad.cl/category/omil/',
        ):
            with self.subTest(url=url):
                self.assertIsNotNone(ARCHIVE.search(url))

    def test_non_job_urls_are_not_inferred_from_numbers(self):
        self.assertIsNone(ARCHIVE.search('https://municipalidad.cl/?item=2'))
        self.assertIsNone(ARCHIVE.search('https://municipalidad.cl/noticias/2026/11'))

    def test_binary_material_stays_out_of_html_scan(self):
        for url in (
            'https://municipalidad.cl/convocatoria.pdf',
            'https://municipalidad.cl/bases.PDF?download=1',
            'https://municipalidad.cl/oferta.png',
            'https://municipalidad.cl/archivo.docx',
            'https://municipalidad.cl/planilla.xlsx',
        ):
            with self.subTest(url=url):
                self.assertIsNotNone(DOCUMENT.search(url))
        self.assertIsNone(DOCUMENT.search('https://municipalidad.cl/empleo/?page=2'))

    def test_historical_year_exclusion_does_not_block_2025_plus(self):
        self.assertIsNotNone(OLD_YEAR.search('https://municipalidad.cl/2024/convocatoria/'))
        self.assertIsNotNone(OLD_YEAR.search('https://municipalidad.cl/2009/trabajos/'))
        self.assertIsNone(OLD_YEAR.search('https://municipalidad.cl/2026/trabajos/'))
        self.assertIsNone(OLD_YEAR.search('https://municipalidad.cl/2025/trabajos/'))


if __name__ == '__main__':
    unittest.main()
