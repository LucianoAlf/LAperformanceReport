import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publico = await readFile(
  new URL("../supabase/functions/_shared/relatorio-publico.ts", import.meta.url),
  "utf8",
);
const edge = await readFile(
  new URL("../supabase/functions/relatorio-admin-whatsapp/index.ts", import.meta.url),
  "utf8",
);

test("validador público bloqueia texto mojibake antes da fila", () => {
  assert.match(publico, /RELATORIO_TEXTO_ENCODING/);
  assert.match(publico, /Mojibake|MOJIBAKE|mojibake/);
  assert.match(publico, /Ã|Â|â|ðŸ|�/);
});

test("produtor administrativo mantém literais UTF-8 na fonte", () => {
  assert.match(edge, /━━━━━━━━━━━━━━━━━━━━━━/);
  assert.match(edge, /📋 \*RELATÓRIO DIÁRIO ADMINISTRATIVO\*/);
  assert.doesNotMatch(edge, /texto \+= `(?:â|ðŸ|Ã|Â)/);
});
