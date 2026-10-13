import datetime as dt
import tempfile
import unittest
import shutil
from pathlib import Path
from unittest.mock import patch

from scripts.local_source_audit import Document, PublisherRedirectGuard, discover, evidence_fields, read_medium, run, tesseract_text
from scripts.common import Budget, Links


class LocalSourceAuditTests(unittest.TestCase):
    def test_image_alt_and_link_title_find_notices_without_a_keyword_in_the_url(self):
        html='<main><a href="/noticias/123"><img src="/afiche.png" alt="OMIL: se necesita soldador"></a></main>'
        value=discover(html,'https://municipio.example/')
        self.assertEqual(value['candidates'][0]['url'],'https://municipio.example/noticias/123')
        self.assertIn('soldador',value['candidates'][0]['title'])
        actual=Links();actual.feed(html)
        self.assertIn('soldador',actual.links[0][1])

    def test_social_links_are_discovered_from_the_publisher_without_counting_share_buttons(self):
        html='<a href="https://www.facebook.com/omil.prueba/">Facebook</a><a href="https://www.facebook.com/sharer/sharer.php">Compartir</a>'
        value=discover(html,'https://municipio.example/')
        self.assertEqual(value['public_social_links'],['https://www.facebook.com/omil.prueba/'])

    def test_source_date_is_not_inferred_from_current_time_or_conflicting_metadata(self):
        html='<meta property="article:published_time" content="2026-10-12"><meta name="date" content="2026-09-01">'
        self.assertIsNone(discover(html,'https://municipio.example/job')['source_published_at'])
        fields=evidence_fields('Se necesita operador\nEmpresa: Empresa de prueba\nLugar de trabajo: Angol\nEnviar CV a empleo@example.cl')
        self.assertIsNone(fields['source_published_at'])
        self.assertIn('fecha_original',fields['missing'])
        self.assertFalse(fields['published'])

    def test_poster_contacts_do_not_substitute_a_workplace_or_create_an_employer(self):
        fields=evidence_fields('Se necesita operador\nOMIL Angol\nCV: empleo@example.cl','2026-10-12')
        self.assertEqual(fields['emails'],['empleo@example.cl'])
        self.assertIsNone(fields['company'])
        self.assertEqual(fields['work_communes'],[])
        self.assertIn('lugar_real',fields['missing'])

    def test_html_labels_survive_extraction_and_dates_do_not_become_phone_contacts(self):
        value=discover('<main><p>Cargo: Operador forestal</p><p>Empresa: Empresa de prueba</p>'
          '<p>Lugar de trabajo: Mininco</p><p>Publicación: 2026-10-12</p></main>','https://municipio.example/job')
        fields=evidence_fields(value['text'],'2026-10-12')
        self.assertEqual(fields['role'],'Operador forestal')
        self.assertEqual(fields['company'],'Empresa de prueba')
        self.assertEqual(fields['work_communes'],['Mininco'])
        self.assertEqual(fields['phones'],[])
        self.assertIn('contacto',fields['missing'])

    def test_courses_and_foreign_links_do_not_become_job_candidates(self):
        html='<a href="/omil-curso">Curso gratuito OMIL</a><a href="https://other.example/vacante">Vacante</a><a href="/aviso.pdf">Oferta laboral: maestro</a>'
        value=discover(html,'https://municipio.example/')
        self.assertEqual(len(value['candidates']),1)
        self.assertEqual(value['candidates'][0]['kind'],'document')

    def test_redirects_outside_the_publisher_are_rejected_before_following(self):
        import urllib.request
        guard=PublisherRedirectGuard('https://municipio.example/job')
        with self.assertRaisesRegex(ValueError,'redirect_outside_publisher'):
            guard.redirect_request(urllib.request.Request('https://municipio.example/job'),None,302,'Found',{},'https://other.example/job')

    def test_failed_sources_remain_visible_in_an_unpaid_nonpublishing_audit(self):
        config={'sources':[{'key':'omil','name':'OMIL','family':'municipal','url':'https://municipio.example/','territory':'Angol'}],
                'unresolved_requested_sources':[]}
        with tempfile.TemporaryDirectory() as folder:
            result=run(Path(folder),config=config,fetcher=lambda *args: (_ for _ in ()).throw(TimeoutError()))
        self.assertEqual(result['source_access'][0]['access'],'unavailable')
        self.assertEqual(result['paid_provider_calls'],0)
        self.assertEqual(result['published'],0)
        self.assertFalse(result['coverage_complete'])

    @unittest.skipUnless(shutil.which('pdftotext'),'local PDF reader unavailable')
    def test_actual_local_pdf_reader_extracts_a_labeled_notice_without_a_provider(self):
        lines=['Cargo: Operador forestal','Empresa: Empresa de prueba','Lugar de trabajo: Angol','Enviar CV a empleo@example.cl']
        stream='BT /F1 14 Tf 50 720 Td '+' 0 -24 Td '.join('('+line+') Tj' for line in lines)+' ET'
        objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
          b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
          b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
          ('<< /Length '+str(len(stream))+' >>\nstream\n'+stream+'\nendstream').encode()]
        pdf=b'%PDF-1.4\n';offsets=[0]
        for number,obj in enumerate(objects,1):
            offsets.append(len(pdf));pdf+=(str(number)+' 0 obj\n').encode()+obj+b'\nendobj\n'
        start=len(pdf);pdf+=b'xref\n0 6\n0000000000 65535 f \n'
        pdf+=b''.join((f'{offset:010} 00000 n \n').encode() for offset in offsets[1:])
        pdf+=('trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+str(start)+'\n%%EOF').encode()
        url='https://municipio.example/aviso.pdf'
        with patch('scripts.local_source_audit.fetch_public',return_value=(pdf,url,'application/pdf',200)):
            read=read_medium(url,url,Budget(25))
        self.assertEqual(read['engine'],'pdftotext-local')
        self.assertIn('empleo@example.cl',read['text'])
        self.assertEqual(evidence_fields(read['text'])['work_communes'],['Angol'])
        self.assertIsNone(evidence_fields(read['text'])['source_published_at'])

    @unittest.skipUnless(shutil.which('tesseract'),'local OCR unavailable')
    def test_actual_local_ocr_preserves_a_visible_contact_in_a_synthetic_poster(self):
        try:from PIL import Image,ImageDraw,ImageFont
        except ImportError:self.skipTest('Pillow test-fixture generator unavailable')
        font_path=Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
        if not font_path.exists():self.skipTest('Fixture font unavailable')
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'synthetic-test-poster.png'
            image=Image.new('RGB',(1300,450),'white');draw=ImageDraw.Draw(image)
            font=ImageFont.truetype(str(font_path),40)
            draw.multiline_text((35,30),'SE NECESITA OPERADOR\nEmpresa: Empresa de prueba\nLugar de trabajo: Angol\nEnviar CV: empleo@example.cl',font=font,fill='black',spacing=20)
            image.save(path)
            result=tesseract_text(path,Budget(25))
        self.assertEqual(result['engine'],'tesseract-local')
        self.assertIn('empleo@example.cl',result['text'])
        self.assertIn('Angol',result['text'])


if __name__=='__main__':unittest.main()
