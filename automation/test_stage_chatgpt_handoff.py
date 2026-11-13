"""Contratos del productor ChatGPT separado de Motor D (sin tocar producción)."""
import unittest
from datetime import date
from automation.stage_chatgpt_handoff import prepare

def payload():
    return {"schema_version": 1, "approval": "approved_for_publication", "producer": "chatgpt_territorial",
            "offers": [{"id_fuente": "cg_" + "a" * 20, "cargo": "Operador industrial", "empresa": "Empresa Ejemplo",
                        "comunas": ["Mininco", "Coihue"], "ubicacion_trabajo": "Plantas Mininco y Coihue",
                        "modalidad": "presencial", "salario": None, "enlace_postulacion": "https://empresa.example/apply/123",
                        "url_original": "https://empresa.example/jobs/123",
                        "fecha_publicacion": "2026-11-10", "fecha_descubrimiento": "2026-11-13"}]}

def index():
    return {"schema_version": 1, "producer": "chatgpt_territorial", "batches": [], "seen_offer_ids": [], "seen_url_hashes": []}

class TestChatGPTHandoff(unittest.TestCase):
    def test_new_batch_distinct_identity(self):
        rel, batch, state = prepare(payload(), index(), day="20261113")
        self.assertTrue(rel.startswith("20261113/chatgpt-"))
        self.assertEqual(batch["producer"], "chatgpt_territorial")
        self.assertEqual(batch["offers"][0]["comunas"], ["Collipulli", "Negrete"])
        self.assertEqual(len(state["batches"]), 1)
        self.assertEqual(len(state["seen_offer_ids"]), 1)
        self.assertEqual(len(state["seen_url_hashes"]), 1)
        self.assertRegex(batch["offers"][0]["hash_url_sha256"], r"^[a-f0-9]{64}$")

    def test_motor_d_cannot_impersonate_chatgpt(self):
        p = payload()
        p["producer"] = "motor_d_territorial"
        with self.assertRaisesRegex(ValueError, "invalid_chatgpt_approval"):
            prepare(p, index(), day="20261113")

    def test_duplicate_rejected(self):
        p = payload()
        old = index()
        old["seen_offer_ids"] = [p["offers"][0]["id_fuente"]]
        with self.assertRaisesRegex(ValueError, "duplicate_or_invalid_chatgpt_id"):
            prepare(p, old, day="20261113")

    def test_territory_outside_rejected(self):
        p = payload()
        p["offers"][0]["comunas"] = ["Quilaco"]
        with self.assertRaisesRegex(ValueError, "outside_territory"):
            prepare(p, index(), day="20261113")

    def test_no_fabricated_dates(self):
        p = payload()
        p["offers"][0].pop("fecha_publicacion")
        with self.assertRaisesRegex(ValueError, "invalid_strict_offer_keys"):
            prepare(p, index(), day="20261113")

    def test_missing_approval_rejected(self):
        p = payload()
        p["approval"] = "draft"
        with self.assertRaisesRegex(ValueError, "invalid_chatgpt_approval"):
            prepare(p, index(), day="20261113")

    def test_expired_post_rejected(self):
        p = payload()
        p["offers"][0]["fecha_cierre"] = "2026-10-01"
        with self.assertRaisesRegex(ValueError, "expired_offer"):
            prepare(p, index(), day="20261113")

    def test_batch_max_15(self):
        p = payload()
        p["offers"] = p["offers"] * 16
        with self.assertRaisesRegex(ValueError, "invalid_batch_size"):
            prepare(p, index(), day="20261113")

if __name__ == "__main__":
    unittest.main()
