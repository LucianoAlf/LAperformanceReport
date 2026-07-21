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
  'migration preserva V1 e nao executa DROP destrutivo',
  { skip: !migrationExists },
  () => {
    assert.doesNotMatch(
      executableSql,
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
