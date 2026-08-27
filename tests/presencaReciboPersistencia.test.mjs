import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chaveDoPedido,
  encerrarPedido,
  interpretarEEncerrarPedido,
  requestIdDoPedido,
} from '../src/lib/presencaRecibo.ts';

class SessionStorageMemoria {
  valores = new Map();

  getItem(chave) {
    return this.valores.get(chave) ?? null;
  }

  setItem(chave, valor) {
    this.valores.set(chave, valor);
  }

  removeItem(chave) {
    this.valores.delete(chave);
  }
}

const recibo = (requestId, status = 'concluido') => ({
  request_id: requestId,
  status,
  aplicados: status === 'falhou' || status === 'nao_recebido' ? 0 : 1,
  rejeitados: status === 'falhou' ? 1 : 0,
  erros: status === 'falhou' ? [{ codigo: 'status_invalido' }] : [],
});

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

test('reload recupera o mesmo request id da sessão', () => {
  const storage = new SessionStorageMemoria();
  const chave = chaveDoPedido('user-a', 'chamada', [{ aluno_id: 1, status: 'presente' }]);
  const primeiro = requestIdDoPedido(chave, storage);
  const depoisDoReload = requestIdDoPedido(chave, storage, new Map());
  assert.equal(depoisDoReload, primeiro);
  encerrarPedido(chave, storage);
});

test('usuários distintos nunca compartilham intenção', () => {
  const storage = new SessionStorageMemoria();
  const payload = [{ aluno_id: 1, status: 'presente' }];
  const a = chaveDoPedido('user-a', 'chamada', payload);
  const b = chaveDoPedido('user-b', 'chamada', payload);
  assert.notEqual(a, b);
  assert.notEqual(requestIdDoPedido(a, storage), requestIdDoPedido(b, storage));
  encerrarPedido(a, storage);
  encerrarPedido(b, storage);
});

test('duas intenções ambíguas coexistem na mesma sessão', () => {
  const storage = new SessionStorageMemoria();
  const a = chaveDoPedido('user-a', 'chamada', [{ aluno_id: 1, status: 'presente' }]);
  const b = chaveDoPedido('user-a', 'chamada', [{ aluno_id: 2, status: 'falta' }]);
  const requestA = requestIdDoPedido(a, storage);
  const requestB = requestIdDoPedido(b, storage);
  assert.equal(requestIdDoPedido(a, storage, new Map()), requestA);
  assert.equal(requestIdDoPedido(b, storage, new Map()), requestB);
  encerrarPedido(a, storage);
  encerrarPedido(b, storage);
});

test('conteúdo inválido no storage é ignorado sem derrubar a chamada', () => {
  const storage = new SessionStorageMemoria();
  const chave = chaveDoPedido('user-a', 'chamada', [{ aluno_id: 3, status: 'falta' }]);
  storage.setItem(`la-report:presenca:pedidos:v2:${chave}`, '{invalido');
  assert.match(requestIdDoPedido(chave, storage), UUID_V4);
  encerrarPedido(chave, storage);
});

test('request id não-UUID no storage é descartado e substituído sem ficar preso', () => {
  const storage = new SessionStorageMemoria();
  const chave = chaveDoPedido('user-a', 'chamada', [{ aluno_id: 30, status: 'falta' }]);
  storage.setItem(
    `la-report:presenca:pedidos:v2:${chave}`,
    JSON.stringify({ requestId: 'request-id-invalido' }),
  );

  const requestId = requestIdDoPedido(chave, storage, new Map());
  assert.match(requestId, UUID_V4);
  assert.notEqual(requestId, 'request-id-invalido');
  assert.equal(requestIdDoPedido(chave, storage, new Map()), requestId);
  encerrarPedido(chave, storage);
});

test('resposta 200 malformada preserva request id', () => {
  const storage = new SessionStorageMemoria();
  const chave = chaveDoPedido('user-a', 'chamada', [{ aluno_id: 4, status: 'presente' }]);
  const requestId = requestIdDoPedido(chave, storage);
  assert.throws(
    () => interpretarEEncerrarPedido(chave, requestId, { aplicados: 1 }, storage),
    /recibo sem status/,
  );
  assert.equal(requestIdDoPedido(chave, storage, new Map()), requestId);
  encerrarPedido(chave, storage);
});

test('recibo resolvido limpa apenas a própria intenção', () => {
  const storage = new SessionStorageMemoria();
  const a = chaveDoPedido('user-a', 'chamada', [{ aluno_id: 5, status: 'presente' }]);
  const b = chaveDoPedido('user-a', 'chamada', [{ aluno_id: 6, status: 'presente' }]);
  const requestA = requestIdDoPedido(a, storage);
  const requestB = requestIdDoPedido(b, storage);
  interpretarEEncerrarPedido(a, requestA, recibo(requestA), storage);
  assert.notEqual(requestIdDoPedido(a, storage, new Map()), requestA);
  assert.equal(requestIdDoPedido(b, storage, new Map()), requestB);
  encerrarPedido(a, storage);
  encerrarPedido(b, storage);
});

test('status desconhecido e request id divergente preservam a intenção', () => {
  const storage = new SessionStorageMemoria();
  const chave = chaveDoPedido('user-a', 'professor_aula', { aula_id: 10, presente: true });
  const requestId = requestIdDoPedido(chave, storage);
  assert.throws(
    () => interpretarEEncerrarPedido(chave, requestId, recibo(requestId, 'status_futuro'), storage),
    /status desconhecido/,
  );
  assert.throws(
    () => interpretarEEncerrarPedido(chave, requestId, recibo('00000000-0000-4000-8000-000000000099'), storage),
    /request_id divergente/,
  );
  assert.equal(requestIdDoPedido(chave, storage, new Map()), requestId);
  encerrarPedido(chave, storage);
});

test('recibo terminal sem request id exato lança erro e preserva a intenção', () => {
  const casos = [
    { nome: 'ausente', requestId: undefined },
    { nome: 'vazio', requestId: '' },
    { nome: 'divergente', requestId: '00000000-0000-4000-8000-000000000099' },
  ];

  for (const caso of casos) {
    const storage = new SessionStorageMemoria();
    const memoria = new Map();
    const chave = chaveDoPedido('user-a', `terminal_${caso.nome}`, { aula_id: 11 });
    const requestIdEsperado = requestIdDoPedido(chave, storage, memoria);

    assert.throws(
      () => interpretarEEncerrarPedido(
        chave,
        requestIdEsperado,
        recibo(caso.requestId, 'concluido'),
        storage,
        memoria,
      ),
      /request_id divergente/,
    );
    assert.equal(requestIdDoPedido(chave, storage, memoria), requestIdEsperado);
    encerrarPedido(chave, storage, memoria);
  }
});

test('recibo resolvido encerra também a memória injetada', () => {
  const storage = new SessionStorageMemoria();
  const memoria = new Map();
  const chave = chaveDoPedido('user-a', 'memoria_injetada', { aula_id: 12 });
  const primeiro = requestIdDoPedido(chave, storage, memoria);

  interpretarEEncerrarPedido(chave, primeiro, recibo(primeiro), storage, memoria);

  const proximo = requestIdDoPedido(chave, storage, memoria);
  assert.match(proximo, UUID_V4);
  assert.notEqual(proximo, primeiro);
  encerrarPedido(chave, storage, memoria);
});

test('recebido e processando mantêm a intenção pendente', () => {
  for (const status of ['recebido', 'processando']) {
    const storage = new SessionStorageMemoria();
    const chave = chaveDoPedido('user-a', status, [{ aluno_id: 7, status: 'presente' }]);
    const requestId = requestIdDoPedido(chave, storage);
    const resultado = interpretarEEncerrarPedido(chave, requestId, recibo(requestId, status), storage);
    assert.equal(resultado.status, status);
    assert.equal(requestIdDoPedido(chave, storage, new Map()), requestId);
    encerrarPedido(chave, storage);
  }
});

test('nao_recebido encerra a intenção para permitir novo envio', () => {
  const storage = new SessionStorageMemoria();
  const chave = chaveDoPedido('user-a', 'chamada', [{ aluno_id: 8, status: 'falta' }]);
  const requestId = requestIdDoPedido(chave, storage);
  interpretarEEncerrarPedido(chave, requestId, recibo(requestId, 'nao_recebido'), storage);
  assert.notEqual(requestIdDoPedido(chave, storage, new Map()), requestId);
  encerrarPedido(chave, storage);
});

test('timeout após envio conserva o ID para retry após reload', () => {
  const storage = new SessionStorageMemoria();
  const chave = chaveDoPedido('user-a', 'chamada', [{ aluno_id: 9, status: 'presente' }]);
  const requestIdEnviado = requestIdDoPedido(chave, storage);
  // O transporte perde a resposta: nenhum parser/encerramento é chamado.
  const requestIdDoRetry = requestIdDoPedido(chave, storage, new Map());
  assert.equal(requestIdDoRetry, requestIdEnviado);
  encerrarPedido(chave, storage);
});
