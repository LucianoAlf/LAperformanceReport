import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const hook = readFileSync('src/components/App/Agenda/Chamada/useChamadaAcoes.ts', 'utf8');

test('Agenda usa RPC direta do Hugo com request id durável', () => {
  assert.match(hook, /user\?\.id/u);
  assert.match(hook, /chaveDoPedido\(user\.id/u);
  assert.match(hook, /requestIdDoPedido/u);
  assert.match(hook, /app_registrar_chamada_agenda[\s\S]*p_request_id:\s*requestId/u);
  assert.doesNotMatch(hook, /presencaComando|presencaEnvioPendente|criarEAplicarComandoPresenca|app_criar_comando_presenca_v1|app_aplicar_comando_presenca_v1/u);
});

test('Agenda reconcilia resposta perdida antes de aceitar nova intenção', () => {
  assert.match(hook, /listarIntencoesAlunosPendentes/u);
  assert.match(hook, /reconciliarIntencoesPendentes/u);
  assert.match(hook, /app_status_comando_presenca_v1[\s\S]*p_request_id/u);
  assert.match(hook, /resumo\.aplicados\s*>\s*0[\s\S]*aoConcluir\(\)/u);
  assert.match(hook, /resumo\.pendentes\s*>\s*0/u);
});

test('Agenda valida recibo e só recarrega quando houve aplicação', () => {
  assert.match(hook, /interpretarEEncerrarPedido/u);
  assert.match(hook, /reciboAplicouAlteracao/u);
  assert.match(hook, /recibo\.status === 'nao_recebido'/u);
  assert.match(hook, /recibo\.status === 'recebido' \|\| recibo\.status === 'processando'/u);
  assert.match(hook, /recibo\.status === 'falhou'/u);
  assert.match(hook, /recibo\.status === 'concluido' && !houveAplicacao[\s\S]*return false/u);
  assert.match(hook, /recibo\.status === 'parcial'[\s\S]*aoConcluir\(\);\s*return houveAplicacao/u);
});

test('falha de rede ou resposta inválida preserva o pedido', () => {
  assert.match(hook, /A requisi[^\n]+pode ter chegado ao banco/u);
  assert.match(hook, /pedido permanece na[\s\S]*carteira/u);
  assert.match(hook, /falhaEhRespostaInvalida/u);
  assert.match(hook, /pedido preservado para nova tentativa/u);
});
