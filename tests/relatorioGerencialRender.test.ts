import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  montarRelatorio,
  narrativaPublicavel,
} from "../supabase/functions/gemini-relatorio-gerencial/index.ts";

Deno.test("renderer gerencial publica julho do Recreio sem inventar fonte ausente", async () => {
  const dados = {
    schema_version: 1,
    status: "fechado",
    unidade: {
      id: "u",
      nome: "Recreio",
      gerente: "Fabiola/Clayton",
      hunter: "Daiana",
    },
    competencia: { ano: 2026, mes: 7 },
    administrativo: {
      resumo: {
        alunos_ativos: 344,
        alunos_pagantes: 336,
        alunos_nao_pagantes: 8,
        bolsistas_integrais: 6,
        bolsistas_parciais: 2,
        novos_alunos: 17,
        matriculas_ativas: 430,
        matriculas_base: 344,
        matriculas_banda: 59,
        matriculas_adicionais: 27,
        alunos_com_exatamente_2_cursos: 25,
        alunos_com_exatamente_3_cursos: 1,
        alunos_com_4_ou_mais_cursos: 0,
        avisos_previos: 10,
      },
      indicadores_financeiros: {
        mrr_atual: 150982.39,
        faturamento_previsto: 150982.39,
        // Recreio/julho-2026 real: base contratual vale 150.982,39, o Emusys
        // faturou 142.925,20 e entrou 141.032,20. Os três precisam ser
        // diferentes na fixture, senão o teste passa mesmo se a leitura voltar
        // a derivar o realizado de mrr - inadimplência.
        faturamento_realizado: 141032.20,
        faturado_emusys: 142925.20,
        ticket_medio: 449.35,
        ltv_medio: 6691.59,
        tempo_permanencia: 14.9,
      },
      indicadores_retencao: {
        churn_rate: 1.79,
        inadimplencia: 1.19,
        inadimplentes: 4,
        total_evasoes: 7,
        nao_renovacoes: 2,
        mrr_perdido: 2412.85,
        taxa_renovacao: 85.19,
        renovacoes_previstas: 27,
        renovacoes_realizadas: 23,
        reajuste_medio: 8.13,
      },
      trancamentos_detalhados: {
        total_alunos: 2,
        total_matriculas: 2,
        itens: [
          {
            aluno_nome: "Layara Sales Magalhães",
            faixa_politica: "extensao_gerencial",
            dias_trancado: 55,
          },
          {
            aluno_nome: "Sergio Roberto Rodriguez",
            faixa_politica: "contratual",
            dias_trancado: 30,
          },
        ],
      },
      evasoes: [
        { motivo: "Dificuldade financeira", tipo_evasao: "interrompido" },
        { motivo: "Troca de unidade", tipo_evasao: "interrompido_bolsista" },
      ],
      nao_renovacoes: [
        { motivo: "Dificuldade financeira" },
        { motivo: "Dificuldade financeira" },
      ],
      avisos_previos: Array.from({ length: 10 }, () => ({ motivo: "Rotina" })),
    },
    comercial: {
      resumo: {
        leads: 297,
        experimentais: 41,
        faltas: 8,
        visitas: 0,
        matriculas: 17,
        taxa_lead_exp: 13.8,
        taxa_exp_mat: 34.1,
        conversoes_exp_mat: 14,
        taxa_lead_mat: 5.7,
        total_passaportes: 6170,
        total_parcelas: 7256,
        ticket_medio_passaporte: 362.94,
        ticket_medio_parcela: 426.82,
      },
      alertas: ["Há cadastro comercial a completar"],
      leads_por_curso: [
        { nome: "Sem curso", quantidade: 176 },
        { nome: "Canto", quantidade: 36 },
      ],
      cobertura_curso_interesse: {
        total_leads: 297,
        detalhamento_disponivel: 296,
        detalhamento_indisponivel: 1,
        curso_declarado_informado: 120,
        curso_declarado_ausente: 176,
        percentual_detalhamento_disponivel: 99.66,
        percentual_curso_declarado_ausente: 59.26,
        fonte: "leads.curso_interesse",
        versao_regra: "curso-interesse-v2",
      },
      leads_por_canal: [{ nome: "Visita/Placa", quantidade: 7 }],
      matriculas_por_canal: [{ nome: "Visita/Placa", quantidade: 7 }],
      matriculas_por_curso: [{ nome: "Canto", quantidade: 8 }],
    },
    rankings: {
      oficiais: [],
      mensais: {
        retencao: {
          status: "oficial",
          tipo: "fechamento_mensal",
          cobertura: "19 de 24 professores",
          regra: "permanencia-media-v1",
          itens: [{ professor: "Matheus Lana da Silva", tempo_medio_permanencia: 20.3 }],
        },
        matriculadores: {
          status: "oficial",
          tipo: "fechamento_mensal",
          cobertura: "8 de 24 professores",
          regra: "conversao-experimental-mensal-v1",
          itens: [{ professor: "Erick Cosme da Silva", matriculas: 4, experimentais: 291, taxa_conversao: 1.37 }],
        },
        presenca: {
          status: "oficial",
          tipo: "fechamento_mensal",
          cobertura: "21 de 24 professores",
          regra: "presenca-media-v1",
          itens: [{ professor: "Willian De Andrade Da Silva", presenca_media: 81.5 }],
        },
        media_turma: {
          status: "oficial",
          tipo: "fechamento_mensal",
          cobertura: "24 de 24 professores",
          regra: "media-alunos-turma-v1",
          itens: [{ professor: "Ana Beatriz Paz de Almeida", media_alunos_turma: 1.5 }],
        },
      },
      destaques_mensais_parciais: {
        presenca: {
          cobertura: "3 de 24 professores",
          regra: "presenca-media-v1",
          itens: [{ professor: "Willian De Andrade Da Silva", presenca_media: 81.5 }],
        },
      },
      retencao: [{
        professor: "Matheus Lana da Silva",
        tempo_medio_permanencia: 20.3,
      }],
      matriculadores: [
        { professor: "Erick Cosme da Silva", matriculas: 4 },
        { professor: "Renan Amorim Guimarães", matriculas: 1 },
      ],
      presenca: [{
        professor: "Willian De Andrade Da Silva",
        presenca_media: 81.5,
      }],
      media_turma: [{
        professor: "Ana Beatriz Paz de Almeida",
        media_alunos_turma: 1.5,
      }],
    },
    metas: {
      mensais: {
        leads: 160,
        experimentais: 38.5,
        matriculas: 21,
        ticket_parcela: 435,
        taxa_renovacao: 90,
        reajuste_medio: 7,
      },
      operacionais: {
        leads: 160,
        matriculas: 21,
        ticket_parcela: 435,
        reajuste_medio: 10,
      },
      fideliza: {
        meta_churn_maximo: 4,
        meta_inadimplencia_maxima: 1,
        meta_renovacao_minima: 90,
        meta_reajuste_minimo: 7,
        meta_lojinha: 3000,
        valor_lojinha: null,
      },
      matriculador: {
        meta_taxa_lead_exp: 18,
        meta_taxa_exp_mat: 75,
        meta_taxa_lead_mat: 13.5,
        meta_volume: 20,
        meta_ticket: 435,
      },
    },
    comparativos: {
      status: "indisponivel",
      disponibilidade: "indisponivel",
      motivo: "fechamento_anterior_incompativel",
    },
  };

  const texto = await montarRelatorio(dados as never, {
    resumo_executivo:
      "A unidade encerrou o mês com visão integrada dos resultados e prioridades claras.",
    conquistas: [
      "A equipe preservou uma base consistente para a próxima competência.",
    ],
    pontos_atencao: [
      "A renovação pede acompanhamento dos casos ainda pendentes.",
    ],
    plano_acao: [
      "Definir responsáveis para cada caso de retenção e oportunidade comercial.",
    ],
    mensagem_final:
      "O fechamento direciona uma gestão objetiva para o próximo ciclo.",
  });

  for (
    const trecho of [
      "Ativos: *344*",
      "MRR / Base contratual: *R$ 150.982,39*",
      "Faturado no Emusys (pago + em aberto): *R$ 142.925,20*",
      "Recebido na competência (pago): *R$ 141.032,20*",
      "No fechamento: *2 alunos / 2 matrículas*",
      "Layara Sales Magalhães — 55 dias",
      "Leads: *297*",
      "Experimental → Matrícula: *34,1%* (14/41)",
      "Ticket médio das novas parcelas: *R$ 426,82*",
      "Ticket médio dos passaportes: *R$ 362,94*",
      "Total de saídas: *7*",
      "Não renovações: *2*",
      "Renovações: *23/27* (85,2%)",
      "RANKINGS DO FECHAMENTO MENSAL",
      "1. Willian De Andrade Da Silva - 81,5%",
      "1. Erick Cosme da Silva - 4 matrículas",
      "LEADS POR CANAL",
      "MATRÍCULAS POR CURSO",
      "Detalhamento histórico indisponível: *1*",
      "Curso de interesse ausente: *176*",
      "Reajuste (8,13%/10,00%)",
      "Reajuste campeão (8,13%/7,00%)",
      "Comparação não disponível",
    ]
  ) assertStringIncludes(texto, trecho);

  assert(!texto.includes("Davi Lima Queiroz"));
  assert(!texto.includes("Mestres da lojinha"));
  assert(!texto.includes("DESTAQUES MENSAIS PARCIAIS (NÃO OFICIAIS)"));
  assert(!/\b(?:RPC|payload|snapshot|camada can[oô]nica)\b/i.test(texto));
  assertEquals((texto.match(/RELATÓRIO GERENCIAL/g) || []).length, 1);
});

Deno.test("narrativa rejeita números por extenso e linguagem de implementação", () => {
  assertEquals(
    narrativaPublicavel(
      "A conversão chegou a oitenta por cento segundo a métrica do sistema.",
    ),
    false,
  );
  assertEquals(
    narrativaPublicavel("A métrica comercial merece acompanhamento da equipe."),
    false,
  );
  assertEquals(
    narrativaPublicavel("A versão atual merece acompanhamento da equipe."),
    false,
  );
  assertEquals(
    narrativaPublicavel("O hash e o schema merecem acompanhamento da equipe."),
    false,
  );
  assertEquals(
    narrativaPublicavel("O snapshot da integração confirma três matrículas."),
    false,
  );
  assertEquals(
    narrativaPublicavel("A fonte da API foi consultada no servidor."),
    false,
  );
  assertEquals(
    narrativaPublicavel(
      "A equipe encerrou o período com prioridades claras para acompanhamento.",
    ),
    true,
  );
});
