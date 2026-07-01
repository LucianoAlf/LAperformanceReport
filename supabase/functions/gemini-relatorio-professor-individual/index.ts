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


interface RelatorioProfessorRequest {
  professor: {
    id: number;
    nome: string;
    especialidades: string[];
    total_alunos: number;
    total_turmas: number;
    media_alunos_turma: number;
    taxa_retencao: number;
    taxa_conversao: number;
    nps?: number | null; // DEPRECATED - mantido para compatibilidade
    taxa_presenca: number;
    evasoes_mes: number;
    health_score: number;
    health_status: string;
    fator_demanda_ponderado?: number; // V2: Fator de demanda ponderado pela carteira
  };
  metas: any[];
  acoes: any[];
  evasoes_recentes: any[];
  competencia: string;
  unidade_nome?: string;
}

function criarBarraProgresso(percentual: number, tamanho: number = 10): string {
  const pct = Math.min(Math.max(percentual, 0), 100);
  const preenchido = Math.round((pct / 100) * tamanho);
  const vazio = tamanho - preenchido;
  return '▓'.repeat(preenchido) + '░'.repeat(vazio);
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

    const payload: RelatorioProfessorRequest = await req.json();
    const { professor, metas, acoes, evasoes_recentes, competencia, unidade_nome } = payload;

    // Extrair ano e mês
    const [ano, mes] = competencia.split('-').map(Number);
    const mesesPorExtenso: Record<number, string> = {
      1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril',
      5: 'Maio', 6: 'Junho', 7: 'Julho', 8: 'Agosto',
      9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro'
    };
    const mesNome = mesesPorExtenso[mes] || '';

    // Determinar status geral
    const statusEmoji = professor.health_status === 'saudavel' ? '🟢' : 
                        professor.health_status === 'atencao' ? '🟡' : '🔴';
    const statusTexto = professor.health_status === 'saudavel' ? 'SAUDÁVEL' : 
                        professor.health_status === 'atencao' ? 'ATENÇÃO' : 'CRÍTICO';

    // Construir template do relatório
    let relatorio = '';

    relatorio += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    relatorio += `📊 *RELATÓRIO INDIVIDUAL*\n`;
    relatorio += `👨‍🏫 *${professor.nome.toUpperCase()}*\n`;
    relatorio += `📅 *${mesNome.toUpperCase()}/${ano}*\n`;
    if (unidade_nome) {
      relatorio += `🏢 ${unidade_nome}\n`;
    }
    relatorio += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    relatorio += `> [RESUMO_IA]\n\n`;

    // Health Score
    relatorio += `───────────────────────\n`;
    relatorio += `❤️ *HEALTH SCORE*\n`;
    relatorio += `───────────────────────\n`;
    relatorio += `${criarBarraProgresso(professor.health_score)} *${professor.health_score.toFixed(0)}* ${statusEmoji} ${statusTexto}\n\n`;

    // KPIs do Professor
    relatorio += `───────────────────────\n`;
    relatorio += `📈 *INDICADORES DO MÊS*\n`;
    relatorio += `───────────────────────\n`;
    relatorio += `• Carteira de Alunos: *${professor.total_alunos}*\n`;
    relatorio += `• Total de Turmas: *${professor.total_turmas}*\n`;
    relatorio += `• Média Alunos/Turma: *${professor.media_alunos_turma.toFixed(2)}*\n`;
    relatorio += `• Taxa de Presença: *${professor.taxa_presenca.toFixed(1)}%*\n`;
    relatorio += `• Taxa de Retenção: *${professor.taxa_retencao.toFixed(1)}%*\n`;
    relatorio += `• Conversao Exp->Mat: *${professor.taxa_conversao.toFixed(1)}%*\n`;
    relatorio += `• Fator de Demanda: *${(professor.fator_demanda_ponderado || 1.0).toFixed(1)}*\n`;
    relatorio += `• Evasões no Mês: *${professor.evasoes_mes}*\n\n`;

    // Especialidades
    if (professor.especialidades && professor.especialidades.length > 0) {
      relatorio += `🎵 *Cursos*: ${professor.especialidades.join(', ')}\n\n`;
    }

    // Metas Ativas
    if (metas && metas.length > 0) {
      relatorio += `───────────────────────\n`;
      relatorio += `🎯 *METAS ATIVAS*\n`;
      relatorio += `───────────────────────\n`;
      metas.forEach((meta: any) => {
        const progresso = meta.valor_meta > 0 ? (meta.valor_atual / meta.valor_meta) * 100 : 0;
        const status = progresso >= 100 ? '✅' : (progresso >= 70 ? '⚠️' : '❌');
        relatorio += `${criarBarraProgresso(progresso)} ${progresso.toFixed(0)}% ${meta.tipo} ${status}\n`;
      });
      relatorio += `\n`;
    }

    // Ações Pendentes
    const acoesPendentes = acoes?.filter((a: any) => a.status === 'pendente') || [];
    if (acoesPendentes.length > 0) {
      relatorio += `───────────────────────\n`;
      relatorio += `📋 *AÇÕES PENDENTES*\n`;
      relatorio += `───────────────────────\n`;
      acoesPendentes.slice(0, 5).forEach((acao: any) => {
        relatorio += `• ${acao.titulo} (${acao.tipo})\n`;
      });
      relatorio += `\n`;
    }

    // Evasões Recentes
    if (evasoes_recentes && evasoes_recentes.length > 0) {
      relatorio += `───────────────────────\n`;
      relatorio += `⚠️ *EVASÕES RECENTES*\n`;
      relatorio += `───────────────────────\n`;
      evasoes_recentes.slice(0, 3).forEach((ev: any) => {
        relatorio += `• ${ev.aluno_nome} - ${ev.motivo || 'Não informado'}\n`;
      });
      relatorio += `\n`;
    }

    // Seções da IA
    relatorio += `───────────────────────\n`;
    relatorio += `✅ *PONTOS FORTES*\n`;
    relatorio += `───────────────────────\n`;
    relatorio += `[PONTOS_FORTES_IA]\n\n`;

    relatorio += `───────────────────────\n`;
    relatorio += `⚠️ *PONTOS DE ATENÇÃO*\n`;
    relatorio += `───────────────────────\n`;
    relatorio += `[PONTOS_ATENCAO_IA]\n\n`;

    relatorio += `───────────────────────\n`;
    relatorio += `🎯 *SUGESTÕES DE DESENVOLVIMENTO*\n`;
    relatorio += `───────────────────────\n`;
    relatorio += `[SUGESTOES_IA]\n\n`;

    relatorio += `───────────────────────\n`;
    relatorio += `💬 *MENSAGEM PARA ${professor.nome.split(' ')[0].toUpperCase()}*\n`;
    relatorio += `───────────────────────\n`;
    relatorio += `> [MENSAGEM_IA]\n\n`;

    const dataHora = new Date();
    relatorio += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    relatorio += `📅 Gerado em: ${dataHora.toLocaleDateString('pt-BR')} às ${dataHora.getHours()}:${dataHora.getMinutes().toString().padStart(2, '0')}\n`;
    relatorio += `━━━━━━━━━━━━━━━━━━━━━━`;

    // Chamar IA
    const systemPrompt = `Você é um coordenador pedagógico de uma escola de música.
Analise os dados do professor e gere um relatório personalizado.

PROFESSOR: ${professor.nome}
CURSOS: ${professor.especialidades?.join(', ') || 'Não informado'}

REGRAS:
- Seja direto e objetivo
- Use linguagem profissional mas acolhedora
- Mencione o professor pelo primeiro nome
- Cada item deve ter no máximo 1-2 linhas
- Sugira ações práticas e específicas

Responda EXATAMENTE neste formato JSON:
{
  "resumo": "2-3 linhas de resumo do desempenho do professor",
  "pontos_fortes": ["ponto 1", "ponto 2", "ponto 3"],
  "pontos_atencao": ["ponto 1", "ponto 2"],
  "sugestoes": ["sugestão 1", "sugestão 2", "sugestão 3"],
  "mensagem": "mensagem motivacional personalizada para o professor"
}`;

    const dadosParaIA = {
      nome: professor.nome,
      health_score: professor.health_score,
      health_status: professor.health_status,
      total_alunos: professor.total_alunos,
      total_turmas: professor.total_turmas,
      media_alunos_turma: professor.media_alunos_turma,
      taxa_presenca: professor.taxa_presenca,
      taxa_retencao: professor.taxa_retencao,
      taxa_conversao_exp_mat: professor.taxa_conversao,
      fator_demanda_ponderado: professor.fator_demanda_ponderado || 1.0,
      evasoes_mes: professor.evasoes_mes,
      especialidades: professor.especialidades,
      metas_ativas: metas?.length || 0,
      acoes_pendentes: acoesPendentes.length,
      evasoes_recentes: evasoes_recentes?.length || 0
    };

    const response = await fetchGeminiComRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`,
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
        resumo: `${professor.nome} apresentou desempenho ${professor.health_status === 'saudavel' ? 'positivo' : 'que requer atenção'} neste mês.`,
        pontos_fortes: ['Comprometimento com os alunos', 'Presença nas aulas'],
        pontos_atencao: ['Monitorar indicadores de retenção'],
        sugestoes: ['Realizar acompanhamento individual com alunos', 'Participar de treinamentos'],
        mensagem: `${professor.nome.split(' ')[0]}, continue seu excelente trabalho! 🎶`
      };
    }

    // Substituir placeholders
    const relatorioFinal = relatorio
      .replace('[RESUMO_IA]', iaData.resumo || '')
      .replace('[PONTOS_FORTES_IA]', (iaData.pontos_fortes || []).map((p: string) => `• ${p}`).join('\n'))
      .replace('[PONTOS_ATENCAO_IA]', (iaData.pontos_atencao || []).map((p: string) => `• ${p}`).join('\n'))
      .replace('[SUGESTOES_IA]', (iaData.sugestoes || []).map((s: string) => `• ${s}`).join('\n'))
      .replace('[MENSAGEM_IA]', iaData.mensagem || '');

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
