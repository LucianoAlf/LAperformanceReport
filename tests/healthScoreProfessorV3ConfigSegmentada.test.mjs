import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260719204000_health_score_v3_config_segmentada_rpc.sql';

const readMigration = () => readFileSync(migrationPath, 'utf8');

function functionBlocks(sql, name) {
  const starts = [
    ...sql.matchAll(
      new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(`, 'gi'),
    ),
  ].map((match) => match.index);

  return starts.map((start) => {
    const next = sql.slice(start + 1).search(/\ncreate\s+or\s+replace\s+function\s+public\./i);
    return next < 0 ? sql.slice(start) : sql.slice(start, start + 1 + next);
  });
}

function functionBlock(sql, name) {
  return functionBlocks(sql, name)[0] || '';
}

function overloadBlock(sql, name, parameterName) {
  return functionBlocks(sql, name).find((block) => (
    new RegExp(`\\b${parameterName}\\b`, 'i').test(
      block.slice(0, block.indexOf('returns')),
    )
  )) || '';
}

test('Task 6 disponibiliza a migration do ciclo segmentado', () => {
  assert.equal(
    existsSync(migrationPath),
    true,
    `${migrationPath} deve existir antes de validar a Task 6`,
  );
});

test(
  'leitura retorna matriz ordenada e pendencias sem quebrar configuracao antiga',
  { skip: !existsSync(migrationPath) },
  () => {
    const sql = readMigration();
    const jsonBlock = functionBlock(
      sql,
      'fn_health_score_professor_v3_config_json',
    );
    const uiBlock = functionBlock(
      sql,
      'get_health_score_professor_v3_config_ui',
    );

    assert.match(jsonBlock, /'metas_segmentadas'/i);
    assert.match(
      jsonBlock,
      /from\s+public\.health_score_professor_v3_config_metas_curso_modalidade\s+m/i,
    );
    for (const field of [
      'unidade_id',
      'curso_id',
      'modalidade',
      'estado',
      'capacidade_maxima',
      'meta_media_turma',
      'meta_carteira_curso',
      'parametros',
    ]) {
      assert.match(jsonBlock, new RegExp(`'${field}'`, 'i'));
    }
    assert.match(
      jsonBlock,
      /jsonb_agg\([\s\S]*order\s+by\s+m\.unidade_id(?:::text)?\s*,\s*m\.curso_id\s*,\s*m\.modalidade/i,
    );
    assert.match(
      jsonBlock,
      /coalesce\s*\([\s\S]*'\[\]'::jsonb\s*\)/i,
      'configuracoes antigas sem matriz devem continuar legiveis como lista vazia',
    );

    assert.match(uiBlock, /'pendencias'/i);
    for (const field of [
      'segmentos_observados_sem_regra',
      'atribuicoes_sem_regra',
      'atribuicoes_zero_carteira',
      'divergencias_modalidade',
    ]) {
      assert.match(uiBlock, new RegExp(`'${field}'`, 'i'));
    }
    assert.match(
      uiBlock,
      /get_health_score_professor_v3_metricas_segmentadas_v1/i,
    );
  },
);

test(
  'leitura da configuracao usa lock compartilhado antes de montar a revisao',
  { skip: !existsSync(migrationPath) },
  () => {
    const block = functionBlock(
      readMigration(),
      'get_health_score_professor_v3_config_ui',
    );
    const guardIndex = block.search(
      /fn_health_score_professor_v3_ator_gerenciador\s*\(\s*\)/i,
    );
    const sharedLockIndex = block.search(
      /pg_advisory_xact_lock_shared\s*\(\s*hashtextextended\s*\(\s*'health_score_professor_v3_config'\s*,\s*0\s*\)\s*\)/i,
    );
    const firstConfigReadIndex = block.search(
      /select\s+c\.id\s+into\s+v_ativa_id/i,
    );

    assert.ok(sharedLockIndex >= 0, 'leitura deve adquirir o lock compartilhado');
    assert.ok(
      guardIndex < sharedLockIndex && sharedLockIndex < firstConfigReadIndex,
      'lock compartilhado deve proteger todas as leituras apos o guard',
    );
  },
);

test(
  'novo rascunho clona metricas globais e a matriz completa sem alterar a ativa',
  { skip: !existsSync(migrationPath) },
  () => {
    const block = functionBlock(
      readMigration(),
      'criar_health_score_professor_v3_config_rascunho',
    );

    assert.match(block, /insert\s+into\s+public\.health_score_professor_v3_config_metricas/i);
    assert.match(
      block,
      /insert\s+into\s+public\.health_score_professor_v3_config_metas_curso_modalidade/i,
    );
    assert.match(
      block,
      /select[\s\S]*v_novo_id[\s\S]*m\.unidade_id[\s\S]*m\.curso_id[\s\S]*m\.modalidade[\s\S]*m\.estado[\s\S]*m\.capacidade_maxima[\s\S]*m\.meta_media_turma[\s\S]*m\.meta_carteira_curso/i,
    );
    assert.match(block, /where\s+m\.config_id\s*=\s*v_origem\.id/i);
    assert.doesNotMatch(
      block,
      /update\s+public\.health_score_professor_v3_config_metas_curso_modalidade/i,
    );
  },
);

test(
  'overload de cinco argumentos salva metricas e matriz atomicas com validacao forte',
  { skip: !existsSync(migrationPath) },
  () => {
    const block = overloadBlock(
      readMigration(),
      'salvar_health_score_professor_v3_config_rascunho',
      'p_metas_segmentadas',
    );

    assert.match(block, /p_metas_segmentadas\s+jsonb/i);
    assert.match(block, /fn_health_score_professor_v3_ator_gerenciador\s*\(\s*\)/i);
    assert.match(block, /where\s+c\.id\s*=\s*p_config_id[\s\S]*for\s+update/i);
    assert.match(block, /jsonb_array_length\s*\(\s*p_metricas\s*\)\s*<>\s*6/i);
    assert.match(block, /count\s*\(\s*distinct\s+r\.metrica\s*\)[\s\S]*<>\s*6/i);
    assert.match(block, /sum\s*\(\s*r\.peso\s*\)[\s\S]*<>\s*100/i);
    assert.match(block, /jsonb_to_recordset\s*\(\s*p_metas_segmentadas\s*\)/i);
    assert.match(
      block,
      /count\s*\(\s*\*\s*\)[\s\S]*count\s*\(\s*distinct\s+row\s*\(\s*[a-z_]+\.unidade_id\s*,\s*[a-z_]+\.curso_id\s*,\s*[a-z_]+\.modalidade\s*\)\s*\)/i,
      'a entrada deve rejeitar chaves de segmento duplicadas',
    );
    assert.match(block, /meta_media_turma\s*>\s*[a-z_]+\.capacidade_maxima/i);
    assert.match(block, /modalidade\s+not\s+in\s*\(\s*'individual'\s*,\s*'turma'\s*\)/i);
    assert.match(block, /not\s+exists\s*\([\s\S]*from\s+public\.unidades/i);
    assert.match(block, /not\s+exists\s*\([\s\S]*from\s+public\.cursos/i);
    assert.match(
      block,
      /insert\s+into\s+public\.health_score_professor_v3_config_metas_curso_modalidade/i,
    );
    assert.match(
      block,
      /on\s+conflict\s*\(\s*config_id\s*,\s*unidade_id\s*,\s*curso_id\s*,\s*modalidade\s*\)\s+do\s+update/i,
    );
    assert.match(
      block,
      /delete\s+from\s+public\.health_score_professor_v3_config_metas_curso_modalidade[\s\S]*config_id\s*=\s*p_config_id[\s\S]*not\s+exists/i,
    );
    assert.match(block, /segmentada_unidade_curso_modalidade/i);
  },
);

test(
  'meta positiva com meta_status nulo e rejeitada no salvar e na ativacao',
  { skip: !existsSync(migrationPath) },
  () => {
    const sql = readMigration();
    const saveBlock = overloadBlock(
      sql,
      'salvar_health_score_professor_v3_config_rascunho',
      'p_metas_segmentadas',
    );
    const activationBlock = functionBlock(
      sql,
      'ativar_health_score_professor_v3_config',
    );

    assert.match(
      saveBlock,
      /x\.meta\s+is\s+not\s+null\s+and\s+x\.meta_status\s+is\s+distinct\s+from\s+'aprovada'/i,
      'IS DISTINCT FROM deve tratar meta_status nulo como nao aprovado',
    );
    assert.doesNotMatch(saveBlock, /meta_status\s*<>\s*'aprovada'/i);

    const activationChecks = activationBlock.match(
      /m\.parametros\s*->>\s*'meta_status'\s+is\s+distinct\s+from\s+'aprovada'/gi,
    ) || [];
    assert.ok(
      activationChecks.length >= 2,
      'ativacao deve validar de forma NULL-safe metas calibraveis e legadas',
    );
    assert.doesNotMatch(
      activationBlock,
      /parametros\s*->>\s*'meta_status'\s*<>\s*'aprovada'/i,
    );
  },
);

test(
  'overload legado de quatro argumentos preserva a matriz existente',
  { skip: !existsSync(migrationPath) },
  () => {
    const block = functionBlocks(
      readMigration(),
      'salvar_health_score_professor_v3_config_rascunho',
    ).find((candidate) => !/p_metas_segmentadas\s+jsonb/i.test(
      candidate.slice(0, candidate.indexOf('returns')),
    )) || '';

    assert.match(
      block,
      /from\s+public\.health_score_professor_v3_config_metas_curso_modalidade\s+m/i,
    );
    assert.match(block, /where\s+m\.config_id\s*=\s*p_config_id/i);
    assert.match(
      block,
      /salvar_health_score_professor_v3_config_rascunho\s*\([\s\S]*v_metricas_compat\s*,[\s\S]*v_metas_segmentadas[\s\S]*\)/i,
    );
    assert.match(
      block,
      /jsonb_array_elements\s*\(\s*p_metricas\s*\)/i,
    );
    assert.match(
      block,
      /item\s*->>\s*'metrica'\s+in\s*\(\s*'media_turma'\s*,\s*'numero_alunos'\s*\)[\s\S]*'meta'\s*,\s*null::numeric/i,
      'cliente legado deve poder salvar uma config segmentada sem ressuscitar metas globais',
    );
    assert.doesNotMatch(
      block,
      /delete\s+from\s+public\.health_score_professor_v3_config_metas_curso_modalidade/i,
    );
  },
);

test(
  'fingerprint ordena seis metricas e toda a matriz por valores semanticos',
  { skip: !existsSync(migrationPath) },
  () => {
    const block = functionBlock(
      readMigration(),
      'fn_health_score_professor_v3_config_fingerprint',
    );

    assert.match(
      block,
      /order\s+by\s+case\s+m\.metrica[\s\S]*when\s+'retencao'\s+then\s+1[\s\S]*when\s+'presenca'\s+then\s+6/i,
    );
    assert.match(
      block,
      /from\s+public\.health_score_professor_v3_config_metas_curso_modalidade\s+s/i,
    );
    for (const field of [
      'unidade_id',
      'curso_id',
      'modalidade',
      'estado',
      'capacidade_maxima',
      'meta_media_turma',
      'meta_carteira_curso',
    ]) {
      assert.match(block, new RegExp(`'${field}'`, 'i'));
    }
    assert.match(
      block,
      /order\s+by\s+s\.unidade_id(?:::text)?\s*,\s*s\.curso_id\s*,\s*s\.modalidade\s*,\s*s\.estado\s*,\s*s\.capacidade_maxima\s*,\s*s\.meta_media_turma\s*,\s*s\.meta_carteira_curso/i,
    );
  },
);

test(
  'simulacao persiste a mesma revisao e lista regra ausente zero carteira e superlotacao',
  { skip: !existsSync(migrationPath) },
  () => {
    const block = functionBlock(
      readMigration(),
      'simular_health_score_professor_v3_config',
    );

    assert.match(block, /get_health_score_professor_v3_metricas_segmentadas_v1/i);
    assert.match(block, /get_health_score_professor_v3_metricas_segmentadas_agregadas_v1/i);
    for (const field of [
      'regra_ausente',
      'zero_carteira',
      'superlotacao',
      'nao_ofertada_observada',
      'atribuicoes_pontuaveis_sem_meta',
    ]) {
      assert.match(block, new RegExp(`'${field}'`, 'i'));
    }
    assert.match(block, /estado_base\s*=\s*'regra_ausente'/i);
    assert.match(
      block,
      /estado_base\s*=\s*'regra_ausente'\s+or\s*\([\s\S]*config_meta_segmento_id\s+is\s+null[\s\S]*curso_id\s+is\s+not\s+null[\s\S]*modalidade\s+in\s*\(\s*'individual'\s*,\s*'turma'\s*\)/i,
      'regra ausente deve sobreviver a precedencia de segmentacao_incompleta',
    );
    assert.match(block, /estado_base\s*=\s*'sem_base_zero_carteira'/i);
    assert.match(block, /capacidade_excedida/i);
    assert.match(block, /'segmentacao_incompleta'/i);
    assert.match(
      block,
      /divergencias\s*->>\s*'nao_ofertada_com_dados'\s*=\s*'true'/i,
      'nao_ofertada observada deve ser detectada mesmo quando outro estado tem precedencia',
    );
    assert.match(
      block,
      /fn_health_score_professor_v3_config_fingerprint\s*\(\s*p_config_id\s*\)/i,
    );
    assert.match(
      block,
      /insert\s+into\s+public\.health_score_professor_v3_config_simulacoes/i,
    );
    assert.doesNotMatch(
      block,
      /(?:insert\s+into|update|delete\s+from)\s+public\.health_score_professor_v3_snapshots/i,
    );
  },
);

test(
  'simulacao preserva metas globais legadas nos dois pilares segmentaveis',
  { skip: !existsSync(migrationPath) },
  () => {
    const block = functionBlock(
      readMigration(),
      'simular_health_score_professor_v3_config',
    );
    const metricasStart = block.search(/\),\s*metricas\s+as\s*\(/i);
    const scoresStart = block.slice(metricasStart + 1).search(/\),\s*scores\s+as\s*\(/i);
    const metricasBlock = block.slice(
      metricasStart,
      metricasStart + 1 + scoresStart,
    );

    assert.ok(metricasStart >= 0 && scoresStart >= 0, 'CTE metricas deve existir');
    assert.match(
      metricasBlock,
      /when\s+cm\.metrica\s+in\s*\(\s*'media_turma'\s*,\s*'numero_alunos'\s*\)[\s\S]*cm\.parametros\s*->>\s*'normalizacao'\s*=\s*'segmentada_unidade_curso_modalidade'\s+then\s+se\.nota/i,
      'nota segmentada so pode substituir a nota global quando a normalizacao segmentada estiver ativa',
    );
    assert.doesNotMatch(
      metricasBlock,
      /when\s+cm\.metrica\s+in\s*\(\s*'media_turma'\s*,\s*'numero_alunos'\s*\)\s+then\s+se\.nota/i,
      'configuracao legada nao pode usar se.nota incondicionalmente',
    );
    assert.match(
      metricasBlock,
      /sm\.valor_bruto\s*\/\s*cm\.meta\s*\*\s*100/i,
      'modo legado deve continuar calculando a nota pela meta global',
    );
  },
);

test(
  'simulacao serializa revisao antes do fingerprint e dos calculos',
  { skip: !existsSync(migrationPath) },
  () => {
    const block = functionBlock(
      readMigration(),
      'simular_health_score_professor_v3_config',
    );
    const lockIndex = block.search(
      /pg_advisory_xact_lock\s*\(\s*hashtextextended\s*\(\s*'health_score_professor_v3_config'\s*,\s*0\s*\)\s*\)/i,
    );
    const configLockIndex = block.search(
      /select\s+c\.\*\s+into\s+v_config[\s\S]*where\s+c\.id\s*=\s*p_config_id\s+for\s+update/i,
    );
    const fingerprintIndex = block.search(
      /v_fingerprint\s*:=\s*public\.fn_health_score_professor_v3_config_fingerprint/i,
    );
    const calculationIndex = block.search(/with\s+detalhe\s+as\s+materialized/i);

    assert.ok(lockIndex >= 0, 'simulacao deve adquirir o advisory lock do ciclo');
    assert.ok(configLockIndex >= 0, 'simulacao deve bloquear a linha do rascunho');
    assert.ok(
      lockIndex < configLockIndex
        && configLockIndex < fingerprintIndex
        && fingerprintIndex < calculationIndex,
      'locks devem anteceder fingerprint e calculos da simulacao',
    );
  },
);

test(
  'ativacao usa simulacao atual e bloqueia matriz incompleta ou incoerente',
  { skip: !existsSync(migrationPath) },
  () => {
    const block = functionBlock(
      readMigration(),
      'ativar_health_score_professor_v3_config',
    );

    assert.match(
      block,
      /config_fingerprint\s*=\s*v_fingerprint[\s\S]*criado_em\s*>\s*v_config\.atualizado_em/i,
    );
    assert.match(block, /simulacao atual obrigatoria antes da ativacao/i);
    for (const field of [
      'regra_ausente',
      'nao_ofertada_observada',
      'atribuicoes_pontuaveis_sem_meta',
      'segmentacao_incompleta',
    ]) {
      assert.match(
        block,
        new RegExp(`jsonb_array_length\\s*\\([\\s\\S]*'${field}'`, 'i'),
      );
    }
    assert.match(
      block,
      /meta_media_turma\s*>\s*m\.capacidade_maxima/i,
    );
    assert.match(block, /daterange[\s\S]*&&/i);
    assert.match(block, /segmentada_unidade_curso_modalidade/i);
    assert.match(
      block,
      /metrica\s+in\s*\(\s*'media_turma'\s*,\s*'numero_alunos'\s*\)[\s\S]*meta\s+is\s+null/i,
    );
    assert.match(
      block,
      /exists\s*\([\s\S]*health_score_professor_v3_config_metas_curso_modalidade[\s\S]*estado\s*=\s*'configurada'/i,
      'modo segmentado exige uma matriz configurada e nao apenas metas globais nulas',
    );
    assert.match(
      block,
      /normalizacao[\s\S]*is\s+distinct\s+from\s+'segmentada_unidade_curso_modalidade'[\s\S]*meta\s+is\s+null/i,
      'configuracoes legadas continuam exigindo suas metas globais',
    );
  },
);

test(
  'ativacao exige simulacao recente posterior e com impacto real',
  { skip: !existsSync(migrationPath) },
  () => {
    const block = functionBlock(
      readMigration(),
      'ativar_health_score_professor_v3_config',
    );

    assert.match(block, /v_competencia_simulacao\s+date\s*;/i);
    assert.match(
      block,
      /select\s+s\.resultado\s*,\s*s\.competencia\s+into\s+v_resultado_simulacao\s*,\s*v_competencia_simulacao/i,
    );
    assert.match(block, /s\.config_fingerprint\s*=\s*v_fingerprint/i);
    assert.match(block, /s\.criado_em\s*>\s*v_config\.atualizado_em/i);
    assert.match(
      block,
      /s\.criado_em\s*>=\s*(?:clock_timestamp\s*\(\s*\)|now\s*\(\s*\))\s*-\s*interval\s+'24 hours'/i,
    );
    assert.match(
      block,
      /coalesce\s*\(\s*\(\s*s\.resultado\s*->>\s*'total'\s*\)\s*::\s*integer\s*,\s*0\s*\)\s*>\s*0/i,
    );
  },
);

test(
  'ativacao revalida diagnosticos canonicos sob lock sem auto simular',
  { skip: !existsSync(migrationPath) },
  () => {
    const block = functionBlock(
      readMigration(),
      'ativar_health_score_professor_v3_config',
    );
    const bodyEnd = block.indexOf('\n$$;');
    const activationBody = bodyEnd >= 0 ? block.slice(0, bodyEnd) : block;
    const lockIndex = activationBody.search(
      /pg_advisory_xact_lock\s*\(\s*hashtextextended\s*\(\s*'health_score_professor_v3_config'\s*,\s*0\s*\)\s*\)/i,
    );
    const simulationLookupIndex = activationBody.search(
      /from\s+public\.health_score_professor_v3_config_simulacoes\s+s/i,
    );
    const diagnosticsIndex = activationBody.search(
      /from\s+public\.get_health_score_professor_v3_metricas_segmentadas_v1\s*\(\s*v_competencia_simulacao\s*,\s*p_config_id\s*,\s*null\s*,\s*'mensal'\s*\)/i,
    );
    const activationUpdateIndex = activationBody.search(
      /update\s+public\.health_score_professor_v3_config_versoes\s+set\s+status\s*=\s*'ativa'/i,
    );

    assert.ok(diagnosticsIndex >= 0, 'ativacao deve reexecutar o diagnostico canonico');
    assert.ok(
      lockIndex < simulationLookupIndex
        && simulationLookupIndex < diagnosticsIndex
        && diagnosticsIndex < activationUpdateIndex,
      'rechecagem deve ocorrer sob lock e antes de ativar a revisao',
    );
    assert.match(
      activationBody,
      /d\.estado_base\s+in\s*\(\s*'regra_ausente'\s*,\s*'divergencia_nao_ofertada'\s*,\s*'segmentacao_incompleta'\s*\)/i,
    );
    assert.match(
      activationBody,
      /d\.atribuicao_pontuavel[\s\S]*d\.config_meta_segmento_id\s+is\s+null/i,
    );
    assert.match(
      activationBody,
      /d\.divergencias\s*->>\s*'nao_ofertada_com_dados'\s*=\s*'true'/i,
    );
    assert.doesNotMatch(
      activationBody,
      /public\.simular_health_score_professor_v3_config\s*\(/i,
    );
    assert.doesNotMatch(
      activationBody,
      /(?:insert\s+into|update|delete\s+from)\s+public\.health_score_professor_v3_snapshots/i,
    );
  },
);

test(
  'RPCs de escrita mantem guard search_path e grants sem expor tabelas',
  { skip: !existsSync(migrationPath) },
  () => {
    const sql = readMigration();
    const writeBlocks = [
      functionBlock(sql, 'criar_health_score_professor_v3_config_rascunho'),
      overloadBlock(
        sql,
        'salvar_health_score_professor_v3_config_rascunho',
        'p_metas_segmentadas',
      ),
      functionBlocks(sql, 'salvar_health_score_professor_v3_config_rascunho')
        .find((block) => !/p_metas_segmentadas\s+jsonb/i.test(
          block.slice(0, block.indexOf('returns')),
        )) || '',
      functionBlock(sql, 'simular_health_score_professor_v3_config'),
      functionBlock(sql, 'ativar_health_score_professor_v3_config'),
    ];

    for (const block of writeBlocks) {
      assert.match(block, /security\s+definer/i);
      assert.match(block, /set\s+search_path\s*=\s*public\s*,\s*pg_temp/i);
      assert.match(block, /fn_health_score_professor_v3_ator_gerenciador\s*\(\s*\)/i);
    }

    for (const signature of [
      'date\\s*,\\s*text',
      'uuid\\s*,\\s*date\\s*,\\s*text\\s*,\\s*jsonb',
      'uuid\\s*,\\s*date\\s*,\\s*text\\s*,\\s*jsonb\\s*,\\s*jsonb',
      'uuid\\s*,\\s*date',
      'uuid\\s*,\\s*text',
    ]) {
      assert.match(
        sql,
        new RegExp(
          `revoke\\s+all\\s+on\\s+function\\s+public\\.[a-z0-9_]+\\s*\\(\\s*${signature}\\s*\\)\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`,
          'i',
        ),
      );
    }
    assert.match(
      sql,
      /grant\s+execute\s+on\s+function\s+public\.salvar_health_score_professor_v3_config_rascunho\s*\(\s*uuid\s*,\s*date\s*,\s*text\s*,\s*jsonb\s*,\s*jsonb\s*\)\s+to\s+authenticated\s*,\s*service_role/i,
    );
    assert.doesNotMatch(
      sql,
      /grant\s+(?:all|select|insert|update|delete)[\s\S]*on\s+table\s+public\.(?:health_score_professor_v3_config_metas_curso_modalidade|professor_unidade_curso_modalidade)/i,
    );
  },
);
