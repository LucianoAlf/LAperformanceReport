import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL(
  '../supabase/migrations/20260918023000_sol_repara_competencia_campo_grande_20260917.sql',
  import.meta.url,
), 'utf8');
const rollback = readFileSync(new URL(
  '../supabase/rollbacks/20260918023000_sol_repara_competencia_campo_grande_20260917_ROLLBACK.sql',
  import.meta.url,
), 'utf8');

function docker(args, input) {
  return spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
}

function psql(container, sql) {
  return docker([
    'exec', '-i', container,
    'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres', '-At',
  ], sql);
}

async function waitForPostgres(container) {
  let consecutive = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (psql(container, 'select 1;').status === 0) {
      consecutive += 1;
      if (consecutive >= 3) return;
    } else {
      consecutive = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL de teste nao iniciou');
}

test('contrato: reparo muda somente fatura_id e exige as duas competencias exatas', () => {
  assert.match(migration, /set fatura_id = v_fatura_correta_id/i);
  assert.match(migration, /competencia <> date '2026-10-01'/i);
  assert.match(migration, /competencia <> date '2026-09-01'/i);
  assert.match(migration, /valor_pago <> 397\.00/i);
  assert.doesNotMatch(migration, /set\s+(valor|forma_pagamento|categoria|descricao)\s*=/i);
  assert.match(rollback, /set fatura_id = v_fatura_anterior_id/i);
});

test('PostgreSQL 17: apply, idempotencia, rollback e preservacao financeira', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `sol-reparo-cg-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres',
    'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const setup = psql(container, String.raw`
      create table public.caixa_movimentacoes (
        id uuid primary key,
        caixa_diario_id uuid not null,
        unidade_id uuid not null,
        data_movimento date not null,
        ambiente text not null,
        tipo text not null,
        forma_pagamento text not null,
        categoria text not null,
        descricao text not null,
        valor numeric not null,
        responsavel text,
        criado_por text,
        created_at timestamptz not null,
        updated_at timestamptz not null,
        cartao_modalidade text,
        cartao_parcelas integer,
        link_pagamento text,
        aluno_id integer,
        fatura_id uuid
      );
      create table public.emusys_faturas (
        id uuid primary key,
        unidade_id uuid not null,
        emusys_student_id bigint not null,
        emusys_fatura_id bigint not null,
        competencia date not null,
        status text not null,
        valor_original numeric,
        valor_pago numeric,
        data_pagamento date
      );
      create table public.sol_caixa_operacoes_auditoria_v1 (
        id uuid primary key default gen_random_uuid(),
        operacao text not null,
        idempotency_key text not null unique,
        unidade_id uuid,
        caixa_diario_id uuid,
        movimentacao_id uuid,
        ator_papel text,
        motivo text,
        payload jsonb,
        antes jsonb,
        depois jsonb,
        resultado text,
        criado_em timestamptz default now()
      );
      insert into public.emusys_faturas values
        ('423cb4a7-bd1f-4edb-bf48-1c2d4c5d4781','2ec861f6-023f-4d7b-9927-3960ad8c2a92',3563,48238,'2026-10-01','aberta',447,null,null),
        ('1180b854-72bf-4352-a37a-7a777f9044aa','2ec861f6-023f-4d7b-9927-3960ad8c2a92',3563,48237,'2026-09-01','paga',447,397,'2026-09-16');
      insert into public.caixa_movimentacoes values (
        'c75e9dfa-93db-4336-9b50-2ab216593635',
        'd4813933-57c2-4ca7-a479-ea42443f762f',
        '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
        '2026-09-17','venda','entrada','pix','parcela',
        'Parcela 09/2026 do curso de Canto',397,'responsavel','operador',
        '2026-09-17T19:37:58Z','2026-09-17T19:38:24Z',
        null,null,null,1747,'423cb4a7-bd1f-4edb-bf48-1c2d4c5d4781'
      );
    `);
    assert.equal(setup.status, 0, setup.stderr || setup.stdout);

    const before = psql(container, `select md5((to_jsonb(m)-'fatura_id'-'updated_at')::text) from public.caixa_movimentacoes m;`);
    assert.equal(before.status, 0, before.stderr || before.stdout);

    const applied = psql(container, migration);
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);
    const appliedAgain = psql(container, migration);
    assert.equal(appliedAgain.status, 0, appliedAgain.stderr || appliedAgain.stdout);

    const repaired = psql(container, String.raw`
      select fatura_id,
             (select count(*) from public.sol_caixa_operacoes_auditoria_v1 where resultado='corrigido'),
             md5((to_jsonb(m)-'fatura_id'-'updated_at')::text)
        from public.caixa_movimentacoes m;
    `);
    assert.equal(repaired.status, 0, repaired.stderr || repaired.stdout);
    const repairedParts = repaired.stdout.trim().split('|');
    assert.equal(repairedParts[0], '1180b854-72bf-4352-a37a-7a777f9044aa');
    assert.equal(repairedParts[1], '1');
    assert.equal(repairedParts[2], before.stdout.trim());

    const rolledBack = psql(container, rollback);
    assert.equal(rolledBack.status, 0, rolledBack.stderr || rolledBack.stdout);
    const rolledBackAgain = psql(container, rollback);
    assert.equal(rolledBackAgain.status, 0, rolledBackAgain.stderr || rolledBackAgain.stdout);

    const restored = psql(container, String.raw`
      select fatura_id,
             (select count(*) from public.sol_caixa_operacoes_auditoria_v1 where resultado='rollback_concluido'),
             md5((to_jsonb(m)-'fatura_id'-'updated_at')::text)
        from public.caixa_movimentacoes m;
    `);
    assert.equal(restored.status, 0, restored.stderr || restored.stdout);
    const restoredParts = restored.stdout.trim().split('|');
    assert.equal(restoredParts[0], '423cb4a7-bd1f-4edb-bf48-1c2d4c5d4781');
    assert.equal(restoredParts[1], '1');
    assert.equal(restoredParts[2], before.stdout.trim());
  } finally {
    docker(['stop', container]);
  }
});
