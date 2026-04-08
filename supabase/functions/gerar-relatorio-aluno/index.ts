// Edge Function: gerar-relatorio-aluno
// Gera relatório individual do aluno usando Gemini para análise
// verify_jwt: false (chamado internamente)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RelatorioAlunoRequest {
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

function criarBarraProgresso(percentual: number, tamanho: number = 10): string {
  const pct = Math.min(Math.max(percentual, 0), 100);
  const preenchido = Math.round((pct / 100) * tamanho);
  const vazio = tamanho - preenchido;
  return '▓'.repeat(preenchido) + '░'.repeat(vazio);
}

function getFaseLabel(fase: string): string {
  const fases: Record<string, string> = {
    'onboarding': 'Onboarding (0-3 meses)',
    'consolidacao': 'Consolidação (3-6 meses)',
    'encantamento': 'Encantamento (6-9 meses)',
    'renovacao': 'Renovação (9+ meses)',
  };
  return fases[fase] || fase;
}

function getPagamentoLabel(status: string | null): string {
  const labels: Record<string, string> = {
    'em_dia': '✅ Em dia',
    'atrasado': '⚠️ Atrasado',
    'inadimplente': '🔴 Inadimplente',
  };
  return labels[status || ''] || 'Não informado';
}

function getFeedbackLabel(feedback: string | null): string {
  const labels: Record<string, string> = {
    'verde': '💚 Saudável',
    'amarelo': '💛 Atenção',
    'vermelho': '❤️ Crítico',
  };
  return labels[feedback || ''] || 'Sem feedback';
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

    const payload: RelatorioAlunoRequest = await req.json();
    const { aluno, metas, acoes, competencia } = payload;

    // Extrair ano e mês
    const [ano, mes] = competencia.split('-').map(Number);
    const mesesPorExtenso: Record<number, string> = {
      1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril',
      5: 'Maio', 6: 'Junho', 7: 'Julho', 8: 'Agosto',
      9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro'
    };
    const mesNome = mesesPorExtenso[mes] || '';

    // Determinar status geral
    const healthScore = aluno.health_score_numerico || 0;
    const statusEmoji = aluno.health_status === 'saudavel' ? '🟢' : 
                        aluno.health_status === 'atencao' ? '🟡' : '🔴';
    const statusTexto = aluno.health_status === 'saudavel' ? 'SAUDÁVEL' : 
                        aluno.health_status === 'atencao' ? 'ATENÇÃO' : 'CRÍTICO';

    // Construir template do relatório (formato limpo e direto)
    let relatorio = '';

    relatorio += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    relatorio += `📊 *RELATÓRIO DO ALUNO*\n`;
    relatorio += `🎓 *${aluno.nome.toUpperCase()}*\n`;
    relatorio += `📅 *${mesNome.toUpperCase()}/${ano}*\n`;
    if (aluno.unidade_nome) {
      relatorio += `🏢 ${aluno.unidade_nome}\n`;
    }
    relatorio += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    relatorio += `> [RESUMO_IA]\n`;

    // Health Score
    relatorio += `───────────────────────\n`;
    relatorio += `❤️ *HEALTH SCORE*\n`;
    relatorio += `${criarBarraProgresso(healthScore)} *${healthScore.toFixed(0)}* ${statusEmoji} ${statusTexto}\n`;

    // Indicadores
    relatorio += `───────────────────────\n`;
    relatorio += `📈 *INDICADORES*\n`;
    relatorio += `- Curso: ${aluno.curso_nome || 'Não informado'}\n`;
    relatorio += `- Professor: ${aluno.professor_nome || 'Não informado'}\n`;
    relatorio += `- Fase: ${getFaseLabel(aluno.fase_jornada)} (${aluno.tempo_permanencia_meses || 0} meses)\n`;
    relatorio += `- Pagamento: ${aluno.status_pagamento === 'em_dia' ? 'Em dia' : aluno.status_pagamento === 'atrasado' ? 'Atrasado' : 'Inadimplente'} (R$ ${aluno.valor_parcela?.toFixed(0) || '-'})\n`;
    relatorio += `- Presença: ${aluno.percentual_presenca ? aluno.percentual_presenca.toFixed(0) + '%' : '—'}\n`;
    relatorio += `- Feedback Professor: ${getFeedbackLabel(aluno.ultimo_feedback)}\n`;

    // Seções da IA
    relatorio += `───────────────────────\n`;
    relatorio += `✅ *PONTOS FORTES*\n`;
    relatorio += `[PONTOS_FORTES_IA]\n`;

    relatorio += `───────────────────────\n`;
    relatorio += `⚠️ *PONTOS DE ATENÇÃO*\n`;
    relatorio += `[PONTOS_ATENCAO_IA]\n`;

    relatorio += `───────────────────────\n`;
    relatorio += `🎯 *SUGESTÕES*\n`;
    relatorio += `[SUGESTOES_IA]\n`;

    const dataHora = new Date();
    relatorio += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    relatorio += `📅 Gerado em: ${dataHora.toLocaleDateString('pt-BR')} às ${dataHora.getHours()}:${dataHora.getMinutes().toString().padStart(2, '0')}\n`;
    relatorio += `━━━━━━━━━━━━━━━━━━━━━━`;

    // Chamar IA
    const systemPrompt = `Você é um consultor de sucesso do cliente de uma escola de música.
Analise os dados do aluno e gere um relatório personalizado.

ALUNO: ${aluno.nome}
CURSO: ${aluno.curso_nome || 'Não informado'}
PROFESSOR: ${aluno.professor_nome || 'Não informado'}

REGRAS:
- Seja direto e objetivo (máximo 1-2 linhas por item)
- Use linguagem profissional e acolhedora
- Mencione o aluno pelo primeiro nome
- Sugira ações práticas e específicas

Responda EXATAMENTE neste formato JSON:
{
  "resumo": "1-2 linhas de resumo geral do aluno",
  "pontos_fortes": ["ponto 1", "ponto 2"],
  "pontos_atencao": ["ponto 1"],
  "sugestoes": ["sugestão 1", "sugestão 2"]
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
      acoes_recentes: acoes?.length || 0,
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
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

    let iaData;
    try {
      const jsonText = iaResponseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      iaData = JSON.parse(jsonText);
    } catch (e) {
      iaData = {
        resumo: `${aluno.nome} está na fase de ${aluno.fase_jornada} com Health Score de ${healthScore}.`,
        pontos_fortes: ['Aluno matriculado e ativo', 'Acompanhamento em andamento'],
        pontos_atencao: ['Monitorar engajamento nas aulas'],
        sugestoes: ['Manter contato regular', 'Verificar satisfação com as aulas'],
      };
    }

    // Substituir placeholders
    const relatorioFinal = relatorio
      .replace('[RESUMO_IA]', iaData.resumo || '')
      .replace('[PONTOS_FORTES_IA]', (iaData.pontos_fortes || []).map((p: string) => `- ${p}`).join('\n'))
      .replace('[PONTOS_ATENCAO_IA]', (iaData.pontos_atencao || []).map((p: string) => `- ${p}`).join('\n'))
      .replace('[SUGESTOES_IA]', (iaData.sugestoes || []).map((s: string) => `- ${s}`).join('\n'));

    return new Response(
      JSON.stringify({ success: true, relatorio: relatorioFinal }),
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
