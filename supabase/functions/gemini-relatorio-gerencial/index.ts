import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TAXA_EXP_MAT_BLOQUEADA_LABEL =
  "BLOQUEADA - aguardando regra canonica de presenca/vinculo";

interface RelatorioGerencialRequest {
  dados: any;
  unidade_nome?: string;
  is_consolidado?: boolean;
}

const mesesPorExtenso: Record<number, string> = {
  1: "Janeiro",
  2: "Fevereiro",
  3: "Marco",
  4: "Abril",
  5: "Maio",
  6: "Junho",
  7: "Julho",
  8: "Agosto",
  9: "Setembro",
  10: "Outubro",
  11: "Novembro",
  12: "Dezembro",
};

function n(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function arr(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function moeda(value: unknown): string {
  return n(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function pct(value: unknown, casas = 1): string {
  return `${n(value).toFixed(casas).replace(".", ",")}%`;
}

function barra(percentual: number, tamanho = 10): string {
  const pctSeguro = Math.max(0, Math.min(100, n(percentual)));
  const preenchido = Math.round((pctSeguro / 100) * tamanho);
  return "▓".repeat(preenchido) + "░".repeat(tamanho - preenchido);
}

function statusMeta(percentual: number, invertido = false): string {
  if (invertido) return percentual >= 100 ? "✅" : percentual >= 70 ? "⚠️" : "❌";
  return percentual >= 100 ? "✅" : percentual >= 70 ? "⚠️" : "❌";
}

function metaPercentual(atual: number, meta: number, invertido = false): number {
  if (!meta) return 0;
  if (!invertido) return (atual / meta) * 100;
  if (atual <= meta) return 100;
  return Math.max(0, 100 - ((atual - meta) / Math.max(meta, 0.01)) * 100);
}

function linhaMeta(label: string, atual: number, meta: number, sufixo = "", invertido = false): string {
  if (!meta) return `• ${label}: sem meta cadastrada\n`;
  const percentual = metaPercentual(atual, meta, invertido);
  return `${barra(Math.min(percentual, 100))} ${Math.round(percentual)}% ${label} (${sufixo}${formatValor(atual, sufixo)}/${sufixo}${formatValor(meta, sufixo)}) ${statusMeta(percentual, invertido)}\n`;
}

function formatValor(valor: number, sufixo: string): string {
  if (sufixo === "R$ ") return moeda(valor);
  return Number.isInteger(valor) ? String(valor) : valor.toFixed(1).replace(".", ",");
}

function mesAtual<T extends Record<string, any>>(lista: T[], ano: number, mes: number): T | Record<string, never> {
  return lista.find((item) => Number(item?.ano) === ano && Number(item?.mes) === mes) ||
    lista[lista.length - 1] ||
    {};
}

function linhasRanking(lista: any[], label: string, valor: string, formatter?: (item: any) => string): string {
  if (!lista.length) return "Sem dados suficientes.\n";
  return lista.slice(0, 3).map((item, index) => {
    const nome = item?.[label] || item?.professor || item?.professor_nome || item?.curso || item?.canal || item?.motivo || "N/D";
    const detalhe = formatter ? formatter(item) : String(item?.[valor] ?? item?.quantidade ?? item?.total_alunos ?? "");
    return `${index + 1}. ${nome} - ${detalhe}`;
  }).join("\n") + "\n";
}

function listaIA(items: unknown, fallback: string[]): string {
  const lista = arr(items).filter(Boolean).slice(0, 5);
  const final = lista.length ? lista : fallback;
  return final.map((item) => `* ${item}`).join("\n") + "\n";
}

async function fetchGeminiComRetry(url: string, options: RequestInit, maxRetries = 2): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);
    if (res.ok) return res;
    if ((res.status === 503 || res.status === 429) && attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      continue;
    }
    return res;
  }
  return new Response(null, { status: 500 });
}

function fallbackIA(mesNome: string, unidadeNome: string, taxaExpMatLiberada = false, taxaExpMatLabel = TAXA_EXP_MAT_BLOQUEADA_LABEL) {
  return {
    resumo_executivo:
      `A unidade ${unidadeNome} apresenta indicadores consolidados de ${mesNome}. ${
        taxaExpMatLiberada
          ? `A taxa Experimental -> Matrícula foi publicada pela camada canonica de conciliação (${taxaExpMatLabel}).`
          : "O relatório mantém a taxa Experimental -> Matrícula bloqueada como KPI oficial até fechamento da regra canonica de presença/vínculo."
      }`,
    conquistas: [
      "Indicadores financeiros, retenção, funil e rankings consolidados para leitura gerencial.",
      taxaExpMatLiberada
        ? `Taxa Experimental -> Matrícula liberada pela conciliação canonica: ${taxaExpMatLabel}.`
        : "Taxa Experimental -> Matrícula bloqueada de forma segura, sem publicar KPI não canonico.",
      "Relatório preserva metas, comparativos e programas internos para acompanhamento da equipe.",
    ],
    pontos_atencao: [
      "Revisar gargalos de Lead -> Experimental e evolução de matrículas.",
      "Acompanhar churn, evasões e não renovações com leitura qualitativa.",
      taxaExpMatLiberada
        ? "Manter revisão diária da conciliação para preservar a taxa oficial sem pendências."
        : "Validar vínculos de experimental, presença e matrícula antes de liberar taxa oficial.",
    ],
    plano_acao: [
      "Acompanhar diariamente leads, experimentais e matrículas por unidade.",
      "Priorizar follow-up dos leads e conferência de presença nas experimentais.",
      "Separar métricas canonicas de métricas legadas nas reuniões de gestão.",
    ],
    mensagem_final: "Relatório recomposto com leitura executiva completa e bloqueio seguro da taxa crítica.",
  };
}

async function gerarIA(dadosParaIA: any, mesNome: string, unidadeNome: string) {
  const fallback = fallbackIA(
    mesNome,
    unidadeNome,
    dadosParaIA?.taxa_exp_mat_liberada === true,
    dadosParaIA?.taxa_exp_mat_label || TAXA_EXP_MAT_BLOQUEADA_LABEL,
  );
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return fallback;

  const prompt = `
Voce e um consultor de gestao especializado em escolas de musica.
Gere apenas JSON valido com resumo_executivo, conquistas, pontos_atencao, plano_acao e mensagem_final.
Publique Taxa Experimental -> Matricula apenas se taxa_exp_mat_liberada=true.
Se taxa_exp_mat_liberada=false, diga que esta BLOQUEADA aguardando regra canonica de presenca/vinculo.
Quando taxa_exp_mat_liberada=true, use exatamente o valor taxa_exp_mat_label e cite que a fonte e a conciliacao canonica.
Quando falar de experimentais, diferencie status operacional de presenca confirmada.
Use linguagem profissional, direta e pronta para WhatsApp.

DADOS:
${JSON.stringify(dadosParaIA, null, 2)}`;

  const response = await fetchGeminiComRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.65,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1800,
        },
      }),
    },
  );

  if (!response.ok) {
    console.error("Erro Gemini:", await response.text());
    return fallback;
  }

  try {
    const geminiResponse = await response.json();
    const texto = geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const jsonText = texto.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const match = jsonText.match(/\{[\s\S]*\}/);
    return match ? { ...fallback, ...JSON.parse(match[0]) } : fallback;
  } catch (error) {
    console.error("Erro ao parsear IA:", error);
    return fallback;
  }
}

async function montarRelatorio(dados: any): Promise<string> {
  const periodo = dados?.periodo || {};
  const ano = n(periodo.ano || new Date().getFullYear());
  const mes = n(periodo.mes || new Date().getMonth() + 1);
  const mesNome = mesesPorExtenso[mes] || String(mes);
  const unidadeNome = periodo.unidade_nome || dados?.unidade_nome || "Consolidado";
  const gerenteNome = dados?.gerente_nome || "N/D";
  const hunterNome = dados?.hunter_nome || "N/D";

  const kpiGestao = mesAtual(arr(dados?.kpis_gestao), ano, mes);
  const kpiRetencao = mesAtual(arr(dados?.kpis_retencao), ano, mes);
  const kpiComercial = mesAtual(arr(dados?.kpis_comercial), ano, mes);

  const totalPagantes = n(kpiGestao.total_alunos_pagantes);
  const totalAtivos = n(kpiGestao.total_alunos_ativos);
  const ticketMedio = n(kpiGestao.ticket_medio);
  const mrr = n(kpiGestao.faturamento_realizado ?? kpiGestao.mrr);
  const churnRate = n(kpiGestao.churn_rate);
  const inadimplencia = n(kpiGestao.inadimplencia_pct ?? kpiGestao.inadimplencia);
  const tempoPermanencia = n(kpiGestao.tempo_permanencia_medio ?? kpiGestao.tempo_permanencia);
  const ltvMedio = n(kpiGestao.ltv_medio);
  const reajusteMedio = n(kpiGestao.reajuste_medio ?? kpiGestao.reajuste_pct);

  const totalEvasoes = n(kpiRetencao.total_evasoes ?? kpiGestao.total_evasoes ?? kpiGestao.evasoes);
  const totalEvasoesLabel = String(
    kpiRetencao.total_evasoes_label ??
      kpiGestao.total_evasoes_label ??
      kpiGestao.evasoes_label ??
      totalEvasoes,
  );
  const mrrPerdido = n(kpiRetencao.mrr_perdido);
  const renovacoesPrevistas = n(kpiRetencao.renovacoes_previstas);
  const renovacoesRealizadas = n(kpiRetencao.renovacoes_realizadas);
  const taxaRenovacao = renovacoesPrevistas > 0 ? (renovacoesRealizadas / renovacoesPrevistas) * 100 : n(kpiGestao.taxa_renovacao);
  const naoRenovacoes = n(kpiRetencao.nao_renovacoes);

  const totalLeads = n(kpiComercial.total_leads ?? kpiComercial.leads_entrantes);
  const totalExperimentais = n(
    kpiComercial.experimentais_realizadas ??
      kpiComercial.experimentais_realizadas_status_operacional ??
      kpiComercial.experimentais_realizadas_presenca_confirmada,
  );
  const experimentaisPresencaConfirmada = n(kpiComercial.experimentais_realizadas_presenca_confirmada);
  const experimentaisSemPresenca = n(kpiComercial.experimentais_status_operacional_sem_presenca);
  const novosAlunosGestao = n(kpiGestao.novas_matriculas ?? dados?.novas_matriculas);
  const matriculasComerciais = n(
    kpiComercial.novas_matriculas ??
      kpiComercial.matriculas_comerciais_principais ??
      kpiComercial.matriculas_academicas ??
      novosAlunosGestao,
  );
  const taxaLeadExp = n(kpiComercial.taxa_conversao_lead_exp ?? kpiComercial.taxa_lead_experimental);
  const taxaConversaoGeral = n(kpiComercial.taxa_conversao_geral ?? kpiComercial.taxa_lead_matricula);
  const taxaExpMatLiberada =
    kpiComercial.taxa_exp_mat_liberada === true &&
    n(kpiComercial.pendencias_taxa_exp_mat) === 0;
  const taxaExpMatCanonica = n(kpiComercial.taxa_conversao_exp_mat ?? kpiComercial.taxa_exp_mat_canonica);
  const denominadorExpMat = n(kpiComercial.denominador_taxa_exp_mat);
  const conversoesExpMat = n(kpiComercial.conversoes_exp_mat_canonicas);
  const taxaExpMatLabel = taxaExpMatLiberada
    ? `${pct(taxaExpMatCanonica, 1)} (${conversoesExpMat}/${denominadorExpMat})`
    : TAXA_EXP_MAT_BLOQUEADA_LABEL;

  const matriculasAtivas = n(dados?.matriculas_ativas ?? kpiGestao.matriculas_ativas);
  const matriculasBanda = n(dados?.matriculas_banda ?? kpiGestao.matriculas_banda);
  const matriculas2Curso = n(dados?.matriculas_2_curso ?? kpiGestao.matriculas_2_curso);
  const totalBolsistas = n(dados?.total_bolsistas);
  const metasKpi = dados?.metas_kpi || {};

  const mesAnterior = arr(dados?.mes_anterior);
  const anoPassado = arr(dados?.mesmo_mes_ano_passado);
  const sazonalidade = arr(dados?.sazonalidade);
  const motivosEvasao = arr(dados?.motivos_evasao);
  const cursosMaisProcurados = arr(dados?.cursos_mais_procurados);
  const canaisMaiorConversao = arr(dados?.canais_maior_conversao);
  const topRetencao = arr(dados?.top_professores_retencao);
  const topMatriculadores = arr(dados?.top_professores_matriculadores);
  const topPresenca = arr(dados?.top_professores_presenca);
  const topMediaTurma = arr(dados?.top_professores_media_turma);

  const ia = await gerarIA({
    unidade: unidadeNome,
    mes: mesNome,
    ano,
    gerente: gerenteNome,
    mrr,
    ticket_medio: ticketMedio,
    inadimplencia,
    alunos_ativos: totalAtivos,
    alunos_pagantes: totalPagantes,
    novos_alunos: novosAlunosGestao,
    novas_matriculas: matriculasComerciais,
    churn_rate: churnRate,
    evasoes: totalEvasoes,
    evasoes_label: totalEvasoesLabel,
    taxa_renovacao: taxaRenovacao,
    leads: totalLeads,
    experimentais_status_operacional: totalExperimentais,
    experimentais_presenca_confirmada: experimentaisPresencaConfirmada,
    experimentais_sem_presenca_confirmada: experimentaisSemPresenca,
    taxa_lead_exp_operacional: taxaLeadExp,
    taxa_exp_mat: taxaExpMatLabel,
    taxa_exp_mat_liberada: taxaExpMatLiberada,
    taxa_exp_mat_label: taxaExpMatLabel,
    taxa_exp_mat_denominador: denominadorExpMat,
    taxa_exp_mat_conversoes: conversoesExpMat,
    taxa_conversao_geral: taxaConversaoGeral,
    motivos_evasao: motivosEvasao.slice(0, 5),
  }, mesNome, unidadeNome);

  const mesAnteriorLabel = mes === 1
    ? `${mesesPorExtenso[12].substring(0, 3).toUpperCase()}/${String(ano - 1).slice(-2)}`
    : `${mesesPorExtenso[mes - 1].substring(0, 3).toUpperCase()}/${String(ano).slice(-2)}`;

  const metaVolumeMatriculas = unidadeNome === "Campo Grande" ? 25 : unidadeNome === "Recreio" ? 20 : 15;
  const metaTicketMatriculador = unidadeNome === "Campo Grande" ? 387 : unidadeNome === "Recreio" ? 435 : 450;
  const metaTaxaShowup = 18;
  const metaTaxaGeral = 13.5;
  const mediaMatriculasMes = n(dados?.meses_com_dados) > 0 ? matriculasComerciais / n(dados?.meses_com_dados) : matriculasComerciais;
  const vendasLojinha = n(dados?.vendas_lojinha);
  const metaLojinha = unidadeNome === "Campo Grande" ? 5000 : 3000;

  let relatorio = "";

  relatorio += "━━━━━━━━━━━━━━━━━━━━━━\n";
  relatorio += "📊 *RELATÓRIO GERENCIAL - LA MUSIC*\n\n";
  relatorio += `🏢 *${String(unidadeNome).toUpperCase()}*\n`;
  relatorio += `📅 *${String(mesNome).toUpperCase()}/${ano}*\n`;
  relatorio += `👤 *Gerente: ${gerenteNome}*\n`;
  relatorio += "━━━━━━━━━━━━━━━━━━━━━━\n\n";

  relatorio += `${ia.resumo_executivo}\n\n`;

  relatorio += "───────────────────────\n💰 *FINANCEIRO*\n───────────────────────\n";
  relatorio += `• MRR Atual: *R$ ${moeda(mrr)}*\n`;
  relatorio += `• Ticket Médio: *R$ ${moeda(ticketMedio)}*\n`;
  relatorio += `• Inadimplência: *${pct(inadimplencia)}*\n\n`;

  relatorio += "───────────────────────\n👥 *BASE DE ALUNOS*\n───────────────────────\n";
  relatorio += `• Ativos: *${totalAtivos}*\n`;
  relatorio += `• Pagantes: *${totalPagantes}*\n`;
  relatorio += `• Bolsistas: *${totalBolsistas}*\n`;
  relatorio += `• Novos no Mês: *${novosAlunosGestao}*\n`;
  relatorio += `• Permanência Média: *${tempoPermanencia.toFixed(2).replace(".", ",")} meses*\n`;
  relatorio += `• LTV Médio: *R$ ${moeda(ltvMedio)}*\n\n`;

  relatorio += "📚 *MATRÍCULAS*\n";
  relatorio += `• Ativas: *${matriculasAtivas}*\n`;
  relatorio += `• Em Banda: *${matriculasBanda}*\n`;
  relatorio += `• 2º Curso: *${matriculas2Curso}*\n\n`;

  relatorio += "───────────────────────\n📈 *FUNIL COMERCIAL*\n───────────────────────\n";
  relatorio += `• Leads: *${totalLeads}*\n`;
  relatorio += `• Experimentais operacionais: *${totalExperimentais}*\n`;
  relatorio += `• Presença experimental confirmada: *${experimentaisPresencaConfirmada}*\n`;
  relatorio += `• Matrículas: *${matriculasComerciais}*\n`;
  relatorio += `• Taxa Lead→Exp operacional: *${pct(taxaLeadExp, 2)}*\n`;
  relatorio += `• Taxa Exp→Mat: *${taxaExpMatLabel}*\n`;
  relatorio += `• Taxa Lead→Matrícula: *${pct(taxaConversaoGeral, 2)}*\n\n`;

  relatorio += "🎯 *METAS COMERCIAIS*\n";
  relatorio += metasKpi.leads ? linhaMeta("Leads", totalLeads, n(metasKpi.leads)) : "• Leads: sem meta cadastrada\n";
  relatorio += metasKpi.experimentais ? linhaMeta("Experimentais operacionais", totalExperimentais, n(metasKpi.experimentais)) : "• Experimentais operacionais: sem meta cadastrada\n";
  relatorio += metasKpi.matriculas ? linhaMeta("Matrículas", matriculasComerciais, n(metasKpi.matriculas)) : "• Matrículas: sem meta cadastrada\n";
  relatorio += "\n";

  relatorio += "───────────────────────\n📉 *RETENÇÃO*\n───────────────────────\n";
  relatorio += `• Churn Rate: *${pct(churnRate, 2)}*\n`;
  relatorio += `• Evasões: *${totalEvasoesLabel}*\n`;
  relatorio += `• Não Renovações: *${naoRenovacoes}*\n`;
  relatorio += `• MRR Perdido: *R$ ${moeda(mrrPerdido)}*\n`;
  relatorio += `• Taxa Renovação: *${pct(taxaRenovacao)}*\n`;
  relatorio += `• Reajuste Médio: *${pct(reajusteMedio, 2)}*\n\n`;

  if (motivosEvasao.length) {
    relatorio += "🔴 *TOP MOTIVOS DE EVASÃO*\n\n";
    relatorio += motivosEvasao.slice(0, 5).map((m: any) => `${m.motivo || "N/D"}: ${m.quantidade ?? m.total ?? 0}`).join("\n");
    relatorio += "\n\n";
  }

  relatorio += "───────────────────────\n🏆 *RANKINGS*\n───────────────────────\n";
  relatorio += "🥇 *TOP PROFESSORES RETENÇÃO*\n";
  relatorio += linhasRanking(topRetencao, "professor", "tempo_medio_permanencia", (p) => `${p.tempo_medio_permanencia ?? 0} meses`);
  if (topMatriculadores.length) {
    relatorio += "\n🎯 *TOP PROFESSORES MATRICULADORES*\n";
    relatorio += linhasRanking(topMatriculadores, "professor_nome", "matriculas", (p) => `${p.matriculas ?? 0} matrícula${n(p.matriculas) === 1 ? "" : "s"}`);
  }
  relatorio += "\n📊 *TOP PRESENÇA MÉDIA*\n";
  relatorio += linhasRanking(topPresenca, "professor", "presenca_media", (p) => `${p.presenca_media ?? 0}%`);
  relatorio += "\n👥 *TOP MÉDIA DE ALUNOS POR TURMA*\n";
  relatorio += linhasRanking(topMediaTurma, "professor", "media_alunos_turma", (p) => `${p.media_alunos_turma ?? 0} alunos/turma`);
  relatorio += "\n";

  relatorio += "───────────────────────\n🎸 *CURSOS MAIS PROCURADOS*\n───────────────────────\n";
  relatorio += cursosMaisProcurados.length
    ? cursosMaisProcurados.slice(0, 5).map((c: any, i: number) => `${i + 1}. ${c.curso || c.nome || "N/D"} - ${c.total_alunos ?? c.quantidade ?? 0}`).join("\n") + "\n\n"
    : "Sem dados suficientes.\n\n";

  relatorio += "───────────────────────\n📱 *CANAIS COM MAIOR LEAD→MATRÍCULA*\n───────────────────────\n";
  relatorio += canaisMaiorConversao.length
    ? canaisMaiorConversao.slice(0, 3).map((c: any, i: number) => {
      const canal = c.canal || c.origem || c.nome || "N/D";
      const matriculas = c.matriculas != null ? `${c.matriculas} matrículas / ` : "";
      const taxa = c.taxa_conversao != null ? `${pct(c.taxa_conversao, 2)}` : `${c.percentual ?? ""}`;
      return `${i + 1}. ${canal} - ${matriculas}${taxa}`;
    }).join("\n") + "\n\n"
    : "Sem dados suficientes.\n\n";

  relatorio += "───────────────────────\n⚖️ *COMPARATIVOS*\n───────────────────────\n";
  relatorio += `📅 *VS MÊS ANTERIOR (${mesAnteriorLabel})*\n\n`;
  if (mesAnterior.length) {
    const a = mesAnterior[0] || {};
    relatorio += `• Alunos: *${a.alunos_pagantes ?? "N/D"} → ${totalPagantes}*\n`;
    relatorio += `• Ticket: *R$ ${moeda(a.ticket_medio)} → R$ ${moeda(ticketMedio)}*\n`;
    relatorio += `• Churn: *${pct(a.churn_rate)} → ${pct(churnRate, 2)}*\n`;
    relatorio += `• Matrículas: *${a.novas_matriculas ?? "N/D"} → ${novosAlunosGestao}*\n`;
    relatorio += `• Evasões: *${a.evasoes_label ?? a.evasoes ?? "N/D"} → ${totalEvasoesLabel}*\n\n`;
  } else {
    relatorio += "Sem dados do mês anterior.\n\n";
  }

  relatorio += "📅 *VS MESMO MÊS ANO PASSADO*\n\n";
  if (anoPassado.length) {
    const a = anoPassado[0] || {};
    relatorio += `• Alunos: *${a.alunos_pagantes ?? "N/D"} → ${totalPagantes}*\n`;
    relatorio += `• Churn: *${pct(a.churn_rate)} → ${pct(churnRate, 2)}*\n`;
    relatorio += `• Matrículas: *${a.novas_matriculas ?? "N/D"} → ${novosAlunosGestao}*\n`;
    relatorio += `• Evasões: *${a.evasoes_label ?? a.evasoes ?? "N/D"} → ${totalEvasoesLabel}*\n`;
    relatorio += `• Saldo Líquido: *${a.saldo_liquido ?? "N/D"} → ${novosAlunosGestao - totalEvasoes}*\n\n`;
  } else {
    relatorio += "Sem referência do ano anterior.\n\n";
  }

  relatorio += "📈 *ANÁLISE DE SAZONALIDADE*\n";
  relatorio += sazonalidade.length
    ? `Histórico disponível para ${sazonalidade.length} referência(s) desta competência.\n\n`
    : "Histórico sazonal indisponível para esta competência.\n\n";

  relatorio += "───────────────────────\n🎯 *METAS DO MÊS*\n───────────────────────\n";
  relatorio += "📊 *GESTÃO*\n\n";
  relatorio += metasKpi.alunos ? linhaMeta("Alunos", totalPagantes, n(metasKpi.alunos)) : "• Alunos: sem meta cadastrada\n";
  relatorio += metasKpi.ticket_medio ? linhaMeta("Ticket", ticketMedio, n(metasKpi.ticket_medio), "R$ ") : "• Ticket: sem meta cadastrada\n";
  relatorio += metasKpi.churn ? linhaMeta("Churn", churnRate, n(metasKpi.churn), "", true) : "• Churn: sem meta cadastrada\n";
  relatorio += metasKpi.taxa_renovacao ? linhaMeta("Renovação", taxaRenovacao, n(metasKpi.taxa_renovacao)) : "• Renovação: sem meta cadastrada\n";
  relatorio += metasKpi.inadimplencia ? linhaMeta("Inadimpl.", inadimplencia, n(metasKpi.inadimplencia), "", true) : "• Inadimpl.: sem meta cadastrada\n";
  relatorio += metasKpi.reajuste ? linhaMeta("Reajuste", reajusteMedio, n(metasKpi.reajuste)) : "• Reajuste: sem meta cadastrada\n";

  relatorio += "\n📈 *COMERCIAL*\n\n";
  relatorio += metasKpi.leads ? linhaMeta("Leads", totalLeads, n(metasKpi.leads)) : "• Leads: sem meta cadastrada\n";
  relatorio += metasKpi.experimentais ? linhaMeta("Experimentais operacionais", totalExperimentais, n(metasKpi.experimentais)) : "• Experimentais operacionais: sem meta cadastrada\n";
  relatorio += metasKpi.matriculas ? linhaMeta("Matrículas", matriculasComerciais, n(metasKpi.matriculas)) : "• Matrículas: sem meta cadastrada\n";
  relatorio += metasKpi.taxa_lead_exp ? linhaMeta("Lead→Exp operacional", taxaLeadExp, n(metasKpi.taxa_lead_exp)) : "• Lead→Exp operacional: sem meta cadastrada\n";
  relatorio += taxaExpMatLiberada
    ? `Exp→Mat: ${taxaExpMatLabel}\n`
    : `Exp→Mat: ${TAXA_EXP_MAT_BLOQUEADA_LABEL}\n`;
  relatorio += metasKpi.taxa_conversao ? linhaMeta("Lead→Matrícula", taxaConversaoGeral, n(metasKpi.taxa_conversao)) : "• Lead→Matrícula: sem meta cadastrada\n";
  relatorio += "\n";

  relatorio += "───────────────────────\n🏆 *PROGRAMA FIDELIZA+ LA* (Trimestral)\n───────────────────────\n";
  relatorio += `⭐ *CHURN PREMIADO* (meta: ≤4%)\n${barra(churnRate <= 4 ? 100 : Math.max(0, 100 - (churnRate - 4) * 20))} ${pct(churnRate, 2)} ${churnRate <= 4 ? "✅" : "❌"}\n\n`;
  relatorio += `⭐ *INADIMPLÊNCIA* (meta: ≤1%)\n${barra(inadimplencia <= 1 ? 100 : Math.max(0, 100 - (inadimplencia - 1) * 20))} ${pct(inadimplencia)} ${inadimplencia <= 1 ? "✅" : "❌"}\n\n`;
  relatorio += `⭐ *MAX RENOVAÇÃO* (meta: ≥90%)\n${barra((taxaRenovacao / 90) * 100)} ${pct(taxaRenovacao)} ${taxaRenovacao >= 90 ? "✅" : "❌"}\n\n`;
  relatorio += `⭐ *REAJUSTE CAMPEÃO* (meta: ≥7%)\n${barra((reajusteMedio / 7) * 100)} ${pct(reajusteMedio, 2)} ${reajusteMedio >= 7 ? "✅" : "❌"}\n\n`;
  relatorio += `🛒 *MESTRES DA LOJINHA* (meta: R$ ${moeda(metaLojinha)})\n${barra((vendasLojinha / metaLojinha) * 100)} R$ ${moeda(vendasLojinha)} ${vendasLojinha >= metaLojinha ? "✅" : "❌"}\n\n`;

  relatorio += "───────────────────────\n🎯 *PROGRAMA MATRICULADOR+ LA*\n───────────────────────\n";
  relatorio += `*Hunter: ${hunterNome}*\n\n`;
  relatorio += "📊 *TAXA LEAD → EXP OPERACIONAL*\n";
  relatorio += `Atual: ${pct(taxaLeadExp, 2)} | Meta: ${pct(metaTaxaShowup, 0)}\n\n`;
  relatorio += "📊 *TAXA EXP → MATRÍCULA*\n";
  if (taxaExpMatLiberada) {
    relatorio += `Atual: *${taxaExpMatLabel}* | Fonte: *conciliação canônica*\n\n`;
  } else {
    relatorio += `${TAXA_EXP_MAT_BLOQUEADA_LABEL}\n`;
    relatorio += "Atual: *BLOQUEADA* | Pts: *0*\n\n";
  }
  relatorio += "⭐ *LEAD → MATRÍCULA*\n";
  relatorio += `Atual: ${pct(taxaConversaoGeral, 2)} | Meta: ${pct(metaTaxaGeral, 1)}\n\n`;
  relatorio += "📊 *VOLUME MÉDIO/MÊS*\n";
  relatorio += `Atual: ${mediaMatriculasMes.toFixed(1).replace(".", ",")} matrículas | Meta: ${metaVolumeMatriculas}\n\n`;
  relatorio += "📊 *TICKET MÉDIO*\n";
  relatorio += `Atual: R$ ${moeda(ticketMedio)} | Meta: R$ ${moeda(metaTicketMatriculador)}\n\n`;

  relatorio += "───────────────────────\n✅ *CONQUISTAS DO MÊS*\n───────────────────────\n";
  relatorio += listaIA(ia.conquistas, fallbackIA(mesNome, unidadeNome).conquistas);
  relatorio += "\n───────────────────────\n⚠️ *PONTOS DE ATENÇÃO*\n───────────────────────\n";
  relatorio += listaIA(ia.pontos_atencao, fallbackIA(mesNome, unidadeNome).pontos_atencao);
  relatorio += "\n───────────────────────\n🎯 *PLANO DE AÇÃO*\n───────────────────────\n";
  relatorio += listaIA(ia.plano_acao, fallbackIA(mesNome, unidadeNome).plano_acao);
  relatorio += "\n───────────────────────\n💬 *MENSAGEM FINAL*\n───────────────────────\n";
  relatorio += `${ia.mensagem_final}\n\n`;

  relatorio += "⚠️ *Nota de controle*\n";
  relatorio += taxaExpMatLiberada
    ? `Taxa Experimental → Matrícula: ${taxaExpMatLabel}, fonte conciliação canônica.\n`
    : `Taxa Experimental → Matrícula: ${TAXA_EXP_MAT_BLOQUEADA_LABEL}.\n`;
  relatorio += `Experimentais operacionais usam status do funil; presença confirmada usa aluno vinculado + presença individual + aula Emusys experimental.\n\n`;
  relatorio += "━━━━━━━━━━━━━━━━━━━━━━\n";
  relatorio += `📅 Gerado em: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().getHours()}:${String(new Date().getMinutes()).padStart(2, "0")}\n`;
  relatorio += "━━━━━━━━━━━━━━━━━━━━━━";

  return relatorio;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload: RelatorioGerencialRequest = await req.json();
    const relatorio = await montarRelatorio(payload?.dados || {});

    return new Response(JSON.stringify({ success: true, relatorio }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Erro na Edge Function:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
