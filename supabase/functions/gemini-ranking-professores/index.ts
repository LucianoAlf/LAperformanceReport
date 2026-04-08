import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Constantes para cálculo do Health Score (idênticas ao frontend)
const DEFAULT_HEALTH_WEIGHTS = {
  curso: 0.10,
  mediaTurma: 0.20,
  retencao: 0.20,
  conversao: 0.15,
  nps: 0.15,
  presenca: 0.10,
  evasoes: 0.10
};

const METAS_REFERENCIA = {
  mediaTurma: { min: 1.0, ideal: 2.0 },
  retencao: { min: 60, ideal: 100 },
  conversao: { min: 50, ideal: 100 },
  nps: { min: 5, ideal: 10 },
  presenca: { min: 60, ideal: 100 },
  evasoes: { min: 0, max: 5 }
};

const CURSO_LIMITES_TURMA: Record<string, { ideal: number; max: number }> = {
  'Bateria': { ideal: 1.0, max: 1.5 },
  'Canto': { ideal: 3.0, max: 5.0 },
  'Musicalização': { ideal: 6.0, max: 10.0 },
  'Musicalização Infantil': { ideal: 6.0, max: 10.0 },
  'default': { ideal: 1.5, max: 2.0 }
};

function normalizar(valor: number, min: number, max: number, inverso: boolean = false): number {
  if (max === min) return inverso ? 100 : 0;
  const normalizado = Math.max(0, Math.min(100, ((valor - min) / (max - min)) * 100));
  return inverso ? 100 - normalizado : normalizado;
}

function calcularFatorCurso(mediaTurma: number, cursos: string[]): number {
  if (!cursos || cursos.length === 0) {
    const limite = CURSO_LIMITES_TURMA['default'];
    return normalizar(mediaTurma, 1, limite.max);
  }
  
  let somaIdeal = 0;
  let somaMax = 0;
  
  cursos.forEach(curso => {
    const limite = CURSO_LIMITES_TURMA[curso] || CURSO_LIMITES_TURMA['default'];
    somaIdeal += limite.ideal;
    somaMax += limite.max;
  });
  
  const idealMedio = somaIdeal / cursos.length;
  const maxMedio = somaMax / cursos.length;
  
  if (mediaTurma >= idealMedio) {
    return 100;
  }
  
  return normalizar(mediaTurma, 1, maxMedio);
}

interface ProfessorKPIs {
  mediaTurma: number;
  retencao: number;
  conversao: number;
  nps: number | null;
  presenca: number;
  evasoes: number;
  cursos: string[];
}

function calcularHealthScore(kpis: ProfessorKPIs): { score: number; status: 'critico' | 'atencao' | 'saudavel' } {
  const weights = DEFAULT_HEALTH_WEIGHTS;
  
  const fatorCurso = calcularFatorCurso(kpis.mediaTurma, kpis.cursos);
  const mediaTurmaNorm = normalizar(kpis.mediaTurma, METAS_REFERENCIA.mediaTurma.min, METAS_REFERENCIA.mediaTurma.ideal);
  const retencaoNorm = normalizar(kpis.retencao, METAS_REFERENCIA.retencao.min, METAS_REFERENCIA.retencao.ideal);
  const conversaoNorm = normalizar(kpis.conversao, METAS_REFERENCIA.conversao.min, METAS_REFERENCIA.conversao.ideal);
  const npsNorm = kpis.nps !== null && kpis.nps > 0 
    ? normalizar(kpis.nps, METAS_REFERENCIA.nps.min, METAS_REFERENCIA.nps.ideal)
    : 50;
  const presencaNorm = normalizar(kpis.presenca, METAS_REFERENCIA.presenca.min, METAS_REFERENCIA.presenca.ideal);
  const evasoesNorm = normalizar(kpis.evasoes, METAS_REFERENCIA.evasoes.min, METAS_REFERENCIA.evasoes.max, true);

  const score = 
    fatorCurso * weights.curso +
    mediaTurmaNorm * weights.mediaTurma +
    retencaoNorm * weights.retencao +
    conversaoNorm * weights.conversao +
    npsNorm * weights.nps +
    presencaNorm * weights.presenca +
    evasoesNorm * weights.evasoes;

  const finalScore = Math.round(score * 10) / 10;
  
  let status: 'critico' | 'atencao' | 'saudavel';
  if (finalScore < 50) status = 'critico';
  else if (finalScore < 75) status = 'atencao';
  else status = 'saudavel';

  return { score: finalScore, status };
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY não configurada');
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

    // KPIs de professores - calcular Health Score para cada um
    const kpisProfessoresRaw = dados.kpis_professores || [];
    const professores = kpisProfessoresRaw.map((p: any) => {
      const healthResult = calcularHealthScore({
        mediaTurma: Number(p.media_alunos_turma) || 0,
        retencao: 100 - (Number(p.taxa_cancelamento) || 0),
        conversao: Number(p.taxa_conversao) || 0,
        nps: p.nps_medio && Number(p.nps_medio) > 0 ? Number(p.nps_medio) : null,
        presenca: Number(p.media_presenca) || 0,
        evasoes: Number(p.evasoes) || 0,
        cursos: p.cursos || []
      });
      return {
        ...p,
        health_score: healthResult.score,
        health_status: healthResult.status
      };
    });

    // Calcular médias da unidade
    const totalProfessores = professores.length;
    const mediaHealthScore = totalProfessores > 0
      ? Math.round(professores.reduce((sum: number, p: any) => sum + p.health_score, 0) / totalProfessores * 10) / 10
      : 0;
    const mediaCarteira = totalProfessores > 0
      ? Math.round(professores.reduce((sum: number, p: any) => sum + (Number(p.carteira_alunos) || 0), 0) / totalProfessores * 10) / 10
      : 0;
    const mediaPresenca = totalProfessores > 0
      ? Math.round(professores.reduce((sum: number, p: any) => sum + (Number(p.media_presenca) || 0), 0) / totalProfessores * 10) / 10
      : 0;
    const mediaAlunosTurma = totalProfessores > 0
      ? Math.round(professores.reduce((sum: number, p: any) => sum + (Number(p.media_alunos_turma) || 0), 0) / totalProfessores * 100) / 100
      : 0;

    // Rankings ordenados
    const rankingHealthScore = [...professores].sort((a: any, b: any) => b.health_score - a.health_score);
    const rankingCarteira = [...professores].sort((a: any, b: any) => (b.carteira_alunos || 0) - (a.carteira_alunos || 0));
    const rankingPresenca = [...professores].sort((a: any, b: any) => (b.media_presenca || 0) - (a.media_presenca || 0));
    const rankingMediaTurma = [...professores].sort((a: any, b: any) => (b.media_alunos_turma || 0) - (a.media_alunos_turma || 0));
    const rankingMatriculas = [...professores].filter((p: any) => (p.matriculas || 0) > 0).sort((a: any, b: any) => (b.matriculas || 0) - (a.matriculas || 0));

    // Dados de fidelização
    const topRetencao = dados.top_retencao || [];

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
    
    rankingHealthScore.forEach((p: any, i: number) => {
      const emoji = p.health_status === 'saudavel' ? '🟢' : (p.health_status === 'atencao' ? '🟡' : '🔴');
      const pct = Math.round(p.health_score);
      const gap = (p.health_score - metaHealthScore).toFixed(1);
      const gapStr = Number(gap) >= 0 ? `+${gap}` : gap;
      relatorioTemplate += `${i + 1}. ${p.professor_nome} - ${p.health_score.toFixed(1)} pts ${emoji}\n`;
      relatorioTemplate += `   ${criarBarraProgresso(pct)} ${pct}% | Meta: ${metaHealthScore} | Gap: ${gapStr}\n`;
      if (i < totalProfessores - 1) relatorioTemplate += `\n`;
    });

    relatorioTemplate += `\n📈 Média da Unidade: *${mediaHealthScore}* pts\n`;
    relatorioTemplate += `🎯 Meta: *${metaHealthScore}* pts\n`;
    relatorioTemplate += `📉 Gap Médio: *${(mediaHealthScore - metaHealthScore).toFixed(1)}* pts\n\n`;

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

    rankingPresenca.forEach((p: any, i: number) => {
      const presenca = Number(p.media_presenca) || 0;
      const pct = Math.round(presenca);
      const vsMedia = formatarVariacao(presenca, mediaPresenca);
      relatorioTemplate += `${i + 1}. ${p.professor_nome} - ${presenca.toFixed(1)}%\n`;
      relatorioTemplate += `   ${criarBarraProgresso(pct)} ${pct}% | ${vsMedia} vs média\n`;
      if (i < totalProfessores - 1) relatorioTemplate += `\n`;
    });

    const maxPresenca = rankingPresenca[0]?.media_presenca || 0;
    const minPresenca = rankingPresenca[rankingPresenca.length - 1]?.media_presenca || 0;
    relatorioTemplate += `\n📊 Média: *${mediaPresenca.toFixed(1)}%*\n`;
    relatorioTemplate += `🎯 Meta: *${metaPresenca}%*\n`;
    relatorioTemplate += `📉 Gap: *${(mediaPresenca - metaPresenca).toFixed(1)}%*\n\n`;

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
      const semMatriculas = totalProfessores - rankingMatriculas.length;
      if (semMatriculas > 0) {
        relatorioTemplate += `\n🚨 *${semMatriculas} professores* sem matrículas no mês\n`;
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
    const abaixoMediaHS = professores.filter((p: any) => p.health_score < mediaHealthScore).length;
    const semMatriculas = professores.filter((p: any) => (p.matriculas || 0) === 0).length;
    const presencaBaixa = professores.filter((p: any) => (p.media_presenca || 0) < 70).length;

    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `🚀 *OPORTUNIDADES DE CRESCIMENTO*\n`;
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `• *${abaixoMediaHS}* professores abaixo da média em Health Score\n`;
    relatorioTemplate += `• *${semMatriculas}* professores sem matrículas no mês\n`;
    relatorioTemplate += `• *${presencaBaixa}* professores com presença < 70%\n\n`;

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

    // Prompt para a IA
    const promptIA = `Você é um analista de performance pedagógica da LA Music School.
Analise os rankings de professores e gere insights estratégicos.

DADOS DO RANKING - ${unidadeNome} - ${mesNome}/${ano}:

HEALTH SCORE:
- Média da unidade: ${mediaHealthScore} pts (meta: ${metaHealthScore})
- Top 3: ${top3HS.map(p => `${p.nome} (${p.score})`).join(', ')}
- Bottom 3: ${bottom3HS.map(p => `${p.nome} (${p.score})`).join(', ')}
- ${abaixoMediaHS} professores abaixo da média

CARTEIRA:
- Média: ${mediaCarteira} alunos/prof
- Top 3: ${top3Carteira.map(p => `${p.nome} (${p.alunos})`).join(', ')}
- Amplitude: ${maxCarteira - minCarteira} alunos

PRESENÇA:
- Média: ${mediaPresenca.toFixed(1)}% (meta: ${metaPresenca}%)
- Top 3: ${top3Presenca.map(p => `${p.nome} (${p.presenca?.toFixed(1)}%)`).join(', ')}
- Bottom 3: ${bottom3Presenca.map(p => `${p.nome} (${p.presenca?.toFixed(1)}%)`).join(', ')}
- ${presencaBaixa} professores com presença < 70%

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

IMPORTANTE: Seja direto, use nomes dos professores, foque em ações práticas.`;

    // Chamar API do Gemini
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptIA }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Erro na API Gemini: ${response.status}`);
    }

    const geminiResponse = await response.json();
    const textoIA = geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text || '';

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
