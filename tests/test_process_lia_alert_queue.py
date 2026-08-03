import io
import os
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))

from process_lia_alert_queue import load_config, process_once  # noqa: E402


WORKER_ID = '10000000-0000-4000-8000-000000000099'
CLAIM = {
    'alerta_id': '20000000-0000-4000-8000-000000000001',
    'claim_token': '30000000-0000-4000-8000-000000000001',
    'destino': '5521981278047',
    'mensagem': 'Alerta operacional',
    'evento_tipo': 'resposta_nova',
    'ambiente': 'teste',
}


class FakeApi:
    def __init__(self, claim, complete_result=True):
        self.claim = claim
        self.complete_result = complete_result
        self.claim_filters = []
        self.completed = []
        self.failed = []

    def claim_one(self, worker_id, alerta_id=None):
        self.claim_filters.append(alerta_id)
        return self.claim[0] if self.claim else None

    def complete(self, alerta_id, claim_token, message_id):
        self.completed.append((alerta_id, claim_token, message_id))
        return self.complete_result

    def fail(self, alerta_id, claim_token, error_code, resultado_ambiguo):
        self.failed.append({
            'alerta_id': alerta_id,
            'claim_token': claim_token,
            'error_code': error_code,
            'resultado_ambiguo': resultado_ambiguo,
        })
        return True


class ProcessLiaAlertQueueTest(unittest.TestCase):
    def test_claim_send_ack_once(self):
        api = FakeApi(claim=[CLAIM])
        with patch(
            'process_lia_alert_queue.send_single_report',
            return_value={'message_id': 'MSG-1'},
        ) as send:
            result = process_once(api, worker_id=WORKER_ID)

        self.assertEqual(result['status'], 'enviado')
        send.assert_called_once_with(CLAIM['destino'], CLAIM['mensagem'])
        self.assertEqual(
            api.completed,
            [(CLAIM['alerta_id'], CLAIM['claim_token'], 'MSG-1')],
        )

    def test_timeout_is_ambiguous_and_is_not_retried(self):
        api = FakeApi(claim=[CLAIM])
        with patch(
            'process_lia_alert_queue.send_single_report',
            side_effect=TimeoutError('timeout'),
        ) as send:
            result = process_once(api, worker_id=WORKER_ID)

        self.assertEqual(result['status'], 'resultado_ambiguo')
        self.assertEqual(send.call_count, 1)
        self.assertEqual(api.failed[0]['error_code'], 'bridge_timeout')
        self.assertTrue(api.failed[0]['resultado_ambiguo'])

    def test_invalid_confirmation_is_ambiguous(self):
        api = FakeApi(claim=[CLAIM])
        with patch(
            'process_lia_alert_queue.send_single_report',
            side_effect=RuntimeError('single_message_not_confirmed'),
        ):
            result = process_once(api, worker_id=WORKER_ID)

        self.assertEqual(result['status'], 'resultado_ambiguo')
        self.assertEqual(
            api.failed[0]['error_code'],
            'bridge_confirmacao_ambigua',
        )

    def test_explicit_rejection_is_failure_and_is_not_requeued(self):
        api = FakeApi(claim=[CLAIM])
        with patch(
            'process_lia_alert_queue.send_single_report',
            side_effect=RuntimeError('bridge_http_400'),
        ):
            result = process_once(api, worker_id=WORKER_ID)

        self.assertEqual(result['status'], 'falha')
        self.assertEqual(api.failed[0]['error_code'], 'bridge_http')
        self.assertFalse(api.failed[0]['resultado_ambiguo'])

    def test_logs_do_not_contain_destination_or_message(self):
        api = FakeApi(claim=[CLAIM])
        output = io.StringIO()
        with redirect_stdout(output), patch(
            'process_lia_alert_queue.send_single_report',
            return_value={'message_id': 'MSG-1'},
        ):
            process_once(api, worker_id=WORKER_ID)

        self.assertNotIn(CLAIM['destino'], output.getvalue())
        self.assertNotIn(CLAIM['mensagem'], output.getvalue())

    def test_specific_alert_id_limits_pilot(self):
        api = FakeApi(claim=[CLAIM])
        with patch(
            'process_lia_alert_queue.send_single_report',
            return_value={'message_id': 'MSG-1'},
        ):
            process_once(
                api,
                worker_id=WORKER_ID,
                alerta_id=CLAIM['alerta_id'],
            )

        self.assertEqual(api.claim_filters, [CLAIM['alerta_id']])

    def test_empty_queue_does_not_call_bridge(self):
        api = FakeApi(claim=[])
        with patch('process_lia_alert_queue.send_single_report') as send:
            result = process_once(api, worker_id=WORKER_ID)

        self.assertEqual(result['status'], 'sem_pendencia')
        send.assert_not_called()

    def test_provider_confirmed_but_database_ack_failed_is_never_requeued(self):
        api = FakeApi(claim=[CLAIM], complete_result=False)
        with patch(
            'process_lia_alert_queue.send_single_report',
            return_value={'message_id': 'MSG-1'},
        ) as send:
            with self.assertRaisesRegex(
                RuntimeError,
                'provider_confirmed_database_ack_failed',
            ):
                process_once(api, worker_id=WORKER_ID)

        self.assertEqual(send.call_count, 1)
        self.assertEqual(api.failed, [])

    def test_config_does_not_fallback_to_legacy_environment_names(self):
        with patch.dict(
            os.environ,
            {
                'SUPABASE_URL': 'https://nao-usar.example',
                'SUPABASE_SERVICE_ROLE_KEY': 'nao-usar',
            },
            clear=True,
        ):
            with self.assertRaisesRegex(SystemExit, 'LA_REPORT_SUPABASE_URL'):
                load_config()


if __name__ == '__main__':
    unittest.main()
