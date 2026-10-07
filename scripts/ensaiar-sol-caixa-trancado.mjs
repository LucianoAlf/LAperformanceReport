#!/usr/bin/env node
// Ensaio da migration 20260925180000 (aluno trancado pode pagar) SEM gravar nada.
//
// Roda a migration dentro de uma transação e compara, para TODO aluno ativo das
// três unidades, quem `sol_caixa_casar_parcela` e `sol_caixa_responsavel_aluno`
// escolhem antes e depois. Termina SEMPRE em rollback.
//
//   node scripts/ensaiar-sol-caixa-trancado.mjs
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const RAIZ = process.cwd();
const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, '.env.local'), 'utf8').split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '').trim()]),
);
const url = fs.readFileSync(path.join(RAIZ, 'supabase/.temp/pooler-url'), 'utf8').trim()
  .replace('[YOUR-PASSWORD]', encodeURIComponent(env.SUPABASE_DB_PASSWORD))
  .replace('${POSTGRES_PASSWORD}', encodeURIComponent(env.SUPABASE_DB_PASSWORD));
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, statement_timeout: 900_000 });
await c.connect();

const RECREIO = '95553e96-971b-4590-a6eb-0201d013c14d';
const FOTO = (t) => `create temp table ${t} as
  select a.id, a.nome, a.unidade_id,
         sol_caixa_casar_parcela(a.unidade_id, a.nome, null, null) c,
         sol_caixa_responsavel_aluno(a.unidade_id, a.nome) r
  from alunos a where a.status ilike 'ativo%' and a.emusys_student_id is not null`;

try {
  await c.query('begin');
  await c.query("set local statement_timeout = '15min'");
  let t = Date.now();
  await c.query(FOTO('_antes'));
  const tAntes = Date.now() - t;

  await c.query(fs.readFileSync(path.join(RAIZ, 'supabase/migrations/20260925180000_sol_caixa_aluno_trancado_pode_pagar.sql'), 'utf8'));

  t = Date.now();
  await c.query(FOTO('_depois'));
  const tDepois = Date.now() - t;

  const { rows: [res] } = await c.query(`select jsonb_build_object(
    'testados', (select count(*) from _antes),
    'casar_aluno_mudou', (select count(*) from _antes x join _depois y using(id) where x.c->>'aluno_id' is distinct from y.c->>'aluno_id'),
    'casar_ok_mudou', (select count(*) from _antes x join _depois y using(id) where x.c->>'ok' is distinct from y.c->>'ok'),
    'resp_aluno_mudou', (select count(*) from _antes x join _depois y using(id) where x.r->>'aluno_nome' is distinct from y.r->>'aluno_nome'),
    'virou_ambiguo', (select count(*) from _antes x join _depois y using(id) where coalesce(x.c->>'ambiguo','false')='false' and y.c->>'ambiguo'='true'),
    'deixou_de_ser_ambiguo', (select count(*) from _antes x join _depois y using(id) where x.c->>'ambiguo'='true' and coalesce(y.c->>'ambiguo','false')='false'),
    'ambiguos_antes', (select count(*) from _antes where c->>'ambiguo'='true'),
    'ambiguos_depois', (select count(*) from _depois where c->>'ambiguo'='true'),
    'exemplos', (select jsonb_agg(jsonb_build_object('proprio', x.nome, 'antes', x.c->>'aluno_nome', 'depois', y.c->>'aluno_nome',
                      'amb_antes', x.c->>'ambiguo', 'amb_depois', y.c->>'ambiguo', 'resp_antes', x.r->>'aluno_nome', 'resp_depois', y.r->>'aluno_nome'))
                 from _antes x join _depois y using(id)
                 where x.c->>'aluno_id' is distinct from y.c->>'aluno_id' or x.r->>'aluno_nome' is distinct from y.r->>'aluno_nome'
                    or (coalesce(x.c->>'ambiguo','false')='false' and y.c->>'ambiguo'='true')),
    'bernardo', sol_caixa_casar_parcela($1,'Bernardo Neumann da Cunha',442.75,'09/2026'),
    'bernardo_resp', sol_caixa_responsavel_aluno($1,'Bernardo Neumann da Cunha'),
    'bernardo_pagador', sol_caixa_identificar_por_pagador($1,'Bruno Aires Cunha'),
    'menezes', sol_caixa_casar_parcela($1,'Bernardo da Silva Menezes',453.75,null)->>'aluno_nome',
    'bernardo_so_primeiro_nome', sol_caixa_casar_parcela($1,'Bernardo',442.75,null)
  ) r`, [RECREIO]);
  console.log(JSON.stringify({ ms_antes: tAntes, ms_depois: tDepois, ...res.r }, null, 2));
} catch (e) {
  console.error('ERRO NO ENSAIO:', e.message);
  process.exitCode = 1;
} finally {
  await c.query('rollback').catch(() => {});
  await c.end();
  console.error('rollback feito — nada gravado');
}
