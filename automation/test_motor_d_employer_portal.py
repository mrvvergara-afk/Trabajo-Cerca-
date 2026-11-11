"""Regression: SERFONAC's public employer page must yield source-date evidence.

All HTML fixtures model visible official page fields. No network or publication.
"""
import unittest
from datetime import date,datetime
from unittest.mock import patch
from bs4 import BeautifulSoup
from zoneinfo import ZoneInfo

import motor_d_territorial_daily as engine
from motor_d_employer_portal import read_employer_vacancy
from motor_d_express import classify,job_source_identity

URL="https://portal.chiletrabajos.cl/empresa/serfonac/trabajo/mecanico-a-soldador-a-de-maquinaria-nacimiento-3923358"
MAIN="https://www.chiletrabajos.cl/trabajo/mecanico-a-soldador-a-de-maquinaria-nacimiento-3923358"
TITLE="Mecánico/a Soldador/a de Maquinaria – Nacimiento"
INDEX="https://portal.chiletrabajos.cl/empresa/serfonac/ofertas"
TODAY=date(2026,11,11)

def page(company="Serfonac",posted="2026-11-05",relative="hace 6 dias",
         body=None,expiry="2027-01-19",title=TITLE,button=True):
    body=body if body is not None else (
        "Empresa del rubro forestal busca incorporar un/a Mecánico/a Soldador/a "
        "de Maquinaria para realizar labores en taller y terreno, "
        "con base en Nacimiento, Región del Biobío. "
        "Lugar de trabajo: Nacimiento, Región del Biobío. "
        "Requisitos: mecánica, hidráulica y experiencia en mantención."
    )
    return BeautifulSoup(
        '<html><head><title>'+title+' - Los Ángeles</title></head><body>'+
        '<h2>'+company+'</h2><div>'+posted+' Los Ángeles '+relative+' Full-time</div>'+
        '<h4>Descripción</h4><article>'+body+'</article>'+
        '<div>Fecha expiración '+expiry+'</div>'+
        ('<a href="/postular">Postular</a>' if button else '<p>Sin enlace de postulación</p>')+
        '</body></html>',"html.parser")


class EmployerPortalEvidenceTests(unittest.TestCase):
    def extract(self,html=None,label=TITLE,url=URL):
        return read_employer_vacancy(html or page(),url,label,engine.explicit_work_commune,as_of=TODAY)

    def test_reads_absolute_employer_date_worksite_deadline_and_apply_link(self):
        r=self.extract()
        self.assertEqual(r["employer"],"Serfonac")
        self.assertEqual(r["date_source"],"2026-11-05")
        self.assertEqual(r["date_source_method"],"explicit_employer_card")
        self.assertEqual(r["work_commune"],"Nacimiento")
        self.assertEqual(r["deadline"],"2027-01-19")
        self.assertEqual(r["title"],TITLE)
        self.assertTrue(r["application_evidence"])
        self.assertFalse(r["source_closed"])
        self.assertIsNone(r["recruitment_commune"])

    def test_calendar_date_overrides_misleading_relative_repost_label(self):
        r=self.extract(page(posted="2026-10-08",relative="hace 3 dias"))
        self.assertEqual(r["date_source"],"2026-10-08")
        self.assertNotEqual(r["date_source"],"2026-11-08")

    def test_no_absolute_original_date_looks_pending_not_auto_published(self):
        r=self.extract(page(posted="hace 6 dias",relative="Full-time"))
        self.assertIsNone(r["date_source"])
        self.assertEqual(r["date_source_method"],"unverified")

    def test_recruitment_city_and_residence_cannot_prove_work_commune(self):
        r=self.extract(page(body="Residencia ideal: Nacimiento. Disponible para viajar a Lumaco. Se busca conductor."))
        self.assertIsNone(r["work_commune"])
        self.assertEqual(r["employer"],"Serfonac")

    def test_on_site_internship_acts_as_explicit_worksite(self):
        r=self.extract(page(body="Requisitos: Disponibilidad para realizar práctica presencial en Nacimiento, Región del Biobío."))
        self.assertEqual(r["work_commune"],"Nacimiento")

    def test_mismatched_employer_header_is_unverified(self):
        r=self.extract(page(company="Otra Empresa"))
        self.assertIsNone(r["employer"])
        self.assertIsNone(r["date_source"])

    def test_future_date_invalid_and_no_expiry_substitution(self):
        r=self.extract(page(posted="2028-02-12",expiry="2027-01-19"))
        self.assertIsNone(r["date_source"])
        r=self.extract(page(posted="hace 6 dias",expiry="2027-01-19"))
        self.assertIsNone(r["date_source"])

    def test_closed_individual_offer_is_marked_closed(self):
        r=self.extract(page(expiry="2026-11-10"))
        self.assertTrue(r["source_closed"])

    def test_unsupported_company_index_is_not_individual_vacancy(self):
        self.assertIsNone(self.extract(url=INDEX))
        self.assertIsNone(self.extract(url="https://portal.chiletrabajos.cl/empresa/serfonac/trabajo/otra"))
        self.assertIsNone(self.extract(url="https://evil.example/empresa/serfonac/trabajo/mecanico-nacimiento-3923358"))

    def test_identical_chiletrabajos_job_id_dedupes_both_domains(self):
        self.assertEqual(job_source_identity(URL),"chiletrabajos:3923358")
        self.assertEqual(job_source_identity(MAIN),"chiletrabajos:3923358")
        self.assertIsNone(job_source_identity(INDEX))

    def test_full_scan_to_recovery_classification_uses_official_evidence(self):
        idx=BeautifulSoup('<html><a href="'+URL+'">'+TITLE+'</a></html>',"html.parser")
        listing=page()
        def response(u):
            if u==INDEX:return 200,idx,None
            if u==URL:return 200,listing,None
            raise AssertionError(u)
        at=datetime(2026,11,11,18,0,tzinfo=ZoneInfo("America/Santiago"))
        with patch.object(engine,"NOW",at),patch.object(engine,"request_page",side_effect=response):
            row=engine.inspect(("Angol","SERFONAC · ofertas del empleador",INDEX))
        self.assertEqual(row["status"],"scanned_with_candidates")
        self.assertEqual(len(row["candidates"]),1)
        job=row["candidates"][0]
        self.assertEqual(job["date_source"],"2026-11-05")
        self.assertEqual(job["work_commune"],"Nacimiento")
        self.assertEqual(job["employer"],"Serfonac")
        self.assertTrue(job["application_evidence"])
        self.assertEqual(job["deadline"],"2027-01-19")
        self.assertEqual(job["source_date_method"],"explicit_employer_card")
        state,reason,offer=classify(job,today=TODAY)
        self.assertEqual(state,"RECUPERACION")
        self.assertEqual(offer["comunas"],["Nacimiento"])
        self.assertEqual(offer["fecha_publicacion"],"2026-11-05")
        self.assertEqual(offer["empresa"],"Serfonac")

    def test_no_worksite_or_date_not_published_even_with_job_title(self):
        idx=BeautifulSoup('<html><a href="'+URL+'">'+TITLE+'</a></html>',"html.parser")
        listing=page(posted="hace 6 dias",body="Empresa busca personal. Residencia en Los Ángeles.")
        with patch.object(engine,"NOW",datetime(2026,11,11,18,0,tzinfo=ZoneInfo("America/Santiago"))),\
             patch.object(engine,"request_page",side_effect=lambda u:(200,idx if u==INDEX else listing,None)):
            job=engine.inspect(("Angol","SERFONAC",INDEX))["candidates"][0]
        state,reason,offer=classify(job,today=TODAY)
        self.assertNotIn(state,{"EXPRESS","RECUPERACION"})
        self.assertIsNone(offer)


if __name__=="__main__":
    unittest.main()
