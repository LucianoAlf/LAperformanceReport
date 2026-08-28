import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const toggle = readFileSync('src/components/App/Agenda/Chamada/ProfessorPresencaToggle.tsx', 'utf8');
const dia = readFileSync('src/components/App/Agenda/Chamada/ChamadaDia.tsx', 'utf8');

test('professor preserva as três RPCs diretas com request id', () => {
  assert.match(toggle, /app_marcar_presenca_professor_aula[\s\S]*p_request_id:\s*requestId/u);
  assert.match(toggle, /app_registrar_presenca_professor_dia[\s\S]*p_request_id:\s*requestId/u);
  assert.match(toggle, /app_remover_presenca_professor_dia[\s\S]*p_request_id:\s*requestId/u);
  assert.match(dia, /app_registrar_presenca_professor_dia[\s\S]*p_request_id:\s*requestId/u);
  assert.match(dia, /app_remover_presenca_professor_dia[\s\S]*p_request_id:\s*requestId/u);
});

test('professor reconcilia ledger e não usa transporte concorrente', () => {
  for (const source of [toggle, dia]) {
    assert.match(source, /app_status_comando_presenca_v1/u);
    assert.match(source, /requestIdDoPedido/u);
    assert.match(source, /interpretarEEncerrarPedido/u);
    assert.match(source, /reconciliarIntencoesPendentes/u);
    assert.doesNotMatch(source, /presencaComando|presencaEnvioPendente|criarEAplicarComandoPresenca|app_criar_comando_presenca_v1|app_aplicar_comando_presenca_v1/u);
  }
});

test('controles de professor recebem envelope canônico e falham fechados', () => {
  assert.match(toggle, /adaptarPresencaProfessorCanonica/u);
  assert.match(toggle, /presenca\.dados_status\s*!==\s*'atualizados'/u);
  assert.match(toggle, /Em auditoria/u);
  assert.match(toggle, /Dados desatualizados/u);
  assert.match(dia, /adaptarPresencaProfessorCanonica/u);
  assert.match(dia, /presenca\.dados_status\s*!==\s*'atualizados'/u);
});

