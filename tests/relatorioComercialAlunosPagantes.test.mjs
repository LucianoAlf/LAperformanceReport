import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20260811150005_relatorio_comercial_alunos_pagantes.sql",
  import.meta.url,
);

test("payload comercial canonico inclui pagantes da fonte gerencial e retifica julho", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  assert.match(sql, /montar_relatorio_comercial_mensal_payload_sem_pagantes_v1/);
  assert.match(sql, /resumo,alunos_pagantes/);
  assert.match(sql, /kpis_alunos_canonicos,totais,alunos_pagantes/);
  assert.match(sql, /aplicar_retificacao_relatorio_comercial_mensal_v1/);
  assert.match(sql, /relatorio_comercial_alunos_pagantes/);
});
