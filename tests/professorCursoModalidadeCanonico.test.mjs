import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260719201000_professor_unidade_curso_modalidade.sql';
const migrationExists = existsSync(migrationPath);
const sql = migrationExists ? readFileSync(migrationPath, 'utf8') : '';

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const extractCreateTable = (tableName) => {
  const match = sql.match(
    new RegExp(
      `create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+public\\.${escapeRegExp(tableName)}\\s*\\([\\s\\S]*?\\)\\s*;`,
      'i',
    ),
  );

  assert.ok(match, `${tableName} deve ser criada pela migration da Task 3`);
  return match[0];
};

const extractFunction = (functionName) => {
  const match = sql.match(
    new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+public\\.${escapeRegExp(functionName)}\\s*\\([\\s\\S]*?\\n\\$\\$\\s*;`,
      'i',
    ),
  );

  assert.ok(match, `${functionName} deve existir na migration da Task 3`);
  return match[0];
};

const assertHardenedFunction = (functionName) => {
  const block = extractFunction(functionName);
  assert.match(block, /security\s+definer/i);
  assert.match(block, /set\s+search_path\s*=\s*public\s*,\s*pg_temp/i);
  return block;
};

test('Task 3 disponibiliza a migration de atribuicoes canonicas', () => {
  assert.equal(
    migrationExists,
    true,
    `${migrationPath} deve existir antes de validar o contrato canonico`,
  );
});

test(
  'tabela temporal preserva grao, historico e FKs restritivas',
  { skip: !migrationExists },
  () => {
    const table = extractCreateTable('professor_unidade_curso_modalidade');

    assert.match(table, /\bid\s+uuid\s+primary\s+key\s+default\s+gen_random_uuid\s*\(\s*\)/i);
    assert.match(table, /\bprofessor_id\s+integer\s+not\s+null[\s\S]{0,120}references\s+public\.professores\s*\(\s*id\s*\)\s*on\s+delete\s+restrict/i);
    assert.match(table, /\bunidade_id\s+uuid\s+not\s+null[\s\S]{0,120}references\s+public\.unidades\s*\(\s*id\s*\)\s*on\s+delete\s+restrict/i);
    assert.match(table, /\bcurso_id\s+integer\s+not\s+null[\s\S]{0,120}references\s+public\.cursos\s*\(\s*id\s*\)\s*on\s+delete\s+restrict/i);
    assert.match(table, /\brevisado_por\s+integer[\s\S]{0,120}references\s+public\.usuarios\s*\(\s*id\s*\)\s*on\s+delete\s+restrict/i);
    assert.match(table, /check\s*\(\s*modalidade\s+in\s*\(\s*'individual'\s*,\s*'turma'\s*\)\s*\)/i);
    assert.match(table, /check\s*\(\s*fonte\s+in\s*\(\s*'manual'\s*,\s*'jornada'\s*,\s*'aula'\s*,\s*'revisao'\s*\)\s*\)/i);
    assert.match(table, /check\s*\(\s*confianca\s+in\s*\(\s*'alta'\s*,\s*'media'\s*,\s*'revisada'\s*\)\s*\)/i);
    assert.match(table, /check\s*\(\s*status\s+in\s*\(\s*'ativo'\s*,\s*'encerrado'\s*\)\s*\)/i);
    assert.match(table, /vigencia_fim\s+is\s+null\s+or\s+vigencia_fim\s*>=\s*vigencia_inicio/i);
    assert.match(table, /\bevidencias\s+jsonb\s+not\s+null\s+default\s+'\{\}'::jsonb/i);

    assert.match(
      sql,
      /create\s+unique\s+index\s+if\s+not\s+exists\s+[a-z_][a-z0-9_]*\s+on\s+public\.professor_unidade_curso_modalidade\s*\(\s*professor_id\s*,\s*unidade_id\s*,\s*curso_id\s*,\s*modalidade\s*\)\s*where\s+status\s*=\s*'ativo'\s+and\s+vigencia_fim\s+is\s+null/i,
      'deve existir uma unica atribuicao ativa aberta por grao',
    );

    const historyGuard = assertHardenedFunction(
      'fn_professor_curso_modalidade_proteger_historico_v1',
    );
    assert.match(historyGuard, /tg_op\s*=\s*'DELETE'[\s\S]*raise\s+exception/i);
    assert.match(historyGuard, /old\.status\s*=\s*'encerrado'[\s\S]*raise\s+exception/i);
    assert.match(
      historyGuard,
      /new\.professor_id\s+is\s+distinct\s+from\s+old\.professor_id[\s\S]*new\.unidade_id\s+is\s+distinct\s+from\s+old\.unidade_id[\s\S]*new\.curso_id\s+is\s+distinct\s+from\s+old\.curso_id[\s\S]*new\.modalidade\s+is\s+distinct\s+from\s+old\.modalidade/i,
    );
  },
);

test(
  'datas operacionais usam calendario local LA independente da sessao',
  { skip: !migrationExists },
  () => {
    const localDateHelper = assertHardenedFunction(
      'fn_professor_curso_modalidade_data_local_la_v1',
    );

    assert.match(localDateHelper, /returns\s+date/i);
    assert.match(
      localDateHelper,
      /\(\s*clock_timestamp\s*\(\s*\)\s+at\s+time\s+zone\s+'America\/Sao_Paulo'\s*\)::date/i,
    );
    assert.doesNotMatch(
      sql,
      /\bcurrent_date\b/i,
      'regras de vigencia nao podem depender do TimeZone da sessao',
    );

    for (const functionName of [
      'fn_professor_curso_modalidade_impedir_sobreposicao_v1',
      'get_professor_curso_modalidade_reconciliacao_v1',
      'salvar_professor_curso_modalidade_atribuicoes_v1',
      'reconciliar_professor_curso_modalidade_v1',
    ]) {
      assert.match(
        extractFunction(functionName),
        /v_data_local\s+date\s*:=\s*public\.fn_professor_curso_modalidade_data_local_la_v1\s*\(\s*\)/i,
        `${functionName} deve fixar a data LA uma vez por execucao`,
      );
    }
  },
);

test(
  'RPCs sao hardened e a escrita valida professores.editar por unidade',
  { skip: !migrationExists },
  () => {
    assert.match(
      sql,
      /function\s+public\.get_professor_curso_modalidade_reconciliacao_v1\s*\(\s*p_unidade_id\s+uuid\s+default\s+null\s*,\s*p_professor_id\s+integer\s+default\s+null\s*\)/i,
    );
    assert.match(
      sql,
      /function\s+public\.salvar_professor_curso_modalidade_atribuicoes_v1\s*\(\s*p_professor_id\s+integer\s*,\s*p_atribuicoes\s+jsonb\s*,\s*p_justificativa\s+text\s*\)/i,
    );
    assert.match(
      sql,
      /function\s+public\.reconciliar_professor_curso_modalidade_v1\s*\(\s*p_data_referencia\s+date\s+default\s+public\.fn_professor_curso_modalidade_data_local_la_v1\s*\(\s*\)\s*\)/i,
    );

    const getBlock = assertHardenedFunction(
      'get_professor_curso_modalidade_reconciliacao_v1',
    );
    const saveBlock = assertHardenedFunction(
      'salvar_professor_curso_modalidade_atribuicoes_v1',
    );
    const reconcileBlock = assertHardenedFunction(
      'reconciliar_professor_curso_modalidade_v1',
    );
    const actorGuard = assertHardenedFunction(
      'fn_professor_curso_modalidade_ator_v1',
    );

    for (const block of [getBlock, saveBlock]) {
      assert.match(block, /fn_professor_curso_modalidade_ator_v1\s*\(\s*\)/i);
    }
    assert.match(
      actorGuard,
      /auth\.role\s*\(\s*\)[\s\S]{0,40}=\s*'service_role'/i,
    );
    assert.match(actorGuard, /session_user\s*=\s*'postgres'/i);
    assert.match(actorGuard, /from\s+public\.usuarios/i);
    assert.match(actorGuard, /auth_user_id\s*=\s*auth\.uid\s*\(\s*\)/i);
    assert.match(actorGuard, /u\.ativo\s*=\s*true/i);
    assert.doesNotMatch(
      sql,
      /fn_health_score_professor_v3_ator_gerenciador\s*\(\s*\)/i,
      'editor de unidade nao pode depender da permissao global do Health Score',
    );
    for (const block of [getBlock, saveBlock]) {
      assert.match(
        block,
        /v_usuario_id\s+is\s+not\s+null[\s\S]*usuario_tem_permissao\s*\(\s*v_usuario_id\s*,\s*'professores\.editar'\s*,\s*v_unidade_id\s*\)/i,
        'humano deve ter professores.editar em cada unidade afetada',
      );
    }

    assert.doesNotMatch(
      reconcileBlock,
      /fn_professor_curso_modalidade_ator_v1|usuario_tem_permissao/i,
      'backfill administrativo nao deve resolver nem escanear como humano unitario',
    );
    assert.match(
      reconcileBlock,
      /begin\s+if\s+not\s*\([\s\S]{0,180}auth\.role\s*\(\s*\)[\s\S]{0,80}'service_role'[\s\S]{0,120}session_user\s*=\s*'postgres'[\s\S]{0,120}\)\s+then[\s\S]{0,180}raise\s+exception/i,
      'reconciliacao deve negar humano antes de consultar evidencias',
    );
    assert.match(
      sql,
      /grant\s+execute\s+on\s+function\s+public\.reconciliar_professor_curso_modalidade_v1\s*\(\s*date\s*\)\s+to\s+service_role\s*;/i,
    );
    assert.doesNotMatch(
      sql,
      /grant\s+execute\s+on\s+function\s+public\.reconciliar_professor_curso_modalidade_v1\s*\(\s*date\s*\)\s+to\s+[^;]*\bauthenticated\b/i,
      'authenticated nao pode executar o backfill global',
    );

    assert.match(saveBlock, /jsonb_array_elements\s*\(\s*p_atribuicoes\s*\)/i);
    assert.match(
      saveBlock,
      /if\s+p_atribuicoes\s+is\s+null\s+then[\s\S]*raise\s+exception[\s\S]*nao\s+pode\s+ser\s+null/i,
      'payload NULL deve falhar explicitamente antes de jsonb_typeof',
    );
    assert.match(saveBlock, /acao[\s\S]*'manter'[\s\S]*'encerrar'[\s\S]*'revisar'/i);
    assert.match(saveBlock, /revisado_por\s*=\s*v_usuario_id/i);
    assert.match(saveBlock, /p_justificativa/i);
    assert.doesNotMatch(
      saveBlock,
      /delete\s+from\s+public\.professor_unidade_curso_modalidade/i,
      'salvar deve encerrar e criar revisoes sem apagar historico',
    );

    assert.match(
      reconcileBlock,
      /returns\s+table\s*\([\s\S]*inseridos\s+integer[\s\S]*atualizados\s+integer[\s\S]*ignorados\s+integer[\s\S]*ambiguos\s+integer[\s\S]*ignorados_projeto_banda\s+integer[\s\S]*professores_inativos_preservados\s+integer/i,
    );
  },
);

test(
  'evidencias filtram unidade e professor antes das agregacoes JSON',
  { skip: !migrationExists },
  () => {
    const evidenceBlock = extractFunction(
      'fn_professor_curso_modalidade_evidencias_v1',
    );
    const getBlock = extractFunction(
      'get_professor_curso_modalidade_reconciliacao_v1',
    );
    const reconcileBlock = extractFunction(
      'reconciliar_professor_curso_modalidade_v1',
    );
    const jornadaBase = evidenceBlock.match(
      /jornada_base\s+as\s*\([\s\S]*?\),\s*jornada_validas\s+as/i,
    )?.[0] ?? '';
    const aulaBase = evidenceBlock.match(
      /aula_base\s+as\s*\([\s\S]*?\),\s*aula_validas\s+as/i,
    )?.[0] ?? '';

    assert.match(
      evidenceBlock,
      /fn_professor_curso_modalidade_evidencias_v1\s*\(\s*p_data_referencia\s+date\s*,\s*p_unidade_id\s+uuid\s+default\s+null\s*,\s*p_professor_id\s+integer\s+default\s+null\s*\)/i,
    );
    for (const [base, alias] of [[jornadaBase, 'j'], [aulaBase, 'a']]) {
      assert.notEqual(base, '', `CTE base ${alias} deve ser identificavel`);
      assert.match(
        base,
        new RegExp(`p_unidade_id\\s+is\\s+null\\s+or\\s+${alias}\\.unidade_id\\s*=\\s*p_unidade_id`, 'i'),
      );
      assert.match(
        base,
        new RegExp(`p_professor_id\\s+is\\s+null\\s+or\\s+${alias}\\.professor_id\\s*=\\s*p_professor_id`, 'i'),
      );
      assert.doesNotMatch(base, /jsonb_agg/i, 'CTE base deve filtrar antes de agregar');
    }
    assert.match(
      getBlock,
      /fn_professor_curso_modalidade_evidencias_v1\s*\(\s*v_data_local\s*,\s*p_unidade_id\s*,\s*p_professor_id\s*\)/i,
    );
    assert.match(
      reconcileBlock,
      /fn_professor_curso_modalidade_evidencias_v1\s*\(\s*v_data_referencia\s*,\s*null\s*,\s*null\s*\)/i,
    );
  },
);

test(
  'jornada alta e aula media usam somente modalidade e vinculo oficiais',
  { skip: !migrationExists },
  () => {
    const evidenceBlock = assertHardenedFunction(
      'fn_professor_curso_modalidade_evidencias_v1',
    );

    assert.match(evidenceBlock, /aluno_jornada_matricula_disciplina/i);
    assert.match(evidenceBlock, /status_matricula\s*=\s*'ativa'/i);
    assert.match(
      evidenceBlock,
      /payload_snapshot\s*#>>\s*'\{disciplina,tipo\}'/i,
    );
    assert.match(evidenceBlock, /'jornada'[\s\S]*'alta'/i);
    assert.match(evidenceBlock, /vw_professores_emusys_vinculos/i);
    assert.match(evidenceBlock, /qualidade_vinculo\s*=\s*'vinculo_utilizavel'/i);

    assert.match(evidenceBlock, /aulas_emusys/i);
    assert.match(
      evidenceBlock,
      /data_aula\s+between\s+p_data_referencia\s*-\s*89\s+and\s+p_data_referencia/i,
      'janela de aulas deve ter 90 dias inclusivos',
    );
    assert.match(evidenceBlock, /lower\s*\(\s*btrim\s*\(\s*a\.categoria::text\s*\)\s*\)\s*=\s*'normal'/i);
    assert.match(evidenceBlock, /a\.cancelada\s+is\s+not\s+true/i);
    assert.match(evidenceBlock, /a\.sem_acompanhamento\s+is\s+not\s+true/i);
    assert.match(evidenceBlock, /curso_emusys_depara/i);
    assert.match(evidenceBlock, /d\.unidade_id\s*=\s*a\.unidade_id/i);
    assert.match(evidenceBlock, /d\.emusys_disciplina_id\s*=\s*a\.curso_emusys_id/i);
    assert.match(evidenceBlock, /'aula'[\s\S]*'media'/i);
    assert.match(evidenceBlock, /min\s*\(\s*a\.data_aula\s*\)/i);
    assert.match(evidenceBlock, /emusys_disciplina_id/i);
    assert.match(evidenceBlock, /curso_id/i);

    assert.match(evidenceBlock, /is_projeto_banda/i);
    assert.doesNotMatch(evidenceBlock, /\b(?:c|curso)\.ativo\b/i);
    assert.doesNotMatch(evidenceBlock, /\bqtd_alunos\b|\bturma_nome\b/i);
    assert.doesNotMatch(
      evidenceBlock,
      /(?:reagendada|justificada)\s*=\s*false|not\s+(?:a\.)?(?:reagendada|justificada)/i,
      'reagendada e justificada nao podem ser excluidas',
    );
  },
);

test(
  'temporalidade rejeita sobreposicao, fim futuro e revisao retroativa',
  { skip: !migrationExists },
  () => {
    const saveBlock = extractFunction(
      'salvar_professor_curso_modalidade_atribuicoes_v1',
    );
    const overlapGuard = assertHardenedFunction(
      'fn_professor_curso_modalidade_impedir_sobreposicao_v1',
    );

    assert.match(
      saveBlock,
      /v_atribuicao_id\s+is\s+not\s+null[\s\S]*v_vigencia_inicio\s*<=\s*v_atribuicao\.vigencia_inicio[\s\S]*raise\s+exception[\s\S]*vigencia_inicio[\s\S]*posterior/i,
      'revisar atribuicao existente deve rejeitar inicio igual ou anterior',
    );
    assert.match(
      saveBlock,
      /v_vigencia_fim\s*:=\s*v_vigencia_inicio\s*-\s*1\s*;/i,
      'a atribuicao antiga deve terminar na vespera da nova vigencia',
    );
    assert.doesNotMatch(
      saveBlock,
      /v_vigencia_fim\s*:=\s*greatest\s*\(/i,
      'greatest esconderia uma revisao sobreposta igual ou retroativa',
    );
    assert.match(
      saveBlock,
      /v_vigencia_fim\s*>\s*v_data_local[\s\S]*raise\s+exception[\s\S]*futura/i,
      'encerramento manual nao pode terminar no futuro',
    );
    assert.match(
      saveBlock,
      /v_vigencia_inicio\s*>\s*v_data_local[\s\S]*raise\s+exception[\s\S]*vigencia_inicio[\s\S]*futura/i,
      'criacao e revisao nao podem comecar no futuro',
    );

    const futureStartGuard = saveBlock.search(
      /if\s+v_vigencia_inicio\s*>\s*v_data_local/i,
    );
    const closePreviousAssignment = saveBlock.search(
      /v_vigencia_fim\s*:=\s*v_vigencia_inicio\s*-\s*1\s*;/i,
    );
    assert.ok(futureStartGuard >= 0);
    assert.ok(closePreviousAssignment >= 0);
    assert.ok(
      futureStartGuard < closePreviousAssignment,
      'revisao futura deve falhar antes de encerrar a atribuicao anterior',
    );

    assert.match(overlapGuard, /pg_advisory_xact_lock/i);
    assert.match(
      overlapGuard,
      /new\.vigencia_inicio\s*>\s*v_data_local[\s\S]*raise\s+exception[\s\S]*futura/i,
      'trigger deve impedir vigencia futura mesmo fora das RPCs',
    );
    assert.match(
      overlapGuard,
      /existente\.professor_id\s*=\s*new\.professor_id[\s\S]*existente\.unidade_id\s*=\s*new\.unidade_id[\s\S]*existente\.curso_id\s*=\s*new\.curso_id[\s\S]*existente\.modalidade\s*=\s*new\.modalidade/i,
    );
    assert.match(
      overlapGuard,
      /existente\.vigencia_inicio\s*<=\s*coalesce\s*\(\s*new\.vigencia_fim\s*,\s*'infinity'::date\s*\)[\s\S]*coalesce\s*\(\s*existente\.vigencia_fim\s*,\s*'infinity'::date\s*\)\s*>=\s*new\.vigencia_inicio/i,
      'intervalos inclusivos nao podem se sobrepor, inclusive no historico',
    );
    assert.match(
      sql,
      /create\s+trigger\s+trg_professor_curso_modalidade_impedir_sobreposicao\s+before\s+insert\s+or\s+update\s+on\s+public\.professor_unidade_curso_modalidade[\s\S]{0,180}fn_professor_curso_modalidade_impedir_sobreposicao_v1/i,
      'trigger deve cobrir inclusao manual sem atribuicao_id e revisoes',
    );
  },
);

test(
  'reconciliar respeita encerramento humano e permanece idempotente',
  { skip: !migrationExists },
  () => {
    const saveBlock = extractFunction(
      'salvar_professor_curso_modalidade_atribuicoes_v1',
    );
    const reconcileBlock = extractFunction(
      'reconciliar_professor_curso_modalidade_v1',
    );
    const insertBlock = reconcileBlock.match(
      /with\s+inseridas\s+as\s*\([\s\S]*?returning\s+id\s*\)\s*select\s+count\s*\(\s*\*\s*\)::integer\s+into\s+v_inseridos/i,
    )?.[0] ?? '';

    assert.match(
      saveBlock,
      /if\s+v_acao\s*=\s*'encerrar'[\s\S]*status\s*=\s*'encerrado'[\s\S]*fonte\s*=\s*'revisao'/i,
      'encerramento humano deve deixar historico explicitamente revisado',
    );
    assert.match(
      saveBlock,
      /pg_advisory_xact_lock_shared\s*\(\s*hashtextextended\s*\(\s*'professor_curso_modalidade_reconciliacao_v1'\s*,\s*0\s*\)\s*\)/i,
      'escrita humana deve impedir corrida com o lote sem bloquear outras revisoes',
    );
    assert.match(
      reconcileBlock,
      /pg_advisory_xact_lock\s*\(\s*hashtextextended\s*\(\s*'professor_curso_modalidade_reconciliacao_v1'\s*,\s*0\s*\)\s*\)[\s\S]*fn_professor_curso_modalidade_evidencias_v1/i,
      'reconciliacao deve obter lock exclusivo antes de ler evidencias',
    );
    assert.notEqual(insertBlock, '', 'CTE de insercao deve ser identificavel');
    assert.match(
      insertBlock,
      /not\s+exists\s*\(\s*select\s+1\s+from\s+public\.professor_unidade_curso_modalidade\s+historico_revisado[\s\S]*historico_revisado\.professor_id\s*=\s*e\.professor_id[\s\S]*historico_revisado\.unidade_id\s*=\s*e\.unidade_id[\s\S]*historico_revisado\.curso_id\s*=\s*e\.curso_id[\s\S]*historico_revisado\.modalidade\s*=\s*e\.modalidade/i,
      'segunda reconciliacao deve reconhecer o mesmo grao encerrado pelo humano',
    );
    assert.match(
      insertBlock,
      /historico_revisado\.status\s*=\s*'encerrado'[\s\S]*historico_revisado\.fonte\s*=\s*'revisao'[\s\S]*historico_revisado\.vigencia_inicio\s*<=\s*v_data_local[\s\S]*historico_revisado\.vigencia_fim\s*>=\s*e\.vigencia_inicio/i,
      'historico revisado que sobrepoe a janela da evidencia deve bloquear reinsercao',
    );
    assert.match(
      insertBlock,
      /e\.vigencia_inicio\s*<=\s*v_data_local/i,
      'backfill deve ignorar, sem acionar o trigger, evidencias com inicio futuro',
    );
    assert.match(
      reconcileBlock,
      /v_ignorados\s*:=\s*greatest\s*\(\s*v_total_materializavel\s*-\s*v_atualizados\s*-\s*v_inseridos\s*,\s*0\s*\)/i,
      'candidato suprimido pelo historico humano deve entrar em ignorados',
    );
  },
);

test(
  'diagnosticos contam conflitos, pendencias e descartes no grao correto',
  { skip: !migrationExists },
  () => {
    const reconcileBlock = extractFunction(
      'reconciliar_professor_curso_modalidade_v1',
    );

    assert.match(
      reconcileBlock,
      /into\s+v_ambiguos[\s\S]{0,180}where\s+e\.estado\s*=\s*'conflito_modalidade_jornada_aula'/i,
      'ambiguos deve contar somente conflito real de modalidade',
    );
    assert.match(
      reconcileBlock,
      /into\s+v_pendencias_ignoradas[\s\S]{0,220}where\s+not\s+e\.materializavel[\s\S]*e\.estado\s*<>\s*'conflito_modalidade_jornada_aula'/i,
    );
    assert.match(
      reconcileBlock,
      /v_ignorados\s*:=\s*greatest\s*\([\s\S]*\)\s*\+\s*v_pendencias_ignoradas/i,
    );

    assert.match(
      reconcileBlock,
      /professores_inativos\s+as\s*\([\s\S]*select\s+distinct\s+j\.professor_id\s*,\s*j\.unidade_id[\s\S]*qualidade_vinculo\s+in\s*\(\s*'inativo'\s*,\s*'identidade_historica_inativa'\s*\)[\s\S]*\bunion\b(?!\s+all)[\s\S]*select\s+distinct\s+a\.professor_id\s*,\s*a\.unidade_id/i,
      'inativos preservados devem ser pares distintos e apenas qualidades inativas',
    );
    assert.doesNotMatch(
      reconcileBlock,
      /coalesce\s*\(\s*vinculo\.qualidade_vinculo\s*,\s*'sem_vinculo'\s*\)\s*<>/i,
    );

    assert.match(
      reconcileBlock,
      /projetos_ignorados\s+as\s*\([\s\S]*select\s+distinct\s+j\.professor_id\s*,\s*j\.unidade_id\s*,\s*j\.curso_id[\s\S]*\bunion\b(?!\s+all)[\s\S]*select\s+distinct\s+a\.professor_id\s*,\s*a\.unidade_id\s*,\s*d\.curso_id/i,
      'projeto/banda deve ser deduplicado por combinacao entre jornada e aula',
    );
  },
);

test(
  'modalidade oposta da aula fica ambigua quando a jornada alta cobre o curso',
  { skip: !migrationExists },
  () => {
    const evidenceBlock = extractFunction(
      'fn_professor_curso_modalidade_evidencias_v1',
    );
    const reconcileBlock = extractFunction(
      'reconciliar_professor_curso_modalidade_v1',
    );
    const automaticUpdateBlock = reconcileBlock.match(
      /with\s+atualizadas\s+as\s*\([\s\S]*?returning\s+atribuicao\.id\s*\)/i,
    )?.[0] ?? '';

    assert.match(evidenceBlock, /conflito_modalidade_jornada_aula/i);
    assert.match(
      evidenceBlock,
      /j\.professor_id\s*=\s*a\.professor_id[\s\S]*j\.unidade_id\s*=\s*a\.unidade_id[\s\S]*j\.curso_id\s*=\s*a\.curso_id[\s\S]*j\.modalidade\s*<>\s*a\.modalidade/i,
    );
    assert.match(evidenceBlock, /materializavel[\s\S]*false/i);
    assert.match(
      reconcileBlock,
      /where\s+e\.materializavel/i,
      'reconciliacao so pode persistir evidencias materializaveis',
    );
    assert.match(reconcileBlock, /where\s+not\s+e\.materializavel/i);

    assert.match(sql, /professores_cursos/i);
    assert.match(sql, /pista_professores_cursos_sem_escopo/i);
    assert.doesNotMatch(
      sql,
      /professores_cursos[\s\S]{0,320}(?:cross\s+join|join)\s+public\.professores_unidades/i,
      'professores_cursos deve permanecer somente pista sem produto por unidade',
    );
    assert.notEqual(
      automaticUpdateBlock,
      '',
      'CTE de atualizacao automatica deve ser identificavel',
    );
    assert.doesNotMatch(
      automaticUpdateBlock,
      /status\s*=\s*'encerrado'|\bvigencia_fim\s*=/i,
      'zero aluno ou ausencia de evidencia nao encerra atribuicao',
    );
  },
);

test(
  'tabela nasce privada e service_role recebe no maximo SELECT direto',
  { skip: !migrationExists },
  () => {
    const tableName = 'professor_unidade_curso_modalidade';

    assert.match(
      sql,
      new RegExp(`alter\\s+table\\s+public\\.${tableName}\\s+enable\\s+row\\s+level\\s+security`, 'i'),
    );
    for (const role of ['public', 'anon', 'authenticated']) {
      assert.match(
        sql,
        new RegExp(`revoke\\s+all(?:\\s+privileges)?\\s+on\\s+table\\s+public\\.${tableName}\\s+from\\s+[^;]*\\b${role}\\b`, 'i'),
      );
    }
    for (const role of [
      'fabio_agent',
      'lia_acesso_restrito',
      'mila_acesso_restrito',
      'sol_acesso_restrito',
    ]) {
      assert.match(sql, new RegExp(`['"]${role}['"]`, 'i'));
    }

    assert.match(
      sql,
      new RegExp(`revoke\\s+all(?:\\s+privileges)?\\s+on\\s+table\\s+public\\.${tableName}\\s+from\\s+service_role`, 'i'),
    );
    assert.match(
      sql,
      new RegExp(`grant\\s+select\\s+on\\s+table\\s+public\\.${tableName}\\s+to\\s+service_role`, 'i'),
    );
    assert.doesNotMatch(
      sql,
      new RegExp(`grant\\s+(?:all|[^;]*(?:insert|update|delete|truncate|references|trigger)[^;]*)\\s+on\\s+(?:table\\s+)?public\\.${tableName}\\s+to\\s+service_role`, 'i'),
    );
    assert.doesNotMatch(
      sql,
      new RegExp(`create\\s+policy\\s+[^;]+\\s+on\\s+public\\.${tableName}`, 'i'),
    );
    assert.match(
      sql,
      /create\s+index\s+if\s+not\s+exists\s+idx_professor_curso_modalidade_revisado_por[\s\S]*?\(revisado_por\)[\s\S]*?where\s+revisado_por\s+is\s+not\s+null/i,
      'a FK de revisao humana precisa de indice de cobertura',
    );
  },
);
