"""Motor A: auditably testable URL classification for municipal archive discovery.

False escaped regexes previously missed /page/2 and ?paged=2, and
failed to exclude PDF/image downloads from HTML-only archive traversals.
"""
import re

# Pagination is a link discovery hint, not evidence that a job is active.
ARCHIVE = re.compile(
    r'page/\d+|[?&](?:paged|page)=\d+|/category/|/categoria/|/tag/|'
    r'/ofertas?|/empleo|/trabajo|/omil|/convocatoria|/concursos?', re.I
)
# Skip unhelpful historical archive directories; newer (2025+) remain eligible.
OLD_YEAR = re.compile(r'/20(?:0\d|1\d|2[0-4])/')
# Do not fetch binary documents through an HTML parser. Documents/PDFs go to B/C.
DOCUMENT = re.compile(r'\.(?:pdf|jpe?g|png|docx?|xlsx?)(?:\?|$)', re.I)
