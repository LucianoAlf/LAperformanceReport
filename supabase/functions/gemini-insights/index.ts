// Edge Function: gemini-insights
// Gera plano de acao inteligente usando Gemini para o simulador/metas.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-3-flash-preview";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TAXA_EXP_MAT_BLOQUEADA_LABEL =
  "BLOQUEADA - aguardando regra canonica de presenca/vinculo";

const SYSTEM_PROMPT = `Voce e um consultor estrategico especialista em escolas de musica, com profundo conhecimento em:
- Gestao de academias e escolas de ensino artistico
- Funil de vendas educacional
- Retencao de alunos e reducao de churn
- Sazonalidade do mercado de educacao musical
- Marketing educacional e captacao de alunos

## CONTEXTO
Voce esta analisando os dados de uma unidade da rede LA Music para gerar um plano de acao estrategico.

## PUBLICO-ALVO DAS SUAS RECOMENDACOES
- Gestores de unidade
- Farmers/ADM
- Hunters/Comercial

## DIRETRIZES OBRIGATORIAS
- Seja realista, pragmatico e especifico.
- Evite sugestoes genericas como "fazer mais marketing" ou "melhorar atendimento".
- De acoes mensuraveis, com prazo e responsavel.
- Priorize impacto versus esforco.
- Use linguagem direta, sem rodeios.

## FOCO DOS GARGALOS
1. Lead -> Experimental: como aumentar agendamento/show-up de forma operacional.
2. Lead -> Matricula: como transformar volume em matriculas reais.
3. Retencao: como reduzir churn e proteger MRR.

## BLOQUEIO COMERCIAL P02S
- Nunca publique Taxa Experimental -> Matricula como KPI oficial.
- Se citar essa taxa, use exatamente: ${TAXA_EXP_MAT_BLOQUEADA_LABEL}.
- Nao gere plano de acao baseado em melhoria de Exp->Mat como taxa real.
- Se o payload trouxer taxaExpMat, trate apenas como parametro de simulacao, nunca como resultado oficial.

## FORMATO DE RESPOSTA
Responda APENAS com JSON valido, sem markdown:

{
  "diagnostico": "Analise resumida da situacao atual e principais desafios.",
  "acoes_curto_prazo": [
    {
      "titulo": "Nome da acao",
      "impacto": "Impacto esperado",
      "esforco": "Baixo|Medio|Alto",
      "passos": ["Passo 1", "Passo 2", "Passo 3"],
      "meta_sucesso": "Metrica de sucesso",
      "responsavel": "Gestor|Farmer|Hunter"
    }
  ],
  "acoes_medio_prazo": [],
  "acoes_longo_prazo": [],
  "insights_adicionais": []
}`;

interface DadosSimulador {
  alunosAtual: number;
  ticketMedio: number;
  mrrAtual: number;
  alunosObjetivo: number;
  mrrObjetivo: number;
  churnProjetado: number;
  taxaLeadExp: number;
  taxaExpMat: number;
  matriculasNecessarias: number;
  leadsNecessarios: number;
  evasoesProjetadas: number;
  historico?: {
    mes: string;
    leads: number;
    experimentais: number;
    matriculas: number;
    cancelamentos: number;
  }[];
  alertas?: {
    tipo: string;
    mensagem: string;
  }[];
  unidadeNome?: string;
  mesAtual: number;
  anoAtual: number;
}

function montarPromptUsuario(dados: DadosSimulador): string {
  const crescimentoPct = dados.alunosAtual > 0
    ? ((dados.alunosObjetivo - dados.alunosAtual) / dados.alunosAtual * 100).toFixed(1)
    : "0";

  let prompt = `## DADOS DA UNIDADE: ${dados.unidadeNome || "Unidade"}
Periodo: ${dados.mesAtual}/${dados.anoAtual}

### SITUACAO ATUAL
- Alunos pagantes: ${dados.alunosAtual}
- Ticket medio: R$ ${dados.ticketMedio.toFixed(2)}
- MRR atual: R$ ${dados.mrrAtual.toLocaleString("pt-BR")}

### METAS DEFINIDAS
- Alunos objetivo: ${dados.alunosObjetivo} (crescimento de ${crescimentoPct}%)
- MRR objetivo: R$ ${dados.mrrObjetivo.toLocaleString("pt-BR")}

### PARAMETROS DO FUNIL
- Churn projetado: ${dados.churnProjetado}%
- Taxa Lead -> Experimental: ${dados.taxaLeadExp}%
- Taxa Experimental -> Matricula: ${TAXA_EXP_MAT_BLOQUEADA_LABEL}
- Conversao total baseada em Exp->Mat: BLOQUEADA para KPI oficial
- Parametro de simulacao Exp->Mat recebido: ${dados.taxaExpMat}% (usar apenas como cenario, nunca como resultado oficial)

### CALCULOS NECESSARIOS
- Matriculas necessarias: ${dados.matriculasNecessarias}
- Leads necessarios: ${dados.leadsNecessarios}
- Evasoes projetadas: ${dados.evasoesProjetadas}
`;

  if (dados.historico && dados.historico.length > 0) {
    prompt += "\n### HISTORICO\n";
    dados.historico.forEach((h) => {
      const convLeadMat = h.leads > 0 ? ((h.matriculas / h.leads) * 100).toFixed(1) : "0";
      prompt += `- ${h.mes}: ${h.leads} leads, ${h.experimentais} experimentais, ${h.matriculas} matriculas, ${h.cancelamentos} cancelamentos (Lead->Mat: ${convLeadMat}%)\n`;
    });
  }

  if (dados.alertas && dados.alertas.length > 0) {
    prompt += "\n### ALERTAS DE VIABILIDADE\n";
    dados.alertas.forEach((a) => {
      prompt += `- [${a.tipo}] ${a.mensagem}\n`;
    });
  }

  prompt += `
## TAREFA
Gere um plano de acao estrategico para atingir as metas definidas.
Foque em Lead->Experimental, Lead->Matricula, volume, ticket, MRR e retencao.
Nao publique Taxa Experimental->Matricula como KPI oficial.
Responda apenas com JSON valido.`;

  return prompt;
}

function safePreview(value: unknown, maxLength = 1200): string {
  try {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return text.length > maxLength ? `${text.slice(0, maxLength)}...[truncated]` : text;
  } catch {
    return "[unserializable]";
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY nao configurada");
    }

    const dados: DadosSimulador = await req.json();
    const userPrompt = montarPromptUsuario(dados);

    console.log("[gemini-insights] payload recebido", {
      unidadeNome: dados.unidadeNome || null,
      mesAtual: dados.mesAtual,
      anoAtual: dados.anoAtual,
      historicoCount: dados.historico?.length || 0,
      alertasCount: dados.alertas?.length || 0,
      promptChars: userPrompt.length,
      model: GEMINI_MODEL,
    });

    const geminiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const startedAt = Date.now();

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: userPrompt }],
          },
        ],
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
        },
      }),
    });

    console.log("[gemini-insights] resposta Gemini recebida", {
      status: geminiResponse.status,
      ok: geminiResponse.ok,
      elapsedMs: Date.now() - startedAt,
      contentType: geminiResponse.headers.get("content-type"),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Erro Gemini:", safePreview(errorText));
      throw new Error(`Erro na API Gemini: ${geminiResponse.status}`);
    }

    const geminiData = await geminiResponse.json();
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
      console.error("[gemini-insights] resposta sem texto", safePreview(geminiData));
      throw new Error("Resposta vazia do Gemini");
    }

    let planoAcao;
    try {
      const cleanJson = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      planoAcao = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error("Erro ao parsear JSON:", {
        parseError: safePreview(parseError),
        responseText: safePreview(responseText, 2000),
      });
      throw new Error("Resposta do Gemini nao e um JSON valido");
    }

    return new Response(JSON.stringify(planoAcao), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    console.error("Erro na Edge Function:", error);
    return new Response(
      JSON.stringify({
        error: message,
        diagnostico: "Nao foi possivel gerar o plano de acao. Tente novamente.",
        acoes_curto_prazo: [],
        acoes_medio_prazo: [],
        acoes_longo_prazo: [],
        insights_adicionais: [],
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
