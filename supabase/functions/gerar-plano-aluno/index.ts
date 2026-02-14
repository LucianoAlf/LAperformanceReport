// Edge Function: gerar-plano-aluno
// Gera plano de ação inteligente para o aluno usando Gemini
// verify_jwt: false (chamado internamente)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PlanoAlunoRequest {
  aluno: {
    id: number;
    nome: string;
    curso_nome: string | null;
    professor_nome: string | null;
    unidade_nome: string | null;
    tempo_permanencia_meses: number | null;
    fase_jornada: string;
    health_score_numerico: number | null;
    health_status: string | null;
    status_pagamento: string | null;
    valor_parcela: number | null;
    percentual_presenca: number | null;
    dia_aula: string | null;
    horario_aula: string | null;
    ultimo_feedback: string | null;
  };
  metas: any[];
  acoes: any[];
  competencia: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY não configurada');
    }

    const payload: PlanoAlunoRequest = await req.json();
    const { aluno, metas, acoes } = payload;

    const healthScore = aluno.health_score_numerico || 0;

    // Prompt para a IA
    const systemPrompt = `Você é um consultor de sucesso do cliente de uma escola de música.
Analise os dados do aluno e gere um plano de ação personalizado para melhorar a experiência e retenção.

ALUNO: ${aluno.nome}
CURSO: ${aluno.curso_nome || 'Não informado'}
PROFESSOR: ${aluno.professor_nome || 'Não informado'}
FASE DA JORNADA: ${aluno.fase_jornada}
HEALTH SCORE: ${healthScore}
STATUS: ${aluno.health_status}
PAGAMENTO: ${aluno.status_pagamento}
PRESENÇA: ${aluno.percentual_presenca || 'Não informado'}%
FEEDBACK PROFESSOR: ${aluno.ultimo_feedback || 'Sem feedback'}
TEMPO DE CASA: ${aluno.tempo_permanencia_meses || 0} meses

CONTEXTO DAS FASES:
- Onboarding (0-3 meses): Foco em integração e primeiras conquistas
- Consolidação (3-6 meses): Momento crítico de retenção, risco de evasão
- Encantamento (6-9 meses): Aprofundar vínculo, oferecer experiências especiais
- Renovação (9+ meses): Preparar renovação, reconhecer fidelidade

TIPOS DE AÇÕES POSSÍVEIS:
1. Contato telefônico - Ligação para responsável
2. Mensagem WhatsApp - Envio de mensagem personalizada
3. Reunião presencial - Conversa com responsável na escola
4. Ação de encantamento - Brinde, convite para evento, reconhecimento
5. Acompanhamento pedagógico - Conversa com professor sobre o aluno
6. Oferta especial - Desconto ou condição especial para renovação

REGRAS:
- Máximo 3 ações no plano
- Cada ação deve ser específica e acionável
- Considere a fase da jornada para priorizar ações
- Priorize ações de alto impacto para alunos críticos

Responda EXATAMENTE neste formato JSON:
{
  "analise": "1-2 linhas de análise da situação",
  "prioridade": "alta|media|baixa",
  "acoes": [
    {
      "titulo": "Título curto da ação",
      "descricao": "O que fazer em detalhes",
      "tipo": "contato|mensagem|reuniao|encantamento|pedagogico|oferta",
      "prazo": "imediato|7dias|15dias|30dias",
      "responsavel": "coordenacao|professor|comercial"
    }
  ],
  "resultado_esperado": "O que esperamos alcançar com essas ações"
}`;

    const dadosParaIA = {
      nome: aluno.nome,
      curso: aluno.curso_nome,
      professor: aluno.professor_nome,
      health_score: healthScore,
      health_status: aluno.health_status,
      tempo_permanencia_meses: aluno.tempo_permanencia_meses,
      fase_jornada: aluno.fase_jornada,
      status_pagamento: aluno.status_pagamento,
      percentual_presenca: aluno.percentual_presenca,
      ultimo_feedback: aluno.ultimo_feedback,
      metas_ativas: metas?.length || 0,
      acoes_pendentes: acoes?.filter((a: any) => a.status === 'pendente')?.length || 0,
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: systemPrompt + '\n\nDADOS:\n' + JSON.stringify(dadosParaIA, null, 2) }]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Erro na API Gemini: ${response.status}`);
    }

    const geminiResponse = await response.json();
    const iaResponseText = geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text;

    let plano;
    try {
      const jsonText = iaResponseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      plano = JSON.parse(jsonText);
    } catch (e) {
      // Fallback se a IA não retornar JSON válido
      plano = {
        analise: `${aluno.nome} está na fase de ${aluno.fase_jornada} e requer acompanhamento.`,
        prioridade: aluno.health_status === 'critico' ? 'alta' : aluno.health_status === 'atencao' ? 'media' : 'baixa',
        acoes: [
          {
            titulo: 'Verificar satisfação com as aulas',
            descricao: 'Entrar em contato com o responsável para verificar satisfação',
            tipo: 'contato',
            prazo: '7dias',
            responsavel: 'coordenacao'
          }
        ],
        resultado_esperado: 'Melhorar engajamento e satisfação do aluno'
      };
    }

    return new Response(
      JSON.stringify({ success: true, plano }),
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
