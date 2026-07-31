import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL(
    "../supabase/functions/sync-presenca-emusys/index.ts",
    import.meta.url,
  ),
  "utf8",
);

function blocoEntre(inicio, fim) {
  const start = source.indexOf(inicio);
  assert.notEqual(start, -1, `inicio nao encontrado: ${inicio}`);
  const end = source.indexOf(fim, start);
  assert.notEqual(end, -1, `fim nao encontrado: ${fim}`);
  return source.slice(start, end);
}

test("declara o modo experimentais e le seu contrato explicito do body", () => {
  assert.match(
    source,
    /type SyncMode\s*=\s*'presenca'\s*\|\s*'agenda'\s*\|\s*'metadados'\s*\|\s*'experimentais'/,
  );
  assert.match(source, /body\.modo\s*===\s*'experimentais'/);
  assert.match(source, /body\.unidade_id/);
  assert.match(source, /body\.data_inicio/);
  assert.match(source, /body\.data_fim/);
});

test("modo experimentais aceita uma unica unidade por UUID e intervalo de ate 45 dias", () => {
  const validacao = blocoEntre(
    "function validarParametrosExperimentais",
    "async function fetchAulasDia",
  );

  assert.match(validacao, /UUID_PATTERN/);
  assert.match(validacao, /unidadeId/);
  assert.match(validacao, /dataInicio/);
  assert.match(validacao, /dataFim/);
  assert.match(validacao, /diasEntreDatas/);
  assert.match(validacao, />\s*45/);
  assert.match(
    validacao,
    /UNIDADES\.find\(\(unidade\)\s*=>\s*unidade\.id\s*===\s*unidadeId\)/,
  );
  assert.match(validacao, /UNIDADE_DESCONHECIDA/);
  assert.doesNotMatch(validacao, /unidade_index/);
});

test("range usa paginacao compartilhada e nunca o fetch tolerante por dia", () => {
  const range = blocoEntre(
    "async function fetchAulasRange",
    "// Converter data_hora_inicio",
  );

  assert.match(range, /buscarTodasAulas\(/);
  assert.match(range, /buscarPaginaAulasEmusys<AulaEmusys>/);
  assert.doesNotMatch(range, /fetchAulasDia/);
  assert.doesNotMatch(range, /\bfetch\(/);
  assert.doesNotMatch(range, /EMUSYS_API/);
});

test("snapshot usa uma unica RPC atomica e so reconcilia depois do sucesso", () => {
  const aplicacao = blocoEntre(
    "async function aplicarSnapshotExperimentais",
    "async function reconciliarExperimentaisOrfas",
  );
  const rpc = aplicacao.indexOf(
    ".rpc('aplicar_snapshot_experimentais_emusys_v1'",
  );
  const reconciliacao = aplicacao.indexOf("reconciliarExperimentaisOrfas(");

  assert.notEqual(rpc, -1);
  assert.equal(
    source.match(/\.rpc\('aplicar_snapshot_experimentais_emusys_v1'/g)?.length,
    1,
  );
  assert.match(aplicacao, /crypto\.randomUUID\(\)/);
  assert.match(aplicacao, /montarLinhasSnapshot\(/);
  assert.match(aplicacao, /if \(error\)\s*throw/);
  assert.ok(reconciliacao > rpc, "reconciliacao deve acontecer depois da RPC");
});

test("resposta do modo experimentais contem apenas unidade, intervalo e agregados", () => {
  const resposta = blocoEntre(
    "function respostaSnapshotSemPii",
    "function validarParametrosExperimentais",
  );
  const branch = blocoEntre(
    "if (modo === 'experimentais')",
    "if (modo === 'metadados')",
  );

  assert.match(resposta, /execucao_id/);
  assert.match(resposta, /linhas_recebidas/);
  assert.match(branch, /respostaSnapshotSemPii/);
  for (
    const pii of [
      "aluno_nome",
      "telefone",
      "data_nascimento",
      "payload",
      "raw_key",
    ]
  ) {
    assert.doesNotMatch(resposta, new RegExp(pii));
    assert.doesNotMatch(branch, new RegExp(pii));
  }
});

test("metadados reutiliza exatamente as aulas carregadas e falha fechado", () => {
  const metadados = blocoEntre(
    "async function sincronizarMetadadosAulas",
    "// Dados coletados de aulas experimentais",
  );
  const branch = blocoEntre(
    "if (modo === 'metadados')",
    "const { data: alunosCanonicos",
  );

  assert.match(metadados, /aulasPorUnidade/);
  assert.match(branch, /metadados\.aulasPorUnidade/);
  assert.match(branch, /await aplicarSnapshotExperimentais\(/);
  assert.doesNotMatch(branch, /fetchAulasRange/);
  assert.doesNotMatch(branch, /Promise\.allSettled/);
  assert.doesNotMatch(branch, /catch\s*\(/);
  assert.match(branch, /snapshots\.push\(/);
});

test("modo experimentais separa erros upstream 502 de falhas internas 500", () => {
  assert.match(source, /class SnapshotUpstreamError extends Error/);
  assert.match(
    source,
    /error instanceof SnapshotUpstreamError[\s\S]{0,40}\?\s*502[\s\S]{0,40}:\s*500/,
  );
  assert.doesNotMatch(
    source,
    /console\.(?:log|error)\([^)]*(?:token|telefone|aluno_nome|payload)/,
  );
});
