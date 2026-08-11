import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repo = process.cwd();
const migration = path.join(
  repo,
  "supabase",
  "migrations",
  "20260811052537_relatorio_gerencial_comparativos_anterior.sql",
);
const migrationFinal = path.join(
  repo,
  "supabase",
  "migrations",
  "20260811150001_relatorio_gerencial_comparativos_anterior_final.sql",
);
const renderer = path.join(
  repo,
  "supabase",
  "functions",
  "gemini-relatorio-gerencial",
  "index.ts",
);

test("o comparativo canônico carrega mês anterior e mesmo mês do ano anterior", () => {
  assert.equal(fs.existsSync(migration), true);
  assert.equal(fs.existsSync(migrationFinal), true);
  const sql = fs.readFileSync(migration, "utf8");
  const sqlFinal = fs.readFileSync(migrationFinal, "utf8");
  assert.match(sql, /v_mes_anterior/);
  assert.match(sql, /v_ano_anterior/);
  assert.match(sql, /ano_anterior/);
  assert.match(sql, /fechamento_mensal_snapshots/);
  assert.match(sql, /dominio_anterior_ausente/);
  assert.match(sql, /payload_anterior_invalido/);
  assert.match(sql, /fingerprint_incompativel/);
  assert.match(sqlFinal, /get_relatorio_gerencial_canonico_comparativos_final_base_v1/);
  assert.match(sqlFinal, /fechamento-equivalente-v2/);
});

test("o renderer publica o motivo estruturado da indisponibilidade", () => {
  const source = fs.readFileSync(renderer, "utf8");
  assert.match(source, /dominios_ausentes/);
  assert.match(source, /mes_anterior/);
  assert.match(source, /ano_anterior/);
  assert.match(source, /payload_anterior_invalido/);
});
