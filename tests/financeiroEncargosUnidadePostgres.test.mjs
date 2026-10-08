import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// Pedido do Alf via Alfredo (08/10): juros de atraso por unidade —
// Barra 1%/mes, CG e Recreio 1,5%/mes (0,05%/dia), multa 2% nas tres.
// Roda a migration real num Postgres descartavel (Docker) e confere os
// casos reais medidos no Emusys + fallback + volta atras (rollback).

const root = process.cwd();
const migracao = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20261007200000_financeiro_encargos_unidade.sql'),
  'utf8',
);
const rollback = fs.readFileSync(
  path.join(root, 'supabase', 'rollbacks', '20261007200000_financeiro_encargos_unidade_ROLLBACK.sql'),
  'utf8',
);

const BARRA = '11111111-1111-1111-1111-111111111111';
const CG = '22222222-2222-2222-2222-222222222222';
const REC = '33333333-3333-3333-3333-333333333333';
const SEM_CFG = '44444444-4444-4444-4444-444444444444';

function bootstrapSql() {
  return `
    create role anon;
    create role authenticated;
    create role service_role;
    create role mila_acesso_restrito;
    create role fabio_agent;
    create role lia_acesso_restrito;
    create table public.unidades (id uuid primary key, codigo text, nome text, ativo boolean default true);
    insert into public.unidades (id, codigo) values
      ('${BARRA}', 'BARRA'),
      ('${CG}', 'CG'),
      ('${REC}', 'REC'),
      ('${SEM_CFG}', 'TESTE');
  `;
}

function docker(args, input, timeout = 120_000) {
  return spawnSync('docker', args, { input, encoding: 'utf8', timeout, maxBuffer: 10 * 1024 * 1024 });
}

function psql(container, sql) {
  return docker(['exec', '-i', container, 'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-At'], sql);
}

async function withPostgres(t, callback) {
  const probe = docker(['version', '--format', '{{.Server.Version}}'], undefined, 5_000);
  if (probe.status !== 0 || probe.error) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }
  const name = `la-encargos-${process.pid}-${Date.now()}`.toLowerCase();
  const started = docker(['run', '--rm', '--name', name, '-e', 'POSTGRES_PASSWORD=postgres', '-d', 'postgres:17-alpine']);
  assert.equal(started.status, 0, started.stderr || started.stdout);
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const logs = docker(['logs', name]);
      const initialized = /ready for start up/u.test(`${logs.stdout}\n${logs.stderr}`);
      if (initialized && psql(name, 'select 1;').status === 0) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!ready) {
      const finalProbe = psql(name, 'select 1;');
      const logs = docker(['logs', name]);
      assert.fail(['PostgreSQL de teste nao iniciou', finalProbe.stderr, logs.stdout, logs.stderr].filter(Boolean).join('\n'));
    }
    await callback(name);
  } finally {
    docker(['rm', '-f', name]);
  }
}

function calculo(container, args) {
  const r = psql(container, `select public.calcular_valores_fatura_financeiro_v1(${args})::text;`);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return JSON.parse(r.stdout.trim());
}

test('encargos por unidade: taxas reais, fallback e rollback', { timeout: 120_000 }, async (t) => {
  await withPostgres(t, async (container) => {
    assert.equal(psql(container, bootstrapSql()).status, 0);
    const applied = psql(container, migracao);
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);

    // 1) tabela semeada com as 3 unidades
    const seed = psql(container, `select codigo, multa_pct, mora_mensal_pct from public.financeiro_encargos_unidade e join public.unidades u on u.id = e.unidade_id order by codigo;`);
    assert.equal(seed.status, 0, seed.stderr || seed.stdout);
    assert.deepEqual(seed.stdout.trim().split('\n'), [
      'BARRA|0.0200|0.0100',
      'CG|0.0200|0.0150',
      'REC|0.0200|0.0150',
    ]);

    // 2) casos reais medidos no Emusys
    //    Barra 470 vencida ha 2 dias -> 9,40 multa + 0,31 mora = 9,71
    const barra = calculo(container, `470, 0, 0, date '2026-10-05', 'aberta', date '2026-10-07', '${BARRA}'::uuid`);
    assert.deepEqual({ multa: barra.multa, mora: barra.mora, valor_hoje: barra.valor_hoje }, { multa: 9.4, mora: 0.31, valor_hoje: 479.71 });
    //    CG 447 vencida ha 3 dias -> 8,94 + 0,67 = 9,61
    const cg = calculo(container, `447, 0, 0, date '2026-10-04', 'aberta', date '2026-10-07', '${CG}'::uuid`);
    assert.deepEqual({ multa: cg.multa, mora: cg.mora, valor_hoje: cg.valor_hoje }, { multa: 8.94, mora: 0.67, valor_hoje: 456.61 });
    //    Recreio 480 vencida ha 2 dias -> 9,60 + 0,48 = 10,08
    const rec = calculo(container, `480, 0, 0, date '2026-10-05', 'aberta', date '2026-10-07', '${REC}'::uuid`);
    assert.deepEqual({ multa: rec.multa, mora: rec.mora, valor_hoje: rec.valor_hoje }, { multa: 9.6, mora: 0.48, valor_hoje: 490.08 });

    // 3) fallback: unidade sem linha e chamada sem unidade caem no 1% (9,92)
    const semCfg = calculo(container, `480, 0, 0, date '2026-10-05', 'aberta', date '2026-10-07', '${SEM_CFG}'::uuid`);
    assert.equal(semCfg.valor_hoje, 489.92);
    const semUnidade = calculo(container, `480, 0, 0, date '2026-10-05', 'aberta', date '2026-10-07'`);
    assert.equal(semUnidade.valor_hoje, 489.92);
    const unidadeNull = calculo(container, `480, 0, 0, date '2026-10-05', 'aberta', date '2026-10-07', null`);
    assert.equal(unidadeNull.valor_hoje, 489.92);

    // 4) fatura paga e em dia nao mudam
    const paga = calculo(container, `447, 0, 0, date '2026-10-04', 'paga', date '2026-10-07', '${CG}'::uuid`);
    assert.equal(paga.valor_hoje, null);
    const emDia = calculo(container, `447, 0, 30, date '2026-10-20', 'aberta', date '2026-10-07', '${CG}'::uuid`);
    assert.equal(emDia.valor_hoje, 417);

    // 5) so uma assinatura viva (a de 7 args); STABLE, nao IMMUTABLE
    const sig = psql(container, `select count(*) from pg_proc where proname='calcular_valores_fatura_financeiro_v1';`);
    assert.equal(sig.stdout.trim(), '1');
    const vol = psql(container, `select provolatile from pg_proc where proname='calcular_valores_fatura_financeiro_v1';`);
    assert.equal(vol.stdout.trim(), 's');

    // 6) os 4 chamadores passam a unidade da linha na chamada
    for (const fn of [
      'get_faturas_alunos_financeiro_v1_base',
      'get_faturas_alunos_financeiro_v1_reconciliacao_base',
      'get_faturas_alunos_financeiro_v1_canonica_20260817',
      'get_inadimplencia_canonica_v4_base',
    ]) {
      const def = psql(container, `select pg_get_functiondef('public.${fn}'::regproc);`);
      assert.match(def.stdout, /calcular_valores_fatura_financeiro_v1\([^)]*unidade_id/s, `${fn} nao passa unidade`);
    }

    // 7) rollback: volta a assinatura de 6 args com taxa fixa e some a tabela
    const rb = psql(container, rollback);
    assert.equal(rb.status, 0, rb.stderr || rb.stdout);
    const antigo = calculo(container, `447, 0, 0, date '2026-10-04', 'aberta', date '2026-10-07'`);
    assert.equal(antigo.valor_hoje, 456.39); // 8,94 + 0,45 (1%): regra antiga
    const sig2 = psql(container, `select count(*) from pg_proc where proname='calcular_valores_fatura_financeiro_v1';`);
    assert.equal(sig2.stdout.trim(), '1');
    const vol2 = psql(container, `select provolatile from pg_proc where proname='calcular_valores_fatura_financeiro_v1';`);
    assert.equal(vol2.stdout.trim(), 'i');
    const tabela = psql(container, `select count(*) from information_schema.tables where table_name='financeiro_encargos_unidade';`);
    assert.equal(tabela.stdout.trim(), '0');
  });
});
