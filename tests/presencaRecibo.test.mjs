import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  chaveDoPedido,
  descreverErro,
  descreverErrosDoRecibo,
  encerrarPedido,
  interpretarRecibo,
  mensagemDeErro,
  novoRequestId,
  requestIdDoPedido,
} from '../src/lib/presencaRecibo.ts';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const arquivo = (p) => readFileSync(join(RAIZ, p), 'utf8');

test('recibo parcial: aplica o que deu, e o rejeitado vem com codigo legivel', () => {
  // Formato REAL medido no banco em 27/08 (transacao de teste com rollback).
  const recibo = interpretarRecibo({
    request_id: '7bbab83c-91ef-4cb9-a30c-72972228ef16',
    status: 'parcial',
    aplicados: 1,
    rejeitados: 1,
    erros: [{ codigo: 'ALUNO_FORA_DO_ROSTER', aluno_id: 999999 }],
  });

  assert.equal(recibo.status, 'parcial');
  assert.equal(recibo.aplicados, 1);
  assert.equal(recibo.rejeitados, 1);
  // O banco devolve MAIUSCULO; o mapa de mensagens e minusculo. Sem a
  // normalizacao a tela mostrava o codigo cru — ou `undefined`.
  assert.equal(descreverErrosDoRecibo(recibo, { comAluno: true }), 'aluno 999999: aluno fora do roster da aula');
});

test('descreverErro aceita as duas grafias e nunca devolve undefined', () => {
  assert.equal(descreverErro('ALUNO_FORA_DO_ROSTER'), 'aluno fora do roster da aula');
  assert.equal(descreverErro('aluno_fora_do_roster'), 'aluno fora do roster da aula');
  assert.equal(descreverErro('CODIGO_QUE_NAO_MAPEAMOS'), 'codigo que nao mapeamos');
});

test('resposta sem status e recusada — nao pode passar por sucesso', () => {
  // Formato da porta ANTIGA. Se um dia voltar por engano, o front precisa
  // gritar em vez de somar `undefined` e concluir que gravou zero.
  assert.throws(
    () => interpretarRecibo({ inseridos: 3, atualizados: 0, retificados: 0, erros: [] }),
    /recibo sem status/,
  );
});

test('status desconhecido e recusado sem promover resposta futura a sucesso', () => {
  assert.throws(
    () => interpretarRecibo({
      status: 'status_futuro',
      aplicados: 1,
      rejeitados: 0,
      erros: [],
    }),
    /status desconhecido/,
  );
});

test('contadores invalidos sao recusados em vez de sofrer coercao', () => {
  assert.throws(
    () => interpretarRecibo({
      status: 'concluido',
      aplicados: -1,
      rejeitados: 0,
      erros: [],
    }),
    /contadores inválidos/,
  );
  assert.throws(
    () => interpretarRecibo({
      status: 'concluido',
      aplicados: 1,
      rejeitados: 0.5,
      erros: [],
    }),
    /contadores inválidos/,
  );
});

test('erros fora de array sao recusados em vez de descartados', () => {
  assert.throws(
    () => interpretarRecibo({
      status: 'concluido',
      aplicados: 1,
      rejeitados: 0,
      erros: { codigo: 'status_invalido' },
    }),
    /erros inválidos/,
  );
});

test('mesma intencao reusa o request_id ate o banco responder', () => {
  const chave = chaveDoPedido('usuario-teste', 'chamada', [
    { aula_emusys_id: 1, aluno_id: 2, status: 'presente' },
  ]);
  const primeiro = requestIdDoPedido(chave);
  const retry = requestIdDoPedido(chave);
  assert.equal(retry, primeiro, 'o retry precisa levar o MESMO id, senao a idempotencia nao protege');

  encerrarPedido(chave);
  assert.notEqual(requestIdDoPedido(chave), primeiro, 'depois da resposta, novo clique e nova intencao');
  encerrarPedido(chave);
});

test('payload diferente = pedido diferente (o banco recusa id reutilizado)', () => {
  const a = chaveDoPedido('usuario-teste', 'chamada', [{ aluno_id: 1, status: 'presente' }]);
  const b = chaveDoPedido('usuario-teste', 'chamada', [{ aluno_id: 1, status: 'falta' }]);
  assert.notEqual(a, b);
  assert.notEqual(requestIdDoPedido(a), requestIdDoPedido(b));
  encerrarPedido(a);
  encerrarPedido(b);
});

test('novoRequestId gera uuid v4 valido', () => {
  assert.match(novoRequestId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('erro do supabase-js vira texto legivel, nao [object Object]', () => {
  // PostgrestError NAO e instancia de Error: `String(e)` dava "[object Object]"
  // e foi o que escondeu o `permission denied` do incidente de 27/08.
  const erroDoSupabase = { message: 'permission denied for function app_registrar_chamada_agenda', code: '42501' };
  assert.equal(mensagemDeErro(erroDoSupabase), 'permission denied for function app_registrar_chamada_agenda');
  assert.notEqual(mensagemDeErro(erroDoSupabase), '[object Object]');
});

test('as quatro portas de escrita de presenca mandam p_request_id', () => {
  const fontes = {
    'src/components/App/Agenda/Chamada/useChamadaAcoes.ts': ['app_registrar_chamada_agenda'],
    'src/components/App/Agenda/Chamada/ProfessorPresencaToggle.tsx': [
      'app_marcar_presenca_professor_aula',
      'app_registrar_presenca_professor_dia',
      'app_remover_presenca_professor_dia',
    ],
    'src/components/App/Agenda/Chamada/ChamadaDia.tsx': [
      'app_registrar_presenca_professor_dia',
      'app_remover_presenca_professor_dia',
    ],
  };

  for (const [caminho, rpcs] of Object.entries(fontes)) {
    const codigo = arquivo(caminho);
    for (const rpc of rpcs) {
      const chamada = codigo.slice(codigo.indexOf(`'${rpc}'`));
      assert.ok(codigo.includes(`'${rpc}'`), `${caminho} deveria chamar ${rpc}`);
      assert.ok(
        chamada.slice(0, 600).includes('p_request_id'),
        `${caminho}: a chamada de ${rpc} precisa levar p_request_id — sem ele o PostgREST resolve para a porta sem recibo`,
      );
    }
  }
});
