import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260719202000_professores_carteira_segmentos_canonicos.sql';
const migrationExists = existsSync(migrationPath);
const sql = migrationExists ? readFileSync(migrationPath, 'utf8') : '';
const validationPath =
  'docs/auditorias/2026-07-20-task-4-carteira-segmentos-validacao-pos-mudanca.json';
const validationExists = existsSync(validationPath);
const validation = validationExists
  ? JSON.parse(readFileSync(validationPath, 'utf8'))
  : null;

const extractFunction = (functionName) => {
  const match = sql.match(
    new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}`
        + `[\\s\\S]*?\\n\\$\\$\\s*;`,
      'i',
    ),
  );

  assert.ok(match, `funcao ${functionName} deve existir na migration`);
  return match[0];
};

test('Task 4 cria a migration da carteira detalhada canonica', () => {
  assert.equal(
    migrationExists,
    true,
    `migration ausente: ${migrationPath}`,
  );
});

test('gate vivo registra equivalencia, performance e rollback', () => {
  assert.equal(validationExists, true, `validacao ausente: ${validationPath}`);
  assert.equal(validation.rollback_confirmado, true);
  assert.equal(validation.equivalencia.diferencas_totais, 0);
  assert.equal(validation.equivalencia.cruzamentos_professor_recorte, 48);
  assert.equal(validation.equivalencia.diferencas_professores_alvo, 0);
  assert.equal(validation.equivalencia.recortes.length, 8);
  assert.equal(validation.semantica.ensaio_elegivel_media, 0);
  assert.equal(validation.semantica.rateio_proporcional, false);
  assert.equal(validation.hashes.detalhe_existe_apos_rollback, false);
  for (const performance of validation.performance_ms) {
    assert.ok(
      performance.razao <= 2,
      `${performance.escopo} excedeu o limite de desempenho`,
    );
  }
});

test(
  'detalhe preserva assinatura temporal e expoe o grao segmentavel',
  { skip: !migrationExists },
  () => {
    const detail = extractFunction(
      'get_carteira_professor_periodo_detalhe_canonico_v1',
    );

    assert.match(
      detail,
      /\(\s*p_ano\s+integer\s*,\s*p_mes\s+integer\s*,\s*p_unidade_id\s+uuid\s+default\s+null\s*,\s*p_data_inicio\s+date\s+default\s+null\s*,\s*p_data_fim\s+date\s+default\s+null\s*\)/i,
    );
    assert.match(detail, /returns\s+table\s*\(/i);

    for (const column of [
      'professor_id integer',
      'unidade_id uuid',
      'pessoa_chave text',
      'curso_id integer',
      'modalidade text',
      'turma_chave text',
      'elegivel_media boolean',
      'fonte text',
      'curso_resolvido boolean',
      'modalidade_resolvida boolean',
      'estado_resolucao text',
      'ocupacao_chave text',
      'carteira_total_auditado integer',
      'carteira_total_detalhado integer',
      'segmentacao_incompleta boolean',
    ]) {
      assert.match(
        detail,
        new RegExp(column.replace(' ', '\\s+'), 'i'),
        `retorno detalhado deve conter ${column}`,
      );
    }

    assert.match(detail, /language\s+plpgsql/i);
    assert.match(detail, /\bstable\b/i);
    assert.match(detail, /set\s+search_path\s*=\s*public/i);
  },
);

test(
  'detalhe extrai a precedencia e as identidades da definicao viva',
  { skip: !migrationExists },
  () => {
    const detail = extractFunction(
      'get_carteira_professor_periodo_detalhe_canonico_v1',
    );

    assert.match(sql, /3145ca7e057d1cebd9971d13f76d4171/i);
    for (const cte of [
      'roster_periodo',
      'presenca_periodo',
      'eventos_periodo',
      'jornada_atual',
      'legado_periodo',
      'fontes',
      'fonte_preferida',
      'base_carteira',
      'snapshot',
    ]) {
      assert.match(detail, new RegExp(`${cte}\\s+as\\s*\\(`, 'i'));
    }

    assert.match(
      detail,
      /when\s+bool_or\s*\(\s*f\.fonte\s*=\s*'jornada'\s*\)\s+then\s+'jornada'[\s\S]*when\s+bool_or\s*\(\s*f\.fonte\s*=\s*'evento'\s*\)\s+then\s+'evento'[\s\S]*else\s+'legado'/i,
    );
    assert.match(detail, /aa\.aluno_emusys_id::text/i);
    assert.match(detail, /nullif\s*\(\s*a\.emusys_student_id\s*,\s*''\s*\)/i);
    assert.match(detail, /'local:'\s*\|\|\s*aa\.aluno_id::text/i);
    assert.match(detail, /\bturma_chave\b/i);
    assert.match(detail, /ae\.data_aula\s+between\s+v_inicio\s+and\s+v_fim/i);
    assert.match(detail, /ae\.cancelada\s*=\s*false/i);
    assert.match(detail, /lower\s*\(\s*coalesce\s*\(\s*ae\.categoria\s*,\s*'normal'\s*\)\s*\)\s*=\s*'normal'/i);
    const eventoElegivelMedia = detail.match(
      /lower\s*\(\s*btrim\s*\(\s*ae\.tipo::text\s*\)\s*\)\s+in\s*\(\s*'individual'\s*,\s*'turma'\s*\)[\s\S]{0,100}and\s+not\s+coalesce\s*\(\s*c\.is_projeto_banda\s*,\s*false\s*\)[\s\S]{0,40}as\s+elegivel_media/gi,
    ) ?? [];
    assert.equal(
      eventoElegivelMedia.length,
      2,
      'roster e presenca devem exigir modalidade oficial e curso regular',
    );
    assert.match(
      detail,
      /lower\s*\(\s*btrim\s*\(\s*j\.payload_snapshot\s*#>>\s*'\{disciplina,tipo\}'\s*\)\s*\)\s+in\s*\(\s*'individual'\s*,\s*'turma'\s*\)[\s\S]{0,100}and\s+not\s+coalesce\s*\(\s*c\.is_projeto_banda\s*,\s*false\s*\)[\s\S]{0,40}as\s+elegivel_media/i,
    );
    assert.match(
      detail,
      /null::text\s+as\s+modalidade[\s\S]{0,300}not\s+coalesce\s*\(\s*c\.is_projeto_banda\s*,\s*false\s*\)\s+as\s+elegivel_media[\s\S]{0,180}false\s+as\s+modalidade_resolvida/i,
      'fallback legado deve manter elegibilidade anterior e modalidade nao resolvida',
    );
  },
);

test(
  'curso e modalidade usam somente os campos oficiais do Emusys',
  { skip: !migrationExists },
  () => {
    const detail = extractFunction(
      'get_carteira_professor_periodo_detalhe_canonico_v1',
    );

    assert.match(detail, /j\.curso_id\s+as\s+curso_id/i);
    assert.match(
      detail,
      /lower\s*\(\s*btrim\s*\(\s*j\.payload_snapshot\s*#>>\s*'\{disciplina,tipo\}'\s*\)\s*\)\s+as\s+modalidade/i,
    );
    assert.match(detail, /d\.curso_id\s+as\s+curso_id/i);
    assert.match(
      detail,
      /lower\s*\(\s*btrim\s*\(\s*ae\.tipo::text\s*\)\s*\)\s+as\s+modalidade/i,
    );
    assert.match(detail, /d\.unidade_id\s*=\s*ae\.unidade_id/i);
    assert.match(detail, /d\.emusys_disciplina_id\s*=\s*ae\.curso_emusys_id/i);

    assert.match(
      detail,
      /a\.curso_id\s+as\s+curso_id\s*,\s*null::text\s+as\s+modalidade/i,
    );
    assert.match(detail, /'modalidade_nao_resolvida'/i);
    assert.match(detail, /'curso_nao_resolvido'/i);
    assert.match(
      detail,
      /\bin\s*\(\s*'individual'\s*,\s*'turma'\s*\)/i,
    );
    assert.doesNotMatch(
      detail,
      /(?:qtd_alunos|quantidade_alunos)[\s\S]{0,160}\bas\s+modalidade/i,
    );
    assert.doesNotMatch(
      detail,
      /case[\s\S]{0,180}turma_nome[\s\S]{0,100}then\s+'turma'[\s\S]{0,100}\bas\s+modalidade/i,
    );
  },
);

test(
  'ocupacao estavel deduplica reagendamento sem mudar o total bruto de turmas',
  { skip: !migrationExists },
  () => {
    const detail = extractFunction(
      'get_carteira_professor_periodo_detalhe_canonico_v1',
    );
    const aggregate = extractFunction(
      'get_carteira_professor_periodo_canonica',
    );

    assert.match(
      detail,
      /when\s+b\.fonte\s*=\s*'jornada'[\s\S]*b\.turma_chave\s+like\s+'turma:%'[\s\S]*b\.turma_chave\s*~\s*'\^individual:\[0-9\]\+\$'[\s\S]*then\s+b\.turma_chave[\s\S]*else\s+null[\s\S]*as\s+ocupacao_chave/i,
    );
    assert.match(
      aggregate,
      /count\s*\(\s*distinct\s+d\.turma_chave\s*\)::integer\s+as\s+total_turmas/i,
    );
    assert.match(
      aggregate,
      /count\s*\(\s*distinct\s+jsonb_build_array\s*\(\s*d\.pessoa_chave\s*,\s*d\.ocupacao_chave\s*\)\s*\)/i,
    );
  },
);

test(
  'snapshot mantem o total auditado e apenas diagnostica decomposicao incompleta',
  { skip: !migrationExists },
  () => {
    const detail = extractFunction(
      'get_carteira_professor_periodo_detalhe_canonico_v1',
    );
    const aggregate = extractFunction(
      'get_carteira_professor_periodo_canonica',
    );

    assert.match(detail, /professor_carteira_mensal_canonica/i);
    assert.match(detail, /v_periodo_mensal/i);
    assert.match(
      detail,
      /count\s*\(\s*distinct\s+b\.pessoa_chave\s*\)::integer\s+as\s+carteira_total_detalhado/i,
    );
    assert.match(
      detail,
      /(?:u\.)?carteira_total_auditado\s+is\s+distinct\s+from\s+(?:u\.)?carteira_total_detalhado/i,
    );
    assert.match(
      aggregate,
      /coalesce\s*\(\s*max\s*\(\s*d\.carteira_total_auditado\s*\)\s*,\s*count\s*\(\s*distinct\s+d\.pessoa_chave\s*\)::integer\s*,\s*0\s*\)/i,
    );
    assert.match(
      aggregate,
      /max\s*\(\s*d\.carteira_total_auditado\s*\)\s+is\s+not\s+null[\s\S]*then\s+'snapshot_auditado'/i,
    );
    assert.doesNotMatch(
      detail,
      /proporcional|rateio|percentual\s*\*|carteira_total_auditado\s*\//i,
    );
  },
);

test(
  'agregado preserva contrato e agrega exclusivamente a funcao detalhada',
  { skip: !migrationExists },
  () => {
    const aggregate = extractFunction(
      'get_carteira_professor_periodo_canonica',
    );

    assert.match(
      aggregate,
      /\(\s*p_ano\s+integer\s*,\s*p_mes\s+integer\s*,\s*p_unidade_id\s+uuid\s+default\s+null\s*,\s*p_data_inicio\s+date\s+default\s+null\s*,\s*p_data_fim\s+date\s+default\s+null\s*\)/i,
    );
    for (const column of [
      'professor_id integer',
      'unidade_id uuid',
      'carteira_alunos integer',
      'media_alunos_turma numeric',
      'total_turmas integer',
      'alunos_via_turmas integer',
      'turmas_elegiveis_media integer',
      'fonte_carteira text',
    ]) {
      assert.match(
        aggregate,
        new RegExp(column.replace(' ', '\\s+'), 'i'),
      );
    }

    assert.match(
      aggregate,
      /from\s+public\.get_carteira_professor_periodo_detalhe_canonico_v1\s*\(\s*p_ano\s*,\s*p_mes\s*,\s*p_unidade_id\s*,\s*p_data_inicio\s*,\s*p_data_fim\s*\)/i,
    );
    for (const source of [
      'aulas_emusys',
      'aula_alunos_emusys',
      'aluno_presenca',
      'aluno_jornada_matricula_disciplina',
      'alunos',
      'professor_carteira_mensal_canonica',
    ]) {
      assert.doesNotMatch(
        aggregate,
        new RegExp(`public\\.${source}`, 'i'),
        `agregado nao deve reler ${source}`,
      );
    }
  },
);

test(
  'funcoes internas permanecem privadas para o navegador',
  { skip: !migrationExists },
  () => {
    for (const functionName of [
      'get_carteira_professor_periodo_detalhe_canonico_v1',
      'get_carteira_professor_periodo_canonica',
    ]) {
      assert.match(
        sql,
        new RegExp(
          `revoke\\s+all\\s+on\\s+function\\s+public\\.${functionName}`
            + `[\\s\\S]{0,220}from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`,
          'i',
        ),
      );
      assert.match(
        sql,
        new RegExp(
          `grant\\s+execute\\s+on\\s+function\\s+public\\.${functionName}`
            + `[\\s\\S]{0,220}to\\s+service_role`,
          'i',
        ),
      );
    }
  },
);

test(
  'fixture PostgreSQL prova classificacao oficial, recorte, snapshot e agregado',
  { skip: !migrationExists, timeout: 120_000 },
  (t) => {
    const runtimeRequired = process.env.TASK4_REQUIRE_POSTGRES_FIXTURE === '1';
    const dockerVersion = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
      encoding: 'utf8',
    });

    if (dockerVersion.status !== 0) {
      if (runtimeRequired) {
        assert.fail(`Docker/PostgreSQL indisponivel:\n${dockerVersion.stderr}`);
      }
      t.skip('Docker/PostgreSQL indisponivel para a fixture comportamental');
      return;
    }

    const image = process.env.TASK4_POSTGRES_IMAGE || 'postgres:17-alpine';
    const imageInspection = spawnSync('docker', ['image', 'inspect', image], {
      encoding: 'utf8',
    });
    if (imageInspection.status !== 0) {
      if (runtimeRequired) {
        assert.fail(`Imagem PostgreSQL ausente (${image}):\n${imageInspection.stderr}`);
      }
      t.skip(`Imagem PostgreSQL ausente: ${image}`);
      return;
    }

    const containerName = `la-task4-postgres-${process.pid}-${Date.now()}`;
    const started = spawnSync(
      'docker',
      [
        'run',
        '--detach',
        '--rm',
        '--name',
        containerName,
        '--env',
        'POSTGRES_PASSWORD=task4',
        image,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(started.status, 0, `nao iniciou PostgreSQL:\n${started.stderr}`);

    try {
      let ready = false;
      let consecutiveReady = 0;
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const readiness = spawnSync(
          'docker',
          ['exec', containerName, 'pg_isready', '-U', 'postgres', '-d', 'postgres'],
          { encoding: 'utf8' },
        );
        if (readiness.status === 0) {
          consecutiveReady += 1;
          if (consecutiveReady >= 8) {
            ready = true;
            break;
          }
        } else {
          consecutiveReady = 0;
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
      }
      assert.equal(ready, true, 'PostgreSQL da fixture nao ficou pronto');

      const fixtureSql = String.raw`
        \set ON_ERROR_STOP on

        create role anon;
        create role authenticated;
        create role service_role;

        create table public.cursos (
          id integer primary key,
          is_projeto_banda boolean not null default false
        );

        create table public.curso_emusys_depara (
          unidade_id uuid not null,
          emusys_disciplina_id integer not null,
          curso_id integer
        );

        create table public.alunos (
          id integer primary key,
          emusys_student_id text,
          professor_atual_id integer,
          unidade_id uuid,
          curso_id integer,
          dia_aula text,
          horario_aula time,
          data_matricula date,
          data_inicio_contrato date,
          created_at timestamptz not null default now(),
          data_saida date,
          arquivado_em timestamptz,
          status text
        );

        create table public.aulas_emusys (
          id integer primary key,
          professor_id integer,
          unidade_id uuid not null,
          tipo text,
          turma_nome text,
          curso_emusys_id integer,
          curso_nome text,
          matricula_disciplina_id integer,
          data_aula date not null,
          data_hora_inicio timestamptz not null,
          cancelada boolean not null default false,
          categoria text
        );

        create table public.aula_alunos_emusys (
          aula_emusys_id integer not null,
          aluno_emusys_id text,
          aluno_chave text,
          aluno_id integer
        );

        create table public.aluno_presenca (
          aula_emusys_id integer not null,
          aluno_id integer not null
        );

        create table public.aluno_jornada_matricula_disciplina (
          id integer primary key,
          professor_id integer,
          unidade_id uuid not null,
          emusys_aluno_id text,
          aluno_id integer,
          curso_id integer,
          payload_snapshot jsonb,
          curso_nome_emusys text,
          dia_semana text,
          horario text,
          status_matricula text,
          emusys_matricula_disciplina_id integer
        );

        create table public.professor_carteira_mensal_canonica (
          professor_id integer not null,
          unidade_id uuid not null,
          competencia date not null,
          carteira_alunos integer not null
        );

        insert into public.cursos (id, is_projeto_banda)
        values (10, false), (20, true);

        insert into public.curso_emusys_depara (
          unidade_id,
          emusys_disciplina_id,
          curso_id
        ) values
          ('00000000-0000-0000-0000-000000000001', 100, 10),
          ('00000000-0000-0000-0000-000000000001', 200, 20);

        insert into public.aulas_emusys (
          id,
          professor_id,
          unidade_id,
          tipo,
          turma_nome,
          curso_emusys_id,
          curso_nome,
          matricula_disciplina_id,
          data_aula,
          data_hora_inicio,
          cancelada,
          categoria
        ) values
          (1001, 101, '00000000-0000-0000-0000-000000000001', 'Turma', null, 100, 'Piano', 5001, current_date, current_date + time '10:00', false, 'normal'),
          (1002, 101, '00000000-0000-0000-0000-000000000001', 'Individual', 'Nome legado de turma', 100, 'Piano', 5002, current_date, current_date + time '11:00', false, 'normal'),
          (1003, 101, '00000000-0000-0000-0000-000000000001', 'Ensaio', 'Ensaio do palco', 100, 'Piano', 5003, current_date, current_date + time '12:00', false, 'normal'),
          (1004, 101, '00000000-0000-0000-0000-000000000001', 'Turma', 'Curso sem de-para', 999, 'Curso externo', 5004, current_date, current_date + time '13:00', false, 'normal'),
          (1007, 101, '00000000-0000-0000-0000-000000000001', 'Turma', 'Projeto', 200, 'Projeto', 5007, current_date, current_date + time '14:00', false, 'normal'),
          (1005, 404, '00000000-0000-0000-0000-000000000001', 'Individual', null, 100, 'Piano', 6005, current_date - 1, current_date - 1 + time '15:00', false, 'normal'),
          (1006, 404, '00000000-0000-0000-0000-000000000001', 'Individual', null, 100, 'Piano', 6006, current_date, current_date + time '15:00', false, 'normal');

        insert into public.aula_alunos_emusys (
          aula_emusys_id,
          aluno_emusys_id,
          aluno_chave,
          aluno_id
        ) values
          (1001, 'evento-turma-um', null, null),
          (1002, 'evento-individual-nome-turma', null, null),
          (1003, 'evento-ensaio', null, null),
          (1004, 'evento-curso-sem-depara', null, null),
          (1007, 'evento-projeto', null, null),
          (1005, 'evento-fora-recorte', null, null),
          (1006, 'evento-dentro-recorte', null, null);

        insert into public.aluno_jornada_matricula_disciplina (
          id,
          professor_id,
          unidade_id,
          emusys_aluno_id,
          aluno_id,
          curso_id,
          payload_snapshot,
          curso_nome_emusys,
          dia_semana,
          horario,
          status_matricula,
          emusys_matricula_disciplina_id
        ) values
          (2001, 202, '00000000-0000-0000-0000-000000000001', 'jornada-turma-um', null, 10, '{"disciplina":{"tipo":"Turma"}}', 'Piano', 'segunda', '10:00', 'ativa', 7001),
          (2002, 202, '00000000-0000-0000-0000-000000000001', 'jornada-individual-nome-turma', null, 10, '{"disciplina":{"tipo":"Individual","nome_turma":"Nome legado"}}', 'Piano', 'terca', '11:00', 'ativa', 7002),
          (2003, 202, '00000000-0000-0000-0000-000000000001', 'jornada-ensaio', null, 10, '{"disciplina":{"tipo":"Ensaio","nome_turma":"Ensaio do palco"}}', 'Piano', 'quarta', '12:00', 'ativa', 7003),
          (2004, 202, '00000000-0000-0000-0000-000000000001', 'jornada-projeto', null, 20, '{"disciplina":{"tipo":"Turma","nome_turma":"Projeto"}}', 'Projeto', 'quinta', '13:00', 'ativa', 7004);

        insert into public.alunos (
          id,
          emusys_student_id,
          professor_atual_id,
          unidade_id,
          curso_id,
          dia_aula,
          horario_aula,
          data_matricula,
          status
        ) values
          (3001, 'legado-regular', 303, '00000000-0000-0000-0000-000000000001', 10, 'segunda', '10:00', current_date - 30, 'ativo'),
          (5001, 'snapshot-detalhe', 505, '00000000-0000-0000-0000-000000000001', 10, 'terca', '11:00', current_date - 30, 'ativo');

        insert into public.professor_carteira_mensal_canonica (
          professor_id,
          unidade_id,
          competencia,
          carteira_alunos
        ) values (
          505,
          '00000000-0000-0000-0000-000000000001',
          date_trunc('month', current_date)::date,
          3
        );

        ${sql}

        do $fixture$
        declare
          v_ano integer := extract(year from current_date)::integer;
          v_mes integer := extract(month from current_date)::integer;
          v_unidade uuid := '00000000-0000-0000-0000-000000000001';
          v_diferencas integer;
        begin
          if not exists (
            select 1
            from public.get_carteira_professor_periodo_detalhe_canonico_v1(
              v_ano, v_mes, v_unidade, null, null
            ) d
            where d.professor_id = 101
              and d.pessoa_chave = 'evento-turma-um'
              and d.fonte = 'evento'
              and d.modalidade = 'turma'
              and d.elegivel_media
              and d.modalidade_resolvida
          ) then
            raise exception 'evento turma com uma pessoa nao permaneceu turma';
          end if;

          if not exists (
            select 1
            from public.get_carteira_professor_periodo_detalhe_canonico_v1(
              v_ano, v_mes, v_unidade, null, null
            ) d
            where d.professor_id = 101
              and d.pessoa_chave = 'evento-individual-nome-turma'
              and d.modalidade = 'individual'
              and d.elegivel_media
          ) then
            raise exception 'evento individual com turma_nome nao permaneceu individual';
          end if;

          if not exists (
            select 1
            from public.get_carteira_professor_periodo_detalhe_canonico_v1(
              v_ano, v_mes, v_unidade, null, null
            ) d
            where d.professor_id = 101
              and d.pessoa_chave = 'evento-ensaio'
              and d.modalidade = 'ensaio'
              and not d.elegivel_media
              and not d.modalidade_resolvida
              and d.estado_resolucao = 'modalidade_nao_resolvida'
          ) then
            raise exception 'evento ensaio entrou na media ou foi resolvido';
          end if;

          if not exists (
            select 1
            from public.get_carteira_professor_periodo_detalhe_canonico_v1(
              v_ano, v_mes, v_unidade, null, null
            ) d
            where d.professor_id = 101
              and d.pessoa_chave = 'evento-curso-sem-depara'
              and d.curso_id is null
              and not d.curso_resolvido
              and d.estado_resolucao = 'curso_nao_resolvido'
          ) then
            raise exception 'curso sem de-para nao ficou visivel e nao resolvido';
          end if;

          if exists (
            select 1
            from public.get_carteira_professor_periodo_detalhe_canonico_v1(
              v_ano, v_mes, v_unidade, null, null
            ) d
            where d.pessoa_chave in ('evento-projeto', 'jornada-projeto')
              and d.elegivel_media
          ) then
            raise exception 'projeto ou banda entrou na media';
          end if;

          if not exists (
            select 1
            from public.get_carteira_professor_periodo_detalhe_canonico_v1(
              v_ano, v_mes, v_unidade, null, null
            ) d
            where d.professor_id = 202
              and d.pessoa_chave = 'jornada-turma-um'
              and d.fonte = 'jornada'
              and d.modalidade = 'turma'
              and d.elegivel_media
          ) then
            raise exception 'jornada turma com uma pessoa nao permaneceu turma';
          end if;

          if not exists (
            select 1
            from public.get_carteira_professor_periodo_detalhe_canonico_v1(
              v_ano, v_mes, v_unidade, null, null
            ) d
            where d.professor_id = 202
              and d.pessoa_chave = 'jornada-individual-nome-turma'
              and d.modalidade = 'individual'
              and d.elegivel_media
          ) then
            raise exception 'jornada individual com turma_nome nao permaneceu individual';
          end if;

          if not exists (
            select 1
            from public.get_carteira_professor_periodo_detalhe_canonico_v1(
              v_ano, v_mes, v_unidade, null, null
            ) d
            where d.professor_id = 202
              and d.pessoa_chave = 'jornada-ensaio'
              and d.modalidade = 'ensaio'
              and not d.elegivel_media
              and not d.modalidade_resolvida
          ) then
            raise exception 'jornada ensaio entrou na media ou foi resolvida';
          end if;

          if not exists (
            select 1
            from public.get_carteira_professor_periodo_detalhe_canonico_v1(
              v_ano, v_mes, v_unidade, null, null
            ) d
            where d.professor_id = 303
              and d.fonte = 'legado'
              and d.modalidade is null
              and not d.modalidade_resolvida
              and d.estado_resolucao = 'modalidade_nao_resolvida'
              and d.elegivel_media
          ) then
            raise exception 'fallback legado deixou de ser equivalente e nao resolvido';
          end if;

          if (
            select count(*)
            from public.get_carteira_professor_periodo_detalhe_canonico_v1(
              v_ano, v_mes, v_unidade, current_date, current_date
            ) d
            where d.professor_id = 404
          ) <> 1 or not exists (
            select 1
            from public.get_carteira_professor_periodo_detalhe_canonico_v1(
              v_ano, v_mes, v_unidade, current_date, current_date
            ) d
            where d.professor_id = 404
              and d.pessoa_chave = 'evento-dentro-recorte'
          ) then
            raise exception 'recorte temporal incluiu evento fora da janela';
          end if;

          if not exists (
            select 1
            from public.get_carteira_professor_periodo_detalhe_canonico_v1(
              v_ano, v_mes, v_unidade, null, null
            ) d
            where d.professor_id = 505
              and d.carteira_total_auditado = 3
              and d.carteira_total_detalhado = 1
              and d.segmentacao_incompleta
          ) then
            raise exception 'snapshot divergente nao marcou segmentacao incompleta';
          end if;

          if not exists (
            select 1
            from public.get_carteira_professor_periodo_canonica(
              v_ano, v_mes, v_unidade, null, null
            ) a
            where a.professor_id = 505
              and a.carteira_alunos = 3
              and a.fonte_carteira = 'snapshot_auditado'
          ) then
            raise exception 'agregado nao preservou total auditado do snapshot';
          end if;

          with esperado (
            professor_id,
            carteira_alunos,
            media_alunos_turma,
            total_turmas,
            alunos_via_turmas,
            turmas_elegiveis_media,
            fonte_carteira
          ) as (
            values
              (101, 5, 1.00::numeric, 5, 3, 3, 'evento'::text),
              (202, 4, 1.00::numeric, 4, 2, 2, 'jornada'::text),
              (303, 1, 1.00::numeric, 1, 1, 1, 'legado'::text),
              (505, 3, 1.00::numeric, 1, 1, 1, 'snapshot_auditado'::text)
          ), atual as (
            select a.*
            from public.get_carteira_professor_periodo_canonica(
              v_ano, v_mes, v_unidade, null, null
            ) a
            where a.professor_id in (101, 202, 303, 505)
          ), diferencas as (
            select
              coalesce(e.professor_id, a.professor_id) as professor_id
            from esperado e
            full join atual a using (professor_id)
            where e.professor_id is null
               or a.professor_id is null
               or row(
                 e.carteira_alunos,
                 e.media_alunos_turma,
                 e.total_turmas,
                 e.alunos_via_turmas,
                 e.turmas_elegiveis_media,
                 e.fonte_carteira
               ) is distinct from row(
                 a.carteira_alunos,
                 a.media_alunos_turma,
                 a.total_turmas,
                 a.alunos_via_turmas,
                 a.turmas_elegiveis_media,
                 a.fonte_carteira
               )
          )
          select count(*) into v_diferencas from diferencas;

          if v_diferencas <> 0 then
            raise exception 'agregado divergiu da fixture: % linha(s)', v_diferencas;
          end if;
        end;
        $fixture$;
      `;

      const executed = spawnSync(
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
        {
          encoding: 'utf8',
          input: fixtureSql,
          maxBuffer: 16 * 1024 * 1024,
        },
      );

      assert.equal(
        executed.status,
        0,
        `fixture PostgreSQL falhou:\nSTDOUT:\n${executed.stdout}\nSTDERR:\n${executed.stderr}`,
      );
    } finally {
      spawnSync('docker', ['rm', '--force', containerName], { encoding: 'utf8' });
    }
  },
);
