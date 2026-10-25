import datetime as dt
import unittest
from scripts.ssan_primary_index import parse_index


class SSANPrimaryTests(unittest.TestCase):
    def test_dates_and_real_hospital_stay_bound_to_their_own_card(self):
        def card(title,place,date,stage):return f'<div class="e-loop-item"><div><h3><a href="/trabaje-con-nosotros/{title}/">{title}</a></h3>Estado del concurso: {stage} Establecimiento: {place} Tipo de convocatoria: Externo Publicado el {date}</div></div>'
        html=card('Terapeuta','Hospital de Lonquimay','9 de Octubre de 2026','Etapa de postulación')+card('Auxiliar','Hospital de Angol','8 de Septiembre de 2026','Etapa de evaluación curricular')
        rows=parse_index(html,'https://ssan.redsalud.gob.cl/trabaje-con-nosotros/','a'*64,now=dt.datetime(2026,10,19,tzinfo=dt.timezone.utc))
        self.assertEqual([r['original_publication_date'] for r in rows],['2026-10-09','2026-09-08'])
        self.assertIsNone(rows[0]['literal_target_commune'])
        self.assertEqual(rows[1]['literal_target_commune'],'angol')
        self.assertTrue(rows[0]['open_for_applications']);self.assertFalse(rows[1]['open_for_applications'])
        self.assertFalse(any(r['review_candidate'] for r in rows))

    def test_publisher_address_and_modified_timestamp_do_not_supply_missing_job_evidence(self):
        html='<footer>Ilabaca 752 Angol</footer><div class="e-loop-item"><h3><a href="/trabaje-con-nosotros/cargo/">Cargo</a></h3>Estado del concurso: Etapa de postulación Establecimiento: Dirección Servicio de Salud Tipo de convocatoria: Externo Modificado el 9 de Octubre de 2026</div>'
        row=parse_index(html,'https://ssan.redsalud.gob.cl/trabaje-con-nosotros/','b'*64)[0]
        self.assertIsNone(row['original_publication_date']);self.assertIsNone(row['literal_target_commune'])
        self.assertFalse(row['review_candidate']);self.assertFalse(row['verified'])
