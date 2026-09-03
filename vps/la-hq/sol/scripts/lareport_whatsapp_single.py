#!/usr/bin/env python3
import json
import os
import re
import time
from pathlib import Path
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

# ── Fallback: UAZAPI direto (caixa "Lia - Sucesso do Aluno") ────────────────
# Usado quando o bridge nativo da Sol (Baileys, sessao vinculada por QR,
# 127.0.0.1:3000) esta desconectado. Reaproveita o token ja provisionado em
# whatsapp_caixas -- nao depende de nenhum processo/VPS da Lia, e so uma
# chamada HTTPS pra nuvem UAZAPI (mesma infra usada pelo resto do LA Report).
_ENV_CANDIDATES = [Path('/opt/LA-Organizer/.env'), Path('/home/sol/.openclaw/gateway.systemd.env')]
_SUPABASE_FALLBACK_URL = 'https://ouqwbbermlzqqvtqwlul.supabase.co'
_UAZAPI_FALLBACK_CAIXA_ID = int(os.environ.get('UAZAPI_FALLBACK_CAIXA_ID', '3'))
_UAZAPI_CREDS_TTL_SECONDS = 300
# cache por caixa: {caixa_id: {'at': float, 'data': dict}}
_uazapi_creds_cache = {}


def _load_env_file(path):
    if not path.exists():
        return {}
    out = {}
    try:
        _conteudo_env = path.read_text(errors='ignore')
    except (PermissionError, OSError):
        return {}
    for raw in _conteudo_env.splitlines():
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def _load_supabase_config():
    env = {}
    for p in _ENV_CANDIDATES:
        env.update(_load_env_file(p))
    url = env.get('LA_REPORT_SUPABASE_URL') or env.get('SUPABASE_URL') or _SUPABASE_FALLBACK_URL
    key = env.get('LA_REPORT_SERVICE_ROLE_KEY') or env.get('SUPABASE_SERVICE_ROLE_KEY') or env.get('SUPABASE_SERVICE_KEY')
    if not key:
        raise RuntimeError('uazapi_fallback_missing_service_role_key')
    return url.rstrip('/'), key


def _fetch_uazapi_creds(caixa_id=None):
    caixa_id = int(caixa_id or _UAZAPI_FALLBACK_CAIXA_ID)
    now = time.time()
    cached = _uazapi_creds_cache.get(caixa_id)
    if cached and cached['data'] and (now - cached['at']) < _UAZAPI_CREDS_TTL_SECONDS:
        return cached['data']

    base, key = _load_supabase_config()
    qs = parse.urlencode({
        'select': 'id,nome,uazapi_url,uazapi_token,ativo,provedor,waha_url,waha_api_key,waha_session',
        'id': f'eq.{caixa_id}',
    })
    req = request.Request(
        f'{base}/rest/v1/whatsapp_caixas?{qs}',
        headers={'apikey': key, 'Authorization': f'Bearer {key}'},
        method='GET',
    )
    with request.urlopen(req, timeout=30) as response:
        rows = json.loads(response.read().decode('utf-8'))

    if not rows or not rows[0].get('ativo') or not rows[0].get('uazapi_url') or not rows[0].get('uazapi_token'):
        raise RuntimeError(f'uazapi_creds_missing_or_inactive: caixa_id={caixa_id}')

    creds = {
        'url': rows[0]['uazapi_url'].rstrip('/'),
        'token': rows[0]['uazapi_token'],
        'nome': rows[0]['nome'],
        'caixa_id': caixa_id,
        # roteamento por provedor (03/09): a Mila fala por sessao WAHA
        'provedor': (rows[0].get('provedor') or 'uazapi').lower(),
        'waha_url': (rows[0].get('waha_url') or '').rstrip('/'),
        'waha_api_key': rows[0].get('waha_api_key') or '',
        'waha_session': rows[0].get('waha_session') or '',
    }
    _uazapi_creds_cache[caixa_id] = {'at': now, 'data': creds}
    return creds


def _send_via_uazapi(jid, text, timeout, caixa_id=None):
    creds = _fetch_uazapi_creds(caixa_id)
    payload = json.dumps(
        {'number': jid, 'text': text, 'linkPreview': True},
        ensure_ascii=False,
    ).encode('utf-8')
    req = request.Request(
        f"{creds['url']}/send/text",
        data=payload,
        headers={'Content-Type': 'application/json', 'token': creds['token']},
        method='POST',
    )
    try:
        with request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode('utf-8')
    except error.HTTPError as exc:
        detail = exc.read().decode('utf-8', errors='replace')[:1000]
        raise RuntimeError(f'uazapi_fallback_http_{exc.code}: {detail}') from exc
    except error.URLError as exc:
        raise RuntimeError(f'uazapi_fallback_unavailable: {exc.reason}') from exc

    try:
        result = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError('uazapi_fallback_invalid_json') from exc

    if result.get('error'):
        raise RuntimeError(f"uazapi_fallback_error: {result.get('error')}")

    message_id = result.get('id') or result.get('messageid') or (result.get('key') or {}).get('id')
    if not message_id:
        raise RuntimeError('uazapi_fallback_message_id_missing')

    return {
        'message_id': message_id,
        'transport': (
            f"uazapi_caixa_{creds['caixa_id']}" if caixa_id
            else 'uazapi_fallback'
        ),
    }


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


def _send_via_waha(jid, text, timeout, caixa_id):
    """Envia pela sessao WAHA da caixa. Sem fallback: sair pelo numero errado e
    pior que nao sair."""
    creds = _fetch_uazapi_creds(caixa_id)
    if not creds['waha_url'] or not creds['waha_api_key'] or not creds['waha_session']:
        raise RuntimeError(f"waha_creds_missing: caixa_id={caixa_id}")
    payload = json.dumps(
        {'session': creds['waha_session'], 'chatId': jid, 'text': text},
        ensure_ascii=False,
    ).encode('utf-8')
    req = request.Request(
        f"{creds['waha_url']}/api/sendText",
        data=payload,
        headers={
            'Content-Type': 'application/json',
            'X-Api-Key': creds['waha_api_key'],
            # Cloudflare na frente do WAHA devolve Error 1010 para UA nao-browser
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
        },
        method='POST',
    )
    try:
        with request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode('utf-8')
    except error.HTTPError as exc:
        detail = exc.read().decode('utf-8', errors='replace')[:1000]
        raise RuntimeError(f'waha_http_{exc.code}: {detail}') from exc
    except error.URLError as exc:
        raise RuntimeError(f'waha_unavailable: {exc.reason}') from exc
    try:
        result = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError('waha_invalid_json') from exc
    message_id = (
        result.get('id')
        or (result.get('key') or {}).get('id')
        or (result.get('_data') or {}).get('id', {}).get('id') if isinstance((result.get('_data') or {}).get('id'), dict) else None
    ) or result.get('id')
    if not message_id:
        raise RuntimeError(f'waha_message_id_missing: {raw[:300]}')
    return {'message_id': message_id, 'transport': f"waha_caixa_{caixa_id}"}


def _send_via_native_bridge(jid, text, timeout):
    payload = json.dumps(
        {'chatId': jid, 'message': text},
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
    parsed = validate_single_response(result)
    parsed['transport'] = 'native_bridge'
    return parsed


def send_single_report(jid, text, timeout=180, caixa_id=None):
    validate_public_text(text)
    if not isinstance(jid, str) or not jid.strip():
        raise RuntimeError('report_destination_empty')
    jid = jid.strip()

    # Rota declarada pelo destinatario: envia SO por essa caixa, sem fallback
    # cruzado. Sair pelo numero errado e pior do que nao sair -- quem recebe
    # confere o remetente, e trocar de remetente no dia da falha quebra o canal.
    if caixa_id:
        if _fetch_uazapi_creds(caixa_id)['provedor'] == 'waha':
            return _send_via_waha(jid, text, timeout, caixa_id)
        return _send_via_uazapi(jid, text, timeout, caixa_id)

    _validate_bridge_url(BRIDGE_REPORT_URL)
    try:
        return _send_via_native_bridge(jid, text, timeout)
    except RuntimeError as bridge_error:
        try:
            return _send_via_uazapi(jid, text, timeout)
        except RuntimeError as fallback_error:
            raise RuntimeError(
                f'native_bridge_falhou: {bridge_error} | uazapi_fallback_falhou: {fallback_error}'
            ) from fallback_error
