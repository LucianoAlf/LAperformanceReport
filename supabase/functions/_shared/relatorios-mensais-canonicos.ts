type JsonObject = Record<string, unknown>;

const LINHA = "━━━━━━━━━━━━━━━━━━━━━━";
const MESES = [
  "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
  "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
];

function numero(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function inteiro(value: unknown): number {
  return Math.trunc(numero(value));
}

function texto(value: unknown, fallback = "Não informado"): string {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function moeda(value: unknown): string {
  return numero(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).replace(/[\u00a0\u202f]/g, " ");
}

function percentual(value: unknown): string {
  return `${numero(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function dataBrasil(value: unknown): string {
  const raw = String(value ?? "").slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : texto(value);
}

function lista(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter((item): item is JsonObject => Boolean(item && typeof item === "object")) : [];
}

function competencia(payload: JsonObject): string {
  const item = (payload.competencia ?? {}) as JsonObject;
  const mes = inteiro(item.mes);
  return `${MESES[mes - 1] ?? "MÊS"}/${inteiro(item.ano)}`;
}

function unidade(payload: JsonObject): JsonObject {
  return (payload.unidade ?? {}) as JsonObject;
}

function resumo(payload: JsonObject): JsonObject {
  return (payload.resumo ?? {}) as JsonObject;
}

function formatarDistribuicao(titulo: string, itens: unknown): string[] {
  const rows = lista(itens);
  return [
    titulo,
    ...(rows.length > 0
      ? rows.map((row) => `• ${texto(row.nome)}: *${inteiro(row.quantidade)}*`)
      : ["• Nenhum registro no período"]),
  ];
}

function labelFaixaPolitica(value: unknown): string {
  const labels: Record<string, string> = {
    contratual: "PERÍODO CONTRATUAL",
    extensao_gerencial: "EXTENSÃO GERENCIAL",
    fora_da_politica: "FORA DA POLÍTICA",
    data_ausente: "DATA DE INÍCIO AUSENTE",
  };
  return labels[String(value ?? "")] ?? "SITUAÇÃO A VERIFICAR";
}

function formatarMovimentos(titulo: string, itens: unknown, totalOficial?: unknown): string[] {
  const rows = lista(itens);
  const lines = ["", titulo, LINHA];
  if (totalOficial !== undefined && rows.length !== inteiro(totalOficial)) {
    return [
      ...lines,
      `Total oficial do mês: *${inteiro(totalOficial)}*.`,
      "Detalhamento individual indisponível para este fechamento.",
    ];
  }
  if (rows.length === 0) return [...lines, "Nenhum registro no período."];
  rows.forEach((row, index) => {
    lines.push(
      `${index + 1}) *${texto(row.aluno_nome ?? row.nome)}*`,
      `   Data: ${dataBrasil(row.data ?? row.data_matricula ?? row.data_transferencia)}`,
    );
    if (row.curso) lines.push(`   Curso: ${texto(row.curso)}`);
    if (row.professor) lines.push(`   Professor(a): ${texto(row.professor)}`);
    if (row.motivo) lines.push(`   Motivo: ${texto(row.motivo)}`);
  });
  return lines;
}

export function formatarRelatorioAdminMensalCanonico(payload: JsonObject): string {
  const u = unidade(payload);
  const r = resumo(payload);
  const trancamentos = (payload.trancamentos_detalhados ?? {}) as JsonObject;
  const itensTrancados = lista(trancamentos.itens);
  const linhas = [
    LINHA,
    "📋 *RELATÓRIO MENSAL ADMINISTRATIVO*",
    `🏢 *${texto(u.nome).toUpperCase()}*`,
    `📆 *${competencia(payload)}*`,
    LINHA,
    "",
    "👥 *ALUNOS*",
    LINHA,
    `• Ativos: *${inteiro(r.alunos_ativos)}*`,
    `• Pagantes: *${inteiro(r.alunos_pagantes)}*`,
    `• Não pagantes: *${inteiro(r.alunos_nao_pagantes)}*`,
    `• Bolsistas integrais: *${inteiro(r.bolsistas_integrais)}*`,
    `• Bolsistas parciais: *${inteiro(r.bolsistas_parciais)}*`,
    `• Alunos trancados: *${inteiro(r.alunos_trancados)}*`,
    "",
    "📚 *MATRÍCULAS*",
    LINHA,
    `• Matrículas ativas: *${inteiro(r.matriculas_ativas)}*`,
    `• Base de alunos: *${inteiro(r.matriculas_base)}*`,
    `• Banda: *${inteiro(r.matriculas_banda)}*`,
    `• Matrículas adicionais: *${inteiro(r.matriculas_adicionais)}*`,
    `• Matrículas trancadas: *${inteiro(r.matriculas_trancadas)}*`,
    `• Coral: *${inteiro(r.matriculas_coral)}*`,
    `• Alunos com 2 cursos: *${inteiro(r.alunos_com_exatamente_2_cursos)}*`,
    `• Alunos com 3 cursos: *${inteiro(r.alunos_com_exatamente_3_cursos)}*`,
    `• Alunos com 4 ou mais cursos: *${inteiro(r.alunos_com_4_ou_mais_cursos)}*`,
    "",
    "💰 *INDICADORES FINANCEIROS*",
    LINHA,
    `• Receita mensal recorrente: *${moeda(r.mrr)}*`,
    `• Ticket médio: *${moeda(r.ticket_medio)}*`,
    "",
    "🔄 *MOVIMENTAÇÃO DO MÊS*",
    LINHA,
    `• Novos alunos: *${inteiro(r.novos_alunos)}*`,
    `• Transferências recebidas: *${inteiro(r.transferencias_recebidas)}*`,
    `• Renovações realizadas: *${inteiro(r.renovacoes_realizadas)}*`,
    `• Não renovações: *${inteiro(r.nao_renovacoes)}*`,
    `• Avisos prévios: *${inteiro(r.avisos_previos)}*`,
    `• Evasões: *${inteiro(r.evasoes)}*`,
    "",
    `⏸️ *TRANCAMENTOS ATUAIS (${inteiro(trancamentos.total_alunos)} alunos / ${inteiro(trancamentos.total_matriculas)} matrículas)*`,
    LINHA,
    "Política: 1 mês contratual + até 1 mês de extensão gerencial, com limite total de 2 meses.",
  ];

  if (itensTrancados.length === 0) {
    linhas.push("Nenhum aluno trancado.");
  } else {
    itensTrancados.forEach((item, index) => {
      linhas.push(
        "",
        `${index + 1}) *${texto(item.aluno_nome)} — ${texto(item.curso_nome)}*`,
        `   Situação: *${labelFaixaPolitica(item.faixa_politica)}*`,
        `   Início: ${item.data_inicio ? dataBrasil(item.data_inicio) : "Não informado"}`,
        `   Tempo trancado: *${item.dias_trancado == null ? "Não informado" : `${inteiro(item.dias_trancado)} dias`}*`,
        `   Motivo: ${texto(item.motivo)}`,
      );
    });
  }

  linhas.push(
    ...formatarMovimentos("✅ *RENOVAÇÕES DO MÊS*", payload.renovacoes, r.renovacoes_realizadas),
    ...formatarMovimentos("❌ *NÃO RENOVAÇÕES DO MÊS*", payload.nao_renovacoes, r.nao_renovacoes),
    ...formatarMovimentos("⚠️ *AVISOS PRÉVIOS*", payload.avisos_previos, r.avisos_previos),
    ...formatarMovimentos("🚪 *EVASÕES DO MÊS*", payload.evasoes, r.evasoes),
    "",
    LINHA,
    "Dados consolidados no fechamento oficial do mês.",
    LINHA,
  );
  return linhas.join("\n");
}

export function formatarRelatorioComercialMensalCanonico(payload: JsonObject): string {
  const u = unidade(payload);
  const r = resumo(payload);
  const matriculas = lista(payload.matriculas);
  const linhas = [
    LINHA,
    "📊 *RELATÓRIO MENSAL COMERCIAL*",
    `🏢 *${texto(u.nome).toUpperCase()}*`,
    `📆 *${competencia(payload)}*`,
    u.hunter ? `👤 ${texto(u.hunter)}` : "",
    LINHA,
    "",
    "⚡ *RESULTADO DO MÊS*",
    LINHA,
    `• Leads: *${inteiro(r.leads)}*`,
    `• Experimentais realizadas: *${inteiro(r.experimentais)}*`,
    `• Faltas: *${inteiro(r.faltas)}*`,
    `• Visitas: *${inteiro(r.visitas)}*`,
    `• Matrículas comerciais: *${inteiro(r.matriculas)}*`,
    `• Passaportes: *${moeda(r.total_passaportes)}*`,
    `• Parcelas contratadas: *${moeda(r.total_parcelas)}*`,
    `• Ticket médio dos passaportes: *${moeda(r.ticket_medio_passaporte)}*`,
    `• Ticket médio das parcelas: *${moeda(r.ticket_medio_parcela)}*`,
    "",
    "📊 *FUNIL DO MÊS*",
    LINHA,
    `• Lead → Experimental: *${percentual(r.taxa_lead_exp)}* (${inteiro(r.experimentais)}/${inteiro(r.leads)})`,
    `• Experimental → Matrícula: *${percentual(r.taxa_exp_mat)}* (${inteiro(r.conversoes_exp_mat)}/${inteiro(r.experimentais)})`,
    `• Lead → Matrícula: *${percentual(r.taxa_lead_mat)}* (${inteiro(r.matriculas)}/${inteiro(r.leads)})`,
    `• Pendências de conciliação: *${inteiro(r.pendencias_conciliacao)}*`,
    "",
    "📈 *ORIGEM DOS RESULTADOS*",
    LINHA,
    ...formatarDistribuicao("Canais dos leads:", payload.leads_por_canal),
    "",
    ...formatarDistribuicao("Cursos procurados:", payload.leads_por_curso),
    "",
    "📝 *MATRÍCULAS DO MÊS*",
    LINHA,
  ].filter(Boolean);

  if (matriculas.length === 0) {
    linhas.push("Nenhuma matrícula comercial no período.");
  } else {
    matriculas.forEach((item, index) => {
      linhas.push(
        "",
        `MAT. ${String(index + 1).padStart(2, "0")}`,
        `📅 Data: ${dataBrasil(item.data_matricula)}`,
        `👤 Aluno: ${texto(item.nome)}${item.idade == null ? "" : ` (${inteiro(item.idade)} anos)`}`,
        `🎵 Curso: ${texto(item.cursos)}`,
        `👨‍🏫 Professor: ${texto(item.professores)}`,
        `🎸 Prof. experimental: ${texto(item.professores_experimentais, "Não teve")}`,
        `📱 Canal: ${texto(item.canal)}`,
        `💵 Passaporte: ${moeda(item.valor_passaporte)}`,
        `💵 Parcela: ${moeda(item.valor_parcela)}`,
      );
    });
  }

  const alertas = Array.isArray(payload.alertas) ? payload.alertas : [];
  if (alertas.length > 0) {
    linhas.push("", "⚠️ *PONTOS PARA CONFERÊNCIA*", LINHA);
    alertas.forEach((alerta) => linhas.push(`• ${texto(alerta)}`));
  }

  linhas.push("", LINHA, "Dados consolidados no fechamento oficial do mês.", LINHA);
  return linhas.join("\n");
}
