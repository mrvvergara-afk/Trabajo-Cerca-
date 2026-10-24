"""Read each competition's own date, stage and establishment from the public SSAN index."""
import datetime as dt
import re
import urllib.parse
from html.parser import HTMLParser
from zoneinfo import ZoneInfo

from .common import normalized, utcnow
from .local_history import literal_date

TARGETS=('angol','lumaco','los sauces','traiguen','renaico','nacimiento','negrete','mulchen','collipulli')


class Cards(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows=[];self.row=None;self.depth=0;self.in_title=False

    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if self.row is None and tag=='div' and 'e-loop-item' in attrs.get('class','').split():
            self.row={'text':[],'title':[],'url':None};self.depth=1;return
        if self.row is None:return
        if tag=='div':self.depth+=1
        if tag=='h3':self.in_title=True
        if tag=='a' and self.in_title:self.row['url']=attrs.get('href')

    def handle_endtag(self,tag):
        if self.row is None:return
        if tag=='h3':self.in_title=False
        if tag=='div':
            self.depth-=1
            if self.depth==0:self.rows.append(self.row);self.row=None

    def handle_data(self,text):
        if self.row is not None:
            self.row['text'].append(text)
            if self.in_title:self.row['title'].append(text)


def parse_index(raw,source_url,html_sha256,*,now=None):
    if urllib.parse.urlsplit(source_url).hostname!='ssan.redsalud.gob.cl':raise ValueError('primary_publisher_required')
    parser=Cards();parser.feed(raw);results=[];now=now or utcnow()
    for row in parser.rows:
        text=re.sub(r'\s+',' ',' '.join(row['text'])).strip()
        url=urllib.parse.urljoin(source_url,row['url'] or '')
        if urllib.parse.urlsplit(url).hostname!='ssan.redsalud.gob.cl':continue
        stage=re.search(r'Estado del concurso:\s*(.*?)\s*Establecimiento:',text)
        place=re.search(r'Establecimiento:\s*(.*?)\s*Tipo de convocatoria:',text)
        date=re.search(r'Publicado el\s*(\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4})',text,re.I)
        original=literal_date(date[1]) if date else None
        location=place[1] if place else None
        commune=next((town for town in TARGETS if re.search(r'\b'+town+r'\b',normalized(location or '').lower())),None)
        open_now=bool(stage and 'etapa de postulacion' in normalized(stage[1]).lower())
        recent=bool(original and 0<=(now.astimezone(ZoneInfo('America/Santiago')).date()-original.date()).days<=45)
        results.append({'url':url,'title':re.sub(r'\s+',' ',' '.join(row['title'])).strip(),
            'publisher_index':source_url,'html_sha256':html_sha256,'literal':text,
            'original_publication_date':original.date().isoformat() if original else None,'date_precision':'date_only',
            'stage':stage[1] if stage else None,'establishment':location,'literal_target_commune':commune,
            'within_45_days':recent,'open_for_applications':open_now,
            'review_candidate':bool(commune and recent and open_now),'verified':False,'published':0})
    return results
