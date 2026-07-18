import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildExportRows,
  buildManifest,
  validateCompetencia,
} from '../supabase/functions/_shared/contasReceberExport.ts';

const UNIDADE_CG = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
const UNIDADE_REC = '95553e96-971b-4590-a6eb-0201d013c14d';

const faturas = [
  {
    id: 'snapshot-item-a',
    canonical_fatura_id: 'fatura-canonica-a',
    sync_run_id: 'run-a',
    unidade_id: UNIDADE_CG,
    unidade_codigo: 'CG',
    emusys_fatura_id: '9007199254740993',
    emusys_matricula_id: '9007199254740995',
    emusys_student_id: '9007199254740997',
    descricao: 'Parcela Julho',
    status: 'paga',
    data_vencimento: '2026-07-10',
    data_pagamento: '2026-07-09',
    competencia: '2026-07-01',
    valor_original: 500,
    valor_pago: 500,
    juros_e_multa: 0,
    desconto_aplicado: 0,
    desconto_fixo: 0,
    desconto_condicional: 0,
    synced_at: '2026-07-17T10:00:00Z',
    updated_at: '2026-07-17T10:00:00Z',
    source_missing: false,
    source_missing_reason: null,
  },
  {
    id: 'snapshot-item-b',
    canonical_fatura_id: 'fatura-canonica-b',
    sync_run_id: 'run-a',
    unidade_id: UNIDADE_REC,
    unidade_codigo: 'REC',
    emusys_fatura_id: 12,
    emusys_matricula_id: 901,
    emusys_student_id: 101,
    descricao: 'Loja palheta',
    status: 'aberta',
    data_vencimento: '2026-07-12',
    data_pagamento: null,
    competencia: '2026-07-01',
    valor_original: 20,
    valor_pago: null,
    juros_e_multa: 2,
    desconto_aplicado: 1,
    desconto_fixo: 0,
    desconto_condicional: 0,
    synced_at: '2026-07-17T10:00:00Z',
    updated_at: '2026-07-17T10:00:00Z',
    source_missing: true,
    source_missing_reason: 'nao_confirmada_na_origem_nesta_competencia',
  },
];

const alunos = [
  { id: 1, nome: 'Alice', unidade_id: UNIDADE_CG, emusys_matricula_id: '9007199254740995', emusys_student_id: '9007199254740997', curso_id: 7 },
  { id: 2, nome: 'Bruno A', unidade_id: UNIDADE_REC, emusys_matricula_id: '901', emusys_student_id: '101', curso_id: 8 },
  { id: 3, nome: 'Bruno B', unidade_id: UNIDADE_REC, emusys_matricula_id: '901', emusys_student_id: '101', curso_id: 9 },
];

const cursos = [
  { id: 7, nome: 'Piano' },
  { id: 8, nome: 'Violao' },
  { id: 9, nome: 'Canto' },
];

test('competencia e obrigatoria e normalizada para o primeiro dia do mes', () => {
  assert.equal(validateCompetencia('2026-07-01'), '2026-07-01');
  assert.throws(() => validateCompetencia('2026-07-10'), /competencia/i);
  assert.throws(() => validateCompetencia(''), /competencia/i);
});

test('join por unidade e matricula preserva uma linha por fatura e explicita duplicidade', async () => {
  const rows = await buildExportRows({ faturas, alunos, cursos });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].cadastro_match_status, 'unico');
  assert.equal(rows[0].la_report_fatura_id, 'fatura-canonica-a');
  assert.equal(rows[0].aluno_nome, 'Alice');
  assert.equal(rows[0].curso_nome, 'Piano');
  assert.equal(rows[0].emusys_fatura_id, '9007199254740993');
  assert.equal(rows[0].emusys_matricula_id, '9007199254740995');
  assert.equal(rows[0].emusys_student_id, '9007199254740997');
  assert.deepEqual(rows[0].curso_candidatos, [{ aluno_id: 1, aluno_nome: 'Alice', curso_id: 7, curso_nome: 'Piano' }]);

  assert.equal(rows[1].cadastro_match_status, 'duplicado');
  assert.equal(rows[1].curso_nome, null);
  assert.equal(rows[1].curso_candidatos.length, 2);
  assert.equal(rows[1].valor_liquido, 21);
});

test('venda avulsa identifica a pessoa pelo aluno sem inventar um curso entre varias matriculas', async () => {
  const avulsa = [{
    ...faturas[0],
    emusys_fatura_id: '77',
    emusys_matricula_id: null,
    emusys_student_id: '623',
    descricao: 'Venda no controle de estoque. Produto: Caderno de cordas.',
  }];
  const alunosDaPessoa = [
    { id: 10, nome: 'Maria Fernanda', unidade_id: UNIDADE_CG, emusys_matricula_id: '372', emusys_student_id: '623', curso_id: 8 },
    { id: 11, nome: 'Maria Fernanda', unidade_id: UNIDADE_CG, emusys_matricula_id: '736', emusys_student_id: '623', curso_id: 9 },
  ];

  const [row] = await buildExportRows({ faturas: avulsa, alunos: alunosDaPessoa, cursos });
  const [rowSemCadastro] = await buildExportRows({ faturas: avulsa, alunos: [], cursos });

  assert.equal(row.cadastro_match_status, 'unico');
  assert.equal(row.aluno_nome, 'Maria Fernanda');
  assert.equal(row.curso_nome, null);
  assert.equal(row.curso_candidatos.length, 2);
  assert.equal(row.row_source_hash, rowSemCadastro.row_source_hash);

  const manifesto = await buildManifest('2026-07-01', [row]);
  const manifestoSemCadastro = await buildManifest('2026-07-01', [rowSemCadastro]);
  assert.equal(manifesto.manifest_hash, manifestoSemCadastro.manifest_hash);
});

test('fronteira Data API converte ids bigint para texto antes do JavaScript', () => {
  const source = readFileSync(
    new URL('../supabase/functions/export-contas-receber/index.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /emusys_fatura_id::text/);
  assert.match(source, /emusys_matricula_id::text/);
  assert.match(source, /emusys_student_id::text/);
  assert.match(source, /select\('id,nome,unidade_id,emusys_matricula_id,emusys_student_id,curso_id'\)/i);
  assert.match(source, /\.in\('emusys_student_id',\s*studentChunk\)/i);
});

test('exportador rejeita identificador numerico fora da faixa segura', async () => {
  const unsafe = [{
    ...faturas[0],
    emusys_fatura_id: Number('9007199254740993'),
  }];

  await assert.rejects(
    () => buildExportRows({ faturas: unsafe, alunos, cursos }),
    /identificador numerico inseguro/i,
  );
});

test('hashes ignoram timestamps volateis e manifest e estavel com qualquer ordem', async () => {
  const rows = await buildExportRows({ faturas, alunos, cursos });
  const changedTimestamps = faturas.map((fatura) => ({
    ...fatura,
    synced_at: '2026-07-17T13:59:00Z',
    updated_at: '2026-07-17T13:59:00Z',
  }));
  const rowsWithChangedTimestamps = await buildExportRows({ faturas: changedTimestamps, alunos, cursos });

  assert.deepEqual(
    rows.map((row) => row.row_source_hash),
    rowsWithChangedTimestamps.map((row) => row.row_source_hash),
  );

  const manifest = await buildManifest('2026-07-01', rows);
  const reversed = await buildManifest('2026-07-01', [...rows].reverse());
  assert.equal(manifest.manifest_hash, reversed.manifest_hash);
  assert.equal(manifest.total_linhas, 2);
});

test('manifesto identifica o ultimo snapshot completo separadamente do run exportado', async () => {
  const rows = await buildExportRows({ faturas, alunos, cursos });
  const manifest = await buildManifest('2026-07-01', rows, {
    id: 'run-solicitado',
    completed_at: '2026-07-18T12:00:00Z',
    unidades_concluidas: 3,
    snapshot_complete: true,
  }, 'run-mais-recente');

  assert.equal(manifest.sync_run_id, 'run-solicitado');
  assert.equal(manifest.latest_complete_sync_run_id, 'run-mais-recente');
});

test('hash canonico ignora ids tecnicos de run/item e reage ao estado de ausencia', async () => {
  const rows = await buildExportRows({ faturas, alunos, cursos });
  const technicalIdsChanged = faturas.map((fatura) => ({
    ...fatura,
    id: `${fatura.id}-novo`,
    sync_run_id: 'run-b',
  }));
  const rowsWithTechnicalIdsChanged = await buildExportRows({
    faturas: technicalIdsChanged,
    alunos,
    cursos,
  });
  assert.deepEqual(
    rows.map((row) => row.row_source_hash),
    rowsWithTechnicalIdsChanged.map((row) => row.row_source_hash),
  );

  const missingReasonChanged = faturas.map((fatura, index) => index === 0
    ? { ...fatura, source_missing: true, source_missing_reason: 'motivo_novo' }
    : fatura);
  const rowsWithMissingReasonChanged = await buildExportRows({
    faturas: missingReasonChanged,
    alunos,
    cursos,
  });
  assert.notEqual(rows[0].row_source_hash, rowsWithMissingReasonChanged[0].row_source_hash);
});
