/// <reference lib="deno.ns" />

import { assertEquals, assertMatch, assertNotMatch } from "jsr:@std/assert@1";
import {
  gerarRelatorioCoordenacaoCanonico,
  type RelatorioCoordenacaoCanonicoV2,
} from "./relatorioCoordenacaoCanonico.ts";

Deno.test("quatro relatórios distinguem corte e atualização dos dados da geração do texto", () => {
  const contrato = contratoBase();
  contrato.periodo.data_corte = "2026-08-31";
  for (const tipo of ["ranking", "carteira", "presenca", "retencao"] as const) {
    const texto = gerarRelatorioCoordenacaoCanonico({ tipo, contrato, dataGeracao: new Date("2026-09-09T20:00:00Z") });
    assertMatch(texto, /Dados considerados até: 31\/08\/2026/);
    assertMatch(texto, /Atualização do documento: 09\/09\/2026, 09:00 \(Brasília\)/);
    assertMatch(texto, /Texto gerado em: 09\/09\/2026, 17:00/);
  }
  contrato.periodo.data_corte = undefined;
  contrato.documento!.gerado_em = "inválido";
  const semData = gerarRelatorioCoordenacaoCanonico({ tipo: "presenca", contrato });
  assertMatch(semData, /Dados considerados até: não informado/);
  assertMatch(semData, /Atualização do documento: não informada/);
  assertNotMatch(semData, /Invalid Date/);
  for (const invalido of ["2026-09-09", "2026-02-30T12:00:00Z", "2026-09-09T24:00:00Z"]) {
    contrato.documento!.gerado_em = invalido;
    assertMatch(gerarRelatorioCoordenacaoCanonico({ tipo: "presenca", contrato }), /Atualização do documento: não informada/);
  }
});

function contratoBase(): RelatorioCoordenacaoCanonicoV2 {
  return {
    schema_version: 4,
    documento: {
      id: "00000000-0000-4000-8000-000000000001",
      versao: 10,
      hash: "hash",
      status: "retificado",
      gerado_em: "2026-09-09T12:00:00Z",
    },
    periodo: {
      unidade_id: null,
      unidade_nome: "Consolidado",
      ano: 2026,
      mes: 6,
      inicio: "2026-06-01",
      fim: "2026-08-31",
      periodicidade: "ciclo",
      label: "Jun-Ago/2026",
      publicacao_oficial: true,
      ranking_habilitado: true,
      ciclo_estado: "fechado",
    },
    resumo_equipe: {
      total_professores: 2,
      comparaveis: 1,
      em_maturacao: 0,
      sem_base_operacional: 1,
      score_medio_comparavel: 90,
    },
    professores: [
      {
        professor_id: 1,
        nome: "Professora Completa",
        score_observado: 90,
        score_comparavel: 90,
        cobertura: 100,
        pilares_validos: 1,
        pilares_esperados: 1,
        comparabilidade_estado: "comparavel",
        classificacao: "saudavel",
        estado_publicacao: "oficial",
        ranking_habilitado: true,
        metricas: {
          numero_alunos: { valor: 10, amostra: 10 },
          media_turma: { valor: 2, amostra: 10 },
          permanencia: { valor: 12, amostra: 10 },
          retencao: { valor: 90, amostra: 10 },
          presenca: { valor: 80, amostra: 10, numerador: 8, denominador: 10 },
          conversao: { valor: 50, amostra: 4 },
        },
        operacional: {
          total_turmas: 12,
          alunos_via_turmas: 20,
          turmas_elegiveis_media: 12,
          matriculas_comerciais: 3,
        },
      },
      {
        professor_id: 2,
        nome: "Jonathan Sem Amostra",
        score_observado: null,
        score_comparavel: null,
        cobertura: 0,
        pilares_validos: 0,
        pilares_esperados: 0,
        comparabilidade_estado: "sem_base_operacional",
        estado_publicacao: "sem_base",
        ranking_habilitado: false,
        metricas: {
          numero_alunos: { valor: 1, amostra: 1 },
          media_turma: { valor: 2, amostra: 0 },
          presenca: { valor: null, amostra: 0, numerador: 0, denominador: 0 },
        },
        operacional: {
          total_turmas: 3,
          alunos_via_turmas: 3,
          turmas_elegiveis_media: 3,
          matriculas_comerciais: 0,
        },
      },
    ],
    presenca: {
      presenca_media: 80,
      professores_com_evidencia: 1,
      professores_sem_eventos: 1,
      total_professores: 2,
      eventos_elegiveis: 10,
      presencas_confirmadas: 8,
      ocorrencias_fora_calculo: 3,
      ocorrencias_incompletas: 2,
      ocorrencias_com_conflito: 1,
    },
    carteira_carga: {
      alunos_na_carteira: 11,
      professores_com_carteira_observada: 2,
      media_por_professor: 5.5,
      total_turmas_operacionais: 15,
      ocupacoes_elegiveis: 23,
      turmas_elegiveis: 15,
      turmas_usadas_na_media_individual: 10,
      media_alunos_turma: 1.53,
    },
    retencao_permanencia: {
      retencao_media: 90,
      professores_com_retencao: 1,
    },
    saidas_retencao: {
      evasoes_validas: 2,
      nao_renovacoes_validas: 1,
      saidas_validas_total: 3,
      saidas_atribuiveis_professor: 1,
      mrr_perdido_total: 1000,
      mrr_perdido_atribuivel: 300,
      valores_mrr_pendentes: 2,
      valores_mrr_atribuiveis_pendentes: 1,
      movimentos: [],
    },
    ranking_oficial: [{ professor_id: 1, nome: "Professora Completa", score: 90 }],
  };
}

Deno.test("ranking fechado só é oficial quando toda a equipe comparável foi publicada", () => {
  const contrato = contratoBase();
  const oficial = gerarRelatorioCoordenacaoCanonico({ tipo: "ranking", contrato });
  assertMatch(oficial, /RANKING DO CICLO/);
  assertMatch(oficial, /Indicadores usados na nota: 1\/1/);
  assertNotMatch(oficial, /Cobertura: 100/);
  assertMatch(oficial, /Documento: versão 10 — relatório retificado/);

  contrato.professores[0].estado_publicacao = "parcial";
  contrato.professores[0].ranking_habilitado = false;
  const misto = gerarRelatorioCoordenacaoCanonico({ tipo: "ranking", contrato });
  assertMatch(misto, /LEITURA DIAGNÓSTICA/);
  assertNotMatch(misto, /RANKING DO CICLO/);
});

Deno.test("ranking não aceita quantidade correta com identidades ou notas divergentes", () => {
  const contrato = contratoBase();
  contrato.ranking_oficial![0].professor_id = 999;
  assertNotMatch(gerarRelatorioCoordenacaoCanonico({ tipo: "ranking", contrato }), /RANKING DO CICLO/);
  contrato.ranking_oficial![0].professor_id = 1;
  contrato.ranking_oficial![0].score = 80;
  assertNotMatch(gerarRelatorioCoordenacaoCanonico({ tipo: "ranking", contrato }), /RANKING DO CICLO/);
});

Deno.test("em maturação permanece na equipe sem posição no ranking oficial", () => {
  const contrato = contratoBase();
  Object.assign(contrato.professores[1], {
    comparabilidade_estado: "em_maturacao", score_observado: 42,
  });
  Object.assign(contrato.resumo_equipe, { em_maturacao: 1, sem_base_operacional: 0 });
  const texto = gerarRelatorioCoordenacaoCanonico({ tipo: "ranking", contrato });
  assertMatch(texto, /RANKING DO CICLO/);
  const ranking = texto.split("RANKING DO CICLO")[1].split("EM ACOMPANHAMENTO")[0];
  assertNotMatch(ranking, /2\. Jonathan/);
  assertMatch(texto, /EM ACOMPANHAMENTO — FORA DA CLASSIFICAÇÃO/);
  assertMatch(texto, /Jonathan Sem Amostra — desempenho observado: 42,0; sem posição oficial/);
});

Deno.test("destaque por indicador exige amostra observada", () => {
  const texto = gerarRelatorioCoordenacaoCanonico({ tipo: "ranking", contrato: contratoBase() });
  const secaoMedia = texto.split("🎸 MÉDIA DE ALUNOS POR TURMA")[1]
    .split("🕰 PERMANÊNCIA DOS ALUNOS")[0];
  assertMatch(secaoMedia, /Professora Completa/);
  assertNotMatch(secaoMedia, /Jonathan Sem Amostra/);
});

Deno.test("carteira declara separadamente os dois universos de turmas", () => {
  const texto = gerarRelatorioCoordenacaoCanonico({ tipo: "carteira", contrato: contratoBase() });
  assertMatch(texto, /Turmas operacionais registradas: \*15\*/);
  assertMatch(texto, /Turmas usadas nas médias individuais: \*10\*/);
  assertMatch(texto, /universos diferentes/);
});

Deno.test("carteira conserva a média fracionária em todos os relatórios locais", () => {
  const contrato = contratoBase();
  contrato.carteira_carga.alunos_na_carteira = 52.33;
  contrato.professores[0].metricas.numero_alunos = { valor: 52.33, amostra: 3 };
  const ranking = gerarRelatorioCoordenacaoCanonico({ tipo: "ranking", contrato });
  const carteira = gerarRelatorioCoordenacaoCanonico({ tipo: "carteira", contrato });
  assertMatch(ranking, /Professora Completa — 52,33 alunos na carteira/);
  assertMatch(carteira, /Vínculos de acompanhamento nas carteiras: \*52,33\*/);
  assertMatch(carteira, /Professora Completa — 52,33 vínculos/);
});

Deno.test("presença declara cobertura da equipe e eventos fora do percentual", () => {
  const texto = gerarRelatorioCoordenacaoCanonico({ tipo: "presenca", contrato: contratoBase() });
  assertMatch(texto, /Professores da equipe atual com eventos elegíveis: \*1 de 2\*/);
  assertMatch(texto, /Ocorrências fora do percentual: \*3\*/);
  assertMatch(texto, /Ocorrências com informação incompleta: \*2\*/);
  assertMatch(texto, /sinalizações podem se sobrepor/);
  assertNotMatch(texto, /divergência resolvida/);
  assertNotMatch(texto, /Pendências de evidência: \*0\*/);
});

Deno.test("quatro relatórios locais omitem financeiro sem alterar o contrato nem as saídas", () => {
  for (const periodicidade of ["mensal", "ciclo"] as const) {
    const contrato = contratoBase();
    contrato.periodo.periodicidade = periodicidade;
    contrato.saidas_retencao.movimentos = [53530.95, 0, null].map((valor_mrr, indice) => ({
      id: indice + 1, data: "2026-08-31", tipo: "evasao",
      aluno_nome: `Aluno Fixture ${indice + 1}`, professor_id: 1,
      professor_nome: "Professora Completa", motivo: "Mudança de horário",
      valor_mrr, conta_score_professor: indice === 0,
    }));
    const original = structuredClone(contrato);
    for (const tipo of ["ranking", "carteira", "presenca", "retencao"] as const) {
      const texto = gerarRelatorioCoordenacaoCanonico({ tipo, contrato });
      assertNotMatch(texto, /MRR|R\$|financeir|receita|ticket|faturamento|valor não informado|53[.,]530[.,]95/i);
      assertEquals(contrato, original, "A apresentação não pode apagar dados recebidos");
      if (tipo === "retencao") {
        assertMatch(texto, /Evasões válidas: \*2\*/);
        assertMatch(texto, /Saídas válidas totais: \*3\*/);
        assertMatch(texto, /Saídas atribuíveis ao professor: \*1\*/);
        for (const movimento of contrato.saidas_retencao.movimentos) {
          assertMatch(texto, new RegExp(movimento.aluno_nome));
        }
        assertMatch(texto, /Professor: Professora Completa/);
        assertMatch(texto, /Impacto no indicador do professor: Sim/);
        assertMatch(texto, /Motivo: Mudança de horário/);
      }
    }
  }
});

Deno.test("ciclo aberto nunca publica ranking oficial", () => {
  const contrato = contratoBase();
  contrato.periodo.publicacao_oficial = false;
  contrato.periodo.ranking_habilitado = false;
  contrato.periodo.ciclo_estado = "aberto";
  contrato.professores[0].estado_publicacao = "ciclo_em_acompanhamento";
  contrato.professores[0].ranking_habilitado = false;
  const texto = gerarRelatorioCoordenacaoCanonico({ tipo: "ranking", contrato });
  assertMatch(texto, /Ciclo em acompanhamento/);
  assertMatch(texto, /LEITURA DIAGNÓSTICA/);
  assertNotMatch(texto, /RANKING DO CICLO/);
});

Deno.test("fixture preserva consistência aritmética", () => {
  const contrato = contratoBase();
  assertEquals(contrato.presenca.presencas_confirmadas, 8);
  assertEquals(contrato.presenca.eventos_elegiveis, 10);
  assertEquals(contrato.saidas_retencao.saidas_validas_total, 3);
});

Deno.test("presença histórica entra no total sem virar integrante ou posição oficial", () => {
  const contrato = contratoBase();
  Object.assign(contrato.presenca, {
    professores_com_evidencia: 3,
    professores_com_evidencia_equipe: 1,
    presencas_confirmadas: 9, eventos_elegiveis: 16, presenca_media: 56.3,
    vinculos_historicos: [
      { professor_id: 3, nome: "Professor Histórico", valor: 20, numerador: 1, denominador: 5, amostra: 5 },
      { professor_id: 4, nome: "Professora Histórica", valor: 0, numerador: 0, denominador: 1, amostra: 1 },
    ],
  });
  const texto = gerarRelatorioCoordenacaoCanonico({ tipo: "presenca", contrato });
  assertMatch(texto, /Professores da equipe atual com eventos elegíveis: \*1 de 2\*/);
  assertMatch(texto, /Professores com eventos elegíveis no período: \*3\*/);
  assertMatch(texto, /Presenças confirmadas: \*9\/16\*/);
  assertMatch(texto, /VÍNCULOS HISTÓRICOS NO PERÍODO/);
  assertMatch(texto, /Professor Histórico — 20,0% \| Presenças: 1\/5/);
  assertMatch(texto, /Professora Histórica — 0,0% \| Presenças: 0\/1/);
  assertNotMatch(texto, /3 de 2/);
  assertNotMatch(gerarRelatorioCoordenacaoCanonico({ tipo: "ranking", contrato }), /Professor Histórico|Professora Histórica/);
});
