/// <reference lib="deno.ns" />

import {
  assertEquals,
  assertFalse,
  assertStringIncludes,
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

Deno.test("mensal administrativo explica multicurso e politica de trancamento", () => {
  const texto = formatarRelatorioAdminMensalCanonico({
    ...base,
    tipo: "administrativo",
    unidade: { ...base.unidade, gerente: "Fernanda", farmers: ["Daiana"] },
    resumo: {
      alunos_ativos: 345,
      alunos_pagantes: 337,
      alunos_nao_pagantes: 8,
      alunos_trancados: 3,
      matriculas_trancadas: 3,
      bolsistas_integrais: 6,
      bolsistas_parciais: 2,
      matriculas_ativas: 429,
      matriculas_base: 343,
      matriculas_banda: 59,
      matriculas_adicionais: 27,
      matriculas_adicionais_extras: 2,
      matriculas_coral: 0,
      alunos_com_exatamente_2_cursos: 25,
      alunos_com_exatamente_3_cursos: 1,
      alunos_com_4_ou_mais_cursos: 0,
      novos_alunos: 17,
      transferencias_recebidas: 0,
      renovacoes_realizadas: 23,
      nao_renovacoes: 2,
      avisos_previos: 10,
      evasoes: 7,
      mrr: 140000,
      ticket_medio: 415.5,
    },
    renovacoes: [],
    nao_renovacoes: [],
    avisos_previos: [],
    evasoes: [],
    novos_alunos: [],
    transferencias: [],
    trancamentos_detalhados: {
      data_referencia: "2026-07-31",
      total_alunos: 1,
      total_matriculas: 1,
      politica: { prazo_contratual_meses: 1, extensao_gerencial_meses: 1, limite_total_meses: 2 },
      itens: [{
        aluno_nome: "Aluno Exemplo",
        curso_nome: "Piano",
        data_inicio: "2026-04-01",
        data_final: null,
        dias_trancado: 121,
        faixa_politica: "fora_da_politica",
        motivo: "Viagem",
      }],
    },
  });

  assertStringIncludes(texto, "RELATÓRIO MENSAL ADMINISTRATIVO");
  assertStringIncludes(texto, "JULHO/2026");
  assertStringIncludes(texto, "Matrículas adicionais: *27*");
  assertStringIncludes(texto, "Alunos com 3 cursos: *1*");
  assertStringIncludes(texto, "Aluno Exemplo — Piano");
  assertStringIncludes(texto, "FORA DA POLÍTICA");
  assertStringIncludes(texto, "limite total de 2 meses");
  assertFalse(texto.includes("snapshot"));
  assertFalse(texto.includes("get_kpis"));
});

Deno.test("mensal administrativo nao publica detalhe divergente do total oficial", () => {
  const texto = formatarRelatorioAdminMensalCanonico({
    ...base,
    tipo: "administrativo",
    resumo: {
      renovacoes_realizadas: 27,
      nao_renovacoes: 0,
      avisos_previos: 0,
      evasoes: 11,
    },
    renovacoes: Array.from({ length: 29 }, (_, index) => ({
      aluno_nome: `Aluno ${index + 1}`,
      data: "2026-07-01",
    })),
    nao_renovacoes: [],
    avisos_previos: [],
    evasoes: Array.from({ length: 9 }, (_, index) => ({
      aluno_nome: `Evasao ${index + 1}`,
      data: "2026-07-01",
    })),
    trancamentos_detalhados: { total_alunos: 0, total_matriculas: 0, itens: [] },
  });

  assertStringIncludes(texto, "Renova\u00e7\u00f5es realizadas: *27*");
  assertStringIncludes(texto, "Evas\u00f5es: *11*");
  assertEquals((texto.match(/Detalhamento individual indispon\u00edvel para este fechamento\./g) || []).length, 2);
  assertFalse(texto.includes("Aluno 29"));
  assertFalse(texto.includes("Evasao 9"));
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
