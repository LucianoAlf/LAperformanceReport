import assert from 'node:assert/strict';
import test from 'node:test';

import {
  obterSnapshotComAdmissao,
  SnapshotAdmissionError,
} from '../supabase/functions/_shared/snapshot-refresh-admission.ts';

const ADMISSAO_ID = '11111111-1111-4111-8111-111111111111';
const EXECUCAO_ID = '22222222-2222-4222-8222-222222222222';

function admissao(acao, overrides = {}) {
  return {
    admissao_id: ADMISSAO_ID,
    acao,
    snapshot_execucao_id: EXECUCAO_ID,
    ...overrides,
  };
}

function cenario(overrides = {}) {
  let agora = 0;
  const chamadas = {
    admitir: 0,
    atualizar: 0,
    finalizar: [],
    esperar: 0,
  };
  const deps = {
    admitir: async () => {
      chamadas.admitir += 1;
      return admissao('atualizar');
    },
    atualizar: async ({ execucaoId }) => {
      chamadas.atualizar += 1;
      return { execucao_id: execucaoId, status: 'completo' };
    },
    finalizar: async (input) => {
      chamadas.finalizar.push(input);
    },
    esperar: async (ms) => {
      chamadas.esperar += 1;
      agora += ms;
    },
    agoraMs: () => agora,
    ...overrides,
  };
  return { chamadas, deps };
}

test('admissao atualizar executa uma vez e finaliza com a mesma identidade', async () => {
  const { chamadas, deps } = cenario();

  const resultado = await obterSnapshotComAdmissao({ deps });

  assert.deepEqual(resultado, {
    origem: 'atualizado',
    execucaoId: EXECUCAO_ID,
    resposta: { execucao_id: EXECUCAO_ID, status: 'completo' },
  });
  assert.equal(chamadas.atualizar, 1);
  assert.deepEqual(chamadas.finalizar, [
    {
      admissaoId: ADMISSAO_ID,
      execucaoId: EXECUCAO_ID,
      sucesso: true,
      erroCodigo: null,
    },
  ]);
});

test('atualizacao recebe admissao e execucao como identidade indivisivel', async () => {
  let identidadeRecebida = null;
  const { deps } = cenario({
    atualizar: async (identidade) => {
      identidadeRecebida = identidade;
      return { execucao_id: identidade.execucaoId, status: 'completo' };
    },
  });

  await obterSnapshotComAdmissao({ deps });

  assert.deepEqual(identidadeRecebida, {
    admissaoId: ADMISSAO_ID,
    execucaoId: EXECUCAO_ID,
  });
});

test('admissao reutilizar nao chama provedor, escrita nem finalizacao', async () => {
  const { chamadas, deps } = cenario({
    admitir: async () => {
      chamadas.admitir += 1;
      return admissao('reutilizar');
    },
  });

  const resultado = await obterSnapshotComAdmissao({ deps });

  assert.deepEqual(resultado, {
    origem: 'reutilizado',
    execucaoId: EXECUCAO_ID,
  });
  assert.equal(chamadas.atualizar, 0);
  assert.deepEqual(chamadas.finalizar, []);
});

test('duas chamadas sequenciais equivalentes produzem uma atualizacao', async () => {
  let status = 'novo';
  const chamadas = { atualizar: 0, finalizar: 0 };
  const deps = {
    admitir: async () =>
      status === 'novo' ? admissao('atualizar') : admissao('reutilizar'),
    atualizar: async ({ execucaoId }) => {
      chamadas.atualizar += 1;
      return { execucao_id: execucaoId, status: 'completo' };
    },
    finalizar: async () => {
      chamadas.finalizar += 1;
      status = 'completo';
    },
    esperar: async () => {},
    agoraMs: () => 0,
  };

  const primeira = await obterSnapshotComAdmissao({ deps });
  const segunda = await obterSnapshotComAdmissao({ deps });

  assert.equal(primeira.origem, 'atualizado');
  assert.equal(segunda.origem, 'reutilizado');
  assert.equal(chamadas.atualizar, 1);
  assert.equal(chamadas.finalizar, 1);
});

test('duas chamadas concorrentes equivalentes compartilham uma atualizacao', async () => {
  let status = 'novo';
  let liberarAtualizacao;
  const atualizacaoPendente = new Promise((resolve) => {
    liberarAtualizacao = resolve;
  });
  const chamadas = { atualizar: 0, finalizar: 0 };
  const deps = {
    admitir: async () => {
      if (status === 'novo') {
        status = 'processando';
        return admissao('atualizar');
      }
      if (status === 'processando') return admissao('aguardar');
      return admissao('reutilizar');
    },
    atualizar: async ({ execucaoId }) => {
      chamadas.atualizar += 1;
      await atualizacaoPendente;
      return { execucao_id: execucaoId, status: 'completo' };
    },
    finalizar: async () => {
      chamadas.finalizar += 1;
      status = 'completo';
    },
    esperar: async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
    agoraMs: () => Date.now(),
  };

  const primeira = obterSnapshotComAdmissao({ deps, esperaMs: 1 });
  const segunda = obterSnapshotComAdmissao({ deps, esperaMs: 1 });
  liberarAtualizacao();
  const resultados = await Promise.all([primeira, segunda]);

  assert.deepEqual(
    resultados.map((item) => item.origem).sort(),
    ['atualizado', 'reutilizado'],
  );
  assert.equal(chamadas.atualizar, 1);
  assert.equal(chamadas.finalizar, 1);
});

test('falha de admissao ou espera permanente nao chama atualizacao', async () => {
  const negado = cenario({
    admitir: async () => {
      throw new Error('NEGADO');
    },
  });
  await assert.rejects(
    obterSnapshotComAdmissao({ deps: negado.deps }),
    /NEGADO/,
  );
  assert.equal(negado.chamadas.atualizar, 0);

  const aguardando = cenario({
    admitir: async () => admissao('aguardar'),
  });
  await assert.rejects(
    obterSnapshotComAdmissao({
      deps: aguardando.deps,
      esperaMs: 5,
      timeoutMs: 10,
    }),
    (error) =>
      error instanceof SnapshotAdmissionError &&
      error.message === 'SNAPSHOT_EXPERIMENTAIS_EM_ANDAMENTO',
  );
  assert.equal(aguardando.chamadas.atualizar, 0);
});

test('tentativa bloqueada apos falha nao chama provedor nem escrita', async () => {
  const bloqueado = cenario({
    admitir: async () => admissao('bloqueado'),
  });

  await assert.rejects(
    obterSnapshotComAdmissao({ deps: bloqueado.deps }),
    (error) =>
      error instanceof SnapshotAdmissionError &&
      error.message === 'SNAPSHOT_EXPERIMENTAIS_RETRY_BLOQUEADO',
  );
  assert.equal(bloqueado.chamadas.atualizar, 0);
  assert.deepEqual(bloqueado.chamadas.finalizar, []);
});

test('falha na atualizacao registra falha sem repetir a chamada', async () => {
  const { chamadas, deps } = cenario({
    atualizar: async () => {
      chamadas.atualizar += 1;
      throw new Error('UPSTREAM');
    },
  });

  await assert.rejects(
    obterSnapshotComAdmissao({ deps }),
    /UPSTREAM/,
  );
  assert.equal(chamadas.atualizar, 1);
  assert.deepEqual(chamadas.finalizar, [
    {
      admissaoId: ADMISSAO_ID,
      execucaoId: EXECUCAO_ID,
      sucesso: false,
      erroCodigo: 'FALHA_ATUALIZAR_SNAPSHOT',
    },
  ]);
});
