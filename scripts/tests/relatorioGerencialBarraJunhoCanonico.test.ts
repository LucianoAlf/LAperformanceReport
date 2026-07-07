import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const migrationPath = 'supabase/migrations/20260706223000_p14_retificar_barra_junho_relatorio_gerencial.sql';
const edgePath = 'supabase/functions/gemini-relatorio-gerencial/index.ts';

assert(existsSync(migrationPath), 'migration P14 deve retificar Barra Jun/2026 para o relatorio gerencial');

const migration = readFileSync(migrationPath, 'utf8');
const edge = readFileSync(edgePath, 'utf8');

for (const expected of [
  'v_alunos_ativos integer := 240',
  'v_alunos_pagantes integer := 238',
  'v_novas_matriculas integer := 15',
  'v_transferencias_recebidas integer := 1',
  'v_matriculas_ativas integer := 265',
  'v_matriculas_base integer := 239',
  'v_ticket_medio numeric := 446.12',
  'v_faturamento_previsto numeric := 106572.88',
  'v_mrr_atual numeric := 96650.30',
  'v_ltv_medio numeric := 5809.52',
  'v_tempo_permanencia numeric := 13.02',
  'v_churn_rate numeric := 1.26',
  'v_inadimplencia numeric := 0.8',
  'v_mrr_perdido numeric := 1181.00',
  "v_total_evasoes_label text := '3+1 bolsista'",
]) {
  assert(migration.includes(expected), `migration deve conter gabarito administrativo: ${expected}`);
}

for (const expected of [
  "dominio = 'relatorio_gerencial'",
  "dominio = 'alunos_admin'",
  "dominio = 'alunos_executivo'",
  'dados_mensais_retificacoes',
  'kpis_gestao',
  'kpis_retencao',
  'total_evasoes_label',
  'faturamento_realizado',
]) {
  assert(migration.includes(expected), `migration deve retificar/auditar ${expected}`);
}

assert(
  edge.includes('totalEvasoesLabel'),
  'relatorio gerencial deve conseguir imprimir evasoes com label canonico, ex: 3+1 bolsista',
);

assert(
  edge.includes('*${totalEvasoesLabel}*'),
  'relatorio gerencial deve imprimir o label canonico de evasoes no texto final',
);

assert(
  edge.includes('faturamento_realizado ?? kpiGestao.mrr'),
  'relatorio gerencial deve preferir MRR atual/faturamento realizado quando existir',
);

assert(
  edge.includes('const novosAlunosGestao = n(kpiGestao.novas_matriculas'),
  'relatorio gerencial deve separar novos alunos administrativos das matriculas comerciais',
);

assert(
  edge.includes('const matriculasComerciais = n('),
  'relatorio gerencial deve manter metricas de funil usando matriculas comerciais',
);


assert(
  edge.includes('tempoPermanencia.toFixed(2)'),
  'relatorio gerencial deve imprimir tempo de permanencia com duas casas para bater com o mensal administrativo',
);

assert(
  edge.includes('pct(churnRate, 2)'),
  'relatorio gerencial deve imprimir churn com duas casas quando o gabarito mensal usa 1.26%',
);

assert(
  edge.includes('pct(reajusteMedio, 2)'),
  'relatorio gerencial deve imprimir reajuste medio com duas casas quando o gabarito mensal usa 10.58%',
);
console.log('relatorioGerencialBarraJunhoCanonico OK');

