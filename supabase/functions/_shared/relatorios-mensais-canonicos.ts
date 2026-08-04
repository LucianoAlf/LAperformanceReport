type JsonObject = Record<string, unknown>;

const LINHA = "━━━━━━━━━━━━━━━━━━━━━━";
const MESES = [
  "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
  "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
];

export function rotuloCompetencia(ano: number, mes: number): string {
  return `${MESES[mes - 1] ?? "MÊS"}/${ano}`;
}

/**
 * Dada a lista de competências com fechamento e a competência pedida, devolve a
 * mais recente que seja ESTRITAMENTE ANTERIOR à pedida — ou `null`.
 *
 * O fallback nunca avança no tempo (pedir junho com só julho fechado devolve
 * `null`, não julho) e nunca devolve a própria competência pedida: quando a RPC
 * falha por outro motivo que não ausência de fechamento, o mês pedido pode
 * constar como fechado, e oferecê-lo de volta só repetiria o mesmo erro.
 */
export function competenciaFechadaAnterior(
  fechados: Array<{ ano: number; mes: number }>,
  ano: number,
  mes: number,
): { ano: number; mes: number } | null {
  const alvo = ano * 100 + mes;
  return (fechados ?? [])
    .filter((item) =>
      Number.isInteger(item?.ano) && Number.isInteger(item?.mes)
    )
    .map((item) => ({ ano: item.ano, mes: item.mes }))
    .filter((item) => item.ano * 100 + item.mes < alvo)
    .sort((a, b) => (b.ano * 100 + b.mes) - (a.ano * 100 + a.mes))[0] ?? null;
}

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

function percentualInteiro(value: unknown): string {
  return `${Math.round(numero(value)).toLocaleString("pt-BR")}%`;
}

function numeroPublico(value: unknown, casas = 1): string {
  return numero(value).toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

function dataHoraBrasil(value: unknown): string {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "Não informada";
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("day")}/${part("month")}/${part("year")} às ${part("hour")}:${part("minute")}`;
}

function equipeAdministrativa(item: JsonObject): string {
  const farmers = Array.isArray(item.farmers) ? item.farmers : [];
  const candidatos = farmers.length > 0 ? farmers : [item.gerente];
  const nomes = candidatos
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .filter((value, index, all) =>
      all.findIndex((candidate) => candidate.toLocaleLowerCase("pt-BR") === value.toLocaleLowerCase("pt-BR")) === index
    );
  if (nomes.length === 0) return "Equipe Administrativa";
  if (nomes.length === 1) return nomes[0];
  return `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}`;
}

function mesSeguinte(payload: JsonObject): string {
  const item = (payload.competencia ?? {}) as JsonObject;
  const mes = inteiro(item.mes);
  return MESES[mes % 12] ?? "MÊS SEGUINTE";
}

function validarQuantidade(nome: string, total: unknown, itens: JsonObject[]): void {
  if (inteiro(total) !== itens.length) {
    throw new Error(`RELATORIO_ADMIN_MENSAL_DIVERGENTE:${nome}`);
  }
}

function gerarBarraMeta(atual: number, meta: number, inversa: boolean): string {
  const proporcao = inversa
    ? (100 - meta > 0 ? (100 - atual) / (100 - meta) : atual <= meta ? 1 : 0)
    : (meta > 0 ? atual / meta : atual >= meta ? 1 : 0);
  const progresso = Math.max(0, Math.min(100, proporcao * 100));
  const blocos = Math.max(0, Math.min(10, Math.round(progresso / 10)));
  const atingiu = inversa ? atual <= meta : atual >= meta;
  return `${"▓".repeat(blocos)}${"░".repeat(10 - blocos)} ${Math.round(progresso)}% ${atingiu ? "✅" : "⚠️"}`;
}

function linhasMeta(
  titulo: string,
  atual: unknown,
  meta: unknown,
  inversa: boolean,
): string[] {
  const valorAtual = numero(atual);
  const valorMeta = numero(meta);
  const comparador = inversa ? "≤" : "≥";
  return [
    `⭐ *${titulo}* (meta: ${comparador}${numeroPublico(valorMeta)}%)`,
    `   ${gerarBarraMeta(valorAtual, valorMeta, inversa)}`,
    `   Atual: *${numeroPublico(valorAtual)}%* | Meta: *${comparador}${numeroPublico(valorMeta)}%*`,
  ];
}

function classificarEvasao(item: JsonObject): string {
  const tipo = String(item.tipo_evasao ?? "").trim().toLocaleLowerCase("pt-BR");
  if (tipo.includes("nao_renov") || tipo.includes("não_renov")) return "nao_renovou";
  if (tipo.includes("2_curso") || tipo.includes("segundo")) return "interrompido_2_curso";
  if (tipo.includes("bols")) return "interrompido_bolsista";
  if (tipo.includes("banda")) return "interrompido_banda";
  if (tipo.includes("transfer")) return "transferencia";
  return "interrompido";
}

function percentualReajuste(anterior: unknown, novo: unknown): number {
  const valorAnterior = numero(anterior);
  if (valorAnterior <= 0) return 0;
  return ((numero(novo) - valorAnterior) / valorAnterior) * 100;
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
  const financeiro = (payload.indicadores_financeiros ?? {}) as JsonObject;
  const retencao = (payload.indicadores_retencao ?? {}) as JsonObject;
  const metas = (payload.metas_fideliza ?? {}) as JsonObject;
  const trancamentos = (payload.trancamentos_detalhados ?? {}) as JsonObject;
  const itensTrancados = lista(trancamentos.itens);
  const renovacoes = lista(payload.renovacoes);
  const naoRenovacoes = lista(payload.nao_renovacoes);
  const avisos = lista(payload.avisos_previos);
  const evasoes = lista(payload.evasoes);
  const evasoesCompletas: JsonObject[] = [
    ...evasoes,
    ...naoRenovacoes.map((item) => ({
      ...item,
      tipo_evasao: "nao_renovou",
      valor_perdido: item.valor_parcela_anterior,
    })),
  ];

  validarQuantidade("renovacoes", r.renovacoes_realizadas, renovacoes);
  validarQuantidade("nao_renovacoes", r.nao_renovacoes, naoRenovacoes);
  validarQuantidade("avisos_previos", r.avisos_previos, avisos);
  validarQuantidade("evasoes", r.evasoes, evasoesCompletas);
  validarQuantidade("trancamentos", trancamentos.total_matriculas, itensTrancados);

  if (
    inteiro(trancamentos.total_alunos) !== inteiro(r.alunos_trancados)
    || inteiro(trancamentos.total_matriculas) !== inteiro(r.matriculas_trancadas)
  ) {
    throw new Error("RELATORIO_ADMIN_MENSAL_DIVERGENTE:trancamentos");
  }

  const totalBolsistas = inteiro(r.bolsistas_integrais) + inteiro(r.bolsistas_parciais);
  const entradas = inteiro(r.novos_alunos) + inteiro(r.transferencias_recebidas);
  const renovacoesPrevistas = inteiro(retencao.renovacoes_previstas);
  const taxaNaoRenovacao = renovacoesPrevistas > 0
    ? inteiro(r.nao_renovacoes) / renovacoesPrevistas * 100
    : 0;
  const quebraEvasoes = evasoesCompletas.reduce<Record<string, number>>((acc, item) => {
    const tipo = classificarEvasao(item);
    acc[tipo] = (acc[tipo] ?? 0) + 1;
    return acc;
  }, {});
  const saidasBolsistas = quebraEvasoes.interrompido_bolsista ?? 0;
  const saidasSegundoCurso = quebraEvasoes.interrompido_2_curso ?? 0;
  const saidasBanda = quebraEvasoes.interrompido_banda ?? 0;
  const saidasTransferencia = quebraEvasoes.transferencia ?? 0;
  const saidasForaDoChurn = saidasBolsistas + saidasSegundoCurso + saidasBanda + saidasTransferencia;
  const saidasChurnPagantes = evasoesCompletas.length - saidasForaDoChurn;
  const baseChurnPagantes = inteiro(r.alunos_pagantes);
  const churnCalculado = baseChurnPagantes > 0
    ? saidasChurnPagantes / baseChurnPagantes * 100
    : 0;

  if (Math.abs(numero(retencao.churn_rate) - churnCalculado) > 0.01) {
    throw new Error("RELATORIO_ADMIN_MENSAL_DIVERGENTE:churn_pagantes");
  }
  if (inteiro(retencao.total_evasoes) !== evasoesCompletas.length) {
    throw new Error("RELATORIO_ADMIN_MENSAL_DIVERGENTE:saidas_totais");
  }

  const composicaoSaidas = [`${saidasChurnPagantes} pagantes`];
  if (saidasBolsistas > 0) {
    composicaoSaidas.push(`${saidasBolsistas} ${saidasBolsistas === 1 ? "bolsista" : "bolsistas"}`);
  }
  if (saidasSegundoCurso > 0) {
    composicaoSaidas.push(`${saidasSegundoCurso} de curso adicional`);
  }
  if (saidasBanda > 0) {
    composicaoSaidas.push(`${saidasBanda} de banda`);
  }
  if (saidasTransferencia > 0) {
    composicaoSaidas.push(`${saidasTransferencia} ${saidasTransferencia === 1 ? "transferência" : "transferências"}`);
  }

  const linhas = [
    LINHA,
    "📊 *RELATÓRIO MENSAL ADMINISTRATIVO*",
    `🏢 *${texto(u.nome).toUpperCase()}*`,
    `📅 *${competencia(payload)}*`,
    `👥 Por ${equipeAdministrativa(u)}`,
    LINHA,
    "",
    "👥 *ALUNOS*",
    LINHA,
    `• Ativos: *${inteiro(r.alunos_ativos)}*`,
    `• Pagantes: *${inteiro(r.alunos_pagantes)}*`,
    `• Não Pagantes: *${inteiro(r.alunos_nao_pagantes)}*`,
    `- Bolsistas: *${totalBolsistas}* (${inteiro(r.bolsistas_integrais)} integrais + ${inteiro(r.bolsistas_parciais)} parciais)`,
    `• Trancados no fechamento: *${inteiro(r.alunos_trancados)}* (alunos)`,
    `• Matrículas trancadas no fechamento: *${inteiro(r.matriculas_trancadas)}*`,
    `• Trancamentos no período: *${inteiro(payload.trancamentos_periodo)}*`,
    `• Novos no mês: *${inteiro(r.novos_alunos)}*`,
    `• Transferências recebidas no mês: *${inteiro(r.transferencias_recebidas)}*`,
    `• Entrada de novos alunos no mês: *${entradas}*`,
    "",
    "📚 *MATRÍCULAS*",
    LINHA,
    `• Matrículas Ativas: *${inteiro(r.matriculas_ativas)}* (${inteiro(r.matriculas_base)} base alunos + ${inteiro(r.matriculas_banda)} banda + ${inteiro(r.matriculas_adicionais)} adicionais)`,
    `• Matrículas em Banda: *${inteiro(r.matriculas_banda)}*`,
    `• Matrículas adicionais: *${inteiro(r.matriculas_adicionais)}*`,
    `- Alunos com 2 cursos: *${inteiro(r.alunos_com_exatamente_2_cursos)}*`,
    `- Alunos com 3 cursos: *${inteiro(r.alunos_com_exatamente_3_cursos)}*`,
    `- Alunos com 4 ou mais cursos: *${inteiro(r.alunos_com_4_ou_mais_cursos)}*`,
    `• Alunos no Coral: *${inteiro(r.matriculas_coral)}*`,
    "",
    `⏸️ *TRANCAMENTOS ATUAIS (${inteiro(trancamentos.total_alunos)} alunos / ${inteiro(trancamentos.total_matriculas)} matrículas)*`,
    LINHA,
  ];

  if (itensTrancados.length === 0) {
    linhas.push("Nenhum aluno trancado.");
  } else {
    itensTrancados.forEach((item, index) => {
      linhas.push(
        "",
        `${index + 1}) Nome: *${texto(item.aluno_nome)}*`,
        `   Curso: ${texto(item.curso_nome)}`,
        `   Início: ${item.data_inicio ? dataBrasil(item.data_inicio) : "Não informada"}`,
        `   Tempo trancado: ${item.dias_trancado == null ? "Não calculável" : `*${inteiro(item.dias_trancado)} dias*`}`,
        `   Retorno previsto: ${item.data_final || item.retorno_previsto ? dataBrasil(item.data_final ?? item.retorno_previsto) : "Não informada"}`,
        `   Situação: *${labelFaixaPolitica(item.faixa_politica)}*`,
        `   Motivo: ${texto(item.motivo)}`,
      );
    });
  }

  linhas.push(
    "",
    "💰 *KPIs FINANCEIROS*",
    LINHA,
    `• Ticket Médio: *${moeda(financeiro.ticket_medio)}*`,
    `• Faturamento Previsto: *${moeda(financeiro.faturamento_previsto)}*`,
    `• MRR da competência (pago + em aberto): *${moeda(financeiro.mrr_atual)}*`,
    `• Faturamento Realizado (pago): *${moeda(financeiro.faturamento_realizado)}*`,
    `• LTV (Tempo × Ticket): *${moeda(financeiro.ltv_medio)}*`,
    `• Tempo Permanência: *${numeroPublico(financeiro.tempo_permanencia)} meses*`,
    "",
    "📈 *KPIs DE RETENÇÃO*",
    LINHA,
    `• Churn de alunos pagantes: *${percentual(retencao.churn_rate)}* — ${saidasChurnPagantes} saídas em ${baseChurnPagantes} pagantes`,
    `• Taxa de Renovação: *${percentual(retencao.taxa_renovacao)}*`,
    `• Reajuste Médio: *${percentual(retencao.reajuste_medio)}*`,
    `• Inadimplência: *${percentual(retencao.inadimplencia)}*`,
    `• MRR Perdido: *${moeda(retencao.mrr_perdido)}*`,
    `• Saídas totais: *${inteiro(retencao.total_evasoes)}* (${composicaoSaidas.join(" + ")})`,
    `• Não Renovações: *${inteiro(retencao.nao_renovacoes)}*`,
    "",
    "🎯 *METAS FIDELIZA+ LA*",
    LINHA,
    ...linhasMeta("Churn Premiado", retencao.churn_rate, metas.churn_rate, true),
    "",
    ...linhasMeta("Inadimplência Zero", retencao.inadimplencia, metas.inadimplencia, true),
    "",
    ...linhasMeta("Max Renovação", retencao.taxa_renovacao, metas.taxa_renovacao, false),
    "",
    ...linhasMeta("Reajuste Campeão", retencao.reajuste_medio, metas.reajuste_medio, false),
    "",
    "🔄 *RENOVAÇÕES DO MÊS*",
    LINHA,
    `• Total previsto: *${renovacoesPrevistas}*`,
    `• Realizadas: *${inteiro(r.renovacoes_realizadas)}*`,
    `• Porcentagem: *${percentualInteiro(retencao.taxa_renovacao)}*`,
    "",
  );

  if (renovacoes.length === 0) {
    linhas.push("Nenhuma renovação registrada.", "");
  } else {
    renovacoes.forEach((item, index) => {
      linhas.push(
        `${index + 1}) Nome: *${texto(item.aluno_nome)}*`,
        `   Parcela: ${moeda(item.valor_parcela_anterior)} para ${moeda(item.valor_parcela_novo)} (${numeroPublico(percentualReajuste(item.valor_parcela_anterior, item.valor_parcela_novo), 2)}%)`,
        `   Forma de PG: ${texto(item.forma_pagamento, "N/A")}`,
        `   Agente: ${texto(item.agente_comercial, "N/A")}`,
        "",
      );
    });
  }

  linhas.push(
    "❌ *NÃO RENOVAÇÕES DO MÊS*",
    LINHA,
    `• Total: *${inteiro(r.nao_renovacoes)}*`,
    `• Porcentagem: *${percentualInteiro(taxaNaoRenovacao)}*`,
    "",
  );

  if (naoRenovacoes.length === 0) {
    linhas.push("Nenhuma não renovação registrada 🎉", "");
  } else {
    naoRenovacoes.forEach((item, index) => {
      linhas.push(
        `${index + 1}) Nome: *${texto(item.aluno_nome)}*`,
        `   Parcela: ${moeda(item.valor_parcela_anterior)} para ${moeda(item.valor_parcela_novo)}`,
        `   Professor: ${texto(item.professor, "N/A")}`,
        `   Motivo: ${texto(item.motivo)}`,
        "",
      );
    });
  }

  linhas.push(
    `⚠️ *AVISOS PRÉVIOS para sair em ${mesSeguinte(payload)}*`,
    LINHA,
    `• Total no mês: *${inteiro(r.avisos_previos)}*`,
    "",
  );

  if (avisos.length === 0) {
    linhas.push("Nenhum aviso prévio registrado 🎉", "");
  } else {
    avisos.forEach((item, index) => {
      linhas.push(
        `${index + 1}) Nome: *${texto(item.aluno_nome)}*`,
        `   Motivo: ${texto(item.motivo)}`,
        `   Prof: ${texto(item.professor, "N/A")}`,
        "",
      );
    });
  }

  linhas.push(
    "🚪 *EVASÕES (Saíram no mês)*",
    LINHA,
    `• Total no mês: *${inteiro(r.evasoes)}*`,
    `• Interrompido: *${quebraEvasoes.interrompido ?? 0}*`,
    `• Interrompido 2º Curso: *${quebraEvasoes.interrompido_2_curso ?? 0}*`,
    `• Interrompido Bolsista: *${quebraEvasoes.interrompido_bolsista ?? 0}*`,
    `• Interrompido Banda: *${quebraEvasoes.interrompido_banda ?? 0}*`,
    `• Não renovou: *${quebraEvasoes.nao_renovou ?? 0}*`,
    `• Transferência: *${quebraEvasoes.transferencia ?? 0}*`,
    "",
  );

  if (evasoesCompletas.length === 0) {
    linhas.push("Nenhuma evasão registrada no mês.", "");
  } else {
    evasoesCompletas.forEach((item, index) => {
      linhas.push(
        `${index + 1}) Nome: *${texto(item.aluno_nome)}*`,
        `   Motivo: ${texto(item.motivo)}`,
      );
      const valorPerdido = numero(item.valor_perdido);
      if (valorPerdido > 0) linhas.push(`   Parcela: ${moeda(valorPerdido)}`);
      linhas.push(
        `   Prof: ${texto(item.professor, "N/A")}`,
        "",
      );
    });
  }

  linhas.push(
    LINHA,
    `📅 Gerado em: ${dataHoraBrasil(payload.gerado_em)}`,
    LINHA,
  );
  return linhas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function formatarRelatorioComercialMensalCanonico(
  payload: JsonObject,
  responsavelComercialVigente?: unknown,
): string {
  const u = unidade(payload);
  const r = resumo(payload);
  const matriculas = lista(payload.matriculas);
  const responsavelComercial = texto(responsavelComercialVigente).trim() || texto(u.hunter).trim();
  const linhas = [
    LINHA,
    "📊 *RELATÓRIO MENSAL COMERCIAL*",
    `🏢 *${texto(u.nome).toUpperCase()}*`,
    `📆 *${competencia(payload)}*`,
    responsavelComercial ? `👤 ${responsavelComercial}` : "",
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
