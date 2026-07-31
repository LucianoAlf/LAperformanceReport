import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260730204500_snapshot_experimentais_emusys.sql';
const baseMigrationPath =
  'supabase/migrations/20260622213000_emusys_experimentais_raw.sql';
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

test('migration PostgreSQL do snapshot existe', () => {
  read(migrationPath);
});

test(
  'snapshot vigente preserva historico, atomicidade e autorizacao por unidade',
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

    const containerName =
      `la-comercial-exp-${process.pid}-${Date.now()}`;
    const started = spawnSync(
      'docker',
      [
        'run',
        '--detach',
        '--rm',
        '--name',
        containerName,
        '--env',
        'POSTGRES_PASSWORD=comercial-exp',
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

        create function public.update_updated_at_column()
        returns trigger
        language plpgsql
        as $$
        begin
          new.updated_at := now();
          return new;
        end;
        $$;

        create table public.unidades (
          id uuid primary key,
          nome text not null
        );
        create table public.aulas_emusys (id integer primary key);
        create table public.professores (id integer primary key);
        create table public.cursos (id integer primary key);
        create table public.leads (id integer primary key);
        create table public.alunos (id integer primary key);
        create table public.lead_experimentais (id integer primary key);
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
          p_codigo character varying,
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

        insert into public.unidades (id, nome) values
          ('11111111-1111-1111-1111-111111111111', 'Barra'),
          ('22222222-2222-2222-2222-222222222222', 'Recreio');
        insert into public.aulas_emusys values (10), (11), (12);
        insert into public.professores values (1);
        insert into public.cursos values (1);
        insert into public.leads values (1), (2);
        insert into public.alunos values (1), (2);
        insert into public.lead_experimentais values (1), (2);

        insert into public.usuarios values
          (
            1,
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            'unidade',
            '11111111-1111-1111-1111-111111111111',
            true
          ),
          (
            2,
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            'admin',
            null,
            true
          ),
          (
            3,
            'cccccccc-cccc-cccc-cccc-cccccccccccc',
            'admin',
            null,
            true
          );
        insert into public.fixture_permissoes values
          (
            2,
            'comercial.ver',
            '22222222-2222-2222-2222-222222222222'
          ),
          (
            2,
            'comercial.ver',
            '99999999-9999-9999-9999-999999999999'
          );
      `;
      const prepared = psql(containerName, schemaSql);
      assert.equal(
        prepared.status,
        0,
        `fixture PostgreSQL falhou:\n${prepared.stderr}`,
      );

      const baseApplied = psql(containerName, read(baseMigrationPath));
      assert.equal(
        baseApplied.status,
        0,
        `migration base nao foi aplicada:\n${baseApplied.stderr}`,
      );

      const legacySql = String.raw`
        \set ON_ERROR_STOP on
        insert into public.emusys_experimentais_raw (
          raw_key,
          emusys_aula_id,
          aula_emusys_id,
          unidade_id,
          data_aula,
          horario_aula,
          aluno_nome,
          aluno_nome_normalizado,
          aluno_telefone,
          situacao_operacional,
          lead_id,
          aluno_id,
          lead_experimental_id,
          payload,
          updated_at
        ) values
          (
            'legacy-antigo',
            10,
            10,
            '11111111-1111-1111-1111-111111111111',
            '2026-07-10',
            '10:00',
            'Nome Antigo',
            'nome antigo',
            '21900000000',
            'presente',
            1,
            1,
            1,
            '{"aluno":{"id_lead":101},"aula":{"id":10}}',
            '2026-07-10 12:00:00+00'
          ),
          (
            'legacy-novo',
            10,
            10,
            '11111111-1111-1111-1111-111111111111',
            '2026-07-10',
            '10:00',
            'Nome Novo',
            'nome novo',
            '21911111111',
            'presente',
            null,
            null,
            null,
            '{"participante":{"id_lead":"101"},"aula":{"id":10}}',
            '2026-07-11 12:00:00+00'
          ),
          (
            'legacy-segunda-pessoa',
            10,
            10,
            '11111111-1111-1111-1111-111111111111',
            '2026-07-10',
            '10:00',
            'Outra Pessoa',
            'outra pessoa',
            '21922222222',
            'presente',
            2,
            2,
            2,
            '{"aluno":{"id_aluno":202},"aula":{"id":10}}',
            '2026-07-10 13:00:00+00'
          );
      `;
      const legacyInserted = psql(containerName, legacySql);
      assert.equal(
        legacyInserted.status,
        0,
        `fixture legada falhou:\n${legacyInserted.stderr}`,
      );

      const migrationApplied = psql(containerName, read(migrationPath));
      assert.equal(
        migrationApplied.status,
        0,
        `migration integral nao foi aplicada:\n${migrationApplied.stderr}`,
      );

      const assertionsSql = String.raw`
        \set ON_ERROR_STOP on
        do $fixture$
        declare
          v_result jsonb;
          v_operacional jsonb;
          v_before jsonb;
          v_caso jsonb;
        begin
          if (
            select count(*)
            from public.emusys_experimentais_raw
            where emusys_aula_id = 10
              and participante_chave = 'lead:101'
              and snapshot_ativo
          ) <> 1 then
            raise exception 'backfill nao manteve uma ativa entre duplicatas';
          end if;

          if (
            select count(*)
            from public.emusys_experimentais_raw
            where emusys_aula_id = 10
              and snapshot_ativo
          ) <> 2 then
            raise exception 'duas pessoas na mesma aula nao permaneceram ativas';
          end if;

          v_result := public.aplicar_snapshot_experimentais_emusys_v1(
            '00000000-0000-0000-0000-000000000001',
            '11111111-1111-1111-1111-111111111111',
            '2026-07-01',
            '2026-07-31',
            jsonb_build_array(
              jsonb_build_object(
                'raw_key',
                '11111111-1111-1111-1111-111111111111:10:lead:101:00000000-0000-0000-0000-000000000001',
                'unidade_id',
                '11111111-1111-1111-1111-111111111111',
                'execucao_id',
                '00000000-0000-0000-0000-000000000001',
                'emusys_aula_id',
                10,
                'participante_chave',
                'lead:101',
                'emusys_lead_id',
                101,
                'aluno_nome',
                'Nome Corrigido',
                'data_aula',
                '2026-07-10',
                'horario_aula',
                '10:00:00',
                'cancelada',
                false,
                'presenca_emusys',
                'presente',
                'situacao_operacional',
                'presente',
                'payload_bruto',
                '{
                  "aula":{"id":10},
                  "participante":{
                    "id_lead":101,
                    "telefone_aluno":"(21) 93333-3333"
                  }
                }'::jsonb
              )
            )
          );

          if (
            select row(aluno_nome, aluno_telefone, lead_id, aluno_id)
            from public.emusys_experimentais_raw
            where emusys_aula_id = 10
              and participante_chave = 'lead:101'
              and snapshot_ativo
          ) is distinct from row(
            'Nome Corrigido'::text,
            '(21) 93333-3333'::text,
            1::integer,
            1::integer
          ) then
            raise exception 'mudanca de nome ou preservacao de vinculo local falhou';
          end if;

          if exists (
            select 1
            from public.emusys_experimentais_raw
            where participante_chave = 'aluno:202'
              and snapshot_ativo
          ) then
            raise exception 'aula ausente do lote nao foi inativada';
          end if;

          perform public.aplicar_snapshot_experimentais_emusys_v1(
            '00000000-0000-0000-0000-000000000002',
            '11111111-1111-1111-1111-111111111111',
            '2026-07-01',
            '2026-07-31',
            jsonb_build_array(
              jsonb_build_object(
                'raw_key',
                '11111111-1111-1111-1111-111111111111:10:aluno:202:00000000-0000-0000-0000-000000000002',
                'unidade_id',
                '11111111-1111-1111-1111-111111111111',
                'execucao_id',
                '00000000-0000-0000-0000-000000000002',
                'emusys_aula_id',
                10,
                'participante_chave',
                'aluno:202',
                'emusys_aluno_id',
                202,
                'aluno_nome',
                'Outra Pessoa Retornou',
                'data_aula',
                '2026-07-10',
                'horario_aula',
                '10:00:00',
                'cancelada',
                false,
                'presenca_emusys',
                'presente',
                'situacao_operacional',
                'presente',
                'payload_bruto',
                '{
                  "aula":{"id":10},
                  "participante":{"id_lead":0,"id_aluno":202}
                }'::jsonb
              )
            )
          );

          if (
            select count(*)
            from public.emusys_experimentais_raw
            where participante_chave = 'aluno:202'
          ) <> 2
             or (
               select count(*)
               from public.emusys_experimentais_raw
               where participante_chave = 'aluno:202'
                 and snapshot_ativo
             ) <> 1 then
            raise exception 'reentrada nao preservou historico com uma nova ativa';
          end if;

          if (
            select row(lead_id, aluno_id, lead_experimental_id)
            from public.emusys_experimentais_raw
            where participante_chave = 'aluno:202'
              and snapshot_ativo
          ) is distinct from row(2::integer, 2::integer, 2::integer) then
            raise exception 'reentrada descartou vinculos locais conhecidos';
          end if;

          select jsonb_build_object(
            'raw', count(*),
            'ativas', count(*) filter (where snapshot_ativo),
            'execucoes', (
              select count(*)
              from public.emusys_experimentais_snapshot_execucoes
            )
          )
          into v_before
          from public.emusys_experimentais_raw;

          begin
            perform public.aplicar_snapshot_experimentais_emusys_v1(
              '00000000-0000-0000-0000-000000000003',
              '11111111-1111-1111-1111-111111111111',
              '2026-07-01',
              '2026-07-31',
              jsonb_build_array(
                jsonb_build_object(
                  'raw_key',
                  'invalida',
                  'unidade_id',
                  '22222222-2222-2222-2222-222222222222',
                  'execucao_id',
                  '00000000-0000-0000-0000-000000000003',
                  'emusys_aula_id',
                  11,
                  'participante_chave',
                  'lead:999',
                  'emusys_lead_id',
                  999,
                  'aluno_nome',
                  'Invalida',
                  'data_aula',
                  '2026-07-11',
                  'situacao_operacional',
                  'presente'
                )
              )
            );
            raise exception 'lote invalido foi aceito';
          exception
            when others then
              if sqlerrm = 'lote invalido foi aceito' then
                raise;
              end if;
          end;

          if v_before is distinct from (
            select jsonb_build_object(
              'raw', count(*),
              'ativas', count(*) filter (where snapshot_ativo),
              'execucoes', (
                select count(*)
                from public.emusys_experimentais_snapshot_execucoes
              )
            )
            from public.emusys_experimentais_raw
          ) then
            raise exception 'lote invalido nao fez rollback total';
          end if;

          for v_caso in
            select value
            from jsonb_array_elements(
              jsonb_build_array(
                jsonb_build_object(
                  'execucao_id',
                  '00000000-0000-0000-0000-000000000005',
                  'participante_chave',
                  'fallback:lead-ausente',
                  'payload_bruto',
                  '{"aula":{"id":11},"participante":{"id_lead":101}}'::jsonb
                ),
                jsonb_build_object(
                  'execucao_id',
                  '00000000-0000-0000-0000-000000000006',
                  'participante_chave',
                  'fallback:aluno-ausente',
                  'payload_bruto',
                  '{"aula":{"id":11},"participante":{"id_aluno":202}}'::jsonb
                ),
                jsonb_build_object(
                  'execucao_id',
                  '00000000-0000-0000-0000-000000000007',
                  'participante_chave',
                  'fallback:lead-invalido',
                  'payload_bruto',
                  '{"aula":{"id":11},"participante":{"id_lead":"abc"}}'::jsonb
                ),
                jsonb_build_object(
                  'execucao_id',
                  '00000000-0000-0000-0000-000000000008',
                  'participante_chave',
                  'fallback:aluno-overflow',
                  'payload_bruto',
                  '{
                    "aula":{"id":11},
                    "participante":{"id_aluno":"2147483648"}
                  }'::jsonb
                ),
                jsonb_build_object(
                  'execucao_id',
                  '00000000-0000-0000-0000-000000000010',
                  'participante_chave',
                  'lead:101',
                  'emusys_lead_id',
                  101,
                  'payload_bruto',
                  '{"aula":{"id":11},"participante":{}}'::jsonb
                ),
                jsonb_build_object(
                  'execucao_id',
                  '00000000-0000-0000-0000-000000000011',
                  'participante_chave',
                  'aluno:202',
                  'emusys_aluno_id',
                  202,
                  'payload_bruto',
                  '{"aula":{"id":11},"participante":{}}'::jsonb
                )
              )
            )
          loop
            begin
              perform public.aplicar_snapshot_experimentais_emusys_v1(
                (v_caso->>'execucao_id')::uuid,
                '11111111-1111-1111-1111-111111111111',
                '2026-07-01',
                '2026-07-31',
                jsonb_build_array(
                  jsonb_build_object(
                    'raw_key',
                    concat_ws(
                      ':',
                      '11111111-1111-1111-1111-111111111111',
                      '11',
                      v_caso->>'participante_chave',
                      v_caso->>'execucao_id'
                    ),
                    'unidade_id',
                    '11111111-1111-1111-1111-111111111111',
                    'execucao_id',
                    v_caso->>'execucao_id',
                    'emusys_aula_id',
                    11,
                    'emusys_lead_id',
                    v_caso->'emusys_lead_id',
                    'emusys_aluno_id',
                    v_caso->'emusys_aluno_id',
                    'participante_chave',
                    v_caso->>'participante_chave',
                    'aluno_nome',
                    'Identidade Invalida',
                    'data_aula',
                    '2026-07-12',
                    'situacao_operacional',
                    'presente',
                    'payload_bruto',
                    v_caso->'payload_bruto'
                  )
                )
              );
              raise exception 'fixture_identidade_invalida_aceita';
            exception
              when others then
                if sqlerrm = 'fixture_identidade_invalida_aceita' then
                  raise;
                end if;
                if sqlerrm not like '%SNAPSHOT_EXPERIMENTAIS_IDENTIDADE_%' then
                  raise exception 'erro de identidade nao controlado: %', sqlerrm;
                end if;
            end;
          end loop;

          if v_before is distinct from (
            select jsonb_build_object(
              'raw', count(*),
              'ativas', count(*) filter (where snapshot_ativo),
              'execucoes', (
                select count(*)
                from public.emusys_experimentais_snapshot_execucoes
              )
            )
            from public.emusys_experimentais_raw
          ) then
            raise exception 'identidade invalida nao fez rollback total';
          end if;

          v_result := public.aplicar_snapshot_experimentais_emusys_v1(
            '00000000-0000-0000-0000-000000000004',
            '11111111-1111-1111-1111-111111111111',
            '2026-07-01',
            '2026-07-17',
            '[]'::jsonb
          );

          if (v_result->>'linhas_inativadas')::integer <> 1
             or not exists (
               select 1
               from public.emusys_experimentais_snapshot_execucoes
               where id = '00000000-0000-0000-0000-000000000004'
                 and status = 'completo'
                 and linhas_recebidas = 0
                 and linhas_ativas = 0
                 and linhas_inativadas = 1
             ) then
            raise exception 'lote vazio nao inativou intervalo ou registrou execucao';
          end if;

          v_operacional := public.get_experimentais_emusys_operacional_v1(
            '11111111-1111-1111-1111-111111111111',
            2026,
            7,
            'mensal',
            '2026-07-30'
          );
          if (v_operacional #>> '{resumo,linhas_raw}')::integer <> 0
             or v_operacional #>> '{resumo,snapshot_status}' is not null then
            raise exception 'snapshot ate 31/07 cobriu indevidamente D+7: %',
              v_operacional;
          end if;

          perform public.aplicar_snapshot_experimentais_emusys_v1(
            '00000000-0000-0000-0000-000000000009',
            '11111111-1111-1111-1111-111111111111',
            '2026-07-01',
            '2026-08-06',
            '[]'::jsonb
          );

          v_operacional := public.get_experimentais_emusys_operacional_v1(
            '11111111-1111-1111-1111-111111111111',
            2026,
            7,
            'mensal',
            '2026-07-30'
          );
          if v_operacional #>> '{resumo,snapshot_execucao_id}'
               <> '00000000-0000-0000-0000-000000000009'
             or v_operacional #>> '{resumo,snapshot_status}' <> 'completo' then
            raise exception 'snapshot ate 06/08 nao cobriu D+7: %',
              v_operacional;
          end if;
        end;
        $fixture$;

        do $acl$
        begin
          if has_function_privilege(
            'anon',
            'public.aplicar_snapshot_experimentais_emusys_v1(uuid,uuid,date,date,jsonb)',
            'execute'
          ) or has_function_privilege(
            'authenticated',
            'public.aplicar_snapshot_experimentais_emusys_v1(uuid,uuid,date,date,jsonb)',
            'execute'
          ) or not has_function_privilege(
            'service_role',
            'public.aplicar_snapshot_experimentais_emusys_v1(uuid,uuid,date,date,jsonb)',
            'execute'
          ) then
            raise exception 'ACL da aplicacao privada divergiu';
          end if;

          if has_function_privilege(
            'anon',
            'public.pode_gerar_relatorio_comercial_v1(uuid)',
            'execute'
          ) or not has_function_privilege(
            'authenticated',
            'public.pode_gerar_relatorio_comercial_v1(uuid)',
            'execute'
          ) then
            raise exception 'ACL do guard comercial divergiu';
          end if;
        end;
        $acl$;

        select set_config(
          'request.jwt.claim.sub',
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          false
        );
        select set_config('request.jwt.claim.role', 'authenticated', false);
        set role authenticated;
        do $auth$
        begin
          if not public.pode_gerar_relatorio_comercial_v1(
            '11111111-1111-1111-1111-111111111111'
          ) then
            raise exception 'usuario de unidade nao acessou a propria unidade';
          end if;
          if public.pode_gerar_relatorio_comercial_v1(
            '22222222-2222-2222-2222-222222222222'
          ) then
            raise exception 'usuario de unidade acessou unidade fora do escopo';
          end if;
          perform public.get_experimentais_emusys_operacional_v1(
            '11111111-1111-1111-1111-111111111111',
            2026,
            7,
            'mensal',
            '2026-07-10'
          );
        end;
        $auth$;
        reset role;

        select set_config(
          'request.jwt.claim.sub',
          'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          false
        );
        set role authenticated;
        do $auth$
        begin
          if not public.pode_gerar_relatorio_comercial_v1(
            '22222222-2222-2222-2222-222222222222'
          ) then
            raise exception 'usuario permitido nao acessou a unidade autorizada';
          end if;
          if public.pode_gerar_relatorio_comercial_v1(
            '11111111-1111-1111-1111-111111111111'
          ) then
            raise exception 'usuario sem permissao acessou outra unidade';
          end if;
          if public.pode_gerar_relatorio_comercial_v1(
            '99999999-9999-9999-9999-999999999999'
          ) then
            raise exception 'usuario acessou unidade inexistente';
          end if;
        end;
        $auth$;
        reset role;

        select set_config(
          'request.jwt.claim.sub',
          'cccccccc-cccc-cccc-cccc-cccccccccccc',
          false
        );
        set role authenticated;
        do $auth$
        begin
          if public.pode_gerar_relatorio_comercial_v1(
            '11111111-1111-1111-1111-111111111111'
          ) then
            raise exception 'usuario sem permissao foi aceito';
          end if;
        end;
        $auth$;
        reset role;
      `;
      const asserted = psql(containerName, assertionsSql);
      assert.equal(
        asserted.status,
        0,
        `contrato PostgreSQL do snapshot falhou:\n${asserted.stderr}`,
      );
    } finally {
      spawnSync('docker', ['rm', '--force', containerName], {
        encoding: 'utf8',
      });
    }
  },
);
