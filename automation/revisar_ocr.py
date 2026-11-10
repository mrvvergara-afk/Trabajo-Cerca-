#!/usr/bin/env python3
"""Trusted reviewer CLI; signing key must be supplied outside the repository."""
import argparse
import datetime as dt
import hashlib
import json
import os
import tempfile
from pathlib import Path
from ocr_review_security import signature, redact
from promover_revision_a_motor_d import eligible
from trabajo_cerca.trabajo_cerca_lector_documental import allowed, robots_ok, fetch_bytes, extract_text, maximum_for_url


def review(item, decision, reviewer, notes, fields, document, key, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    result = dict(item)
    if decision == 'approve':
        permitted = set(__import__('ocr_review_security').FIELDS) - {
            'review_id', 'canonical_url', 'url', 'approved_by', 'approved_at',
            'document_sha256', 'review_status', 'publication_eligible'}
        if set(fields) - permitted:
            raise ValueError('Campos de revisión no permitidos')
        result.update(fields)
    result.update(review_status='approved' if decision == 'approve' else 'rejected',
                  approved_by=reviewer, approved_at=now.isoformat(),
                  review_notes=redact(notes), document_sha256=(hashlib.sha256(document).hexdigest()
                      if decision == "approve" else item.get("document_sha256")),
                  publication_eligible=decision == 'approve')
    if not reviewer.strip() or not notes.strip():
        raise ValueError('Revisor y notas obligatorios')
    result['review_signature'] = signature(result, key)
    if decision == 'approve' and not eligible(result, now.astimezone(__import__("zoneinfo").ZoneInfo("America/Santiago")).date(), key, lambda _: document, now):
        raise ValueError('Evidencia, fecha, vigencia o campos de postulación insuficientes')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--queue', default='automation/motor_d_review/radar_ocr_pending.json')
    parser.add_argument('--review-id', required=True)
    parser.add_argument('--decision', choices=['approve', 'reject'], required=True)
    parser.add_argument('--reviewer', required=True)
    parser.add_argument('--notes', required=True)
    parser.add_argument('--fields', type=Path, help='JSON privado con campos verificados')
    args = parser.parse_args()
    path = Path(args.queue)
    queue = json.loads(path.read_text())
    matches = [x for x in queue['items'] if x['review_id'] == args.review_id]
    if len(matches) != 1:
        raise ValueError('Identificador de revisión ambiguo o inexistente')
    item = matches[0]
    fields = json.loads(args.fields.read_text()) if args.fields else {}
    document = b''
    if args.decision == 'approve':
        if not allowed(item['url']) or not robots_ok(item['url']):
            raise ValueError('Documento no permitido')
        document, mime = fetch_bytes(item['url'], maximum_for_url(item['url']))
        text, extractor = extract_text(document, mime, item['url'])
        if len(text.strip()) < 140 or extractor not in {'pdf_text','pdf_ocr_local','imagen_ocr_local','html_text'}:
            raise ValueError('Documento incompleto o ilegible: no autorizar')
        fields['extractor'] = extractor
    result = review(item, args.decision, args.reviewer, args.notes, fields, document,
                    os.getenv('MOTOR_D_REVIEW_SIGNING_KEY'))
    item.clear()
    item.update(result)
    # Atomic replacement protects existing signed reviews on interruption.
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent,
                                         prefix='.ocr_review_', suffix='.tmp', delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(json.dumps(queue, ensure_ascii=False, indent=2) + '\\n')
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)

if __name__ == '__main__':
    main()
