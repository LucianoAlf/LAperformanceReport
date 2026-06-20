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

function pct(value: unknown): string {
  return `${n(value).toFixed(1).replace(".", ",")}%`;
}

function moeda(value: unknown): string {
  return n(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function mesAtual<T extends Record<string, any>>(lista: T[], ano: number, mes: number): T | Record<string, never> {
  if (!Array.isArray(lista) || lista.length === 0) return {};
  return lista.find((item) => Number(item?.ano) === ano && Number(item?.mes) === mes) ||
    lista[lista.length - 1] ||
    {};
}

async function fetchGeminiComRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);
    if (res.ok) return res;

    if ((res.status === 503 || res.status === 429) && attempt < maxRetries) {
      const wait = 1000 * Math.pow(2, attempt);
      console.log(`[gemini-retry] status ${res.status}, tentativa ${attempt + 1}/${maxRetries + 1}, aguardando ${wait}ms`);
      await new Promise((resolve) => setTimeout(resolve, wait));
      continue;
    }

    return res;
  }

  return new Response(null, { status: 500 });
}

function buildFallbackIA(mesNome: string, unidadeNome: string) {
  return {
    resumo_executivo:
      `${unidadeNome} em ${mesNome} exige leitura cuidadosa: os indicadores principais foram consolidados, mas a taxa Experimental -> Matricula segue bloqueada ate validacao canonica de presenca/vinculo.`,
    conquistas: [
      "Relatorio gerado com bloqueio seguro da taxa Experimental -> Matricula.",
      "Leads, matriculas e indicadores financeiros permanecem disponiveis para acompanhamento gerencial.",
      "Funil comercial segue monitorado sem publicar KPI nao canonico.",
    ],
    pontos_atencao: [
      "Revisar experimentais sem presenca individual confirmada.",
      "Priorizar reconciliacao lead -> aluno -> presenca.",
      "Nao usar taxa Experimental -> Matricula em meta oficial ate fechamento da regra.",
    ],
    plano_acao: [
      "Acompanhar leads e matriculas diariamente.",
      "Validar casos de experimental com divergencia de presenca.",
      "Separar taxa operacional legada de KPI canonico nos alinhamentos da equipe.",
    ],
    mensagem_final: "Seguimos com dados mais seguros e com a taxa critica bloqueada ate a regra ficar fechada.",
  };
}

function parseGeminiJson(text: string, fallback: ReturnType<typeof buildFallbackIA>) {
  try {
    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    return match ? { ...fallback, ...JSON.parse(match[0]) } : fallback;
  } catch (error) {
    console.error("Erro ao parsear resposta Gemini:", error);
    return fallback;
  }
}

async function gerarAnaliseIA(dadosParaIA: any, mesNome: string, unidadeNome: string) {
  const fallback = buildFallbackIA(mesNome, unidadeNome);
  const apiKey = Deno.env.get("GEMINI_API_KEY");

  if (!apiKey) {
    console.warn("GEMINI_API_KEY nao configurada; usando fallback gerencial.");
    return fallback;
  }

  const systemPrompt = `
Voce e um analista gerencial senior da LA Music.
Gere uma analise curta, executiva e objetiva para WhatsApp.
Nunca trate Taxa Experimental -> Matricula como KPI oficial.
Se mencionar essa taxa, diga que esta BLOQUEADA aguardando regra canonica de presenca/vinculo.
Responda somente JSON valido com:
{
  "resumo_executivo": "string",
  "conquistas": ["string"],
  "pontos_atencao": ["string"],
  "plano_acao": ["string"],
  "mensagem_final": "string"
}`;

  const response = await fetchGeminiComRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${systemPrompt}\n\nDADOS:\n${JSON.stringify(dadosParaIA, null, 2)}` }],
          },
        ],
        generationConfig: {
          temperature: 0.55,
          topK: 40,
          topP: 0.9,
          maxOutputTokens: 1800,
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Erro Gemini:", errorText);
    return fallback;
  }

  const geminiResponse = await response.json();
  const responseText = geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return parseGeminiJson(responseText, fallback);
}

function bullets(items: unknown): string {
  const lista = arr(items).filter(Boolean).slice(0, 5);
  if (lista.length === 0) return "• Sem apontamentos automaticos.\n";
  return lista.map((item) => `• ${item}`).join("\n") + "\n";
}

function topLista(items: any[], label: string, valor: string, limite = 5): string {
  const lista = arr(items).slice(0, limite);
  if (lista.length === 0) return "• Sem dados suficientes.\n";
  return lista
    .map((item, index) => `• ${index + 1}. ${item?.[label] || item?.nome || item?.canal || item?.curso || item?.professor || "N/D"} - ${item?.[valor] ?? item?.quantidade ?? item?.total ?? ""}`)
    .join("\n") + "\n";
}

async function montarRelatorio(dados: any) {
  const periodo = dados?.periodo || {};
  const ano = n(periodo.ano || new Date().getFullYear());
  const mes = n(periodo.mes || new Date().getMonth() + 1);
  const mesNome = mesesPorExtenso[mes] || String(mes);
  const unidadeNome = periodo.unidade_nome || dados?.unidade_nome || "Consolidado";
  const gerenteNome = dados?.gerente_nome || "N/D";

  const kpiGestao = mesAtual(arr(dados?.kpis_gestao), ano, mes);
  const kpiRetencao = mesAtual(arr(dados?.kpis_retencao), ano, mes);
  const kpiComercial = mesAtual(arr(dados?.kpis_comercial), ano, mes);

  const totalPagantes = n(kpiGestao.total_alunos_pagantes);
  const totalAtivos = n(kpiGestao.total_alunos_ativos);
  const ticketMedio = n(kpiGestao.ticket_medio);
  const mrr = n(kpiGestao.mrr);
  const churnRate = n(kpiGestao.churn_rate);
  const inadimplencia = n(kpiGestao.inadimplencia_pct);
  const tempoPermanencia = n(kpiGestao.tempo_permanencia_medio);
  const ltvMedio = n(kpiGestao.ltv_medio);
  const reajusteMedio = n(kpiGestao.reajuste_medio);

  const totalEvasoes = n(kpiRetencao.total_evasoes);
  const mrrPerdido = n(kpiRetencao.mrr_perdido);
  const renovacoesPrevistas = n(kpiRetencao.renovacoes_previstas);
  const renovacoesRealizadas = n(kpiRetencao.renovacoes_realizadas);
  const taxaRenovacao = renovacoesPrevistas > 0 ? (renovacoesRealizadas / renovacoesPrevistas) * 100 : 0;

  const totalLeads = n(kpiComercial.total_leads ?? kpiComercial.leads_entrantes);
  const totalExperimentais = n(
    kpiComercial.experimentais_realizadas ??
      kpiComercial.experimentais_realizadas_status_operacional ??
      kpiComercial.experimentais_realizadas_presenca_confirmada,
  );
  const novasMatriculas = n(
    kpiComercial.novas_matriculas ??
      kpiComercial.matriculas_comerciais_principais ??
      kpiComercial.matriculas_academicas,
  );
  const taxaLeadExp = n(kpiComercial.taxa_conversao_lead_exp ?? kpiComercial.taxa_lead_experimental);
  const taxaConversaoGeral = n(kpiComercial.taxa_conversao_geral ?? kpiComercial.taxa_lead_matricula);

  const dadosParaIA = {
    unidade: unidadeNome,
    mes: mesNome,
    ano,
    gerente: gerenteNome,
    financeiro: { mrr, ticketMedio, inadimplencia },
    alunos: { totalAtivos, totalPagantes, novasMatriculas, tempoPermanencia, ltvMedio },
    comercial: {
      totalLeads,
      totalExperimentais,
      novasMatriculas,
      taxaLeadExp,
      taxaExpMat: TAXA_EXP_MAT_BLOQUEADA_LABEL,
      taxaConversaoGeral,
    },
    retencao: { churnRate, totalEvasoes, mrrPerdido, taxaRenovacao, reajusteMedio },
    bloqueios: ["Taxa Experimental -> Matricula bloqueada para KPI oficial."],
  };

  const ia = await gerarAnaliseIA(dadosParaIA, mesNome, unidadeNome);

  const relatorio = [
    "━━━━━━━━━━━━━━━━━━━━━━",
    "📊 *RELATÓRIO GERENCIAL - LA MUSIC*",
    `🏢 *${String(unidadeNome).toUpperCase()}*`,
    `📅 *${String(mesNome).toUpperCase()}/${ano}*`,
    `👤 Gerente: ${gerenteNome}`,
    "━━━━━━━━━━━━━━━━━━━━━━",
    "",
    "*Resumo executivo*",
    ia.resumo_executivo,
    "",
    "💰 *FINANCEIRO*",
    `• MRR Atual: *R$ ${moeda(mrr)}*`,
    `• Ticket Médio: *R$ ${moeda(ticketMedio)}*`,
    `• Inadimplência: *${pct(inadimplencia)}*`,
    "",
    "👥 *BASE DE ALUNOS*",
    `• Ativos: *${totalAtivos}*`,
    `• Pagantes: *${totalPagantes}*`,
    `• Bolsistas: *${n(dados?.total_bolsistas)}*`,
    `• Novos no mês: *${novasMatriculas}*`,
    `• Permanência média: *${tempoPermanencia.toFixed(1).replace(".", ",")} meses*`,
    `• LTV médio: *R$ ${moeda(ltvMedio)}*`,
    "",
    "📚 *MATRÍCULAS*",
    `• Ativas: *${n(dados?.matriculas_ativas)}*`,
    `• Em banda: *${n(dados?.matriculas_banda)}*`,
    `• 2º curso: *${n(dados?.matriculas_2_curso)}*`,
    "",
    "📈 *FUNIL COMERCIAL*",
    `• Leads: *${totalLeads}*`,
    `• Experimentais: *${totalExperimentais}*`,
    `• Matrículas: *${novasMatriculas}*`,
    `• Taxa Lead→Exp: *${pct(taxaLeadExp)}*`,
    `• Taxa Exp→Mat: *${TAXA_EXP_MAT_BLOQUEADA_LABEL}*`,
    `• Conversão geral: *${pct(taxaConversaoGeral)}*`,
    "",
    "📉 *RETENÇÃO*",
    `• Churn rate: *${pct(churnRate)}*`,
    `• Evasões: *${totalEvasoes}*`,
    `• MRR perdido: *R$ ${moeda(mrrPerdido)}*`,
    `• Renovações realizadas: *${renovacoesRealizadas}*`,
    `• Taxa renovação: *${pct(taxaRenovacao)}*`,
    `• Reajuste médio: *${pct(reajusteMedio)}*`,
    "",
    "🏆 *CONQUISTAS*",
    bullets(ia.conquistas).trimEnd(),
    "",
    "⚠️ *PONTOS DE ATENÇÃO*",
    bullets(ia.pontos_atencao).trimEnd(),
    "",
    "🎯 *PLANO DE AÇÃO*",
    bullets(ia.plano_acao).trimEnd(),
    "",
    "🎸 *CURSOS MAIS PROCURADOS*",
    topLista(arr(dados?.cursos_mais_procurados), "curso", "total_alunos").trimEnd(),
    "",
    "📣 *CANAIS COM MAIOR CONVERSÃO*",
    topLista(arr(dados?.canais_maior_conversao), "canal", "taxa_conversao").trimEnd(),
    "",
    "⚠️ *Nota de controle*",
    `Taxa Experimental → Matrícula: ${TAXA_EXP_MAT_BLOQUEADA_LABEL}.`,
    "",
    ia.mensagem_final,
  ].join("\n");

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
