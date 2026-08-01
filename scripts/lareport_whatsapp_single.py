#!/usr/bin/env python3
import json
import os
import re
from urllib import error, parse, request


BRIDGE_REPORT_URL = os.environ.get(
    'LA_REPORT_WHATSAPP_SINGLE_URL',
    'http://127.0.0.1:3000/send-report',
)
REPORT_MAX_LENGTH = 16_000
_LOOPBACK_HOSTS = {'127.0.0.1', 'localhost', '::1'}
_TECHNICAL_PATTERNS = [
    re.compile(r'\bget_[a-z0-9_]+\b', re.IGNORECASE),
    re.compile(r'\b(?:GET|POST|PATCH|DELETE)\s+/', re.IGNORECASE),
    re.compile(r'\bRPC\b', re.IGNORECASE),
    re.compile(r'\bsnapshot\b', re.IGNORECASE),
    re.compile(r'\bcoorte\b', re.IGNORECASE),
    re.compile(r'\bfonte\s+can[oô]nica\b', re.IGNORECASE),
    re.compile(r'\bcan[oô]nico\s+v\d+\b', re.IGNORECASE),
    re.compile(r'\bAmerica/Sao_Paulo\b', re.IGNORECASE),
]


def utf16_length(text):
    return len(text.encode('utf-16-le')) // 2


def validate_public_text(text):
    if not isinstance(text, str) or not text.strip():
        raise RuntimeError('report_text_empty')
    if utf16_length(text) > REPORT_MAX_LENGTH:
        raise RuntimeError('report_too_long')
    if any(pattern.search(text) for pattern in _TECHNICAL_PATTERNS):
        raise RuntimeError('technical_public_text')
    return text


def validate_single_response(payload):
    if not isinstance(payload, dict):
        raise RuntimeError('single_message_not_confirmed')
    message_id = payload.get('messageId')
    message_ids = payload.get('messageIds')
    if (
        payload.get('success') is not True
        or payload.get('singleMessage') is not True
        or not isinstance(message_id, str)
        or not message_id
        or not isinstance(message_ids, list)
        or message_ids != [message_id]
    ):
        raise RuntimeError('single_message_not_confirmed')
    return {'message_id': message_id}


def _validate_bridge_url(url):
    parsed = parse.urlparse(url)
    if (
        parsed.scheme != 'http'
        or parsed.hostname not in _LOOPBACK_HOSTS
        or parsed.path != '/send-report'
    ):
        raise RuntimeError('bridge_report_url_not_loopback')


def send_single_report(jid, text, timeout=180):
    validate_public_text(text)
    _validate_bridge_url(BRIDGE_REPORT_URL)
    if not isinstance(jid, str) or not jid.strip():
        raise RuntimeError('report_destination_empty')

    payload = json.dumps(
        {'chatId': jid.strip(), 'message': text},
        ensure_ascii=False,
    ).encode('utf-8')
    req = request.Request(
        BRIDGE_REPORT_URL,
        data=payload,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode('utf-8')
    except error.HTTPError as exc:
        detail = exc.read().decode('utf-8', errors='replace')[:1000]
        raise RuntimeError(f'bridge_http_{exc.code}: {detail}') from exc
    except error.URLError as exc:
        raise RuntimeError(f'bridge_unavailable: {exc.reason}') from exc

    try:
        result = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError('bridge_invalid_json') from exc
    return validate_single_response(result)
