import importlib.util
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "vps/la-hq/sol/scripts/send-aviso-previo-sol.py"
SPEC = importlib.util.spec_from_file_location("send_aviso_previo_sol", SCRIPT)
MOD = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MOD)


def candidato(**overrides):
    base = {
        "movimentacao_id": 1,
        "nome": "Aluno Teste",
        "curso": "Piano",
        "fim": "2026-09-01",
        "estimada": False,
        "status_lareport": "aviso_previo",
        "emusys_aluno_id": 123,
        "emusys_matricula_id": 999,
        "emusys_aviso_previo_id": 456,
    }
    base.update(overrides)
    return base


class VereditoConfiavelTest(unittest.TestCase):
    def test_aluno_ja_finalizado_localmente_e_resolvido_sem_consultar_api(self):
        item = candidato(status_lareport="evadido")
        with patch.object(MOD, "emusys_matriculas") as api:
            self.assertEqual(MOD.veredito(item, "token", date(2026, 9, 5)), "resolvido")
        api.assert_not_called()

    def test_legado_sem_id_do_aviso_nao_vira_cobranca(self):
        item = candidato(emusys_aviso_previo_id=None)
        with patch.object(MOD, "emusys_matriculas") as api:
            self.assertEqual(MOD.veredito(item, "token", date(2026, 9, 5)), "legado_sem_fonte")
        api.assert_not_called()

    def test_falha_da_api_nao_vira_cobranca(self):
        item = candidato()
        with patch.object(MOD, "emusys_matriculas", side_effect=RuntimeError("429")):
            self.assertEqual(MOD.veredito(item, "token", date(2026, 9, 5)), "falha_consulta")

    def test_matricula_ativa_continua_pendente_sem_inferir_cancelamento_por_aulas(self):
        item = candidato()
        matriculas = [{
            "id": 999,
            "status": "ativa",
            "contrato_atual": {"data_original_primeira_aula": "2026-01-01"},
        }]
        with patch.object(MOD, "emusys_matriculas", return_value=matriculas), patch.object(
            MOD, "evidencia_aulas", return_value={
                "agendadas": 15,
                "ultima_agendada": "2027-01-05",
                "ultima_presenca": "2026-09-01",
            },
        ) as aulas:
            self.assertEqual(MOD.veredito(item, "token", date(2026, 9, 5)), "cobrar")
        aulas.assert_not_called()

    def test_segundo_curso_nao_resolve_aviso_da_matricula_alvo(self):
        item = candidato(emusys_matricula_id=999)
        matriculas = [
            {
                "id": 999,
                "status": "ativa",
                "contrato_atual": {"data_original_primeira_aula": "2026-01-01"},
            },
            {
                "id": 1000,
                "status": "ativa",
                "contrato_atual": {"data_original_primeira_aula": "2026-10-01"},
            },
        ]
        with patch.object(MOD, "emusys_matriculas", return_value=matriculas):
            self.assertEqual(MOD.veredito(item, "token", date(2026, 9, 5)), "cobrar")

    def test_rodada_com_falha_fica_sem_mensagem_e_denuncia_erro(self):
        dados = {"unidade": "Barra", "janela": [], "vencidos": [candidato()]}
        with patch.object(MOD, "veredito", return_value="falha_consulta"):
            texto, resumo, vereditos = MOD.montar(dados, "token", date(2026, 9, 5))
        self.assertIsNone(texto)
        self.assertEqual(resumo["falhas_consulta"], 1)
        self.assertEqual(vereditos, [])

    def test_legado_nao_e_mostrado_como_pendencia_operacional(self):
        dados = {"unidade": "Recreio", "janela": [], "vencidos": [candidato()]}
        with patch.object(MOD, "veredito", return_value="legado_sem_fonte"):
            texto, resumo, vereditos = MOD.montar(dados, "token", date(2026, 9, 5))
        self.assertIsNone(texto)
        self.assertEqual(resumo["legados_sem_fonte"], 1)
        self.assertEqual(vereditos, [])


if __name__ == "__main__":
    unittest.main()
