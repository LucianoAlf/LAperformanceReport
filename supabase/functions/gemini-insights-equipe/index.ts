/// <reference lib="deno.ns" />

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  isHealthScoreV3OfficialRankable,
  isHealthScoreV3Visible,
  parseHealthScoreV3Payload,
} from '../_shared/health-score-v3.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Retry com backoff exponencial para erros 503/429 da OpenAI
async function fetchOpenAIComRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);
    if (res.ok) return res;
    if ((res.status === 503 || res.status === 429) && attempt < maxRetries) {
      const wait = 1000 * Math.pow(2, attempt);
      console.log(`[openai-retry] status ${res.status}, tentativa ${attempt + 1}/${maxRetries + 1}, esperando ${wait}ms`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    return res;
  }
  return new Response(null, { status: 500 });
}


interface ProfessorMetricas {
  id: number;
  nome: string;
  total_alunos: number;
  total_turmas: number;
  media_alunos_turma: number;
  taxa_retencao: number;
  taxa_conversao: number;
  nps: number | null;
  taxa_presenca: number | null;
  presenca_publicavel: boolean;
  presenca_confianca?: string;
  presenca_cobertura?: number;
  presenca_eventos_confirmados?: number;
  presenca_eventos_incertos?: number;
  evasoes_mes: number;
  status: 'critico' | 'atencao' | 'excelente';
  unidades: string[];
  health_score?: number | null;
  health_score_confiavel: boolean;
  health_status?: 'critico' | 'atencao' | 'saudavel';
  health_score_v3?: unknown;
}

interface MetricasGerais {
  total_professores: number;
  total_alunos: number;
  media_geral_turma: number;
  taxa_retencao_media: number;
  taxa_conversao_media: number;
  nps_medio: number;
  total_evasoes: number;
  professores_criticos: number;
  professores_atencao: number;
  professores_excelentes: number;
  health_score_medio?: number;
  health_status_equipe?: 'critico' | 'atencao' | 'saudavel';
}

interface InsightsEquipeRequest {
  professores: ProfessorMetricas[];
  metricas_gerais: MetricasGerais;
  competencia: string;
  unidade_nome?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY não configurada');
    }

    const payload: InsightsEquipeRequest = await req.json();
    const { professores, competencia, unidade_nome } = payload;
    const professoresV3 = professores.map((professor) => ({
      id: professor.id,
      nome: professor.nome,
      unidades: professor.unidades,
      health_score_v3: parseHealthScoreV3Payload(professor.health_score_v3),
    }));

    const snapshotsVisiveis = professoresV3.filter((item) => isHealthScoreV3Visible(item.health_score_v3));
    const snapshotsOficiaisRankeaveis = professoresV3.filter((item) =>
      isHealthScoreV3OfficialRankable(item.health_score_v3)
    );
    const systemPromptV3 = `Você é um consultor especializado em gestão de escolas de música, com foco em desenvolvimento de equipes pedagógicas.

Sua tarefa é analisar os dados de performance de TODA A EQUIPE de professores e gerar um plano de ação estratégico para a coordenação pedagógica.

CONTRATO CANÔNICO V3:
- Use somente health_score_v3 para Health Score e seus seis pilares.
- Não recalcule score, classificação, meta, peso, cobertura ou qualquer métrica.
- estado_publicacao='parcial' permite diagnóstico coletivo sem ranking e sem premiação.
- Ranking e destaque só são permitidos quando ranking_habilitado=true e estado_publicacao='oficial'.
- valor_bruto nulo ou estado_base='sem_base' significa Sem base, nunca zero.
- Não use NPS, fator de demanda, crescimento nem métricas V2 para substituir um pilar V3.
- Campo Grande com presença em auditoria não pode ser penalizado por presença.
- Seja direto, construtivo e identifique a fonte/estado ao mencionar uma métrica.

Responda APENAS em JSON válido, sem markdown, no formato:
{
  "resumo_executivo": "Análise geral da equipe em 2-3 frases",
  "saude_equipe": "parcial" | "sem_base" | "critica" | "atencao" | "saudavel" | "excelente",
  "principais_desafios": [
    {
      "area": "string (ex: média de turma, retenção, etc)",
      "descricao": "string",
      "impacto": "alto" | "medio" | "baixo",
      "professores_afetados": ["nomes"]
    }
  ],
  "professores_destaque": {
    "criticos": [
      {
        "nome": "string",
        "problema_principal": "string",
        "acao_urgente": "string"
      }
    ],
    "exemplares": [
      {
        "nome": "string",
        "ponto_forte": "string",
        "pode_mentorar": "string (área que pode ajudar outros)"
      }
    ]
  },
  "plano_acao_coletivo": [
    {
      "prioridade": 1,
      "tipo": "treinamento" | "mentoria" | "processo" | "acompanhamento",
      "titulo": "string",
      "descricao": "string",
      "professores_alvo": ["nomes"] | "todos",
      "prazo_sugerido": "string",
      "resultado_esperado": "string"
    }
  ],
  "metricas_foco": [
    {
      "metrica": "string",
      "valor_atual": "string",
      "meta_sugerida": "string",
      "prazo": "string"
    }
  ],
  "mensagem_coordenacao": "Mensagem motivacional/estratégica para a coordenação (2-3 frases)"
}`;
    const userPromptV3 = `Analise a equipe ${unidade_nome ? `da unidade ${unidade_nome}` : 'consolidada'} em ${competencia}.

Snapshots V3 visíveis: ${snapshotsVisiveis.length}
Snapshots V3 oficiais habilitados para ranking: ${snapshotsOficiaisRankeaveis.length}

Dados canônicos V3:
${JSON.stringify(professoresV3, null, 2)}

Regras desta execução:
- Não produza ranking, premiação, "top", "melhor" ou "pior" se não houver snapshot oficial habilitado.
- Pode apontar padrões coletivos em métricas V3 disponíveis, sempre identificando que o ciclo está parcial.
- Ignore totalmente os agregados legados recebidos fora de health_score_v3.
- Não invente valor para sem_base.

Responda apenas no JSON solicitado.`;

    // Chamar OpenAI API
    const response = await fetchOpenAIComRetry(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-5.4-mini-2026-03-17',
          messages: [
            { role: 'system', content: systemPromptV3 },
            { role: 'user', content: userPromptV3 },
          ],
          temperature: 0.7,
          max_completion_tokens: 4096,
          response_format: { type: 'json_object' },
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro OpenAI:', errorText);
      throw new Error(`Erro na API OpenAI: ${response.status}`);
    }

    const aiResponse = await response.json();
    const textResponse = aiResponse.choices?.[0]?.message?.content;

    if (!textResponse) {
      throw new Error('Resposta vazia da API OpenAI');
    }

    // Limpar e parsear JSON
    let cleanJson = textResponse
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    // Tentar parsear o JSON
    let insights;
    try {
      insights = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error('Erro ao parsear JSON:', parseError);
      console.error('Texto recebido:', cleanJson);
      
      const officialRankingAvailable = snapshotsOficiaisRankeaveis.length > 0;
      insights = {
        resumo_executivo: `${snapshotsVisiveis.length} de ${professoresV3.length} professores possuem Health Score V3 exibível neste recorte. A leitura permanece ${officialRankingAvailable ? 'oficial' : 'parcial e sem ranking'}.`,
        saude_equipe: snapshotsVisiveis.length > 0 ? 'parcial' : 'sem_base',
        principais_desafios: [],
        professores_destaque: {
          criticos: [],
          exemplares: [],
        },
        plano_acao_coletivo: [
          {
            prioridade: 1,
            tipo: 'acompanhamento',
            titulo: 'Revisar snapshots V3 disponíveis',
            descricao: 'A resposta automática detalhada ficou indisponível; revise os pilares V3 com valor e base publicados.',
            professores_alvo: 'todos',
            prazo_sugerido: 'Nesta competência',
            resultado_esperado: 'Manter decisões apoiadas apenas em dados canônicos disponíveis',
          }
        ],
        metricas_foco: [],
        mensagem_coordenacao: officialRankingAvailable
          ? 'O ciclo está oficial; use o relatório canônico para a leitura detalhada.'
          : 'O ciclo está parcial. Use os valores disponíveis para acompanhamento, sem ranking ou premiação.',
      };
    }

    return new Response(
      JSON.stringify({ success: true, insights }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Erro na Edge Function:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Erro desconhecido' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
