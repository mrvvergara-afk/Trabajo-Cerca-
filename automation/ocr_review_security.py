"""Signed review records. The signing key belongs to the trusted reviewer, never Git."""
import datetime as dt
import hashlib
import hmac
import json
import os
import re

FIELDS = ('review_id', 'canonical_url', 'url', 'review_status', 'approved_by',
          'approved_at', 'review_notes', 'document_sha256', 'date_source',
          'publication_date_confirmed', 'title', 'employer', 'work_commune',
          'application_url', 'deadline', 'vigencia_verified_at', 'revalidate_after',
          'work_location_verified', 'employer_verified', 'application_route_verified',
          'application_evidence', 'evidence', 'http', 'source_commune_not_confirmed',
          'publication_eligible', 'extractor')

def signature(item, key):
    if not key or len(key) < 32:
        raise ValueError('MOTOR_D_REVIEW_SIGNING_KEY debe tener al menos 32 caracteres')
    payload = json.dumps({k: item.get(k) for k in FIELDS}, sort_keys=True,
                         ensure_ascii=False, separators=(',', ':')).encode()
    return hmac.new(key.encode(), payload, hashlib.sha256).hexdigest()

def verify(item, key=None):
    try:
        return hmac.compare_digest(signature(item, key or os.getenv('MOTOR_D_REVIEW_SIGNING_KEY')),
                                   str(item.get('review_signature', '')))
    except ValueError:
        return False

def timestamp(value):
    parsed = dt.datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('Se requiere zona horaria')
    return parsed

def redact(value):
    if not isinstance(value, str):
        return None
    value = re.sub(r'[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}', '[correo]', value)
    value = re.sub(r'(?<!\w)\d{1,2}[.]?\d{3}[.]?\d{3}-[\dkK](?!\w)', '[rut]', value)
    return re.sub(r'(?<!\d)(?:\+?56[\s()-]*)?\d(?:[\s()-]*\d){7,8}(?!\d)', '[teléfono]', value)
