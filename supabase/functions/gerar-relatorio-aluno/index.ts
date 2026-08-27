/// <reference lib="deno.ns" />

// Edge Function: gerar-relatorio-aluno
// Gera relatório individual do aluno usando Gemini para análise
// verify_jwt: false (chamado internamente)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PresencaContextoCanonico {
  fonte?: 'get_presenca_contexto_agente_v1' | 'vw_presenca_ocorrencia_canonica_v2';
  periodo: { inicio: string | null; fim: string | null } | string | null;
  universo_eventos: number | null;
  presentes: number | null;
  faltas_confirmadas: number | null;
  indeterminados: number | null;
  conflitos: number | null;
  revisoes_estruturais: number | null;
  regra_versao: string | null;
  dados_status: string;
  sincronizado_em: string | null;
  estado_publicacao: string;
}

function normalizarPresencaContexto(
  contexto?: Partial<PresencaContextoCanonico> | null,
): PresencaContextoCanonico | null {
  if (!contexto) return null;
  return {
    fonte: contexto.fonte,
    periodo: contexto.periodo ?? null,
    universo_eventos: contexto.universo_eventos ?? null,
    presentes: contexto.presentes ?? null,
    faltas_confirmadas: contexto.faltas_confirmadas ?? null,
    indeterminados: contexto.indeterminados ?? null,
    conflitos: contexto.conflitos ?? null,
    revisoes_estruturais: contexto.revisoes_estruturais ?? null,
    regra_versao: contexto.regra_versao ?? null,
    dados_status: contexto.dados_status ?? 'indisponivel',
    sincronizado_em: contexto.sincronizado_em ?? null,
    estado_publicacao: contexto.estado_publicacao ?? 'bloqueado',
  };
}

function formatarPeriodo(periodo: PresencaContextoCanonico['periodo']): string {
  if (!periodo) return 'não informado';
  if (typeof periodo === 'string') return periodo;
  return `${periodo.inicio ?? '?'} a ${periodo.fim ?? '?'}`;
}

function linhasPresencaCanonica(contexto: PresencaContextoCanonico | null): string[] {
  if (!contexto) return [];
  const publicavel = contexto.dados_status === 'atualizados'
    && contexto.estado_publicacao === 'publicavel'
    && (contexto.conflitos ?? 0) === 0
    && (contexto.revisoes_estruturais ?? 0) === 0;
  const taxa = publicavel
    && contexto.universo_eventos != null
    && contexto.universo_eventos > 0
    && contexto.presentes != null
      ? `${((contexto.presentes / contexto.universo_eventos) * 100).toFixed(1)}%`
      : 'Em auditoria (presenca_desatualizada)';

  return [
    `- Presença canônica: ${taxa}`,
    `  Período: ${formatarPeriodo(contexto.periodo)}`,
    `  Universo: ${contexto.universo_eventos ?? 'não publicável'} eventos`,
    `  Regra: ${contexto.regra_versao ?? 'não informada'}`,
    `  Frescor: ${contexto.dados_status}; sincronizado_em=${contexto.sincronizado_em ?? 'não informado'}`,
    `  Publicação: ${contexto.estado_publicacao}; conflitos=${contexto.conflitos ?? 'não informado'}; revisoes_estruturais=${contexto.revisoes_estruturais ?? 'não informado'}`,
  ];
}

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
    presenca_contexto?: Partial<PresencaContextoCanonico> | null;
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
    const presencaContexto = normalizarPresencaContexto(aluno.presenca_contexto);
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
    relatorio += `- Pagamento: ${getPagamentoLabel(aluno.status_pagamento)} (R$ ${aluno.valor_parcela?.toFixed(0) || '-'})\n`;
    for (const linha of linhasPresencaCanonica(presencaContexto)) relatorio += `${linha}\n`;
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
- Use presença somente quando o contexto canônico estiver presente e publicável
- Se a presença estiver Em auditoria, não conclua falta, desengajamento ou culpa operacional
- Se o contexto canônico estiver ausente, não infira presença pelo Health Score

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
      presenca_contexto: presencaContexto,
      ultimo_feedback: aluno.ultimo_feedback,
      metas_ativas: metas?.length || 0,
      acoes_recentes: acoes?.length || 0,
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`,
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
      JSON.stringify({
        success: true,
        relatorio: relatorioFinal,
        ...(presencaContexto ? { presenca_contexto: presencaContexto } : {}),
      }),
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
