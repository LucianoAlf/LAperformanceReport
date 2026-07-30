import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260729122000_estado_operacional_consumidores_vivos.sql';
const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, 'utf8')
  : '';

function section(start, end) {
  const from = migration.indexOf(start);
  assert.notEqual(from, -1, `secao ausente: ${start}`);
  const to = end ? migration.indexOf(end, from + start.length) : migration.length;
  return migration.slice(from, to === -1 ? migration.length : to);
}

test('cria uma projecao viva por aluno sem transformar estado desconhecido em ativo', () => {
  assert.ok(migration, 'migration de consumidores vivos ainda nao existe');
  const view = section(
    'create or replace view public.vw_alunos_estado_operacional_v131',
    'create or replace function public.get_kpis_alunos_admin_operacional',
  );

  assert.match(view, /unidade_id[\s\S]*emusys_matricula_id/i);
  assert.match(view, /raw_encontrado/i);
  assert.match(view, /status_local_resolvido/i);
  assert.match(view, /desconhecido/i);
  assert.match(view, /entra_base_ativa/i);
  assert.doesNotMatch(view, /coalesce\s*\(\s*e\.status_local_resolvido\s*,\s*a\.status/i);
});

test('alinha os tres calculadores vivos usados pelo wrapper executivo', () => {
  const objects = [
    [
      'get_kpis_alunos_admin_operacional',
      'create or replace function public.get_kpis_alunos_financeiro_vivo_canonico',
    ],
    [
      'get_kpis_alunos_financeiro_vivo_canonico',
      'create or replace function public.get_kpis_alunos_vinculos_vivo_canonico',
    ],
    [
      'get_kpis_alunos_vinculos_vivo_canonico',
      'create or replace function public.fn_aluno_entra_base_ativa_v131',
    ],
  ];

  for (const [object, end] of objects) {
    const body = section(`create or replace function public.${object}`, end);
    assert.match(body, /vw_alunos_estado_operacional_v131/i);
    assert.match(body, /entra_base_ativa\s*=\s*true/i);
    assert.doesNotMatch(body, /status\s+in\s*\(\s*'ativo'\s*,\s*'trancado'\s*\)/i);
  }
});

test('sucesso, fideliza e churn usam somente a populacao operacional ativa', () => {
  const sucesso = section(
    'create or replace view public.vw_aluno_sucesso_lista',
    'do $fideliza_v131$',
  );
  const fideliza = section(
    'do $fideliza_v131$',
    'create or replace function public.features_churn_alunos_ativos',
  );
  const churn = section(
    'create or replace function public.features_churn_alunos_ativos',
    'create or replace function public.get_trancamentos_atuais_canonicos',
  );

  assert.match(sucesso, /fn_aluno_entra_base_ativa_v131/i);
  for (const body of [fideliza, churn]) {
    assert.match(body, /vw_alunos_estado_operacional_v131/i);
    assert.match(body, /entra_base_ativa\s*=\s*true/i);
  }
});

test('trancados atuais saem em RPC dedicada e preservam o movimento historico', () => {
  const locks = section(
    'create or replace function public.get_trancamentos_atuais_canonicos',
  );

  assert.match(locks, /eh_trancamento_atual\s*=\s*true/i);
  assert.match(locks, /trancamento_motivo/i);
  assert.match(locks, /trancamento_data_inicial/i);
  assert.match(locks, /trancamento_data_final/i);
  assert.match(
    migration,
    /create or replace function public\.get_trancamentos_periodo_canonicos[\s\S]*movimentacoes_admin[\s\S]*tipo\s*=\s*'trancamento'/i,
  );
});

test('nao reescreve snapshots fechados e conserva grants necessarios ao frontend', () => {
  assert.doesNotMatch(migration, /(insert|update|delete|alter)\s+(table\s+)?public\.fechamento_mensal_snapshots/i);
  assert.doesNotMatch(migration, /(insert|update|delete|alter)\s+(table\s+)?public\.health_score_professor_v3_snapshots/i);
  assert.match(
    migration,
    /grant execute on function public\.get_trancamentos_atuais_canonicos[\s\S]*to authenticated, service_role/i,
  );

  const revokesAuthenticated = [
    ...migration.matchAll(
      /revoke all on function public\.([a-z0-9_]+)\([^;]*?\)\s+from\s+([^;]*authenticated[^;]*);/gi,
    ),
  ].map((match) => match[1]);

  assert.deepEqual(
    revokesAuthenticated,
    ['features_churn_alunos_ativos'],
    'authenticated so pode ser revogado do extrator interno de churn',
  );
});

test('carteiras de Fabio e LA Teacher permanecem ancoradas na jornada ativa', () => {
  const fabioMigration = readFileSync(
    'supabase/migrations/20260714190000_professores_identidade_emusys_canonica.sql',
    'utf8',
  );
  const appMigration = readFileSync(
    'supabase/migrations/20260709213803_la_teacher_009_carteira_fonte_unica.sql',
    'utf8',
  );

  assert.match(fabioMigration, /status_matricula\s*=\s*'ativa'/i);
  assert.match(appMigration, /vw_fabio_carteira_professor/i);
});

test('carteira operacional de professores consulta o estado canonico atual', () => {
  const carteiraMigrationPath =
    'supabase/migrations/20260730132000_carteira_professores_estado_operacional_v131.sql';
  const carteiraHardeningPath =
    'supabase/migrations/20260730133000_hardening_carteira_professores_v131.sql';
  assert.ok(
    existsSync(carteiraMigrationPath),
    'migration da carteira operacional de professores ainda nao existe',
  );
  assert.ok(
    existsSync(carteiraHardeningPath),
    'migration de search_path da carteira operacional ainda nao existe',
  );

  const carteiraMigration = readFileSync(carteiraMigrationPath, 'utf8');
  const carteiraHardening = readFileSync(carteiraHardeningPath, 'utf8');
  assert.match(
    carteiraMigration,
    /create or replace function public\.get_carteira_professores/i,
  );
  assert.match(carteiraMigration, /fn_aluno_entra_base_ativa_v131\s*\(/i);
  assert.doesNotMatch(
    carteiraMigration,
    /a\.status\s*=\s*'ativo'/i,
  );
  assert.match(
    carteiraMigration,
    /grant execute on function public\.get_carteira_professores\(uuid\)[\s\S]*authenticated/i,
  );
  assert.match(
    carteiraHardening,
    /alter function public\.get_carteira_professores\(uuid\)[\s\S]*set search_path\s*=\s*public/i,
  );
});


test('presenca e marcos carregam a populacao viva pela RPC canonica', () => {
  for (const path of ['supabase/functions/sync-presenca-emusys/index.ts', 'supabase/functions/marcos-jornada/index.ts']) {
    const source = readFileSync(path, 'utf8');
    assert.ok(source.includes(".rpc('get_alunos_ativos_atuais_canonicos'"), path + ' precisa usar a populacao operacional canonica');
    assert.ok(!source.includes(".in('status', ['ativo', 'aviso_previo'])"), path + ' nao pode reconstruir o denominador por status legado');
  }
});
