import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260727122500_health_score_v3_cursos_pedagogicos.sql';
const inventoryPath =
  'scripts/inventory-health-score-v3-segmentos-sem-meta.sql';
const auditPath =
  'docs/auditorias/2026-07-27-health-score-v3-segmentos-pontuaveis-sem-meta.md';

function migration() {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);
  return readFileSync(migrationPath, 'utf8');
}

function functionBlock(sql, name) {
  const start = sql.toLowerCase().indexOf(
    `create or replace function public.${name}`,
  );
  assert.notEqual(start, -1, `${name} deve existir`);
  const rest = sql.slice(start);
  const next = rest.slice(1).search(
    /\ncreate\s+or\s+replace\s+function\s+public\./i,
  );
  return next === -1 ? rest : rest.slice(0, next + 1);
}

function withoutSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\r\n]*/g, '');
}

function runPsql(containerName, input) {
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
    { encoding: 'utf8', input, maxBuffer: 16 * 1024 * 1024 },
  );
}

test('Task 6A cria a classificacao canonica e marca somente o curso 45', () => {
  const sql = migration();

  assert.match(
    sql,
    /add\s+column\s+natureza_operacional\s+text\s+not\s+null\s+default\s+'pedagogica'/i,
  );
  assert.match(
    sql,
    /check\s*\(\s*natureza_operacional\s+in\s*\(\s*'pedagogica'\s*,\s*'comercial'\s*\)\s*\)/i,
  );
  assert.match(sql, /comment\s+on\s+column\s+public\.cursos\.natureza_operacional/i);
  assert.match(
    sql,
    /if\s+not\s+exists[\s\S]*from\s+public\.cursos[\s\S]*id\s*=\s*45/i,
  );
  assert.match(
    sql,
    /update\s+public\.cursos\s+set\s+natureza_operacional\s*=\s*'comercial'\s+where\s+id\s*=\s*45/i,
  );
  assert.doesNotMatch(
    sql,
    /update\s+public\.cursos\s+set\s+natureza_operacional\s*=\s*'comercial'\s*;/i,
  );
});

test('catalogo, faltantes e metricas segmentadas excluem curso comercial', () => {
  const sql = migration();
  const catalog = functionBlock(
    sql,
    'fn_health_score_professor_v3_catalogo_segmentos_v1',
  );
  const missing = functionBlock(
    sql,
    'fn_health_score_professor_v3_segmentos_faltantes_v1',
  );
  const segmented = functionBlock(
    sql,
    'get_health_score_professor_v3_metricas_segmentadas_v1',
  );

  assert.match(catalog, /p_config_id\s+uuid/i);
  assert.match(catalog, /curs[oa]\.natureza_operacional\s*=\s*'pedagogica'/i);
  assert.match(
    sql,
    /fn_health_score_professor_v3_catalogo_segmentos_v1\s*\(\s*\)\s*returns\s+jsonb/i,
  );
  assert.match(
    missing,
    /fn_health_score_professor_v3_catalogo_segmentos_v1\s*\(\s*p_config_id\s*\)/i,
  );
  assert.match(
    segmented,
    /metrica\s+not\s+in\s*\(\s*'media_turma'\s*,\s*'numero_alunos'\s*\)/i,
  );
  assert.match(
    segmented,
    /natureza_operacional\s*=\s*'pedagogica'/i,
  );
  assert.doesNotMatch(
    segmented,
    /metrica\s*=\s*'conversao'[\s\S]*natureza_operacional\s*=\s*'pedagogica'/i,
    'conversao nao pode depender da natureza pedagogica do curso experimental',
  );
});

test('salvar com cinco argumentos rejeita curso comercial e preserva ACL publica', () => {
  const sql = migration();
  const save = functionBlock(
    sql,
    'salvar_health_score_professor_v3_config_rascunho',
  );

  assert.match(save, /p_metas_segmentadas\s+jsonb/i);
  assert.match(save, /natureza_operacional\s*=\s*'comercial'/i);
  assert.match(save, /HEALTH_SCORE_V3_CONFIG_INVALIDA:[^']*curso comercial/i);
  assert.match(
    sql,
    /grant\s+execute\s+on\s+function\s+public\.salvar_health_score_professor_v3_config_rascunho\s*\(\s*uuid\s*,\s*date\s*,\s*text\s*,\s*jsonb\s*,\s*jsonb\s*\)\s+to\s+authenticated\s*,\s*service_role/i,
  );

  for (const helper of [
    'fn_health_score_professor_v3_catalogo_segmentos_v1',
    'fn_health_score_professor_v3_segmentos_faltantes_v1',
    'get_health_score_professor_v3_metricas_segmentadas_v1',
  ]) {
    assert.match(
      sql,
      new RegExp(
        `revoke\\s+all\\s+on\\s+function\\s+public\\.${helper}\\([\\s\\S]*?from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`,
        'i',
      ),
    );
  }
});

test('inventario SELECT-only registra a execucao observada e reproduzivel', () => {
  assert.equal(existsSync(inventoryPath), true, `${inventoryPath} deve existir`);
  assert.equal(existsSync(auditPath), true, `${auditPath} deve existir`);

  const inventory = readFileSync(inventoryPath, 'utf8');
  const executable = withoutSqlComments(inventory);
  const audit = readFileSync(auditPath, 'utf8');

  assert.doesNotMatch(
    executable,
    /\b(insert|update|delete|merge|truncate|alter|create|drop|call|do)\b/i,
  );
  for (const unidadeId of [
    '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
    '95553e96-971b-4590-a6eb-0201d013c14d',
    '368d47f5-2d88-4475-bc14-ba084a9a348e',
  ]) {
    assert.match(inventory, new RegExp(unidadeId, 'i'));
  }
  assert.match(inventory, /a\.status\s*=\s*'ativo'/i);
  assert.match(inventory, /a\.vigencia_fim\s+is\s+null/i);
  assert.match(inventory, /a\.confianca\s+in\s*\(\s*'alta'\s*,\s*'revisada'\s*\)/i);
  assert.match(inventory, /c\.natureza_operacional\s*=\s*'pedagogica'/i);
  assert.match(inventory, /m\.id\s+is\s+null/i);
  assert.match(inventory, /count\s*\(\s*distinct\s+a\.professor_id\s*\)/i);
  assert.match(inventory, /string_agg\s*\(\s*distinct\s+p\.nome/i);
  assert.match(inventory, /motivo_ausencia_meta/i);
  assert.doesNotMatch(inventory, /coalesce\s*\(\s*m\.[a-z_]+\s*,\s*0/i);
  assert.match(
    inventory,
    /select\s+c\.id\s+as\s+config_id[\s\S]*?from\s+public\.health_score_professor_v3_config_versoes\s+c[\s\S]*?;\s*with\s+unidades_alvo/i,
    'o primeiro result set deve identificar a configuracao mesmo se nao houver pendencias',
  );

  assert.match(audit, /inventory-health-score-v3-segmentos-sem-meta\.sql/i);
  assert.match(audit, /ambiente\/projeto:\s*ouqwbbermlzqqvtqwlul/i);
  assert.match(
    audit,
    /config_id:\s*4f34ac12-8a6a-4adc-9910-c60aebe2be89/i,
  );
  assert.match(audit, /config_versao:\s*4/i);
  assert.match(audit, /total_de_linhas:\s*0/i);
  assert.match(audit, /resultado:\s*aprovado para ativacao/i);
  assert.match(audit, /Barra\s*\|\s*0/i);
  assert.match(audit, /Campo Grande\s*\|\s*0/i);
  assert.match(audit, /Recreio\s*\|\s*0/i);
});

test(
  'fixture PostgreSQL prova curso 45 fora de carteira e media, com conversao intacta',
  { skip: !existsSync(migrationPath), timeout: 90_000 },
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
    const image = process.env.TASK6A_POSTGRES_IMAGE || 'postgres:17-alpine';
    const imageInspection = spawnSync('docker', ['image', 'inspect', image], {
      encoding: 'utf8',
    });
    assert.equal(
      imageInspection.status,
      0,
      `imagem PostgreSQL obrigatoria ausente (${image}):\n${imageInspection.stderr}`,
    );

    const containerName = `la-task6a-postgres-${process.pid}-${Date.now()}`;
    const started = spawnSync(
      'docker',
      [
        'run',
        '--detach',
        '--rm',
        '--name',
        containerName,
        '--env',
        'POSTGRES_PASSWORD=task6a',
        image,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(started.status, 0, `nao iniciou PostgreSQL:\n${started.stderr}`);

    try {
      let ready = false;
      let consecutiveReadyChecks = 0;
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const check = spawnSync(
          'docker',
          ['exec', containerName, 'pg_isready', '-U', 'postgres', '-d', 'postgres'],
          { encoding: 'utf8' },
        );
        if (check.status === 0) {
          consecutiveReadyChecks += 1;
          if (consecutiveReadyChecks >= 3) {
            ready = true;
            break;
          }
        } else {
          consecutiveReadyChecks = 0;
        }
      }
      assert.equal(ready, true, 'PostgreSQL da fixture nao ficou pronto');

      const fixture = String.raw`
        create role anon;
        create role authenticated;
        create role service_role;

        create table public.cursos (
          id integer primary key,
          nome text not null,
          is_projeto_banda boolean not null default false
        );
        create table public.unidades (id uuid primary key, nome text not null);
        create table public.health_score_professor_v3_config_versoes (
          id uuid primary key,
          versao integer not null,
          status text not null
        );
        create table public.health_score_professor_v3_config_metas_curso_modalidade (
          id uuid primary key,
          config_id uuid not null,
          unidade_id uuid not null,
          curso_id integer not null,
          modalidade text not null,
          estado text not null,
          capacidade_maxima numeric,
          meta_media_turma numeric,
          meta_carteira_curso numeric
        );
        create table public.emusys_disciplinas_catalogo (
          unidade_id uuid not null,
          emusys_disciplina_id integer not null,
          modalidade text not null,
          nome_emusys text,
          ultima_execucao_id uuid,
          sincronizado_em timestamptz,
          ativo_origem boolean
        );
        create table public.curso_emusys_depara (
          unidade_id uuid not null,
          emusys_disciplina_id integer not null,
          curso_id integer not null
        );
        create table public.emusys_professor_disciplinas (
          unidade_id uuid not null,
          emusys_disciplina_id integer not null,
          emusys_professor_id integer,
          ativo_origem boolean
        );
        create table public.fixture_metricas (
          metrica text not null,
          curso_id integer,
          curso_nome text
        );

        insert into public.cursos (id, nome) values
          (10, 'Piano'),
          (45, 'Aula Experimental');
        insert into public.unidades values
          ('368d47f5-2d88-4475-bc14-ba084a9a348e', 'Barra');
        insert into public.health_score_professor_v3_config_versoes values
          ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 3, 'ativa');
        insert into public.emusys_disciplinas_catalogo values
          ('368d47f5-2d88-4475-bc14-ba084a9a348e', 10, 'turma', 'Piano', null, now(), true),
          ('368d47f5-2d88-4475-bc14-ba084a9a348e', 45, 'turma', 'Experimental', null, now(), true);
        insert into public.curso_emusys_depara values
          ('368d47f5-2d88-4475-bc14-ba084a9a348e', 10, 10),
          ('368d47f5-2d88-4475-bc14-ba084a9a348e', 45, 45);
        insert into public.emusys_professor_disciplinas values
          ('368d47f5-2d88-4475-bc14-ba084a9a348e', 10, 1, true),
          ('368d47f5-2d88-4475-bc14-ba084a9a348e', 45, 1, true);
        insert into public.fixture_metricas values
          ('media_turma', 10, 'Piano'),
          ('numero_alunos', 10, 'Piano'),
          ('media_turma', 45, 'Aula Experimental'),
          ('numero_alunos', 45, 'Aula Experimental'),
          ('conversao', 45, 'Aula Experimental');

        create function public.get_health_score_professor_v3_metricas_segmentadas_v1(
          p_competencia date,
          p_config_id uuid,
          p_unidade_id uuid default null,
          p_periodicidade text default 'mensal'
        )
        returns table (
          metrica text, professor_id integer, professor_nome text,
          unidade_id uuid, competencia date, curso_id integer,
          curso_nome text, modalidade text, config_meta_segmento_id uuid,
          atribuicao_id uuid, atribuicao_formal boolean,
          atribuicao_pontuavel boolean, pessoas_unicas integer,
          pessoas_unicas_total numeric, pessoas_fechamentos integer,
          meses_com_base integer, meses_com_base_consolidado integer,
          meses_no_periodo integer, vinculos_ativos integer,
          turmas_elegiveis integer, ocupacoes_unicas integer,
          valor_observado numeric, capacidade_maxima numeric,
          meta_aplicada numeric, numerador numeric, denominador numeric,
          nota_segmento numeric, estado_base text, publicavel boolean,
          capacidade_excedida boolean, alertas_capacidade jsonb, fonte text,
          regra_versao text, linha_diagnostico boolean,
          dados_sem_resolucao integer, estados_resolucao jsonb,
          divergencias jsonb, detalhes jsonb
        )
        language sql stable security definer
        set search_path = public, pg_temp
        as $stub$
          select
            f.metrica, 1, 'Professor', u.id, p_competencia, f.curso_id,
            f.curso_nome, 'turma', null::uuid, null::uuid, true, true,
            1, 1::numeric, 1, 1, 1, 1, 1, 1, 1, 1::numeric, 1::numeric,
            1::numeric, 1::numeric, 1::numeric, 100::numeric, 'ok', true,
            false, '[]'::jsonb, 'fixture', 'fixture-v1', false, 0,
            '[]'::jsonb, '{}'::jsonb, '{}'::jsonb
          from public.fixture_metricas f
          cross join public.unidades u
        $stub$;

        create function public.salvar_health_score_professor_v3_config_rascunho(
          uuid, date, text, jsonb, jsonb
        )
        returns jsonb language sql security definer
        set search_path = public, pg_temp
        as $stub$ select '{"delegado":true}'::jsonb $stub$;
      `;

      const assertions = String.raw`
        do $fixture$
        declare
          v_total integer;
          v_result jsonb;
        begin
          if (select natureza_operacional from public.cursos where id = 45)
             is distinct from 'comercial' then
            raise exception 'curso 45 nao foi classificado como comercial';
          end if;
          if (select natureza_operacional from public.cursos where id = 10)
             is distinct from 'pedagogica' then
            raise exception 'curso pedagogico foi reclassificado';
          end if;

          select count(*) into v_total
          from public.fn_health_score_professor_v3_catalogo_segmentos_v1(
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
          )
          where curso_id = 45;
          if v_total <> 0 then
            raise exception 'curso 45 permaneceu no catalogo';
          end if;

          select count(*) into v_total
          from public.get_health_score_professor_v3_metricas_segmentadas_v1(
            date '2026-07-01',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            null,
            'mensal'
          )
          where curso_id = 45
            and metrica in ('media_turma', 'numero_alunos');
          if v_total <> 0 then
            raise exception 'curso 45 permaneceu em carteira/media';
          end if;

          select count(*) into v_total
          from public.get_health_score_professor_v3_metricas_segmentadas_v1(
            date '2026-07-01',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            null,
            'mensal'
          )
          where curso_id = 45 and metrica = 'conversao';
          if v_total <> 1 then
            raise exception 'conversao comercial foi alterada';
          end if;

          begin
            v_result := public.salvar_health_score_professor_v3_config_rascunho(
              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
              date '2026-06-01',
              'fixture',
              '[]'::jsonb,
              '[{"unidade_id":"368d47f5-2d88-4475-bc14-ba084a9a348e","curso_id":45,"modalidade":"turma","estado":"configurada","capacidade_maxima":1,"meta_media_turma":1,"meta_carteira_curso":1}]'::jsonb
            );
            raise exception 'salvar aceitou curso comercial';
          exception
            when others then
              if sqlerrm not like '%curso comercial%' then
                raise;
              end if;
          end;

          if has_function_privilege(
            'anon',
            'public.get_health_score_professor_v3_metricas_segmentadas_v1(date,uuid,uuid,text)',
            'execute'
          ) then
            raise exception 'anon executa helper interno';
          end if;
          if not has_function_privilege(
            'service_role',
            'public.get_health_score_professor_v3_metricas_segmentadas_v1(date,uuid,uuid,text)',
            'execute'
          ) then
            raise exception 'service_role perdeu helper interno';
          end if;
          if not has_function_privilege(
            'authenticated',
            'public.salvar_health_score_professor_v3_config_rascunho(uuid,date,text,jsonb,jsonb)',
            'execute'
          ) then
            raise exception 'authenticated perdeu RPC salvar';
          end if;
          if not has_function_privilege(
            'service_role',
            'public.salvar_health_score_professor_v3_config_rascunho(uuid,date,text,jsonb,jsonb)',
            'execute'
          ) then
            raise exception 'service_role perdeu RPC salvar';
          end if;
        end;
        $fixture$;
      `;

      const applied = runPsql(
        containerName,
        `${fixture}\n${migration()}\n${assertions}`,
      );
      assert.equal(
        applied.status,
        0,
        `fixture PostgreSQL falhou:\nSTDOUT:\n${applied.stdout}\nSTDERR:\n${applied.stderr}`,
      );
    } finally {
      spawnSync('docker', ['rm', '--force', containerName], {
        encoding: 'utf8',
      });
    }
  },
);
