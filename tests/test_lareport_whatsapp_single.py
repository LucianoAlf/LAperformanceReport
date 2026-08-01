import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPTS_DIR = Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(SCRIPTS_DIR))

from lareport_whatsapp_single import (  # noqa: E402
    REPORT_MAX_LENGTH,
    send_single_report,
    validate_public_text,
    validate_single_response,
)


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def read(self):
        return json.dumps(self.payload).encode('utf-8')


class SingleMessageClientTest(unittest.TestCase):
    def test_accepts_exactly_one_message_id(self):
        result = validate_single_response({
            'success': True,
            'singleMessage': True,
            'messageId': 'ABC',
            'messageIds': ['ABC'],
        })
        self.assertEqual(result['message_id'], 'ABC')

    def test_rejects_chunked_or_ambiguous_response(self):
        invalid = [
            {
                'success': True,
                'singleMessage': True,
                'messageId': 'B',
                'messageIds': ['A', 'B'],
            },
            {
                'success': True,
                'messageId': 'A',
                'messageIds': ['A'],
            },
            {
                'success': True,
                'singleMessage': True,
                'messageIds': [],
            },
        ]
        for payload in invalid:
            with self.subTest(payload=payload):
                with self.assertRaisesRegex(
                    RuntimeError,
                    'single_message_not_confirmed',
                ):
                    validate_single_response(payload)

    def test_rejects_technical_public_text(self):
        for text in [
            'Snapshot Emusys completo',
            'Fontes: get_kpis_comercial_canonicos_v2',
            'GET /aulas',
            'fonte canônica',
            'America/Sao_Paulo',
        ]:
            with self.subTest(text=text):
                with self.assertRaisesRegex(RuntimeError, 'technical_public_text'):
                    validate_public_text(text)

    def test_rejects_empty_or_oversized_text(self):
        with self.assertRaisesRegex(RuntimeError, 'report_text_empty'):
            validate_public_text('')
        with self.assertRaisesRegex(RuntimeError, 'report_too_long'):
            validate_public_text('x' * (REPORT_MAX_LENGTH + 1))

    def test_posts_once_to_loopback_route(self):
        response = FakeResponse({
            'success': True,
            'singleMessage': True,
            'messageId': 'MSG-1',
            'messageIds': ['MSG-1'],
        })
        with patch('lareport_whatsapp_single.request.urlopen', return_value=response) as mocked:
            result = send_single_report('120363000@g.us', 'Relatório operacional')

        self.assertEqual(result['message_id'], 'MSG-1')
        self.assertEqual(mocked.call_count, 1)
        sent_request = mocked.call_args.args[0]
        self.assertEqual(sent_request.full_url, 'http://127.0.0.1:3000/send-report')
        self.assertEqual(
            json.loads(sent_request.data.decode('utf-8')),
            {'chatId': '120363000@g.us', 'message': 'Relatório operacional'},
        )


if __name__ == '__main__':
    unittest.main()
