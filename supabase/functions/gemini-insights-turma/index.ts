// Edge Function: gemini-insights-turma
// Gera plano de ação inteligente para otimização de turmas usando Gemini

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-2.0-flash";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é um consultor estratégico especialista em escolas de música, com profundo conhecimento em:
- Gestão de academias e escolas de ensino artístico
- Otimização de turmas e alocação de alunos
- Modelos de remuneração de professores
- Gestão de transição e mudança organizacional
- Incentivos e bonificações para equipes

## CONTEXTO
Você está analisando dados de uma unidade da rede de escolas de música "LA Music" para gerar um plano de ação estratégico focado em AUMENTAR A MÉDIA DE ALUNOS POR TURMA.

## CONCEITO CHAVE: MÉDIA DE ALUNOS POR TURMA
- Média atual baixa (próxima de 1.0) = muitas aulas individuais = alto custo de folha
- Média alta (2.0+) = turmas com duplas/trios = menor custo por aluno = maior margem
- O objetivo é JUNTAR ALUNOS em turmas compatíveis sem perder qualidade

## MODELO MATEMÁTICO DE ESCALONAMENTO

### Fórmulas Fundamentais
- **Custo/Turma** = (Base + (Média-1) × Incremento) × 4 semanas
- **Custo/Aluno** = Custo/Turma ÷ Média
- **Folha Total** = Total de Alunos × Custo/Aluno
- **% Folha** = (Folha Total ÷ MRR) × 100
- **Margem Bruta** = 100 - % Folha

### Regra de Ouro: Ganho DECRESCENTE
O ganho de margem por +0.1 na média é DECRESCENTE:
- Faixa 1.0→1.1: ~2.0% de ganho (ALTO)
- Faixa 1.5→1.6: ~1.0% de ganho (MÉDIO)
- Faixa 2.0→2.1: ~0.6% de ganho (MÉDIO)
- Faixa 2.5→2.6: ~0.4% de ganho (BAIXO)
- Faixa 2.9→3.0: ~0.3% de ganho (BAIXO)

**IMPLICAÇÃO ESTRATÉGICA**: Priorize ações em professores com média BAIXA (1.0-1.5) pois o retorno é MAIOR!

### Impacto do Cenário de Escalonamento
- **Base ALTA + Incremento ALTO** (ex: R$35 + R$10): Professor ganha mais, escola ganha menos
- **Base BAIXA + Incremento BAIXO** (ex: R$30 + R$5): Escola ganha mais, professor ganha menos
- O cenário ideal equilibra incentivo ao professor com margem da escola

## PÚBLICO-ALVO DAS SUAS RECOMENDAÇÕES
- Coordenação Pedagógica (decisões de alocação e junção de turmas)
- Professores (execução e adaptação)
- Gestores de unidade (estratégia e incentivos)

## DIRETRIZES OBRIGATÓRIAS

### Tom e Estilo
- Seja REALISTA e PRAGMÁTICO - considere a resistência natural à mudança
- Foque em ações ESPECÍFICAS para juntar turmas e otimizar horários
- Considere o MODELO DE GARANTIA para reduzir resistência dos professores
- Priorize ações pelo IMPACTO vs ESFORÇO

### Análise de Dados
- Identifique professores com média crítica (<1.3) como prioridade
- Considere a economia potencial como motivador
- Sugira critérios de compatibilidade para junção de turmas

### Estrutura das Ações
Para cada ação, inclua:
1. Título claro e objetivo
2. Impacto esperado (quantificado quando possível)
3. Nível de esforço (Baixo/Médio/Alto)
4. Passos específicos de execução (3-5 bullets)
5. Meta mensurável de sucesso
6. Responsável (Coordenação/Professor/Gestor)

### Prazos
- **Curto prazo**: Ações para as próximas 2 semanas (mapeamento e quick wins)
- **Médio prazo**: Ações para o próximo mês (primeiras junções com garantia)
- **Longo prazo**: Ações para o próximo trimestre (escala e bonificações)

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
      "responsavel": "Coordenação|Professor|Gestor"
    }
  ],
  "acoes_medio_prazo": [],
  "acoes_longo_prazo": [],
  "insights_adicionais": [
    "Insight 1 baseado nos dados",
    "Insight 2 sobre oportunidades",
    "Insight 3 sobre riscos a mitigar"
  ]
}`;

interface DadosSimuladorTurma {
  contexto: string;
  unidadeNome: string;
  
  // Situação Atual
  mediaAtual: number;
  percentualFolhaAtual: number;
  margemAtual: number;
  custoAlunoAtual: number;
  
  // Metas
  mediaMeta: number;
  percentualFolhaMeta: number;
  margemMeta: number;
  custoAlunoMeta: number;
  
  // Ganhos projetados
  ganhoMargem: number;
  economiaMensal: number;
  economiaAnual: number;
  
  // Cenário de escalonamento
  valorBase: number;
  incremento: number;
  cenarioNome?: string;
  
  // Análise de ganho por faixa
  ganhoMedioPor01?: number;
  ganhoMaximoPor01?: number;
  ganhoMinimoPor01?: number;
  
  // Professores
  totalProfessores: number;
  profCriticos: number;
  profAtencao: number;
  profBom?: number;
  profExcelente?: number;
  
  // Alertas
  alertas?: {
    tipo: string;
    titulo?: string;
    mensagem: string;
  }[];
  
  // Dados gerais
  totalAlunos: number;
  totalTurmas?: number;
  ticketMedio: number;
  mrrTotal: number;
  folhaAtual?: number;
  folhaMeta?: number;
  mesAtual: number;
  anoAtual: number;
}

function montarPromptUsuario(dados: DadosSimuladorTurma): string {
  const diferencaMedia = dados.mediaMeta - dados.mediaAtual;
  
  // Calcular ganho por faixa se não fornecido
  const ganhoMedio = dados.ganhoMedioPor01 ?? (dados.ganhoMargem / (diferencaMedia * 10));
  
  let prompt = `## DADOS DA UNIDADE: ${dados.unidadeNome}
**Período**: ${dados.mesAtual}/${dados.anoAtual}

### SITUAÇÃO ATUAL
- Média de Alunos/Turma: ${dados.mediaAtual.toFixed(2)}
- Custo por Aluno: R$ ${(dados.custoAlunoAtual || 0).toFixed(2)}
- Folha Total: R$ ${(dados.folhaAtual || 0).toLocaleString('pt-BR')}
- % Folha sobre MRR: ${dados.percentualFolhaAtual.toFixed(2)}%
- Margem Bruta: ${dados.margemAtual.toFixed(2)}%
- Total de Alunos: ${dados.totalAlunos}
- Total de Turmas: ${dados.totalTurmas || Math.round(dados.totalAlunos / dados.mediaAtual)}
- Ticket Médio: R$ ${dados.ticketMedio.toFixed(2)}
- MRR Total: R$ ${dados.mrrTotal.toLocaleString('pt-BR')}

### CENÁRIO DE ESCALONAMENTO SELECIONADO
- Nome: ${dados.cenarioNome || 'Personalizado'}
- Valor Base (1 aluno): R$ ${dados.valorBase}/hora-aula
- Incremento por aluno adicional: +R$ ${dados.incremento}
- Fórmula: Custo/Turma = (${dados.valorBase} + (Média-1) × ${dados.incremento}) × 4 semanas

### ANÁLISE DE GANHO POR +0.1 NA MÉDIA
- Ganho médio por +0.1: ${ganhoMedio.toFixed(2)}% de margem
${dados.ganhoMaximoPor01 ? `- Ganho máximo (faixas baixas): ${dados.ganhoMaximoPor01.toFixed(2)}%` : ''}
${dados.ganhoMinimoPor01 ? `- Ganho mínimo (faixas altas): ${dados.ganhoMinimoPor01.toFixed(2)}%` : ''}
- **REGRA**: Ganho é DECRESCENTE - priorize professores com média BAIXA!

### METAS DEFINIDAS
- Meta de Média: ${dados.mediaMeta.toFixed(1)} (aumento de ${diferencaMedia.toFixed(2)})
- Custo por Aluno Projetado: R$ ${(dados.custoAlunoMeta || 0).toFixed(2)}
- Folha Projetada: R$ ${(dados.folhaMeta || 0).toLocaleString('pt-BR')}
- % Folha Projetada: ${dados.percentualFolhaMeta.toFixed(2)}%
- Margem Projetada: ${dados.margemMeta.toFixed(2)}%

### GANHOS PROJETADOS
- Ganho de Margem: +${dados.ganhoMargem.toFixed(2)} pontos percentuais
- Economia Mensal: R$ ${dados.economiaMensal.toLocaleString('pt-BR')}
- Economia Anual: R$ ${dados.economiaAnual.toLocaleString('pt-BR')}

### EQUIPE DE PROFESSORES
- Total de Professores: ${dados.totalProfessores}
- 🔴 CRÍTICOS (média <1.3): ${dados.profCriticos} professores - PRIORIDADE MÁXIMA
- 🟡 ATENÇÃO (média 1.3-1.7): ${dados.profAtencao} professores
${dados.profBom !== undefined ? `- 🔵 BOM (média 1.7-2.0): ${dados.profBom} professores` : ''}
${dados.profExcelente !== undefined ? `- 🟢 EXCELENTE (média >2.0): ${dados.profExcelente} professores` : ''}
`;

  if (dados.alertas && dados.alertas.length > 0) {
    prompt += `\n### ALERTAS DE VIABILIDADE\n`;
    dados.alertas.forEach(a => {
      const emoji = a.tipo === 'erro' ? '🔴' : a.tipo === 'aviso' ? '🟡' : '🟢';
      prompt += `${emoji} ${a.titulo ? `**${a.titulo}**: ` : ''}${a.mensagem}\n`;
    });
  }

  prompt += `\n## TAREFA
Analise os dados acima e gere um plano de ação estratégico para:
1. Aumentar a média de alunos por turma de ${dados.mediaAtual.toFixed(2)} para ${dados.mediaMeta.toFixed(1)}
2. Reduzir o % de folha de ${dados.percentualFolhaAtual.toFixed(2)}% para ${dados.percentualFolhaMeta.toFixed(2)}%
3. Priorizar os ${dados.profCriticos} professores em situação CRÍTICA (maior retorno!)

Considere o CENÁRIO DE ESCALONAMENTO selecionado (Base R$${dados.valorBase}, Incremento +R$${dados.incremento}):
- Com este cenário, cada +0.1 na média gera ~${ganhoMedio.toFixed(1)}% de margem
- O modelo de GARANTIA para reduzir resistência dos professores
- Critérios de compatibilidade para junção de turmas (idade, nível, horário)
- Comunicação clara dos benefícios para professores (bônus por meta)

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

    const dados: DadosSimuladorTurma = await req.json();

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
