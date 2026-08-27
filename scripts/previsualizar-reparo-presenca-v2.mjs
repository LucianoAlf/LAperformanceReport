#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const ACTION_KEYS = [
  'estados_snapshot_corrigir',
  'funcoes_live_only_versionar',
  'gemeas_reconciliar',
  'vinculos_roster_soft_inativar',
];

function usage() {
  return [
    'Uso:',
    '  node scripts/previsualizar-reparo-presenca-v2.mjs \\',
    '    --unidade <uuid> --inicio <AAAA-MM-DD> --fim <AAAA-MM-DD>',
    '',
    'Variaveis obrigatorias:',
    '  SUPABASE_URL (ou VITE_SUPABASE_URL)',
    '  SUPABASE_SERVICE_ROLE_KEY',
    '',
    'A execucao e somente leitura. Ela chama apenas as RPCs shadow e dry-run.',
  ].join('\n');
}

function readArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--help' || item === '-h') return { help: true };
    if (!item.startsWith('--')) throw new Error(`argumento inesperado: ${item}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`valor ausente para ${item}`);
    args[item.slice(2)] = value;
    index += 1;
  }
  return args;
}

function assertInput(args) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(args.unidade ?? '')) {
    throw new Error('--unidade deve ser UUID valido');
  }
  for (const field of ['inicio', 'fim']) {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(args[field] ?? '')) {
      throw new Error(`--${field} deve usar AAAA-MM-DD`);
    }
  }
  const inicio = new Date(`${args.inicio}T00:00:00Z`);
  const fim = new Date(`${args.fim}T00:00:00Z`);
  const days = (fim - inicio) / 86_400_000;
  if (!Number.isInteger(days) || days < 0 || days > 120) {
    throw new Error('janela deve ter entre 1 e 121 dias inclusivos');
  }
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  assertInput(args);

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorias');
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const params = {
    p_unidade_id: args.unidade,
    p_data_inicio: args.inicio,
    p_data_fim: args.fim,
  };

  const [shadowResult, previewResult] = await Promise.all([
    supabase.rpc('get_presenca_shadow_comparacao_v2', params),
    supabase.rpc('get_presenca_previa_reparo_v2', params),
  ]);
  if (shadowResult.error) throw new Error(`shadow falhou: ${shadowResult.error.message}`);
  if (previewResult.error) throw new Error(`dry-run falhou: ${previewResult.error.message}`);

  const shadow = shadowResult.data ?? [];
  const preview = previewResult.data;
  if (!preview?.dry_run || preview.backfill_presenca_falta !== false) {
    throw new Error('RPC recusada: resposta nao comprova dry-run sem backfill');
  }
  const receivedKeys = Object.keys(preview.acoes ?? {}).sort();
  if (!sameJson(receivedKeys, ACTION_KEYS)) {
    throw new Error(`categorias de reparo inesperadas: ${receivedKeys.join(', ')}`);
  }

  const integrity = preview.integridade_decisoes_humanas;
  if (!integrity || integrity.alteracao_prevista !== false
      || !sameJson(integrity.antes, integrity.depois)) {
    throw new Error('RPC dry-run retornou marcadores internos inconsistentes');
  }

  const totals = shadow.reduce((acc, row) => {
    for (const field of [
      'contagem_v1', 'contagem_v2', 'delta', 'duplicidade_emusys',
      'colisao_curso', 'roster_fantasma', 'precedencia_humana',
      'politica_temporal', 'sync_incompleto', 'sem_explicacao',
    ]) acc[field] += Number(row[field] ?? 0);
    return acc;
  }, Object.fromEntries([
    'contagem_v1', 'contagem_v2', 'delta', 'duplicidade_emusys',
    'colisao_curso', 'roster_fantasma', 'precedencia_humana',
    'politica_temporal', 'sync_incompleto', 'sem_explicacao',
  ].map((field) => [field, 0])));

  const report = {
    contrato: 'presenca-shadow-v2.1',
    gerado_em: new Date().toISOString(),
    unidade_id: args.unidade,
    periodo: { inicio: args.inicio, fim: args.fim },
    gate: {
      shadow_classificacao_aprovada: totals.sem_explicacao === 0,
      sem_explicacao: totals.sem_explicacao,
      previa_read_only_sem_mutacao_executada: true,
      decisoes_humanas_pos_reparo_verificadas: false,
      reparo_aprovado: false,
      cutover_executado: false,
    },
    totais: totals,
    comparacao_diaria: shadow,
    previa_reparo: preview,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.gate.shadow_classificacao_aprovada) process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`ERRO: ${error.message}\n`);
  process.exitCode = 1;
});
