// Edge Function: gemini-insights
// Gera plano de ação inteligente usando Gemini 3.0 Flash Preview

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-2.5-flash";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é um consultor estratégico especialista em escolas de música, com profundo conhecimento em:
- Gestão de academias e escolas de ensino artístico
- Funil de vendas educacional (Lead → Experimental → Matrícula)
- Retenção de alunos e redução de churn
- Sazonalidade do mercado de educação musical
- Marketing educacional e captação de alunos

## CONTEXTO
Você está analisando os dados de uma unidade da rede de escolas de música "LA Music" para gerar um plano de ação estratégico.

## PÚBLICO-ALVO DAS SUAS RECOMENDAÇÕES
- Gestores de unidade (decisões operacionais)
- Farmers/ADM (relacionamento e retenção)
- Hunters/Comercial (captação e conversão)

## DIRETRIZES OBRIGATÓRIAS

### Tom e Estilo
- Seja REALISTA e PRAGMÁTICO - nada de sugestões genéricas ou óbvias
- Fuja do básico: "fazer mais marketing" ou "melhorar atendimento" são proibidos
- Dê ações ESPECÍFICAS, MENSURÁVEIS e com PRAZO definido
- Use linguagem direta, sem rodeios, focada em resultados

### Análise de Dados
- Considere a SAZONALIDADE histórica (dados fornecidos)
- Identifique GARGALOS específicos no funil de conversão
- Compare métricas atuais vs necessárias para atingir a meta
- Priorize ações pelo IMPACTO vs ESFORÇO

### Estrutura das Ações
Para cada ação, inclua:
1. Título claro e objetivo
2. Impacto esperado (quantificado quando possível)
3. Nível de esforço (Baixo/Médio/Alto)
4. Passos específicos de execução (3-5 bullets)
5. Meta mensurável de sucesso

### Foco nos Gargalos Principais
1. **Captação de Leads → Experimentais**: Como aumentar a taxa de conversão?
2. **Fidelização e Retenção**: Como reduzir o churn e aumentar o LTV?

### Prazos
- **Curto prazo**: Ações para as próximas 2 semanas (quick wins)
- **Médio prazo**: Ações para o próximo mês (estruturantes)
- **Longo prazo**: Ações para o próximo trimestre (estratégicas)

## FORMATO DE RESPOSTA (JSON)

Responda APENAS com um JSON válido no seguinte formato, sem markdown ou texto adicional:

{
  "diagnostico": "Análise resumida da situação atual e principais desafios (2-3 frases)",
  "acoes_curto_prazo": [
    {
      "titulo": "Nome da ação",
      "impacto": "Descrição quantificada do impacto esperado",
      "esforco": "Baixo|Médio|Alto",
      "passos": ["Passo 1", "Passo 2", "Passo 3"],
      "meta_sucesso": "Métrica específica de sucesso",
      "responsavel": "Gestor|Farmer|Hunter"
    }
  ],
  "acoes_medio_prazo": [],
  "acoes_longo_prazo": [],
  "insights_adicionais": [
    "Insight 1 baseado nos dados",
    "Insight 2 sobre sazonalidade",
    "Insight 3 sobre oportunidades"
  ]
}`;

interface DadosSimulador {
  // Situação Atual
  alunosAtual: number;
  ticketMedio: number;
  mrrAtual: number;
  
  // Metas
  alunosObjetivo: number;
  mrrObjetivo: number;
  
  // Parâmetros
  churnProjetado: number;
  taxaLeadExp: number;
  taxaExpMat: number;
  
  // Cálculos
  matriculasNecessarias: number;
  leadsNecessarios: number;
  evasoesProjetadas: number;
  
  // Histórico
  historico?: {
    mes: string;
    leads: number;
    experimentais: number;
    matriculas: number;
    cancelamentos: number;
  }[];
  
  // Alertas
  alertas?: {
    tipo: string;
    mensagem: string;
  }[];
  
  // Contexto
  unidadeNome?: string;
  mesAtual: number;
  anoAtual: number;
}

function montarPromptUsuario(dados: DadosSimulador): string {
  const crescimentoPct = dados.alunosAtual > 0 
    ? ((dados.alunosObjetivo - dados.alunosAtual) / dados.alunosAtual * 100).toFixed(1)
    : 0;
  
  const conversaoTotal = (dados.taxaLeadExp / 100) * (dados.taxaExpMat / 100) * 100;
  
  let prompt = `## DADOS DA UNIDADE: ${dados.unidadeNome || 'Unidade'}
**Período**: ${dados.mesAtual}/${dados.anoAtual}

### SITUAÇÃO ATUAL
- Alunos Pagantes: ${dados.alunosAtual}
- Ticket Médio: R$ ${dados.ticketMedio.toFixed(2)}
- MRR Atual: R$ ${dados.mrrAtual.toLocaleString('pt-BR')}

### METAS DEFINIDAS
- Alunos Objetivo: ${dados.alunosObjetivo} (crescimento de ${crescimentoPct}%)
- MRR Objetivo: R$ ${dados.mrrObjetivo.toLocaleString('pt-BR')}

### PARÂMETROS DO FUNIL
- Churn Projetado: ${dados.churnProjetado}%
- Taxa Lead → Experimental: ${dados.taxaLeadExp}%
- Taxa Experimental → Matrícula: ${dados.taxaExpMat}%
- Conversão Total: ${conversaoTotal.toFixed(1)}%

### CÁLCULOS NECESSÁRIOS
- Matrículas Necessárias: ${dados.matriculasNecessarias}
- Leads Necessários: ${dados.leadsNecessarios}
- Evasões Projetadas: ${dados.evasoesProjetadas}
`;

  if (dados.historico && dados.historico.length > 0) {
    prompt += `\n### HISTÓRICO (últimos meses)\n`;
    dados.historico.forEach(h => {
      const conv = h.leads > 0 ? ((h.matriculas / h.leads) * 100).toFixed(1) : '0';
      prompt += `- ${h.mes}: ${h.leads} leads, ${h.experimentais} exp, ${h.matriculas} matr, ${h.cancelamentos} canc (conv: ${conv}%)\n`;
    });
  }

  if (dados.alertas && dados.alertas.length > 0) {
    prompt += `\n### ALERTAS DE VIABILIDADE\n`;
    dados.alertas.forEach(a => {
      const emoji = a.tipo === 'danger' ? '🔴' : a.tipo === 'warning' ? '🟡' : '🟢';
      prompt += `${emoji} ${a.mensagem}\n`;
    });
  }

  prompt += `\n## TAREFA
Analise os dados acima e gere um plano de ação estratégico para atingir as metas definidas.
Foque especialmente nos gargalos de conversão Lead→Experimental e na retenção/fidelização.
Considere a sazonalidade do mês ${dados.mesAtual} para suas recomendações.
Responda APENAS com o JSON estruturado, sem texto adicional.`;

  return prompt;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY não configurada");
    }

    const dados: DadosSimulador = await req.json();

    const userPrompt = montarPromptUsuario(dados);

    // Chamar Gemini API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

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

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Erro Gemini:", errorText);
      throw new Error(`Erro na API Gemini: ${geminiResponse.status}`);
    }

    const geminiData = await geminiResponse.json();
    
    // Extrair o texto da resposta
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!responseText) {
      throw new Error("Resposta vazia do Gemini");
    }

    // Tentar parsear o JSON
    let planoAcao;
    try {
      // Remover possíveis marcadores de código markdown
      const cleanJson = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      planoAcao = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error("Erro ao parsear JSON:", responseText);
      throw new Error("Resposta do Gemini não é um JSON válido");
    }

    return new Response(JSON.stringify(planoAcao), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Erro na Edge Function:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message || "Erro interno",
        diagnostico: "Não foi possível gerar o plano de ação. Tente novamente.",
        acoes_curto_prazo: [],
        acoes_medio_prazo: [],
        acoes_longo_prazo: [],
        insights_adicionais: []
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
