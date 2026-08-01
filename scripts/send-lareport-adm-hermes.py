#!/usr/bin/env python3
import argparse
import json
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib import request, parse, error

from lareport_whatsapp_single import send_single_report

ENV_CANDIDATES = [
    Path('/opt/LA-Organizer/.env'),
    Path('/home/sol/.openclaw/gateway.systemd.env'),
]
EDGE_FUNCTION = 'relatorio-admin-whatsapp'
SUPABASE_FALLBACK_URL = 'https://ouqwbbermlzqqvtqwlul.supabase.co'
AUDIT_DIR = Path('/home/sol/.openclaw/workspace/outputs/lareport-adm-hermes')


def load_env_file(path: Path):
    if not path.exists():
        return {}
    out = {}
    for raw in path.read_text(errors='ignore').splitlines():
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        v = v.strip().strip('"').strip("'")
        out[k.strip()] = v
    return out


def load_config():
    env = {}
    for p in ENV_CANDIDATES:
        env.update(load_env_file(p))
    url = env.get('LA_REPORT_SUPABASE_URL') or env.get('SUPABASE_URL') or SUPABASE_FALLBACK_URL
    key = env.get('LA_REPORT_SERVICE_ROLE_KEY') or env.get('SUPABASE_SERVICE_ROLE_KEY') or env.get('SUPABASE_SERVICE_KEY')
    if not key:
        raise SystemExit('missing LA_REPORT_SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY')
    return url.rstrip('/'), key


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
        with request.urlopen(req, timeout=300) as resp:
            text = resp.read().decode('utf-8')
            return json.loads(text) if text else None
    except error.HTTPError as e:
        text = e.read().decode('utf-8', errors='replace')
        raise RuntimeError(f'HTTP {e.code} {url}: {text[:1000]}')


def rest_get(base, key, table, params):
    url = f'{base}/rest/v1/{table}?{parse.urlencode(params, doseq=True)}'
    return http_json('GET', url, key)


def edge_dry_run(base, key, unidade_id):
    url = f'{base}/functions/v1/{EDGE_FUNCTION}'
    body = {'modo': 'dry_run', 'unidade': unidade_id}
    return http_json('POST', url, key, body)


def upsert_fila(base, key, row):
    payload = {'tipo_relatorio': 'relatorio_admin', **row}
    qs = parse.urlencode({
        'on_conflict': 'tipo_relatorio,unidade_id,jid,data_dia',
    })
    url = f'{base}/rest/v1/fila_relatorios_whatsapp?{qs}'
    return http_json(
        'POST', url, key, payload,
        prefer='resolution=merge-duplicates,return=representation'
    )


def now_brt():
    return datetime.now(timezone.utc) - timedelta(hours=3)


def iso_utc_now():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def already_sent_today(base, key, unidade_id, jid, today):
    rows = rest_get(base, key, 'fila_relatorios_whatsapp', {
        'select': 'id,status,enviada_em',
        'tipo_relatorio': 'eq.relatorio_admin',
        'unidade_id': f'eq.{unidade_id}',
        'jid': f'eq.{jid}',
        'data_dia': f'eq.{today}',
        'status': 'eq.enviada',
        'limit': '1',
    }) or []
    return bool(rows)


def send_report(target, text):
    try:
        return {'success': True, **send_single_report(target, text)}
    except Exception as exc:
        return {'success': False, 'error': str(exc)[:1000]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--send', action='store_true', help='send to WhatsApp groups and write fila status')
    ap.add_argument('--dry-run', action='store_true', help='generate only; do not send or write fila')
    ap.add_argument('--unit', help='unit name filter, e.g. Barra')
    ap.add_argument('--sleep-between', type=float, default=20.0)
    args = ap.parse_args()
    if not args.send and not args.dry_run:
        raise SystemExit('use --dry-run or --send')

    base, key = load_config()
    today = now_brt().date().isoformat()
    scheduled_at = iso_utc_now()

    unidades = rest_get(base, key, 'unidades', {
        'select': 'id,nome,ativo,relatorio_diario_cron_ativo',
        'ativo': 'eq.true',
        'relatorio_diario_cron_ativo': 'eq.true',
        'order': 'nome.asc',
    }) or []
    if args.unit:
        unidades = [u for u in unidades if u.get('nome') == args.unit]
    dests = rest_get(base, key, 'whatsapp_destinatarios_relatorio', {
        'select': 'tipo,nome,jid,unidade_id,ativo',
        'tipo': 'eq.relatorio_admin',
        'ativo': 'eq.true',
    }) or []
    by_unit = {}
    for d in dests:
        by_unit.setdefault(d.get('unidade_id'), []).append(d)

    summary = {'started_at': iso_utc_now(), 'date_brt': today, 'send': args.send, 'results': []}
    for idx, u in enumerate(unidades):
        unidade_id = u['id']; unidade_nome = u['nome']
        ds = by_unit.get(unidade_id, [])
        if not ds:
            summary['results'].append({'unidade': unidade_nome, 'status': 'skip', 'reason': 'sem_destinatario'})
            continue
        generated = edge_dry_run(base, key, unidade_id)
        if not generated or not generated.get('success') or not generated.get('texto'):
            err = generated.get('error') if isinstance(generated, dict) else 'dry_run_failed'
            summary['results'].append({'unidade': unidade_nome, 'status': 'erro_geracao', 'error': err})
            continue
        texto = generated['texto']
        for d in ds:
            result = {'unidade': unidade_nome, 'grupo': d['nome'], 'jid': d['jid']}
            if args.dry_run:
                result.update({'status': 'dry_run', 'chars': len(texto)})
                summary['results'].append(result)
                continue
            try:
                if already_sent_today(base, key, unidade_id, d['jid'], today):
                    result.update({'status': 'skip_already_sent_today'})
                    summary['results'].append(result)
                    continue
                send_result = send_report(d['jid'], texto)
                ok = bool(send_result.get('success'))
                row = {
                    'unidade_id': unidade_id,
                    'unidade_nome': unidade_nome,
                    'jid': d['jid'],
                    'grupo_nome': d['nome'],
                    'texto': texto,
                    'status': 'enviada' if ok else 'erro',
                    'agendada_para': scheduled_at,
                    'data_dia': today,
                    'tentativas': 1,
                    'ultima_tentativa_em': iso_utc_now(),
                    'enviada_em': iso_utc_now() if ok else None,
                    'erro': None if ok else (send_result.get('error') or json.dumps(send_result, ensure_ascii=False))[:1000],
                }
                upsert_fila(base, key, row)
                result.update({'status': row['status'], 'message_id': send_result.get('message_id'), 'error': row['erro']})
            except Exception as e:
                err = str(e)[:1000]
                try:
                    upsert_fila(base, key, {
                        'unidade_id': unidade_id,
                        'unidade_nome': unidade_nome,
                        'jid': d['jid'],
                        'grupo_nome': d['nome'],
                        'texto': texto,
                        'status': 'erro',
                        'agendada_para': scheduled_at,
                        'data_dia': today,
                        'tentativas': 1,
                        'ultima_tentativa_em': iso_utc_now(),
                        'enviada_em': None,
                        'erro': err,
                    })
                except Exception:
                    pass
                result.update({'status': 'erro', 'error': err})
            summary['results'].append(result)
            if args.send and idx < len(unidades) - 1:
                time.sleep(args.sleep_between)

    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    out = AUDIT_DIR / f'adm-hermes-{today}-{datetime.now(timezone.utc).strftime("%H%M%S")}.json'
    out.write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f'audit_file={out}', file=sys.stderr)
    if args.send and any(r.get('status') == 'erro' for r in summary['results']):
        raise SystemExit(1)

if __name__ == '__main__':
    main()
