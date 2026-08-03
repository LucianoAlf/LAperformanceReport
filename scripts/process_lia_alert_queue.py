#!/usr/bin/env python3
import argparse
import json
import os
import time
import uuid
from urllib import error, request

from lareport_whatsapp_single import send_single_report


RPC_TIMEOUT_SECONDS = 60


def load_config():
    base_url = os.environ.get('LA_REPORT_SUPABASE_URL', '').strip().rstrip('/')
    service_key = os.environ.get('LA_REPORT_SERVICE_ROLE_KEY', '').strip()
    if not base_url:
        raise SystemExit('missing LA_REPORT_SUPABASE_URL')
    if not service_key:
        raise SystemExit('missing LA_REPORT_SERVICE_ROLE_KEY')
    return base_url, service_key


class SupabaseLiaAlertApi:
    def __init__(self, base_url, service_key):
        self.base_url = base_url.rstrip('/')
        self.service_key = service_key

    def _rpc(self, function_name, payload):
        encoded = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        req = request.Request(
            f'{self.base_url}/rest/v1/rpc/{function_name}',
            data=encoded,
            headers={
                'apikey': self.service_key,
                'Authorization': f'Bearer {self.service_key}',
                'Content-Type': 'application/json',
            },
            method='POST',
        )
        try:
            with request.urlopen(req, timeout=RPC_TIMEOUT_SECONDS) as response:
                raw = response.read().decode('utf-8')
        except error.HTTPError as exc:
            raise RuntimeError(f'supabase_rpc_http_{exc.code}') from exc
        except error.URLError as exc:
            raise RuntimeError('supabase_rpc_unavailable') from exc

        try:
            return json.loads(raw) if raw else None
        except json.JSONDecodeError as exc:
            raise RuntimeError('supabase_rpc_invalid_json') from exc

    def claim_one(self, worker_id, alerta_id=None):
        rows = self._rpc('claim_lia_alerta_privado', {
            'p_worker_id': worker_id,
            'p_alerta_id': alerta_id,
        }) or []
        if not isinstance(rows, list):
            raise RuntimeError('supabase_claim_invalid_shape')
        return rows[0] if rows else None

    def complete(self, alerta_id, claim_token, message_id):
        return self._rpc('concluir_lia_alerta_privado', {
            'p_alerta_id': alerta_id,
            'p_claim_token': claim_token,
            'p_provider_message_id': message_id,
        }) is True

    def fail(
        self,
        alerta_id,
        claim_token,
        error_code,
        resultado_ambiguo,
    ):
        return self._rpc('falhar_lia_alerta_privado', {
            'p_alerta_id': alerta_id,
            'p_claim_token': claim_token,
            'p_erro_codigo': error_code,
            'p_resultado_ambiguo': resultado_ambiguo,
        }) is True


def _classify_bridge_error(exc):
    if isinstance(exc, TimeoutError):
        return 'bridge_timeout', True
    if isinstance(exc, (ConnectionError, ConnectionResetError, BrokenPipeError)):
        return 'bridge_conexao_encerrada', True

    message = str(exc).lower()
    if 'bridge_invalid_json' in message:
        return 'bridge_json_invalido', True
    if 'single_message_not_confirmed' in message:
        return 'bridge_confirmacao_ambigua', True
    if 'bridge_unavailable' in message:
        return 'bridge_conexao_encerrada', True
    if 'bridge_http_' in message:
        return 'bridge_http', False
    if (
        'report_' in message
        or 'technical_public_text' in message
        or 'bridge_report_url_not_loopback' in message
    ):
        return 'bridge_rejeitado', False
    return 'bridge_interno', False


def _public_result(claim, status, started_at):
    result = {
        'alerta_id': claim.get('alerta_id') if claim else None,
        'evento_tipo': claim.get('evento_tipo') if claim else None,
        'ambiente': claim.get('ambiente') if claim else None,
        'status': status,
        'duracao_ms': round((time.monotonic() - started_at) * 1000),
    }
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return result


def process_once(api, worker_id, alerta_id=None):
    started_at = time.monotonic()
    claim = api.claim_one(worker_id, alerta_id=alerta_id)
    if not claim:
        return _public_result(None, 'sem_pendencia', started_at)

    try:
        response = send_single_report(claim['destino'], claim['mensagem'])
        message_id = response.get('message_id') if isinstance(response, dict) else None
        if not message_id:
            raise RuntimeError('single_message_not_confirmed')
    except Exception as exc:
        error_code, ambiguous = _classify_bridge_error(exc)
        if not api.fail(
            claim['alerta_id'],
            claim['claim_token'],
            error_code,
            ambiguous,
        ):
            raise RuntimeError('supabase_fail_claim_mismatch') from exc
        status = 'resultado_ambiguo' if ambiguous else 'falha'
        return _public_result(claim, status, started_at)

    # O provedor ja confirmou a mensagem. Se o ACK local falhar, manter o claim
    # em processamento para a rotina de abandono enviar o caso a administracao;
    # jamais reinterpretar como falha de transporte nem reenfileirar.
    if not api.complete(
        claim['alerta_id'],
        claim['claim_token'],
        message_id,
    ):
        raise RuntimeError('provider_confirmed_database_ack_failed')
    return _public_result(claim, 'enviado', started_at)


def main():
    parser = argparse.ArgumentParser(
        description='Processa uma entrega da outbox privada da Lia.',
    )
    parser.add_argument('--once', action='store_true')
    parser.add_argument('--alerta-id')
    args = parser.parse_args()
    if not args.once:
        parser.error('--once is required')

    if args.alerta_id:
        try:
            uuid.UUID(args.alerta_id)
        except ValueError as exc:
            parser.error(f'--alerta-id invalido: {exc}')

    base_url, service_key = load_config()
    api = SupabaseLiaAlertApi(base_url, service_key)
    process_once(
        api,
        worker_id=str(uuid.uuid4()),
        alerta_id=args.alerta_id,
    )


if __name__ == '__main__':
    main()
