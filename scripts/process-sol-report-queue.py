#!/usr/bin/env python3
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib import error, parse, request

from lareport_whatsapp_single import send_single_report


ENV_CANDIDATES = [
    Path('/opt/LA-Organizer/.env'),
    Path('/home/sol/.openclaw/gateway.systemd.env'),
]
SUPABASE_FALLBACK_URL = 'https://ouqwbbermlzqqvtqwlul.supabase.co'
QUEUE_TABLE = 'fila_relatorios_sol_hermes'
AUDIT_DIR = Path('/home/sol/.openclaw/workspace/outputs/sol-report-queue-hermes')


def load_env_file(path):
    if not path.exists():
        return {}
    values = {}
    for raw in path.read_text(errors='ignore').splitlines():
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def load_config():
    env = {}
    for path in ENV_CANDIDATES:
        env.update(load_env_file(path))
    base = (
        env.get('LA_REPORT_SUPABASE_URL')
        or env.get('SUPABASE_URL')
        or SUPABASE_FALLBACK_URL
    )
    key = (
        env.get('LA_REPORT_SERVICE_ROLE_KEY')
        or env.get('SUPABASE_SERVICE_ROLE_KEY')
        or env.get('SUPABASE_SERVICE_KEY')
    )
    if not key:
        raise SystemExit(
            'missing LA_REPORT_SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY'
        )
    return base.rstrip('/'), key


def http_json(method, url, key, body=None):
    data = None if body is None else json.dumps(
        body,
        ensure_ascii=False,
    ).encode('utf-8')
    headers = {
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    }
    req = request.Request(url, data=data, headers=headers, method=method)
    try:
        with request.urlopen(req, timeout=120) as response:
            text = response.read().decode('utf-8')
            return json.loads(text) if text else None
    except error.HTTPError as exc:
        detail = exc.read().decode('utf-8', errors='replace')
        raise RuntimeError(f'HTTP {exc.code} {url}: {detail[:1000]}') from exc


def rest_get(base, key, table, params):
    query = parse.urlencode(params, doseq=True)
    return http_json('GET', f'{base}/rest/v1/{table}?{query}', key)


def rest_patch(base, key, table, filters, body):
    query = parse.urlencode(filters, doseq=True)
    return http_json('PATCH', f'{base}/rest/v1/{table}?{query}', key, body)


def iso_utc_now():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def send_report(target, text):
    try:
        return {'success': True, **send_single_report(target, text)}
    except Exception as exc:
        return {'success': False, 'error': str(exc)[:1000]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--once', action='store_true')
    parser.add_argument('--limit', type=int, default=10)
    args = parser.parse_args()

    base, key = load_config()
    items = rest_get(base, key, QUEUE_TABLE, {
        'select': (
            'id,unidade_id,unidade_nome,jid,grupo_nome,texto,status,'
            'tentativas,created_at,agendada_para,erro'
        ),
        'status': 'eq.sol_pendente',
        'agendada_para': f'lte.{datetime.now(timezone.utc).isoformat()}',
        'order': 'created_at.asc',
        'limit': str(args.limit),
    }) or []
    summary = {
        'started_at': iso_utc_now(),
        'dry_run': args.dry_run,
        'found': len(items),
        'results': [],
    }

    for item in items:
        row_id = item['id']
        base_result = {
            'id': row_id,
            'unidade': item.get('unidade_nome'),
            'grupo': item.get('grupo_nome'),
        }
        if args.dry_run:
            summary['results'].append({
                **base_result,
                'jid': item.get('jid'),
                'chars': len(item.get('texto') or ''),
                'status': 'dry_run',
            })
            continue

        rest_patch(
            base,
            key,
            QUEUE_TABLE,
            {'id': f'eq.{row_id}', 'status': 'eq.sol_pendente'},
            {
                'status': 'sol_enviando',
                'tentativas': int(item.get('tentativas') or 0) + 1,
                'ultima_tentativa_em': iso_utc_now(),
            },
        )

        send_result = send_report(item['jid'], item['texto'])
        if send_result.get('success'):
            rest_patch(base, key, QUEUE_TABLE, {'id': f'eq.{row_id}'}, {
                'status': 'enviada',
                'enviada_em': iso_utc_now(),
                'erro': None,
            })
            summary['results'].append({
                **base_result,
                'status': 'enviada',
                'message_id': send_result.get('message_id'),
            })
            continue

        send_error = send_result.get('error') or 'erro desconhecido'
        rest_patch(base, key, QUEUE_TABLE, {'id': f'eq.{row_id}'}, {
            'status': 'erro',
            'erro': send_error,
            'ultima_tentativa_em': iso_utc_now(),
        })
        summary['results'].append({
            **base_result,
            'status': 'erro',
            'error': send_error,
        })

    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    output = AUDIT_DIR / (
        'process-sol-report-queue-'
        f'{datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")}.json'
    )
    output.write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f'audit_file={output}')
    if any(result.get('status') == 'erro' for result in summary['results']):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
