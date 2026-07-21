import assert from 'node:assert/strict';
import test from 'node:test';
import {
  maskSqlStringLiterals,
  readSqlContract,
} from './helpers/sqlContractHelpers.mjs';

const migrationRelativePath =
  'supabase/migrations/20260720121000_professor_curso_modalidade_catalogo_v2.sql';
const {
  exists: migrationExists,
  filePath: migrationPath,
  executable: executableSql,
} = readSqlContract(import.meta.url, migrationRelativePath);

function escapeRegExp(value) {
  return value.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&');
}

function extractFunction(functionName) {
  const startPattern = new RegExp(
    'create\\s+or\\s+replace\\s+function\\s+public\\.' +
      escapeRegExp(functionName) +
      '\\s*\\(',
    'i',
  );
  const start = executableSql.search(startPattern);
  assert.notEqual(start, -1, functionName + ' deve existir na migration V2');

  const remainder = executableSql.slice(start);
  const header = remainder.match(
    /create\s+or\s+replace\s+function[\s\S]*?\bas\s+\$([a-z0-9_]*)\$/i,
  );
  assert.ok(header, functionName + ' deve possuir corpo SQL delimitado');

  const delimiter = '$' + header[1] + '$';
  const closing = remainder.indexOf(delimiter + ';', header[0].length);
  assert.notEqual(closing, -1, functionName + ' deve possuir corpo SQL completo');
  return remainder.slice(0, closing + delimiter.length + 1);
}

function assertAulasTipoIsNotAuthoritative(evidenceFunction) {
  const header = evidenceFunction.match(
    /\bas\s+\$([a-z0-9_]*)\$/i,
  );
  assert.ok(header, 'funcao de evidencias deve possuir corpo SQL delimitado');
  const delimiter = '$' + header[1] + '$';
  const bodyStart =
    evidenceFunction.indexOf(delimiter, header.index) + delimiter.length;
  const bodyEnd = evidenceFunction.lastIndexOf(delimiter);
  const identifierSource = maskSqlStringLiterals(
    evidenceFunction.slice(bodyStart, bodyEnd),
  );

  assert.doesNotMatch(
    identifierSource,
    /\baulas_emusys\s*\.\s*"?tipo"?\b/i,
  );

  const sqlKeywords = new Set([
    'cross',
    'full',
    'inner',
    'join',
    'left',
    'on',
    'right',
    'where',
  ]);
  const aliases = [
    ...identifierSource.matchAll(
      /\b(?:from|join)\s+(?:public\.)?aulas_emusys(?:\s+(?:as\s+)?([a-z_][a-z0-9_]*))?/gi,
    ),
  ]
    .map((match) => match[1])
    .filter((alias) => alias && !sqlKeywords.has(alias.toLowerCase()));

  for (const alias of aliases) {
    assert.doesNotMatch(
      identifierSource,
      new RegExp('\\b' + escapeRegExp(alias) + '\\s*\\.\\s*"?tipo"?\\b', 'i'),
      'aulas_emusys.tipo nao pode definir modalidade curricular',
    );
  }

  if (/\b(?:public\.)?aulas_emusys\b/i.test(identifierSource)) {
    const withoutQualifiedTipo = identifierSource.replace(
      /\b[a-z_][a-z0-9_]*\s*\.\s*"?tipo"?\b/gi,
      '',
    );
    assert.doesNotMatch(
      withoutQualifiedTipo,
      /\btipo\b/i,
      'tipo nao qualificado nao pode virar autoridade quando aulas_emusys participa da evidencia',
    );
  }
}

test('Task 4 disponibiliza a migration catalog-driven V2', () => {
  assert.equal(
    migrationExists,
    true,
    migrationPath + ' deve existir antes de validar o contrato V2',
  );
});

test(
  'V2 publica evidencias, materializacao e fila de excecoes versionadas',
  { skip: !migrationExists },
  () => {
    for (const functionName of [
      'fn_professor_curso_modalidade_evidencias_v2',
      'reconciliar_professor_curso_modalidade_v2',
      'get_professor_curso_modalidade_excecoes_v2',
    ]) {
      assert.match(
        executableSql,
        new RegExp(
          'create\\s+or\\s+replace\\s+function\\s+public\\.' +
            escapeRegExp(functionName) +
            '\\s*\\(',
          'i',
        ),
        functionName + ' deve ser criada de forma aditiva',
      );
    }
  },
);

test(
  'evidencia V2 usa jornada canonica e nunca aulas_emusys.tipo como autoridade',
  { skip: !migrationExists },
  () => {
    const evidenceFunction = extractFunction(
      'fn_professor_curso_modalidade_evidencias_v2',
    );

    assert.match(evidenceFunction, /public\.aluno_jornada_matricula_disciplina/i);
    assert.match(evidenceFunction, /public\.emusys_disciplinas_catalogo/i);
    assertAulasTipoIsNotAuthoritative(evidenceFunction);
  },
);

test(
  'fila operacional V2 exclui pistas legadas de professores_cursos',
  { skip: !migrationExists },
  () => {
    const operationalQueue = extractFunction(
      'get_professor_curso_modalidade_excecoes_v2',
    );

    assert.doesNotMatch(operationalQueue, /\bprofessores_cursos\b/i);
  },
);

test(
  'materializacao automatica registra fonte Emusys',
  { skip: !migrationExists },
  () => {
    const reconciliation = extractFunction(
      'reconciliar_professor_curso_modalidade_v2',
    );

    assert.match(reconciliation, /\bfonte\s*=\s*'emusys'/i);
  },
);

test(
  'evidencia V2 resolve catalogo, de-para, identidade formal e jornada por unidade',
  { skip: !migrationExists },
  () => {
    const evidenceFunction = extractFunction(
      'fn_professor_curso_modalidade_evidencias_v2',
    );

    for (const source of [
      'public.emusys_disciplinas_catalogo',
      'public.emusys_professor_disciplinas',
      'public.curso_emusys_depara',
      'public.professores_unidades',
      'public.aluno_jornada_matricula_disciplina',
      'public.aulas_emusys',
    ]) {
      assert.match(evidenceFunction, new RegExp(escapeRegExp(source), 'i'));
    }

    assert.match(evidenceFunction, /formal_sem_aluno/i);
    assert.match(evidenceFunction, /jornada_sem_atribuicao_formal/i);
    assert.match(evidenceFunction, /professor_sem_identidade_local/i);
    assert.match(evidenceFunction, /disciplina_sem_depara/i);
    assert.match(evidenceFunction, /jornada_disciplina_ausente_catalogo/i);
    assert.doesNotMatch(evidenceFunction, /\bprofessores_cursos\b/i);
  },
);

test(
  'materializador exige execucao completa, e idempotente e preserva revisao humana',
  { skip: !migrationExists },
  () => {
    const reconciliation = extractFunction(
      'reconciliar_professor_curso_modalidade_v2',
    );

    assert.match(reconciliation, /status\s*(?:<>|!=)\s*'completa'/i);
    assert.match(reconciliation, /pg_advisory_xact_lock/i);
    assert.match(reconciliation, /fonte\s+in\s*\(\s*'jornada'\s*,\s*'aula'\s*,\s*'emusys'\s*\)/i);
    assert.match(reconciliation, /fonte\s+not\s+in\s*\(\s*'manual'\s*,\s*'revisao'\s*\)/i);
    assert.match(reconciliation, /least\s*\(/i);
    assert.match(reconciliation, /on\s+conflict/i);
    assert.match(reconciliation, /status\s*=\s*'encerrado'/i);
    assert.doesNotMatch(reconciliation, /delete\s+from\s+public\.professor_unidade_curso_modalidade/i);
  },
);

test(
  'fila V2 lista apenas excecoes verdadeiras e permite auditoria separada',
  { skip: !migrationExists },
  () => {
    const operationalQueue = extractFunction(
      'get_professor_curso_modalidade_excecoes_v2',
    );

    for (const state of [
      'professor_sem_identidade_local',
      'disciplina_sem_depara',
      'jornada_disciplina_ausente_catalogo',
      'jornada_sem_atribuicao_formal',
      'id_disciplina_multimodalidade',
      'sobreposicao_temporal',
    ]) {
      assert.match(operationalQueue, new RegExp(state, 'i'));
    }
    assert.match(operationalQueue, /p_incluir_auditoria/i);
    assert.match(operationalQueue, /usuario_tem_permissao/i);
    assert.match(operationalQueue, /professores\.editar/i);
    assert.doesNotMatch(operationalQueue, /\bprofessores_cursos\b/i);
  },
);

test(
  'finalizador conecta V2 somente depois de marcar a execucao completa',
  { skip: !migrationExists },
  () => {
    const finalizer = extractFunction(
      'finalizar_sync_professor_disciplinas_emusys_v1',
    );
    const completePosition = finalizer.search(/status\s*=\s*'completa'/i);
    const reconcilePosition = finalizer.search(/reconciliar_professor_curso_modalidade_v2/i);

    assert.notEqual(completePosition, -1);
    assert.notEqual(reconcilePosition, -1);
    assert.ok(
      reconcilePosition > completePosition,
      'materializacao V2 deve ocorrer depois da execucao completa',
    );
  },
);

test(
  'migration amplia fonte para Emusys e mantem RPCs internas privadas',
  { skip: !migrationExists },
  () => {
    assert.match(
      executableSql,
      /fonte\s+in\s*\(\s*'manual'\s*,\s*'jornada'\s*,\s*'aula'\s*,\s*'revisao'\s*,\s*'emusys'\s*\)/i,
    );
    assert.match(
      executableSql,
      /revoke\s+all\s+on\s+function\s+public\.reconciliar_professor_curso_modalidade_v2\s*\(\s*uuid\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i,
    );
    assert.match(
      executableSql,
      /grant\s+execute\s+on\s+function\s+public\.get_professor_curso_modalidade_excecoes_v2\s*\(\s*uuid\s*,\s*integer\s*,\s*boolean\s*\)\s+to\s+authenticated/i,
    );
  },
);

test(
  'migration preserva V1 e nao executa DROP destrutivo',
  { skip: !migrationExists },
  () => {
    const sqlSemTabelasTemporarias = executableSql.replace(
      /\bdrop\s+table\s+if\s+exists\s+pg_temp\.[a-z0-9_]+\s*;/gi,
      '',
    );

    assert.doesNotMatch(
      sqlSemTabelasTemporarias,
      /\bdrop\s+(?:table|view|materialized\s+view|procedure|type)\b/i,
    );

    for (const functionName of [
      'fn_professor_curso_modalidade_evidencias_v1',
      'reconciliar_professor_curso_modalidade_v1',
      'get_professor_curso_modalidade_reconciliacao_v1',
    ]) {
      const name = escapeRegExp(functionName);
      assert.doesNotMatch(
        executableSql,
        new RegExp(
          '\\bdrop\\s+function\\s+(?:if\\s+exists\\s+)?public\\.' + name + '\\b',
          'i',
        ),
      );
      assert.doesNotMatch(
        executableSql,
        new RegExp(
          'create\\s+or\\s+replace\\s+function\\s+public\\.' + name + '\\s*\\(',
          'i',
        ),
        functionName + ' deve permanecer intacta para rollback',
      );
    }
  },
);
