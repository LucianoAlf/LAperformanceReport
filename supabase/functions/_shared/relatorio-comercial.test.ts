/// <reference lib="deno.ns" />
// deno-lint-ignore-file no-import-prefix

import {
  assertAlmostEquals,
  assertEquals,
  assertFalse,
  assertStringIncludes,
  assertThrows,
} from "jsr:@std/assert@1";
import {
  calcularTicketsMatriculas,
  formatarRelatorioComercialDiario,
  formatarTaxaExpMatDiaria,
  parcelasDoGrupo,
  passaporteDoGrupo,
  type ProximaExperimental,
  type RelatorioComercialDados,
  selecionarProximasExperimentais,
} from "./relatorio-comercial.ts";

const matriculasBarra = [
  { valorParcela: 497, valorPassaporte: 550 },
  { valorParcela: 460, valorPassaporte: 450 },
  { valorParcela: 467, valorPassaporte: 499 },
  { valorParcela: 410, valorPassaporte: 399 },
  { valorParcela: 410, valorPassaporte: 399 },
  { valorParcela: 410, valorPassaporte: 399 },
  { valorParcela: 410, valorPassaporte: 399 },
  { valorParcela: 350, valorPassaporte: 400 },
  { valorParcela: 440, valorPassaporte: 450 },
  { valorParcela: 450, valorPassaporte: 399 },
  { valorParcela: 450, valorPassaporte: 450 },
  { valorParcela: 385, valorPassaporte: 450 },
  { valorParcela: 460, valorPassaporte: 450 },
  { valorParcela: 380, valorPassaporte: 499 },
  { valorParcela: 380, valorPassaporte: 499 },
  { valorParcela: 460, valorPassaporte: 450 },
];

function proxima(
  overrides: Partial<ProximaExperimental> = {},
): ProximaExperimental {
  return {
    snapshotAtivo: true,
    cancelada: false,
    situacao: "agendada",
    dataAula: "2026-07-31",
    horarioAula: "14:00",
    alunoNome: "Pessoa Futura",
    cursoNome: "Canto",
    ...overrides,
  };
}

Deno.test("calcularTicketsMatriculas reproduz os dois tickets da Barra", () => {
  assertEquals(calcularTicketsMatriculas(matriculasBarra), {
    parcelas: { soma: 6819, denominador: 16, media: 426.19 },
    passaportes: { soma: 7142, denominador: 16, media: 446.38 },
  });
});

Deno.test("calcularTicketsMatriculas exclui zero do denominador correspondente", () => {
  assertEquals(
    calcularTicketsMatriculas([
      { valorParcela: 400, valorPassaporte: 0 },
      { valorParcela: 0, valorPassaporte: 500 },
    ]),
    {
      parcelas: { soma: 400, denominador: 1, media: 400 },
      passaportes: { soma: 500, denominador: 1, media: 500 },
    },
  );
});

Deno.test("calcularTicketsMatriculas devolve zeros para coorte vazia", () => {
  assertEquals(calcularTicketsMatriculas([]), {
    parcelas: { soma: 0, denominador: 0, media: 0 },
    passaportes: { soma: 0, denominador: 0, media: 0 },
  });
});

Deno.test("calcularTicketsMatriculas usa valores brutos e arredonda somente as saidas finais", () => {
  assertEquals(
    calcularTicketsMatriculas([
      { valorParcela: 0.004, valorPassaporte: 0.004 },
      { valorParcela: 100.004, valorPassaporte: 100.004 },
    ]),
    {
      parcelas: { soma: 100.01, denominador: 2, media: 50 },
      passaportes: { soma: 100.01, denominador: 2, media: 50 },
    },
  );
  assertAlmostEquals(
    parcelasDoGrupo({ parcelas_relatorio: [0.004, 100.004] }),
    100.008,
    1e-12,
  );
  assertEquals(passaporteDoGrupo({ valor_passaporte: 100.004 }), 100.004);
});

Deno.test("calcularTicketsMatriculas arredonda decimais monetarios sem erro binario", () => {
  for (
    const { valor, esperado } of [
      { valor: 10.075, esperado: 10.08 },
      { valor: 1.005, esperado: 1.01 },
      { valor: 100.335, esperado: 100.34 },
    ]
  ) {
    assertEquals(
      calcularTicketsMatriculas([{
        valorParcela: valor,
        valorPassaporte: valor,
      }]),
      {
        parcelas: { soma: esperado, denominador: 1, media: esperado },
        passaportes: { soma: esperado, denominador: 1, media: esperado },
      },
    );
  }
});

Deno.test("calculos monetarios aceitam os formatos reais do backend pelo mesmo parser", () => {
  const entradas = [
    { valorParcela: "460,00", valorPassaporte: "R$ 450,00" },
    { valorParcela: "1.234,56", valorPassaporte: "1234.56" },
  ];

  assertEquals(calcularTicketsMatriculas(entradas), {
    parcelas: { soma: 1694.56, denominador: 2, media: 847.28 },
    passaportes: { soma: 1684.56, denominador: 2, media: 842.28 },
  });
  assertEquals(
    parcelasDoGrupo({
      valor_parcela: "460,00",
      parcelas_relatorio: null,
    }),
    460,
  );
  assertEquals(
    passaporteDoGrupo({ valor_passaporte: "R$ 450,00" }),
    450,
  );
});

Deno.test("parcelasDoGrupo consolida segundo curso em um unico valor", () => {
  assertEquals(
    parcelasDoGrupo({ valor_parcela: 400, parcelas_relatorio: [400, 300] }),
    700,
  );
  assertEquals(parcelasDoGrupo({ valor_parcela: 400 }), 400);
});

Deno.test("passaporteDoGrupo devolve somente o passaporte consolidado", () => {
  assertEquals(passaporteDoGrupo({ valor_passaporte: 450 }), 450);
  assertEquals(passaporteDoGrupo({ valor_passaporte: null }), 0);
});

Deno.test("formatarTaxaExpMatDiaria publica taxa, fracao e pendencias", () => {
  assertEquals(
    formatarTaxaExpMatDiaria({
      taxa: 40.6,
      conversoes: 13,
      denominador: 32,
      pendencias: 2,
    }),
    "*40,6%* (13/32) — ⚠️ 2 pendências em auditoria",
  );
});

Deno.test("formatarTaxaExpMatDiaria publica SEM BASE sem denominador", () => {
  assertEquals(
    formatarTaxaExpMatDiaria({
      taxa: Number.NaN,
      conversoes: 0,
      denominador: 0,
      pendencias: 3,
    }),
    "*SEM BASE* — ⚠️ 3 pendências em auditoria",
  );
});

Deno.test("formatarTaxaExpMatDiaria deriva taxa quando a RPC envia null", () => {
  assertEquals(
    formatarTaxaExpMatDiaria({
      taxa: null,
      conversoes: 13,
      denominador: 32,
      pendencias: 0,
    }),
    "*40,6%* (13/32)",
  );
});

Deno.test("formatarTaxaExpMatDiaria nunca publica marcadores numericos invalidos", () => {
  const texto = formatarTaxaExpMatDiaria({
    taxa: Number.POSITIVE_INFINITY,
    conversoes: 0,
    denominador: 5,
    pendencias: 0,
  });

  assertFalse(/BLOQUEADA|NaN|Infinity/.test(texto));
  assertEquals(texto, "*0,0%* (0/5)");
});

Deno.test("selecionarProximasExperimentais exclui Bento e Olivia apos 20h05", () => {
  const resultado = selecionarProximasExperimentais([
    proxima({
      dataAula: "2026-07-30",
      horarioAula: "18:00",
      alunoNome: "Bento Brasil",
    }),
    proxima({
      dataAula: "2026-07-30",
      horarioAula: "20:05",
      alunoNome: "Olivia Delduque",
    }),
  ], new Date("2026-07-30T23:05:00Z"));

  assertEquals(resultado, { itens: [], excedentes: 0 });
});

Deno.test("selecionarProximasExperimentais mantem aula futura no mesmo dia", () => {
  const futura = proxima({
    dataAula: "2026-07-30",
    horarioAula: "20:06",
    alunoNome: "Depois do corte",
  });

  assertEquals(
    selecionarProximasExperimentais(
      [futura],
      new Date("2026-07-30T23:05:00Z"),
    ).itens,
    [futura],
  );
});

Deno.test("selecionarProximasExperimentais exclui cancelada, inativa, realizada e sem horario no mesmo dia", () => {
  const resultado = selecionarProximasExperimentais([
    proxima({ cancelada: true, alunoNome: "Cancelada" }),
    proxima({ snapshotAtivo: false, alunoNome: "Inativa" }),
    proxima({ situacao: "presente", alunoNome: "Realizada" }),
    proxima({
      dataAula: "2026-07-30",
      horarioAula: null,
      alunoNome: "Sem hora",
    }),
  ], new Date("2026-07-30T23:05:00Z"));

  assertEquals(resultado.itens, []);
});

Deno.test("selecionarProximasExperimentais atravessa o mes, ordena e remove somente identidade estavel duplicada", () => {
  const agosto = proxima({
    dataAula: "2026-08-01",
    horarioAula: "09:00",
    alunoNome: "Ana",
  });
  const julhoB = proxima({
    dataAula: "2026-07-31",
    horarioAula: "10:00",
    alunoNome: "Bia",
  });
  const julhoA = proxima({
    dataAula: "2026-07-31",
    horarioAula: "10:00",
    alunoNome: "Ana",
  });
  const julhoADuplicada = {
    ...julhoA,
    emusysAulaId: 901,
    participanteChave: "lead:123",
  } as ProximaExperimental;
  const resultado = selecionarProximasExperimentais(
    [
      agosto,
      julhoB,
      julhoA,
      { ...julhoA },
      julhoADuplicada,
      { ...julhoADuplicada, alunoNome: "Nome alterado" },
    ],
    new Date("2026-07-30T23:05:00Z"),
  );

  assertEquals(resultado.itens, [
    julhoA,
    { ...julhoA },
    julhoADuplicada,
    julhoB,
    agosto,
  ]);
});

Deno.test("selecionarProximasExperimentais preserva homonimos e linhas sem identidade", () => {
  const homonimo = proxima({ alunoNome: "Maria Silva", cursoNome: "Canto" });
  const resultado = selecionarProximasExperimentais(
    [homonimo, { ...homonimo }, { ...homonimo }],
    new Date("2026-07-30T23:05:00Z"),
  );

  assertEquals(resultado.itens.length, 3);
});

Deno.test("selecionarProximasExperimentais usa America Sao Paulo no horario de verao historico", () => {
  const noCorte = proxima({
    dataAula: "2018-01-15",
    horarioAula: "20:05",
    alunoNome: "No corte",
  });
  const futura = proxima({
    dataAula: "2018-01-15",
    horarioAula: "20:06",
    alunoNome: "Futura",
  });

  assertEquals(
    selecionarProximasExperimentais(
      [noCorte, futura],
      new Date("2018-01-15T22:05:00Z"),
    ).itens,
    [futura],
  );
});

Deno.test("selecionarProximasExperimentais limita em dez e informa excedentes", () => {
  const linhas = Array.from({ length: 11 }, (_, indice) =>
    proxima({
      alunoNome: `Pessoa ${String(indice + 1).padStart(2, "0")}`,
    }));

  const resultado = selecionarProximasExperimentais(
    linhas,
    new Date("2026-07-30T23:05:00Z"),
  );

  assertEquals(resultado.itens.length, 10);
  assertEquals(resultado.excedentes, 1);
});

Deno.test("selecionarProximasExperimentais respeita o limite exato de D+7", () => {
  const noLimite = proxima({
    dataAula: "2026-08-06",
    horarioAula: "20:05",
    alunoNome: "No limite",
  });
  const depois = proxima({
    dataAula: "2026-08-06",
    horarioAula: "20:06",
    alunoNome: "Depois do limite",
  });

  assertEquals(
    selecionarProximasExperimentais(
      [depois, noLimite],
      new Date("2026-07-30T23:05:00Z"),
    ).itens,
    [noLimite],
  );
});

function dadosBarra(): RelatorioComercialDados {
  return {
    referencia: {
      data: "2026-07-30",
      hora: "20:05",
      fuso: "America/Sao_Paulo",
    },
    unidade: { nome: "Barra", hunter: "Kailane" },
    dia: {
      leads: 9,
      experimentaisPrevistas: 3,
      experimentaisRealizadas: 2,
      faltas: 0,
      canceladas: 1,
      visitas: 0,
      matriculas: 0,
      passaportes: 0,
    },
    mes: {
      leads: 251,
      experimentaisRealizadas: 32,
      presencasVinculadas: 32,
      faltas: 5,
      matriculas: 16,
    },
    metas: {
      leads: 160,
      experimentais: 24,
      matriculas: 15,
      ticketParcelas: 444,
    },
    tickets: calcularTicketsMatriculas(matriculasBarra),
    conciliacao: {
      taxa: 40.6,
      conversoes: 13,
      denominador: 32,
      pendencias: 2,
    },
    registrosHoje: { leads: 9, experimentais: 4, matriculas: 0 },
    canais: [
      { nome: "Instagram", quantidade: 3 },
      { nome: "Sem canal", quantidade: 3 },
      { nome: "Ex-aluno", quantidade: 1 },
      { nome: "Indicação", quantidade: 1 },
      { nome: "Visita/Placa", quantidade: 1 },
    ],
    cursos: [
      { nome: "Sem curso", quantidade: 5 },
      { nome: "Musicalização Infantil", quantidade: 3 },
      { nome: "Canto", quantidade: 1 },
    ],
    proximas: [proxima({ alunoNome: "Luíza", cursoNome: "Canto" })],
    alertas: ["2 pendências em auditoria"],
    matriculasDetalhadas: [{
      data: "2026-07-29",
      aluno: "Marina Bessa",
      idade: 6,
      curso: "Teclado",
      professor: "Gabriel Antony Alves de Araújo",
      professorExperimental: "Leonardo Castro",
      canal: "Indicação",
      hunter: "Kailane",
      valorPassaporte: 450,
      parcelas: [460],
      formaPagamentoParcelas: "Crédito Recorrente",
    }],
    snapshot: {
      atualizadoEm: "2026-07-30T22:50:07Z",
      status: "completo",
    },
  };
}

Deno.test("formatarRelatorioComercialDiario gera as dez secoes na ordem aprovada", () => {
  const texto = formatarRelatorioComercialDiario(dadosBarra());
  const secoes = [
    "*RELATÓRIO DIÁRIO COMERCIAL*",
    "*RESUMO DO DIA*",
    "*MÊS ATÉ AGORA*",
    "*FUNIL DO MÊS*",
    "*REGISTROS CRIADOS HOJE*",
    "*TOP CANAIS E CURSOS DO DIA*",
    "*PRÓXIMAS EXPERIMENTAIS*",
    "*ALERTAS E CONCILIAÇÃO*",
    "*LISTA DETALHADA*",
    "*FONTES E SNAPSHOT*",
  ];
  const posicoes = secoes.map((secao) => texto.indexOf(secao));

  assertEquals(posicoes.every((posicao) => posicao >= 0), true);
  assertEquals([...posicoes].sort((a, b) => a - b), posicoes);
});

const textoOuroBarra = [
  "━━━━━━━━━━━━━━━━━━━━━━",
  "📊 *RELATÓRIO DIÁRIO COMERCIAL*",
  "🏢 *BARRA*",
  "📆 30/julho/2026",
  "👤 Kailane",
  "━━━━━━━━━━━━━━━━━━━━━━",
  "",
  "⚡ *RESUMO DO DIA*",
  "━━━━━━━━━━━━━━━━━━━━━━",
  "• Leads entrantes: *9*",
  "• Experimentais previstas no dia: *3*",
  "• Experimentais realizadas hoje: *2*",
  "• Faltas hoje: *0*",
  "• Canceladas hoje: *1*",
  "• Visitas: *0*",
  "• Matrículas comerciais: *0*",
  "• Passaportes: *R$ 0,00*",
  "",
  "📈 *MÊS ATÉ AGORA*",
  "━━━━━━━━━━━━━━━━━━━━━━",
  "• Leads: *251* / meta 160",
  "• Experimentais realizadas: *32* / meta 24",
  "• Presença + vínculo confirmados: *32*",
  "• Faltas: *5*",
  "• Matrículas: *16* / meta 15",
  "• Ticket médio das parcelas: *R$ 426,19* / meta R$ 444,00",
  "• Ticket médio dos passaportes: *R$ 446,38*",
  "",
  "📊 *FUNIL DO MÊS*",
  "━━━━━━━━━━━━━━━━━━━━━━",
  "• Lead → Experimental: *12,7%* (32/251)",
  "• Experimental → Matrícula: *40,6%* (13/32) — ⚠️ 2 pendências em auditoria",
  "• Lead → Matrícula: *6,4%* (16/251)",
  "",
  "📌 *REGISTROS CRIADOS HOJE*",
  "━━━━━━━━━━━━━━━━━━━━━━",
  "• Leads registrados: *9*",
  "• Agendamentos registrados hoje: *4*",
  "• Matrículas registradas: *0*",
  "",
  "📲 *TOP CANAIS E CURSOS DO DIA*",
  "━━━━━━━━━━━━━━━━━━━━━━",
  "Canais:",
  "• Instagram: *3*",
  "• Sem canal: *3*",
  "• Ex-aluno: *1*",
  "• Indicação: *1*",
  "• Visita/Placa: *1*",
  "Cursos:",
  "• Sem curso: *5*",
  "• Musicalização Infantil: *3*",
  "• Canto: *1*",
  "",
  "🗓️ *PRÓXIMAS EXPERIMENTAIS*",
  "━━━━━━━━━━━━━━━━━━━━━━",
  "• 2026-07-31 14:00: Luíza — Canto",
  "",
  "⚠️ *ALERTAS E CONCILIAÇÃO*",
  "━━━━━━━━━━━━━━━━━━━━━━",
  "• 2 pendências em auditoria",
  "",
  "📝 *LISTA DETALHADA*",
  "━━━━━━━━━━━━━━━━━━━━━━",
  "MAT. 01",
  "📅 Data: 29/07/2026",
  "👤 Aluno: Marina Bessa (6 anos)",
  "🎵 Curso: Teclado",
  "👨‍🏫 Professor: Gabriel Antony Alves de Araújo",
  "🎸 Prof. Experimental: Leonardo Castro",
  "📱 Canal: Indicação",
  "👤 Hunter: Kailane",
  "💵 Pass: R$ 450,00",
  "💵 Parc: R$ 460,00 (Crédito Recorrente)",
  "",
  "🔎 *FONTES E SNAPSHOT*",
  "━━━━━━━━━━━━━━━━━━━━━━",
  "• Fontes: get_kpis_comercial_canonicos_v2 + snapshot vigente GET /aulas + coorte detalhada de matrículas",
  "• Snapshot Emusys: completo",
  "• Atualizado em: 30/07/2026 às 19:50:07",
  "• Gerado em: 30/07/2026 às 20:05 (America/Sao_Paulo)",
  "━━━━━━━━━━━━━━━━━━━━━━",
].join("\n");

Deno.test("formatarRelatorioComercialDiario corresponde ao texto de ouro inteiro", () => {
  assertEquals(formatarRelatorioComercialDiario(dadosBarra()), textoOuroBarra);
});

Deno.test("formatarRelatorioComercialDiario preserva numeros canonicos, riqueza e detalhe manual", () => {
  const texto = formatarRelatorioComercialDiario(dadosBarra());

  for (
    const trecho of [
      "Leads: *251* / meta 160",
      "Experimentais realizadas: *32* / meta 24",
      "Faltas: *5*",
      "Matrículas: *16* / meta 15",
      "Ticket médio das parcelas: *R$ 426,19* / meta R$ 444,00",
      "Ticket médio dos passaportes: *R$ 446,38*",
      "Experimental → Matrícula: *40,6%* (13/32) — ⚠️ 2 pendências em auditoria",
      "Instagram: *3*",
      "Musicalização Infantil: *3*",
      "Marina Bessa",
      "Prof. Experimental: Leonardo Castro",
      "Parc: R$ 460,00 (Crédito Recorrente)",
      "Snapshot Emusys: completo",
      "30/07/2026 às 19:50:07",
      "get_kpis_comercial_canonicos_v2 + snapshot vigente GET /aulas + coorte detalhada de matrículas",
    ]
  ) {
    assertStringIncludes(texto, trecho);
  }

  assertEquals(
    texto.match(/meta R\$ 444,00/g)?.length,
    1,
    "a meta de ticket deve aparecer somente nas parcelas",
  );
});

Deno.test("formatarRelatorioComercialDiario nao reintroduz numeros nem mensagens legadas", () => {
  const texto = formatarRelatorioComercialDiario(dadosBarra());

  for (
    const proibido of [
      "214",
      "Experimentais: *7*",
      "BLOQUEADA",
      "NaN",
      "Infinity",
      "campos seguem em validação canônica",
    ]
  ) {
    assertFalse(texto.includes(proibido), proibido);
  }
});

Deno.test("formatarRelatorioComercialDiario saneia contagens invalidas", () => {
  const dados = dadosBarra();
  dados.dia.leads = Number.NaN;
  dados.mes.faltas = Number.POSITIVE_INFINITY;
  dados.metas.leads = Number.NEGATIVE_INFINITY;
  dados.registrosHoje.experimentais = Number.NaN;
  dados.canais = [{ nome: "Instagram", quantidade: Number.NaN }];
  dados.cursos = [{ nome: "Canto", quantidade: Number.POSITIVE_INFINITY }];
  const texto = formatarRelatorioComercialDiario(dados);

  assertFalse(/NaN|Infinity/.test(texto));
  assertStringIncludes(texto, "Leads entrantes: *0*");
  assertStringIncludes(texto, "Instagram: *0*");
  assertStringIncludes(texto, "Canto: *0*");
});

Deno.test("formatarRelatorioComercialDiario neutraliza controles e marcacao dinamica", () => {
  const dados = dadosBarra();
  dados.unidade.nome = "Barra\r\n*INVASAO*";
  dados.unidade.hunter = "Kai_lan~e`";
  dados.canais = [{ nome: "Insta\u0000*gram*", quantidade: 3 }];
  dados.alertas = ["~alerta~\r\n_novo_"];
  dados.matriculasDetalhadas[0].aluno = "Marina\n*ADMIN*";
  const texto = formatarRelatorioComercialDiario(dados);

  assertStringIncludes(texto, "🏢 *BARRA INVASAO*");
  assertStringIncludes(texto, "👤 Kailane");
  assertStringIncludes(texto, "• Instagram: *3*");
  assertStringIncludes(texto, "• alerta novo");
  assertStringIncludes(texto, "👤 Aluno: Marina ADMIN (6 anos)");
  assertFalse(texto.includes("\n*INVASAO*"));
  assertFalse(texto.includes("\n_novo_"));
});

Deno.test("formatarRelatorioComercialDiario falha fechado com referencia ou fuso invalidos", () => {
  const referenciaInvalida = dadosBarra();
  referenciaInvalida.referencia.data = "2026-02-30";
  assertThrows(
    () => formatarRelatorioComercialDiario(referenciaInvalida),
    Error,
    "Referência temporal inválida",
  );

  const fusoInvalido = dadosBarra();
  fusoInvalido.referencia.fuso = "Fuso/Inexistente";
  assertThrows(
    () => formatarRelatorioComercialDiario(fusoInvalido),
    Error,
    "Fuso horário inválido",
  );

  const fusoValidoMasForaDoContrato = dadosBarra();
  fusoValidoMasForaDoContrato.referencia.fuso = "UTC";
  assertThrows(
    () => formatarRelatorioComercialDiario(fusoValidoMasForaDoContrato),
    Error,
    "Fuso horário inválido",
  );
});

Deno.test("formatarRelatorioComercialDiario mostra fallback explicito para listas vazias", () => {
  const dados = dadosBarra();
  dados.proximas = [];
  dados.canais = [];
  dados.cursos = [];
  dados.alertas = [];
  dados.matriculasDetalhadas = [];
  const texto = formatarRelatorioComercialDiario(dados);

  assertStringIncludes(texto, "Nenhuma experimental futura no intervalo");
  assertStringIncludes(texto, "Nenhum canal registrado hoje");
  assertStringIncludes(texto, "Nenhum curso registrado hoje");
  assertStringIncludes(texto, "Nenhum gap operacional identificado");
  assertStringIncludes(texto, "Nenhuma matrícula comercial no período");
});
