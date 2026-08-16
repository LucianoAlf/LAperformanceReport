import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildExportRows,
  buildManifest,
  validateCompetencia,
} from '../supabase/functions/_shared/contasReceberExport.ts';
import { prepararExportacaoInadimplenciaCanonica } from '../supabase/functions/_shared/inadimplenciaCanonicaExport.ts';

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
  { id: 1, nome: 'Alice', unidade_id: UNIDADE_CG, emusys_matricula_id: '9007199254740995', curso_id: 7 },
  { id: 2, nome: 'Bruno A', unidade_id: UNIDADE_REC, emusys_matricula_id: '901', curso_id: 8 },
  { id: 3, nome: 'Bruno B', unidade_id: UNIDADE_REC, emusys_matricula_id: '901', curso_id: 9 },
];

const cursos = [
  { id: 7, nome: 'Piano' },
  { id: 8, nome: 'Violao' },
  { id: 9, nome: 'Canto' },
];

const exportFunctionSource = readFileSync(
  new URL('../supabase/functions/export-contas-receber/index.ts', import.meta.url),
  'utf8',
);
const supabaseConfig = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');

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

test('fronteira Data API converte ids bigint para texto antes do JavaScript', () => {
  assert.match(exportFunctionSource, /emusys_fatura_id::text/);
  assert.match(exportFunctionSource, /emusys_matricula_id::text/);
  assert.match(exportFunctionSource, /emusys_student_id::text/);
});

test('modo snapshot, autenticacao propria e respostas 400 ou 409 permanecem preservados', () => {
  assert.match(exportFunctionSource, /x-super-folha-sync-secret/);
  assert.match(exportFunctionSource, /safeEqual\(supplied,\s*INTERNAL_SECRET\)/);
  assert.match(exportFunctionSource, /body\.modo\s*\?\?\s*['"]snapshot['"]/);
  assert.match(exportFunctionSource, /modo deve ser snapshot ou inadimplencia[\s\S]*?400/);
  assert.match(exportFunctionSource, /leitura canonica indisponivel[\s\S]*?409/);
  assert.match(
    supabaseConfig,
    /\[functions\.export-contas-receber\][\s\S]*?verify_jwt\s*=\s*false/,
  );
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

test('exportacao canonica rejeita source_missing em vez de transforma-lo em cobranca', async () => {
  const freshUntil = '2026-08-16T13:00:00.000Z';
  const canonical = {
    schema_version: 3,
    status: 'partial',
    fonte: 'sync_run_items',
    avaliado_em: '2026-08-16T11:31:00.000Z',
    unidade_id: UNIDADE_CG,
    as_of_date: '2026-08-16',
    policy: { delinquency_rule: 'd_plus_0', collection_grace_days: 2 },
    operational: {
      collection_allowed: true,
      collection_scope: 'confirmed_only',
      consumer_must_apply_collection_grace: true,
      block_reasons: [],
    },
    freshness: {
      competencias_necessarias: 1,
      competencias_frescas: 1,
      competencias_stale: 0,
      fresh_until: freshUntil,
    },
    reconciliation: {
      status: 'pending',
      source_missing_count: 1,
      source_missing_open_count: 1,
      source_missing_other_count: 0,
      duplicate_fatura_count: 0,
      invalid_identity_invoice_count: 0,
      contact_resolution_pending_count: 0,
      validation_issue_count: 0,
    },
    totals: {
      total_faturas: 1,
      total_matriculas: 1,
      total_original: 447,
      total_atualizado: 457.58,
      maior_atraso: 11,
    },
    items: [{
      canonical_fatura_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      unidade_id: UNIDADE_CG,
      unidade_codigo: 'CG',
      competencia: '2026-08-01',
      run_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      sync_completed_at: '2026-08-16T11:30:00.000Z',
      sync_fresh_until: freshUntil,
      emusys_fatura_id: '1001',
      emusys_matricula_id: '2001',
      emusys_contrato_id: '3001',
      aluno_id_canonico: 10,
      contact_resolution_status: 'resolved',
      descricao: 'Parcela 08/2026',
      status: 'aberta',
      data_vencimento: '2026-08-05',
      data_pagamento: null,
      dias_atraso: 11,
      valor_original: 447,
      desconto_condicional_perdido: 40,
      multa_pct: 0.02,
      mora_pct_mes: 0.01,
      valor_atualizado: 457.58,
      source_missing: true,
    }],
  };

  await assert.rejects(
    () => prepararExportacaoInadimplenciaCanonica(canonical, {
      unidadeId: UNIDADE_CG,
      asOfDate: '2026-08-16',
      agoraMs: Date.parse('2026-08-16T12:00:00.000Z'),
    }),
    /leitura canonica indisponivel/i,
  );
});
