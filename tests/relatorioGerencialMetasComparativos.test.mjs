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
