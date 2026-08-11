import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repo = process.cwd();
const migration = path.join(
  repo,
  "supabase",
  "migrations",
  "20260811150002_relatorio_gerencial_metas_kpi_diagnostico_comparativo.sql",
);
const renovacoesMigration = path.join(
  repo,
  "supabase",
  "migrations",
  "20260811150003_relatorio_admin_mensal_renovacoes_mesma_fonte.sql",
);
const fechamentoUnidadeMigration = path.join(
  repo,
  "supabase",
  "migrations",
  "20260811150004_relatorio_mensal_fechar_unidade_seguro.sql",
);
const renderer = path.join(
  repo,
  "supabase",
  "functions",
  "gemini-relatorio-gerencial",
  "index.ts",
);

test("o produtor canônico lê metas KPI da competência e preserva a fonte", () => {
  assert.equal(fs.existsSync(migration), true);
  const sql = fs.readFileSync(migration, "utf8");
  assert.match(sql, /metas_kpi/);
  assert.match(sql, /jsonb_object_agg/);
  assert.match(sql, /metas_operacionais/);
  assert.match(sql, /fonte.*metas_kpi/i);
});

test("o diagnóstico do comparativo identifica a causa da captura histórica bloqueada", () => {
  assert.equal(fs.existsSync(migration), true);
  const sql = fs.readFileSync(migration, "utf8");
  assert.match(sql, /RENOVACOES_MENSAL_DIVERGENTE/);
  assert.match(sql, /dominio_anterior_ausente/);
  assert.match(sql, /bloqueio_captura/);
  assert.match(sql, /capturar_relatorios_mensais_canonicos_v1/);
});

test("experimentais realizadas usa a meta operacional carregada", () => {
  const source = fs.readFileSync(renderer, "utf8");
  assert.match(source, /comercialResumo\.experimentais/);
  assert.match(source, /metasOperacionais\.experimentais/);
});

test("renovacoes do resumo e da lista usam a mesma fonte filtrada", () => {
  assert.equal(fs.existsSync(renovacoesMigration), true);
  const sql = fs.readFileSync(renovacoesMigration, "utf8");
  assert.match(sql, /base_v2_legacy_20260811/);
  assert.match(sql, /filtrar_renovacoes_admin_retencao_validas_v1/);
  assert.match(sql, /jsonb_build_object\(\s*'renovacoes_realizadas',\s*jsonb_array_length\(v_renovacoes_validas\)/s);
  assert.doesNotMatch(sql, /v_retencao->>'renovacoes_realizadas'/);
});

test("fechamento historico isolado nao toca outras unidades", () => {
  assert.equal(fs.existsSync(fechamentoUnidadeMigration), true);
  const sql = fs.readFileSync(fechamentoUnidadeMigration, "utf8");
  assert.match(sql, /fechar_relatorio_mensal_canonico_unidade_v1/);
  assert.match(sql, /s\.unidade_id = p_unidade_id/);
  assert.match(sql, /escopo_isolado/);
  assert.match(sql, /grant execute[\s\S]*to service_role/i);
});
