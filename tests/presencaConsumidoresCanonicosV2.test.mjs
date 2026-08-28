import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import test from 'node:test';

const reportRoot = process.cwd();
const contractPath = join(reportRoot, 'docs', 'contracts', 'presenca-consumidores.md');
const contract = existsSync(contractPath) ? readFileSync(contractPath, 'utf8') : '';
const trackedExtensions = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx']);

function walk(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const filePath = join(root, entry.name);
    if (entry.isDirectory()) files.push(...walk(filePath));
    else if (trackedExtensions.has(extname(filePath))) files.push(filePath);
  }
  return files;
}

function normalizeContext(value) {
  return value.replace(/\s+/gu, ' ').trim();
}

function fingerprint(value) {
  return crypto.createHash('sha256').update(normalizeContext(value)).digest('hex').slice(0, 16);
}

function statementEnd(source, start) {
  let quote = null;
  let escaped = false;
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '(' || char === '[' || char === '{') depth += 1;
    else if (char === ')' || char === ']' || char === '}') depth = Math.max(0, depth - 1);
    else if (char === ';' && depth === 0) return index + 1;
  }
  return source.length;
}

function directReadContexts(source) {
  const contexts = [];
  const fromCall = /\.from\(\s*(['"])aluno_presenca\1\s*\)/giu;
  for (const match of source.matchAll(fromCall)) {
    const statement = source.slice(match.index, statementEnd(source, match.index));
    if (/\.select\s*\(/iu.test(statement)) {
      contexts.push({ kind: 'supabase_select', fingerprint: fingerprint(statement) });
      continue;
    }

    const prefixStart = Math.max(source.lastIndexOf(';', match.index - 1), source.lastIndexOf('\n', match.index - 1)) + 1;
    const definition = source.slice(prefixStart, statementEnd(source, match.index));
    const assigned = definition.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/u);
    if (!assigned) continue;
    const escaped = assigned[1].replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const remainingStart = prefixStart + definition.length;
    const laterSelect = new RegExp(`\\b${escaped}\\s*\\.\\s*select\\s*\\(`, 'gu')
      .exec(source.slice(remainingStart));
    if (!laterSelect) continue;
    const selectStart = remainingStart + laterSelect.index;
    const selectStatement = source.slice(selectStart, statementEnd(source, selectStart));
    contexts.push({
      kind: 'supabase_select',
      fingerprint: fingerprint(`${statement} ${selectStatement}`),
    });
  }

  const sqlRead = /\b(?:from|join)\s+(?:public\.)?aluno_presenca\b/giu;
  for (const match of source.matchAll(sqlRead)) {
    const start = Math.max(0, source.lastIndexOf('\n', Math.max(0, match.index - 220)));
    const end = Math.min(source.length, source.indexOf('\n', match.index + 420) || source.length);
    contexts.push({
      kind: 'sql_select',
      fingerprint: fingerprint(source.slice(start, end)),
    });
  }
  return contexts.sort((a, b) => `${a.kind}:${a.fingerprint}`.localeCompare(`${b.kind}:${b.fingerprint}`));
}

function teacherSourceRoot() {
  const candidates = [
    process.env.LA_TEACHER_PRESENCA_SRC,
    resolve(reportRoot, '..', 'la-teacher', 'src'),
    resolve(reportRoot, '..', '..', '..', 'la-teacher', 'src'),
    'D:\\la-teacher-worktrees\\presenca-canonica-raiz\\src',
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function collectDirectReads(roots) {
  const found = new Map();
  for (const root of roots) {
    assert.ok(existsSync(root.path), `raiz runtime ausente: ${root.path}`);
    for (const filePath of walk(root.path)) {
      const contexts = directReadContexts(readFileSync(filePath, 'utf8'));
      if (contexts.length === 0) continue;
      const localPath = relative(root.base, filePath).replaceAll('\\', '/');
      const key = root.label === 'teacher' ? `teacher:src/${localPath}` : `report:${localPath}`;
      found.set(key, contexts);
    }
  }
  return found;
}

// Cada hash congela o contexto da leitura. Trocar uma query no mesmo arquivo
// exige revisao consciente, mesmo que a quantidade permaneça igual.
const directReadAllowlist = new Map([
  ['report:src/components/App/Alunos/statusPagamentoGovernanca.ts', [
    { kind: 'supabase_select', fingerprint: 'b1aa3d5610bb538b' },
  ]],
  ['report:src/hooks/useProfessorDependencies.ts', [
    { kind: 'supabase_select', fingerprint: '0dadf926c45ce688' },
    { kind: 'supabase_select', fingerprint: 'c59aefd751d08722' },
  ]],
  ['report:supabase/functions/auditor-divergencias-emusys/index.ts', [
    { kind: 'sql_select', fingerprint: '0fbb9f4e2004985c' },
  ]],
  ['report:supabase/functions/previsualizar-reconciliacao-grade-emusys/index.ts', [
    { kind: 'supabase_select', fingerprint: '3918f3fd4915f418' },
  ]],
]);

const expectedClassByPath = new Map([
  ['report:src/components/App/Alunos/statusPagamentoGovernanca.ts', 'legado_bloqueado'],
  ['report:src/hooks/useProfessorDependencies.ts', 'auditoria'],
  ['report:supabase/functions/auditor-divergencias-emusys/index.ts', 'auditoria'],
  ['report:supabase/functions/previsualizar-reconciliacao-grade-emusys/index.ts', 'auditoria'],
]);

const liveDefinitions = [
  {
    object: 'vw_aluno_presenca_semantica_v1',
    latestMutationFile: '20260811120100_presenca_semantica_v14_falta_justificada.sql',
    files: [{ name: '20260811120100_presenca_semantica_v14_falta_justificada.sql', contains: ['create or replace view public.vw_aluno_presenca_semantica_v1', 'from public.aluno_presenca ap'] }],
  },
  {
    object: 'vw_presenca_slot_canonica_v1',
    latestMutationFile: '20260824232302_presenca_slot_exclusao_do_slot_e_divergencia_real.sql',
    files: [{ name: '20260824232302_presenca_slot_exclusao_do_slot_e_divergencia_real.sql', contains: ['create or replace view public.vw_presenca_slot_canonica_v1', 'from public.vw_aluno_presenca_semantica_v1'] }],
  },
  {
    object: 'vw_aluno_frequencia_canonica_v1',
    latestMutationFile: '20260827031300_presenca_consumidores_numericos_v2.sql',
    files: [
      { name: '20260825144235_frequencia_do_aluno_conta_aula_real_nao_registro_duplicado.sql', contains: ['create or replace view public.vw_aluno_frequencia_canonica_v1', 'from vw_presenca_slot_canonica_v1'] },
      { name: '20260827031300_presenca_consumidores_numericos_v2.sql', contains: ['create or replace view public.vw_aluno_frequencia_canonica_v1', 'vw_presenca_ocorrencia_metrica_v2'] },
    ],
  },
  {
    object: 'fn_presenca_pendencias_do_dia',
    latestMutationFile: '20260827031000_presenca_pendencias_canonicas_v2.sql',
    files: [
      { name: '20260815124415_corrige_pendencias_presenca_trancamento_reagendamento.sql', contains: ['create or replace function public.fn_presenca_pendencias_do_dia', 'from public.aluno_presenca'] },
      { name: '20260824232102_pendencias_presenca_percorre_roster_do_slot_inteiro.sql', contains: ['fn_presenca_pendencias_do_dia', 'select distinct on (ae.unidade_id'] },
      { name: '20260824232411_pendencia_respeita_justificativa_do_slot.sql', contains: ['fn_presenca_pendencias_do_dia', 'or coalesce(g.justificada, false)'] },
      { name: '20260827031000_presenca_pendencias_canonicas_v2.sql', contains: ['create or replace function public.fn_presenca_pendencias_do_dia', 'fn_presenca_pendencias_do_dia_v2'] },
    ],
  },
  {
    object: 'get_faltas_periodo',
    latestMutationFile: '20260827031800_presenca_rollout_kpis.sql',
    files: [
      { name: '20260615235041_faltas_periodo_inclui_banda_com_flag.sql', contains: ['create function public.get_faltas_periodo', 'from aluno_presenca'] },
      { name: '20260827031300_presenca_consumidores_numericos_v2.sql', contains: ['create or replace function public.get_faltas_periodo', 'get_faltas_periodo_v2'] },
      { name: '20260827031800_presenca_rollout_kpis.sql', contains: ['create or replace function public.get_faltas_periodo_v2', 'get_faltas_periodo_legado_v1', "'kpis'"] },
    ],
  },
  {
    object: 'vw_absenteismo_aluno',
    latestMutationFile: '20260827031800_presenca_rollout_kpis.sql',
    files: [
      { name: '20260704212922_criar_view_absenteismo_aluno.sql', contains: ['create or replace view vw_absenteismo_aluno', 'from aluno_presenca'] },
      { name: '20260707215751_seguranca_views_security_invoker_e_funcoes_guard.sql', contains: ['vw_absenteismo_aluno', 'security_invoker'] },
      { name: '20260827031300_presenca_consumidores_numericos_v2.sql', contains: ['create or replace view public.vw_absenteismo_aluno', 'vw_presenca_ocorrencia_metrica_v2'] },
      { name: '20260827031800_presenca_rollout_kpis.sql', contains: ['create or replace view public.vw_absenteismo_aluno', 'fn_absenteismo_aluno_rollout_v1', 'security_invoker'] },
    ],
  },
  {
    object: 'fn_texto_relatorio_presenca',
    latestMutationFile: '20260827031700_presenca_rollout_adapters.sql',
    files: [
      { name: '20260827030000_presenca_funcoes_vivas_baseline.sql', contains: ['create or replace function public.fn_texto_relatorio_presenca', 'fn_presenca_pendencias_do_dia'] },
      { name: '20260827031000_presenca_pendencias_canonicas_v2.sql', contains: ['create or replace function public.fn_texto_relatorio_presenca', 'fn_presenca_pendencias_do_dia_v2', 'dados_desatualizados'] },
      { name: '20260827031200_presenca_contexto_agentes_v1.sql', contains: ['create or replace function public.fn_texto_relatorio_presenca', 'get_presenca_contexto_agente_v1', "'sol'"] },
      { name: '20260827031700_presenca_rollout_adapters.sql', contains: ['create or replace function public.fn_texto_relatorio_presenca', 'fn_texto_relatorio_presenca_legado_v1', "'sol'"] },
    ],
  },
  {
    object: 'fn_enfileirar_relatorio_presenca',
    latestMutationFile: '20260827031000_presenca_pendencias_canonicas_v2.sql',
    files: [
      { name: '20260827030000_presenca_funcoes_vivas_baseline.sql', contains: ['create or replace function public.fn_enfileirar_relatorio_presenca', 'fn_texto_relatorio_presenca'] },
      { name: '20260827031000_presenca_pendencias_canonicas_v2.sql', contains: ['create or replace function public.fn_enfileirar_relatorio_presenca', 'regra_versao', 'presenca-v2'] },
    ],
  },
  {
    object: 'app_minha_agenda_sessao',
    latestMutationFile: '20260828005722_presenca_roster_v2_publicacao_gatada.sql',
    files: [
      { name: '20260812172432_presenca_canonica_resolvedor_conflitos.sql', contains: ['create or replace function public.app_minha_agenda_sessao', 'fn_presenca_fecha_chamada'] },
      { name: '20260824231632_la_teacher_presenca_pela_canonica_do_slot.sql', contains: ['app_minha_agenda_sessao', 'vw_presenca_slot_canonica_v1'] },
      { name: '20260827031100_la_teacher_presenca_canonica_v2.sql', contains: ['app_minha_agenda_sessao', 'vw_presenca_ocorrencia_canonica_v2', 'fn_presenca_dados_frescos_interno_v1', 'presenca_estado_v2'] },
      { name: '20260827031700_presenca_rollout_adapters.sql', contains: ['create or replace function public.app_minha_agenda_sessao', 'app_minha_agenda_sessao_base_v1', "'la_teacher'"] },
      { name: '20260828005722_presenca_roster_v2_publicacao_gatada.sql', contains: ['create or replace function public.app_minha_agenda_sessao', 'app_minha_agenda_sessao_publicacao_legado_v1', 'app_minha_agenda_sessao_canonica_v2'] },
    ],
  },
  {
    object: 'app_registrar_presencas_aula',
    latestMutationFile: '20260828005722_presenca_roster_v2_publicacao_gatada.sql',
    files: [
      { name: '20260815112104_reverte_precedencia_secretaria_prevalece.sql', contains: ['create or replace function public.app_registrar_presencas_aula', 'professor_la_teacher'] },
      { name: '20260827030900_presenca_comando_overloads_compatibilidade.sql', contains: ['create or replace function public.app_registrar_presencas_aula', 'app_criar_comando_chamada_professor_v1', 'p_request_id uuid'] },
      { name: '20260828005722_presenca_roster_v2_publicacao_gatada.sql', contains: ['create or replace function public.app_registrar_presencas_aula', 'app_registrar_presencas_aula_publicacao_legado_v1', 'app_registrar_presencas_aula_canonica_v2_interno'] },
    ],
  },
  {
    object: 'fabio_confirmar_chamada_acao',
    latestMutationFile: '20260828005722_presenca_roster_v2_publicacao_gatada.sql',
    files: [
      { name: '20260827030800_presenca_comando_portas_fabio.sql', contains: ['create or replace function public.fabio_confirmar_chamada_acao', 'fabio_criar_comando_chamada_v1'] },
      { name: '20260828005722_presenca_roster_v2_publicacao_gatada.sql', contains: ['create or replace function public.fabio_confirmar_chamada_acao', 'fabio_confirmar_chamada_acao_publicacao_legado_v1', 'fabio_confirmar_chamada_acao_canonica_v2_interno'] },
    ],
  },
  {
    object: 'fabio_emitir_presenca_por_registro',
    latestMutationFile: '20260828005722_presenca_roster_v2_publicacao_gatada.sql',
    files: [
      { name: '20260827030800_presenca_comando_portas_fabio.sql', contains: ['create or replace function public.fabio_emitir_presenca_por_registro', 'fabio_criar_comando_chamada_v1'] },
      { name: '20260828005722_presenca_roster_v2_publicacao_gatada.sql', contains: ['create or replace function public.fabio_emitir_presenca_por_registro', 'fabio_emitir_presenca_por_registro_publicacao_legado_v1', 'fabio_emitir_presenca_registro_canonica_v2_interno'] },
    ],
  },
  {
    object: 'fabio_professor_presencas_periodo',
    latestMutationFile: '20260827032100_presenca_rollout_fabio_periodo.sql',
    files: [
      { name: '20260827032100_presenca_rollout_fabio_periodo.sql', contains: ['create or replace function public.fabio_professor_presencas_periodo', 'fabio_professor_presencas_periodo_legado_v1', 'vw_presenca_ocorrencia_canonica_v2', "'la_teacher'"] },
    ],
  },
  {
    object: 'get_health_score_professor_v3_presenca_periodo_v2',
    latestMutationFile: '20260827031300_presenca_consumidores_numericos_v2.sql',
    files: [
      { name: '20260813234837_20260813232430_health_score_v3_presenca_canonica_aplicabilidade.sql', contains: ['create or replace function public.get_health_score_professor_v3_presenca_periodo_v2', 'vw_aluno_presenca_semantica_v1'] },
      { name: '20260827031300_presenca_consumidores_numericos_v2.sql', contains: ['create or replace function public.get_health_score_professor_v3_presenca_periodo_v2', 'vw_presenca_ocorrencia_metrica_v2'] },
    ],
  },
];

test('contrato cataloga consumidores, classes e a matriz completa', () => {
  assert.ok(contract, 'docs/contracts/presenca-consumidores.md ausente');
  for (const consumer of ['Agenda', 'LA Teacher/Fábio', 'Sol', 'Lia', 'Mila/experimental', 'Health Score Professor V3']) {
    assert.match(contract, new RegExp(`\\|\\s*${consumer.replace('/', '\\/')}\\s*\\|`, 'u'), consumer);
  }
  for (const classification of ['writer', 'auditoria', 'operacional', 'agente', 'relatorio', 'kpi', 'grafico', 'legado_bloqueado']) {
    assert.match(contract, new RegExp(`\\b${classification}\\b`, 'u'), classification);
  }
  assert.match(contract, /Produtor\s*\|\s*Contrato atual\s*\|\s*Consumidor\s*\|\s*Contrato alvo\s*\|\s*Validação/iu);
});

test('leituras runtime diretas exigem arquivo e fingerprint allowlisted', () => {
  const actual = collectDirectReads([
    { label: 'report', path: join(reportRoot, 'src'), base: reportRoot },
    { label: 'report', path: join(reportRoot, 'supabase', 'functions'), base: reportRoot },
  ]);
  assert.deepEqual(
    [...actual.entries()].sort(([a], [b]) => a.localeCompare(b)),
    [...directReadAllowlist.entries()].sort(([a], [b]) => a.localeCompare(b)),
  );

  for (const [filePath, classification] of expectedClassByPath) {
    const row = contract.split(/\r?\n/u).find((line) => line.includes(`\`${filePath}\``));
    assert.ok(row, `${filePath}: linha ausente`);
    assert.ok(row.includes(`\`${classification}\``), `${filePath}: classe precisa estar na mesma linha`);
  }
});

test('LA Teacher nao possui leitura crua quando o checkout esta disponivel', { skip: !teacherSourceRoot() }, () => {
  const teacherSrc = teacherSourceRoot();
  const actual = collectDirectReads([{ label: 'teacher', path: teacherSrc, base: teacherSrc }]);
  assert.deepEqual([...actual.entries()], []);
});

test('cada etapa da definicao viva prova sua propria regra e a ultima mutacao', () => {
  const migrationsDir = join(reportRoot, 'supabase', 'migrations');
  const migrations = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();

  for (const definition of liveDefinitions) {
    const escapedObject = definition.object.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const mutationPatterns = [
      new RegExp(`create\\s+(?:or\\s+replace\\s+)?(?:view|function)\\s+(?:public\\.)?${escapedObject}\\b`, 'iu'),
      new RegExp(`alter\\s+(?:view|function)\\s+(?:public\\.)?${escapedObject}\\b`, 'iu'),
      new RegExp(`pg_get_(?:view|function)def\\s*\\([^)]*${escapedObject}`, 'iu'),
      new RegExp(`proname\\s*=\\s*['"]${escapedObject}['"]`, 'iu'),
    ];
    const mutations = migrations.filter((name) => {
      const source = readFileSync(join(migrationsDir, name), 'utf8');
      return mutationPatterns.some((pattern) => pattern.test(source));
    });
    assert.equal(mutations.at(-1), definition.latestMutationFile, `${definition.object}: migration posterior exige recatalogacao`);

    for (const expectedFile of definition.files) {
      const filePath = join(migrationsDir, expectedFile.name);
      assert.ok(existsSync(filePath), `${definition.object}: migration ausente ${expectedFile.name}`);
      const source = readFileSync(filePath, 'utf8').toLowerCase();
      for (const expected of expectedFile.contains) {
        assert.ok(source.includes(expected.toLowerCase()), `${definition.object}: ${expectedFile.name} sem ${expected}`);
      }
      assert.match(contract, new RegExp(expectedFile.name.replaceAll('.', '\\.'), 'u'));
    }
  }
});

test('regressoes do detector delimitam a cadeia e contam select apos escrita', () => {
  const outraQuery = `supabase.from('aluno_presenca').update({ status: 'x' });\n+    supabase.from('outra').select('*');`;
  assert.equal(directReadContexts(outraQuery).length, 0);

  const returning = `supabase.from('aluno_presenca').upsert({ id: 1 }).select('id');`;
  assert.equal(directReadContexts(returning).length, 1);

  const builderSeparado = `const query = supabase.from('aluno_presenca');\nquery.select('*');`;
  assert.equal(directReadContexts(builderSeparado).length, 1);
});
