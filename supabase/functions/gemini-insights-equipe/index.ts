import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Retry com backoff exponencial para erros 503/429 do Gemini
async function fetchGeminiComRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);
    if (res.ok) return res;
    if ((res.status === 503 || res.status === 429) && attempt < maxRetries) {
      const wait = 1000 * Math.pow(2, attempt);
      console.log(`[gemini-retry] status ${res.status}, tentativa ${attempt + 1}/${maxRetries + 1}, esperando ${wait}ms`);
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
  taxa_presenca: number;
  evasoes_mes: number;
  status: 'critico' | 'atencao' | 'excelente';
  unidades: string[];
  health_score?: number;
  health_status?: 'critico' | 'atencao' | 'saudavel';
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
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY não configurada');
    }

    const payload: InsightsEquipeRequest = await req.json();
    const { professores, metricas_gerais, competencia, unidade_nome } = payload;

    // Preparar lista de professores críticos
    const criticos = professores.filter(p => p.status === 'critico');
    const atencao = professores.filter(p => p.status === 'atencao');
    const excelentes = professores.filter(p => p.status === 'excelente');

    // Identificar problemas mais comuns
    const problemasMediaTurma = professores.filter(p => p.media_alunos_turma < 1.3);
    const problemasRetencao = professores.filter(p => p.taxa_retencao < 70);
    const problemasConversao = professores.filter(p => p.taxa_conversao < 70);
    const problemasNPS = professores.filter(p => p.nps !== null && p.nps < 7);

    // Identificar top performers
    const topMediaTurma = [...professores].sort((a, b) => b.media_alunos_turma - a.media_alunos_turma)[0];
    const topRetencao = [...professores].sort((a, b) => b.taxa_retencao - a.taxa_retencao)[0];
    const topConversao = [...professores].sort((a, b) => b.taxa_conversao - a.taxa_conversao)[0];

    const systemPrompt = `Você é um consultor especializado em gestão de escolas de música, com foco em desenvolvimento de equipes pedagógicas.

Sua tarefa é analisar os dados de performance de TODA A EQUIPE de professores e gerar um plano de ação estratégico para a coordenação pedagógica.

IMPORTANTE:
- Foque em ações COLETIVAS e ESTRATÉGICAS
- Identifique padrões e tendências gerais
- Destaque professores que precisam de atenção urgente
- Sugira professores exemplares como mentores
- Proponha treinamentos em grupo quando houver problemas comuns
- Seja direto e prático nas sugestões
- USE O HEALTH SCORE como métrica principal de saúde do professor

METAS DE REFERÊNCIA:
- Média de alunos por turma: ≥ 1.5 (ideal), 1.3-1.5 (aceitável), < 1.3 (crítico)
- Taxa de retenção: ≥ 95% (excelente), 70-95% (regular), < 70% (crítico)
- Taxa de conversão: ≥ 90% (excelente), 70-90% (bom), < 70% (ruim)
- NPS: ≥ 8.5 (excelente), 7-8.5 (regular), < 7 (ruim)

HEALTH SCORE (Saúde do Professor):
O Health Score é uma métrica composta de 0-100 que resume a saúde geral do professor.
Pesos: Curso 10%, Média/Turma 20%, Retenção 20%, Conversão 15%, NPS 15%, Presença 10%, Evasões 10%
- 🟢 Saudável: 80-100 pontos
- 🟡 Atenção: 60-79 pontos
- 🔴 Crítico: 0-59 pontos
IMPORTANTE: O Health Score considera o tipo de curso (bateria tem limite menor que canto).

Responda APENAS em JSON válido, sem markdown, no formato:
{
  "resumo_executivo": "Análise geral da equipe em 2-3 frases",
  "saude_equipe": "critica" | "atencao" | "saudavel" | "excelente",
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

    // Calcular Health Score médio da equipe
    const professoresComHealth = professores.filter(p => p.health_score !== undefined);
    const healthScoreMedio = professoresComHealth.length > 0 
      ? professoresComHealth.reduce((acc, p) => acc + (p.health_score || 0), 0) / professoresComHealth.length 
      : metricas_gerais.health_score_medio || 0;
    const healthStatusEquipe = healthScoreMedio >= 80 ? 'SAUDÁVEL' : healthScoreMedio >= 60 ? 'ATENÇÃO' : 'CRÍTICO';
    const healthEmoji = healthScoreMedio >= 80 ? '🟢' : healthScoreMedio >= 60 ? '🟡' : '🔴';

    // Professores por Health Score
    const healthCriticos = professores.filter(p => (p.health_score || 0) < 60);
    const healthAtencao = professores.filter(p => (p.health_score || 0) >= 60 && (p.health_score || 0) < 80);
    const healthSaudaveis = professores.filter(p => (p.health_score || 0) >= 80);

    const userPrompt = `Analise a equipe de professores ${unidade_nome ? `da unidade ${unidade_nome}` : ''} em ${competencia}:

💓 HEALTH SCORE DA EQUIPE:
${healthEmoji} Score Médio: ${healthScoreMedio.toFixed(1)} pontos - ${healthStatusEquipe}
- 🟢 Saudáveis (≥80): ${healthSaudaveis.length} professores
- 🟡 Atenção (60-79): ${healthAtencao.length} professores
- 🔴 Críticos (<60): ${healthCriticos.length} professores

📊 MÉTRICAS GERAIS DA EQUIPE:
- Total de professores: ${metricas_gerais.total_professores}
- Total de alunos: ${metricas_gerais.total_alunos}
- Média geral de alunos/turma: ${metricas_gerais.media_geral_turma.toFixed(2)}
- Taxa de retenção média: ${metricas_gerais.taxa_retencao_media.toFixed(1)}%
- Taxa de conversão média: ${metricas_gerais.taxa_conversao_media.toFixed(1)}%
- NPS médio: ${metricas_gerais.nps_medio.toFixed(1)}
- Total de evasões no mês: ${metricas_gerais.total_evasoes}

📈 DISTRIBUIÇÃO POR STATUS:
- 🔴 Críticos: ${metricas_gerais.professores_criticos} professores
- 🟡 Atenção: ${metricas_gerais.professores_atencao} professores
- 🟢 Excelentes: ${metricas_gerais.professores_excelentes} professores

🔴 PROFESSORES COM HEALTH SCORE CRÍTICO (<60):
${healthCriticos.map(p => `- ${p.nome}: Health ${(p.health_score || 0).toFixed(0)}, Média ${p.media_alunos_turma.toFixed(1)}, Retenção ${p.taxa_retencao.toFixed(0)}%, ${p.evasoes_mes} evasões`).join('\n') || 'Nenhum'}

🟡 PROFESSORES COM HEALTH SCORE EM ATENÇÃO (60-79):
${healthAtencao.map(p => `- ${p.nome}: Health ${(p.health_score || 0).toFixed(0)}, Média ${p.media_alunos_turma.toFixed(1)}, Retenção ${p.taxa_retencao.toFixed(0)}%`).join('\n') || 'Nenhum'}

🟢 PROFESSORES COM HEALTH SCORE SAUDÁVEL (≥80):
${healthSaudaveis.slice(0, 5).map(p => `- ${p.nome}: Health ${(p.health_score || 0).toFixed(0)}, Média ${p.media_alunos_turma.toFixed(1)}, NPS ${p.nps?.toFixed(1) || '-'}`).join('\n') || 'Nenhum'}

🏆 TOP PERFORMERS:
- Melhor média de turma: ${topMediaTurma?.nome} (${topMediaTurma?.media_alunos_turma.toFixed(1)})
- Melhor retenção: ${topRetencao?.nome} (${topRetencao?.taxa_retencao.toFixed(0)}%)
- Melhor conversão: ${topConversao?.nome} (${topConversao?.taxa_conversao.toFixed(0)}%)

⚠️ PROBLEMAS IDENTIFICADOS:
- Health Score crítico (<60): ${healthCriticos.length} professores
- Média de turma baixa (<1.3): ${problemasMediaTurma.length} professores
- Retenção crítica (<70%): ${problemasRetencao.length} professores
- Conversão baixa (<70%): ${problemasConversao.length} professores
- NPS baixo (<7): ${problemasNPS.length} professores

Gere um plano de ação estratégico para a coordenação pedagógica, priorizando os professores com Health Score mais baixo.`;

    // Chamar Gemini API
    const response = await fetchGeminiComRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: systemPrompt + '\n\n' + userPrompt }]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 4096,
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro Gemini:', errorText);
      throw new Error(`Erro na API Gemini: ${response.status}`);
    }

    const geminiResponse = await response.json();
    const textResponse = geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResponse) {
      throw new Error('Resposta vazia da API Gemini');
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
      
      // Retornar resposta de fallback
      insights = {
        resumo_executivo: `A equipe possui ${metricas_gerais.professores_criticos} professores em estado crítico que precisam de atenção imediata. A média geral de alunos por turma está em ${metricas_gerais.media_geral_turma.toFixed(2)}.`,
        saude_equipe: metricas_gerais.professores_criticos > metricas_gerais.total_professores * 0.3 ? 'critica' : 
                      metricas_gerais.professores_criticos > 0 ? 'atencao' : 'saudavel',
        principais_desafios: [
          {
            area: "Média de turma",
            descricao: `${problemasMediaTurma.length} professores com média abaixo de 1.3`,
            impacto: problemasMediaTurma.length > 5 ? "alto" : "medio",
            professores_afetados: problemasMediaTurma.slice(0, 5).map(p => p.nome)
          }
        ],
        professores_destaque: {
          criticos: criticos.slice(0, 3).map(p => ({
            nome: p.nome,
            problema_principal: p.media_alunos_turma < 1.3 ? "Média de turma baixa" : "Retenção crítica",
            acao_urgente: "Agendar reunião de alinhamento"
          })),
          exemplares: excelentes.slice(0, 2).map(p => ({
            nome: p.nome,
            ponto_forte: p.media_alunos_turma >= 1.5 ? "Excelente média de turma" : "Alta retenção",
            pode_mentorar: "Gestão de turmas"
          }))
        },
        plano_acao_coletivo: [
          {
            prioridade: 1,
            tipo: "treinamento",
            titulo: "Workshop de Gestão de Turmas",
            descricao: "Treinamento focado em técnicas para aumentar a média de alunos por turma",
            professores_alvo: problemasMediaTurma.slice(0, 5).map(p => p.nome),
            prazo_sugerido: "Próximas 2 semanas",
            resultado_esperado: "Aumentar média de turma em 0.2 pontos"
          }
        ],
        metricas_foco: [
          {
            metrica: "Média de alunos/turma",
            valor_atual: metricas_gerais.media_geral_turma.toFixed(2),
            meta_sugerida: "1.5",
            prazo: "3 meses"
          }
        ],
        mensagem_coordenacao: "Foque nos professores críticos esta semana. Pequenas melhorias consistentes geram grandes resultados."
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
