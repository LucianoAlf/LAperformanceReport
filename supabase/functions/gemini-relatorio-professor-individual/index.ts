/// <reference lib="deno.ns" />

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  formatHealthScoreV3MetricValue,
  getHealthScoreV3Metric,
  healthScoreV3PublicationLabel,
  isHealthScoreV3Visible,
  parseHealthScoreV3Payload,
} from "../_shared/health-score-v3.ts";

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
    taxa_presenca: number | null;
    presenca_publicavel: boolean;
    presenca_confianca?: string;
    presenca_cobertura?: number;
    presenca_eventos_confirmados?: number;
    presenca_eventos_incertos?: number;
    evasoes_mes: number;
    fator_demanda_ponderado?: number; // V2: Fator de demanda ponderado pela carteira
  };
  health_score_v3?: unknown;
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
    const healthScoreV3 = parseHealthScoreV3Payload(payload.health_score_v3);

    // Extrair ano e mês
    const [ano, mes] = competencia.split('-').map(Number);
    const mesesPorExtenso: Record<number, string> = {
      1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril',
      5: 'Maio', 6: 'Junho', 7: 'Julho', 8: 'Agosto',
      9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro'
    };
    const mesNome = mesesPorExtenso[mes] || '';
    const healthVisivel = isHealthScoreV3Visible(healthScoreV3);
    const retencao = getHealthScoreV3Metric(healthScoreV3, 'retencao');
    const permanencia = getHealthScoreV3Metric(healthScoreV3, 'permanencia');
    const conversao = getHealthScoreV3Metric(healthScoreV3, 'conversao');
    const mediaTurma = getHealthScoreV3Metric(healthScoreV3, 'media_turma');
    const numeroAlunos = getHealthScoreV3Metric(healthScoreV3, 'numero_alunos');
    const presenca = getHealthScoreV3Metric(healthScoreV3, 'presenca');

    // Determinar status geral
    const statusV3 = healthScoreV3?.classificacao;
    const statusEmoji = statusV3 === 'saudavel' ? '🟢' : statusV3 === 'atencao' ? '🟡' : '🔴';
    const statusTexto = statusV3 === 'saudavel' ? 'SAUDÁVEL' : statusV3 === 'atencao' ? 'ATENÇÃO' : 'CRÍTICO';
    const coberturaTexto = healthScoreV3?.cobertura == null
      ? 'Sem base'
      : `${healthScoreV3.cobertura.toFixed(0)}%`;

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
    relatorio += `❤️ *HEALTH SCORE V3 — ${healthScoreV3PublicationLabel(healthScoreV3).toUpperCase()}*\n`;
    relatorio += `───────────────────────\n`;
    relatorio += healthVisivel
      ? `${criarBarraProgresso(healthScoreV3!.score!)} *${healthScoreV3!.score!.toFixed(0)}* ${statusEmoji} ${statusTexto}\nCobertura: *${coberturaTexto}*\n\n`
      : `*Sem base* — ${healthScoreV3?.motivo_bloqueio || 'snapshot canônico indisponível para o recorte'}.\n\n`;

    // KPIs do Professor
    relatorio += `───────────────────────\n`;
    relatorio += `📈 *INDICADORES DO MÊS*\n`;
    relatorio += `───────────────────────\n`;
    relatorio += `• Número de Alunos: *${formatHealthScoreV3MetricValue(numeroAlunos)}*\n`;
    relatorio += `• Média Alunos/Turma: *${formatHealthScoreV3MetricValue(mediaTurma)}*\n`;
    relatorio += `• Retenção Atribuível: *${formatHealthScoreV3MetricValue(retencao)}*\n`;
    relatorio += `• Permanência com o Professor: *${formatHealthScoreV3MetricValue(permanencia)}*\n`;
    relatorio += `• Conversão Exp->Mat: *${formatHealthScoreV3MetricValue(conversao)}*\n`;
    relatorio += `• Presença dos Alunos: *${formatHealthScoreV3MetricValue(presenca)}*\n\n`;

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
- Use somente o objeto health_score_v3 recebido; não recalcule métricas, nota ou classificação.
- Health Score parcial pode ser descrito como parcial, mas nunca usado em ranking ou premiação.
- Métrica com estado_base sem_base ou valor_bruto nulo deve ser descrita como "Sem base" e ignorada em julgamentos.
- Nunca converta valor nulo em zero e nunca deduza presença a partir de outro campo.

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
      health_score_v3: healthScoreV3,
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
        resumo: healthVisivel
          ? `${professor.nome} possui Health Score V3 ${healthScoreV3!.estado_publicacao} no recorte.`
          : `${professor.nome} ainda não possui base suficiente para o Health Score V3 neste recorte.`,
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
