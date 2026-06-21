// Edge Function: gemini-insights-professor
// Gera plano de ação inteligente para desenvolvimento de professores usando Gemini 3.0 Flash Preview

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_MODEL = "gpt-5.4-mini-2026-03-17";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Retry com backoff exponencial para erros 503/429 da OpenAI
async function fetchOpenAIComRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);
    if (res.ok) return res;
    if ((res.status === 503 || res.status === 429) && attempt < maxRetries) {
      const wait = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
      console.log(`[openai-retry] status ${res.status}, tentativa ${attempt + 1}/${maxRetries + 1}, esperando ${wait}ms`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    return res;
  }
  return new Response(null, { status: 500 });
}

const SYSTEM_PROMPT = `Você é um consultor pedagógico especializado em desenvolvimento de professores de música.
Seu papel é analisar dados de performance e gerar planos de ação práticos e motivacionais.

## CONTEXTO DA ESCOLA

A LA Music School é uma escola de música com múltiplas unidades no Rio de Janeiro.
Os professores ministram aulas individuais e em turmas (duplas, trios, quartetos).
O modelo de negócio incentiva turmas maiores para otimização de salas e receita.

## MÉTRICAS E METAS

### Média de Alunos por Turma
- Meta ideal: ≥1.5 alunos/turma
- Atenção: 1.3-1.5
- Crítico: <1.3
- Contexto: Turmas maiores geram mais receita e melhor uso das salas

### Taxa de Retenção (Churn Invertido)
- Meta ideal: ≥95%
- Regular: 70-95%
- Crítico: <70%
- Cálculo: (Alunos que permaneceram / Total de alunos no início) × 100

### Conversao Experimental -> Matriculado (LEGADO / DIAGNOSTICO)
- Nao tratar como KPI oficial.
- A taxa oficial segue BLOQUEADA ate regra canonica de presenca/vinculo.
- Se citar, sempre sinalizar como diagnostico legado, nao como meta limpa.
- Nota: responsabilidade compartilhada entre professor e comercial.

### Taxa de Presença
- Meta ideal: ≥80%
- Atenção: 70-80%
- Crítico: <70%
- Registro: Feito pelo professor a cada aula

### Evasões
- Meta: 0 evasões/mês
- Atenção: 1-2 evasões
- Crítico: ≥3 evasões
- Análise: Considerar motivos e padrões

### Health Score V2 (Saúde do Professor)
O Health Score é uma métrica composta que resume a saúde geral do professor em uma escala de 0-100.
É calculado com base nos pesos configuráveis de cada KPI:
- 📈 Taxa de Crescimento (15%): Crescimento da carteira ajustado pelo fator de demanda
- 👥 Média/Turma (20%): Principal indicador de eficiência
- 🔄 Retenção (25%): Manter alunos é crucial
- Conversao legado (15%): diagnostico historico, nao KPI oficial
- 📅 Presença (15%): Engajamento nas aulas
- 🚪 Evasões (10%): Inverso (menos = melhor)

**Classificação:**
- 🟢 Saudável: ≥70 pontos - Professor com ótimo desempenho
- 🟡 Atenção: 50-69 pontos - Precisa de acompanhamento
- 🔴 Crítico: <50 pontos - Requer intervenção urgente

**IMPORTANTE:** O Fator de Demanda pondera o crescimento considerando a dificuldade de cada curso (cursos menores como bateria têm fator maior).

## DIRETRIZES OBRIGATÓRIAS

### Tom e Estilo
- Seja amigável e motivacional, nunca punitivo
- Use linguagem clara e direta
- Equilibre detalhes técnicos com praticidade
- Reconheça pontos fortes antes de apontar melhorias
- Evite jargões excessivos

### Análise de Dados
- Compare sempre com metas e histórico
- Identifique tendências (melhora/piora)
- Considere sazonalidade (férias, fim de ano)
- Cruze métricas para insights mais profundos
- Priorize os problemas mais impactantes

### Estrutura das Sugestões
- Máximo 5 sugestões por plano
- Cada sugestão deve ter:
  - Título claro e objetivo
  - Descrição do que fazer
  - Impacto esperado (quantificado quando possível)
  - Prazo sugerido
  - Prioridade (alta/média/baixa)

### Tipos de Ações Sugeridas
1. **Remanejamento de Turmas**: Unir alunos solo em duplas/trios compatíveis
2. **Treinamentos**: Do catálogo disponível ou personalizados
3. **Reuniões/Checkpoints**: Acompanhamento periódico
4. **Feedback Estruturado**: Comunicação com responsáveis
5. **Mentoria**: Pareamento com professor experiente

### Foco nos Gargalos
- Identifique a causa raiz, não apenas sintomas
- Priorize ações com maior ROI de tempo
- Considere capacidade do professor (carga horária)
- Sugira ações incrementais, não revolucionárias

### Integração com Simuladores
- Quando sugerir remanejamento, indique potencial de melhoria na média
- Referencie metas existentes quando aplicável
- Considere capacidade das salas (máx 4 alunos)

## FORMATO DE RESPOSTA (JSON)

Responda APENAS com um JSON válido no seguinte formato, sem markdown ou texto adicional:

{
  "resumo": "Análise geral em 2-3 frases",
  "pontos_fortes": ["Lista de aspectos positivos"],
  "pontos_atencao": [
    {
      "metrica": "nome_da_metrica",
      "valor_atual": "valor",
      "meta": "valor_meta",
      "tendencia": "subindo|estavel|caindo",
      "impacto": "alto|medio|baixo"
    }
  ],
  "sugestoes": [
    {
      "titulo": "Título da ação",
      "descricao": "O que fazer em detalhes",
      "tipo": "treinamento|reuniao|checkpoint|remanejamento|feedback|mentoria",
      "impacto_esperado": "Resultado quantificado",
      "prazo_sugerido": "Ex: 2 semanas",
      "prioridade": "alta|media|baixa",
      "meta_vinculada": "ID da meta se aplicável ou null"
    }
  ],
  "proximos_passos": "Resumo das ações imediatas recomendadas",
  "mensagem_motivacional": "Frase de encorajamento personalizada"
}`;

interface MetricasAtuais {
  total_alunos: number;
  total_turmas: number;
  media_alunos_turma: number;
  taxa_retencao: number;
  taxa_conversao: number;
  nps?: number | null; // DEPRECATED - mantido para compatibilidade
  taxa_presenca: number;
  evasoes_mes: number;
  fator_demanda_ponderado?: number; // V2: Fator de demanda ponderado
}

interface HistoricoItem {
  periodo: string;
  media_alunos_turma: number;
  taxa_retencao: number;
  taxa_conversao: number;
  nps: number | null;
  evasoes: number;
}

interface EvasaoRecente {
  aluno_nome: string;
  data: string;
  motivo: string;
  curso: string;
}

interface MetaAtiva {
  id: string;
  tipo: string;
  valor_atual: number;
  valor_meta: number;
  prazo: string;
  status: string;
}

interface AcaoRecente {
  tipo: string;
  titulo: string;
  data: string;
  status: string;
}

interface AlunoSolo {
  nome: string;
  curso: string;
  dia_semana: string;
  horario: string;
  nivel: string;
}

interface HealthScoreDetalhe {
  kpi: string;
  valor: number;
  scoreNormalizado: number;
  peso: number;
  contribuicao: number;
}

interface HealthScoreData {
  score: number;
  status: 'critico' | 'atencao' | 'saudavel';
  detalhes: HealthScoreDetalhe[];
}

interface ProfessorInsightsRequest {
  professor: {
    id: number;
    nome: string;
    especialidades: string[];
    unidades: string[];
    data_admissao: string;
    tipo_contrato: string;
  };
  metricas_atuais: MetricasAtuais;
  health_score?: HealthScoreData;
  historico: HistoricoItem[];
  evasoes_recentes: EvasaoRecente[];
  metas_ativas: MetaAtiva[];
  acoes_recentes: AcaoRecente[];
  alunos_solo: AlunoSolo[];
  competencia: string;
}

function calcularStatus(metricas: MetricasAtuais): string {
  // Crítico se qualquer métrica estiver crítica
  if (metricas.taxa_retencao < 70 || metricas.media_alunos_turma < 1.3 || 
      metricas.evasoes_mes >= 3) {
    return 'critico';
  }
  // Atenção se qualquer métrica estiver em atenção
  if (metricas.taxa_retencao < 95 || metricas.media_alunos_turma < 1.5 ||
      metricas.evasoes_mes >= 1 || metricas.taxa_presenca < 80) {
    return 'atencao';
  }
  return 'excelente';
}

function montarPromptUsuario(dados: ProfessorInsightsRequest): string {
  const status = calcularStatus(dados.metricas_atuais);
  const statusEmoji = status === 'critico' ? '🔴' : status === 'atencao' ? '🟡' : '🟢';
  
  // Health Score
  const healthScore = dados.health_score;
  const healthEmoji = healthScore?.status === 'saudavel' ? '🟢' : healthScore?.status === 'atencao' ? '🟡' : '🔴';
  const healthLabel = healthScore?.status === 'saudavel' ? 'SAUDÁVEL' : healthScore?.status === 'atencao' ? 'ATENÇÃO' : 'CRÍTICO';
  
  let prompt = `## DADOS DO PROFESSOR: ${dados.professor.nome}
**Status Geral**: ${statusEmoji} ${status.toUpperCase()}
**Competência**: ${dados.competencia}
**Especialidades**: ${dados.professor.especialidades.join(', ')}
**Unidades**: ${dados.professor.unidades.join(', ')}
**Tempo de Casa**: desde ${dados.professor.data_admissao}

### 💓 HEALTH SCORE (Saúde do Professor)
${healthScore ? `**Score**: ${healthEmoji} ${healthScore.score.toFixed(1)} pontos - ${healthLabel}

**Detalhamento por KPI:**
${healthScore.detalhes.map(d => `- ${d.kpi}: valor ${d.valor.toFixed(1)} → score ${d.scoreNormalizado.toFixed(0)} (peso ${(d.peso * 100).toFixed(0)}%) = contribuição ${d.contribuicao.toFixed(1)} pts`).join('\n')}
` : 'Health Score não calculado'}

### MÉTRICAS ATUAIS
- Total de Alunos: ${dados.metricas_atuais.total_alunos}
- Total de Turmas: ${dados.metricas_atuais.total_turmas}
- Média de Alunos por Turma: ${dados.metricas_atuais.media_alunos_turma.toFixed(2)} ${dados.metricas_atuais.media_alunos_turma < 1.3 ? '🔴' : dados.metricas_atuais.media_alunos_turma < 1.5 ? '🟡' : '🟢'}
- Taxa de Retenção: ${dados.metricas_atuais.taxa_retencao}% ${dados.metricas_atuais.taxa_retencao < 70 ? '🔴' : dados.metricas_atuais.taxa_retencao < 95 ? '🟡' : '🟢'}
- Conversao Exp->Mat (legado/bloqueada): ${dados.metricas_atuais.taxa_conversao}% - nao usar como KPI oficial
- Fator de Demanda: ${(dados.metricas_atuais.fator_demanda_ponderado || 1.0).toFixed(1)} ${(dados.metricas_atuais.fator_demanda_ponderado || 1.0) <= 1.2 ? '🟢' : (dados.metricas_atuais.fator_demanda_ponderado || 1.0) <= 2.0 ? '🟡' : '🔴'}
- Taxa de Presença: ${dados.metricas_atuais.taxa_presenca}% ${dados.metricas_atuais.taxa_presenca < 70 ? '🔴' : dados.metricas_atuais.taxa_presenca < 80 ? '🟡' : '🟢'}
- Evasões no Mês: ${dados.metricas_atuais.evasoes_mes} ${dados.metricas_atuais.evasoes_mes >= 3 ? '🔴' : dados.metricas_atuais.evasoes_mes >= 1 ? '🟡' : '🟢'}
`;

  if (dados.historico && dados.historico.length > 0) {
    prompt += `\n### HISTÓRICO (últimos meses)\n`;
    dados.historico.forEach(h => {
      prompt += `- ${h.periodo}: Média ${h.media_alunos_turma.toFixed(2)}, Retenção ${h.taxa_retencao}%, Conversao legado ${h.taxa_conversao}%, Evasões ${h.evasoes}\n`;
    });
  }

  if (dados.evasoes_recentes && dados.evasoes_recentes.length > 0) {
    prompt += `\n### EVASÕES RECENTES\n`;
    dados.evasoes_recentes.forEach(e => {
      prompt += `- ${e.aluno_nome} (${e.curso}): ${e.data} - Motivo: ${e.motivo}\n`;
    });
  }

  if (dados.metas_ativas && dados.metas_ativas.length > 0) {
    prompt += `\n### METAS ATIVAS\n`;
    dados.metas_ativas.forEach(m => {
      const progresso = m.valor_meta > 0 ? ((m.valor_atual / m.valor_meta) * 100).toFixed(0) : 0;
      prompt += `- [${m.id}] ${m.tipo}: ${m.valor_atual} → ${m.valor_meta} (${progresso}% concluído) - Prazo: ${m.prazo} - Status: ${m.status}\n`;
    });
  }

  if (dados.acoes_recentes && dados.acoes_recentes.length > 0) {
    prompt += `\n### AÇÕES RECENTES\n`;
    dados.acoes_recentes.forEach(a => {
      const emoji = a.status === 'concluida' ? '✅' : a.status === 'pendente' ? '⏳' : '❌';
      prompt += `- ${emoji} ${a.data}: ${a.titulo} (${a.tipo})\n`;
    });
  }

  if (dados.alunos_solo && dados.alunos_solo.length > 0) {
    prompt += `\n### ALUNOS EM AULAS INDIVIDUAIS (potencial para turmas)\n`;
    prompt += `Total: ${dados.alunos_solo.length} alunos sozinhos\n`;
    dados.alunos_solo.slice(0, 10).forEach(a => {
      prompt += `- ${a.nome}: ${a.curso}, ${a.dia_semana} ${a.horario}, Nível: ${a.nivel}\n`;
    });
    if (dados.alunos_solo.length > 10) {
      prompt += `... e mais ${dados.alunos_solo.length - 10} alunos\n`;
    }
  }

  prompt += `\n## TAREFA
Analise os dados acima e gere um plano de ação personalizado para o desenvolvimento deste professor.
Foque especialmente nos pontos de atenção identificados (métricas com 🔴 ou 🟡).
Considere o histórico para identificar tendências e a lista de alunos solo para sugestões de remanejamento.
Seja motivacional e construtivo, reconhecendo os pontos fortes antes de apontar melhorias.
Responda APENAS com o JSON estruturado, sem texto adicional.`;

  return prompt;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY não configurada");
    }

    const dados: ProfessorInsightsRequest = await req.json();

    const userPrompt = montarPromptUsuario(dados);

    // Chamar OpenAI API
    const aiResponse = await fetchOpenAIComRetry("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_completion_tokens: 4096,
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("Erro OpenAI:", errorText);
      throw new Error(`Erro na API OpenAI: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();

    // Extrair o texto da resposta
    const responseText = aiData.choices?.[0]?.message?.content;

    if (!responseText) {
      throw new Error("Resposta vazia da OpenAI");
    }

    // Tentar parsear o JSON
    let planoAcao;
    try {
      // Remover possíveis marcadores de código markdown
      const cleanJson = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      planoAcao = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error("Erro ao parsear JSON:", responseText);
      throw new Error("Resposta da OpenAI não é um JSON válido");
    }

    return new Response(JSON.stringify(planoAcao), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Erro na Edge Function:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message || "Erro interno",
        resumo: "Não foi possível gerar o plano de ação. Tente novamente.",
        pontos_fortes: [],
        pontos_atencao: [],
        sugestoes: [],
        proximos_passos: "Verifique a conexão e tente novamente.",
        mensagem_motivacional: "Continue focado no desenvolvimento contínuo!"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
