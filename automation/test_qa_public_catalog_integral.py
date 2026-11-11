"""Unit coverage of a real-read-only full-catalog QA gate."""
import unittest
from qa_public_catalog_integral import inspect


def fixtures():
    return {
        "/api/listings?fresh=1": {
            "items": [{"id": "a", "kind": "job_offer"}],
            "totalItems": 2, "totalJobOffers": 2, "hasMore": True,
            "nextCursor": "v2:manifestABC:1"},
        "/api/listings?cursor=v2%3AmanifestABC%3A1": {
            "items": [{"id": "b", "kind": "job_offer"}],
            "totalItems": 2, "totalJobOffers": 2, "hasMore": False}}


def check(pages):
    return inspect(fetch=lambda path: pages[path], max_pages=5)


class FeedQA(unittest.TestCase):
    def test_full_feed(self):
        self.assertEqual(check(fixtures())["failures"], [])
        self.assertEqual(check(fixtures())["jobs"], 2)

    def test_duplicate(self):
        pages=fixtures()
        pages["/api/listings?cursor=v2%3AmanifestABC%3A1"]["items"][0]["id"]="a"
        self.assertIn("duplicate_id",check(pages)["failures"])

    def test_degraded(self):
        pages=fixtures()
        pages["/api/listings?fresh=1"]["degraded"]=True
        self.assertIn("feed_rebuilding_or_degraded",check(pages)["failures"])

    def test_missing_cursor(self):
        pages=fixtures()
        del pages["/api/listings?fresh=1"]["nextCursor"]
        self.assertIn("cursor_missing_invalid_or_repeated",check(pages)["failures"])

    def test_wrong_total(self):
        pages=fixtures()
        for page in pages.values(): page["totalItems"]=3
        self.assertIn("full_feed_count_mismatch",check(pages)["failures"])

    def test_changed_total(self):
        pages=fixtures()
        pages["/api/listings?cursor=v2%3AmanifestABC%3A1"]["totalJobOffers"]=5
        self.assertIn("totals_changed_midscan",check(pages)["failures"])

    def test_zero_jobs_is_not_prod_ready(self):
        pages=fixtures()
        for page in pages.values():
            page["totalJobOffers"]=0
            page["items"][0]["kind"]="worker_profile"
        self.assertIn("zero_job_offers",check(pages)["failures"])

    def test_hasmore_must_be_boolean(self):
        pages=fixtures()
        pages["/api/listings?fresh=1"]["hasMore"]=1
        self.assertIn("invalid_hasMore",check(pages)["failures"])


if __name__ == "__main__":
    unittest.main()
