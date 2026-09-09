/// <reference lib="deno.ns" />
// Valida documentos exportados localmente, sem subir servidor ou permitir IA.
// Uso: deno run --cached-only --allow-read=<arquivo> scripts/validar-render-coordenacao-offline.ts <arquivo>
import assert from "node:assert/strict";
import { projetarMapaSinaisPublico } from "../supabase/functions/gemini-relatorio-coordenacao/mapaSinaisPublico.ts";
import { gerarRelatorioCoordenacaoCanonico } from "../src/lib/relatorioCoordenacaoCanonico.ts";

const arquivo = Deno.args[0];
assert(arquivo, "Informe um arquivo local com array de documentos V4.");
const documentos = JSON.parse(await Deno.readTextFile(arquivo));
assert(Array.isArray(documentos) && documentos.length > 0);
let requisicoes = 0;
let servidores = 0;
const fetchOriginal = Object.getOwnPropertyDescriptor(globalThis, "fetch")!;
const serveOriginal = Object.getOwnPropertyDescriptor(Deno, "serve")!;
Object.defineProperty(globalThis, "fetch", { configurable: true, value: () => {
  requisicoes++;
  throw new Error("Validação offline: nenhuma requisição remota é permitida.");
} });
Object.defineProperty(Deno, "serve", { configurable: true, value: () => {
  servidores++;
  return {};
} });
try {
  const edge = await import("../supabase/functions/gemini-relatorio-coordenacao/index.ts");
  assert.equal(servidores, 1);
  const resultados = [];
  for (const dados of documentos) {
    assert.equal(dados.schema_version, 4);
    const mapa = projetarMapaSinaisPublico(dados.mapa_sinais);
    const narrativa = await edge.gerarNarrativa(dados, mapa, undefined);
    const texto = edge.renderizarRelatorio(dados, narrativa, mapa);
    assert(texto.length > 1000);
    assert(texto.includes(`Documento: versão ${dados.documento.versao}`));
    const equipe = texto.split("*PROFESSORES DA EQUIPE*")[1]?.split("*DESTAQUE POR INDICADOR*")[0];
    assert(equipe, "Seção completa da equipe ausente.");
    assert.equal((equipe.match(/^\d+\) \*/gm) || []).length, dados.professores.length);
    for (const professor of dados.professores) assert(equipe.includes(`*${professor.nome}*`));
    for (const prioridade of mapa.prioridades) {
      assert.equal(narrativa.pontos_atencao.filter((p) => p.startsWith(`${prioridade.professor}:`)).length, 1);
      assert.equal(narrativa.treinamentos.filter((t) => t.professor === prioridade.professor).length, 1);
    }
    assert.equal(new Set(narrativa.treinamentos.map((t) => t.professor)).size, narrativa.treinamentos.length);
    assert(texto.includes(`Conversão compondo a nota histórica: *${dados.experimentais.professores_conversao_pontuando}*`));
    assert(!/MRR|R\$|roster incompleto|unidade em auditoria|Cobertura: 100/.test(texto));
    const locais = Object.fromEntries((["ranking", "carteira", "presenca", "retencao"] as const)
      .map((tipo) => [tipo, gerarRelatorioCoordenacaoCanonico({ tipo, contrato: dados })]));
    for (const [tipo, local] of Object.entries(locais)) {
      assert(local.includes(`Documento: versão ${dados.documento.versao}`), tipo);
      assert(!/MRR|R\$|roster incompleto|unidade em auditoria|Cobertura: 100/.test(local), tipo);
    }
    if (!dados.periodo.publicacao_oficial || !dados.periodo.ranking_habilitado) {
      for (const relatorio of [texto, ...Object.values(locais)]) {
        assert(!/RANKING OFICIAL|Ciclo oficial fechado\./.test(relatorio), "Diagnóstico não é publicação oficial.");
      }
    }
    const destaques = (relatorio: string, titulo: string) => {
      const linhas = relatorio.split("\n");
      const inicio = linhas.indexOf(titulo);
      const resultado: string[] = [];
      if (inicio < 0) return resultado;
      for (const linha of linhas.slice(inicio + 1)) {
        if (/^\d+\. /.test(linha)) resultado.push(linha);
        else if (linha.trim() || resultado.length) break;
      }
      return resultado;
    };
    for (const titulo of ["👥 MAIOR CARTEIRA", "🎸 MÉDIA DE ALUNOS POR TURMA", "🕰 PERMANÊNCIA DOS ALUNOS", "🔄 RETENÇÃO DE ALUNOS", "📅 PRESENÇA DOS ALUNOS", "🎓 MATRICULADOR", "🎯 CONVERSÃO DE EXPERIMENTAIS"]) {
      assert.deepEqual(destaques(locais.ranking, titulo), destaques(texto, titulo), `${dados.periodo.unidade_nome}/${dados.periodo.label}: ${titulo}`);
    }
    if (Array.isArray(dados.saidas_retencao.movimentos)) {
      assert.equal((locais.retencao.match(/^\d+\) /gm) || []).length, dados.saidas_retencao.movimentos.length);
    }
    resultados.push({ unidade: dados.periodo.unidade_nome, periodo: dados.periodo.label,
      versao: dados.documento.versao, professores: dados.professores.length,
      prioridades: mapa.prioridades.length, conversao_pontuando: dados.experimentais.professores_conversao_pontuando,
      caracteres: texto.length, relatorios: 5, destaques_identicos: 7 });
  }
  assert.equal(requisicoes, 0);
  console.log(JSON.stringify({ ok: true, requisicoes_remotas: requisicoes, resultados }));
} finally {
  Object.defineProperty(globalThis, "fetch", fetchOriginal);
  Object.defineProperty(Deno, "serve", serveOriginal);
}
