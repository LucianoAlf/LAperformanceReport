import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migrationPath = 'supabase/migrations/20260909040936_relatorio_coordenacao_fontes_v4.sql';
const carteiraRosterMigrationPath =
  'supabase/migrations/20260909043652_relatorio_coordenacao_carteira_roster_v4.sql';
const matriculadorSemFallbackMigrationPath =
  'supabase/migrations/20260909045906_relatorio_coordenacao_sem_fallback_legado_v4.sql';

function functionBody(sql, name) {
  const normalized = sql.toLowerCase();
  const start = normalized.indexOf(`function public.${name.toLowerCase()}`);
  assert.notEqual(start, -1, `funcao ${name} deve existir`);
  const next = normalized.indexOf('create or replace function public.', start + 20);
  return sql.slice(start, next === -1 ? sql.length : next);
}

test('ciclo V4 considera somente competencias transcorridas ate a data de corte', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const body = functionBody(sql, 'relatorio_coordenacao_periodos_v4');

  assert.match(body, /fn_health_score_v3_periodo/i);
  assert.match(body, /generate_series/i);
  assert.match(body, /p_data_corte/i);
  assert.match(body, /least\s*\(/i);
  assert.doesNotMatch(body, /current_date\s*\+\s*interval/i);
});

test('carteira historica preserva o fechamento mensal e retira apenas extra exclusivo', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const body = functionBody(sql, 'relatorio_coordenacao_carteira_v4');

  assert.match(body, /professor_carteira_mensal_canonica/i);
  assert.match(body, /get_carteira_professor_periodo_composicao_v1/i);
  assert.match(body, /carteira_so_atividade_extra/i);
  assert.match(body, /greatest\s*\([\s\S]*carteira_alunos[\s\S]*-[\s\S]*carteira_so_atividade_extra/i);
  assert.match(body, /avg\s*\([\s\S]*carteira/i);
  assert.match(body, /meses_observados/i);
});

test('carteira consolidada usa o mesmo roster historico publicado por unidade', () => {
  const sql = fs.readFileSync(carteiraRosterMigrationPath, 'utf8');
  const body = functionBody(sql, 'relatorio_coordenacao_carteira_v4');

  assert.match(body, /montar_relatorio_coordenacao_payload_v3/i);
  assert.match(body, /roster_unidade/i);
  assert.match(body, /join\s+roster_unidade/i);
  assert.match(body, /unidade_id/i);
  assert.match(body, /professor_id/i);
});

test('Matriculador prefere documento comercial fechado e grava identidade estavel', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const body = functionBody(sql, 'relatorio_coordenacao_matriculas_v4');

  assert.match(body, /fechamento_mensal_snapshots/i);
  assert.match(body, /relatorio_comercial_mensal/i);
  assert.match(body, /matriculas_comerciais_v1/i);
  assert.match(body, /professor_experimental_id/i);
  assert.match(body, /capturado_em/i);
  assert.match(body, /created_at/i);
  assert.match(body, /por_professor/i);
  assert.match(body, /matriculas_sem_professor/i);
  assert.doesNotMatch(body, /matriculas_pos_experimental/i);
});

test('Matriculador fechado nunca recorre ao documento gerencial legado', () => {
  const sql = fs.readFileSync(matriculadorSemFallbackMigrationPath, 'utf8');
  const body = functionBody(sql, 'relatorio_coordenacao_matriculas_base_v4');

  assert.match(body, /relatorio_comercial_mensal/i);
  assert.match(body, /matriculas_comerciais_v1/i);
  assert.match(body, /fechamento_comercial_ausente/i);
  assert.match(body, /v_origem_completa\s*:=\s*false/i);
  assert.doesNotMatch(body, /relatorio_gerencial/i);
  assert.doesNotMatch(body, /dados_mes_atual/i);
  assert.doesNotMatch(body, /kpis_comercial/i);
});

test('saidas removem anulacoes e preservam MRR desconhecido como null', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const body = functionBody(sql, 'relatorio_coordenacao_saidas_v4');

  assert.match(body, /is_movimentacao_admin_retencao_valida/i);
  assert.match(body, /coalesce\s*\(\s*m\.anulado\s*,\s*false\s*\)\s*=\s*false/i);
  assert.match(body, /coalesce\s*\(\s*m\.valor_parcela_evasao\s*,\s*m\.valor_parcela_anterior\s*\)/i);
  assert.doesNotMatch(body, /coalesce\s*\(\s*m\.valor_parcela_evasao\s*,\s*m\.valor_parcela_anterior\s*,\s*0/i);
  assert.match(body, /valores_mrr_pendentes/i);
  assert.match(body, /jsonb_build_object\([\s\S]*'valor_mrr'\s*,\s*valor_mrr/i);
});

test('produtor V4 troca apenas fatos operacionais e preserva score e conversao', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const body = functionBody(sql, 'montar_relatorio_coordenacao_conteudo_v4');

  assert.match(body, /montar_relatorio_coordenacao_payload_v3/i);
  assert.doesNotMatch(
    body,
    /get_relatorio_coordenacao_canonico_v3/i,
    'o produtor nao pode depender do nome publico que sera cortado para o leitor V4',
  );
  assert.match(body, /relatorio_coordenacao_carteira_v4/i);
  assert.match(body, /relatorio_coordenacao_matriculas_v4/i);
  assert.match(body, /relatorio_coordenacao_presenca_v4/i);
  assert.match(body, /relatorio_coordenacao_saidas_v4/i);
  assert.match(body, /'numero_alunos'/i);
  assert.match(body, /'presenca'/i);
  assert.match(body, /'matriculas_comerciais'/i);
  assert.match(body, /'origens'/i);
  assert.doesNotMatch(body, /jsonb_set\s*\([^;]*\{score\}/i);
  assert.doesNotMatch(body, /jsonb_set\s*\([^;]*\{metricas,conversao\}/i);
});

test('zero comercial so e publicado quando a origem do periodo esta completa', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const body = functionBody(sql, 'montar_relatorio_coordenacao_conteudo_v4');

  assert.match(body, /origem_completa/i);
  assert.match(body, /case[\s\S]*origem_completa[\s\S]*coalesce[\s\S]*else\s+null/i);
});
