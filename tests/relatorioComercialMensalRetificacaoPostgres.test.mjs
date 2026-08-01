import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260801171624_retificar_comercial_mensal_multicurso.sql'),
  'utf8',
);

function docker(args, input) {
  return spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
}

function psql(container, sql) {
  return docker([
    'exec', '-i', container,
    'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres', '-At',
  ], sql);
}

async function aguardarPostgres(container) {
  for (let tentativa = 0; tentativa < 60; tentativa += 1) {
    const pronto = docker(['exec', container, 'pg_isready', '-U', 'postgres']);
    if (pronto.status === 0) {
      const consulta = docker([
        'exec', container, 'psql', '--no-psqlrc',
        '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1',
      ]);
      if (consulta.status === 0 && consulta.stdout.trim() === '1') return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL de teste nao iniciou a tempo');
}

test('retificacao multicurso compila, preserva snapshot e e idempotente', { timeout: 90_000 }, async (t) => {
  const versao = docker(['version', '--format', '{{.Server.Version}}']);
  if (versao.status !== 0) {
    t.skip('Docker indisponivel');
    return;
  }

  const container = `la-report-comercial-retificacao-${process.pid}-${Date.now()}`;
  const iniciado = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres',
    'postgres:17-alpine',
  ]);
  assert.equal(iniciado.status, 0, iniciado.stderr || iniciado.stdout);

  try {
    await aguardarPostgres(container);

    const schema = psql(container, `
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin;
      create schema auth;
      create extension if not exists pgcrypto;

      create function auth.role() returns text
      language sql stable as $$ select 'service_role'::text $$;
      create function auth.uid() returns uuid
      language sql stable as $$ select null::uuid $$;

      create table public.unidades (
        id uuid primary key,
        nome text not null,
        codigo text not null,
        hunter_nome text,
        ativo boolean not null
      );
      create table public.cursos (
        id bigint primary key,
        nome text,
        is_projeto_banda boolean
      );
      create table public.tipos_matricula (
        id bigint primary key,
        codigo text,
        conta_como_pagante boolean,
        entra_ticket_medio boolean
      );
      create table public.professores (id bigint primary key, nome text);
      create table public.formas_pagamento (id bigint primary key, nome text);
      create table public.canais_origem (id bigint primary key, nome text);
      create table public.alunos (
        id bigint primary key,
        unidade_id uuid,
        nome text,
        idade_atual integer,
        data_matricula date,
        telefone text,
        responsavel_telefone text,
        valor_passaporte numeric,
        valor_parcela numeric,
        curso_id bigint,
        professor_atual_id bigint,
        professor_experimental_id bigint,
        forma_pagamento_id bigint,
        canal_origem_id bigint,
        tipo_matricula_id bigint,
        is_segundo_curso boolean,
        emusys_lead_id text,
        status text,
        created_at timestamptz,
        arquivado_em timestamptz
      );
      create table public.leads (
        id bigint primary key,
        unidade_id uuid,
        aluno_id bigint,
        emusys_lead_id integer,
        canal_origem_id bigint,
        created_at timestamptz
      );
      create table public.fechamento_mensal_snapshots (
        id uuid primary key default gen_random_uuid(),
        unidade_id uuid,
        ano integer,
        mes integer,
        escopo text,
        dominio text,
        versao integer,
        status text,
        payload jsonb,
        payload_hash text
      );
      create table public.fechamento_mensal_auditoria (
        id uuid primary key default gen_random_uuid(),
        snapshot_id uuid,
        ano integer,
        mes integer,
        escopo text,
        unidade_id uuid,
        acao text,
        detalhes jsonb,
        actor_id uuid,
        created_at timestamptz default now()
      );

      create function public.hash_jsonb_canonico(p_payload jsonb)
      returns text language sql immutable as $$
        select case
          when p_payload#>>'{resumo,total_parcelas}' = '395.00'
            then 'e8d111092e57b40e34ab0b1856f9fc1434b1ecad798b7a8bbff0dff3c4001a8f'
          else encode(digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex')
        end
      $$;

      create function public.montar_relatorio_comercial_mensal_payload_v1(
        p_unidade_id uuid,
        p_ano integer,
        p_mes integer
      ) returns jsonb language sql stable as $$
        select payload
        from public.fechamento_mensal_snapshots
        where unidade_id = p_unidade_id
          and ano = p_ano and mes = p_mes
          and dominio = 'relatorio_comercial_mensal'
        limit 1
      $$;

      create function public.get_relatorio_mensal_canonico_v1(
        p_tipo text,
        p_unidade_id uuid,
        p_ano integer,
        p_mes integer
      ) returns jsonb language sql stable as $$
        select jsonb_build_object(
          'snapshot_id', id,
          'payload_hash', payload_hash,
          'versao', versao,
          'status', status,
          'payload', payload
        )
        from public.fechamento_mensal_snapshots
        where unidade_id = p_unidade_id
          and ano = p_ano and mes = p_mes
          and dominio = 'relatorio_comercial_mensal'
          and status = 'fechado'
        limit 1
      $$;

      insert into public.unidades values
        ('95553e96-971b-4590-a6eb-0201d013c14d', 'Recreio', 'REC', 'Daiana', true);
      insert into public.cursos values
        (1, 'Teclado', false),
        (2, 'Contrabaixo', false);
      insert into public.tipos_matricula values
        (1, 'REGULAR', true, true);
      insert into public.professores values
        (1, 'Professora Teclado'),
        (2, 'Professor Contrabaixo');
      insert into public.formas_pagamento values (1, 'Credito Recorrente');
      insert into public.canais_origem values (1, 'Ex-aluno');
      insert into public.alunos values
        (521, '95553e96-971b-4590-a6eb-0201d013c14d', 'Gabriela da Silva Machado', 13,
         '2026-07-17', '21999999999', null, 350, 395, 1, 1, 1, 1, 1, 1, false,
         null, 'ativo', '2026-07-17 12:00:00+00', null),
        (1863, '95553e96-971b-4590-a6eb-0201d013c14d', 'Gabriela da Silva Machado', 13,
         '2026-07-17', '21999999999', null, 0, 395, 2, 2, null, 1, null, 1, true,
         null, 'ativo', '2026-07-17 12:05:00+00', null);

      insert into public.fechamento_mensal_snapshots (
        id, unidade_id, ano, mes, escopo, dominio, versao, status, payload, payload_hash
      ) values (
        '664fe6ed-a900-4c6d-8650-a2e3f6811b82',
        '95553e96-971b-4590-a6eb-0201d013c14d',
        2026, 7, 'unidade', 'relatorio_comercial_mensal', 1, 'fechado',
        jsonb_build_object(
          'capturado_em', '2026-07-31T23:59:59+00:00',
          'resumo', jsonb_build_object(
            'leads', 10,
            'experimentais', 4,
            'faltas', 1,
            'visitas', 0,
            'matriculas', 1,
            'conversoes_exp_mat', 1,
            'total_passaportes', 350.00,
            'total_parcelas', 395.00,
            'ticket_medio_passaporte', 350.00,
            'ticket_medio_parcela', 395.00
          ),
          'matriculas', jsonb_build_array(jsonb_build_object(
            'id', 521,
            'nome', 'Gabriela da Silva Machado',
            'cursos', 'Teclado',
            'valor_passaporte', 350.00,
            'valor_parcela', 395.00,
            'parcelas', jsonb_build_array(395.00)
          )),
          'matriculas_por_curso', jsonb_build_array(
            jsonb_build_object('nome', 'Teclado', 'quantidade', 1)
          )
        ),
        'e8d111092e57b40e34ab0b1856f9fc1434b1ecad798b7a8bbff0dff3c4001a8f'
      );
    `);
    assert.equal(schema.status, 0, schema.stderr || schema.stdout);

    const aplicada = psql(container, migration);
    assert.equal(aplicada.status, 0, aplicada.stderr || aplicada.stdout);

    const verificacao = psql(container, `
      select jsonb_build_object(
        'snapshot_hash', s.payload_hash,
        'snapshot_hash_recalculado', public.hash_jsonb_canonico(s.payload),
        'snapshot_total', s.payload#>>'{resumo,total_parcelas}',
        'retificacoes', (select count(*) from public.fechamento_mensal_retificacoes),
        'auditorias', (select count(*) from public.fechamento_mensal_auditoria),
        'efetivo_total', r#>>'{payload,resumo,total_parcelas}',
        'efetivo_ticket', r#>>'{payload,resumo,ticket_medio_parcela}',
        'efetivo_cursos', r#>>'{payload,matriculas,0,cursos}',
        'efetivo_parcelas', r#>'{payload,matriculas,0,parcelas}',
        'retificado', r->>'retificado',
        'hash_original_exposto', r->>'snapshot_payload_hash'
      )
      from public.fechamento_mensal_snapshots s
      cross join lateral public.get_relatorio_mensal_canonico_v1(
        'comercial', s.unidade_id, s.ano, s.mes
      ) r
      where s.id = '664fe6ed-a900-4c6d-8650-a2e3f6811b82';
    `);
    assert.equal(verificacao.status, 0, verificacao.stderr || verificacao.stdout);
    const dados = JSON.parse(verificacao.stdout.trim());
    assert.equal(dados.snapshot_hash, 'e8d111092e57b40e34ab0b1856f9fc1434b1ecad798b7a8bbff0dff3c4001a8f');
    assert.equal(dados.snapshot_hash_recalculado, dados.snapshot_hash);
    assert.equal(dados.snapshot_total, '395.00');
    assert.equal(dados.retificacoes, 1);
    assert.equal(dados.auditorias, 1);
    assert.equal(dados.efetivo_total, '790.00');
    assert.equal(dados.efetivo_ticket, '790.00');
    assert.equal(dados.efetivo_cursos, 'Teclado e Contrabaixo');
    assert.deepEqual(dados.efetivo_parcelas, [395, 395]);
    assert.equal(dados.retificado, 'true');
    assert.equal(dados.hash_original_exposto, dados.snapshot_hash);

    const reaplicada = psql(container, `
      select public.aplicar_retificacao_relatorio_comercial_mensal_v1(
        '95553e96-971b-4590-a6eb-0201d013c14d', 2026, 7,
        'e8d111092e57b40e34ab0b1856f9fc1434b1ecad798b7a8bbff0dff3c4001a8f',
        'Reaplicacao idempotente da retificacao comercial mensal ja auditada.',
        '{}'::jsonb
      )->>'inserida';
      select count(*) from public.fechamento_mensal_retificacoes;
      select count(*) from public.fechamento_mensal_auditoria;
    `);
    assert.equal(reaplicada.status, 0, reaplicada.stderr || reaplicada.stdout);
    assert.deepEqual(reaplicada.stdout.trim().split(/\r?\n/), ['false', '1', '1']);

    const bloqueada = psql(container, `
      update public.fechamento_mensal_retificacoes set motivo = motivo || ' alterado';
    `);
    assert.notEqual(bloqueada.status, 0, 'UPDATE deveria ser bloqueado');
    assert.match(bloqueada.stderr, /RETIFICACAO_MENSAL_IMUTAVEL/);
  } finally {
    docker(['rm', '--force', container]);
  }
});
