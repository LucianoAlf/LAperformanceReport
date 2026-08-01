#!/usr/bin/env python3
import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib import error, parse, request
from zoneinfo import ZoneInfo

from lareport_whatsapp_single import send_single_report

ENV_CANDIDATES = [
    Path('/opt/LA-Organizer/.env'),
    Path('/home/sol/.openclaw/gateway.systemd.env'),
]
EDGE_FUNCTION = 'relatorio-admin-whatsapp'
QUEUE_TABLE = 'fila_relatorios_whatsapp'
COMERCIAL_TIPO = 'relatorio_comercial'
SUPABASE_FALLBACK_URL = 'https://ouqwbbermlzqqvtqwlul.supabase.co'
AUDIT_DIR = Path('/home/sol/.openclaw/workspace/outputs/lareport-comercial-hermes')
FUSO_BRT = ZoneInfo('America/Sao_Paulo')


def load_env_file(path: Path):
    if not path.exists():
        return {}
    out = {}
    for raw in path.read_text(errors='ignore').splitlines():
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        out[key.strip()] = value.strip().strip('"').strip("'")
    return out


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
        raise SystemExit('missing LA_REPORT_SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY')
    return base.rstrip('/'), key


def http_json(method, url, key, body=None, prefer=None):
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode('utf-8')
    headers = {
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
    }
    if prefer:
        headers['Prefer'] = prefer
    req = request.Request(url, data=data, headers=headers, method=method)
    try:
        with request.urlopen(req, timeout=300) as response:
            text = response.read().decode('utf-8')
            return json.loads(text) if text else None
    except error.HTTPError as exc:
        text = exc.read().decode('utf-8', errors='replace')
        raise RuntimeError(f'HTTP {exc.code} {url}: {text[:1000]}') from exc


def rest_get(base, key, table, params):
    query = parse.urlencode(params, doseq=True)
    return http_json('GET', f'{base}/rest/v1/{table}?{query}', key)


def edge_dry_run_comercial(base, key, unidade_id, data_referencia):
    return http_json(
        'POST',
        f'{base}/functions/v1/{EDGE_FUNCTION}',
        key,
        {
            'modo': 'dry_run_comercial',
            'unidade': unidade_id,
            'data_referencia': data_referencia,
        },
    )


def upsert_fila(base, key, row):
    payload = {'tipo_relatorio': COMERCIAL_TIPO, **row}
    query = parse.urlencode({
        'on_conflict': 'tipo_relatorio,unidade_id,jid,data_dia',
    })
    return http_json(
        'POST',
        f'{base}/rest/v1/{QUEUE_TABLE}?{query}',
        key,
        payload,
        prefer='resolution=merge-duplicates,return=representation',
    )


def iso_utc_now():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def data_brt():
    return datetime.now(FUSO_BRT).date().isoformat()


def already_sent_today(base, key, unidade_id, jid, today):
    rows = rest_get(base, key, QUEUE_TABLE, {
        'select': 'id,status,enviada_em',
        'tipo_relatorio': 'eq.relatorio_comercial',
        'unidade_id': f'eq.{unidade_id}',
        'jid': f'eq.{jid}',
        'data_dia': f'eq.{today}',
        'status': 'in.(enviando,enviada)',
        'limit': '1',
    }) or []
    return rows[0] if rows else None


def send_report(target, text):
    try:
        return {'success': True, **send_single_report(target, text)}
    except Exception as exc:
        return {'success': False, 'error': str(exc)[:1000]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--send', action='store_true')
    parser.add_argument('--unit', help='unit name filter, e.g. Barra')
    parser.add_argument('--sleep-between', type=float, default=20.0)
    args = parser.parse_args()
    if not args.dry_run and not args.send:
        raise SystemExit('use --dry-run or --send')

    base, key = load_config()
    today = data_brt()
    scheduled_at = iso_utc_now()
    unit_params = {
        'select': 'id,nome,ativo,relatorio_comercial_diario_cron_ativo',
        'ativo': 'eq.true',
        'order': 'nome.asc',
    }
    if args.send:
        unit_params['relatorio_comercial_diario_cron_ativo'] = 'eq.true'
    units = rest_get(base, key, 'unidades', unit_params) or []
    if args.unit:
        units = [unit for unit in units if unit.get('nome') == args.unit]

    destinations = rest_get(base, key, 'whatsapp_destinatarios_relatorio', {
        'select': 'tipo,nome,jid,unidade_id,ativo',
        'tipo': 'eq.relatorio_comercial',
        'ativo': 'eq.true',
    }) or []
    by_unit = {}
    for destination in destinations:
        by_unit.setdefault(destination.get('unidade_id'), []).append(destination)

    summary = {
        'started_at': iso_utc_now(),
        'date_brt': today,
        'mode': 'send' if args.send else 'dry_run',
        'results': [],
    }
    for index, unit in enumerate(units):
        generated = edge_dry_run_comercial(base, key, unit['id'], today)
        if not generated or not generated.get('success') or not generated.get('texto'):
            error_message = (
                generated.get('error')
                if isinstance(generated, dict)
                else 'dry_run_comercial_failed'
            )
            summary['results'].append({
                'unidade': unit['nome'],
                'status': 'erro_geracao',
                'error': error_message,
            })
            continue

        texto = generated['texto']
        if args.dry_run:
            summary['results'].append({
                'unidade': unit['nome'],
                'status': 'dry_run',
                'chars': len(texto),
                'texto': texto,
            })
            continue

        unit_destinations = by_unit.get(unit['id'], [])
        if not unit_destinations:
            summary['results'].append({
                'unidade': unit['nome'],
                'status': 'skip',
                'reason': 'sem_destinatario',
            })
            continue

        for destination in unit_destinations:
            result = {
                'unidade': unit['nome'],
                'grupo': destination['nome'],
                'jid': destination['jid'],
            }
            existing = already_sent_today(
                base,
                key,
                unit['id'],
                destination['jid'],
                today,
            )
            if existing:
                result.update({
                    'status': 'skip_already_sent_today',
                    'existing_status': existing.get('status'),
                })
                summary['results'].append(result)
                continue

            common_row = {
                'unidade_id': unit['id'],
                'unidade_nome': unit['nome'],
                'jid': destination['jid'],
                'grupo_nome': destination['nome'],
                'texto': texto,
                'agendada_para': scheduled_at,
                'data_dia': today,
                'tentativas': 1,
            }
            try:
                upsert_fila(base, key, {
                    **common_row,
                    'status': 'enviando',
                    'ultima_tentativa_em': iso_utc_now(),
                    'enviada_em': None,
                    'erro': None,
                })
            except Exception as exc:
                result.update({
                    'status': 'erro_pre_registro',
                    'error': str(exc)[:1000],
                })
                summary['results'].append(result)
                continue

            send_result = send_report(destination['jid'], texto)
            send_ok = bool(send_result.get('success'))
            final_status = 'enviada' if send_ok else 'erro'
            final_error = None if send_ok else (
                send_result.get('error')
                or json.dumps(send_result, ensure_ascii=False)
            )[:1000]
            sent_at = iso_utc_now() if send_ok else None
            try:
                upsert_fila(base, key, {
                    **common_row,
                    'status': final_status,
                    'ultima_tentativa_em': iso_utc_now(),
                    'enviada_em': sent_at,
                    'erro': final_error,
                })
                result.update({
                    'status': final_status,
                    'message_id': send_result.get('message_id'),
                    'error': final_error,
                })
            except Exception as exc:
                result.update({
                    'status': (
                        'enviada_sem_confirmacao_fila'
                        if send_ok
                        else 'erro_sem_confirmacao_fila'
                    ),
                    'message_id': send_result.get('message_id'),
                    'error': str(exc)[:1000],
                })
            summary['results'].append(result)
            if index < len(units) - 1:
                time.sleep(args.sleep_between)

    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    output = AUDIT_DIR / (
        f'comercial-hermes-{today}-'
        f'{datetime.now(timezone.utc).strftime("%H%M%S")}.json'
    )
    output.write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f'audit_file={output}', file=sys.stderr)
    failing_statuses = {
        'erro_geracao',
        'erro_pre_registro',
        'erro',
        'erro_sem_confirmacao_fila',
        'enviada_sem_confirmacao_fila',
    }
    if any(item.get('status') in failing_statuses for item in summary['results']):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
