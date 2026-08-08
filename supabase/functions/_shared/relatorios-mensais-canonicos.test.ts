/// <reference lib="deno.ns" />

import {
  assertEquals,
  assertFalse,
  assertStringIncludes,
  assertThrows,
} from "jsr:@std/assert@1";
import {
  formatarRelatorioAdminMensalCanonico,
  formatarRelatorioComercialMensalCanonico,
} from "./relatorios-mensais-canonicos.ts";

const base = {
  schema_version: 1,
  competencia: { ano: 2026, mes: 7, inicio: "2026-07-01", fim_exclusivo: "2026-08-01" },
  unidade: { id: "u1", nome: "Recreio", codigo: "RC" },
  capturado_em: "2026-08-01T00:12:32Z",
  fuso: "America/Sao_Paulo",
};

const adminRico = {
  ...base,
  tipo: "administrativo",
  unidade: { ...base.unidade, gerente: "Fabiola/Clayton", farmers: ["Fernanda", "Daiana", "fernanda"] },
  gerado_em: "2026-08-01T13:30:00Z",
  trancamentos_periodo: 3,
  resumo: {
    alunos_ativos: 344,
    alunos_pagantes: 336,
    alunos_nao_pagantes: 8,
    alunos_trancados: 2,
    matriculas_trancadas: 2,
    bolsistas_integrais: 6,
    bolsistas_parciais: 2,
    matriculas_ativas: 430,
    matriculas_base: 344,
    matriculas_banda: 59,
    matriculas_adicionais: 27,
    matriculas_adicionais_extras: 1,
    matriculas_coral: 0,
    alunos_com_exatamente_2_cursos: 25,
    alunos_com_exatamente_3_cursos: 1,
    alunos_com_4_ou_mais_cursos: 0,
    novos_alunos: 17,
    transferencias_recebidas: 0,
    renovacoes_realizadas: 1,
    nao_renovacoes: 2,
    avisos_previos: 1,
    evasoes: 7,
  },
  indicadores_financeiros: {
    ticket_medio: 449.35,
    faturamento_previsto: 150982.39,
    // Recreio/julho-2026 real: a base contratual vale 150.982,39, o Emusys
    // faturou 142.925,20 e entrou 141.032,20. Os três precisam ser diferentes
    // na fixture, senão o teste passa mesmo se a leitura voltar a derivar o
    // realizado de mrr - inadimplência.
    faturamento_realizado: 141032.20,
    faturado_emusys: 142925.20,
    mrr_atual: 150982.39,
    ltv_medio: 6691.59,
    tempo_permanencia: 14.9,
    fonte: "kpis_alunos_canonicos.totais + financeiro_faturas_emusys",
  },
  indicadores_retencao: {
    churn_rate: 1.79,
    taxa_renovacao: 50,
    reajuste_medio: 8.13,
    inadimplentes: 4,
    inadimplencia: 1.19,
    mrr_perdido: 2412.85,
    total_evasoes: 7,
    nao_renovacoes: 2,
    renovacoes_previstas: 2,
    renovacoes_realizadas: 1,
  },
  metas_fideliza: {
    churn_rate: 4,
    inadimplencia: 1.5,
    taxa_renovacao: 90,
    reajuste_medio: 10,
  },
  renovacoes: [{
    aluno_nome: "Lohan Marques Boente",
    valor_parcela_anterior: 453.6,
    valor_parcela_novo: 498.96,
    forma_pagamento: "C.R",
    agente_comercial: "Fernanda e Daiana",
  }],
  nao_renovacoes: [{
    aluno_nome: "Joachim Krull Carrez",
    valor_parcela_anterior: 420,
    valor_parcela_novo: 0,
    professor: "Não informado",
    motivo: "Dificuldade financeira",
  }, {
    aluno_nome: "Davi dos Santos Amaral",
    valor_parcela_anterior: 397.85,
    valor_parcela_novo: 0,
    professor: "Joel de Salles Gouveia Filho",
    motivo: "Dificuldade financeira",
  }],
  avisos_previos: [{
    aluno_nome: "Lis Diolinda da Cruz",
    motivo: "Incompatibilidade de horário",
    professor: "Leticia de Almeida Palmeira",
  }],
  evasoes: [{
    aluno_nome: "Daniel Monteiro de Castro Landim",
    tipo_evasao: "interrompido",
    valor_perdido: 390,
    motivo: "Dificuldade financeira",
    professor: "Isaque Mendes da Silva",
  }, {
    aluno_nome: "Samuel Silveira Noronha",
    tipo_evasao: "interrompido",
    valor_perdido: 395,
    motivo: "Desistência",
    professor: "Willian De Andrade Da Silva",
  }, {
    aluno_nome: "Miguel Rodrigues Furtado",
    tipo_evasao: "interrompido",
    valor_perdido: 415,
    motivo: "Mudança de endereço",
    professor: "Leticia de Almeida Palmeira",
  }, {
    aluno_nome: "Bernardo Pereira Magalhães",
    tipo_evasao: "interrompido",
    valor_perdido: 395,
    motivo: "Dificuldade financeira",
    professor: "Larissa Bheattriz Barbosa Santos",
  }, {
    aluno_nome: "Ana Beatriz Paz de Almeida",
    tipo_evasao: "interrompido_bolsista",
    valor_perdido: 0,
    motivo: "Troca de Unidade",
    professor: "Lohana Leopoldo de Araújo",
  }],
  novos_alunos: [],
  transferencias: [],
  trancamentos_detalhados: {
    data_referencia: "2026-07-31",
    total_alunos: 2,
    total_matriculas: 2,
    politica: { prazo_contratual_meses: 1, extensao_gerencial_meses: 1, limite_total_meses: 2 },
    itens: [{
      aluno_nome: "Davi Lima Queiroz",
      curso_nome: null,
      data_inicio: null,
      data_final: null,
      dias_trancado: null,
      faixa_politica: "data_ausente",
      motivo: null,
    }, {
      aluno_nome: "Layara Sales Magalhães",
      curso_nome: "Guitarra",
      data_inicio: "2026-06-06",
      data_final: "2026-07-31",
      dias_trancado: 55,
      faixa_politica: "extensao_gerencial",
      motivo: "Aluna não está vindo",
    }],
  },
};

Deno.test("mensal administrativo preserva modelo rico, multicurso e trancamentos", () => {
  const texto = formatarRelatorioAdminMensalCanonico(adminRico);

  assertStringIncludes(texto, "📊 *RELATÓRIO MENSAL ADMINISTRATIVO*");
  assertStringIncludes(texto, "📅 *JULHO/2026*");
  assertStringIncludes(texto, "👥 Por Fernanda e Daiana");
  assertStringIncludes(texto, "• Matrículas Ativas: *430* (344 base alunos + 59 banda + 27 adicionais)");
  // 25 com exatamente 2 cursos + 1 com 3 = 26 pessoas, gerando 27 matrículas
  // adicionais. A ADM comparou 26 com a linha "2 cursos: 25" e reportou erro;
  // o total explícito é o que desfaz a confusão.
  assertStringIncludes(texto, "- Alunos com curso adicional: *26* (27 matrículas)");
  assertStringIncludes(texto, "- Alunos com 3 cursos: *1*");
  assertStringIncludes(texto, "• Trancamentos no período: *3* (matrículas)");
  assertStringIncludes(texto, "⏸️ *TRANCAMENTOS ATUAIS (2 alunos / 2 matrículas)*");
  assertStringIncludes(texto, "Nome: *Davi Lima Queiroz*");
  assertStringIncludes(texto, "Tempo trancado: Não calculável");
  assertStringIncludes(texto, "Retorno previsto: 31/07/2026");
  assertStringIncludes(texto, "Situação: *EXTENSÃO GERENCIAL*");
  assertStringIncludes(texto, "💰 *KPIs FINANCEIROS*");
  assertStringIncludes(texto, "• MRR / Base contratual: *R$ 150.982,39*");
  assertStringIncludes(texto, "• Faturado no Emusys (pago + em aberto): *R$ 142.925,20*");
  assertStringIncludes(texto, "• Recebido na competência (pago): *R$ 141.032,20*");
  assertStringIncludes(texto, "• LTV (Tempo × Ticket): *R$ 6.691,59*");
  assertStringIncludes(texto, "📈 *KPIs DE RETENÇÃO*");
  assertStringIncludes(texto, "• Churn de alunos pagantes: *1,8%* — 6 saídas em 336 pagantes");
  assertStringIncludes(texto, "• Saídas totais: *7* (6 pagantes + 1 bolsista)");
  assertStringIncludes(texto, "• Inadimplência: *1,2%*");
  assertStringIncludes(texto, "🎯 *METAS FIDELIZA+ LA*");
  assertStringIncludes(texto, "Forma de PG: C.R");
  assertStringIncludes(texto, "⚠️ *AVISOS PRÉVIOS para sair em AGOSTO*");
  assertStringIncludes(texto, "• Total no mês: *7*");
  assertStringIncludes(texto, "• Interrompido: *4*");
  assertStringIncludes(texto, "• Interrompido Bolsista: *1*");
  assertStringIncludes(texto, "• Não renovou: *2*");
  assertStringIncludes(texto, "📅 Gerado em: 01/08/2026 às 10:30");

  const secoes = [
    "👥 *ALUNOS*",
    "📚 *MATRÍCULAS*",
    "⏸️ *TRANCAMENTOS ATUAIS",
    "💰 *KPIs FINANCEIROS*",
    "📈 *KPIs DE RETENÇÃO*",
    "🎯 *METAS FIDELIZA+ LA*",
    "🔄 *RENOVAÇÕES DO MÊS*",
    "❌ *NÃO RENOVAÇÕES DO MÊS*",
    "⚠️ *AVISOS PRÉVIOS",
    "🚪 *EVASÕES (Saíram no mês)*",
  ];
  const posicoes = secoes.map((secao) => texto.indexOf(secao));
  assertFalse(posicoes.includes(-1));
  assertEquals([...posicoes].sort((a, b) => a - b), posicoes);

  for (const proibido of ["snapshot", "payload", "get_", "rpc", "endpoint", "hash"]) {
    assertFalse(texto.toLowerCase().includes(proibido));
  }
  assertFalse(/\(\d+\/\d+\)/.test(texto));
});

Deno.test("mensal administrativo bloqueia detalhe divergente do total oficial", () => {
  assertThrows(
    () => formatarRelatorioAdminMensalCanonico({
      ...adminRico,
      resumo: { ...adminRico.resumo, renovacoes_realizadas: 2 },
    }),
    Error,
    "RELATORIO_ADMIN_MENSAL_DIVERGENTE:renovacoes",
  );
});

Deno.test("mensal administrativo bloqueia churn que mistura não pagantes", () => {
  assertThrows(
    () => formatarRelatorioAdminMensalCanonico({
      ...adminRico,
      indicadores_retencao: {
        ...adminRico.indicadores_retencao,
        churn_rate: 2.08,
      },
    }),
    Error,
    "RELATORIO_ADMIN_MENSAL_DIVERGENTE:churn_pagantes",
  );
});

Deno.test("mensal comercial exibe valores, dois tickets e taxa com alerta", () => {
  const texto = formatarRelatorioComercialMensalCanonico({
    ...base,
    tipo: "comercial",
    unidade: { ...base.unidade, hunter: "Clayton" },
    resumo: {
      leads: 297,
      experimentais: 41,
      faltas: 8,
      visitas: 0,
      matriculas: 17,
      conversoes_exp_mat: 14,
      pendencias_conciliacao: 5,
      taxa_lead_exp: 13.8,
      taxa_exp_mat: 34.1,
      taxa_lead_mat: 5.7,
      total_passaportes: 6170,
      total_parcelas: 6861,
      ticket_medio_passaporte: 362.94,
      ticket_medio_parcela: 403.59,
    },
    leads_por_canal: [{ nome: "Instagram", quantidade: 100 }],
    leads_por_curso: [{ nome: "Canto", quantidade: 90 }],
    matriculas_por_canal: [],
    matriculas_por_curso: [],
    matriculas: [{
      id: "m1",
      nome: "Benjamin",
      idade: 10,
      data_matricula: "2026-07-31",
      cursos: "Canto",
      professores: "Erick",
      professores_experimentais: "Erick",
      formas_pagamento: "Pix",
      canal: "Visita/Placa",
      valor_passaporte: 330,
      valor_parcela: 400,
      parcelas: [400],
    }],
    alertas: ["5 pendencia(s) de conciliacao em auditoria"],
  });

  assertStringIncludes(texto, "RELATÓRIO MENSAL COMERCIAL");
  assertStringIncludes(texto, "Ticket médio dos passaportes: *R$ 362,94*");
  assertStringIncludes(texto, "Ticket médio das parcelas: *R$ 403,59*");
  assertStringIncludes(texto, "Experimental → Matrícula: *34,1%* (14/41)");
  assertStringIncludes(texto, "Pendências de conciliação: *5*");
  assertStringIncludes(texto, "31/07/2026");
  assertFalse(texto.includes("BLOQUEADA"));
  assertFalse(texto.includes("snapshot"));
  assertEquals((texto.match(/RELATÓRIO MENSAL COMERCIAL/g) || []).length, 1);
});

Deno.test("mensal comercial usa responsavel vigente apenas no cabecalho", () => {
  const payload = {
    ...base,
    tipo: "comercial",
    unidade: { ...base.unidade, hunter: "Clayton" },
    resumo: {},
    leads_por_canal: [],
    leads_por_curso: [],
    matriculas_por_canal: [],
    matriculas_por_curso: [],
    matriculas: [],
    alertas: [],
  };

  const texto = formatarRelatorioComercialMensalCanonico(payload, "Daiana");

  assertStringIncludes(texto, "👤 Daiana");
  assertFalse(texto.includes("Clayton"));
  assertEquals(payload.unidade.hunter, "Clayton");
});
