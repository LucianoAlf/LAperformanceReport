import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260909014500_financeiro_faturas_enriquecimento_em_lote.sql',
);
const unidade = '11111111-1111-1111-1111-111111111111';
const formaManual = '22222222-2222-2222-2222-222222222222';

const dockerWindows = path.join(
  process.env.LOCALAPPDATA || '',
  'Programs',
  'DockerDesktop',
  'resources',
  'bin',
  'docker.exe',
);
const dockerExecutable = process.platform === 'win32' && existsSync(dockerWindows)
  ? dockerWindows
  : 'docker';

function docker(args, input) {
  return spawnSync(dockerExecutable, args, {
    input,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
}

function psql(container, sql) {
  return docker([
    'exec', '-i', container,
    'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres', '-qAt',
  ], sql);
}

async function waitForPostgres(container) {
  let probesEstaveis = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (psql(container, 'select 1;').status === 0) {
      probesEstaveis += 1;
      if (probesEstaveis >= 2) return;
    } else {
      probesEstaveis = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL da fixture financeira nao iniciou a tempo');
}

const fixtureSql = String.raw`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;

  create table public.emusys_matriculas_estado_atual (
    unidade_id uuid not null,
    emusys_matricula_id bigint not null,
    emusys_aluno_id bigint,
    payload_snapshot jsonb not null default '{}'::jsonb,
    updated_at timestamptz,
    primary key (unidade_id, emusys_matricula_id)
  );
  create table public.alunos (
    id integer primary key,
    unidade_id uuid not null,
    arquivado_em timestamptz,
    emusys_matricula_id text,
    emusys_student_id text,
    nome text,
    foto_url text,
    photo_url text
  );
  create table public.alunos_arquivados (
    id integer primary key,
    unidade_id uuid not null,
    emusys_matricula_id text,
    emusys_student_id text,
    nome text,
    foto_url text,
    photo_url text
  );
  create table public.formas_pagamento (
    id uuid primary key,
    nome text not null
  );
  create table public.financeiro_fatura_reconciliacao_decisoes (
    id bigint primary key,
    unidade_id uuid not null,
    emusys_fatura_id bigint not null,
    tipo_decisao text not null,
    forma_pagamento_id uuid,
    decidido_em timestamptz
  );

  create function public.get_faturas_alunos_financeiro_v1_contrato_20260817(
    uuid, integer, integer, text, text, date
  ) returns jsonb language sql stable as $$
    select '{"items": [], "reconciliation": {"items": []}}'::jsonb
  $$;

  insert into public.emusys_matriculas_estado_atual (
    unidade_id, emusys_matricula_id, emusys_aluno_id, payload_snapshot, updated_at
  ) values
    ('${unidade}'::uuid, 100, 200,
      '{"aluno":{"nome":"Nome no estado"},"contrato_atual":{"forma_pagamento":"Boleto"}}'::jsonb,
      '2026-09-09T10:00:00Z'),
    ('${unidade}'::uuid, 101, 201,
      '{"aluno":{"nome":"Nao deve substituir"},"forma_pagamento":"PIX"}'::jsonb,
      '2026-09-09T10:00:00Z'),
    ('${unidade}'::uuid, 102, 202,
      '{"aluno":{"nome":"Nome do estado 2"}}'::jsonb,
      '2026-09-09T10:00:00Z');

  insert into public.alunos (
    id, unidade_id, emusys_matricula_id, emusys_student_id, nome, foto_url, photo_url
  ) values
    (10, '${unidade}'::uuid, '100', '200', 'Nome ativo', 'https://foto/ativa', null);
  insert into public.alunos_arquivados (
    id, unidade_id, emusys_matricula_id, emusys_student_id, nome, foto_url, photo_url
  ) values
    (20, '${unidade}'::uuid, '102', '202', 'Nome arquivado', null, 'https://foto/arquivada');
  insert into public.formas_pagamento (id, nome)
  values ('${formaManual}'::uuid, 'Transferencia manual');
  insert into public.financeiro_fatura_reconciliacao_decisoes (
    id, unidade_id, emusys_fatura_id, tipo_decisao, forma_pagamento_id, decidido_em
  ) values
    (1, '${unidade}'::uuid, 400, 'forma_pagamento_manual', '${formaManual}'::uuid, now());
`;

test('enriquecimento financeiro em lote preserva as precedencias em PostgreSQL real', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `la-faturas-lote-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres',
    'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const setup = psql(container, fixtureSql);
    assert.equal(setup.status, 0, setup.stderr || setup.stdout);

    const migration = readFileSync(migrationPath, 'utf8');
    const applied = psql(container, migration);
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);

    const query = psql(container, String.raw`
      select public.financeiro_enriquecer_faturas_itens_v1(
        '[
          {
            "unidade_id": "${unidade}",
            "emusys_fatura_id": 400,
            "emusys_matricula_id": 100,
            "emusys_student_id": 200,
            "aluno": {"id": "10", "nome": "Aluno nao vinculado"},
            "forma_pagamento": {"nome": null, "fonte": "ausente", "rotulo": "Forma nao informada"}
          },
          {
            "unidade_id": "${unidade}",
            "emusys_fatura_id": 401,
            "emusys_matricula_id": 101,
            "emusys_student_id": 201,
            "aluno": {"nome": "Nome preservado"},
            "forma_pagamento": {"nome": null, "fonte": "ausente", "rotulo": "Forma nao informada"}
          },
          {
            "unidade_id": "${unidade}",
            "emusys_fatura_id": 402,
            "emusys_matricula_id": 102,
            "emusys_student_id": 202,
            "aluno": {"nome": "Aluno nao vinculado"},
            "forma_pagamento": {"nome": "Cartao", "fonte": "origem", "rotulo": "Original"}
          }
        ]'::jsonb
      )::text;
    `);
    assert.equal(query.status, 0, query.stderr || query.stdout);
    const itens = JSON.parse(query.stdout.trim());

    assert.equal(itens[0].aluno.nome, 'Nome ativo');
    assert.equal(itens[0].aluno.foto_url, 'https://foto/ativa');
    assert.equal(itens[0].aluno.photo_url, null);
    assert.deepEqual(itens[0].forma_pagamento, {
      nome: 'Transferencia manual',
      fonte: 'manual',
      rotulo: 'Forma informada',
    });

    assert.equal(itens[1].aluno.nome, 'Nome preservado');
    assert.deepEqual(itens[1].forma_pagamento, {
      nome: 'PIX',
      fonte: 'emusys_matricula',
      rotulo: 'Forma prevista',
    });

    assert.equal(itens[2].aluno.nome, 'Nome arquivado');
    assert.equal(itens[2].aluno.foto_url, null);
    assert.equal(itens[2].aluno.photo_url, 'https://foto/arquivada');
    assert.deepEqual(itens[2].forma_pagamento, {
      nome: 'Cartao',
      fonte: 'origem',
      rotulo: 'Original',
    });
  } finally {
    docker(['stop', container]);
  }
});
