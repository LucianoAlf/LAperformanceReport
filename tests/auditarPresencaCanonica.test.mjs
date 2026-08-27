import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

import {
  assertReadOnlySql,
  buildShadowClassificationCase,
  decodeRowsBase64,
  decodeRowsGzipBase64,
  decodeRowsJson,
  buildAuditSql,
  normalizeAuditRows,
  parseAuditArgs,
  validateAuditCoverage,
} from '../scripts/auditar-presenca-canonica.mjs';

const AUDIT_SCRIPT = readFileSync('scripts/auditar-presenca-canonica.mjs', 'utf8');
const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));
const AUDIT_SCRIPT_PATH = path.join(REPOSITORY_ROOT, 'scripts/auditar-presenca-canonica.mjs');

const CAMPOS = [
  'sync_completo',
  'aulas_reais',
  'eventos_presente',
  'eventos_falta',
  'eventos_indeterminados',
  'conflitos',
  'rosters_ambiguos',
  'pendencias_agenda',
  'pendencias_relatorio',
  'duplicidade_emusys',
  'colisao_curso',
  'precedencia_humana',
  'politica_temporal',
  'sem_explicacao',
];

function aggregatedRow(overrides = {}) {
  return {
    unidade: 'Barra',
    data: '2026-08-25',
    sync_completo: false,
    sync_completo_motivo: 'sem_ledger_por_unidade_data_no_v1',
    aulas_reais: 0,
    eventos_presente: 0,
    eventos_falta: 0,
    eventos_indeterminados: 0,
    conflitos: 0,
    rosters_ambiguos: 0,
    pendencias_agenda: 0,
    pendencias_relatorio: 0,
    duplicidade_emusys: 0,
    colisao_curso: 0,
    precedencia_humana: 0,
    politica_temporal: 0,
    sem_explicacao: 0,
    recorte_hash: '0123456789abcdef0123456789abcdef',
    ...overrides,
  };
}

function runAuditFrom(cwd, output) {
  const rowsBase64 = Buffer.from(JSON.stringify([aggregatedRow()]), 'utf8').toString('base64');
  return spawnSync(process.execPath, [
    AUDIT_SCRIPT_PATH,
    '--inicio', '2026-08-25',
    '--fim', '2026-08-25',
    '--unidades', 'Barra',
    '--output', output,
  ], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, AUDIT_ROWS_BASE64: rowsBase64 },
  });
}

test('SQL de baseline e somente leitura e cobre os dois calculos de pendencia', () => {
  const sql = buildAuditSql({
    inicio: '2026-07-27',
    fim: '2026-08-25',
    unidades: ['Barra', 'Recreio', 'Campo Grande'],
  });

  assert.doesNotThrow(() => assertReadOnlySql(sql));
  assert.match(sql, /get_agenda_dia/iu);
  assert.match(sql, /fn_presenca_pendencias_do_dia/iu);
  assert.match(sql, /vw_presenca_slot_canonica_v1/iu);
  assert.match(sql, /aula_alunos_emusys/iu);
  for (const campo of CAMPOS) assert.match(sql, new RegExp(`\\b${campo}\\b`, 'u'));
});

test('argumentos aceitam somente periodo ISO e as tres unidades operacionais', () => {
  assert.deepEqual(
    parseAuditArgs([
      '--inicio', '2026-07-27',
      '--fim', '2026-08-25',
      '--unidades', 'Barra,Recreio,Campo Grande',
    ]),
    {
      inicio: '2026-07-27',
      fim: '2026-08-25',
      unidades: ['Barra', 'Recreio', 'Campo Grande'],
      output: null,
    },
  );

  assert.throws(() => parseAuditArgs(['--inicio', '27/07/2026']), /DATA_ISO_INVALIDA/u);
  assert.throws(() => parseAuditArgs(['--unidades', 'Unidade inventada']), /UNIDADE_NAO_PERMITIDA/u);
});

test('saida normalizada contem somente contagens, unidade, data e hashes', () => {
  const [row] = normalizeAuditRows([{
    unidade: 'Barra',
    data: '2026-08-25',
    sync_completo: false,
    sync_completo_motivo: 'sem_ledger_por_unidade_data_no_v1',
    aulas_reais: '10',
    eventos_presente: '7',
    eventos_falta: '2',
    eventos_indeterminados: '1',
    conflitos: '0',
    rosters_ambiguos: '1',
    pendencias_agenda: '3',
    pendencias_relatorio: '2',
    duplicidade_emusys: '1',
    colisao_curso: '0',
    precedencia_humana: '1',
    politica_temporal: '2',
    sem_explicacao: '0',
    recorte_hash: '0123456789abcdef0123456789abcdef',
  }]);

  assert.equal(row.aulas_reais, 10);
  assert.deepEqual(Object.keys(row).sort(), [
    ...CAMPOS,
    'data',
    'recorte_hash',
    'sync_completo_motivo',
    'unidade',
  ].sort());
  assert.equal(JSON.stringify(row).includes('aluno'), false);
});

test('resultado agregado declara ausencia de PII e guard usa a raiz real do repositorio', () => {
  assert.match(AUDIT_SCRIPT, /pii_no_output:\s*true/u);
  assert.match(AUDIT_SCRIPT, /fileURLToPath\(import\.meta\.url\)/u);
  assert.match(AUDIT_SCRIPT, /REPO_ROOT/u);
  assert.doesNotMatch(AUDIT_SCRIPT, /path\.resolve\(process\.cwd\(\)\)/u);
});

test('motivo de sync rejeita texto livre antes de declarar saida sem PII', () => {
  assert.throws(
    () => normalizeAuditRows([aggregatedRow({
      sync_completo_motivo: 'aluna Maria CPF 123.456.789-00',
    })]),
    /SYNC_COMPLETO_MOTIVO_INVALIDO/u,
  );
});

test('output usa raiz real, recusa sobrescrita e bloqueia junction para dentro do repo', () => {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'presenca-audit-'));
  const outsideOutput = path.join(temporaryRoot, 'resultado.json');
  const repositoryTarget = path.join(
    REPOSITORY_ROOT,
    'docs/audits/2026-08-27-presenca-convergencia-execucao.md',
  );
  const linkPath = path.join(temporaryRoot, 'repo-link');

  try {
    const firstWrite = runAuditFrom(temporaryRoot, outsideOutput);
    assert.equal(firstWrite.status, 0, firstWrite.stderr);
    assert.match(readFileSync(outsideOutput, 'utf8'), /"pii_no_output": true/u);

    const overwrite = runAuditFrom(temporaryRoot, outsideOutput);
    assert.equal(overwrite.status, 1, overwrite.stdout);
    assert.match(overwrite.stderr, /OUTPUT_JA_EXISTE/u);

    const insideRepository = runAuditFrom(temporaryRoot, repositoryTarget);
    assert.equal(insideRepository.status, 1, insideRepository.stdout);
    assert.match(insideRepository.stderr, /OUTPUT_DEVE_FICAR_FORA_DO_REPO/u);

    symlinkSync(REPOSITORY_ROOT, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
    const throughLink = runAuditFrom(
      temporaryRoot,
      path.join(linkPath, 'docs/audits/2026-08-27-presenca-convergencia-execucao.md'),
    );
    assert.equal(throughLink.status, 1, throughLink.stdout);
    assert.match(throughLink.stderr, /OUTPUT_DEVE_FICAR_FORA_DO_REPO/u);
  } finally {
    try {
      unlinkSync(linkPath);
    } catch {
      // O link pode nao ter sido criado se a plataforma negar symlink/junction.
    }
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('cobertura exige exatamente um recorte por unidade e dia solicitado', () => {
  const row = (unidade, data) => ({
    unidade,
    data,
    sync_completo: false,
    sync_completo_motivo: 'sem_ledger_por_unidade_data_no_v1',
    aulas_reais: 0,
    eventos_presente: 0,
    eventos_falta: 0,
    eventos_indeterminados: 0,
    conflitos: 0,
    rosters_ambiguos: 0,
    pendencias_agenda: 0,
    pendencias_relatorio: 0,
    duplicidade_emusys: 0,
    colisao_curso: 0,
    precedencia_humana: 0,
    politica_temporal: 0,
    sem_explicacao: 0,
    recorte_hash: '0123456789abcdef0123456789abcdef',
  });
  const args = {
    inicio: '2026-08-24',
    fim: '2026-08-25',
    unidades: ['Barra', 'Recreio', 'Campo Grande'],
  };
  const completas = args.unidades.flatMap((unidade) => [
    row(unidade, '2026-08-24'),
    row(unidade, '2026-08-25'),
  ]);

  assert.equal(validateAuditCoverage(completas, args).length, 6);
  assert.throws(() => validateAuditCoverage(completas.slice(1), args), /COBERTURA_INCOMPLETA/u);
  assert.throws(() => validateAuditCoverage([...completas, completas[0]], args), /RECORTE_DUPLICADO/u);
  assert.throws(
    () => validateAuditCoverage([...completas, row('Barra', '2026-08-26')], args),
    /RECORTE_FORA_DO_PERIODO/u,
  );
});

test('classificador shadow cobre quatro explicacoes e reserva sem_explicacao', () => {
  const expression = buildShadowClassificationCase('comparacao');
  for (const label of [
    'duplicidade_emusys',
    'colisao_curso',
    'precedencia_humana',
    'politica_temporal',
    'sem_explicacao',
  ]) {
    assert.match(expression, new RegExp(`'${label}'`, 'u'));
  }
  assert.throws(() => buildShadowClassificationCase('x;drop table'), /ALIAS_SQL_INVALIDO/u);
});

test('guard de somente leitura rejeita qualquer comando mutante', () => {
  for (const sql of [
    'delete from public.aluno_presenca',
    'update public.aluno_presenca set status = null',
    'insert into public.aluno_presenca default values',
    'create table public.teste(id int)',
  ]) {
    assert.throws(() => assertReadOnlySql(sql), /SQL_NAO_READ_ONLY/u);
  }
});

test('transporte externo entrega somente uma lista JSON em base64', () => {
  const payload = Buffer.from(JSON.stringify([{ unidade: 'Barra' }]), 'utf8').toString('base64');
  assert.deepEqual(decodeRowsBase64(payload), [{ unidade: 'Barra' }]);
  assert.throws(() => decodeRowsBase64('nao-e-json'), /ROWS_BASE64_INVALIDO/u);
});

test('transporte por stdin aceita somente lista JSON', () => {
  assert.deepEqual(decodeRowsJson('[{"unidade":"Recreio"}]'), [{ unidade: 'Recreio' }]);
  assert.throws(() => decodeRowsJson('{"unidade":"Recreio"}'), /ROWS_JSON_INVALIDO/u);
});

test('transporte gzip base64 preserva a lista agregada sem estourar a linha de comando', () => {
  const compactado = zlib.gzipSync('[{"unidade":"Campo Grande"}]').toString('base64');
  assert.deepEqual(decodeRowsGzipBase64(compactado), [{ unidade: 'Campo Grande' }]);
  assert.throws(() => decodeRowsGzipBase64('invalido'), /ROWS_GZIP_BASE64_INVALIDO/u);
});
