import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const migrationPath =
  'supabase/migrations/20260716184500_health_score_v3_reconstrucao_particionada.sql';
const optimizationMigrationPath =
  'supabase/migrations/20260716185500_otimiza_eventos_reconstrucao_particionada.sql';
const manifestMigrationPath =
  'supabase/migrations/20260716190500_manifesto_reconstrucao_particionada.sql';
const manifestAuditMigrationPath =
  'supabase/migrations/20260717225500_health_score_v3_manifesto_fonte_auditoria.sql';
const exactPromotionMigrationPath =
  'supabase/migrations/20260727121000_health_score_v3_promocao_periodos_ativos_exatos.sql';
const edgePath = 'supabase/functions/reconstruir-periodos-professor/index.ts';
const helperPath =
  'supabase/functions/_shared/reconstrucao-particionada-professor.mjs';
const reconstructorPath =
  'supabase/functions/_shared/reconstrucao-periodos-professor.mjs';
const scriptPath = 'scripts/reconstruir-periodos-professor-particionado.mjs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function periodoAtivoMedia(overrides = {}) {
  return {
    unidade_id: '368d47f5-2d88-4475-bc14-ba084a9a348e',
    pessoa_chave: 'emusys:101',
    aluno_id: 10,
    emusys_aluno_id: 101,
    emusys_matricula_id: 500,
    emusys_matricula_disciplina_id: 700,
    emusys_disciplina_id: 8,
    curso_id: 1,
    professor_id: 10,
    emusys_professor_id: 100,
    data_inicio: '2026-01-10T12:00:00.000Z',
    data_fim: null,
    status_periodo: 'ativo',
    confianca: 'media',
    inicio_incompleto: false,
    conflitos: [],
    publicavel_sugerido: false,
    evidencias: {},
    ...overrides,
  };
}

function jornadaAtivaExata(overrides = {}) {
  return {
    unidade_id: '368d47f5-2d88-4475-bc14-ba084a9a348e',
    emusys_matricula_disciplina_id: 700,
    emusys_disciplina_id: 8,
    professor_id: 10,
    emusys_professor_id: 100,
    status_matricula: 'ativa',
    ...overrides,
  };
}

test('helper valida limites e enumera particoes sem lacunas', async () => {
  assert.equal(fs.existsSync(helperPath), true, `${helperPath} deve existir`);
  const { validarParticionamento, indicesParticoes } = await import(
    `../supabase/functions/_shared/reconstrucao-particionada-professor.mjs?${Date.now()}`
  );

  assert.deepEqual(indicesParticoes(4), [0, 1, 2, 3]);
  assert.deepEqual(validarParticionamento(32, 31), {
    total: 32,
    indice: 31,
  });
  assert.throws(() => validarParticionamento(1, 0), /PARTICAO_TOTAL_INVALIDO/);
  assert.throws(() => validarParticionamento(129, 0), /PARTICAO_TOTAL_INVALIDO/);
  assert.throws(() => validarParticionamento(8, 8), /PARTICAO_INDICE_INVALIDO/);
});

test('migration particiona por pessoa canonica e materializa somente apos todas as partes', () => {
  assert.equal(fs.existsSync(migrationPath), true, `${migrationPath} deve existir`);
  const sql = read(migrationPath);

  assert.match(sql, /create table public\.professor_periodos_reconstrucao_particoes_v1/i);
  assert.match(sql, /listar_eventos_staging_particao_professor_v1/i);
  assert.match(sql, /vw_aluno_identidade_unidade_canonica/i);
  assert.match(sql, /pessoa_chave/i);
  assert.match(sql, /md5\(base\.particao_pessoa_chave\)/i);
  assert.match(sql, /registrar_particao_periodos_professor_v1/i);
  assert.match(sql, /finalizar_reconstrucao_particionada_professor_v1/i);
  assert.match(sql, /count\(distinct particao_indice\)/i);
  assert.match(sql, /status[^;]+aguardando_particoes/is);
  assert.match(sql, /extensions\.digest/i);
  assert.match(sql, /diagnosticos_detalhados_em/i);
  assert.match(sql, /processamento_particionado/i);
  assert.match(sql, /revoke all[^;]+from public, anon, authenticated/is);
  assert.doesNotMatch(sql, /grant (?:select|insert|update|delete|execute)[^;]+to (?:public|anon|authenticated)/i);
});

test('leitura particionada resolve identidade em joins de conjunto, sem lateral por evento', () => {
  assert.equal(
    fs.existsSync(optimizationMigrationPath),
    true,
    `${optimizationMigrationPath} deve existir`,
  );
  const sql = read(optimizationMigrationPath);
  assert.match(sql, /listar_eventos_staging_particao_professor_v1/i);
  assert.match(sql, /left join public\.vw_aluno_identidade_unidade_canonica i_emusys/i);
  assert.match(sql, /left join public\.vw_aluno_identidade_unidade_canonica i_local/i);
  assert.doesNotMatch(sql, /join lateral/i);
  assert.match(sql, /md5\(base\.particao_pessoa_chave\)/i);
});

test('manifesto calcula identidade uma vez e indexa cada particao do recorte', () => {
  assert.equal(fs.existsSync(manifestMigrationPath), true, `${manifestMigrationPath} deve existir`);
  const sql = read(manifestMigrationPath);
  assert.match(sql, /professor_periodos_reconstrucao_manifesto_v1/i);
  assert.match(sql, /preparar_manifesto_reconstrucao_professor_v1/i);
  assert.match(sql, /unique[\s\S]+roster_staging_id/i);
  assert.match(sql, /particao_indice/i);
  assert.match(sql, /vw_aluno_identidade_unidade_canonica/i);
  assert.match(sql, /listar_eventos_staging_particao_professor_v1/i);
  assert.match(sql, /from public\.professor_periodos_reconstrucao_manifesto_v1/i);
  assert.match(sql, /revoke all[^;]+from public, anon, authenticated/is);
});

test('finalizador preserva e valida a versao-fonte do manifesto no cabecalho', () => {
  assert.equal(
    fs.existsSync(manifestAuditMigrationPath),
    true,
    `${manifestAuditMigrationPath} deve existir`,
  );
  const sql = read(manifestAuditMigrationPath);

  assert.match(sql, /manifesto_versao_fonte/i);
  assert.match(sql, /count\(distinct[\s\S]+manifesto_versao_fonte/i);
  assert.match(sql, /MANIFESTO_VERSAO_FONTE_DIVERGENTE/i);
  assert.match(sql, /parametros\s*=\s*r\.parametros\s*\|\|\s*jsonb_build_object/i);
  assert.match(sql, /revoke all[^;]+from public, anon, authenticated/is);
});

test('edge usa RPC paginada no modo particionado e preserva modo pequeno', () => {
  const edge = read(edgePath);

  assert.match(edge, /particao_total/i);
  assert.match(edge, /particao_indice/i);
  assert.match(edge, /manifesto_versao_fonte/i);
  assert.match(edge, /validarParticionamento/i);
  assert.match(edge, /listar_eventos_staging_particao_professor_v1/i);
  assert.match(edge, /preparar_manifesto_reconstrucao_professor_v1/i);
  assert.match(edge, /registrar_particao_periodos_professor_v1/i);
  assert.match(edge, /finalizar_reconstrucao_particionada_professor_v1/i);
  assert.match(edge, /materializar_periodos_professor_v1/i);
  assert.match(edge, /processamento_particionado/i);
  assert.match(
    edge,
    /preparar_manifesto_reconstrucao_professor_v1[\s\S]{0,500}p_versao_reconstrucao:\s*input\.manifesto_versao_fonte/i,
  );
  assert.match(
    edge,
    /listar_eventos_staging_particao_professor_v1[\s\S]{0,500}p_versao_reconstrucao:\s*input\.manifesto_versao_fonte/i,
  );
  assert.match(
    edge,
    /registrar_particao_periodos_professor_v1[\s\S]{0,500}p_versao_reconstrucao:\s*input\.versao_reconstrucao/i,
  );
  assert.match(
    edge,
    /finalizar_reconstrucao_particionada_professor_v1[\s\S]{0,500}p_versao_reconstrucao:\s*input\.versao_reconstrucao/i,
  );
});

test('orquestrador chama cada indice e permite retomada idempotente', () => {
  assert.equal(fs.existsSync(scriptPath), true, `${scriptPath} deve existir`);
  const script = read(scriptPath);

  assert.match(script, /indicesParticoes/i);
  assert.match(script, /--total-particoes/i);
  assert.match(script, /--inicio-particao/i);
  assert.match(script, /--manifesto-versao-fonte/i);
  assert.match(script, /--evidencia-inicio-completo/i);
  assert.match(script, /INICIO_COMPLETO_EXIGE_EVIDENCIA/i);
  assert.match(script, /evidencia_inicio_completo:\s*inicioCompleto/i);
  assert.match(script, /particao_indice/i);
  assert.match(script, /particao_total/i);
  assert.match(script, /manifesto_versao_fonte:\s*manifestoVersaoFonte/i);
  assert.match(script, /reconstruir-periodos-professor/i);
  assert.match(script, /AbortSignal\.timeout\(30_000\)/);
  assert.match(script, /AbortSignal\.timeout\(120_000\)/);
  assert.match(script, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(script, /tokenJwtValido\(process\.env\.SUPABASE_ACCESS_TOKEN\)/);
  assert.doesNotMatch(script, /250178Alf|lucianoalf\.la@gmail\.com/i);
});

test('orquestrador prioriza .env.local sobre .env', () => {
  const script = read(scriptPath);
  const envLocalIndex = script.indexOf("carregarEnvArquivo('.env.local')");
  const envIndex = script.indexOf("carregarEnvArquivo('.env')");

  assert.notEqual(envLocalIndex, -1, 'deve carregar .env.local');
  assert.notEqual(envIndex, -1, 'deve carregar .env');
  assert.ok(
    envLocalIndex < envIndex,
    '.env.local deve ser carregado primeiro quando o loader preserva valores existentes',
  );
});

test('Task 3 disponibiliza a promocao append-only de periodos ativos exatos', () => {
  assert.equal(
    fs.existsSync(exactPromotionMigrationPath),
    true,
    `${exactPromotionMigrationPath} ainda nao foi implementada`,
  );
});

test(
  'promocao exige jornada ativa exata e nao usa nome como identidade',
  { skip: !fs.existsSync(exactPromotionMigrationPath) },
  () => {
    const sql = read(exactPromotionMigrationPath);

    assert.match(sql, /aluno_jornada_matricula_disciplina/i);
    assert.match(sql, /unidade_id/i);
    assert.match(sql, /emusys_matricula_disciplina_id/i);
    assert.match(sql, /professor_id/i);
    assert.match(sql, /status_matricula[\s\S]*ativa/i);
    assert.match(sql, /vw_professor_periodos_baseline_v3_sombra/i);
    assert.match(sql, /cardinalidade_jornada_ativa/i);
    assert.match(sql, /cardinalidade_jornada_ativa\s*=\s*1/i);
    assert.match(sql, /confianca[\s\S]*media[\s\S]*alta/i);
    assert.match(sql, /publicavel/i);
    assert.match(sql, /jornada_atual_exata/i);
    assert.doesNotMatch(
      sql,
      /(?:professor_nome|nome_professor)\s*=/i,
    );
  },
);

test(
  'promocao grava revisao idempotente sem atualizar o baseline',
  { skip: !fs.existsSync(exactPromotionMigrationPath) },
  () => {
    const sql = read(exactPromotionMigrationPath);

    assert.match(
      sql,
      /insert\s+into\s+public\.professor_periodos_revisoes_v1/i,
    );
    assert.match(sql, /promocao_confianca/i);
    assert.match(sql, /confianca_anterior/i);
    assert.match(sql, /confianca_atual/i);
    assert.match(sql, /not\s+exists|on\s+conflict[\s\S]*do\s+nothing/i);
    assert.doesNotMatch(
      sql,
      /update\s+public\.professor_matricula_disciplina_periodos_v1/i,
    );
    assert.doesNotMatch(
      sql,
      /delete\s+from\s+public\.professor_matricula_disciplina_periodos_v1/i,
    );
  },
);

test('reconstrutor preserva unidade_id no periodo materializavel', async () => {
  const { reconstruirPeriodos } = await import(
    `${pathToFileURL(reconstructorPath).href}?unidade=${Date.now()}`
  );
  const unidadeId = '368d47f5-2d88-4475-bc14-ba084a9a348e';
  const resultado = reconstruirPeriodos([{
    unidade_id: unidadeId,
    emusys_aula_id: 1,
    data_hora_inicio: '2026-01-10T12:00:00.000Z',
    emusys_aluno_id: 101,
    aluno_id: 10,
    pessoa_chave: 'emusys:101',
    emusys_matricula_id: 500,
    emusys_matricula_disciplina_id: 700,
    emusys_disciplina_id: 8,
    curso_id: 1,
    professor_id: 10,
    emusys_professor_id: 100,
    professor_resolvido_por_id: true,
    cancelada: false,
    sem_acompanhamento: false,
  }], {
    versao_reconstrucao: 'task-3-unidade',
    data_inicio_recorte: '2026-01-01',
    data_fim_recorte: '2026-07-27',
    inicio_completo: true,
    jornadas: [],
    transicoes: [],
  });

  assert.equal(resultado.periodos.length, 1);
  assert.equal(resultado.periodos[0].unidade_id, unidadeId);
});

test('regra pura promove ativo media com uma unica jornada atual exata', async () => {
  const { promoverPeriodosAtivosComJornadaAtualExata } = await import(
    `${pathToFileURL(reconstructorPath).href}?promocao=${Date.now()}`
  );
  const periodos = [periodoAtivoMedia()];
  const diagnosticos = [];

  promoverPeriodosAtivosComJornadaAtualExata(
    periodos,
    { jornadas: [jornadaAtivaExata()] },
    diagnosticos,
  );

  assert.equal(periodos[0].confianca, 'alta');
  assert.equal(periodos[0].publicavel_sugerido, true);
  assert.equal(periodos[0].inicio_incompleto, false);
  assert.deepEqual(periodos[0].evidencias.promocao_confianca, {
    regra: 'jornada_atual_exata',
    confianca_anterior: 'media',
    confianca_atual: 'alta',
  });
  assert.ok(
    diagnosticos.some((item) =>
      item.tipo === 'periodo_ativo_promovido_por_jornada_atual_exata'
    ),
  );
});

test('promocao exata rejeita unidade, professor, status, conflito e cardinalidade divergentes', async () => {
  const { promoverPeriodosAtivosComJornadaAtualExata } = await import(
    `${pathToFileURL(reconstructorPath).href}?criterios=${Date.now()}`
  );
  const cenarios = [
    {
      nome: 'unidade divergente',
      periodo: periodoAtivoMedia(),
      jornadas: [jornadaAtivaExata({ unidade_id: 'outra-unidade' })],
    },
    {
      nome: 'professor divergente',
      periodo: periodoAtivoMedia(),
      jornadas: [jornadaAtivaExata({ professor_id: 11 })],
    },
    {
      nome: 'jornada finalizada',
      periodo: periodoAtivoMedia(),
      jornadas: [jornadaAtivaExata({ status_matricula: 'finalizada' })],
    },
    {
      nome: 'periodo com conflito',
      periodo: periodoAtivoMedia({ conflitos: ['jornada_atual_divergente'] }),
      jornadas: [jornadaAtivaExata()],
    },
    {
      nome: 'duas jornadas ativas na mesma chave',
      periodo: periodoAtivoMedia(),
      jornadas: [
        jornadaAtivaExata(),
        jornadaAtivaExata({ professor_id: 11, emusys_professor_id: 101 }),
      ],
    },
    {
      nome: 'periodo encerrado',
      periodo: periodoAtivoMedia({
        status_periodo: 'encerrado',
        data_fim: '2026-07-01T12:00:00.000Z',
      }),
      jornadas: [jornadaAtivaExata()],
    },
    {
      nome: 'disciplina nao resolvida',
      periodo: periodoAtivoMedia({ emusys_disciplina_id: null }),
      jornadas: [jornadaAtivaExata()],
    },
  ];

  for (const cenario of cenarios) {
    promoverPeriodosAtivosComJornadaAtualExata(
      [cenario.periodo],
      { jornadas: cenario.jornadas },
      [],
    );
    assert.equal(cenario.periodo.confianca, 'media', cenario.nome);
    assert.equal(cenario.periodo.publicavel_sugerido, false, cenario.nome);
    assert.equal(
      cenario.periodo.evidencias.promocao_confianca,
      undefined,
      cenario.nome,
    );
  }
});

test('promocao ativa roda depois do fechamento historico e antes das encerradas', () => {
  const source = read(reconstructorPath);
  const fechamento = source.lastIndexOf(
    'fecharPeriodosHistoricosSemApoioAtual(periodos, contexto, diagnosticos)',
  );
  const promocaoAtiva = source.lastIndexOf(
    'promoverPeriodosAtivosComJornadaAtualExata(periodos, contexto, diagnosticos)',
  );
  const promocaoEncerrada = source.lastIndexOf(
    'promoverPeriodosComEvidenciaTerminalEstruturada(periodos, diagnosticos)',
  );

  assert.ok(fechamento >= 0, 'fechamento historico deve continuar no fluxo');
  assert.ok(promocaoAtiva > fechamento, 'promocao ativa deve ocorrer depois do fechamento');
  assert.ok(
    promocaoEncerrada > promocaoAtiva,
    'promocoes encerradas devem ocorrer depois da promocao ativa',
  );
});
