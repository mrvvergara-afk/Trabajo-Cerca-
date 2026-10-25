import unittest
from scripts.primary_source_discovery import metadata_address, original_metadata


class PrimaryMetadataTests(unittest.TestCase):
    def test_only_the_pages_explicit_same_publisher_rest_link_is_used(self):
        origin='https://www.munimulchen.cl/oferta-laboral/'
        raw=b'<link rel="alternate" type="application/json" href="https://www.munimulchen.cl/wp-json/wp/v2/pages/123">'
        self.assertEqual(metadata_address(raw,origin),'https://www.munimulchen.cl/wp-json/wp/v2/pages/123')
        self.assertIsNone(metadata_address(raw.replace(b'munimulchen.cl/wp-json',b'other.cl/wp-json'),origin))
        self.assertIsNone(metadata_address(raw.replace(b'/123',b'/123?token=secret'),origin))

    def test_modified_dates_and_other_articles_cannot_supply_the_original_date(self):
        origin='https://www.munimulchen.cl/oferta-laboral/'
        value={'status':'publish','link':origin,'date_gmt':'2026-09-20T13:00:00','modified_gmt':'2026-10-19T20:00:00'}
        self.assertEqual(original_metadata(value,origin),'2026-09-20T13:00:00+00:00')
        self.assertIsNone(original_metadata({**value,'link':origin+'another/'},origin))
        self.assertIsNone(original_metadata({**value,'date_gmt':''},origin))
        self.assertIsNone(original_metadata({**value,'status':'draft'},origin))
