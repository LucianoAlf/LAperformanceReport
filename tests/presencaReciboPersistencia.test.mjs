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

class SessionStorageComFalhas extends SessionStorageMemoria {
  falharSetItem = false;
  falharRemoveItem = false;
  falharRemoveItemDepoisDeApagar = false;

  setItem(chave, valor) {
    if (this.falharSetItem) throw new Error('setItem bloqueado');
    super.setItem(chave, valor);
  }

  removeItem(chave) {
    if (this.falharRemoveItem) throw new Error('removeItem bloqueado');
    super.removeItem(chave);
    if (this.falharRemoveItemDepoisDeApagar) throw new Error('removeItem falhou depois de apagar');
  }
}

const recibo = (requestId, status = 'concluido', alteracoes = {}) => {
  const erro = { codigo: 'status_invalido' };
  const porStatus = {
    nao_recebido: { aplicados: 0, rejeitados: 0, erros: [] },
    recebido: { aplicados: 0, rejeitados: 0, erros: [] },
    processando: { aplicados: 0, rejeitados: 0, erros: [] },
    concluido: { aplicados: 1, rejeitados: 0, erros: [] },
    parcial: { aplicados: 1, rejeitados: 1, erros: [erro] },
    falhou: { aplicados: 0, rejeitados: 1, erros: [erro] },
  };
  return {
    request_id: requestId,
    status,
    ...(porStatus[status] ?? { aplicados: 0, rejeitados: 0, erros: [] }),
    ...alteracoes,
  };
};

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

test('UUID maiúsculo do storage é normalizado, persistido e comparado canonicamente', () => {
  const storage = new SessionStorageMemoria();
  const memoria = new Map();
  const chave = chaveDoPedido('user-a', 'uuid_canonico', { aula_id: 31 });
  const requestIdMaiusculo = 'ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF';
  const requestIdCanonico = requestIdMaiusculo.toLowerCase();
  const chavePersistida = `la-report:presenca:pedidos:v2:${chave}`;
  storage.setItem(chavePersistida, JSON.stringify({ requestId: requestIdMaiusculo }));

  const recuperado = requestIdDoPedido(chave, storage, memoria);
  assert.equal(recuperado, requestIdCanonico);
  assert.equal(JSON.parse(storage.getItem(chavePersistida)).requestId, requestIdCanonico);

  const resultado = interpretarEEncerrarPedido(
    chave,
    requestIdCanonico,
    recibo(requestIdMaiusculo),
    storage,
    memoria,
  );
  assert.equal(resultado.request_id, requestIdCanonico);
  assert.notEqual(requestIdDoPedido(chave, storage, memoria), requestIdCanonico);
  encerrarPedido(chave, storage, memoria);
});

test('memória sem espelho restaura o mesmo request id antes de permitir novo envio', () => {
  const storage = new SessionStorageMemoria();
  const memoria = new Map();
  const chave = chaveDoPedido('user-a', 'reparar_espelho', { aula_id: 311 });
  const requestId = requestIdDoPedido(chave, storage, memoria);
  const chavePersistida = `la-report:presenca:pedidos:v2:${chave}`;

  storage.removeItem(chavePersistida);

  assert.equal(requestIdDoPedido(chave, storage, memoria), requestId);
  assert.equal(JSON.parse(storage.getItem(chavePersistida)).requestId, requestId);
  assert.equal(requestIdDoPedido(chave, storage, new Map()), requestId);
  encerrarPedido(chave, storage, memoria, requestId);
});

test('storage durável vence memória obsoleta para impedir dois ids após reload', () => {
  const storage = new SessionStorageMemoria();
  const memoria = new Map();
  const chave = chaveDoPedido('user-a', 'storage_fonte_verdade', { aula_id: 312 });
  const persistido = requestIdDoPedido(chave, storage, new Map());
  memoria.set(chave, 'abcdefab-cdef-4abc-8def-abcdefabcdef');

  assert.equal(requestIdDoPedido(chave, storage, memoria), persistido);
  assert.equal(memoria.get(chave), persistido);
  encerrarPedido(chave, storage, memoria, persistido);
});

test('falha ao reparar espelho não troca o id já usado em memória', () => {
  const storage = new SessionStorageComFalhas();
  const memoria = new Map();
  const chave = chaveDoPedido('user-a', 'reparar_espelho_falha', { aula_id: 313 });
  const requestId = requestIdDoPedido(chave, storage, memoria);
  storage.removeItem(`la-report:presenca:pedidos:v2:${chave}`);
  storage.falharSetItem = true;

  assert.throws(() => requestIdDoPedido(chave, storage, memoria), /setItem bloqueado/);
  assert.equal(memoria.get(chave), requestId);

  storage.falharSetItem = false;
  assert.equal(requestIdDoPedido(chave, storage, memoria), requestId);
  encerrarPedido(chave, storage, memoria, requestId);
});

test('setItem falhando remove a memória nova e impede devolver request id', () => {
  const storage = new SessionStorageComFalhas();
  const memoria = new Map();
  const chave = chaveDoPedido('user-a', 'storage_set_fail_closed', { aula_id: 32 });
  storage.falharSetItem = true;

  assert.throws(
    () => requestIdDoPedido(chave, storage, memoria),
    /setItem bloqueado/,
  );
  assert.equal(memoria.has(chave), false);
  assert.equal(storage.valores.size, 0);
});

test('sessionStorage bloqueado no browser lança sem cair para memória', () => {
  const descritorAnterior = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const memoria = new Map();
  const chave = chaveDoPedido('user-a', 'storage_browser_bloqueado', { aula_id: 33 });
  const janela = {};
  Object.defineProperty(janela, 'sessionStorage', {
    configurable: true,
    get() {
      throw new Error('sessionStorage bloqueado');
    },
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: janela,
  });

  try {
    assert.throws(
      () => requestIdDoPedido(chave, undefined, memoria),
      /sessionStorage bloqueado/,
    );
    assert.equal(memoria.has(chave), false);
  } finally {
    if (descritorAnterior) {
      Object.defineProperty(globalThis, 'window', descritorAnterior);
    } else {
      delete globalThis.window;
    }
  }
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

test('compare-and-delete preserva B quando uma segunda resposta de A chega atrasada', () => {
  const storage = new SessionStorageMemoria();
  const memoria = new Map();
  const chave = chaveDoPedido('user-a', 'compare_and_delete', { aula_id: 13 });

  const requestA = requestIdDoPedido(chave, storage, memoria);
  interpretarEEncerrarPedido(chave, requestA, recibo(requestA), storage, memoria);

  const requestB = requestIdDoPedido(chave, storage, memoria);
  assert.notEqual(requestB, requestA);

  interpretarEEncerrarPedido(chave, requestA, recibo(requestA), storage, memoria);

  assert.equal(requestIdDoPedido(chave, storage, memoria), requestB);
  encerrarPedido(chave, storage, memoria);
});

test('removeItem falhando preserva o ID e o retry do mesmo recibo consegue limpar', () => {
  const storage = new SessionStorageComFalhas();
  const memoria = new Map();
  const chave = chaveDoPedido('user-a', 'storage_remove_fail_closed', { aula_id: 14 });
  const requestId = requestIdDoPedido(chave, storage, memoria);
  storage.falharRemoveItem = true;

  assert.throws(
    () => interpretarEEncerrarPedido(chave, requestId, recibo(requestId), storage, memoria),
    /removeItem bloqueado/,
  );
  assert.equal(memoria.get(chave), requestId);
  assert.equal(requestIdDoPedido(chave, storage, memoria), requestId);

  storage.falharRemoveItem = false;
  interpretarEEncerrarPedido(chave, requestId, recibo(requestId), storage, memoria);
  const proximo = requestIdDoPedido(chave, storage, memoria);
  assert.notEqual(proximo, requestId);
  encerrarPedido(chave, storage, memoria);
});

test('removeItem que apaga e depois lança confirma o encerramento sem deixar ID só na memória', () => {
  const storage = new SessionStorageComFalhas();
  const memoria = new Map();
  const chave = chaveDoPedido('user-a', 'storage_remove_pos_efeito', { aula_id: 141 });
  const requestId = requestIdDoPedido(chave, storage, memoria);
  storage.falharRemoveItemDepoisDeApagar = true;

  const resultado = interpretarEEncerrarPedido(chave, requestId, recibo(requestId), storage, memoria);

  assert.equal(resultado.status, 'concluido');
  assert.equal(memoria.has(chave), false);
  storage.falharRemoveItemDepoisDeApagar = false;
  const proximoAposReload = requestIdDoPedido(chave, storage, new Map());
  assert.notEqual(proximoAposReload, requestId, 'recibo terminal confirmado permite uma nova intenção após reload');
  encerrarPedido(chave, storage, memoria);
});

test('recibos impossíveis e erros null falham sem encerrar a intenção', () => {
  const casos = [
    (requestId) => recibo(requestId, 'concluido', {
      rejeitados: 1,
      erros: [{ codigo: 'STATUS_INVALIDO' }],
    }),
    (requestId) => recibo(requestId, 'parcial', { erros: [null] }),
  ];

  for (const [indice, criarRecibo] of casos.entries()) {
    const storage = new SessionStorageMemoria();
    const memoria = new Map();
    const chave = chaveDoPedido('user-a', `recibo_impossivel_${indice}`, { aula_id: 15 });
    const requestId = requestIdDoPedido(chave, storage, memoria);

    assert.throws(
      () => interpretarEEncerrarPedido(
        chave,
        requestId,
        criarRecibo(requestId),
        storage,
        memoria,
      ),
      /invariantes inválidas|erros inválidos/,
    );
    assert.equal(requestIdDoPedido(chave, storage, memoria), requestId);
    encerrarPedido(chave, storage, memoria);
  }
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
