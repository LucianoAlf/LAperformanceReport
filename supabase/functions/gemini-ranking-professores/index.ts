/// <reference lib="deno.ns" />

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  getHealthScoreV3Metric,
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


function criarBarraProgresso(percentual: number, tamanho: number = 10): string {
  const pct = Math.min(Math.max(percentual, 0), 100);
  const preenchido = Math.round((pct / 100) * tamanho);
  const vazio = tamanho - preenchido;
  return '▓'.repeat(preenchido) + '░'.repeat(vazio);
}

function formatarVariacao(valor: number, media: number): string {
  const diff = valor - media;
  const pct = media > 0 ? ((diff / media) * 100).toFixed(0) : '0';
  return diff >= 0 ? `+${pct}%` : `${pct}%`;
}

const OPENAI_MODEL = 'gpt-5.4-mini-2026-03-17';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY não configurada');
    }

    const payload = await req.json();
    const { dados } = payload;

    // Extrair dados do payload
    const periodo = dados.periodo || {};
    const unidadeNome = periodo.unidade_nome || 'Consolidado';
    const ano = periodo.ano || new Date().getFullYear();
    const mes = periodo.mes || new Date().getMonth() + 1;

    const mesesPorExtenso: Record<number, string> = {
      1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril',
      5: 'Maio', 6: 'Junho', 7: 'Julho', 8: 'Agosto',
      9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro'
    };
    const mesNome = mesesPorExtenso[mes] || '';

    // Ranking só pode nascer de snapshots V3 oficiais e habilitados.
    const kpisProfessoresRaw = dados.kpis_professores || [];
    const professores = kpisProfessoresRaw.flatMap((p: any) => {
      const snapshot = parseHealthScoreV3Payload(p.health_score_v3);
      if (!snapshot || snapshot.estado_publicacao !== 'oficial' || !snapshot.ranking_habilitado) {
        return [];
      }
      const numeroAlunos = getHealthScoreV3Metric(snapshot, 'numero_alunos');
      const mediaTurma = getHealthScoreV3Metric(snapshot, 'media_turma');
      const retencao = getHealthScoreV3Metric(snapshot, 'retencao');
      const permanencia = getHealthScoreV3Metric(snapshot, 'permanencia');
      const conversao = getHealthScoreV3Metric(snapshot, 'conversao');
      const presenca = getHealthScoreV3Metric(snapshot, 'presenca');
      return [{
        ...p,
        health_score_v3: snapshot,
        carteira_alunos: numeroAlunos?.valor_bruto,
        media_alunos_turma: mediaTurma?.valor_bruto,
        taxa_retencao: retencao?.valor_bruto,
        tempo_medio: permanencia?.valor_bruto,
        taxa_conversao: conversao?.valor_bruto,
        matriculas: conversao?.numerador,
        experimentais: conversao?.denominador,
        media_presenca: presenca?.valor_bruto,
        presenca_publicavel: presenca?.metrica_publicavel === true,
        health_score: snapshot.score,
        health_status: snapshot.classificacao,
        health_score_confiavel: snapshot.snapshot_publicavel,
      }];
    });

    if (professores.length === 0) {
      const relatorio = `━━━━━━━━━━━━━━━━━━━━━━\n🏆 *RANKING DE PROFESSORES*\n🏢 *${unidadeNome.toUpperCase()}*\n📅 *${mesNome.toUpperCase()}/${ano}*\n━━━━━━━━━━━━━━━━━━━━━━\n\n*Ranking indisponível neste momento.*\n\nO Health Score V3 está parcial. Rankings e premiações serão liberados somente após o fechamento oficial do ciclo.`;
      return new Response(JSON.stringify({
        success: true,
        ranking_disponivel: false,
        motivo: 'health_score_v3_sem_ciclo_oficial',
        relatorio,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Calcular médias da unidade
    const totalProfessores = professores.length;
    const professoresHealthPublicavel = professores.filter((p: any) => p.health_score_confiavel);
    const professoresPresencaPublicavel = professores.filter((p: any) => p.presenca_publicavel);
    const mediaHealthScore = professoresHealthPublicavel.length > 0
      ? Math.round(professoresHealthPublicavel.reduce((sum: number, p: any) => sum + p.health_score, 0) / professoresHealthPublicavel.length * 10) / 10
      : null;
    const mediaCarteira = totalProfessores > 0
      ? Math.round(professores.reduce((sum: number, p: any) => sum + (Number(p.carteira_alunos) || 0), 0) / totalProfessores * 10) / 10
      : 0;
    const mediaPresenca = professoresPresencaPublicavel.length > 0
      ? Math.round(professoresPresencaPublicavel.reduce((sum: number, p: any) => sum + Number(p.media_presenca), 0) / professoresPresencaPublicavel.length * 10) / 10
      : null;
    const mediaAlunosTurma = totalProfessores > 0
      ? Math.round(professores.reduce((sum: number, p: any) => sum + (Number(p.media_alunos_turma) || 0), 0) / totalProfessores * 100) / 100
      : 0;

    // Rankings ordenados
    const rankingHealthScore = [...professoresHealthPublicavel].sort((a: any, b: any) => b.health_score - a.health_score);
    const rankingCarteira = [...professores].sort((a: any, b: any) => (b.carteira_alunos || 0) - (a.carteira_alunos || 0));
    const rankingPresenca = [...professoresPresencaPublicavel].sort((a: any, b: any) => b.media_presenca - a.media_presenca);
    const rankingMediaTurma = [...professores].sort((a: any, b: any) => (b.media_alunos_turma || 0) - (a.media_alunos_turma || 0));
    const rankingMatriculas = [...professores].filter((p: any) => (p.matriculas || 0) > 0).sort((a: any, b: any) => (b.matriculas || 0) - (a.matriculas || 0));

    // Dados de fidelização
    const topRetencao = [...professores]
      .filter((p: any) => p.tempo_medio !== null && p.tempo_medio !== undefined)
      .sort((a: any, b: any) => b.tempo_medio - a.tempo_medio)
      .map((p: any) => ({ professor: p.professor_nome, tempo_medio: p.tempo_medio }));

    // Metas
    const metaHealthScore = 75;
    const metaPresenca = 85;
    const metaMediaTurma = 2.0;

    // Construir template do relatório
    let relatorioTemplate = '';

    // CABEÇALHO
    relatorioTemplate += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    relatorioTemplate += `🏆 *RANKING DE PROFESSORES*\n`;
    relatorioTemplate += `🏢 *${unidadeNome.toUpperCase()}*\n`;
    relatorioTemplate += `📅 *${mesNome.toUpperCase()}/${ano}*\n`;
    relatorioTemplate += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    relatorioTemplate += `> [ANALISE_COMPETITIVA_IA]\n\n`;

    // RANKING HEALTH SCORE
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `📊 *RANKING HEALTH SCORE*\n`;
    relatorioTemplate += `───────────────────────\n`;
    
    if (mediaHealthScore !== null) {
      rankingHealthScore.forEach((p: any, i: number) => {
        const emoji = p.health_status === 'saudavel' ? '🟢' : (p.health_status === 'atencao' ? '🟡' : '🔴');
        const pct = Math.round(p.health_score);
        const gap = (p.health_score - metaHealthScore).toFixed(1);
        const gapStr = Number(gap) >= 0 ? `+${gap}` : gap;
        relatorioTemplate += `${i + 1}. ${p.professor_nome} - ${p.health_score.toFixed(1)} pts ${emoji}\n`;
        relatorioTemplate += `   ${criarBarraProgresso(pct)} ${pct}% | Meta: ${metaHealthScore} | Gap: ${gapStr}\n`;
        if (i < rankingHealthScore.length - 1) relatorioTemplate += `\n`;
      });
      relatorioTemplate += `\n📈 Média da Unidade: *${mediaHealthScore}* pts\n`;
      relatorioTemplate += `🎯 Meta: *${metaHealthScore}* pts\n`;
      relatorioTemplate += `📉 Gap Médio: *${(mediaHealthScore - metaHealthScore).toFixed(1)}* pts\n\n`;
    } else {
      relatorioTemplate += `*Em auditoria* — presença sem cobertura suficiente para publicar Health Score.\n\n`;
    }

    // RANKING CARTEIRA DE ALUNOS
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `👥 *RANKING CARTEIRA DE ALUNOS*\n`;
    relatorioTemplate += `───────────────────────\n`;

    const maxCarteira = rankingCarteira[0]?.carteira_alunos || 1;
    rankingCarteira.forEach((p: any, i: number) => {
      const alunos = p.carteira_alunos || 0;
      const pct = Math.round((alunos / maxCarteira) * 100);
      const vsMedia = formatarVariacao(alunos, mediaCarteira);
      relatorioTemplate += `${i + 1}. ${p.professor_nome} - ${alunos} alunos\n`;
      relatorioTemplate += `   ${criarBarraProgresso(pct)} ${pct}% | ${vsMedia} vs média\n`;
      if (i < totalProfessores - 1) relatorioTemplate += `\n`;
    });

    const minCarteira = rankingCarteira[rankingCarteira.length - 1]?.carteira_alunos || 0;
    relatorioTemplate += `\n📊 Média: *${mediaCarteira}* alunos/prof\n`;
    relatorioTemplate += `📈 Melhor: *${maxCarteira}* alunos (+${Math.round(((maxCarteira - mediaCarteira) / mediaCarteira) * 100)}%)\n`;
    relatorioTemplate += `📉 Menor: *${minCarteira}* alunos (${Math.round(((minCarteira - mediaCarteira) / mediaCarteira) * 100)}%)\n`;
    relatorioTemplate += `📏 Amplitude: *${maxCarteira - minCarteira}* alunos\n\n`;

    // RANKING PRESENÇA MÉDIA
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `📈 *RANKING PRESENÇA MÉDIA*\n`;
    relatorioTemplate += `───────────────────────\n`;

    if (mediaPresenca !== null) {
      rankingPresenca.forEach((p: any, i: number) => {
        const presenca = Number(p.media_presenca);
        const pct = Math.round(presenca);
        const vsMedia = formatarVariacao(presenca, mediaPresenca);
        relatorioTemplate += `${i + 1}. ${p.professor_nome} - ${presenca.toFixed(1)}%\n`;
        relatorioTemplate += `   ${criarBarraProgresso(pct)} ${pct}% | ${vsMedia} vs média\n`;
        if (i < rankingPresenca.length - 1) relatorioTemplate += `\n`;
      });
      relatorioTemplate += `\n📊 Média: *${mediaPresenca.toFixed(1)}%*\n`;
      relatorioTemplate += `🎯 Meta: *${metaPresenca}%*\n`;
      relatorioTemplate += `📉 Gap: *${(mediaPresenca - metaPresenca).toFixed(1)}%*\n\n`;
    } else {
      relatorioTemplate += `*Em auditoria* — nenhum professor atingiu cobertura suficiente para ranking de presença.\n\n`;
    }

    // RANKING MÉDIA ALUNOS/TURMA
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `📊 *RANKING MÉDIA ALUNOS/TURMA*\n`;
    relatorioTemplate += `───────────────────────\n`;

    const maxMediaTurma = rankingMediaTurma[0]?.media_alunos_turma || 1;
    rankingMediaTurma.forEach((p: any, i: number) => {
      const media = Number(p.media_alunos_turma) || 0;
      const pct = Math.round((media / metaMediaTurma) * 100);
      const vsMedia = formatarVariacao(media, mediaAlunosTurma);
      relatorioTemplate += `${i + 1}. ${p.professor_nome} - ${media.toFixed(2)} al/turma\n`;
      relatorioTemplate += `   ${criarBarraProgresso(pct)} ${pct}% da meta | ${vsMedia} vs média\n`;
      if (i < totalProfessores - 1) relatorioTemplate += `\n`;
    });

    relatorioTemplate += `\n📊 Média: *${mediaAlunosTurma.toFixed(2)}* al/turma\n`;
    relatorioTemplate += `🎯 Meta: *${metaMediaTurma}* al/turma\n`;
    relatorioTemplate += `📉 Gap: *${(mediaAlunosTurma - metaMediaTurma).toFixed(2)}* al/turma\n\n`;

    // RANKING MATRICULADORES
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `🎯 *RANKING MATRICULADORES*\n`;
    relatorioTemplate += `───────────────────────\n`;

    if (rankingMatriculas.length > 0) {
      rankingMatriculas.forEach((p: any, i: number) => {
        const matriculas = p.matriculas || 0;
        relatorioTemplate += `${i + 1}. ${p.professor_nome} - ${matriculas} matrícula${matriculas > 1 ? 's' : ''}\n`;
      });
      const semMatriculasR = totalProfessores - rankingMatriculas.length;
      if (semMatriculasR > 0) {
        relatorioTemplate += `\n🚨 *${semMatriculasR} professores* sem matrículas no mês\n`;
      }
    } else {
      relatorioTemplate += `🚨 Nenhum professor realizou matrículas no mês\n`;
    }
    relatorioTemplate += `\n`;

    // RANKING FIDELIZAÇÃO
    if (topRetencao.length > 0) {
      relatorioTemplate += `───────────────────────\n`;
      relatorioTemplate += `🎖️ *RANKING FIDELIZAÇÃO*\n`;
      relatorioTemplate += `_(Tempo médio de permanência dos alunos)_\n`;
      relatorioTemplate += `───────────────────────\n`;

      const mediaFidelizacao = topRetencao.reduce((sum: number, p: any) => sum + Number(p.tempo_medio), 0) / topRetencao.length;
      const maxFidelizacao = topRetencao[0]?.tempo_medio || 1;

      topRetencao.forEach((p: any, i: number) => {
        const tempo = Number(p.tempo_medio) || 0;
        const pct = Math.round((tempo / maxFidelizacao) * 100);
        const vsMedia = formatarVariacao(tempo, mediaFidelizacao);
        relatorioTemplate += `${i + 1}. ${p.professor} - ${tempo.toFixed(1)} meses\n`;
        relatorioTemplate += `   ${criarBarraProgresso(pct)} ${pct}% | ${vsMedia} vs média\n`;
        if (i < topRetencao.length - 1) relatorioTemplate += `\n`;
      });

      relatorioTemplate += `\n📊 Média: *${mediaFidelizacao.toFixed(1)}* meses\n\n`;
    }

    // ANÁLISE DE GAPS
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `🎯 *ANÁLISE DE GAPS (IA)*\n`;
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `> [ANALISE_GAPS_IA]\n\n`;

    // OPORTUNIDADES DE CRESCIMENTO
    const abaixoMediaHS = mediaHealthScore === null
      ? 0
      : professoresHealthPublicavel.filter((p: any) => p.health_score < mediaHealthScore).length;
    const semMatriculas = professores.filter((p: any) => (p.matriculas || 0) === 0).length;
    const presencaBaixa = professoresPresencaPublicavel.filter((p: any) => p.media_presenca < 70).length;

    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `🚀 *OPORTUNIDADES DE CRESCIMENTO*\n`;
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += mediaHealthScore !== null
      ? `• *${abaixoMediaHS}* professores abaixo da média em Health Score\n`
      : `• Health Score: *Em auditoria*\n`;
    relatorioTemplate += `• *${semMatriculas}* professores sem matrículas no mês\n`;
    relatorioTemplate += mediaPresenca !== null
      ? `• *${presencaBaixa}* professores com presença < 70%\n\n`
      : `• Presença: *Em auditoria*\n\n`;

    // RECOMENDAÇÕES ESTRATÉGICAS
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `💡 *RECOMENDAÇÕES ESTRATÉGICAS (IA)*\n`;
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `> [RECOMENDACOES_IA]\n\n`;

    // RODAPÉ
    relatorioTemplate += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    relatorioTemplate += `📅 Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}\n`;
    relatorioTemplate += `━━━━━━━━━━━━━━━━━━━━━━\n`;

    // Preparar dados para a IA
    const top3HS = rankingHealthScore.slice(0, 3).map((p: any) => ({ nome: p.professor_nome, score: p.health_score }));
    const bottom3HS = rankingHealthScore.slice(-3).map((p: any) => ({ nome: p.professor_nome, score: p.health_score }));
    const top3Carteira = rankingCarteira.slice(0, 3).map((p: any) => ({ nome: p.professor_nome, alunos: p.carteira_alunos }));
    const top3Presenca = rankingPresenca.slice(0, 3).map((p: any) => ({ nome: p.professor_nome, presenca: p.media_presenca }));
    const bottom3Presenca = rankingPresenca.slice(-3).map((p: any) => ({ nome: p.professor_nome, presenca: p.media_presenca }));
    const blocoHealthIA = mediaHealthScore === null
      ? 'EM AUDITORIA — não classificar nem recomendar por Health Score.'
      : `Média da unidade: ${mediaHealthScore} pts (meta: ${metaHealthScore})\nTop 3: ${top3HS.map(p => `${p.nome} (${p.score})`).join(', ')}\nBottom 3: ${bottom3HS.map(p => `${p.nome} (${p.score})`).join(', ')}\n${abaixoMediaHS} professores abaixo da média`;
    const blocoPresencaIA = mediaPresenca === null
      ? 'EM AUDITORIA — não classificar nem recomendar por presença.'
      : `Média: ${mediaPresenca.toFixed(1)}% (meta: ${metaPresenca}%)\nTop 3: ${top3Presenca.map(p => `${p.nome} (${p.presenca?.toFixed(1)}%)`).join(', ')}\nBottom 3: ${bottom3Presenca.map(p => `${p.nome} (${p.presenca?.toFixed(1)}%)`).join(', ')}\n${presencaBaixa} professores com presença < 70%`;

    // Prompt para a IA
    const promptIA = `Você é um analista de performance pedagógica da LA Music School.
Analise os rankings de professores e gere insights estratégicos.

DADOS DO RANKING - ${unidadeNome} - ${mesNome}/${ano}:

HEALTH SCORE:
${blocoHealthIA}

CARTEIRA:
- Média: ${mediaCarteira} alunos/prof
- Top 3: ${top3Carteira.map(p => `${p.nome} (${p.alunos})`).join(', ')}
- Amplitude: ${maxCarteira - minCarteira} alunos

PRESENÇA:
${blocoPresencaIA}

MATRÍCULAS:
- ${semMatriculas} de ${totalProfessores} professores sem matrículas no mês

Gere um JSON com:
{
  "analise_competitiva": "Análise geral do ranking em 2-3 frases, destacando padrões e destaques",
  "analise_gaps": [
    {"professor": "Nome", "gap": "Descrição do gap principal", "oportunidade": "Como melhorar"},
    // 3-4 professores com gaps mais relevantes
  ],
  "recomendacoes": [
    "Recomendação estratégica 1",
    "Recomendação estratégica 2",
    "Recomendação estratégica 3"
  ]
}

IMPORTANTE: Seja direto, use nomes dos professores e foque em ações práticas.
Se presenca_publicavel=false, não use presença. Se health_score_confiavel=false, não use Health Score.
Nunca converta presença ou Health Score nulos em zero.`;

    // Chamar API da OpenAI
    const response = await fetchOpenAIComRetry(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [{ role: 'user', content: promptIA }],
          temperature: 0.7,
          max_completion_tokens: 2048,
          response_format: { type: 'json_object' },
        })
      }
    );

    if (!response.ok) {
      const detalheErro = await response.text();
      console.error(`[ranking-professores] OpenAI retornou ${response.status}:`, detalheErro);
      throw new Error(`API OpenAI retornou ${response.status}: ${detalheErro}`);
    }

    const aiResponse = await response.json();
    const textoIA = aiResponse.choices?.[0]?.message?.content || '';

    // Extrair JSON da resposta
    let insightsIA = {
      analise_competitiva: 'Análise não disponível',
      analise_gaps: [] as any[],
      recomendacoes: [] as string[]
    };

    try {
      const jsonMatch = textoIA.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        insightsIA = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Erro ao parsear JSON da IA:', e);
    }

    // Substituir placeholders no template
    let relatorioFinal = relatorioTemplate;

    // Análise competitiva
    relatorioFinal = relatorioFinal.replace(
      '> [ANALISE_COMPETITIVA_IA]',
      `> ${insightsIA.analise_competitiva}`
    );

    // Análise de gaps
    let gapsTexto = '';
    if (insightsIA.analise_gaps && insightsIA.analise_gaps.length > 0) {
      insightsIA.analise_gaps.forEach((gap: any) => {
        gapsTexto += `• *${gap.professor}*: ${gap.gap}\n`;
        gapsTexto += `  → ${gap.oportunidade}\n\n`;
      });
    } else {
      gapsTexto = '• Análise de gaps não disponível\n';
    }
    relatorioFinal = relatorioFinal.replace('> [ANALISE_GAPS_IA]', gapsTexto.trim());

    // Recomendações
    let recomendacoesTexto = '';
    if (insightsIA.recomendacoes && insightsIA.recomendacoes.length > 0) {
      insightsIA.recomendacoes.forEach((rec: string) => {
        recomendacoesTexto += `• ${rec}\n`;
      });
    } else {
      recomendacoesTexto = '• Recomendações não disponíveis\n';
    }
    relatorioFinal = relatorioFinal.replace('> [RECOMENDACOES_IA]', recomendacoesTexto.trim());

    return new Response(
      JSON.stringify({
        success: true,
        relatorio: relatorioFinal
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Erro:', error);
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    const origem = msg.includes('API OpenAI') ? 'api_openai'
      : msg.includes('OPENAI_API_KEY') ? 'config'
      : 'interno';
    return new Response(
      JSON.stringify({
        success: false,
        error: msg,
        origem,
        funcao: 'gemini-ranking-professores'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
