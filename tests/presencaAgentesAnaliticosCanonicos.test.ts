/// <reference lib="deno.ns" />

import { validateSQL } from '../supabase/functions/bi-agent-lamusic/sql-validator.ts';
import { executeTool } from '../supabase/functions/bi-agent-lamusic/tools.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('validador permite somente a view v2 e bloqueia portas analiticas legadas de presenca', () => {
  assert(
    validateSQL('select resultado_canonico from vw_presenca_ocorrencia_canonica_v2').valid,
    'a view canonica v2 deve ser permitida',
  );

  for (const sql of [
    'select * from aluno_presenca',
    'select percentual_presenca from alunos',
    'select alunos.percentual_presenca from alunos',
    'select * from vw_aluno_presenca_semantica_v1',
    'select * from vw_aluno_frequencia_canonica_v1',
    'select * from vw_absenteismo_aluno',
  ]) {
    const resultado = validateSQL(sql);
    assert(!resultado.valid, `consulta legada deveria ser bloqueada: ${sql}`);
  }

  assert(
    validateSQL('select nome from alunos').valid,
    'consulta de aluno sem presenca deve continuar funcionando',
  );
});

Deno.test('tool BI de presenca usa o contexto por papel e preserva periodo universo regra e frescor', async () => {
  const chamadas: Array<{ nome: string; args: Record<string, unknown> }> = [];
  const supabase = {
    rpc(nome: string, args: Record<string, unknown>) {
      chamadas.push({ nome, args });
      return Promise.resolve({
        data: {
          dados_status: 'atualizados',
          sincronizado_em: '2026-08-26T12:00:00Z',
          regra_versao: 'presenca-v2',
          periodo: { inicio: '2026-08-01', fim: '2026-08-26' },
          universo_eventos: 20,
          presentes: 15,
          faltas_confirmadas: 3,
          indeterminados: 1,
          conflitos: 1,
          revisoes_estruturais: 0,
          estado_publicacao: 'publicavel',
        },
        error: null,
      });
    },
  };

  const resposta = JSON.parse(await executeTool(
    supabase,
    'get_presenca_canonica',
    JSON.stringify({
      unidade_nome: 'Recreio',
      data: '2026-08-26',
    }),
    { isAdmin: false, unidadeId: 'unidade-recreio', unidadeNome: 'Recreio' },
  ));

  assert(chamadas.length === 1, 'a tool deve executar uma unica RPC');
  assert(chamadas[0].nome === 'get_presenca_contexto_agente_v1', 'RPC canonica incorreta');
  assert(chamadas[0].args.p_escopo === 'bi', 'escopo BI obrigatorio');
  assert(chamadas[0].args.p_unidade_id === 'unidade-recreio', 'unidade do contexto deve prevalecer');
  assert(chamadas[0].args.p_data === '2026-08-26', 'data deve seguir a assinatura canonica');
  assert(resposta.periodo.inicio === '2026-08-01', 'periodo deve ser preservado');
  assert(resposta.universo_eventos === 20, 'universo deve ser preservado');
  assert(resposta.regra_versao === 'presenca-v2', 'regra deve ser preservada');
  assert(resposta.frescor.dados_status === 'atualizados', 'status de frescor deve ser explicito');
  assert(resposta.frescor.sincronizado_em === '2026-08-26T12:00:00Z', 'instante de sync deve ser explicito');
});

Deno.test('erro da RPC de presenca continua delimitado e nao inventa universo nem frescor', async () => {
  const supabase = {
    rpc() {
      return Promise.resolve({ data: null, error: { message: 'RPC indisponivel' } });
    },
  };

  const resposta = JSON.parse(await executeTool(
    supabase,
    'get_presenca_canonica',
    JSON.stringify({ unidade_nome: 'Barra', data: '2026-08-26' }),
    { isAdmin: false, unidadeId: 'unidade-barra', unidadeNome: 'Barra' },
  ));

  assert(resposta.erro === 'RPC indisponivel', 'erro da RPC deve ser devolvido');
  assert(resposta.universo_eventos === null, 'nao pode inventar denominador');
  assert(resposta.frescor.dados_status === 'indisponivel', 'frescor indisponivel deve ser explicito');
  assert(resposta.regra_versao === null, 'nao pode inventar versao de regra');
});

Deno.test('tool BI mantem desatualizado conflito e roster em revisao sob auditoria', async () => {
  const cenarios = [
    { dados_status: 'dados_desatualizados', estado_publicacao: 'bloqueado', conflitos: 0, revisoes_estruturais: 0 },
    { dados_status: 'atualizados', estado_publicacao: 'publicavel', conflitos: 1, revisoes_estruturais: 0 },
    { dados_status: 'atualizados', estado_publicacao: 'publicavel', conflitos: 0, revisoes_estruturais: 1 },
  ];

  for (const cenario of cenarios) {
    const supabase = {
      rpc() {
        return Promise.resolve({
          data: {
            ...cenario,
            sincronizado_em: '2026-08-26T12:00:00Z',
            regra_versao: 'presenca-v2',
            periodo: { inicio: '2026-08-26', fim: '2026-08-26' },
            universo_eventos: 10,
            presentes: 8,
            faltas_confirmadas: 1,
            indeterminados: 1,
          },
          error: null,
        });
      },
    };

    const resposta = JSON.parse(await executeTool(
      supabase,
      'get_presenca_canonica',
      JSON.stringify({ data: '2026-08-26' }),
      { isAdmin: false, unidadeId: 'unidade-recreio', unidadeNome: 'Recreio' },
    ));

    assert(/Em auditoria/iu.test(resposta.aviso || ''), `cenario inseguro sem bloqueio: ${JSON.stringify(cenario)}`);
    assert(resposta.universo_eventos === 10, 'universo observado deve ser preservado, sem ser publicado como conclusao');
  }
});
