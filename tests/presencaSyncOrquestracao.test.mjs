import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const helperPath = 'supabase/functions/_shared/presenca-sync-run.ts';
const edgePath = 'supabase/functions/sync-presenca-emusys/index.ts';
const gradeEdgePath = 'supabase/functions/sync-grade-futura-emusys/index.ts';

async function carregarHelper() {
  assert.ok(existsSync(helperPath), `helper ausente: ${helperPath}`);
  return import(`../${helperPath}?t=${Date.now()}`);
}

function criarClienteRpc(iniciar) {
  const chamadas = [];
  const cliente = {
    rpc: async (nome, parametros) => {
      chamadas.push({ nome, parametros });
      if (nome === 'presenca_sync_iniciar_v1') {
        return { data: iniciar(parametros), error: null };
      }
      if (nome === 'presenca_sync_heartbeat_v1') {
        return { data: { ok: true, ...parametros.p_contagens }, error: null };
      }
      if (nome === 'presenca_sync_finalizar_v1') {
        return {
          data: {
            ok: true,
            status: parametros.p_status,
            publicavel: parametros.p_status === 'concluida',
          },
          error: null,
        };
      }
      throw new Error(`RPC inesperada: ${nome}`);
    },
  };
  return { chamadas, cliente };
}

const base = {
  unidadeId: '368d47f5-2d88-4475-bc14-ba084a9a348e',
  modo: 'presenca',
  dataAlvo: '2026-08-26',
  requestId: '20000000-0000-4000-8000-000000000001',
  leaseSegundos: 180,
};

test('ordenarDatasSync prioriza hoje, ordena historico desc e remove duplicatas', async () => {
  const { ordenarDatasSync } = await carregarHelper();

  assert.deepEqual(
    ordenarDatasSync(
      ['2026-08-24', '2026-08-26', '2026-08-25', '2026-08-26', '2026-08-23'],
      '2026-08-26',
    ),
    ['2026-08-26', '2026-08-25', '2026-08-24', '2026-08-23'],
  );
});

test('data da lease permanece dentro da janela reconciliada', async () => {
  const { dataAlvoSyncNaJanela } = await carregarHelper();

  assert.equal(dataAlvoSyncNaJanela('2026-08-20', '2026-08-30', '2026-08-27'), '2026-08-27');
  assert.equal(dataAlvoSyncNaJanela('2026-09-01', '2026-09-10', '2026-08-27'), '2026-09-01');
  assert.equal(dataAlvoSyncNaJanela('2026-07-01', '2026-07-10', '2026-08-27'), '2026-07-10');
  assert.throws(
    () => dataAlvoSyncNaJanela('2026-08-30', '2026-08-20', '2026-08-27'),
    /janela de sync invalida/u,
  );
});

test('adquire lease por unidade e data antes de iniciar qualquer acesso a API', async () => {
  const { executarSyncPresencaComLease } = await carregarHelper();
  const eventos = [];
  const { cliente } = criarClienteRpc(() => {
    eventos.push('lease');
    return { adquirida: true, run_id: '30000000-0000-4000-8000-000000000001' };
  });

  await executarSyncPresencaComLease({
    ...base,
    cliente,
    trabalho: async () => {
      eventos.push('api');
      return {
        valor: 'ok',
        contagens: { paginas_lidas: 1, aulas_lidas: 2, presencas_lidas: 3 },
        snapshot: { aulas: 2, presencas: 3 },
      };
    },
  });

  assert.deepEqual(eventos, ['lease', 'api']);
});

test('execucao concorrente sem lease termina deduplicada e nao aplica linhas', async () => {
  const { executarSyncPresencaComLease } = await carregarHelper();
  let tentativas = 0;
  let aplicacoes = 0;
  const { cliente } = criarClienteRpc(() => {
    tentativas += 1;
    return tentativas === 1
      ? { adquirida: true, run_id: '30000000-0000-4000-8000-000000000001' }
      : { adquirida: false, motivo: 'lease_ativo' };
  });
  const trabalho = async () => {
    aplicacoes += 1;
    return {
      valor: aplicacoes,
      contagens: { paginas_lidas: 1, aulas_lidas: 1, presencas_lidas: 1 },
      snapshot: { aplicacoes },
    };
  };

  const [primeira, segunda] = await Promise.all([
    executarSyncPresencaComLease({
      ...base,
      cliente,
      trabalho,
    }),
    executarSyncPresencaComLease({
      ...base,
      requestId: '20000000-0000-4000-8000-000000000002',
      cliente,
      trabalho,
    }),
  ]);

  assert.equal(primeira.status, 'concluida');
  assert.deepEqual(segunda, { status: 'deduplicada', motivo: 'lease_ativo' });
  assert.equal(aplicacoes, 1);
});

test('heartbeat e finalizacao acontecem somente depois da reconciliacao com o mesmo run', async () => {
  const { executarSyncPresencaComLease } = await carregarHelper();
  const eventos = [];
  const { cliente, chamadas } = criarClienteRpc(() => ({
    adquirida: true,
    run_id: '30000000-0000-4000-8000-000000000001',
  }));
  const rpcOriginal = cliente.rpc;
  cliente.rpc = async (nome, parametros) => {
    if (nome === 'presenca_sync_heartbeat_v1') eventos.push('heartbeat');
    if (nome === 'presenca_sync_finalizar_v1') eventos.push('finalizar');
    return rpcOriginal(nome, parametros);
  };

  const resultado = await executarSyncPresencaComLease({
    ...base,
    cliente,
    trabalho: async ({ heartbeat, syncRunId }) => {
      assert.equal(syncRunId, '30000000-0000-4000-8000-000000000001');
      eventos.push('pagina-1');
      await heartbeat({ paginas_lidas: 1, aulas_lidas: 2, presencas_lidas: 4 });
      eventos.push('pagina-2');
      await heartbeat({ paginas_lidas: 2, aulas_lidas: 5, presencas_lidas: 9 });
      eventos.push('upserts');
      eventos.push('roster');
      eventos.push('reconciliacao-v2');
      return {
        valor: { aplicado: true },
        contagens: { paginas_lidas: 2, aulas_lidas: 5, presencas_lidas: 9 },
        snapshot: { paginas: 2, aulas: 5, presencas: 9 },
      };
    },
  });

  assert.deepEqual(eventos, [
    'pagina-1',
    'heartbeat',
    'pagina-2',
    'heartbeat',
    'upserts',
    'roster',
    'reconciliacao-v2',
    'heartbeat',
    'finalizar',
  ]);
  assert.equal(resultado.status, 'concluida');
  assert.equal(resultado.publicavel, true);
  const finalizacao = chamadas.find(({ nome }) =>
    nome === 'presenca_sync_finalizar_v1'
  );
  assert.equal(finalizacao.parametros.p_status, 'concluida');
  assert.match(finalizacao.parametros.p_snapshot_hash, /^[a-f0-9]{64}$/u);
  assert.deepEqual(finalizacao.parametros.p_contagens, {
    paginas_lidas: 2,
    aulas_lidas: 5,
    presencas_lidas: 9,
  });
  assert.equal(finalizacao.parametros.p_erro_codigo, null);
  assert.equal(
    chamadas.filter(({ nome }) => nome === 'presenca_sync_heartbeat_v1').length,
    3,
  );
});

test('run substituida rejeita a conclusao e nunca retorna publicavel true', async () => {
  const { executarSyncPresencaComLease } = await carregarHelper();
  const respostasFinalizacao = [];
  const { cliente } = criarClienteRpc(() => ({
    adquirida: true,
    run_id: '30000000-0000-4000-8000-000000000001',
  }));
  const rpcOriginal = cliente.rpc;
  cliente.rpc = async (nome, parametros) => {
    if (nome === 'presenca_sync_finalizar_v1') {
      const data = parametros.p_status === 'concluida'
        ? {
            ok: false,
            motivo: 'run_substituida',
            status: 'iniciada',
            publicavel: false,
          }
        : { ok: true, status: 'falhou', publicavel: false };
      respostasFinalizacao.push(data);
      return { data, error: null };
    }
    return rpcOriginal(nome, parametros);
  };

  await assert.rejects(
    executarSyncPresencaComLease({
      ...base,
      cliente,
      trabalho: async ({ syncRunId }) => ({
        valor: { syncRunId },
        contagens: { paginas_lidas: 1, aulas_lidas: 1, presencas_lidas: 0 },
        snapshot: { aulas: 1 },
      }),
    }),
    /PRESENCA_SYNC_FINALIZACAO_REJEITADA/u,
  );
  assert.equal(
    respostasFinalizacao.some(({ publicavel }) => publicavel === true),
    false,
  );
});

test('falha finaliza com codigo redigido sem token, payload ou PII', async () => {
  const { executarSyncPresencaComLease } = await carregarHelper();
  const { cliente, chamadas } = criarClienteRpc(() => ({
    adquirida: true,
    run_id: '30000000-0000-4000-8000-000000000001',
  }));
  const segredo = 'token-super-secreto';
  const pii = 'Aluno Teste +55 21 99999-0000';

  await assert.rejects(
    executarSyncPresencaComLease({
      ...base,
      cliente,
      trabalho: async ({ heartbeat }) => {
        await heartbeat({ paginas_lidas: 1, aulas_lidas: 10, presencas_lidas: 0 });
        throw new Error(`payload=${pii}; token=${segredo}`);
      },
    }),
    /payload=/u,
  );

  const finalizacao = chamadas.find(({ nome }) =>
    nome === 'presenca_sync_finalizar_v1'
  );
  assert.equal(finalizacao.parametros.p_status, 'falhou');
  assert.equal(finalizacao.parametros.p_snapshot_hash, null);
  assert.equal(finalizacao.parametros.p_erro_codigo, 'SYNC_FALHA_INTERNA');
  const serializado = JSON.stringify(finalizacao.parametros);
  assert.doesNotMatch(serializado, /token-super-secreto|Aluno Teste|99999-0000|payload=/u);
});

test('falha upstream do Emusys fica distinguivel sem expor detalhe da origem', async () => {
  const { executarSyncPresencaComLease } = await carregarHelper();
  const { cliente, chamadas } = criarClienteRpc(() => ({
    adquirida: true,
    run_id: '30000000-0000-4000-8000-000000000001',
  }));
  const upstream = new Error('FALHA_UPSTREAM_EMUSYS');
  upstream.name = 'SnapshotUpstreamError';

  await assert.rejects(
    executarSyncPresencaComLease({
      ...base,
      cliente,
      trabalho: async () => {
        throw upstream;
      },
    }),
    /FALHA_UPSTREAM_EMUSYS/u,
  );

  const finalizacao = chamadas.find(({ nome }) =>
    nome === 'presenca_sync_finalizar_v1'
  );
  assert.equal(finalizacao.parametros.p_status, 'falhou');
  assert.equal(finalizacao.parametros.p_erro_codigo, 'EMUSYS_HTTP_FALHOU');
  assert.doesNotMatch(
    JSON.stringify(finalizacao.parametros),
    /FALHA_UPSTREAM_EMUSYS|SnapshotUpstreamError/u,
  );
});

test('falha de sink autoritativo nunca finaliza cobertura como concluida', async () => {
  const { executarSyncPresencaComLease } = await carregarHelper();
  const { cliente, chamadas } = criarClienteRpc(() => ({
    adquirida: true,
    run_id: '30000000-0000-4000-8000-000000000001',
  }));

  await assert.rejects(
    executarSyncPresencaComLease({
      ...base,
      cliente,
      trabalho: async ({ heartbeat }) => {
        await heartbeat({ paginas_lidas: 1, aulas_lidas: 2, presencas_lidas: 3 });
        throw new Error('PRESENCA_SYNC_ROSTER_GRAVACAO_FALHOU');
      },
    }),
    /PRESENCA_SYNC_ROSTER_GRAVACAO_FALHOU/u,
  );

  const finalizacoes = chamadas.filter(({ nome }) =>
    nome === 'presenca_sync_finalizar_v1'
  );
  assert.equal(finalizacoes.length, 1);
  assert.equal(finalizacoes[0].parametros.p_status, 'falhou');
  assert.equal(finalizacoes[0].parametros.p_snapshot_hash, null);
  assert.equal(
    finalizacoes[0].parametros.p_erro_codigo,
    'PRESENCA_SYNC_ROSTER_GRAVACAO_FALHOU',
  );
  assert.equal(
    finalizacoes.some(({ parametros }) => parametros.p_status === 'concluida'),
    false,
  );
});

test('Edge falha fechada nos sinks e valida a reconciliacao antes do hash', () => {
  const edge = readFileSync(edgePath, 'utf8');
  const exigencias = [
    ['aulaError', 'PRESENCA_SYNC_AULA_GRAVACAO_FALHOU'],
    ['rosterError', 'PRESENCA_SYNC_ROSTER_GRAVACAO_FALHOU'],
    ['administrativoError', 'PRESENCA_SYNC_ADMINISTRATIVO_GRAVACAO_FALHOU'],
    ['upsertError', 'PRESENCA_SYNC_RAW_GRAVACAO_FALHOU'],
  ];

  for (const [variavel, codigo] of exigencias) {
    const inicio = edge.indexOf(`if (${variavel})`);
    assert.ok(inicio >= 0, `tratamento ausente para ${variavel}`);
    assert.match(
      edge.slice(inicio, inicio + 320),
      new RegExp(`throw new Error\\(\\s*["']${codigo}["'],?\\s*\\)`),
    );
    if (variavel === 'administrativoError' || variavel === 'upsertError') {
      assert.doesNotMatch(
        edge.slice(inicio, inicio + 320),
        /\$\{nome\}|\.message/u,
      );
    }
  }

  const experimental = edge.indexOf(
    'if (error) {',
    edge.indexOf('async function upsertExperimentalRaw'),
  );
  assert.ok(experimental >= 0, 'tratamento do raw experimental ausente');
  assert.match(
    edge.slice(experimental, experimental + 320),
    /throw new Error\(\s*["']PRESENCA_SYNC_EXPERIMENTAL_RAW_GRAVACAO_FALHOU["'],?\s*\)/u,
  );
  assert.match(edge, /reconciliacaoGrade\.status !== ["']ok["']/u);
  assert.match(
    edge,
    /reconciliacaoGrade\.estados_gravados !== snapshotGrade\.length/u,
  );
  assert.match(edge, /PRESENCA_SYNC_RECONCILIACAO_ROSTER_FALHOU/u);
});

test('Edge nao devolve nem registra a mensagem interna potencialmente sensivel', () => {
  const edge = readFileSync(edgePath, 'utf8');
  const catchExterno = edge.slice(edge.lastIndexOf('} catch (error)'));

  assert.match(edge, /redigirErroCodigo/u);
  assert.match(catchExterno, /redigirErroCodigo\(error\)/u);
  assert.doesNotMatch(
    catchExterno,
    /error instanceof Error\s*\?\s*error\.message/u,
  );
});

test('Edge integra ordenacao, lease antes da API e heartbeat por pagina sem trocar autorizacao', () => {
  const edge = readFileSync(edgePath, 'utf8');
  const grade = readFileSync(gradeEdgePath, 'utf8');
  const helper = readFileSync(helperPath, 'utf8');
  const handler = edge.slice(edge.indexOf('serve(async'));

  assert.match(edge, /prepararExecucaoSyncPresenca/);
  assert.match(edge, /ordenarDatasSync\(datasProcessar,\s*dataAtualBrt\(\)\)/u);
  assert.match(edge, /executarSyncPresencaComLease\(\{/u);
  assert.match(grade, /executarSyncPresencaComLease\(\{/u);
  assert.match(edge, /trabalho:\s*async\s*\(\{\s*heartbeat,\s*syncRunId\s*\}\)/u);
  assert.match(grade, /trabalho:\s*async\s*\(\{\s*heartbeat,\s*syncRunId\s*\}\)/u);
  assert.match(edge, /syncRunId,\s*\n\s*unidadeId:/u);
  assert.match(grade, /syncRunId,\s*\n\s*unidadeId:/u);
  assert.match(edge, /fetchAulasDia\([^)]*heartbeat/u);
  assert.match(
    edge,
    /buscarPaginaAulasEmusys[\s\S]{0,500}await\s+onPagina\?\./u,
  );
  assert.match(helper, /presenca_sync_iniciar_v1/u);
  assert.match(helper, /presenca_sync_heartbeat_v1/u);
  assert.match(helper, /presenca_sync_finalizar_v1/u);
  assert.match(
    helper,
    /input\.trabalho\(\{\s*heartbeat,\s*syncRunId:\s*runId,?\s*\}\)/u,
  );
  assert.ok(
    handler.indexOf('prepararExecucaoSyncPresenca(')
      < handler.indexOf('executarSyncPresencaComLease({'),
    'autorizacao deve continuar antes do lease e dos sinks',
  );
});

test('prioridade de execucao nao inverte a janela cronologica de metadados', () => {
  const edge = readFileSync(edgePath, 'utf8');

  assert.match(
    edge,
    /const datasCronologicas = \[\.\.\.datasProcessar\]\.sort\(\);[\s\S]{0,180}const dataInicioJanela = datasCronologicas\[0\];[\s\S]{0,120}const dataFimJanela = datasCronologicas\.at\(-1\)!;/u,
  );
  assert.match(
    edge,
    /data_inicio:\s*dataInicioJanela,[\s\S]{0,100}data_fim:\s*dataFimJanela/u,
  );
  assert.match(
    edge,
    /sincronizarMetadadosAulas\(\s*supabase,\s*unidadesProcessar,\s*dataInicioJanela,\s*dataFimJanela,\s*requestIdSync,?\s*\)/u,
  );
});
