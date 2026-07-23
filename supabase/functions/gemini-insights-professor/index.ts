/// <reference lib="deno.ns" />

// Edge Function: gemini-insights-professor
// Gera plano de ação inteligente para desenvolvimento de professores usando Gemini 3.0 Flash Preview

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  healthScoreV3PublicationLabel,
  isHealthScoreV3Visible,
  parseHealthScoreV3Payload,
} from "../_shared/health-score-v3.ts";

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
- A meta vigente vem exclusivamente do snapshot V3 recebido.
- Contexto: Turmas maiores geram mais receita e melhor uso das salas

### Taxa de Retenção (Churn Invertido)
- A regra, a meta, o numerador e o denominador vêm exclusivamente do snapshot V3.

### Conversão Experimental -> Matrícula
- Usar somente o valor canônico V3 e respeitar a base mínima registrada no snapshot.

### Taxa de Presença
- Usar somente o resultado semântico V3.
- Campo Grande pode permanecer em auditoria e não deve ser inferido nem penalizado.

### Evasões
- Meta: 0 evasões/mês
- Atenção: 1-2 evasões
- Crítico: ≥3 evasões
- Análise: Considerar motivos e padrões

### Health Score V3
O score chega pronto, versionado e auditado no objeto health_score_v3. Seus seis pilares são retenção atribuível, permanência com o professor, conversão, média/turma, número de alunos e presença. Não recalcule score, nota, classificação, peso, meta ou cobertura.

## DIRETRIZES OBRIGATÓRIAS

- Snapshot parcial pode orientar leitura individual, mas nunca ranking ou premiação.
- Métrica com valor_bruto nulo ou estado_base sem_base não pode orientar julgamento.
- Nunca converta nulo em zero e nunca complete dado ausente por inferência.

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
  taxa_presenca: number | null;
  presenca_publicavel: boolean;
  presenca_confianca?: string;
  presenca_cobertura?: number;
  presenca_eventos_confirmados?: number;
  presenca_eventos_incertos?: number;
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
  health_score_v3?: unknown;
  historico: HistoricoItem[];
  evasoes_recentes: EvasaoRecente[];
  metas_ativas: MetaAtiva[];
  acoes_recentes: AcaoRecente[];
  alunos_solo: AlunoSolo[];
  competencia: string;
}

function montarPromptUsuarioV3(dados: ProfessorInsightsRequest): string {
  const snapshot = parseHealthScoreV3Payload(dados.health_score_v3);
  const scoreVisivel = isHealthScoreV3Visible(snapshot);

  return `## DADOS DO PROFESSOR: ${dados.professor.nome}
**Competência**: ${dados.competencia}
**Especialidades**: ${dados.professor.especialidades.join(', ')}
**Unidades**: ${dados.professor.unidades.join(', ')}

### HEALTH SCORE V3
Campo estado_publicacao: ${healthScoreV3PublicationLabel(snapshot)}
Score exibível: ${scoreVisivel ? snapshot!.score : 'Sem base'}
Cobertura: ${snapshot?.cobertura ?? 'Sem base'}

Snapshot canônico estruturado:
${JSON.stringify(snapshot, null, 2)}

### CONTEXTO OPERACIONAL COMPLEMENTAR
${JSON.stringify({
    evasoes_recentes: dados.evasoes_recentes,
    metas_ativas: dados.metas_ativas,
    acoes_recentes: dados.acoes_recentes,
    alunos_solo: dados.alunos_solo,
  }, null, 2)}

## REGRAS INEGOCIÁVEIS
- Não recalcule score, nota, classificação, meta, peso ou cobertura.
- Não use metricas_atuais legadas para substituir qualquer pilar V3.
- Valor nulo significa Sem base, nunca zero.
- Snapshot parcial pode orientar este plano individual, mas nunca ranking ou premiação.
- Campo Grande com presença em auditoria não pode receber alerta ou penalidade de presença.
- Use apenas pilares com valor_bruto não nulo para avaliar o professor.

## TAREFA
Gere um plano individual construtivo usando somente evidências publicáveis do snapshot V3 e o contexto complementar. Responda apenas com o JSON estruturado solicitado.`;
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

    const userPrompt = montarPromptUsuarioV3(dados);

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
