import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_NOME_MAP: Record<string, string> = {
  "2ec861f6-023f-4d7b-9927-3960ad8c2a92": "Campo Grande",
  "95553e96-971b-4590-a6eb-0201d013c14d": "Recreio",
  "368d47f5-2d88-4475-bc14-ba084a9a348e": "Barra",
};

const HUNTERS_MAP: Record<string, { nome: string; apelido: string }> = {
  "2ec861f6-023f-4d7b-9927-3960ad8c2a92": { nome: "Vitoria", apelido: "Vitorinha" },
  "95553e96-971b-4590-a6eb-0201d013c14d": { nome: "Clayton", apelido: "Cleitinho" },
  "368d47f5-2d88-4475-bc14-ba084a9a348e": { nome: "Kailane", apelido: "Kai" },
};

const TAXA_EXP_MAT_BLOQUEADA_LABEL =
  "BLOQUEADA - aguardando regra canonica de presenca/vinculo";

function n(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function arr(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
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

function fallbackInsights(dados: any, unidadeId: string | null, ano: number, mes: number) {
  const isSuperAdmin = !unidadeId || unidadeId === "todos";
  const nomeUnidade = isSuperAdmin ? "Todas as Unidades" : UUID_NOME_MAP[unidadeId] || "Unidade";
  const hunter = isSuperAdmin ? null : HUNTERS_MAP[unidadeId];
  const nomeHunter = hunter?.nome || "Administrador";
  const apelidoHunter = hunter?.apelido || "Administrador";

  const kpis = dados?.kpis_atual || dados?.kpis || {};
  const acumulado = dados?.acumulado_mes || {};
  const leadsPendentes = arr(dados?.leads_pendentes);
  const leadsPorCanal = arr(dados?.leads_por_canal || dados?.origem_canal);
  const professoresMatriculadores = arr(dados?.professores_matriculadores);

  const leads = n(kpis.total_leads ?? kpis.leads_entrantes ?? acumulado.leads);
  const matriculas = n(kpis.novas_matriculas ?? kpis.matriculas_comerciais_principais ?? acumulado.matriculas);
  const experimentais = n(kpis.experimentais_realizadas ?? kpis.experimentais_realizadas_status_operacional ?? acumulado.experimentais);
  const metaMatriculas = n(dados?.metas?.matriculas_mensais || 0);

  const alertas = [
    ...(leadsPendentes.length > 0 ? [`${leadsPendentes.length} leads precisam de follow-up.`] : []),
    `Taxa Experimental → Matrícula: ${TAXA_EXP_MAT_BLOQUEADA_LABEL}.`,
  ];

  return {
    saudacao: isSuperAdmin
      ? "Ola, Administrador! Vamos analisar os numeros comerciais."
      : `E ai, ${apelidoHunter}! Vamos ver os numeros comerciais?`,
    saude_comercial: metaMatriculas > 0 && matriculas >= metaMatriculas * 0.8 ? "quente" : "em_atencao",
    conquistas: matriculas > 0 ? [`${matriculas} matriculas no mes.`] : [],
    alertas_urgentes: alertas,
    analise_funil: {
      gargalo_principal: "Taxa Experimental → Matricula segue bloqueada para KPI oficial ate regra canonica.",
      oportunidade: leads > 0 ? `${leads} leads no periodo para acompanhamento.` : "Sem leads identificados no periodo.",
      acao_imediata: "Priorizar follow-up e validar vinculos de experimental com presenca individual.",
    },
    ritmo: {
      atual: `${matriculas} matriculas`,
      necessario: metaMatriculas > 0 ? `${Math.max(0, metaMatriculas - matriculas)} faltantes para meta` : "Meta nao informada",
      projecao: "Acompanhar diariamente sem usar taxa Exp→Mat como oficial.",
    },
    competitividade: isSuperAdmin
      ? null
      : {
        provocacao: "Comparativo entre hunters segue disponivel, com taxa Exp→Mat bloqueada.",
        desafio: "Foco em leads, show-up e matriculas com vinculo confiavel.",
      },
    matriculador_plus: {
      pontos_atuais: 0,
      acima_corte: false,
      metrica_mais_proxima: "Taxa Lead→Matricula / volume, sem Exp→Mat oficial",
      metrica_critica: TAXA_EXP_MAT_BLOQUEADA_LABEL,
      provocacao_viagem: "Premiacao depende de metricas canonicas aprovadas.",
    },
    canais_destaque: leadsPorCanal.slice(0, 2).map((c: any) => c.canal || c.origem || c.nome || "Canal"),
    professores_destaque: professoresMatriculadores.slice(0, 2).map((p: any) => p.professor || p.professor_nome || "Professor"),
    plano_acao_semanal: [
      "Revisar leads pendentes e priorizar contato rapido.",
      "Conferir experimentais com presenca individual antes de usar como KPI oficial.",
      "Validar matriculas com vinculo lead/aluno confiavel.",
    ],
    sugestoes_campanha: [],
    dica_do_dia: "Nao usar Taxa Experimental → Matricula como oficial ate concluir reconciliacao.",
    mensagem_final: isSuperAdmin
      ? "Acompanhe os numeros e apoie as equipes com dados canonicos."
      : `Vambora, ${apelidoHunter}! Foco nos dados confiaveis.`,
    diagnostico_bloqueios: {
      taxa_exp_matricula: TAXA_EXP_MAT_BLOQUEADA_LABEL,
      motivo: "Aguardando regra canonica de presenca/vinculo.",
      leads,
      experimentais,
      matriculas,
    },
    metadata: {
      unidade: nomeUnidade,
      hunter: isSuperAdmin ? "Administrador" : nomeHunter,
      apelido: isSuperAdmin ? null : apelidoHunter,
      is_super_admin: isSuperAdmin,
      competencia: `${String(mes).padStart(2, "0")}/${ano}`,
      gerado_em: new Date().toISOString(),
    },
  };
}

function parseInsights(text: string, fallback: any) {
  try {
    const match = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").match(/\{[\s\S]*\}/);
    return match ? { ...fallback, ...JSON.parse(match[0]), metadata: fallback.metadata } : fallback;
  } catch (error) {
    console.error("Erro ao parsear JSON Gemini:", error);
    return fallback;
  }
}

async function enriquecerComGemini(base: any, dados: any) {
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiApiKey) return base;

  const prompt = `
Voce e um analista comercial da LA Music.
Gere insights comerciais curtos em JSON, mantendo exatamente as chaves do objeto base.
Nao publique Taxa Experimental -> Matricula como KPI oficial.
Se citar essa taxa, use este texto: ${TAXA_EXP_MAT_BLOQUEADA_LABEL}.
Objeto base:
${JSON.stringify(base, null, 2)}
Dados:
${JSON.stringify(dados, null, 2)}`;

  const response = await fetchGeminiComRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
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
    console.error("Erro Gemini insights:", await response.text());
    return base;
  }

  const geminiData = await response.json();
  const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return parseInsights(responseText, base);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const unidadeId = body?.unidade_id === "todos" ? null : body?.unidade_id || null;
    const ano = n(body?.ano || new Date().getFullYear());
    const mes = n(body?.mes || new Date().getMonth() + 1);

    let dados = body?.dados || {};
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!body?.dados && supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data, error } = await supabase.rpc("get_dados_comercial_ia", {
        p_unidade_id: unidadeId,
        p_ano: ano,
        p_mes: mes,
      });

      if (error) console.error("Erro ao buscar dados comerciais:", error);
      dados = data || {};
    }

    const base = fallbackInsights(dados, unidadeId, ano, mes);
    const insights = await enriquecerComGemini(base, dados);

    return new Response(JSON.stringify(insights), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Erro na funcao:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
