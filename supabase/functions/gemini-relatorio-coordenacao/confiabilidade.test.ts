/// <reference lib="deno.ns" />

import {
  deepStrictEqual as assertEquals,
  doesNotMatch as assertNotMatch,
  match as assertMatch,
  ok as assert,
} from "node:assert/strict";
import { projetarMapaSinaisPublico } from "./mapaSinaisPublico.ts";

// index.ts only needs to export renderizarRelatorio and gerarNarrativa.
// Type-only imports do not start the Edge server.
type ModuloRelatorio = typeof import("./index.ts");
type Contrato = Parameters<ModuloRelatorio["renderizarRelatorio"]>[0];

const nomesPrioritarios = [
  "Professora Alfa",
  "Professor Beta",
  "Professora Gama",
  "Professor Delta",
  "Professora Epsilon",
];

Deno.test("relatório completo expõe a captura sem confundir com a geração do texto", async () => {
  await comEdgeIsolada(() => import("./index.ts?confiabilidade=captura"), async (edge) => {
    const dados = contratoFixture();
    dados.periodo.data_corte = "2026-08-31";
    dados.documento = { id: "fixture", versao: 1, hash: "fixture", status: "retificado", gerado_em: "2026-09-09T12:00:00Z" };
    const mapa = projetarMapaSinaisPublico(dados.mapa_sinais);
    const narrativa = await edge.gerarNarrativa(dados, mapa, undefined);
    const texto = edge.renderizarRelatorio(dados, narrativa, mapa);
    assertMatch(texto, /Dados considerados até: 31\/08\/2026/);
    assertMatch(texto, /Atualização do documento: 09\/09\/2026, 09:00 \(Brasília\)/);
    assertMatch(texto, /Texto gerado em:/);
  });
});

function contratoFixture(): Contrato {
  const professores: Contrato["professores"] = Array.from(
    { length: 30 },
    (_, i) => ({
      professor_id: i + 1,
      nome: nomesPrioritarios[i] ?? `Professor Exemplo ${i + 1}`,
      score_observado: 90,
      score_comparavel: 90,
      cobertura: i < 27 ? 100 : 80,
      classificacao: "saudavel",
      estado_publicacao: "oficial",
      ranking_habilitado: true,
      estado_evidencia: "avaliacao_oficial",
      pilares_validos: i < 27 ? 5 : 4,
      pilares_esperados: 5,
      comparabilidade_estado: "comparavel",
      metricas: {
        numero_alunos: { valor: 30, amostra: 30, papel: "diagnostico" },
        retencao: { valor: 100, amostra: 10 },
        permanencia: { valor: 12, amostra: 10 },
        media_turma: { valor: 2, amostra: 15 },
        presenca: { valor: 70, numerador: 7, denominador: 10, amostra: 10 },
        conversao: { valor: 75, amostra: 4, peso_efetivo: i < 27 ? 20 : 0 },
      },
    }),
  );

  // Same evidence shape as mapaSinaisPublico.test.ts, entirely synthetic.
  const mapa_sinais: Contrato["mapa_sinais"] = nomesPrioritarios.map((
    professor,
    i,
  ) => ({
    professor_id: i + 1,
    professor,
    sinal: "possivel_sobrecarga",
    severidade: "medio",
    evidencias: {
      carteira: 30,
      p75_unidade: 24,
      retencao: 100,
      meta_retencao: 90,
      presenca: 70,
      meta_presenca: 80,
    },
  }));
  mapa_sinais.push({
    professor_id: 3,
    professor: nomesPrioritarios[2],
    sinal: "concentracao_operacional",
    severidade: "alto",
    evidencias: { capacidade_fisica_excedida: true, turmas: [{ turma_id: 1 }] },
  });

  return {
    schema_version: 4,
    documento: {
      id: "00000000-0000-4000-8000-000000000001",
      versao: 10,
      hash: "fixture-sem-dados-reais",
      status: "retificado",
      gerado_em: "2026-09-09T12:00:00Z",
    },
    periodo: {
      unidade_id: null,
      unidade_nome: "Unidade Exemplo",
      ano: 2026,
      mes: 6,
      inicio: "2026-06-01",
      fim: "2026-08-31",
      periodicidade: "ciclo",
      label: "Jun-Ago/2026",
      ciclo_estado: "fechado",
      publicacao_oficial: true,
      ranking_habilitado: true,
    },
    resumo_equipe: {
      total_professores: 30,
      comparaveis: 30,
      em_maturacao: 0,
      sem_base_operacional: 0,
      saudaveis: 30,
      atencao: 0,
      criticos: 0,
      score_medio_comparavel: 90,
    },
    professores,
    mapa_sinais,
    retencao_permanencia: {},
    presenca: {
      professores_com_evidencia: 30,
      presenca_media: 70,
      eventos_elegiveis: 300,
      ocorrencias_fora_calculo: 0,
      ocorrencias_incompletas: 0,
      ocorrencias_com_conflito: 0,
    },
    experimentais: {
      professores_conversao_pontuando: 27,
      professores_com_conversao_pontuando: 29,
      professores_com_amostra: 30,
      professores_com_amostra_minima: 30,
    },
    carteira_carga: {},
    saidas_retencao: {},
    agenda_treinamentos: {
      catalogo: [
        { nome: "Gestão de turmas", foco: "Distribuição da carteira" },
        { nome: "Engajamento em aula", foco: "Rotina pedagógica" },
      ],
    },
    qualidade_dados: { professores_sem_fonte: 0 },
    ranking_oficial: professores.map((p) => ({
      professor_id: p.professor_id,
      nome: p.nome,
      score: 90,
    })),
  };
}

async function comEdgeIsolada(
  carregar: () => Promise<ModuloRelatorio>,
  executar: (modulo: ModuloRelatorio) => Promise<void>,
  fetchSimulado?: typeof fetch,
): Promise<void> {
  const serveOriginal = Object.getOwnPropertyDescriptor(Deno, "serve");
  const fetchOriginal = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  assert(serveOriginal && fetchOriginal);
  let servidores = 0;
  let requisicoes = 0;

  try {
    // Register no handler, open no socket, and restore globals even on failure.
    Object.defineProperty(Deno, "serve", {
      value: () => {
        servidores++;
      },
    });
    Object.defineProperty(globalThis, "fetch", {
      value: (...args: Parameters<typeof fetch>) => {
        requisicoes++;
        if (fetchSimulado) return fetchSimulado(...args);
        throw new Error("Este teste não permite requisições remotas.");
      },
    });
    const modulo = await carregar();
    assertEquals(
      servidores,
      1,
      "cada teste deve importar uma instância isolada da Edge",
    );
    await executar(modulo);
    assertEquals(
      requisicoes,
      fetchSimulado ? 1 : 0,
      "somente a requisição explicitamente simulada pode ser tentada",
    );
  } finally {
    Object.defineProperty(Deno, "serve", serveOriginal);
    Object.defineProperty(globalThis, "fetch", fetchOriginal);
  }
}

function secao(texto: string, inicio: string, fim: string): string {
  const posicao = texto.indexOf(inicio);
  assert(posicao >= 0, `seção ausente: ${inicio}`);
  const encerramento = texto.indexOf(fim, posicao + inicio.length);
  assert(encerramento > posicao, `seção seguinte ausente: ${fim}`);
  return texto.slice(posicao + inicio.length, encerramento);
}

Deno.test("quinto relatório omite financeiro e preserva indicadores pedagógicos", async () => {
  await comEdgeIsolada(
    () => import("./index.ts?confiabilidade=sem-financeiro"),
    async (edge) => {
      for (const periodicidade of ["mensal", "ciclo"] as const) {
        const dados = contratoFixture();
        dados.periodo.periodicidade = periodicidade;
        Object.assign(dados.saidas_retencao, {
          evasoes_validas: 119, nao_renovacoes_validas: 33,
          saidas_validas_total: 152, saidas_atribuiveis_professor: 15,
          mrr_perdido_total: 53530.95, mrr_perdido_atribuivel: 4365,
          valores_mrr_pendentes: 14, valores_mrr_atribuiveis_pendentes: 4,
          movimentos: [{ valor_mrr: 9876.54 }],
        });
        Object.assign(dados.carteira_carga, { receita: 54321.98, ticket_medio: 4321.98 });
        const original = structuredClone(dados);
        const mapa = projetarMapaSinaisPublico(dados.mapa_sinais);
        const narrativa = await edge.gerarNarrativa(dados, mapa, undefined);
        const texto = edge.renderizarRelatorio(dados, narrativa, mapa);
        assertNotMatch(texto, /MRR|R\$|financeir|receita|ticket|faturamento|53[.,]530[.,]95/i);
        assertMatch(texto, /Saídas válidas totais: \*152\*/);
        assertMatch(texto, /Saídas atribuíveis ao professor: \*15\*/);
        assertMatch(texto, /Presença média observada: \*70,0%\*/);
        assertEquals(dados, original);
      }
    },
  );
});

Deno.test("OpenAI recebe nomes e prioridades sem campos ou valores financeiros", async () => {
  const pedidos: Array<{ url: string; body: { messages: Array<{ role: string; content: string }> } }> = [];
  await comEdgeIsolada(
    () => import("./index.ts?confiabilidade=payload-sem-financeiro"),
    async (edge) => {
      const dados = contratoFixture();
      Object.assign(dados.saidas_retencao, { mrr_perdido_total: 53530.95, valores_mrr_pendentes: 14 });
      Object.assign(dados.carteira_carga, { receita: 98765.43, ticket_medio: 4321.98 });
      dados.agenda_treinamentos.catalogo![0].foco = "Orçamento financeiro R$ 65432,10; receita e ticket";
      dados.agenda_treinamentos.catalogo![0].descricao = "Custo R$ 12345,67";
      Object.assign(dados.mapa_sinais[0].evidencias!, { valor_mrr: 54321.98 });
      const original = structuredClone(dados);
      const mapa = projetarMapaSinaisPublico(dados.mapa_sinais);
      const narrativa = await edge.gerarNarrativa(dados, mapa, "chave-ficticia-sem-acesso-remoto");
      assertEquals(pedidos.length, 1);
      assertEquals(pedidos[0].url, "https://api.openai.com/v1/chat/completions");
      const mensagem = pedidos[0].body.messages.find((item) => item.role === "user")!;
      assertNotMatch(mensagem.content, /MRR|R\$|financeir|receita|ticket|custo|orçamento|53530|65432|12345|98765|54321/i);
      assertEquals(JSON.parse(mensagem.content), {
        prioridades: mapa.prioridades.map(({ professor, direcionamento }) => ({ professor, direcionamento })),
        catalogo_treinamentos: dados.agenda_treinamentos.catalogo!.map(({ nome }) => ({ nome })),
      });
      assertMatch(mensagem.content, /Professora Alfa/);
      assertMatch(JSON.stringify(narrativa), /Professora Alfa/);
      assertNotMatch(JSON.stringify(narrativa), /MRR|R\$|financeir|99999/i);
      assertNotMatch(edge.renderizarRelatorio(dados, narrativa, mapa), /MRR|R\$|financeir|99999/i);
      assertEquals(dados, original);
    },
    (input, init) => {
      pedidos.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        resumo: "MRR R$ 99999", plano_acao: ["Publicar receita R$ 99999"],
        treinamentos: [{ professor: "Professora Alfa", treinamento: "Gestão de turmas", motivo: "MRR R$ 99999" }],
      }) } }] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    },
  );
});

Deno.test("motivos distinguem dado ausente de calendario e permanencia sem trocar o indicador", async () => {
  await comEdgeIsolada(
    () => import("./index.ts?confiabilidade=motivos-operacionais"),
    async (edge) => {
      const dados = contratoFixture();
      dados.professores[0].metricas.retencao = {
        valor: null, codigo_evidencia: "fonte_canonica_sem_evidencia",
        motivo: "nenhuma evidencia canonica emitida para a metrica no periodo",
      };
      dados.professores[0].metricas.permanencia = {
        valor: null, motivo: "nenhum vinculo encerrado elegivel no historico",
      };
      dados.professores[0].metricas.presenca = {
        valor: null, codigo_evidencia: "calendario_sem_aulas_elegiveis",
      };
      delete dados.professores[1].metricas.permanencia;
      for (const professor of dados.professores) {
        professor.metricas.media_turma = { valor: null, amostra: null };
      }
      const mapa = projetarMapaSinaisPublico(dados.mapa_sinais);
      const narrativa = await edge.gerarNarrativa(dados, mapa, undefined);
      const texto = edge.renderizarRelatorio(dados, narrativa, mapa);
      assertMatch(texto, /Retenção atribuível: dados do período indisponíveis/);
      assertMatch(texto, /Permanência com o professor: sem vínculos encerrados elegíveis no histórico/);
      assertMatch(texto, /Permanência com o professor: dados do período indisponíveis/);
      assertMatch(texto, /Presença dos alunos: calendário sem aulas elegíveis/);
      assertNotMatch(texto, /para medir retenção|nenhuma evidencia canonica/);
      assertMatch(texto, /MÉDIA DE ALUNOS POR TURMA: sem destaques disponíveis para este indicador no período/);
    },
  );
});

Deno.test("fallback e relatório completo cobrem as cinco prioridades com um treinamento por pessoa", async () => {
  await comEdgeIsolada(
    () => import("./index.ts?confiabilidade=prioridades"),
    async (edge) => {
      const dados = contratoFixture();
      const mapa = projetarMapaSinaisPublico(dados.mapa_sinais);
      assertEquals(mapa.prioridades.length, 5);
      const narrativa = await edge.gerarNarrativa(dados, mapa, undefined);
      assertEquals(narrativa.pontos_atencao.length, 5);
      assertEquals(narrativa.treinamentos.length, 5);
      assertEquals(
        new Set(narrativa.treinamentos.map((t) => t.professor)).size,
        5,
      );

      const texto = edge.renderizarRelatorio(dados, narrativa, mapa);
      const prioridades = secao(
        texto,
        "*PRIORIDADES PEDAGÓGICAS*",
        "*OPORTUNIDADES DE DISTRIBUIÇÃO*",
      );
      const treinamentos = secao(
        texto,
        "*SUGESTÕES DE TREINAMENTO*",
        "*QUALIDADE DOS DADOS*",
      );
      const atencao = secao(
        texto,
        "*PONTOS DE ATENÇÃO*",
        "*PLANO DE AÇÃO PEDAGÓGICO*",
      );
      for (const prioridade of mapa.prioridades) {
        const sugestoes = narrativa.treinamentos.filter((t) =>
          t.professor === prioridade.professor
        );
        assertEquals(sugestoes.length, 1);
        assert(
          dados.agenda_treinamentos.catalogo!.some((t) =>
            t.nome === sugestoes[0].treinamento
          ),
        );
        assert(sugestoes[0].motivo.length > 0);
        assertEquals(
          narrativa.pontos_atencao.filter((p) =>
            p.startsWith(`${prioridade.professor}:`)
          ).length,
          1,
        );
        assertEquals(
          prioridades.split(`*${prioridade.professor}*`).length - 1,
          1,
        );
        assertEquals(
          treinamentos.split(`${prioridade.professor} →`).length - 1,
          1,
        );
        assertEquals(atencao.split(`${prioridade.professor}:`).length - 1, 1);
      }
    },
  );
});

Deno.test("plano de ação só pede completar cadastro quando há pendência observada", async () => {
  await comEdgeIsolada(
    () => import("./index.ts?confiabilidade=cadastro"),
    async (edge) => {
      const dados = contratoFixture();
      for (const comPendencia of [false, true]) {
        if (comPendencia) {
          dados.mapa_sinais.push({
            professor_id: 1,
            professor: nomesPrioritarios[0],
            sinal: "capacidade_estimada_conferir",
            severidade: "medio",
            evidencias: { turmas: [{ turma_id: 2 }] },
          });
        }
        const mapa = projetarMapaSinaisPublico(dados.mapa_sinais);
        assertEquals(
          mapa.qualidade_capacidade.professores_afetados,
          comPendencia ? 1 : 0,
        );
        const narrativa = await edge.gerarNarrativa(dados, mapa, undefined);
        const texto = edge.renderizarRelatorio(dados, narrativa, mapa);
        const plano = secao(texto, "*PLANO DE AÇÃO PEDAGÓGICO*", "Texto gerado em:");
        const instrucaoCadastro = /Completar os vínculos de turma e sala/;
        if (comPendencia) {
          assertMatch(narrativa.plano_acao.join("\n"), instrucaoCadastro);
          assertMatch(plano, instrucaoCadastro);
        } else {
          assertNotMatch(
            narrativa.plano_acao.join("\n"),
            /cadastr|vínculos de turma e sala/i,
          );
          assertNotMatch(plano, /cadastr|vínculos de turma e sala/i);
          assertMatch(texto, /nenhuma pendência cadastral identificada/);
        }
      }
    },
  );
});

Deno.test("renderer usa conversão pontuando 27 e não as chaves antigas de amostra", async () => {
  await comEdgeIsolada(
    () => import("./index.ts?confiabilidade=conversao"),
    async (edge) => {
      const dados = contratoFixture();
      const mapa = projetarMapaSinaisPublico(dados.mapa_sinais);
      const narrativa = await edge.gerarNarrativa(dados, mapa, undefined);
      const texto = edge.renderizarRelatorio(dados, narrativa, mapa);
      assertMatch(texto, /Conversão compondo a nota histórica: \*27\*/);
      assertNotMatch(texto, /Conversão compondo a nota histórica: \*(29|30)\*/);

      delete dados.experimentais.professores_conversao_pontuando;
      assertMatch(
        edge.renderizarRelatorio(dados, narrativa, mapa),
        /Conversão compondo a nota histórica: \*não informado\*/,
      );
    },
  );
});

Deno.test("renderer separa presença histórica da equipe atual", async () => {
  await comEdgeIsolada(() => import("./index.ts?confiabilidade=historico"), async (edge) => {
    const dados = contratoFixture();
    Object.assign(dados.presenca, {
      professores_com_evidencia: 31, professores_com_evidencia_equipe: 30,
      vinculos_historicos: [{ professor_id: 99, nome: "Professor Histórico", valor: 20, numerador: 1, denominador: 5, amostra: 5 }],
    });
    const mapa = projetarMapaSinaisPublico(dados.mapa_sinais);
    const narrativa = await edge.gerarNarrativa(dados, mapa, undefined);
    const texto = edge.renderizarRelatorio(dados, narrativa, mapa);
    assertMatch(texto, /Professores da equipe atual com eventos elegíveis: \*30 de 30\*/);
    assertMatch(texto, /Professores com eventos elegíveis no período: \*31\*/);
    assertMatch(texto, /Professor Histórico — 20,0% \| Presenças: 1\/5/);
    assertNotMatch(texto, /31 de 30/);
    assertNotMatch(secao(texto, "*RANKING DO CICLO — ORDEM DO PAINEL*", "*AGENDA E TREINAMENTOS*"), /Professor Histórico/);
  });
});

Deno.test("renderer oficial mantém maturação 42 na equipe sem posição no ranking", async () => {
  await comEdgeIsolada(
    () => import("./index.ts?confiabilidade=ranking"),
    async (edge) => {
      const dados = contratoFixture();
      dados.professores.push({
        professor_id: 31,
        nome: "Professor Em Formação",
        estado_evidencia: "professor_em_maturacao",
        comparabilidade_estado: "em_maturacao",
        score_observado: 42,
        score_comparavel: null,
        estado_publicacao: "parcial",
        ranking_habilitado: false,
        metricas: {},
      });
      dados.resumo_equipe.total_professores = 31;
      dados.resumo_equipe.em_maturacao = 1;
      const mapa = projetarMapaSinaisPublico(dados.mapa_sinais);
      const narrativa = await edge.gerarNarrativa(dados, mapa, undefined);
      const texto = edge.renderizarRelatorio(dados, narrativa, mapa);
      const ranking = secao(
        texto,
        "*RANKING DO CICLO — ORDEM DO PAINEL*",
        "*AGENDA E TREINAMENTOS*",
      );
      const posicoes = ranking.split("\n").filter((linha) =>
        /^\d+\. /.test(linha)
      );
      assertEquals(posicoes.length, dados.ranking_oficial!.length);
      for (const professor of dados.ranking_oficial!) {
        assertEquals(
          posicoes.filter((linha) => linha.includes(`${professor.nome} —`))
            .length,
          1,
        );
      }
      assertNotMatch(posicoes.join("\n"), /Professor Em Formação|42,0/);
      assertMatch(
        ranking,
        /^Fora da classificação: Professor Em Formação — desempenho observado 42,0; em acompanhamento\.$/m,
      );
      assertMatch(
        secao(texto, "*PROFESSORES DA EQUIPE*", "*DESTAQUE POR INDICADOR*"),
        /Professor Em Formação[\s\S]*Desempenho observado: 42,0/,
      );
    },
  );
});
