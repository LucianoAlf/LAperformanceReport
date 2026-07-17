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
  assert.equal(inconclusivo.diagnosticos.some((item) => item.tipo === 'troca_nao_sustentada'), true);

  const trocaPorWebhookSemAulaNova = reconstruirPeriodos([
    event(1, '2026-01-10'),
    event(1, '2026-01-17'),
  ], {
    ...contexto,
    jornadas_atuais: [{
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
    jornadas_atuais: [{
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
    jornadas_atuais: [{
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
  assert.match(edge, /aluno_professor_transicoes/i);
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
  assert.doesNotMatch(edge, /\.(insert|update|delete)\([^)]*\)\s*\.from\(['"](?:aulas_emusys|aluno_presenca)['"]\)/i);
  assert.match(
    config,
    /\[functions\.reconstruir-periodos-professor\][\s\S]*verify_jwt\s*=\s*true/i,
  );
});
