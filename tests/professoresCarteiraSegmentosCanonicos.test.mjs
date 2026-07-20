import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260719202000_professores_carteira_segmentos_canonicos.sql';
const migrationExists = existsSync(migrationPath);
const sql = migrationExists ? readFileSync(migrationPath, 'utf8') : '';

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
    assert.match(detail, /not\s+coalesce\s*\(\s*c\.is_projeto_banda\s*,\s*false\s*\)\s+as\s+elegivel_media/i);
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
