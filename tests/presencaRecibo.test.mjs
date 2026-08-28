import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  adquirirTravaPresenca,
  chaveDoPedido,
  chaveTravaChamadaAlunos,
  chaveTravaProfessorDia,
  descreverErro,
  descreverErrosDoRecibo,
  encerrarIntencaoAlunosPendente,
  encerrarIntencaoProfessorPendente,
  encerrarPedido,
  falhaEhRespostaInvalida,
  interpretarRecibo,
  listarIntencoesAlunosPendentes,
  listarIntencoesProfessorPendentes,
  mensagemDeErro,
  novoRequestId,
  reciboAplicouAlteracao,
  reconciliarIntencoesPendentes,
  reservarIntencaoAlunosPendente,
  reservarIntencaoProfessorPendente,
  requestIdDoPedido,
} from '../src/lib/presencaRecibo.ts';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const arquivo = (p) => readFileSync(join(RAIZ, p), 'utf8');

function docker(args, input) {
  return spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
}

function psql(container, sql) {
  return docker([
    'exec', '-i', container,
    'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-qAt',
    '-U', 'postgres', '-d', 'postgres',
  ], sql);
}

async function aguardarPostgres(container) {
  for (let tentativa = 0; tentativa < 60; tentativa += 1) {
    if (psql(container, 'select 1;').status === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      if (psql(container, 'select 1;').status === 0) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail('PostgreSQL de teste não iniciou a tempo');
}

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

test('matriz SQL aceita somente recibos diretos possíveis', () => {
  const request_id = '7bbab83c-91ef-4cb9-a30c-72972228ef16';
  const erro = { codigo: 'STATUS_INVALIDO', aluno_id: 0, professor_id: 2 };
  const validos = [
    { status: 'nao_recebido', aplicados: 0, rejeitados: 0, erros: [] },
    { status: 'recebido', aplicados: 0, rejeitados: 0, erros: [] },
    { status: 'processando', aplicados: 0, rejeitados: 0, erros: [] },
    { status: 'concluido', aplicados: 0, rejeitados: 0, erros: [] },
    { status: 'concluido', aplicados: 3, rejeitados: 0, erros: [] },
    { status: 'parcial', aplicados: 2, rejeitados: 1, erros: [erro] },
    { status: 'falhou', aplicados: 0, rejeitados: 1, erros: [erro] },
  ];

  for (const esperado of validos) {
    const resultado = interpretarRecibo({ request_id, ...esperado });
    assert.equal(resultado.status, esperado.status);
    assert.equal(resultado.aplicados, esperado.aplicados);
    assert.equal(resultado.rejeitados, esperado.rejeitados);
    assert.equal(resultado.erros.length, esperado.erros.length);
  }
});

test('invariantes SQL impossíveis são recusadas', () => {
  const request_id = '7bbab83c-91ef-4cb9-a30c-72972228ef16';
  const erro = { codigo: 'STATUS_INVALIDO' };
  const impossiveis = [
    { status: 'nao_recebido', aplicados: 1, rejeitados: 0, erros: [] },
    { status: 'recebido', aplicados: 0, rejeitados: 1, erros: [erro] },
    { status: 'processando', aplicados: 0, rejeitados: 0, erros: [erro] },
    { status: 'concluido', aplicados: 1, rejeitados: 1, erros: [erro] },
    { status: 'concluido', aplicados: 1, rejeitados: 0, erros: [erro] },
    { status: 'parcial', aplicados: 0, rejeitados: 1, erros: [erro] },
    { status: 'parcial', aplicados: 1, rejeitados: 0, erros: [] },
    { status: 'parcial', aplicados: 1, rejeitados: 2, erros: [erro] },
    { status: 'falhou', aplicados: 1, rejeitados: 1, erros: [erro] },
    { status: 'falhou', aplicados: 0, rejeitados: 0, erros: [] },
    { status: 'falhou', aplicados: 0, rejeitados: 2, erros: [erro] },
  ];

  for (const recibo of impossiveis) {
    assert.throws(
      () => interpretarRecibo({ request_id, ...recibo }),
      /invariantes inválidas/,
      JSON.stringify(recibo),
    );
  }
});

test('objetos de erro malformados são recusados', () => {
  const request_id = '7bbab83c-91ef-4cb9-a30c-72972228ef16';
  const errosInvalidos = [
    null,
    [],
    'STATUS_INVALIDO',
    { codigo: '' },
    { codigo: '   ' },
    { codigo: 123 },
    { codigo: 'STATUS_INVALIDO', aluno_id: -1 },
    { codigo: 'STATUS_INVALIDO', aluno_id: 1.5 },
    { codigo: 'STATUS_INVALIDO', professor_id: -1 },
    { codigo: 'STATUS_INVALIDO', professor_id: 2.5 },
  ];

  for (const erro of errosInvalidos) {
    assert.throws(
      () => interpretarRecibo({
        request_id,
        status: 'falhou',
        aplicados: 0,
        rejeitados: 1,
        erros: [erro],
      }),
      /erros inválidos/,
      JSON.stringify(erro),
    );
  }
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

test('chave canônica não colide quando usuário e escopo contêm dois-pontos', () => {
  const payload = { aula_id: 1 };
  const a = chaveDoPedido('a:b', 'c', payload);
  const b = chaveDoPedido('a', 'b:c', payload);
  assert.notEqual(a, b);
});

test('chave canônica independe da ordem das propriedades', () => {
  const a = chaveDoPedido('user-a', 'chamada', {
    aula_id: 1,
    aluno: { id: 2, status: 'presente' },
  });
  const b = chaveDoPedido('user-a', 'chamada', {
    aluno: { status: 'presente', id: 2 },
    aula_id: 1,
  });
  assert.equal(a, b);
});

test('propriedade undefined é omitida canonicamente como no ItemChamada real', () => {
  const comUndefined = chaveDoPedido('user-a', 'chamada', [{
    aula_emusys_id: 1,
    aluno_id: 2,
    status: 'falta_justificada',
    motivo: 'atestado',
    evidencia_path: undefined,
  }]);
  const semPropriedade = chaveDoPedido('user-a', 'chamada', [{
    aula_emusys_id: 1,
    aluno_id: 2,
    status: 'falta_justificada',
    motivo: 'atestado',
  }]);
  assert.equal(comUndefined, semPropriedade);
});

test('payload JSON-safe rejeita valores ambíguos ou não planos', () => {
  const ciclo = { aula_id: 1 };
  ciclo.proprio = ciclo;
  const arrayComSimbolo = [];
  arrayComSimbolo[Symbol('extra')] = 'ignorado pelo JSON';
  const arrayComFuncaoExtra = [];
  arrayComFuncaoExtra.extra = () => {};
  class PayloadDeClasse {
    aula_id = 1;
  }
  const invalidos = [
    undefined,
    [undefined],
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    () => {},
    Symbol('presenca'),
    1n,
    ciclo,
    new Date('2026-08-27T00:00:00Z'),
    new Map([['aula_id', 1]]),
    new PayloadDeClasse(),
    arrayComSimbolo,
    arrayComFuncaoExtra,
  ];

  for (const payload of invalidos) {
    assert.throws(
      () => chaveDoPedido('user-a', 'chamada', payload),
      /Payload de presença não é JSON seguro/,
    );
  }

  const chaveNull = chaveDoPedido('user-a', 'chamada', null);
  assert.equal(typeof chaveNull, 'string');
  assert.throws(
    () => chaveDoPedido('user-a', 'chamada', Number.NaN),
    /Payload de presença não é JSON seguro/,
    'NaN não pode colidir com null',
  );
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

test('recibo só autoriza recarga quando houve aplicação terminal positiva', () => {
  const criar = (status, aplicados, rejeitados, erros = []) => interpretarRecibo({
    status,
    aplicados,
    rejeitados,
    erros,
  });

  assert.equal(reciboAplicouAlteracao(criar('concluido', 0, 0)), false);
  assert.equal(reciboAplicouAlteracao(criar('concluido', 1, 0)), true);
  assert.equal(reciboAplicouAlteracao(criar('parcial', 1, 1, [{ codigo: 'STATUS_INVALIDO' }])), true);
  assert.equal(reciboAplicouAlteracao(criar('falhou', 0, 1, [{ codigo: 'STATUS_INVALIDO' }])), false);
  assert.equal(reciboAplicouAlteracao(criar('recebido', 0, 0)), false);
});

test('trava compartilhada serializa intenções opostas do professor no mesmo dia', () => {
  const chave = chaveTravaProfessorDia('usuario-a', 'unidade-a', '2026-08-27');
  const liberarA = adquirirTravaPresenca(chave);
  assert.equal(typeof liberarA, 'function');
  assert.equal(adquirirTravaPresenca(chave), null, 'segunda intenção não pode disputar as mesmas aulas');

  liberarA();
  const liberarB = adquirirTravaPresenca(chave);
  assert.equal(typeof liberarB, 'function');
  liberarA();
  assert.equal(adquirirTravaPresenca(chave), null, 'liberação atrasada de A não pode soltar a trava B');

  liberarB();
  const liberarC = adquirirTravaPresenca(chave);
  assert.equal(typeof liberarC, 'function');
  liberarC();
});

test('trava em voo da chamada impede dois envios simultâneos do mesmo usuário', () => {
  const chaveA = chaveTravaChamadaAlunos('usuario-a');
  const chaveB = chaveTravaChamadaAlunos('usuario-b');
  const liberarA = adquirirTravaPresenca(chaveA);
  assert.equal(typeof liberarA, 'function');
  assert.equal(adquirirTravaPresenca(chaveA), null);
  const liberarB = adquirirTravaPresenca(chaveB);
  assert.equal(typeof liberarB, 'function', 'usuários distintos não compartilham a trava local');
  liberarA();
  liberarB();
});

function criarStorageEmMemoria() {
  const valores = new Map();
  return {
    getItem: (chave) => valores.get(chave) ?? null,
    setItem: (chave, valor) => valores.set(chave, valor),
    removeItem: (chave) => valores.delete(chave),
  };
}

test('intenção pendente bloqueia a direção oposta e permite retry com o mesmo request id', () => {
  const storage = criarStorageEmMemoria();
  const memoria = new Map();
  const trava = chaveTravaProfessorDia('usuario-a', 'unidade-a', '2026-08-27');
  const presente = chaveDoPedido('usuario-a', 'professor_dia', {
    professorId: 10,
    data: '2026-08-27',
    unidadeId: 'unidade-a',
    ausente: false,
  });
  const ausente = chaveDoPedido('usuario-a', 'professor_dia', {
    professorId: 10,
    data: '2026-08-27',
    unidadeId: 'unidade-a',
    ausente: true,
  });
  const requestPresente = requestIdDoPedido(presente, storage, memoria);

  assert.deepEqual(
    reservarIntencaoProfessorPendente(trava, presente, requestPresente, 'presente', storage),
    { ok: true },
  );
  assert.equal(
    requestIdDoPedido(presente, storage, memoria),
    requestPresente,
    'retry da intenção ambígua precisa reutilizar o request id anterior',
  );

  const requestAusente = requestIdDoPedido(ausente, storage, memoria);
  assert.notEqual(requestAusente, requestPresente);
  assert.deepEqual(
    reservarIntencaoProfessorPendente(trava, ausente, requestAusente, 'ausente', storage),
    { ok: false, direcaoPendente: 'presente' },
    'a ordem oposta não pode entrar enquanto a primeira segue sem recibo terminal',
  );

  encerrarIntencaoProfessorPendente(trava, presente, requestPresente, storage);
  assert.deepEqual(
    reservarIntencaoProfessorPendente(trava, ausente, requestAusente, 'ausente', storage),
    { ok: true },
    'depois do recibo terminal a nova intenção pode prosseguir',
  );
  encerrarIntencaoProfessorPendente(trava, ausente, requestAusente, storage);
  encerrarPedido(presente, storage, memoria, requestPresente);
  encerrarPedido(ausente, storage, memoria, requestAusente);
});

test('lote mantém a direção bloqueada até todos os pedidos pendentes terminarem', () => {
  const storage = criarStorageEmMemoria();
  const trava = chaveTravaProfessorDia('usuario-a', 'unidade-a', '2026-08-27');
  const pedidoA = chaveDoPedido('usuario-a', 'professor_dia', { professorId: 10, ausente: false });
  const pedidoB = chaveDoPedido('usuario-a', 'professor_dia', { professorId: 11, ausente: false });
  const pedidoOposto = chaveDoPedido('usuario-a', 'professor_dia', { professorId: 12, ausente: true });
  const idA = novoRequestId();
  const idB = novoRequestId();
  const idOposto = novoRequestId();

  assert.deepEqual(reservarIntencaoProfessorPendente(trava, pedidoA, idA, 'presente', storage), { ok: true });
  assert.deepEqual(reservarIntencaoProfessorPendente(trava, pedidoB, idB, 'presente', storage), { ok: true });
  encerrarIntencaoProfessorPendente(trava, pedidoA, idA, storage);
  assert.deepEqual(
    reservarIntencaoProfessorPendente(trava, pedidoOposto, idOposto, 'ausente', storage),
    { ok: false, direcaoPendente: 'presente' },
  );

  encerrarIntencaoProfessorPendente(trava, pedidoB, idB, storage);
  assert.deepEqual(
    reservarIntencaoProfessorPendente(trava, pedidoOposto, idOposto, 'ausente', storage),
    { ok: true },
  );
  encerrarIntencaoProfessorPendente(trava, pedidoOposto, idOposto, storage);
});

test('aluno com pedido ambíguo bloqueia status oposto no mesmo alvo e permite retry', () => {
  const storage = criarStorageEmMemoria();
  const memoria = new Map();
  const presenteItens = [{ aula_emusys_id: 101, aluno_id: 202, status: 'presente' }];
  const faltaItens = [{ aula_emusys_id: 101, aluno_id: 202, status: 'falta' }];
  const presente = chaveDoPedido('usuario-a', 'chamada', presenteItens);
  const falta = chaveDoPedido('usuario-a', 'chamada', faltaItens);
  const requestPresente = requestIdDoPedido(presente, storage, memoria);

  assert.deepEqual(
    reservarIntencaoAlunosPendente('usuario-a', presenteItens, presente, requestPresente, storage),
    { ok: true },
  );
  assert.deepEqual(
    reservarIntencaoAlunosPendente('usuario-a', presenteItens, presente, requestPresente, storage),
    { ok: true },
    'retry idempotente do mesmo pedido precisa continuar permitido',
  );

  const requestFalta = requestIdDoPedido(falta, storage, memoria);
  assert.deepEqual(
    reservarIntencaoAlunosPendente('usuario-a', faltaItens, falta, requestFalta, storage),
    { ok: false, alvosEmConflito: 1 },
    'presente e falta não podem disputar o mesmo aluno/aula sem recibo terminal',
  );

  encerrarIntencaoAlunosPendente('usuario-a', presente, requestPresente, storage);
  assert.deepEqual(
    reservarIntencaoAlunosPendente('usuario-a', faltaItens, falta, requestFalta, storage),
    { ok: true },
  );
  encerrarIntencaoAlunosPendente('usuario-a', falta, requestFalta, storage);
  encerrarPedido(presente, storage, memoria, requestPresente);
  encerrarPedido(falta, storage, memoria, requestFalta);
});

test('reserva de alunos bloqueia sobreposição sem travar aluno independente', () => {
  const storage = criarStorageEmMemoria();
  const lote = [
    { aula_emusys_id: 101, aluno_id: 201, status: 'presente' },
    { aula_emusys_id: 101, aluno_id: 202, status: 'presente' },
  ];
  const sobreposto = [{ aula_emusys_id: 101, aluno_id: 202, status: 'falta' }];
  const independente = [{ aula_emusys_id: 101, aluno_id: 203, status: 'falta' }];
  const chaveLote = chaveDoPedido('usuario-a', 'chamada', lote);
  const chaveSobreposta = chaveDoPedido('usuario-a', 'chamada', sobreposto);
  const chaveIndependente = chaveDoPedido('usuario-a', 'chamada', independente);
  const idLote = novoRequestId();
  const idSobreposto = novoRequestId();
  const idIndependente = novoRequestId();

  assert.deepEqual(reservarIntencaoAlunosPendente('usuario-a', lote, chaveLote, idLote, storage), { ok: true });
  assert.deepEqual(
    reservarIntencaoAlunosPendente('usuario-a', sobreposto, chaveSobreposta, idSobreposto, storage),
    { ok: false, alvosEmConflito: 1 },
  );
  assert.deepEqual(
    reservarIntencaoAlunosPendente('usuario-a', independente, chaveIndependente, idIndependente, storage),
    { ok: true },
  );

  encerrarIntencaoAlunosPendente('usuario-a', chaveLote, idLote, storage);
  encerrarIntencaoAlunosPendente('usuario-a', chaveIndependente, idIndependente, storage);
});

test('reload reconcilia recibo aplicado antes de admitir intenção oposta', async () => {
  const storage = criarStorageEmMemoria();
  const memoria = new Map();
  const trava = chaveTravaProfessorDia('usuario-a', 'unidade-a', '2026-08-27');
  const presente = chaveDoPedido('usuario-a', 'professor_aula', { aulaId: 101, novoPresente: true });
  const ausente = chaveDoPedido('usuario-a', 'professor_aula', { aulaId: 101, novoPresente: false });
  const requestPresente = requestIdDoPedido(presente, storage, memoria);
  reservarIntencaoProfessorPendente(trava, presente, requestPresente, 'presente', storage);

  const resumo = await reconciliarIntencoesPendentes(
    listarIntencoesProfessorPendentes(trava, storage),
    async (requestId) => ({
      data: { request_id: requestId, status: 'concluido', aplicados: 1, rejeitados: 0, erros: [] },
      error: null,
    }),
    (intencao) => encerrarIntencaoProfessorPendente(
      trava,
      intencao.chavePedido,
      intencao.requestId,
      storage,
    ),
    storage,
    memoria,
  );

  assert.deepEqual(resumo, {
    terminais: 1,
    pendentes: 0,
    aplicados: 1,
    rejeitados: 0,
    falhas: [],
  });
  const requestAusente = requestIdDoPedido(ausente, storage, memoria);
  assert.deepEqual(
    reservarIntencaoProfessorPendente(trava, ausente, requestAusente, 'ausente', storage),
    { ok: true },
    'recibo terminal consultado precisa liberar a UI sem exigir o botão antigo',
  );
  encerrarIntencaoProfessorPendente(trava, ausente, requestAusente, storage);
  encerrarPedido(ausente, storage, memoria, requestAusente);
});

test('reconciliação mantém bloqueio quando o banco ainda está processando', async () => {
  const storage = criarStorageEmMemoria();
  const memoria = new Map();
  const itensPresentes = [{ aula_emusys_id: 101, aluno_id: 202, status: 'presente' }];
  const itensFalta = [{ aula_emusys_id: 101, aluno_id: 202, status: 'falta' }];
  const presente = chaveDoPedido('usuario-a', 'chamada', itensPresentes);
  const falta = chaveDoPedido('usuario-a', 'chamada', itensFalta);
  const requestPresente = requestIdDoPedido(presente, storage, memoria);
  reservarIntencaoAlunosPendente('usuario-a', itensPresentes, presente, requestPresente, storage);
  let encerramentos = 0;

  const intencoes = listarIntencoesAlunosPendentes('usuario-a', itensFalta, storage);
  assert.equal(intencoes.length, 1, 'o pedido em lote deve aparecer uma vez por request id');
  const resumo = await reconciliarIntencoesPendentes(
    intencoes,
    async (requestId) => ({
      data: { request_id: requestId, status: 'processando', aplicados: 0, rejeitados: 0, erros: [] },
      error: null,
    }),
    () => { encerramentos++; },
    storage,
    memoria,
  );
  assert.deepEqual(resumo, {
    terminais: 0,
    pendentes: 1,
    aplicados: 0,
    rejeitados: 0,
    falhas: [],
  });
  assert.equal(encerramentos, 0);

  const requestFalta = requestIdDoPedido(falta, storage, memoria);
  assert.deepEqual(
    reservarIntencaoAlunosPendente('usuario-a', itensFalta, falta, requestFalta, storage),
    { ok: false, alvosEmConflito: 1 },
  );
});

test('reconciliação preserva aplicação anterior quando uma consulta posterior falha', async () => {
  const storage = criarStorageEmMemoria();
  const memoria = new Map();
  const trava = chaveTravaProfessorDia('usuario-a', 'unidade-a', '2026-08-27');
  const primeira = chaveDoPedido('usuario-a', 'professor_aula', { aulaId: 101, novoPresente: true });
  const segunda = chaveDoPedido('usuario-a', 'professor_aula', { aulaId: 102, novoPresente: true });
  const requestPrimeira = requestIdDoPedido(primeira, storage, memoria);
  const requestSegunda = requestIdDoPedido(segunda, storage, memoria);
  reservarIntencaoProfessorPendente(trava, primeira, requestPrimeira, 'presente', storage);
  reservarIntencaoProfessorPendente(trava, segunda, requestSegunda, 'presente', storage);

  const resumo = await reconciliarIntencoesPendentes(
    listarIntencoesProfessorPendentes(trava, storage),
    async (requestId) => {
      if (requestId === requestSegunda) throw new Error('status indisponível');
      return {
        data: { request_id: requestId, status: 'concluido', aplicados: 1, rejeitados: 0, erros: [] },
        error: null,
      };
    },
    (intencao) => encerrarIntencaoProfessorPendente(
      trava,
      intencao.chavePedido,
      intencao.requestId,
      storage,
    ),
    storage,
    memoria,
  );

  assert.deepEqual(resumo, {
    terminais: 1,
    pendentes: 0,
    aplicados: 1,
    rejeitados: 0,
    falhas: [{ requestId: requestSegunda, mensagem: 'status indisponível' }],
  });
  assert.deepEqual(
    listarIntencoesProfessorPendentes(trava, storage),
    [{ chavePedido: segunda, requestId: requestSegunda }],
    'a intenção sem resposta precisa continuar pendente, sem apagar a aplicação já confirmada',
  );
});

test('nao_recebido é arbitrado no banco antes de liberar uma intenção oposta', () => {
  const sql = arquivo('supabase/migrations/20260827223000_presenca_request_id_arbitragem.sql');

  assert.match(sql, /create table if not exists public\.presenca_comando_nao_recebidos/iu);
  assert.match(sql, /before insert on public\.presenca_comandos/iu);
  assert.match(sql, /pg_advisory_xact_lock\s*\(\s*hashtextextended/iu);
  assert.match(sql, /insert into public\.presenca_comando_nao_recebidos/iu);
  assert.match(sql, /request_id_encerrado_como_nao_recebido/iu);
  assert.match(sql, /create or replace function public\.app_status_comando_presenca_v1/iu);
  assert.match(sql, /grant execute on function public\.app_status_comando_presenca_v1\(uuid\) to authenticated, service_role/iu);
});

test('arbitragem PostgreSQL serializa escrita em voo e recusa escrita tardia', async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponível para fixture PostgreSQL');
    return;
  }

  const container = `la-presenca-arbitragem-${process.pid}-${Date.now()}`;
  const iniciado = docker([
    'run', '--rm', '--name', container,
    '-e', 'POSTGRES_PASSWORD=postgres',
    '-d', 'postgres:17-alpine',
  ]);
  assert.equal(iniciado.status, 0, iniciado.stderr || iniciado.stdout);

  try {
    await aguardarPostgres(container);
    const fixture = psql(container, String.raw`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema auth;
      create function auth.role() returns text language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'service_role')
      $$;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;

      create table public.presenca_comandos (
        request_id uuid primary key,
        auth_user_id uuid,
        status text not null,
        itens_aplicados integer not null default 0,
        itens_rejeitados integer not null default 0,
        criado_em timestamptz not null default clock_timestamp(),
        concluido_em timestamptz
      );
      create table public.presenca_acao_eventos (
        request_id uuid not null,
        sequencia integer not null,
        tipo text not null,
        aluno_id integer,
        professor_id integer,
        erro_codigo text
      );
      create extension dblink;
    `);
    assert.equal(fixture.status, 0, fixture.stderr || fixture.stdout);

    const migration = psql(
      container,
      arquivo('supabase/migrations/20260827223000_presenca_request_id_arbitragem.sql'),
    );
    assert.equal(migration.status, 0, migration.stderr || migration.stdout);

    const corrida = psql(container, String.raw`
      create temporary table resultado_arbitragem(chave text primary key, valor text not null);

      create function public.teste_fluxo_overload(p_request_id uuid)
      returns text language plpgsql as $funcao$
      begin
        perform public.app_status_comando_presenca_v1(p_request_id);
        perform pg_sleep(0.5);
        perform 1 from public.presenca_comandos where request_id = p_request_id for update;
        return 'ok';
      end
      $funcao$;

      create function public.teste_fluxo_aplicar(p_request_id uuid)
      returns text language plpgsql as $funcao$
      begin
        perform 1 from public.presenca_comandos where request_id = p_request_id for update;
        perform pg_sleep(0.1);
        perform public.app_status_comando_presenca_v1(p_request_id);
        return 'ok';
      end
      $funcao$;

      do $bloco$
      begin
        perform dblink_connect('writer', 'dbname=postgres user=postgres');
        perform dblink_send_query('writer', $remoto$
          with inserido as (
            insert into public.presenca_comandos(
              request_id, auth_user_id, status, itens_aplicados, itens_rejeitados
            ) values (
              '11111111-1111-4111-8111-111111111111', null, 'recebido', 0, 0
            ) returning request_id
          )
          select i.request_id
            from inserido i
            cross join lateral (select pg_sleep(1)) espera
        $remoto$);
      end
      $bloco$;

      select pg_sleep(0.2);
      insert into resultado_arbitragem
      select 'status_escrita_em_voo', public.app_status_comando_presenca_v1(
        '11111111-1111-4111-8111-111111111111'
      )->>'status';

      do $bloco$
      declare v_request_id uuid;
      begin
        select request_id into v_request_id
          from dblink_get_result('writer') as r(request_id uuid);
        perform dblink_disconnect('writer');
      end
      $bloco$;

      insert into resultado_arbitragem
      select 'tombstones_escrita_em_voo', count(*)::text
        from public.presenca_comando_nao_recebidos
       where request_id = '11111111-1111-4111-8111-111111111111';

      begin;
      insert into public.presenca_comandos(
        request_id, auth_user_id, status, itens_aplicados, itens_rejeitados
      ) values (
        '33333333-3333-4333-8333-333333333333', null, 'recebido', 0, 0
      );
      insert into resultado_arbitragem
      select 'status_mesma_transacao', public.app_status_comando_presenca_v1(
        '33333333-3333-4333-8333-333333333333'
      )->>'status';
      commit;

      insert into resultado_arbitragem
      select 'status_ausente', public.app_status_comando_presenca_v1(
        '22222222-2222-4222-8222-222222222222'
      )->>'status';

      do $bloco$
      begin
        begin
          insert into public.presenca_comandos(
            request_id, auth_user_id, status, itens_aplicados, itens_rejeitados
          ) values (
            '22222222-2222-4222-8222-222222222222', null, 'recebido', 0, 0
          );
          raise exception 'escrita_tardia_foi_aceita';
        exception
          when sqlstate '55000' then
            if sqlerrm <> 'request_id_encerrado_como_nao_recebido' then
              raise;
            end if;
        end;
      end
      $bloco$;

      insert into resultado_arbitragem
      select 'comandos_escrita_tardia', count(*)::text
        from public.presenca_comandos
       where request_id = '22222222-2222-4222-8222-222222222222';

      set request.jwt.claim.role = 'authenticated';
      set request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      insert into resultado_arbitragem
      select 'status_usuario_a', public.app_status_comando_presenca_v1(
        '44444444-4444-4444-8444-444444444444'
      )->>'status';
      set request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
      do $bloco$
      begin
        begin
          perform public.app_status_comando_presenca_v1(
            '44444444-4444-4444-8444-444444444444'
          );
          raise exception 'outro_usuario_leu_tombstone';
        exception
          when sqlstate '42501' then
            insert into resultado_arbitragem values ('isolamento_tombstone', '42501');
        end;
      end
      $bloco$;
      set request.jwt.claim.role = 'service_role';
      reset request.jwt.claim.sub;

      insert into public.presenca_comandos(
        request_id, auth_user_id, status, itens_aplicados, itens_rejeitados
      ) values (
        '55555555-5555-4555-8555-555555555555', null, 'recebido', 0, 0
      );
      do $bloco$
      begin
        perform dblink_connect('overload', 'dbname=postgres user=postgres');
        perform dblink_send_query('overload', $remoto$
          select public.teste_fluxo_overload('55555555-5555-4555-8555-555555555555')
        $remoto$);
        perform pg_sleep(0.1);
        perform dblink_connect('aplicar', 'dbname=postgres user=postgres');
        perform dblink_send_query('aplicar', $remoto$
          select public.teste_fluxo_aplicar('55555555-5555-4555-8555-555555555555')
        $remoto$);
      end
      $bloco$;

      insert into resultado_arbitragem
      select 'fluxo_overload', resultado
        from dblink_get_result('overload') as r(resultado text);
      insert into resultado_arbitragem
      select 'fluxo_aplicar', resultado
        from dblink_get_result('aplicar') as r(resultado text);
      select dblink_disconnect('overload');
      select dblink_disconnect('aplicar');

      select jsonb_object_agg(chave, valor order by chave)::text
        from resultado_arbitragem;
    `);
    assert.equal(corrida.status, 0, corrida.stderr || corrida.stdout);
    const linhaJson = corrida.stdout.trim().split(/\r?\n/u).reverse().find((linha) => linha.startsWith('{'));
    assert.ok(linhaJson, corrida.stdout);
    assert.deepEqual(JSON.parse(linhaJson), {
      comandos_escrita_tardia: '0',
      fluxo_aplicar: 'ok',
      fluxo_overload: 'ok',
      isolamento_tombstone: '42501',
      status_ausente: 'nao_recebido',
      status_escrita_em_voo: 'recebido',
      status_mesma_transacao: 'recebido',
      status_usuario_a: 'nao_recebido',
      tombstones_escrita_em_voo: '0',
    });
  } finally {
    docker(['stop', container]);
  }
});

test('falha de contrato é distinta de falha operacional ao encerrar storage', () => {
  assert.equal(falhaEhRespostaInvalida(new Error('Resposta inesperada do banco: status desconhecido')), true);
  assert.equal(falhaEhRespostaInvalida(new Error('removeItem bloqueado')), false);
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

const MENSAGENS_PROTOCOLO = [
  'Pedido concluído sem alteração.',
  'Pedido não recebido; tente novamente.',
  'Pedido recebido; aguardando confirmação.',
  'Não foi possível consultar o resultado; tente novamente.',
  'Resposta inválida; pedido preservado para nova tentativa.',
];

function assertMensagensDoProtocolo(codigo, caminho) {
  for (const mensagem of MENSAGENS_PROTOCOLO) {
    assert.ok(codigo.includes(mensagem), `${caminho} precisa distinguir: ${mensagem}`);
  }
}

test('chamada de alunos identifica usuário e só encerra após interpretar', () => {
  const caminho = 'src/components/App/Agenda/Chamada/useChamadaAcoes.ts';
  const codigo = arquivo(caminho);

  assert.match(codigo, /useAuth\(\)/u);
  assert.match(codigo, /chaveDoPedido\(user\.id,\s*'chamada'/u);
  assert.match(codigo, /const requestId = requestIdDoPedido\(chave\)/u);
  assert.match(codigo, /adquirirTravaPresenca\(chaveTravaChamadaAlunos\(user\.id\)\)/u);
  assert.match(codigo, /liberarTrava\(\)/u);
  assert.match(codigo, /reservarIntencaoAlunosPendente\(user\.id,\s*itens,\s*chave,\s*requestId\)/u);
  assert.match(codigo, /listarIntencoesAlunosPendentes\(user\.id,\s*itens\)/u);
  assert.match(codigo, /app_status_comando_presenca_v1/u);
  assert.match(codigo, /reconciliarIntencoesPendentes\(/u);
  assert.match(codigo, /resumo\.aplicados\s*>\s*0/u);
  const chaveDoNovoPedido = codigo.indexOf("const chave = chaveDoPedido(user.id, 'chamada', itens)");
  const requestDoNovoPedido = codigo.indexOf('const requestId = requestIdDoPedido(chave)', chaveDoNovoPedido);
  const rpcDeEscrita = codigo.indexOf("supabase.rpc('app_registrar_chamada_agenda'", requestDoNovoPedido);
  assert.ok(
    chaveDoNovoPedido >= 0 && requestDoNovoPedido > chaveDoNovoPedido && rpcDeEscrita > requestDoNovoPedido,
    'falha ao persistir o request id precisa ser tratada antes da RPC de escrita',
  );
  assert.match(codigo, /app_registrar_chamada_agenda[\s\S]*?p_request_id:\s*requestId/u);
  assert.match(codigo, /interpretarEEncerrarPedido\(chave,\s*requestId,\s*data\)/u);
  assert.match(codigo, /encerrarIntencaoAlunosPendente\(user\.id,\s*chave,\s*requestId\)/u);
  assert.match(codigo, /reciboAplicouAlteracao\(recibo\)/u);
  assert.match(codigo, /Sessão inválida[\s\S]*Entre novamente para registrar a chamada\./u);
  assert.doesNotMatch(codigo, /\bencerrarPedido\(|\binterpretarRecibo\(/u);
  assertMensagensDoProtocolo(codigo, caminho);
});

test('presença de professor usa recibo durável nos três caminhos diretos', () => {
  const caminho = 'src/components/App/Agenda/Chamada/ProfessorPresencaToggle.tsx';
  const codigo = arquivo(caminho);

  assert.match(codigo, /useAuth\(\)/u);
  assert.match(codigo, /chaveDoPedido\(user\.id,\s*'professor_dia'/u);
  assert.match(codigo, /chaveDoPedido\(user\.id,\s*'professor_aula'/u);
  assert.equal((codigo.match(/const requestId = requestIdDoPedido\(chave\)/gu) ?? []).length, 3);
  assert.equal((codigo.match(/interpretarEEncerrarPedido\(chave,\s*requestId,\s*recibo\)/gu) ?? []).length, 3);
  assert.match(codigo, /adquirirTravaPresenca\(/u);
  assert.match(codigo, /adquirirTravaDoDia\(user\.id\)/u);
  assert.match(codigo, /chaveTravaProfessorDia\(usuarioId,\s*unidadeId,\s*data\)/u);
  assert.equal((codigo.match(/reservarIntencaoProfessorPendente\(/gu) ?? []).length, 3);
  assert.equal(
    (codigo.match(/encerrarIntencaoProfessorPendente\(/gu) ?? []).length,
    4,
    'três escritas diretas e a reconciliação precisam encerrar seus estados terminais',
  );
  assert.match(codigo, /listarIntencoesProfessorPendentes\(/u);
  assert.match(codigo, /app_status_comando_presenca_v1/u);
  assert.match(codigo, /reconciliarIntencoesPendentes\(/u);
  assert.match(codigo, /reciboAplicouAlteracao\(recibo\)/u);
  assert.match(codigo, /catch\s*\(e\)[\s\S]{0,180}mensagemDeErro\(e\)/u);
  assert.ok(codigo.includes("'app_marcar_presenca_professor_aula'"));
  assert.ok(codigo.includes("'app_registrar_presenca_professor_dia'"));
  assert.ok(codigo.includes("'app_remover_presenca_professor_dia'"));
  assert.doesNotMatch(codigo, /app_criar_comando_presenca_v1|app_aplicar_comando_presenca_v1/u);
  assert.doesNotMatch(codigo, /\bencerrarPedido\(|\binterpretarRecibo\(/u);
  assert.match(codigo, /Sessão inválida/u);
  assertMensagensDoProtocolo(codigo, caminho);
});

test('operação em lote isola recibo e estado pendente por professor', () => {
  const caminho = 'src/components/App/Agenda/Chamada/ChamadaDia.tsx';
  const codigo = arquivo(caminho);

  assert.match(codigo, /const\s*\{\s*hasPermission,\s*user\s*\}\s*=\s*useAuth\(\)/u);
  assert.match(codigo, /chaveDoPedido\(user\.id,\s*'professor_dia'/u);
  assert.match(codigo, /const requestId = requestIdDoPedido\(chave\)/u);
  assert.match(codigo, /p_request_id:\s*requestId/u);
  assert.match(codigo, /interpretarEEncerrarPedido\(chave,\s*requestId,\s*recibo\)/u);
  assert.match(codigo, /let pendentes = 0/u);
  assert.match(codigo, /let falhasPreparacao = 0/u);
  assert.match(codigo, /resultado\.status === 'recebido'\s*\|\|\s*resultado\.status === 'processando'[\s\S]*?pendentes\+\+/u);
  assert.match(codigo, /adquirirTravaPresenca\(/u);
  assert.match(codigo, /chaveTravaProfessorDia\(user\.id,\s*unidadeId,\s*data\)/u);
  assert.match(codigo, /reservarIntencaoProfessorPendente\(/u);
  assert.match(codigo, /encerrarIntencaoProfessorPendente\(/u);
  assert.match(codigo, /listarIntencoesProfessorPendentes\(/u);
  assert.match(codigo, /app_status_comando_presenca_v1/u);
  assert.match(codigo, /reconciliarIntencoesPendentes\(/u);
  assert.match(codigo, /reciboAplicouAlteracao\(resultado\)/u);
  assert.match(codigo, /Não foi possível preparar o pedido\./u);
  assert.match(codigo, /disabled=\{processandoProfessores\}/u);
  assert.doesNotMatch(codigo, /\bencerrarPedido\(|\binterpretarRecibo\(/u);
  assert.match(codigo, /Sessão inválida/u);
  assertMensagensDoProtocolo(codigo, caminho);

  const interpretacao = codigo.indexOf('interpretarEEncerrarPedido(chave, requestId, recibo)');
  const primeiroSucessoPosterior = codigo.indexOf('sucessos++', interpretacao);
  assert.ok(interpretacao >= 0 && primeiroSucessoPosterior > interpretacao, 'só pode contar sucesso depois de validar o recibo');
});

test('visão Semana busca dados frescos somente após confirmação aplicada', () => {
  const view = arquivo('src/components/App/Agenda/Chamada/ChamadaView.tsx');
  const semana = arquivo('src/components/App/Agenda/Chamada/ChamadaSemana.tsx');

  assert.match(view, /const \[versaoChamada,\s*setVersaoChamada\] = useState\(0\)/u);
  assert.match(view, /setVersaoChamada\(\(versao\) => versao \+ 1\)/u);
  assert.match(view, /<ChamadaSemana[\s\S]*?refreshToken=\{versaoChamada\}/u);
  assert.match(semana, /refreshToken:\s*number/u);
  assert.match(semana, /useEffect\([\s\S]*?recarregarSemana\(\)/u);
  assert.doesNotMatch(semana, /onRegistrar\(itens\);\s*forcarRecarga\(\)/u);
  assert.doesNotMatch(semana, /contadorRecarga|forcarRecarga/u);
});
