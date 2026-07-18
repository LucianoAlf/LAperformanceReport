import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const migrationPath =
  'supabase/migrations/20260716162325_health_score_v3_periodos_professor.sql';
const isolationMigrationPath =
  'supabase/migrations/20260716162504_health_score_v3_periodos_isolamento_roles.sql';
const fallbackKeyMigrationPath =
  'supabase/migrations/20260716165705_health_score_v3_periodos_chave_fallback.sql';
const minimumPrivilegesMigrationPath =
  'supabase/migrations/20260716183023_health_score_v3_periodos_service_role_minimo.sql';
const transitionAttributionMigrationPath =
  'supabase/migrations/20260717095000_health_score_v3_transicoes_atribuicao.sql';
const helperPath =
  'supabase/functions/_shared/reconstrucao-periodos-professor.mjs';
const edgePath =
  'supabase/functions/reconstruir-periodos-professor/index.ts';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function event(professor, dia, overrides = {}) {
  return {
    unidade_id: 'unidade-1',
    emusys_aula_id: Number(dia.replaceAll('-', '')),
    data_hora_inicio: `${dia}T12:00:00.000Z`,
    emusys_aluno_id: 101,
    aluno_id: 10,
    pessoa_chave: 'emusys:101',
    emusys_matricula_id: 500,
    emusys_matricula_disciplina_id: 700,
    emusys_disciplina_id: 8,
    professor_id: professor === 0 ? null : professor,
    emusys_professor_id: professor,
    professor_resolvido_por_id: professor !== 0,
    cancelada: false,
    sem_acompanhamento: professor === 0,
    ...overrides,
  };
}

test('migration cria periodos, execucoes e revisoes isoladas', () => {
  assert.equal(fs.existsSync(migrationPath), true, `${migrationPath} deve existir`);
  const sql = read(migrationPath);

  assert.match(sql, /create table public\.professor_periodos_reconstrucoes_v1/i);
  assert.match(sql, /create table public\.professor_matricula_disciplina_periodos_v1/i);
  assert.match(sql, /create table public\.professor_periodos_revisoes_v1/i);
  assert.match(sql, /reconstrucao_id uuid not null/i);
  assert.match(sql, /pessoa_chave text not null/i);
  assert.match(sql, /emusys_matricula_disciplina_id bigint/i);
  assert.match(sql, /confianca text not null[\s\S]*'revisado_aprovado'/i);
  assert.match(sql, /status_periodo text not null[\s\S]*'invalidado'/i);
  assert.match(sql, /duracao_dias numeric[\s\S]*generated always/i);
  assert.match(sql, /duracao_meses numeric[\s\S]*generated always/i);
  assert.match(sql, /elegivel_permanencia boolean[\s\S]*generated always/i);
  assert.match(sql, /publicavel boolean[\s\S]*generated always/i);
  assert.match(sql, /interval '4 months'|\/\s*30\.44/i);
  assert.match(sql, /data_fim is null[\s\S]*data_fim >= data_inicio/i);
  assert.match(sql, /status_periodo <> 'encerrado'[\s\S]*data_fim is not null/i);

  for (const table of [
    'professor_periodos_reconstrucoes_v1',
    'professor_matricula_disciplina_periodos_v1',
    'professor_periodos_revisoes_v1',
  ]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(
      sql,
      new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`, 'i'),
    );
  }

  assert.match(sql, /create or replace view public\.vw_professor_periodos_diagnostico_v1[\s\S]*security_invoker\s*=\s*on/i);
  assert.match(sql, /fn_bloquear_mutacao_professor_periodos_revisoes_v1/i);
  assert.match(sql, /revoke all on public\.professor_periodos_revisoes_v1 from service_role/i);
  assert.match(sql, /revoke all on public\.vw_professor_periodos_diagnostico_v1 from service_role/i);
  assert.doesNotMatch(sql, /grant\s+.*\s+to\s+(anon|authenticated|public)/i);
  assert.doesNotMatch(sql, /(insert\s+into|update|delete\s+from)\s+public\.(aulas_emusys|aluno_presenca)/i);
});

test('migration corretiva remove mutacao herdada da revisao humana', () => {
  assert.equal(fs.existsSync(isolationMigrationPath), true);
  const sql = read(isolationMigrationPath);
  assert.match(sql, /revoke all on public\.professor_periodos_revisoes_v1 from service_role/i);
  assert.match(sql, /grant select, insert on public\.professor_periodos_revisoes_v1 to service_role/i);
  assert.match(sql, /revoke all on public\.vw_professor_periodos_diagnostico_v1 from service_role/i);
  assert.match(sql, /grant select on public\.vw_professor_periodos_diagnostico_v1 to service_role/i);
});

test('migration alinha unicidade com a chave fallback aluno e disciplina', () => {
  assert.equal(fs.existsSync(fallbackKeyMigrationPath), true);
  const sql = read(fallbackKeyMigrationPath);
  assert.match(sql, /drop index if exists public\.uq_professor_periodos_identidade_reconstrucao/i);
  assert.match(sql, /drop index if exists public\.uq_professor_periodos_um_ativo_por_disciplina/i);
  assert.match(sql, /nullif\(emusys_matricula_disciplina_id,\s*0\)/i);
  assert.match(sql, /emusys_aluno_id/i);
  assert.match(sql, /emusys_disciplina_id/i);
});

test('migration remove privilegios destrutivos diretos do service role', () => {
  assert.equal(fs.existsSync(minimumPrivilegesMigrationPath), true);
  const sql = read(minimumPrivilegesMigrationPath);
  for (const table of [
    'professor_periodos_reconstrucoes_v1',
    'professor_matricula_disciplina_periodos_v1',
  ]) {
    assert.match(sql, new RegExp(`revoke all on public\\.${table} from service_role`, 'i'));
    assert.match(sql, new RegExp(`grant select on public\\.${table} to service_role`, 'i'));
  }
  assert.doesNotMatch(sql, /grant\s+(?:all|truncate|trigger|references|update|delete)\b/i);
});

test('reconstrutor preserva continuidade, troca sustentada e substituicao', async () => {
  assert.equal(fs.existsSync(helperPath), true, `${helperPath} deve existir`);
  const {
    reconstruirPeriodos,
    calcularDuracaoMeses,
    ehElegivelPermanencia,
    coletarIdsEmusysProfessores,
    resolverProfessoresNoContexto,
  } = await import(`${pathToFileURL(helperPath).href}?t=${Date.now()}`);

  const idsContexto = coletarIdsEmusysProfessores(
    [{ emusys_professor_id: 1 }],
    {
      jornadas: [{ emusys_professor_id: 2 }],
      transicoes: [{
        emusys_professor_anterior_id: 1,
        emusys_professor_novo_id: 3,
      }],
    },
  );
  assert.deepEqual(idsContexto, [1, 2, 3]);

  const contextoResolvido = resolverProfessoresNoContexto({
    alunos_emusys_contextualizados: [101, 202],
    jornadas: [{ emusys_professor_id: 2, professor_id: null }],
    transicoes: [{
      emusys_professor_anterior_id: 1,
      emusys_professor_novo_id: 3,
      professor_anterior_id: null,
      professor_novo_id: null,
    }],
  }, new Map([
    [1, { professor_id: 10, ambiguo: false }],
    [2, { professor_id: 20, ambiguo: false }],
    [3, { professor_id: 30, ambiguo: false }],
  ]));
  assert.equal(contextoResolvido.jornadas[0].professor_id, 20);
  assert.equal(contextoResolvido.transicoes[0].professor_anterior_id_resolvido, 10);
  assert.equal(contextoResolvido.transicoes[0].professor_novo_id_resolvido, 30);
  assert.deepEqual(contextoResolvido.alunos_emusys_contextualizados, [101, 202]);

  const contexto = {
    versao_reconstrucao: 'periodos-professor-v1-piloto',
    data_inicio_recorte: '2026-01-01',
    data_fim_recorte: '2026-12-31',
    jornada_atual: null,
    transicoes: [],
  };

  const apenasA = reconstruirPeriodos([
    event(1, '2026-01-10'),
    event(1, '2026-01-17'),
    event(1, '2026-01-24'),
  ], contexto);
  assert.equal(apenasA.periodos.length, 1);
  assert.equal(apenasA.periodos[0].emusys_professor_id, 1);
  assert.equal(apenasA.periodos[0].status_periodo, 'ativo');

  const troca = reconstruirPeriodos([
    event(1, '2026-01-10'),
    event(1, '2026-01-17'),
    event(2, '2026-01-24'),
    event(2, '2026-01-31'),
    event(2, '2026-02-07'),
  ], contexto);
  assert.equal(troca.periodos.length, 2);
  assert.equal(troca.periodos[0].status_periodo, 'encerrado');
  assert.equal(troca.periodos[0].tipo_fim, 'troca_sustentada');
  assert.equal(troca.periodos[1].status_periodo, 'ativo');
  assert.equal(troca.periodos[1].emusys_professor_id, 2);

  const trocaSustentadaComFallbackResolvido = reconstruirPeriodos([
    event(1, '2026-01-10', {
      emusys_aula_id: 2026011001,
      emusys_matricula_disciplina_id: 0,
    }),
    event(1, '2026-01-17', {
      emusys_aula_id: 2026011701,
      emusys_matricula_disciplina_id: 700,
    }),
    event(2, '2026-01-24'),
    event(2, '2026-01-31'),
    event(2, '2026-02-07'),
  ], {
    ...contexto,
    inicio_completo: true,
  });
  assert.equal(trocaSustentadaComFallbackResolvido.periodos[0].tipo_fim, 'troca_sustentada');
  assert.equal(trocaSustentadaComFallbackResolvido.periodos[0].confianca, 'alta');
  assert.equal(trocaSustentadaComFallbackResolvido.periodos[0].publicavel_sugerido, true);
  assert.deepEqual(
    trocaSustentadaComFallbackResolvido.periodos[0].evidencias.promocao_confianca,
    {
      regra: 'encerramento_estruturado_sem_conflito',
      tipo_fim: 'troca_sustentada',
    },
  );
  assert.equal(
    trocaSustentadaComFallbackResolvido.diagnosticos.some((item) =>
      item.tipo === 'periodo_promovido_por_evidencia_terminal' &&
      item.tipo_fim === 'troca_sustentada'
    ),
    true,
  );

  const substituicao = reconstruirPeriodos([
    event(1, '2026-01-10'),
    event(1, '2026-01-17'),
    event(2, '2026-01-24'),
    event(1, '2026-01-31'),
    event(1, '2026-02-07'),
  ], contexto);
  assert.equal(substituicao.periodos.length, 1);
  assert.equal(substituicao.periodos[0].emusys_professor_id, 1);
  assert.equal(substituicao.periodos[0].substituicao_candidata, true);
  assert.equal(substituicao.periodos[0].publicavel_sugerido, false);
  assert.equal(substituicao.diagnosticos.some((item) => item.tipo === 'substituicao_candidata'), true);

  const substituicaoComHistoricoCompleto = reconstruirPeriodos([
    event(1, '2026-01-10'),
    event(1, '2026-01-17'),
    event(2, '2026-01-24'),
    event(1, '2026-01-31'),
    event(1, '2026-02-07'),
  ], {
    ...contexto,
    inicio_completo: true,
  });
  assert.equal(substituicaoComHistoricoCompleto.periodos.length, 1);
  assert.equal(substituicaoComHistoricoCompleto.periodos[0].confianca, 'alta');
  assert.equal(substituicaoComHistoricoCompleto.periodos[0].publicavel_sugerido, true);
  assert.equal(substituicaoComHistoricoCompleto.periodos[0].substituicao_candidata, true);

  const duasCoberturasAntesDoRetorno = reconstruirPeriodos([
    event(1, '2026-01-10'),
    event(1, '2026-01-17'),
    event(2, '2026-01-24'),
    event(3, '2026-01-31'),
    event(1, '2026-02-07'),
    event(1, '2026-02-14'),
    event(1, '2026-02-21'),
  ], {
    ...contexto,
    inicio_completo: true,
  });
  assert.equal(duasCoberturasAntesDoRetorno.periodos.length, 1);
  assert.equal(duasCoberturasAntesDoRetorno.periodos[0].emusys_professor_id, 1);
  assert.equal(duasCoberturasAntesDoRetorno.periodos[0].status_periodo, 'ativo');
  assert.equal(
    duasCoberturasAntesDoRetorno.periodos[0].evidencias.substituicoes_candidatas.length,
    2,
  );
  assert.equal(
    duasCoberturasAntesDoRetorno.periodos[0].evidencias.substituicoes_candidatas.every(
      (item) => item.criterio === 'retorno_titular_apos_ate_duas_aulas'
    ),
    true,
  );

  const tresCoberturasAntesDoRetornoContinuamEmRevisao = reconstruirPeriodos([
    event(1, '2026-01-10'),
    event(1, '2026-01-17'),
    event(2, '2026-01-24'),
    event(2, '2026-01-31'),
    event(3, '2026-02-07'),
    event(1, '2026-02-14'),
    event(1, '2026-02-21'),
    event(1, '2026-02-28'),
  ], {
    ...contexto,
    inicio_completo: true,
  });
  assert.equal(
    tresCoberturasAntesDoRetornoContinuamEmRevisao.periodos[0].tipo_fim,
    'troca_nao_sustentada',
  );
  assert.equal(tresCoberturasAntesDoRetornoContinuamEmRevisao.periodos[0].confianca, 'revisar');

  const coberturaFinalComTitularNaJornada = reconstruirPeriodos([
    event(1, '2026-01-10'),
    event(1, '2026-01-17'),
    event(1, '2026-01-24'),
    event(2, '2026-01-31'),
  ], {
    ...contexto,
    inicio_completo: true,
    jornadas: [{
      emusys_matricula_disciplina_id: 700,
      emusys_disciplina_id: 8,
      emusys_professor_id: 1,
      professor_id: 1,
      status_matricula: 'ativa',
    }],
  });
  assert.equal(coberturaFinalComTitularNaJornada.periodos.length, 1);
  assert.equal(coberturaFinalComTitularNaJornada.periodos[0].emusys_professor_id, 1);
  assert.equal(coberturaFinalComTitularNaJornada.periodos[0].status_periodo, 'ativo');
  assert.equal(
    coberturaFinalComTitularNaJornada.periodos[0].evidencias.substituicoes_candidatas[0].criterio,
    'jornada_atual_confirma_titular_apos_cobertura_curta',
  );

  const trocaCorroboradaPorCadeiaPosterior = reconstruirPeriodos([
    event(1, '2026-01-10'),
    event(1, '2026-01-17'),
    event(1, '2026-01-24'),
    event(2, '2026-01-31'),
    event(3, '2026-02-07'),
    event(3, '2026-02-14'),
    event(3, '2026-02-21'),
  ], {
    ...contexto,
    inicio_completo: true,
  });
  assert.equal(
    trocaCorroboradaPorCadeiaPosterior.periodos[0].tipo_fim,
    'troca_confirmada_cadeia_posterior',
  );
  assert.equal(trocaCorroboradaPorCadeiaPosterior.periodos[0].confianca, 'alta');
  assert.equal(trocaCorroboradaPorCadeiaPosterior.periodos[0].publicavel_sugerido, true);
  assert.equal(
    trocaCorroboradaPorCadeiaPosterior.periodos[0]
      .evidencias.resolucao_troca_nao_sustentada.total_aulas_posterior,
    3,
  );

  const fimHistoricoDepoisDeCoberturaInconclusiva = reconstruirPeriodos([
    event(1, '2025-01-10'),
    event(1, '2025-05-10'),
    event(2, '2025-06-01'),
  ], {
    ...contexto,
    inicio_completo: true,
    data_inicio_recorte: '2025-01-01',
    data_fim_recorte: '2025-12-31',
    alunos_emusys_contextualizados: [101],
    jornadas: [],
  });
  assert.equal(fimHistoricoDepoisDeCoberturaInconclusiva.periodos[0].tipo_fim, 'fim_evidencia_historica');
  assert.equal(fimHistoricoDepoisDeCoberturaInconclusiva.periodos[0].data_fim, '2025-05-10T12:00:00.000Z');
  assert.equal(fimHistoricoDepoisDeCoberturaInconclusiva.periodos[0].confianca, 'alta');
  assert.equal(fimHistoricoDepoisDeCoberturaInconclusiva.periodos[0].publicavel_sugerido, true);

  const fimHistoricoRecenteDepoisDeCobertura = reconstruirPeriodos([
    event(1, '2026-01-10'),
    event(1, '2026-07-03'),
    event(2, '2026-07-10'),
  ], {
    ...contexto,
    inicio_completo: true,
    data_inicio_recorte: '2026-01-01',
    data_fim_recorte: '2026-07-16',
    alunos_emusys_contextualizados: [101],
    jornadas: [],
  });
  assert.equal(fimHistoricoRecenteDepoisDeCobertura.periodos[0].tipo_fim, 'fim_evidencia_historica');
  assert.equal(fimHistoricoRecenteDepoisDeCobertura.periodos[0].confianca, 'media');
  assert.equal(fimHistoricoRecenteDepoisDeCobertura.periodos[0].publicavel_sugerido, false);

  const experimentalForaDoVinculo = reconstruirPeriodos([
    event(2, '2026-01-03', { categoria: 'experimental' }),
    event(1, '2026-01-10', { categoria: 'normal' }),
    event(1, '2026-01-17', { categoria: 'normal' }),
  ], contexto);
  assert.equal(experimentalForaDoVinculo.periodos.length, 1);
  assert.equal(experimentalForaDoVinculo.periodos[0].emusys_professor_id, 1);
  assert.equal(experimentalForaDoVinculo.periodos[0].data_inicio, '2026-01-10T12:00:00.000Z');
  assert.equal(
    experimentalForaDoVinculo.diagnosticos.some((item) =>
      item.tipo === 'aula_experimental_ignorada'
    ),
    true,
  );

  const inconclusivo = reconstruirPeriodos([
    event(1, '2026-01-10'),
    event(1, '2026-01-17'),
    event(2, '2026-01-24'),
    event(2, '2026-01-31'),
  ], contexto);
  assert.equal(inconclusivo.periodos.every((item) => item.confianca === 'revisar'), true);
  assert.equal(inconclusivo.periodos.every((item) => item.publicavel_sugerido === false), true);
  assert.equal(inconclusivo.diagnosticos.some((item) => item.tipo === 'troca_nao_sustentada'), true);

  const trocaPorWebhookSemAulaNova = reconstruirPeriodos([
    event(1, '2026-01-10'),
    event(1, '2026-01-17'),
  ], {
    ...contexto,
    jornadas: [{
      emusys_matricula_disciplina_id: 700,
      emusys_professor_id: 2,
      professor_id: 2,
      status_matricula: 'ativa',
    }],
    transicoes: [{
      emusys_matricula_disciplina_id: 700,
      emusys_professor_anterior_id: 1,
      emusys_professor_novo_id: 2,
      professor_novo_id: 2,
      data_transicao: '2026-01-20T15:00:00.000Z',
    }],
  });
  assert.equal(trocaPorWebhookSemAulaNova.periodos.length, 2);
  assert.equal(trocaPorWebhookSemAulaNova.periodos[0].data_fim, '2026-01-20T15:00:00.000Z');
  assert.equal(trocaPorWebhookSemAulaNova.periodos[0].tipo_fim, 'troca_confirmada_transicao');
  assert.equal(trocaPorWebhookSemAulaNova.periodos[1].emusys_professor_id, 2);
  assert.equal(trocaPorWebhookSemAulaNova.periodos[1].status_periodo, 'ativo');

  const webhookDepoisDaPrimeiraAulaNova = reconstruirPeriodos([
    event(1, '2026-01-10'),
    event(1, '2026-01-17'),
    event(2, '2026-01-24'),
    event(2, '2026-01-31'),
  ], {
    ...contexto,
    transicoes: [{
      emusys_matricula_disciplina_id: 700,
      emusys_professor_anterior_id: 1,
      emusys_professor_novo_id: 2,
      professor_novo_id: 2,
      data_transicao: '2026-01-27T15:00:00.000Z',
    }],
  });
  assert.equal(webhookDepoisDaPrimeiraAulaNova.periodos.length, 2);
  assert.equal(
    webhookDepoisDaPrimeiraAulaNova.periodos[0].data_fim,
    '2026-01-24T12:00:00.000Z',
  );
  assert.equal(
    webhookDepoisDaPrimeiraAulaNova.periodos[0].tipo_fim,
    'troca_confirmada_transicao',
  );

  const semAcompanhamento = reconstruirPeriodos([
    event(1, '2026-01-10'),
    event(0, '2026-01-17'),
    event(1, '2026-01-24'),
  ], contexto);
  assert.equal(semAcompanhamento.periodos.length, 1);
  assert.equal(semAcompanhamento.diagnosticos.some((item) => item.tipo === 'sem_acompanhamento'), true);

  const fallbackSemMatriculaDisciplina = reconstruirPeriodos([
    event(1, '2026-01-10', {
      emusys_matricula_disciplina_id: 0,
      emusys_disciplina_id: 8,
    }),
    event(2, '2026-01-11', {
      emusys_aula_id: 20260111,
      emusys_matricula_disciplina_id: 0,
      emusys_disciplina_id: 10,
    }),
  ], contexto);
  assert.equal(fallbackSemMatriculaDisciplina.periodos.length, 2);
  assert.equal(
    fallbackSemMatriculaDisciplina.periodos.every((item) =>
      item.emusys_matricula_disciplina_id === null && item.confianca === 'revisar'
    ),
    true,
  );

  const duplicataApiComFallback = reconstruirPeriodos([
    event(1, '2026-01-10', {
      emusys_aula_id: 100,
      emusys_matricula_disciplina_id: 0,
    }),
    event(1, '2026-01-10', {
      emusys_aula_id: 200,
      emusys_matricula_disciplina_id: 700,
    }),
    event(1, '2026-01-17', {
      emusys_aula_id: 201,
      emusys_matricula_disciplina_id: 700,
    }),
  ], contexto);
  assert.equal(duplicataApiComFallback.periodos.length, 1);
  assert.equal(duplicataApiComFallback.periodos[0].emusys_matricula_disciplina_id, 700);
  assert.deepEqual(duplicataApiComFallback.periodos[0].evidencias.aulas, [200, 201]);
  assert.equal(
    duplicataApiComFallback.diagnosticos.some((item) =>
      item.tipo === 'evento_semantico_duplicado_suprimido'
    ),
    true,
  );

  const fallbackIsoladoComUnicaMatriculaNoEscopo = reconstruirPeriodos([
    event(1, '2026-01-10', {
      emusys_aula_id: 210,
      emusys_matricula_disciplina_id: 0,
    }),
    event(1, '2026-01-17', {
      emusys_aula_id: 211,
      emusys_matricula_disciplina_id: 700,
    }),
  ], contexto);
  assert.equal(fallbackIsoladoComUnicaMatriculaNoEscopo.periodos.length, 1);
  assert.equal(
    fallbackIsoladoComUnicaMatriculaNoEscopo.periodos[0].emusys_matricula_disciplina_id,
    700,
  );
  assert.equal(fallbackIsoladoComUnicaMatriculaNoEscopo.periodos[0].confianca, 'media');
  assert.equal(fallbackIsoladoComUnicaMatriculaNoEscopo.periodos[0].publicavel_sugerido, false);
  assert.equal(
    fallbackIsoladoComUnicaMatriculaNoEscopo.diagnosticos.some((item) =>
      item.tipo === 'fallback_matricula_disciplina_associado'
    ),
    true,
  );

  const renovacaoMesmoProfessor = reconstruirPeriodos([
    event(1, '2026-01-10', {
      emusys_aula_id: 300,
      emusys_matricula_disciplina_id: 700,
    }),
    event(1, '2026-01-17', {
      emusys_aula_id: 301,
      emusys_matricula_disciplina_id: 700,
    }),
    event(1, '2026-01-24', {
      emusys_aula_id: 302,
      emusys_matricula_disciplina_id: 700,
    }),
    event(1, '2026-01-24', {
      emusys_aula_id: 402,
      emusys_matricula_disciplina_id: 701,
    }),
    event(1, '2026-01-31', {
      emusys_aula_id: 403,
      emusys_matricula_disciplina_id: 701,
    }),
    event(1, '2026-02-07', {
      emusys_aula_id: 404,
      emusys_matricula_disciplina_id: 701,
    }),
  ], {
    ...contexto,
    jornadas: [{
      emusys_matricula_disciplina_id: 701,
      emusys_professor_id: 1,
      data_primeira_aula: '2026-01-24T12:00:00.000Z',
      status_matricula: 'ativa',
    }],
  });
  assert.equal(renovacaoMesmoProfessor.periodos.length, 1);
  assert.equal(renovacaoMesmoProfessor.periodos[0].emusys_matricula_disciplina_id, 701);
  assert.equal(renovacaoMesmoProfessor.periodos[0].status_periodo, 'ativo');
  assert.equal(renovacaoMesmoProfessor.periodos[0].confianca, 'media');
  assert.deepEqual(
    renovacaoMesmoProfessor.periodos[0].evidencias.matriculas_disciplinas_origem,
    [700, 701],
  );
  assert.equal(
    renovacaoMesmoProfessor.diagnosticos.some((item) =>
      item.tipo === 'continuidade_matricula_disciplina_inferida'
    ),
    true,
  );

  const renovacaoExataComHistoricoCompleto = reconstruirPeriodos([
    event(1, '2026-01-10', {
      emusys_aula_id: 410,
      emusys_matricula_disciplina_id: 700,
    }),
    event(1, '2026-01-17', {
      emusys_aula_id: 411,
      emusys_matricula_disciplina_id: 700,
    }),
    event(1, '2026-01-24', {
      emusys_aula_id: 412,
      emusys_matricula_disciplina_id: 701,
    }),
    event(1, '2026-01-31', {
      emusys_aula_id: 413,
      emusys_matricula_disciplina_id: 701,
    }),
  ], {
    ...contexto,
    inicio_completo: true,
    jornadas: [{
      emusys_matricula_disciplina_id: 701,
      emusys_professor_id: 1,
      data_primeira_aula: '2026-01-24T12:00:00.000Z',
      status_matricula: 'ativa',
    }],
  });
  assert.equal(renovacaoExataComHistoricoCompleto.periodos.length, 1);
  assert.equal(renovacaoExataComHistoricoCompleto.periodos[0].confianca, 'alta');
  assert.equal(renovacaoExataComHistoricoCompleto.periodos[0].publicavel_sugerido, true);
  assert.deepEqual(
    renovacaoExataComHistoricoCompleto.periodos[0].evidencias.matriculas_disciplinas_origem,
    [700, 701],
  );

  const renovacaoSobrepostaMesmoProfessor = reconstruirPeriodos([
    event(1, '2023-01-07', {
      emusys_aula_id: 450,
      emusys_matricula_disciplina_id: 700,
    }),
    event(1, '2023-10-07', {
      emusys_aula_id: 451,
      emusys_matricula_disciplina_id: 700,
    }),
    event(1, '2023-09-02', {
      emusys_aula_id: 550,
      emusys_matricula_disciplina_id: 701,
    }),
    event(1, '2024-08-31', {
      emusys_aula_id: 551,
      emusys_matricula_disciplina_id: 701,
    }),
  ], {
    ...contexto,
    jornadas: [{
      emusys_aluno_id: 101,
      emusys_matricula_disciplina_id: 701,
      emusys_disciplina_id: 8,
      emusys_professor_id: 1,
      data_primeira_aula: '2023-09-02T12:00:00.000Z',
      status_matricula: 'ativa',
    }],
  });
  assert.equal(renovacaoSobrepostaMesmoProfessor.periodos.length, 1);
  assert.equal(
    renovacaoSobrepostaMesmoProfessor.periodos[0].emusys_matricula_disciplina_id,
    701,
  );
  assert.deepEqual(
    renovacaoSobrepostaMesmoProfessor.periodos[0].evidencias.matriculas_disciplinas_origem,
    [700, 701],
  );
  assert.equal(renovacaoSobrepostaMesmoProfessor.periodos[0].confianca, 'media');

  const fallbackIsoladoNaoCriaPeriodoParalelo = reconstruirPeriodos([
    event(1, '2023-06-03', {
      emusys_aula_id: 560,
      emusys_matricula_disciplina_id: 700,
    }),
    event(1, '2023-12-09', {
      emusys_aula_id: 561,
      emusys_matricula_disciplina_id: 700,
    }),
    event(1, '2024-06-01', {
      emusys_aula_id: 562,
      emusys_matricula_disciplina_id: 0,
    }),
    event(1, '2025-02-01', {
      emusys_aula_id: 563,
      emusys_matricula_disciplina_id: 701,
    }),
    event(1, '2025-12-06', {
      emusys_aula_id: 564,
      emusys_matricula_disciplina_id: 701,
    }),
  ], {
    ...contexto,
    jornadas: [],
  });
  assert.equal(fallbackIsoladoNaoCriaPeriodoParalelo.periodos.length, 2);
  assert.equal(
    fallbackIsoladoNaoCriaPeriodoParalelo.periodos.some((item) =>
      item.emusys_matricula_disciplina_id === null
    ),
    false,
  );
  assert.equal(
    fallbackIsoladoNaoCriaPeriodoParalelo.diagnosticos.some((item) =>
      item.tipo === 'fallback_matricula_disciplina_ambiguo_ignorado'
    ),
    true,
  );

  const renovacaoSequencialSemColisao = reconstruirPeriodos([
    event(1, '2026-01-10', {
      emusys_aula_id: 500,
      emusys_matricula_disciplina_id: 700,
    }),
    event(1, '2026-01-17', {
      emusys_aula_id: 501,
      emusys_matricula_disciplina_id: 700,
    }),
    event(1, '2026-01-24', {
      emusys_aula_id: 600,
      emusys_matricula_disciplina_id: 701,
    }),
    event(1, '2026-01-31', {
      emusys_aula_id: 601,
      emusys_matricula_disciplina_id: 701,
    }),
  ], {
    ...contexto,
    jornadas: [{
      emusys_matricula_disciplina_id: 701,
      emusys_professor_id: 1,
      data_primeira_aula: '2026-01-24T12:00:00.000Z',
      status_matricula: 'ativa',
    }],
  });
  assert.equal(renovacaoSequencialSemColisao.periodos.length, 1);
  assert.equal(renovacaoSequencialSemColisao.periodos[0].emusys_matricula_disciplina_id, 701);
  assert.equal(renovacaoSequencialSemColisao.periodos[0].confianca, 'media');
  assert.deepEqual(
    renovacaoSequencialSemColisao.periodos[0].evidencias.matriculas_disciplinas_origem,
    [700, 701],
  );

  const renovacaoAposRecessoComIdNovo = reconstruirPeriodos([
    event(1, '2022-12-10', {
      emusys_aula_id: 7010,
      emusys_matricula_disciplina_id: 700,
    }),
    event(1, '2022-12-17', {
      emusys_aula_id: 7011,
      emusys_matricula_disciplina_id: 700,
    }),
    event(1, '2023-02-04', {
      emusys_aula_id: 7012,
      emusys_matricula_disciplina_id: 701,
    }),
    event(1, '2023-02-11', {
      emusys_aula_id: 7013,
      emusys_matricula_disciplina_id: 701,
    }),
  ], {
    ...contexto,
    jornadas: [{
      emusys_aluno_id: 101,
      emusys_matricula_disciplina_id: 701,
      emusys_disciplina_id: 8,
      emusys_professor_id: 1,
      data_primeira_aula: '2023-02-04T12:00:00.000Z',
      status_matricula: 'ativa',
    }],
  });
  assert.equal(renovacaoAposRecessoComIdNovo.periodos.length, 1);
  assert.equal(
    renovacaoAposRecessoComIdNovo.periodos[0].emusys_matricula_disciplina_id,
    701,
  );
  assert.equal(renovacaoAposRecessoComIdNovo.periodos[0].status_periodo, 'ativo');
  assert.deepEqual(
    renovacaoAposRecessoComIdNovo.periodos[0].evidencias.matriculas_disciplinas_origem,
    [700, 701],
  );

  const renovacaoHistoricaAposRecessoComSubstituicao = reconstruirPeriodos([
    event(1, '2020-11-14', {
      emusys_aula_id: 7030,
      emusys_matricula_disciplina_id: 700,
    }),
    event(1, '2020-11-21', {
      emusys_aula_id: 7031,
      emusys_matricula_disciplina_id: 700,
    }),
    event(2, '2020-12-09', {
      emusys_aula_id: 7032,
      emusys_matricula_disciplina_id: 700,
    }),
    event(2, '2020-12-16', {
      emusys_aula_id: 7033,
      emusys_matricula_disciplina_id: 700,
    }),
    event(1, '2021-01-23', {
      emusys_aula_id: 7034,
      emusys_matricula_disciplina_id: 701,
    }),
    event(1, '2021-01-30', {
      emusys_aula_id: 7035,
      emusys_matricula_disciplina_id: 701,
    }),
  ], {
    ...contexto,
    jornadas: [],
  });
  const periodosProfessorTitular = renovacaoHistoricaAposRecessoComSubstituicao.periodos
    .filter((item) => item.emusys_professor_id === 1);
  assert.equal(periodosProfessorTitular.length, 1);
  assert.deepEqual(
    periodosProfessorTitular[0].evidencias.matriculas_disciplinas_origem,
    [700, 701],
  );

  const renovacaoComIdCurtoSobreposto = reconstruirPeriodos([
    event(1, '2023-11-28', {
      emusys_aula_id: 7050,
      emusys_matricula_disciplina_id: 700,
    }),
    event(1, '2025-03-22', {
      emusys_aula_id: 7051,
      emusys_matricula_disciplina_id: 700,
    }),
    event(1, '2023-12-09', {
      emusys_aula_id: 7052,
      emusys_matricula_disciplina_id: 699,
    }),
    event(1, '2024-02-24', {
      emusys_aula_id: 7053,
      emusys_matricula_disciplina_id: 699,
    }),
    event(1, '2025-03-29', {
      emusys_aula_id: 7054,
      emusys_matricula_disciplina_id: 701,
    }),
    event(1, '2026-04-25', {
      emusys_aula_id: 7055,
      emusys_matricula_disciplina_id: 701,
    }),
    event(1, '2026-05-02', {
      emusys_aula_id: 7056,
      emusys_matricula_disciplina_id: 702,
    }),
    event(1, '2026-07-11', {
      emusys_aula_id: 7057,
      emusys_matricula_disciplina_id: 702,
    }),
  ], {
    ...contexto,
    jornadas: [{
      emusys_aluno_id: 101,
      emusys_matricula_disciplina_id: 702,
      emusys_disciplina_id: 8,
      emusys_professor_id: 1,
      data_primeira_aula: '2026-05-02T12:00:00.000Z',
      status_matricula: 'ativa',
    }],
  });
  assert.equal(renovacaoComIdCurtoSobreposto.periodos.length, 1);
  assert.equal(renovacaoComIdCurtoSobreposto.periodos[0].status_periodo, 'ativo');
  assert.deepEqual(
    renovacaoComIdCurtoSobreposto.periodos[0].evidencias.matriculas_disciplinas_origem,
    [699, 700, 701, 702],
  );

  const renovacaoComPrimeiraAulaCancelada = reconstruirPeriodos([
    event(1, '2023-06-03', {
      emusys_aula_id: 7060,
      emusys_matricula_disciplina_id: 700,
    }),
    event(1, '2023-12-09', {
      emusys_aula_id: 7061,
      emusys_matricula_disciplina_id: 700,
    }),
    event(1, '2023-12-16', {
      emusys_aula_id: 7062,
      emusys_matricula_disciplina_id: 701,
      cancelada: true,
    }),
    event(1, '2024-02-03', {
      emusys_aula_id: 7063,
      emusys_matricula_disciplina_id: 701,
    }),
    event(1, '2025-02-15', {
      emusys_aula_id: 7064,
      emusys_matricula_disciplina_id: 701,
    }),
    event(1, '2025-02-22', {
      emusys_aula_id: 7065,
      emusys_matricula_disciplina_id: 702,
    }),
    event(1, '2026-03-28', {
      emusys_aula_id: 7066,
      emusys_matricula_disciplina_id: 702,
    }),
    event(1, '2026-04-11', {
      emusys_aula_id: 7067,
      emusys_matricula_disciplina_id: 703,
    }),
    event(1, '2026-07-11', {
      emusys_aula_id: 7068,
      emusys_matricula_disciplina_id: 703,
    }),
  ], {
    ...contexto,
    jornadas: [{
      emusys_aluno_id: 101,
      emusys_matricula_disciplina_id: 703,
      emusys_disciplina_id: 8,
      emusys_professor_id: 1,
      data_primeira_aula: '2026-04-11T12:00:00.000Z',
      status_matricula: 'ativa',
    }],
  });
  assert.equal(renovacaoComPrimeiraAulaCancelada.periodos.length, 1);
  assert.equal(renovacaoComPrimeiraAulaCancelada.periodos[0].status_periodo, 'ativo');
  assert.deepEqual(
    renovacaoComPrimeiraAulaCancelada.periodos[0].evidencias.matriculas_disciplinas_origem,
    [700, 701, 702, 703],
  );
  assert.equal(
    renovacaoComPrimeiraAulaCancelada.periodos[0].evidencias.total_aulas,
    8,
  );

  const jornadaEncerradaComIdRenovado = reconstruirPeriodos([
    event(1, '2024-01-06', {
      emusys_aula_id: 7100,
      emusys_matricula_disciplina_id: 700,
    }),
    event(1, '2024-01-13', {
      emusys_aula_id: 7101,
      emusys_matricula_disciplina_id: 700,
    }),
  ], {
    ...contexto,
    jornadas: [{
      emusys_aluno_id: 101,
      emusys_matricula_disciplina_id: 701,
      emusys_disciplina_id: 8,
      emusys_professor_id: 1,
      data_primeira_aula: '2024-01-06T12:00:00.000Z',
      data_ultima_aula: '2024-01-13T12:00:00.000Z',
      status_matricula: 'trancada',
    }],
  });
  assert.equal(jornadaEncerradaComIdRenovado.periodos.length, 1);
  assert.equal(jornadaEncerradaComIdRenovado.periodos[0].status_periodo, 'encerrado');
  assert.equal(jornadaEncerradaComIdRenovado.periodos[0].tipo_fim, 'fim_jornada');
  assert.equal(
    jornadaEncerradaComIdRenovado.periodos[0].emusys_matricula_disciplina_id,
    701,
  );

  const jornadaEncerradaComFallbackResolvido = reconstruirPeriodos([
    event(1, '2024-01-06', {
      emusys_aula_id: 7110,
      emusys_matricula_disciplina_id: 0,
    }),
    event(1, '2024-01-13', {
      emusys_aula_id: 7111,
      emusys_matricula_disciplina_id: 700,
    }),
  ], {
    ...contexto,
    inicio_completo: true,
    jornadas: [{
      emusys_aluno_id: 101,
      emusys_matricula_disciplina_id: 700,
      emusys_disciplina_id: 8,
      emusys_professor_id: 1,
      data_primeira_aula: '2024-01-06T12:00:00.000Z',
      data_ultima_aula: '2024-01-13T12:00:00.000Z',
      status_matricula: 'trancada',
    }],
  });
  assert.equal(jornadaEncerradaComFallbackResolvido.periodos.length, 1);
  assert.equal(jornadaEncerradaComFallbackResolvido.periodos[0].tipo_fim, 'fim_jornada');
  assert.equal(jornadaEncerradaComFallbackResolvido.periodos[0].confianca, 'alta');
  assert.equal(jornadaEncerradaComFallbackResolvido.periodos[0].publicavel_sugerido, true);
  assert.deepEqual(
    jornadaEncerradaComFallbackResolvido.periodos[0].evidencias.promocao_confianca,
    {
      regra: 'encerramento_estruturado_sem_conflito',
      tipo_fim: 'fim_jornada',
    },
  );

  const retornoDepoisDeLongaInterrupcao = reconstruirPeriodos([
    event(1, '2023-01-07', {
      emusys_aula_id: 7200,
      emusys_matricula_disciplina_id: 700,
    }),
    event(1, '2023-01-14', {
      emusys_aula_id: 7201,
      emusys_matricula_disciplina_id: 700,
    }),
    event(1, '2025-01-04', {
      emusys_aula_id: 7202,
      emusys_matricula_disciplina_id: 701,
    }),
    event(1, '2025-01-11', {
      emusys_aula_id: 7203,
      emusys_matricula_disciplina_id: 701,
    }),
  ], {
    ...contexto,
    jornadas: [{
      emusys_aluno_id: 101,
      emusys_matricula_disciplina_id: 701,
      emusys_disciplina_id: 8,
      emusys_professor_id: 1,
      data_primeira_aula: '2025-01-04T12:00:00.000Z',
      status_matricula: 'ativa',
    }],
  });
  assert.equal(retornoDepoisDeLongaInterrupcao.periodos.length, 2);
  assert.equal(retornoDepoisDeLongaInterrupcao.periodos[0].status_periodo, 'encerrado');
  assert.equal(retornoDepoisDeLongaInterrupcao.periodos[0].tipo_fim, 'fim_evidencia_historica');
  assert.equal(retornoDepoisDeLongaInterrupcao.periodos[1].status_periodo, 'ativo');
  assert.equal(
    retornoDepoisDeLongaInterrupcao.periodos[1].emusys_matricula_disciplina_id,
    701,
  );

  const retornoDepoisDeNoveMeses = reconstruirPeriodos([
    event(1, '2023-01-07', {
      emusys_aula_id: 7250,
      emusys_matricula_disciplina_id: 700,
    }),
    event(1, '2023-01-14', {
      emusys_aula_id: 7251,
      emusys_matricula_disciplina_id: 700,
    }),
    event(1, '2023-10-14', {
      emusys_aula_id: 7252,
      emusys_matricula_disciplina_id: 701,
    }),
    event(1, '2023-10-21', {
      emusys_aula_id: 7253,
      emusys_matricula_disciplina_id: 701,
    }),
  ], {
    ...contexto,
    jornadas: [],
  });
  assert.equal(retornoDepoisDeNoveMeses.periodos.length, 2);

  const retornoDepoisDeSessentaDiasForaDoRecesso = reconstruirPeriodos([
    event(1, '2023-05-27', {
      emusys_aula_id: 7260,
      emusys_matricula_disciplina_id: 700,
    }),
    event(1, '2023-06-03', {
      emusys_aula_id: 7261,
      emusys_matricula_disciplina_id: 700,
    }),
    event(1, '2023-08-05', {
      emusys_aula_id: 7262,
      emusys_matricula_disciplina_id: 701,
    }),
    event(1, '2023-08-12', {
      emusys_aula_id: 7263,
      emusys_matricula_disciplina_id: 701,
    }),
  ], {
    ...contexto,
    jornadas: [],
  });
  assert.equal(retornoDepoisDeSessentaDiasForaDoRecesso.periodos.length, 2);

  const jornadaEncerradaNoFormatoDaEdge = reconstruirPeriodos([
    event(1, '2026-01-10'),
    event(1, '2026-01-17'),
    event(1, '2026-01-24'),
  ], {
    ...contexto,
    jornadas: [{
      emusys_matricula_disciplina_id: 700,
      emusys_professor_id: 1,
      data_primeira_aula: '2026-01-10T12:00:00.000Z',
      data_ultima_aula: '2026-01-24T12:00:00.000Z',
      status_matricula: 'trancada',
    }],
  });
  assert.equal(jornadaEncerradaNoFormatoDaEdge.periodos.length, 1);
  assert.equal(jornadaEncerradaNoFormatoDaEdge.periodos[0].status_periodo, 'encerrado');
  assert.equal(jornadaEncerradaNoFormatoDaEdge.periodos[0].tipo_fim, 'fim_jornada');

  const disciplinaAntigaSemApoioAtual = reconstruirPeriodos([
    event(1, '2025-01-04', {
      emusys_aula_id: 7300,
      emusys_matricula_disciplina_id: 700,
      emusys_disciplina_id: 8,
    }),
    event(1, '2025-06-28', {
      emusys_aula_id: 7301,
      emusys_matricula_disciplina_id: 700,
      emusys_disciplina_id: 8,
    }),
  ], {
    ...contexto,
    alunos_emusys_contextualizados: [101],
    jornadas: [{
      emusys_aluno_id: 101,
      emusys_matricula_disciplina_id: 900,
      emusys_disciplina_id: 10,
      emusys_professor_id: 2,
      status_matricula: 'ativa',
    }],
  });
  assert.equal(disciplinaAntigaSemApoioAtual.periodos.length, 1);
  assert.equal(disciplinaAntigaSemApoioAtual.periodos[0].status_periodo, 'encerrado');
  assert.equal(disciplinaAntigaSemApoioAtual.periodos[0].tipo_fim, 'fim_evidencia_historica');
  assert.equal(
    disciplinaAntigaSemApoioAtual.periodos[0].data_fim,
    '2025-06-28T12:00:00.000Z',
  );

  const disciplinaAlteradaNoMesmoVinculoPermaneceAtiva = reconstruirPeriodos([
    event(1, '2026-01-10', {
      emusys_aula_id: 7350,
      emusys_matricula_disciplina_id: 700,
      emusys_disciplina_id: 8,
    }),
    event(1, '2026-07-11', {
      emusys_aula_id: 7351,
      emusys_matricula_disciplina_id: 700,
      emusys_disciplina_id: 10,
    }),
  ], {
    ...contexto,
    alunos_emusys_contextualizados: [101],
    jornadas: [{
      emusys_aluno_id: 101,
      emusys_matricula_disciplina_id: 900,
      emusys_disciplina_id: 8,
      emusys_professor_id: 1,
      status_matricula: 'finalizada',
    }, {
      emusys_aluno_id: 101,
      emusys_matricula_disciplina_id: 700,
      emusys_disciplina_id: 10,
      emusys_professor_id: 1,
      status_matricula: 'ativa',
    }],
  });
  assert.equal(disciplinaAlteradaNoMesmoVinculoPermaneceAtiva.periodos.length, 1);
  assert.equal(
    disciplinaAlteradaNoMesmoVinculoPermaneceAtiva.periodos[0].status_periodo,
    'ativo',
  );
  assert.equal(disciplinaAlteradaNoMesmoVinculoPermaneceAtiva.periodos[0].data_fim, null);

  const alunoConsultadoSemJornadaAtual = reconstruirPeriodos([
    event(1, '2024-01-06', { emusys_aula_id: 7400 }),
    event(1, '2024-08-31', { emusys_aula_id: 7401 }),
  ], {
    ...contexto,
    alunos_emusys_contextualizados: [101],
    jornadas: [],
  });
  assert.equal(alunoConsultadoSemJornadaAtual.periodos.length, 1);
  assert.equal(alunoConsultadoSemJornadaAtual.periodos[0].status_periodo, 'encerrado');
  assert.equal(alunoConsultadoSemJornadaAtual.periodos[0].tipo_fim, 'fim_evidencia_historica');

  const historicoMaduroSemContinuidade = reconstruirPeriodos([
    event(1, '2024-01-06', { emusys_aula_id: 7450 }),
    event(1, '2024-08-31', { emusys_aula_id: 7451 }),
  ], {
    ...contexto,
    inicio_completo: true,
    data_fim_recorte: '2026-07-16T23:59:59.000Z',
    alunos_emusys_contextualizados: [101],
    jornadas: [{
      emusys_aluno_id: 101,
      emusys_matricula_disciplina_id: 901,
      emusys_disciplina_id: 10,
      emusys_professor_id: 2,
      status_matricula: 'ativa',
    }],
  });
  assert.equal(historicoMaduroSemContinuidade.periodos.length, 1);
  assert.equal(historicoMaduroSemContinuidade.periodos[0].tipo_fim, 'fim_evidencia_historica');
  assert.equal(historicoMaduroSemContinuidade.periodos[0].confianca, 'alta');
  assert.equal(historicoMaduroSemContinuidade.periodos[0].publicavel_sugerido, true);
  assert.deepEqual(
    historicoMaduroSemContinuidade.periodos[0].evidencias.promocao_confianca,
    {
      regra: 'fim_historico_contextualizado_sem_continuidade',
      dias_seguranca: 75,
    },
  );
  assert.ok(
    historicoMaduroSemContinuidade.diagnosticos.some((item) =>
      item.tipo === 'periodo_promovido_por_fim_historico_contextualizado'
    ),
  );

  const historicoRecenteSemContinuidade = reconstruirPeriodos([
    event(1, '2026-01-10', { emusys_aula_id: 7460 }),
    event(1, '2026-06-27', { emusys_aula_id: 7461 }),
  ], {
    ...contexto,
    inicio_completo: true,
    data_fim_recorte: '2026-07-16T23:59:59.000Z',
    alunos_emusys_contextualizados: [101],
    jornadas: [{
      emusys_aluno_id: 101,
      emusys_matricula_disciplina_id: 901,
      emusys_disciplina_id: 10,
      emusys_professor_id: 2,
      status_matricula: 'ativa',
    }],
  });
  assert.equal(historicoRecenteSemContinuidade.periodos.length, 1);
  assert.equal(historicoRecenteSemContinuidade.periodos[0].confianca, 'media');
  assert.equal(historicoRecenteSemContinuidade.periodos[0].publicavel_sugerido, false);

  const jornadaAtualMesmoVinculoPermaneceAtiva = reconstruirPeriodos([
    event(1, '2026-01-10', { emusys_aula_id: 7500 }),
    event(1, '2026-07-11', { emusys_aula_id: 7501 }),
  ], {
    ...contexto,
    alunos_emusys_contextualizados: [101],
    jornadas: [{
      emusys_aluno_id: 101,
      emusys_matricula_disciplina_id: 700,
      emusys_disciplina_id: 8,
      emusys_professor_id: 1,
      status_matricula: 'ativa',
    }],
  });
  assert.equal(jornadaAtualMesmoVinculoPermaneceAtiva.periodos.length, 1);
  assert.equal(jornadaAtualMesmoVinculoPermaneceAtiva.periodos[0].status_periodo, 'ativo');

  assert.ok(calcularDuracaoMeses('2026-01-01T00:00:00Z', '2026-05-01T00:00:00Z') < 4);
  assert.equal(ehElegivelPermanencia('2026-01-01T00:00:00Z', '2026-04-30T00:00:00Z'), false);
  assert.equal(ehElegivelPermanencia('2026-01-01T00:00:00Z', '2026-05-03T00:00:00Z'), true);
});

test('edge reconstrutora usa staging, versao e RPC transacional', () => {
  assert.equal(fs.existsSync(edgePath), true, `${edgePath} deve existir`);
  const edge = read(edgePath);
  const config = read('supabase/config.toml');

  assert.match(edge, /autorizar/i);
  assert.match(edge, /service_role/i);
  assert.match(edge, /roleDoJwt\(token\)\s*===\s*['"]service_role['"]/);
  assert.match(edge, /emusys_aulas_historico_staging_v1/i);
  assert.match(edge, /emusys_aula_alunos_historico_staging_v1/i);
  assert.match(edge, /aluno_jornada_matricula_disciplina/i);
  assert.match(edge, /\.in\(['"]emusys_aluno_id['"],\s*ids\)/i);
  assert.match(edge, /aluno_professor_transicoes/i);
  assert.equal(
    (edge.match(
      /alunos_emusys_contextualizados:\s*contexto\.alunos_emusys_contextualizados/g,
    ) ?? []).length,
    4,
    'os dois fluxos devem incluir alunos consultados no hash e no contexto do reconstrutor',
  );
  assert.match(edge, /professores_unidades/i);
  assert.match(edge, /emusys_ativo/i);
  assert.match(edge, /validacao_status/i);
  assert.match(edge, /professores:professor_id\s*\(ativo\)/i);
  assert.match(edge, /vinculoOperacional\s*=\s*row\.emusys_ativo\s*===\s*true/i);
  assert.match(edge, /identidadeHistorica\s*=\s*row\.identidade_historica_valida\s*===\s*true/i);
  assert.doesNotMatch(edge, /\.eq\(['"]identidade_historica_valida['"],\s*true\)/);
  assert.match(
    edge,
    /Array\.isArray\(value\)[\s\S]{0,160}const canonicos = value\.map\(stable\)[\s\S]{0,160}return canonicos\.sort\(/i,
  );
  assert.match(edge, /materializar_periodos_professor_v1/i);
  assert.match(edge, /versao_reconstrucao/i);
  assert.match(edge, /INICIO_COMPLETO_EXIGE_EVIDENCIA/i);
  assert.match(edge, /evidencia_inicio_completo:\s*input\.evidencia_inicio_completo/i);
  assert.doesNotMatch(edge, /\.(insert|update|delete)\([^)]*\)\s*\.from\(['"](?:aulas_emusys|aluno_presenca)['"]\)/i);
  assert.match(
    config,
    /\[functions\.reconstruir-periodos-professor\][\s\S]*verify_jwt\s*=\s*true/i,
  );
});

test('gate 3 links the transition to the immutable origin period instead of rewriting a concluded reconstruction', () => {
  assert.equal(
    fs.existsSync(transitionAttributionMigrationPath),
    true,
    `${transitionAttributionMigrationPath} deve existir`,
  );
  const migration = read(transitionAttributionMigrationPath);
  const rpcStart = migration.indexOf('create or replace function public.registrar_transicao_professor_v3');
  const rpcEnd = migration.indexOf('comment on function public.registrar_transicao_professor_v3');
  const rpc = migration.slice(rpcStart, rpcEnd);

  assert.match(rpc, /professor_matricula_disciplina_periodos_v1/i);
  assert.match(rpc, /periodo_origem_id/i);
  assert.match(rpc, /status\s*=\s*'concluido'/i);
  assert.doesNotMatch(rpc, /update\s+public\.professor_matricula_disciplina_periodos_v1/i);
  assert.doesNotMatch(rpc, /insert\s+into\s+public\.professor_matricula_disciplina_periodos_v1/i);
  assert.doesNotMatch(rpc, /delete\s+from\s+public\.professor_matricula_disciplina_periodos_v1/i);
});

test('idade da carteira ativa fica separada da permanencia oficial', () => {
  const sql = read(
    'supabase/migrations/20260717223000_health_score_v3_carteira_ativa_contexto.sql',
  );

  assert.match(sql, /get_professor_carteira_ativa_tempo_v3_sombra/i);
  assert.match(sql, /status_periodo = 'ativo'/i);
  assert.match(sql, /entra_no_score', false/i);
  assert.match(sql, /false as publicavel/i);
  assert.doesNotMatch(sql, /percentile_cont/i);
});

test('permanencia nao publica subconjunto revisado como historico completo', () => {
  const sql = read(
    'supabase/migrations/20260717223500_health_score_v3_permanencia_bloqueio_revisao_parcial.sql',
  );

  assert.match(sql, /aguardando_revisao_historica/i);
  assert.match(sql, /elegiveis_nao_publicaveis[^=]*> 0[^]*then null/i);
  assert.match(sql, /elegiveis_nao_publicaveis[^=]*= 0/i);
  assert.match(sql, /amostra parcial nao representa o historico/i);
});
