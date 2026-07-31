import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260730204500_snapshot_experimentais_emusys.sql';
const baseMigrationPath =
  'supabase/migrations/20260622213000_emusys_experimentais_raw.sql';
const securityMigrationPath =
  'supabase/migrations/20260731161000_snapshot_experimentais_minimiza_payload.sql';
const admissionMigrationPath =
  'supabase/migrations/20260731162000_snapshot_experimentais_admissao_refresh.sql';
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

function psqlAsync(containerName, input) {
  const child = spawn(
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
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const completion = new Promise((resolve) => {
    child.on('close', (status) => {
      resolve({ status, stdout, stderr });
    });
  });
  child.stdin.end(input);
  return { completion };
}

function parseJsonPsql(stdout) {
  const line = stdout
    .split(/\r?\n/)
    .map((item) => item.trim())
    .findLast((item) => item.startsWith('{'));
  assert.ok(line, `psql nao retornou JSON:\n${stdout}`);
  return JSON.parse(line);
}

async function settledWithin(promise, timeoutMs) {
  return Promise.race([
    promise.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);
}

test('migration PostgreSQL do snapshot existe', () => {
  read(migrationPath);
});

test(
  'snapshot vigente preserva historico, atomicidade e autorizacao por unidade',
  { skip: !requirePostgres, timeout: 60_000 },
  async () => {
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
        create table public.fixture_unidade_fk_probe (
          id bigserial primary key,
          unidade_id uuid not null references public.unidades(id),
          marcador text not null
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

        select set_config('request.jwt.claim.role', 'service_role', false);

        insert into public.emusys_experimentais_raw (
          raw_key,
          emusys_aula_id,
          unidade_id,
          data_aula,
          aluno_nome,
          aluno_nome_normalizado,
          situacao_operacional,
          payload
        ) values (
          'legacy-rollout-sem-identidade',
          12,
          '11111111-1111-1111-1111-111111111111',
          '2026-07-18',
          'Writer Legado',
          'writer legado',
          'agendada',
          '{"aula":{"id":12}}'::jsonb
        )
        on conflict (raw_key) do update
        set aluno_nome = excluded.aluno_nome;

        do $rollout$
        begin
          if not exists (
            select 1
            from public.emusys_experimentais_raw
            where raw_key = 'legacy-rollout-sem-identidade'
              and participante_chave is null
              and snapshot_ativo is false
          ) then
            raise exception 'writer legado nao permaneceu compativel e inativo';
          end if;
        end;
        $rollout$;

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

          update public.emusys_experimentais_raw
          set
            aula_emusys_id = 10,
            aluno_telefone = '21987654321',
            responsavel_nome = 'Responsavel Lead',
            responsavel_telefone = '21911112222',
            professor_nome = 'Professor Lead',
            professor_id = 1,
            curso_nome = 'Curso Lead',
            curso_id = 1,
            lead_id = 1,
            aluno_id = 1,
            lead_experimental_id = 1
          where participante_chave = 'lead:101'
            and snapshot_ativo is true;

          update public.emusys_experimentais_raw
          set
            aula_emusys_id = 10,
            aluno_telefone = '21976543210',
            responsavel_nome = 'Responsavel Aluno',
            responsavel_telefone = '21933334444',
            professor_nome = 'Professor Aluno',
            professor_id = 1,
            curso_nome = 'Curso Aluno',
            curso_id = 1,
            lead_id = 2,
            aluno_id = 2,
            lead_experimental_id = 2
          where participante_chave = 'aluno:202'
            and snapshot_ativo is true;

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
                  "participante":{"id_lead":101}
                }'::jsonb
              )
            )
          );

          if (v_result->>'linhas_atualizadas')::integer <> 1
             or (v_result->>'linhas_versionadas')::integer <> 1
             or (v_result->>'linhas_inativadas')::integer <> 1 then
            raise exception 'contadores de versao/ausencia divergiram: %',
              v_result;
          end if;

          if (
            select count(*)
            from public.emusys_experimentais_raw
            where participante_chave = 'lead:101'
          ) <> 3
             or not exists (
               select 1
               from public.emusys_experimentais_raw
               where raw_key = 'legacy-novo'
                 and payload = '{
                   "participante":{"id_lead":"101"},
                   "aula":{"id":10}
                 }'::jsonb
                 and snapshot_execucao_id is null
                 and snapshot_ativo is false
                 and snapshot_inativado_em is not null
             ) then
            raise exception 'versao anterior de lead foi sobrescrita';
          end if;

          if (
            select row(
              aluno_nome,
              aluno_telefone,
              responsavel_nome,
              responsavel_telefone,
              professor_nome,
              professor_id,
              curso_nome,
              curso_id,
              aula_emusys_id,
              lead_id,
              aluno_id,
              lead_experimental_id
            )
            from public.emusys_experimentais_raw
            where emusys_aula_id = 10
              and participante_chave = 'lead:101'
              and snapshot_ativo
          ) is distinct from row(
            'Nome Corrigido'::text,
            '21987654321'::text,
            'Responsavel Lead'::text,
            '21911112222'::text,
            'Professor Lead'::text,
            1::integer,
            'Curso Lead'::text,
            1::integer,
            10::integer,
            1::integer,
            1::integer,
            1::integer
          ) then
            raise exception 'nova versao descartou enriquecimento local do lead';
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
            select row(
              aluno_telefone,
              responsavel_nome,
              responsavel_telefone,
              professor_nome,
              professor_id,
              curso_nome,
              curso_id,
              aula_emusys_id,
              lead_id,
              aluno_id,
              lead_experimental_id
            )
            from public.emusys_experimentais_raw
            where participante_chave = 'aluno:202'
              and snapshot_ativo
          ) is distinct from row(
            '21976543210'::text,
            'Responsavel Aluno'::text,
            '21933334444'::text,
            'Professor Aluno'::text,
            1::integer,
            'Curso Aluno'::text,
            1::integer,
            10::integer,
            2::integer,
            2::integer,
            2::integer
          ) then
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

          perform public.aplicar_snapshot_experimentais_emusys_v1(
            '00000000-0000-0000-0000-000000000012',
            '11111111-1111-1111-1111-111111111111',
            '2026-07-01',
            '2026-08-07',
            jsonb_build_array(
              jsonb_build_object(
                'raw_key',
                '11111111-1111-1111-1111-111111111111:12:lead:303:00000000-0000-0000-0000-000000000012',
                'unidade_id',
                '11111111-1111-1111-1111-111111111111',
                'execucao_id',
                '00000000-0000-0000-0000-000000000012',
                'emusys_aula_id',
                12,
                'participante_chave',
                'lead:303',
                'emusys_lead_id',
                303,
                'aluno_nome',
                'Ativa Barra',
                'data_aula',
                '2026-07-18',
                'situacao_operacional',
                'presente',
                'payload_bruto',
                '{"aula":{"id":12},"participante":{"id_lead":303}}'::jsonb
              )
            )
          );

          v_operacional := public.get_experimentais_emusys_operacional_v1(
            '11111111-1111-1111-1111-111111111111',
            2026,
            7,
            'mensal',
            '2026-09-15'
          );
          if v_operacional #>> '{resumo,snapshot_execucao_id}'
               <> '00000000-0000-0000-0000-000000000012'
             or v_operacional #>> '{resumo,snapshot_status}' <> 'completo' then
            raise exception 'consulta historica extrapolou D+7 da competencia: %',
              v_operacional;
          end if;

          v_operacional := public.get_experimentais_emusys_operacional_v1(
            null,
            2026,
            7,
            'mensal',
            '2026-09-15'
          );
          if jsonb_array_length(v_operacional->'por_unidade') <> 2
             or (v_operacional #>> '{resumo,realizadas_emusys}')::integer <> 1
             or v_operacional #>> '{resumo,snapshot_status}' is not null
             or v_operacional #>> '{resumo,snapshot_execucao_id}' is not null
             or (
               v_operacional #>> '{resumo,snapshot_atualizado_em}'
             )::timestamptz is distinct from (
               select concluido_em
               from public.emusys_experimentais_snapshot_execucoes
               where id = '00000000-0000-0000-0000-000000000012'
             )
             or (
               v_operacional #>> '{resumo,snapshot_linhas_inativas}'
             )::integer is distinct from (
               select linhas_inativadas
               from public.emusys_experimentais_snapshot_execucoes
               where id = '00000000-0000-0000-0000-000000000012'
             ) then
            raise exception 'agregado ficou fresco sem cobertura do Recreio: %',
              v_operacional;
          end if;

          perform public.aplicar_snapshot_experimentais_emusys_v1(
            '00000000-0000-0000-0000-000000000013',
            '22222222-2222-2222-2222-222222222222',
            '2026-07-01',
            '2026-08-07',
            jsonb_build_array(
              jsonb_build_object(
                'raw_key',
                '22222222-2222-2222-2222-222222222222:12:lead:404:00000000-0000-0000-0000-000000000013',
                'unidade_id',
                '22222222-2222-2222-2222-222222222222',
                'execucao_id',
                '00000000-0000-0000-0000-000000000013',
                'emusys_aula_id',
                12,
                'participante_chave',
                'lead:404',
                'emusys_lead_id',
                404,
                'aluno_nome',
                'Ativa Recreio',
                'data_aula',
                '2026-07-18',
                'situacao_operacional',
                'presente',
                'payload_bruto',
                '{"aula":{"id":12},"participante":{"id_lead":404}}'::jsonb
              )
            )
          );

          v_operacional := public.get_experimentais_emusys_operacional_v1(
            null,
            2026,
            7,
            'mensal',
            '2026-09-15'
          );
          if jsonb_array_length(v_operacional->'por_unidade') <> 2
             or (v_operacional #>> '{resumo,realizadas_emusys}')::integer <> 2
             or v_operacional #>> '{resumo,snapshot_status}' <> 'completo'
             or v_operacional #>> '{resumo,snapshot_execucao_id}' is not null
             or (
               v_operacional #>> '{resumo,snapshot_atualizado_em}'
             )::timestamptz is distinct from (
               select min(concluido_em)
               from public.emusys_experimentais_snapshot_execucoes
               where id in (
                 '00000000-0000-0000-0000-000000000012',
                 '00000000-0000-0000-0000-000000000013'
               )
             )
             or (
               v_operacional #>> '{resumo,snapshot_linhas_inativas}'
             )::integer is distinct from (
               select sum(linhas_inativadas)::integer
               from public.emusys_experimentais_snapshot_execucoes
               where id in (
                 '00000000-0000-0000-0000-000000000012',
                 '00000000-0000-0000-0000-000000000013'
               )
             ) then
            raise exception 'agregado completo publicou frescor incorreto: %',
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
        declare
          v_operacional jsonb;
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
          v_operacional := public.get_experimentais_emusys_operacional_v1(
            null,
            2026,
            7,
            'mensal',
            '2026-09-15'
          );
          if jsonb_array_length(v_operacional->'por_unidade') <> 1
             or v_operacional #>> '{por_unidade,0,unidade_id}'
               <> '11111111-1111-1111-1111-111111111111'
             or (v_operacional #>> '{resumo,realizadas_emusys}')::integer <> 1
          then
            raise exception 'perfil unidade agregou fora da Barra: %',
              v_operacional;
          end if;
          if (
            select count(*)
            from public.emusys_experimentais_raw
          ) <> 1
             or exists (
               select 1
               from public.emusys_experimentais_raw
               where unidade_id <> '11111111-1111-1111-1111-111111111111'
                  or snapshot_ativo is not true
             ) then
            raise exception 'RLS raw expos outra unidade ou versao inativa';
          end if;
          begin
            perform public.get_experimentais_emusys_operacional_v1(
              '22222222-2222-2222-2222-222222222222',
              2026,
              7,
              'mensal',
              '2026-07-10'
            );
            raise exception 'RPC permitiu Barra consultar Recreio';
          exception
            when insufficient_privilege then
              null;
          end;
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
        declare
          v_operacional jsonb;
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
          perform public.get_experimentais_emusys_operacional_v1(
            '22222222-2222-2222-2222-222222222222',
            2026,
            7,
            'mensal',
            '2026-07-10'
          );
          v_operacional := public.get_experimentais_emusys_operacional_v1(
            null,
            2026,
            7,
            'mensal',
            '2026-09-15'
          );
          if jsonb_array_length(v_operacional->'por_unidade') <> 1
             or v_operacional #>> '{por_unidade,0,unidade_id}'
               <> '22222222-2222-2222-2222-222222222222'
             or (v_operacional #>> '{resumo,realizadas_emusys}')::integer <> 1
          then
            raise exception 'admin agregou unidade sem permissao: %',
              v_operacional;
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
        declare
          v_operacional jsonb;
        begin
          if public.pode_gerar_relatorio_comercial_v1(
            '11111111-1111-1111-1111-111111111111'
          ) then
            raise exception 'usuario sem permissao foi aceito';
          end if;
          v_operacional := public.get_experimentais_emusys_operacional_v1(
            null,
            2026,
            7,
            'mensal',
            '2026-09-15'
          );
          if jsonb_array_length(v_operacional->'por_unidade') <> 0
             or (v_operacional #>> '{resumo,realizadas_emusys}')::integer <> 0
             or v_operacional #>> '{resumo,snapshot_status}' is not null then
            raise exception 'usuario sem permissao recebeu agregado: %',
              v_operacional;
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

      const pauseTrigger = psql(
        containerName,
        String.raw`
          \set ON_ERROR_STOP on
          create or replace function public.fixture_pause_snapshot_a()
          returns trigger
          language plpgsql
          as $$
          begin
            if new.snapshot_execucao_id =
              '00000000-0000-0000-0000-000000000020'::uuid then
              perform pg_sleep(5);
            end if;
            return new;
          end;
          $$;
          create or replace function public.fixture_wait_snapshot_a()
          returns boolean
          language plpgsql
          as $$
          begin
            for tentativa in 1..100 loop
              if exists (
                select 1
                from pg_stat_activity
                where application_name = 'snapshot-concurrency-a'
                  and wait_event = 'PgSleep'
              ) then
                return true;
              end if;
              perform pg_sleep(0.05);
            end loop;
            return false;
          end;
          $$;
          create trigger fixture_pause_snapshot_a
            before insert on public.emusys_experimentais_raw
            for each row
            execute function public.fixture_pause_snapshot_a();
        `,
      );
      assert.equal(
        pauseTrigger.status,
        0,
        `nao instalou coordenacao concorrente:\n${pauseTrigger.stderr}`,
      );

      const sessionA = psqlAsync(
        containerName,
        String.raw`
          \set ON_ERROR_STOP on
          set application_name = 'snapshot-concurrency-a';
          select set_config('request.jwt.claim.role', 'service_role', false);
          select public.aplicar_snapshot_experimentais_emusys_v1(
            '00000000-0000-0000-0000-000000000020',
            '11111111-1111-1111-1111-111111111111',
            '2026-09-01',
            '2026-09-30',
            jsonb_build_array(
              jsonb_build_object(
                'raw_key',
                '11111111-1111-1111-1111-111111111111:10:lead:601:00000000-0000-0000-0000-000000000020',
                'unidade_id',
                '11111111-1111-1111-1111-111111111111',
                'execucao_id',
                '00000000-0000-0000-0000-000000000020',
                'emusys_aula_id',
                10,
                'participante_chave',
                'lead:601',
                'emusys_lead_id',
                601,
                'aluno_nome',
                'Snapshot A',
                'data_aula',
                '2026-09-10',
                'situacao_operacional',
                'presente',
                'payload_bruto',
                '{"aula":{"id":10},"participante":{"id_lead":601}}'::jsonb
              )
            )
          );
        `,
      );

      const activity = psql(
        containerName,
        String.raw`
          \pset tuples_only on
          \pset format unaligned
          select public.fixture_wait_snapshot_a();
        `,
      );
      assert.equal(
        activity.status,
        0,
        `coordenacao da sessao A falhou:\n${activity.stderr}`,
      );
      assert.match(
        activity.stdout.trim(),
        /(?:^|\n)t$/,
        'sessao A nao entrou na pausa concorrente',
      );

      const sessionB = psqlAsync(
        containerName,
        String.raw`
          \set ON_ERROR_STOP on
          set application_name = 'snapshot-concurrency-b';
          select set_config('request.jwt.claim.role', 'service_role', false);
          select public.aplicar_snapshot_experimentais_emusys_v1(
            '00000000-0000-0000-0000-000000000021',
            '11111111-1111-1111-1111-111111111111',
            '2026-09-01',
            '2026-09-30',
            jsonb_build_array(
              jsonb_build_object(
                'raw_key',
                '11111111-1111-1111-1111-111111111111:11:lead:602:00000000-0000-0000-0000-000000000021',
                'unidade_id',
                '11111111-1111-1111-1111-111111111111',
                'execucao_id',
                '00000000-0000-0000-0000-000000000021',
                'emusys_aula_id',
                11,
                'participante_chave',
                'lead:602',
                'emusys_lead_id',
                602,
                'aluno_nome',
                'Snapshot B',
                'data_aula',
                '2026-09-11',
                'situacao_operacional',
                'presente',
                'payload_bruto',
                '{"aula":{"id":11},"participante":{"id_lead":602}}'::jsonb
              )
            )
          );
        `,
      );
      const sessionOtherUnit = psqlAsync(
        containerName,
        String.raw`
          \set ON_ERROR_STOP on
          set application_name = 'snapshot-concurrency-recreio';
          select set_config('request.jwt.claim.role', 'service_role', false);
          select public.aplicar_snapshot_experimentais_emusys_v1(
            '00000000-0000-0000-0000-000000000022',
            '22222222-2222-2222-2222-222222222222',
            '2026-09-01',
            '2026-09-30',
            jsonb_build_array(
              jsonb_build_object(
                'raw_key',
                '22222222-2222-2222-2222-222222222222:10:lead:701:00000000-0000-0000-0000-000000000022',
                'unidade_id',
                '22222222-2222-2222-2222-222222222222',
                'execucao_id',
                '00000000-0000-0000-0000-000000000022',
                'emusys_aula_id',
                10,
                'participante_chave',
                'lead:701',
                'emusys_lead_id',
                701,
                'aluno_nome',
                'Snapshot Recreio',
                'data_aula',
                '2026-09-10',
                'situacao_operacional',
                'presente',
                'payload_bruto',
                '{"aula":{"id":10},"participante":{"id_lead":701}}'::jsonb
              )
            )
          );
        `,
      );
      const sessionForeignKeyWrite = psqlAsync(
        containerName,
        String.raw`
          \set ON_ERROR_STOP on
          set application_name = 'snapshot-concurrency-fk-probe';
          insert into public.fixture_unidade_fk_probe (
            unidade_id,
            marcador
          ) values (
            '11111111-1111-1111-1111-111111111111',
            'durante-snapshot-a'
          );
        `,
      );

      const [
        sameUnitCompletedEarly,
        otherUnitCompletedEarly,
        foreignKeyWriteCompletedEarly,
      ] =
        await Promise.all([
          settledWithin(sessionB.completion, 750),
          settledWithin(sessionOtherUnit.completion, 1_500),
          settledWithin(sessionForeignKeyWrite.completion, 1_500),
        ]);
      const [resultA, resultB, resultOtherUnit, resultForeignKeyWrite] =
        await Promise.all([
          sessionA.completion,
          sessionB.completion,
          sessionOtherUnit.completion,
          sessionForeignKeyWrite.completion,
        ]);

      for (const [label, result] of [
        ['A', resultA],
        ['B', resultB],
        ['Recreio', resultOtherUnit],
        ['FK probe', resultForeignKeyWrite],
      ]) {
        assert.equal(
          result.status,
          0,
          `sessao concorrente ${label} falhou:\n${result.stderr}`,
        );
      }
      assert.equal(
        sameUnitCompletedEarly,
        false,
        'segunda aplicacao da mesma unidade nao aguardou a primeira',
      );
      assert.equal(
        otherUnitCompletedEarly,
        true,
        'aplicacao de outra unidade foi bloqueada indevidamente',
      );
      assert.equal(
        foreignKeyWriteCompletedEarly,
        true,
        'snapshot bloqueou escrita alheia com FK para a mesma unidade',
      );

      const concurrentState = psql(
        containerName,
        String.raw`
          \set ON_ERROR_STOP on
          do $concurrency$
          begin
            if (
              select array_agg(participante_chave order by participante_chave)
              from public.emusys_experimentais_raw
              where unidade_id =
                '11111111-1111-1111-1111-111111111111'
                and data_aula between '2026-09-01' and '2026-09-30'
                and snapshot_ativo is true
            ) is distinct from array['lead:602']::text[] then
              raise exception
                'estado Barra nao corresponde ao ultimo snapshot serializado';
            end if;
            if (
              select array_agg(participante_chave order by participante_chave)
              from public.emusys_experimentais_raw
              where unidade_id =
                '22222222-2222-2222-2222-222222222222'
                and data_aula between '2026-09-01' and '2026-09-30'
                and snapshot_ativo is true
            ) is distinct from array['lead:701']::text[] then
              raise exception 'estado Recreio foi afetado pela disputa da Barra';
            end if;
          end;
          $concurrency$;
        `,
      );
      assert.equal(
        concurrentState.status,
        0,
        `estado concorrente divergiu:\n${concurrentState.stderr}`,
      );

      const piiFixture = psql(
        containerName,
        String.raw`
          \set ON_ERROR_STOP on
          update public.emusys_experimentais_raw
          set payload = jsonb_build_object(
            'data_aula', data_aula,
            'horario_aula', horario_aula,
            'cancelada', false,
            'aula', jsonb_build_object(
              'id', emusys_aula_id,
              'professor_email', 'professor-sentinela@example.com'
            ),
            'participante', jsonb_build_object(
              'id_lead', emusys_lead_id,
              'id_aluno', emusys_aluno_id,
              'email', 'aluno-sentinela@example.com',
              'responsavel_telefone', '21999998888'
            ),
            'anotacoes', 'segredo-sentinela'
          )
          where id = (
            select min(id)
            from public.emusys_experimentais_raw
          );
        `,
      );
      assert.equal(
        piiFixture.status,
        0,
        `nao preparou payload PII sintetico:\n${piiFixture.stderr}`,
      );

      const securityMigrationApplied = psql(
        containerName,
        read(securityMigrationPath),
      );
      assert.equal(
        securityMigrationApplied.status,
        0,
        `hardening de payload/ACL falhou:\n${securityMigrationApplied.stderr}`,
      );

      const securityAssertions = psql(
        containerName,
        String.raw`
          \set ON_ERROR_STOP on

          do $payload$
          begin
            if exists (
              select 1
              from public.emusys_experimentais_raw r
              where r.payload <> jsonb_build_object(
                'schema_version', 1,
                'data_aula', r.data_aula,
                'horario_aula', r.horario_aula,
                'cancelada', false,
                'aula', jsonb_build_object('id', r.emusys_aula_id),
                'participante', jsonb_build_object(
                  'id_lead', r.emusys_lead_id,
                  'id_aluno', r.emusys_aluno_id
                )
              )
            ) then
              raise exception 'payload historico nao foi minimizado exatamente';
            end if;

            if exists (
              select 1
              from public.emusys_experimentais_raw r
              where r.payload::text like '%sentinela%'
                 or r.payload::text like '%responsavel_telefone%'
                 or r.payload::text like '%anotacoes%'
            ) then
              raise exception 'payload minimizado reteve PII sintetica';
            end if;
          end;
          $payload$;

          do $acl$
          begin
            if has_table_privilege(
              'authenticated',
              'public.emusys_experimentais_raw',
              'select'
            ) then
              raise exception 'authenticated reteve SELECT amplo';
            end if;
            if not has_column_privilege(
              'authenticated',
              'public.emusys_experimentais_raw',
              'id',
              'select'
            ) or not has_column_privilege(
              'authenticated',
              'public.emusys_experimentais_raw',
              'aluno_nome',
              'select'
            ) or has_column_privilege(
              'authenticated',
              'public.emusys_experimentais_raw',
              'payload',
              'select'
            ) or has_column_privilege(
              'authenticated',
              'public.emusys_experimentais_raw',
              'responsavel_telefone',
              'select'
            ) or not has_table_privilege(
              'service_role',
              'public.emusys_experimentais_raw',
              'select'
            ) then
              raise exception 'ACL por coluna divergiu';
            end if;
          end;
          $acl$;

          select set_config(
            'fixture.expected_barra_active',
            (
              select count(id)::text
              from public.emusys_experimentais_raw
              where unidade_id =
                '11111111-1111-1111-1111-111111111111'
                and snapshot_ativo is true
            ),
            false
          );
          select set_config(
            'request.jwt.claim.sub',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            false
          );
          select set_config('request.jwt.claim.role', 'authenticated', false);
          set role authenticated;
          do $auth$
          begin
            if (
              select count(id)
              from public.emusys_experimentais_raw
            ) <> current_setting('fixture.expected_barra_active')::integer then
              raise exception 'RLS deixou de isolar unidade/versao ativa';
            end if;

            perform
              id,
              aluno_nome,
              data_aula,
              horario_aula,
              situacao_operacional
            from public.emusys_experimentais_raw
            limit 1;

            begin
              perform payload
              from public.emusys_experimentais_raw
              limit 1;
              raise exception 'authenticated leu payload privado';
            exception
              when insufficient_privilege then
                null;
            end;
          end;
          $auth$;
          reset role;
        `,
      );
      assert.equal(
        securityAssertions.status,
        0,
        `contrato PostgreSQL de minimizacao falhou:\n${securityAssertions.stderr}`,
      );

      const admissionMigrationApplied = psql(
        containerName,
        read(admissionMigrationPath),
      );
      assert.equal(
        admissionMigrationApplied.status,
        0,
        `migration de admissao falhou:\n${admissionMigrationApplied.stderr}`,
      );

      const admissionCall = String.raw`
        \set ON_ERROR_STOP on
        \pset tuples_only on
        \pset format unaligned
        select public.admitir_refresh_snapshot_experimentais_v1(
          '11111111-1111-1111-1111-111111111111',
          '2026-10-01',
          '2026-10-31',
          'preview',
          '2026-07-31 13:02:00+00'
        )::text;
      `;
      const [admissionA, admissionB] = await Promise.all([
        psqlAsync(containerName, admissionCall).completion,
        psqlAsync(containerName, admissionCall).completion,
      ]);
      for (const [label, result] of [
        ['A', admissionA],
        ['B', admissionB],
      ]) {
        assert.equal(
          result.status,
          0,
          `admissao concorrente ${label} falhou:\n${result.stderr}`,
        );
      }
      const admissionPayloads = [admissionA, admissionB].map((result) =>
        parseJsonPsql(result.stdout)
      );
      assert.deepEqual(
        admissionPayloads.map((item) => item.acao).sort(),
        ['aguardar', 'atualizar'],
      );
      assert.equal(
        new Set(admissionPayloads.map((item) => item.admissao_id)).size,
        1,
        'concorrencia criou mais de uma admissao',
      );
      assert.equal(
        new Set(admissionPayloads.map((item) => item.snapshot_execucao_id))
          .size,
        1,
        'concorrencia criou mais de uma execucao',
      );

      const atualizarAdmission = admissionPayloads.find(
        (item) => item.acao === 'atualizar',
      );
      const admissionFinalized = psql(
        containerName,
        String.raw`
          \set ON_ERROR_STOP on
          insert into public.emusys_experimentais_snapshot_execucoes (
            id,
            unidade_id,
            data_inicio,
            data_fim,
            status,
            linhas_recebidas,
            linhas_ativas,
            linhas_inativadas,
            iniciado_em,
            concluido_em
          )
          values (
            '${atualizarAdmission.snapshot_execucao_id}',
            '11111111-1111-1111-1111-111111111111',
            '2026-10-01',
            '2026-10-31',
            'completo',
            0,
            0,
            0,
            clock_timestamp(),
            clock_timestamp()
          );

          select public.finalizar_refresh_snapshot_experimentais_v1(
            '${atualizarAdmission.admissao_id}',
            '${atualizarAdmission.snapshot_execucao_id}',
            true,
            null
          );

          do $acl$
          begin
            if has_function_privilege(
              'authenticated',
              'public.admitir_refresh_snapshot_experimentais_v1(uuid,date,date,text,timestamptz)',
              'execute'
            ) or has_function_privilege(
              'authenticated',
              'public.finalizar_refresh_snapshot_experimentais_v1(uuid,uuid,boolean,text)',
              'execute'
            ) or not has_function_privilege(
              'service_role',
              'public.admitir_refresh_snapshot_experimentais_v1(uuid,date,date,text,timestamptz)',
              'execute'
            ) or has_table_privilege(
              'authenticated',
              'public.emusys_experimentais_refresh_admissoes',
              'select'
            ) or not has_table_privilege(
              'service_role',
              'public.emusys_experimentais_refresh_admissoes',
              'select'
            ) then
              raise exception 'ACL da admissao divergiu';
            end if;
          end;
          $acl$;
        `,
      );
      assert.equal(
        admissionFinalized.status,
        0,
        `finalizacao/ACL da admissao falhou:\n${admissionFinalized.stderr}`,
      );

      const reused = psql(containerName, admissionCall);
      assert.equal(
        reused.status,
        0,
        `reuso da admissao falhou:\n${reused.stderr}`,
      );
      const reusedPayload = parseJsonPsql(reused.stdout);
      assert.equal(reusedPayload.acao, 'reutilizar');
      assert.equal(
        reusedPayload.snapshot_execucao_id,
        atualizarAdmission.snapshot_execucao_id,
      );

      const recovery = psql(
        containerName,
        String.raw`
          \set ON_ERROR_STOP on
          do $lease$
          declare
            v_primeira jsonb;
            v_recuperada jsonb;
            v_aplicada_sem_finalizacao jsonb;
            v_reusada_apos_crash jsonb;
            v_falha jsonb;
            v_bloqueada jsonb;
            v_retry_apos_lease jsonb;
          begin
            v_primeira :=
              public.admitir_refresh_snapshot_experimentais_v1(
                '11111111-1111-1111-1111-111111111111',
                '2026-10-01',
                '2026-10-31',
                'cron',
                '2026-07-31 13:02:00+00'
              );
            update public.emusys_experimentais_refresh_admissoes
            set lease_ate = '2026-07-31 13:01:59+00'
            where id = (v_primeira->>'admissao_id')::uuid;
            v_recuperada :=
              public.admitir_refresh_snapshot_experimentais_v1(
                '11111111-1111-1111-1111-111111111111',
                '2026-10-01',
                '2026-10-31',
                'cron',
                '2026-07-31 13:02:00+00'
              );

            if v_primeira->>'acao' <> 'atualizar'
               or v_recuperada->>'acao' <> 'atualizar'
               or v_primeira->>'snapshot_execucao_id' =
                 v_recuperada->>'snapshot_execucao_id'
               or (
                 select tentativas
                 from public.emusys_experimentais_refresh_admissoes
                 where id = (v_recuperada->>'admissao_id')::uuid
               ) <> 2 then
              raise exception 'lease expirado nao foi recuperado: % / %',
                v_primeira,
                v_recuperada;
            end if;

            if (
              public.admitir_refresh_snapshot_experimentais_v1(
                '22222222-2222-2222-2222-222222222222',
                '2026-10-01',
                '2026-10-31',
                'preview',
                '2026-07-31 13:02:00+00'
              )->>'acao'
            ) <> 'atualizar'
               or (
                 public.admitir_refresh_snapshot_experimentais_v1(
                   '11111111-1111-1111-1111-111111111111',
                   '2026-11-01',
                   '2026-11-30',
                   'preview',
                   '2026-07-31 13:02:00+00'
                 )->>'acao'
               ) <> 'atualizar' then
              raise exception 'unidade/intervalo independentes foram colididos';
            end if;

            v_aplicada_sem_finalizacao :=
              public.admitir_refresh_snapshot_experimentais_v1(
                '22222222-2222-2222-2222-222222222222',
                '2026-12-01',
                '2026-12-31',
                'cron',
                '2026-07-31 13:00:01+00'
              );
            insert into public.emusys_experimentais_snapshot_execucoes (
              id,
              unidade_id,
              data_inicio,
              data_fim,
              status,
              linhas_recebidas,
              linhas_ativas,
              linhas_inativadas,
              iniciado_em,
              concluido_em
            )
            values (
              (v_aplicada_sem_finalizacao->>'snapshot_execucao_id')::uuid,
              '22222222-2222-2222-2222-222222222222',
              '2026-12-01',
              '2026-12-31',
              'completo',
              0,
              0,
              0,
              '2026-07-31 13:00:02+00',
              '2026-07-31 13:00:03+00'
            );
            v_reusada_apos_crash :=
              public.admitir_refresh_snapshot_experimentais_v1(
                '22222222-2222-2222-2222-222222222222',
                '2026-12-01',
                '2026-12-31',
                'cron',
                '2026-07-31 13:03:00+00'
              );
            if v_reusada_apos_crash->>'acao' <> 'reutilizar'
               or v_reusada_apos_crash->>'snapshot_execucao_id'
                 <> v_aplicada_sem_finalizacao->>'snapshot_execucao_id'
               or (
                 select tentativas
                 from public.emusys_experimentais_refresh_admissoes
                 where id = (
                   v_reusada_apos_crash->>'admissao_id'
                 )::uuid
               ) <> 1 then
              raise exception 'snapshot aplicado antes do crash foi duplicado';
            end if;

            v_falha :=
              public.admitir_refresh_snapshot_experimentais_v1(
                '11111111-1111-1111-1111-111111111111',
                '2027-01-01',
                '2027-01-31',
                'preview',
                '2026-07-31 13:00:01+00'
              );
            perform public.finalizar_refresh_snapshot_experimentais_v1(
              (v_falha->>'admissao_id')::uuid,
              (v_falha->>'snapshot_execucao_id')::uuid,
              false,
              'FALHA_UPSTREAM'
            );
            v_bloqueada :=
              public.admitir_refresh_snapshot_experimentais_v1(
                '11111111-1111-1111-1111-111111111111',
                '2027-01-01',
                '2027-01-31',
                'preview',
                '2026-07-31 13:00:02+00'
              );
            if v_bloqueada->>'acao' <> 'bloqueado'
               or v_bloqueada->>'snapshot_execucao_id'
                 <> v_falha->>'snapshot_execucao_id'
               or (
                 select tentativas
                 from public.emusys_experimentais_refresh_admissoes
                 where id = (v_bloqueada->>'admissao_id')::uuid
               ) <> 1 then
              raise exception 'falha no bucket abriu retry imediato';
            end if;

            update public.emusys_experimentais_refresh_admissoes
            set lease_ate = '2026-07-31 13:00:00+00'
            where id = (v_falha->>'admissao_id')::uuid;
            v_retry_apos_lease :=
              public.admitir_refresh_snapshot_experimentais_v1(
                '11111111-1111-1111-1111-111111111111',
                '2027-01-01',
                '2027-01-31',
                'preview',
                '2026-07-31 13:00:02+00'
              );
            if v_retry_apos_lease->>'acao' <> 'atualizar'
               or v_retry_apos_lease->>'snapshot_execucao_id'
                 = v_falha->>'snapshot_execucao_id'
               or (
                 select tentativas
                 from public.emusys_experimentais_refresh_admissoes
                 where id = (
                   v_retry_apos_lease->>'admissao_id'
                 )::uuid
               ) <> 2 then
              raise exception 'falha nao recuperou depois do lease';
            end if;
          end;
          $lease$;
        `,
      );
      assert.equal(
        recovery.status,
        0,
        `recuperacao/particionamento da admissao falhou:\n${recovery.stderr}`,
      );
    } finally {
      spawnSync('docker', ['rm', '--force', containerName], {
        encoding: 'utf8',
      });
    }
  },
);
