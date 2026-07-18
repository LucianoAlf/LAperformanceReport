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
    id: 'fatura-a',
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
  },
  {
    id: 'fatura-b',
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
  },
];

const alunos = [
  { id: 1, nome: 'Alice', unidade_id: UNIDADE_CG, emusys_matricula_id: '9007199254740995', curso_id: 7 },
  { id: 2, nome: 'Bruno A', unidade_id: UNIDADE_REC, emusys_matricula_id: '901', curso_id: 8 },
  { id: 3, nome: 'Bruno B', unidade_id: UNIDADE_REC, emusys_matricula_id: '901', curso_id: 9 },
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

test('fronteira Data API converte ids bigint para texto antes do JavaScript', () => {
  const source = readFileSync(
    new URL('../supabase/functions/export-contas-receber/index.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /emusys_fatura_id::text/);
  assert.match(source, /emusys_matricula_id::text/);
  assert.match(source, /emusys_student_id::text/);
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
