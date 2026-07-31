import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260730205500_conciliacao_experimentais_snapshot_ativo.sql';
const requirePostgres = process.env.COMERCIAL_EXP_REQUIRE_POSTGRES === '1';

function read(path) {
  assert.equal(existsSync(path), true, `${path} deve existir`);
  return readFileSync(path, 'utf8');
}

function psql(containerName, input) {
  return spawnSync(
    'docker',
    [
      'exec',
      '--interactive',
      containerName,
      'psql',
      '--no-psqlrc',
      '--set',
      'ON_ERROR_STOP=1',
      '--username',
      'postgres',
      '--dbname',
      'postgres',
    ],
    { encoding: 'utf8', input },
  );
}

test('migration PostgreSQL da conciliacao vigente existe', () => {
  read(migrationPath);
});

test(
  'conciliacao usa snapshot ativo e preserva reagendamento, P21, P22 e P23',
  { skip: !requirePostgres, timeout: 60_000 },
  () => {
    const dockerVersion = spawnSync(
      'docker',
      ['version', '--format', '{{.Server.Version}}'],
      { encoding: 'utf8' },
    );
    assert.equal(
      dockerVersion.status,
      0,
      `Docker/PostgreSQL obrigatorio indisponivel:\n${dockerVersion.stderr}`,
    );

    const image =
      process.env.COMERCIAL_EXP_POSTGRES_IMAGE || 'postgres:17-alpine';
    const imageInspection = spawnSync('docker', ['image', 'inspect', image], {
      encoding: 'utf8',
    });
    assert.equal(
      imageInspection.status,
      0,
      `imagem PostgreSQL obrigatoria ausente (${image}):\n${imageInspection.stderr}`,
    );

    const containerName = `la-conciliacao-exp-${process.pid}-${Date.now()}`;
    const started = spawnSync(
      'docker',
      [
        'run',
        '--detach',
        '--rm',
        '--name',
        containerName,
        '--env',
        'POSTGRES_PASSWORD=conciliacao-exp',
        image,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(started.status, 0, `nao iniciou PostgreSQL:\n${started.stderr}`);

    try {
      let ready = false;
      let consecutiveReadyChecks = 0;
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const readiness = spawnSync(
          'docker',
          [
            'exec',
            containerName,
            'pg_isready',
            '--username',
            'postgres',
            '--dbname',
            'postgres',
          ],
          { encoding: 'utf8' },
        );
        if (readiness.status === 0) {
          consecutiveReadyChecks += 1;
          if (consecutiveReadyChecks >= 3) {
            ready = true;
            break;
          }
        } else {
          consecutiveReadyChecks = 0;
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
      }
      assert.equal(ready, true, 'PostgreSQL da fixture nao ficou pronto');

      const schemaSql = String.raw`
        \set ON_ERROR_STOP on

        create role anon;
        create role authenticated;
        create role service_role;
        create schema auth;

        create function auth.uid()
        returns uuid
        language sql stable
        as $$
          select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
        $$;

        create function auth.role()
        returns text
        language sql stable
        as $$
          select nullif(current_setting('request.jwt.claim.role', true), '')
        $$;

        create table public.unidades (
          id uuid primary key,
          nome text not null,
          ativo boolean not null default true
        );
        create table public.usuarios (
          id integer primary key,
          auth_user_id uuid unique,
          perfil text not null,
          unidade_id uuid references public.unidades(id),
          ativo boolean
        );
        create table public.fixture_permissoes (
          usuario_id integer not null,
          codigo text not null,
          unidade_id uuid
        );
        create function public.usuario_tem_permissao(
          p_usuario_id integer,
          p_codigo text,
          p_unidade_id uuid
        )
        returns boolean
        language sql stable
        as $$
          select exists (
            select 1
            from public.fixture_permissoes p
            where p.usuario_id = p_usuario_id
              and p.codigo = p_codigo
              and (p.unidade_id is null or p.unidade_id = p_unidade_id)
          )
        $$;

        create table public.professores (
          id integer primary key,
          nome text
        );
        create table public.cursos (
          id integer primary key,
          nome text,
          is_projeto_banda boolean default false
        );
        create table public.tipos_matricula (
          id integer primary key,
          codigo text,
          conta_como_pagante boolean default true,
          entra_ticket_medio boolean default true
        );
        create table public.leads (
          id integer primary key,
          nome text,
          telefone text,
          status text,
          aluno_id integer,
          converteu boolean default false,
          data_conversao date
        );
        create table public.alunos (
          id integer primary key,
          unidade_id uuid not null references public.unidades(id),
          lead_origem_id integer,
          nome text,
          telefone text,
          responsavel_telefone text,
          status text,
          data_matricula date,
          is_segundo_curso boolean default false,
          valor_passaporte numeric default 0,
          valor_parcela numeric default 0,
          curso_id integer references public.cursos(id),
          tipo_matricula_id integer references public.tipos_matricula(id)
        );
        create table public.lead_experimentais (
          id integer primary key,
          lead_id integer references public.leads(id),
          emusys_lead_id integer,
          nome_aluno text,
          unidade_id uuid not null references public.unidades(id),
          data_experimental date,
          horario_experimental time,
          status text,
          aluno_id integer references public.alunos(id),
          professor_experimental_id integer references public.professores(id),
          curso_interesse_id integer references public.cursos(id)
        );
        create table public.lead_experimentais_decisoes_humanas (
          lead_experimental_id integer primary key references public.lead_experimentais(id),
          decisao text,
          incluir_denominador_exp_mat boolean,
          contar_conversao_exp_mat boolean,
          aluno_id_decidido integer references public.alunos(id),
          motivo text,
          decidido_por integer,
          decidido_em timestamptz
        );
        create table public.aulas_emusys (
          id integer primary key,
          categoria text,
          cancelada boolean default false
        );
        create table public.aluno_presenca (
          id integer primary key,
          aluno_id integer references public.alunos(id),
          aula_emusys_id integer references public.aulas_emusys(id),
          data_aula date,
          unidade_id uuid references public.unidades(id),
          status text
        );
        create table public.emusys_experimentais_raw (
          id bigserial primary key,
          unidade_id uuid not null references public.unidades(id),
          emusys_aula_id integer not null,
          participante_chave text,
          snapshot_ativo boolean not null default false,
          lead_experimental_id integer references public.lead_experimentais(id),
          lead_id integer references public.leads(id),
          aluno_id integer references public.alunos(id),
          data_aula date not null,
          horario_aula time,
          aluno_nome text,
          presenca_emusys text,
          situacao_operacional text,
          payload jsonb not null default '{}'::jsonb
        );

        create function public.get_conciliacao_experimentais_v2_legacy_p21_20260707(
          uuid, integer, integer, text, date
        )
        returns jsonb
        language sql stable
        as $$ select '{}'::jsonb $$;
        create function public.get_conciliacao_experimentais_v2_legacy_p22_20260707(
          uuid, integer, integer, text, date
        )
        returns jsonb
        language sql stable
        as $$ select '{}'::jsonb $$;

        insert into public.unidades (id, nome) values
          ('11111111-1111-1111-1111-111111111111', 'Reagendamentos'),
          ('22222222-2222-2222-2222-222222222222', 'Presencas'),
          ('33333333-3333-3333-3333-333333333333', 'P21'),
          ('44444444-4444-4444-4444-444444444444', 'P22');
        insert into public.cursos (id, nome) values (1, 'Violao');
        insert into public.tipos_matricula (id, codigo) values (1, 'REGULAR');

        insert into public.leads (id, nome) values
          (1, 'Falta posterior'),
          (2, 'Cancelamento posterior'),
          (3, 'Mesmo dia posterior'),
          (4, 'Outra data posterior'),
          (5, 'Duas presencas reais');

        insert into public.lead_experimentais (
          id, lead_id, nome_aluno, unidade_id, data_experimental,
          horario_experimental, status
        ) values
          (101, 1, 'Falta posterior', '11111111-1111-1111-1111-111111111111', '2026-07-01', '10:00', 'experimental_realizada'),
          (102, 1, 'Falta posterior', '11111111-1111-1111-1111-111111111111', '2026-07-02', '10:00', 'experimental_faltou'),
          (103, 2, 'Cancelamento posterior', '11111111-1111-1111-1111-111111111111', '2026-07-03', '11:00', 'experimental_realizada'),
          (104, 2, 'Cancelamento posterior', '11111111-1111-1111-1111-111111111111', '2026-07-04', '11:00', 'experimental_cancelada'),
          (105, 3, 'Mesmo dia posterior', '11111111-1111-1111-1111-111111111111', '2026-07-05', '09:00', 'experimental_realizada'),
          (106, 3, 'Mesmo dia posterior', '11111111-1111-1111-1111-111111111111', '2026-07-05', '10:00', 'faltou'),
          (107, 4, 'Outra data posterior', '11111111-1111-1111-1111-111111111111', '2026-07-06', '12:00', 'experimental_realizada'),
          (108, 4, 'Outra data posterior', '11111111-1111-1111-1111-111111111111', '2026-07-07', '08:00', 'cancelada'),
          (201, 5, 'Duas presencas reais', '22222222-2222-2222-2222-222222222222', '2026-07-08', '09:00', 'experimental_realizada'),
          (202, 5, 'Duas presencas reais', '22222222-2222-2222-2222-222222222222', '2026-07-09', '09:00', 'experimental_realizada');

        insert into public.emusys_experimentais_raw (
          unidade_id, emusys_aula_id, participante_chave, snapshot_ativo,
          lead_experimental_id, data_aula, horario_aula, aluno_nome,
          presenca_emusys, situacao_operacional, payload
        ) values
          ('11111111-1111-1111-1111-111111111111', 102, 'lead:1', true, 102, '2026-07-02', '10:00', 'Falta posterior', 'ausente', 'faltou', '{"aluno":{"id_lead":"1"}}'),
          ('11111111-1111-1111-1111-111111111111', 104, 'lead:2', true, 104, '2026-07-04', '11:00', 'Cancelamento posterior', null, 'cancelada', '{"aluno":{"id_lead":"2"}}'),
          ('11111111-1111-1111-1111-111111111111', 106, 'lead:3', true, 106, '2026-07-05', '10:00', 'Mesmo dia posterior', 'ausente', 'faltou', '{"aluno":{"id_lead":"3"}}'),
          ('11111111-1111-1111-1111-111111111111', 108, 'lead:4', true, 108, '2026-07-07', '08:00', 'Outra data posterior', null, 'cancelada', '{"aluno":{"id_lead":"4"}}'),
          ('11111111-1111-1111-1111-111111111111', 99, 'lead:1', false, 101, '2026-07-01', '10:00', 'Historico duplicado A', 'presente', 'presente', '{"aluno":{"id_lead":"1"}}'),
          ('11111111-1111-1111-1111-111111111111', 98, 'lead:1', false, 101, '2026-07-01', '10:00', 'Historico duplicado B', 'presente', 'presente', '{"aluno":{"id_lead":"1"}}'),
          ('22222222-2222-2222-2222-222222222222', 201, 'lead:5:a', true, 201, '2026-07-08', '09:00', 'Duas presencas reais', 'presente', 'presente', '{"aluno":{"id_lead":"5"}}'),
          ('22222222-2222-2222-2222-222222222222', 202, 'lead:5:b', true, 202, '2026-07-09', '09:00', 'Duas presencas reais', 'presente', 'presente', '{"aluno":{"id_lead":"5"}}'),
          ('22222222-2222-2222-2222-222222222222', 200, 'lead:5:historico', false, 201, '2026-07-08', '09:00', 'Duplicata inativa', 'presente', 'presente', '{"aluno":{"id_lead":"5"}}');

        insert into public.alunos (
          id, unidade_id, nome, telefone, status, data_matricula,
          valor_passaporte, valor_parcela, curso_id, tipo_matricula_id
        ) values
          (301, '33333333-3333-3333-3333-333333333333', 'P21 Comercial', '301', 'ativo', '2026-07-10', 100, 100, 1, 1),
          (302, '33333333-3333-3333-3333-333333333333', 'P21 Fora Coorte', '302', 'ativo', '2026-07-11', 100, 0, 1, 1),
          (401, '44444444-4444-4444-4444-444444444444', 'P22 Comercial', '401', 'ativo', '2026-07-10', 100, 100, 1, 1),
          (402, '44444444-4444-4444-4444-444444444444', 'P22 Fora Coorte', '402', 'ativo', '2026-07-11', 100, 0, 1, 1);

        insert into public.emusys_experimentais_raw (
          unidade_id, emusys_aula_id, participante_chave, snapshot_ativo,
          aluno_id, data_aula, aluno_nome, presenca_emusys,
          situacao_operacional, payload
        )
        select
          '33333333-3333-3333-3333-333333333333',
          3000 + n,
          'p21:' || n,
          true,
          case n when 1 then 301 when 2 then 302 else null end,
          '2026-07-15',
          'P21 ' || n,
          'presente',
          'presente',
          jsonb_build_object('aluno', jsonb_build_object('id_lead', (3000 + n)::text))
        from generate_series(1, 10) n;

        insert into public.emusys_experimentais_raw (
          unidade_id, emusys_aula_id, participante_chave, snapshot_ativo,
          aluno_id, data_aula, aluno_nome, presenca_emusys,
          situacao_operacional, payload
        )
        select
          '44444444-4444-4444-4444-444444444444',
          4000 + n,
          'p22:' || n,
          true,
          case n when 1 then 401 when 2 then 402 else null end,
          '2026-07-15',
          'P22 ' || n,
          'presente',
          'presente',
          jsonb_build_object('aluno', jsonb_build_object('id_lead', (4000 + n)::text))
        from generate_series(1, 3) n;

        insert into public.usuarios (
          id, auth_user_id, perfil, unidade_id, ativo
        ) values (
          1,
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          'unidade',
          '11111111-1111-1111-1111-111111111111',
          true
        );
      `;
      const schema = psql(containerName, schemaSql);
      assert.equal(schema.status, 0, `fixture schema falhou:\n${schema.stderr}`);

      const applied = psql(containerName, read(migrationPath));
      assert.equal(applied.status, 0, `migration falhou:\n${applied.stderr}`);

      const assertionsSql = String.raw`
        \set ON_ERROR_STOP on

        do $checks$
        declare
          v_result jsonb;
        begin
          v_result := public.get_conciliacao_experimentais_snapshot_v1(
            '11111111-1111-1111-1111-111111111111', 2026, 7, 'mensal', null
          );
          if (v_result #>> '{resumo,pendencias_taxa_exp_mat}')::integer <> 0
             or (v_result #>> '{resumo,ignoradas_por_reagendamento}')::integer <> 4
             or (v_result #>> '{resumo,raw_faltas_emusys}')::integer <> 2
             or (v_result #>> '{resumo,raw_canceladas_emusys}')::integer <> 2
          then
            raise exception 'reagendamentos ativos divergiram: %', v_result->'resumo';
          end if;

          v_result := public.get_conciliacao_experimentais_snapshot_v1(
            '22222222-2222-2222-2222-222222222222', 2026, 7, 'mensal', null
          );
          if (v_result #>> '{resumo,denominador_taxa_exp_mat}')::integer <> 2
             or (v_result #>> '{resumo,experimentais_realizadas_confirmadas}')::integer <> 2
             or (v_result #>> '{resumo,ignoradas_por_reagendamento}')::integer <> 0
          then
            raise exception 'presencas legitimas ou raw inativo divergiram: %', v_result->'resumo';
          end if;

          v_result := public.get_conciliacao_experimentais_v2(
            '33333333-3333-3333-3333-333333333333', 2026, 7, 'mensal', null
          );
          if (v_result #>> '{resumo,denominador_taxa_exp_mat}')::integer <> 10
             or (v_result #>> '{resumo,conversoes_exp_mat_canonicas}')::integer <> 1
             or (v_result #>> '{resumo,conversoes_exp_mat_original_p21}')::integer <> 2
          then
            raise exception 'cap P21 divergiu: %', v_result->'resumo';
          end if;

          v_result := public.get_conciliacao_experimentais_v2(
            '44444444-4444-4444-4444-444444444444', 2026, 7, 'mensal', null
          );
          if (v_result #>> '{resumo,denominador_taxa_exp_mat}')::integer <> 2
             or (v_result #>> '{resumo,conversoes_exp_mat_canonicas}')::integer <> 2
             or (v_result #>> '{resumo,duplicidades_raw_corrigidas_p22}')::integer <> 1
             or v_result #>> '{fonte_taxa_exp_mat,snapshot}' <> 'snapshot_ativo_p24'
          then
            raise exception 'deduplicacao P22 ou fonte P24 divergiu: %', v_result;
          end if;
        end;
        $checks$;

        select set_config(
          'request.jwt.claim.sub',
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          false
        );
        select set_config('request.jwt.claim.role', 'authenticated', false);
        set session authorization authenticated;
        select public.get_conciliacao_experimentais_v2(
          '11111111-1111-1111-1111-111111111111', 2026, 7, 'mensal', null
        );
        do $acl$
        begin
          begin
            perform public.get_conciliacao_experimentais_snapshot_v1(
              '11111111-1111-1111-1111-111111111111', 2026, 7, 'mensal', null
            );
            raise exception 'nucleo privado ficou acessivel';
          exception
            when insufficient_privilege then null;
          end;
          begin
            perform public.get_conciliacao_experimentais_v2(
              '22222222-2222-2222-2222-222222222222', 2026, 7, 'mensal', null
            );
            raise exception 'unidade fora do escopo foi aceita';
          exception
            when insufficient_privilege then null;
          end;
        end;
        $acl$;
        reset session authorization;

        set session authorization anon;
        do $anon$
        begin
          begin
            perform public.get_conciliacao_experimentais_v2(
              '11111111-1111-1111-1111-111111111111', 2026, 7, 'mensal', null
            );
            raise exception 'anon acessou a fachada';
          exception
            when insufficient_privilege then null;
          end;
        end;
        $anon$;
        reset session authorization;
      `;
      const asserted = psql(containerName, assertionsSql);
      assert.equal(
        asserted.status,
        0,
        `contrato PostgreSQL da conciliacao falhou:\n${asserted.stderr}`,
      );
    } finally {
      spawnSync('docker', ['rm', '--force', containerName], {
        encoding: 'utf8',
      });
    }
  },
);
