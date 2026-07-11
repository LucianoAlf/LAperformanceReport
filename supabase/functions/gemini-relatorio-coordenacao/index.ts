import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Retry com backoff exponencial para erros 429 da OpenAI
async function fetchOpenAIComRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);
    if (res.ok) return res;
    if (res.status === 429 && attempt < maxRetries) {
      const wait = 1000 * Math.pow(2, attempt);
      console.log(`[openai-retry] status ${res.status}, tentativa ${attempt + 1}/${maxRetries + 1}, esperando ${wait}ms`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    return res;
  }
  return new Response(null, { status: 500 });
}


interface RelatorioCoordenacaoRequest {
  dados: any;
  tipo: 'mensal' | 'ranking' | 'individual';
  professor_id?: number;
}

// ═══════════════════════════════════════════════════════════════
// CÁLCULO DO HEALTH SCORE - IDÊNTICO AO FRONTEND (useHealthScore.ts)
// ═══════════════════════════════════════════════════════════════

// Pesos padrão (fallback se não houver config no banco)
const DEFAULT_HEALTH_WEIGHTS = {
  taxaCrescimento: 0,
  mediaTurma: 20,
  retencao: 25,
  conversao: 20,
  presenca: 25,
  evasoes: 10,
};

type HealthWeights = typeof DEFAULT_HEALTH_WEIGHTS;

// Busca pesos configurados no banco para a unidade
async function buscarPesos(unidadeId: string | null): Promise<HealthWeights> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const client = createClient(supabaseUrl, supabaseKey);

    let query = client.from('config_health_score_professor').select('*');
    if (unidadeId) {
      query = query.or(`unidade_id.eq.${unidadeId},unidade_id.is.null`);
    } else {
      query = query.is('unidade_id', null);
    }

    const { data } = await query
      .order('unidade_id', { nullsFirst: false })
      .limit(1);

    if (data && data.length > 0) {
      const row = data[0];
      return {
        taxaCrescimento: row.peso_taxa_crescimento,
        mediaTurma: row.peso_media_turma,
        retencao: row.peso_retencao,
        conversao: row.peso_conversao,
        presenca: row.peso_presenca,
        evasoes: row.peso_evasoes,
      };
    }
  } catch (e) {
    console.error('[relatorio-coordenacao] Erro ao buscar pesos do banco:', e);
  }
  return DEFAULT_HEALTH_WEIGHTS;
}

// Cálculo idêntico ao useHealthScore.ts (V2)
function calcularHealthScore(
  kpis: { taxaCrescimento: number; mediaTurma: number; retencao: number; conversao: number; presenca: number; evasoes: number; carteira: number; },
  weights: HealthWeights
): { score: number; status: 'critico' | 'atencao' | 'saudavel' } {
  // 1. Taxa de Crescimento: ((taxa + 10) / 30) * 100
  const scoreCrescimento = Math.max(0, Math.min(100, ((kpis.taxaCrescimento + 10) / 30) * 100));
  const contribTaxaCres = scoreCrescimento * (weights.taxaCrescimento / 100);

  // 2. Média/Turma: (media / 2.0) * 100, max 100
  const scoreMT = Math.min(100, (kpis.mediaTurma / 2.0) * 100);
  const contribMT = scoreMT * (weights.mediaTurma / 100);

  // 3. Retenção: valor direto (0-100)
  const scoreRet = kpis.retencao;
  const contribRet = scoreRet * (weights.retencao / 100);

  // 4. Conversão: valor direto, max 100
  const scoreConv = Math.min(100, kpis.conversao);
  const contribConv = scoreConv * (weights.conversao / 100);

  // 5. Presença: valor direto (0-100)
  const scorePres = kpis.presenca;
  const contribPres = scorePres * (weights.presenca / 100);

  // 6. Evasões (inverso): taxa % = (evasoes / carteira) * 100, score = 100 - (taxa * 10)
  const taxaEvasao = kpis.carteira > 0 ? (kpis.evasoes / kpis.carteira) * 100 : 0;
  const scoreEvasoes = Math.max(0, 100 - (taxaEvasao * 10));
  const contribEvasoes = scoreEvasoes * (weights.evasoes / 100);
  
  // Calcular score total
  const score = contribTaxaCres + contribMT + contribRet + contribConv + contribPres + contribEvasoes;
  
  // Determinar status V2
  let status: 'critico' | 'atencao' | 'saudavel' = 'saudavel';
  if (score < 50) {
    status = 'critico';
  } else if (score < 70) {
    status = 'atencao';
  }
  
  return {
    score: Math.round(score * 10) / 10,
    status
  };
}

// ═══════════════════════════════════════════════════════════════
// FUNÇÕES AUXILIARES
// ═══════════════════════════════════════════════════════════════

// Função para criar barra de progresso visual
function criarBarraProgresso(percentual: number, tamanho: number = 10): string {
  const pct = Math.min(Math.max(percentual, 0), 100);
  const preenchido = Math.round((pct / 100) * tamanho);
  const vazio = tamanho - preenchido;
  return '▓'.repeat(preenchido) + '░'.repeat(vazio);
}

// Função para formatar número em moeda BR
function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY não configurada');
    }

    const payload: RelatorioCoordenacaoRequest = await req.json();
    const { dados, tipo = 'mensal' } = payload;

    // ═══════════════════════════════════════════════════════════════
    // EXTRAIR DADOS DO PAYLOAD
    // ═══════════════════════════════════════════════════════════════

    const periodo = dados.periodo || {};
    const unidadeNome = periodo.unidade_nome || 'Consolidado';
    const unidadeId: string | null = periodo.unidade_id || null;
    const ano = periodo.ano || new Date().getFullYear();
    const mesAtual = periodo.mes || new Date().getMonth() + 1;
    const coordenadores = periodo.coordenadores || ['Quintela', 'Juliana'];

    // Meses por extenso
    const mesesPorExtenso: Record<number, string> = {
      1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril',
      5: 'Maio', 6: 'Junho', 7: 'Julho', 8: 'Agosto',
      9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro'
    };
    const mesNome = mesesPorExtenso[mesAtual] || '';

    // Totais consolidados
    const totais = dados.totais || {};
    const totalProfessores = totais.total_professores || 0;
    const totalAlunos = totais.total_alunos || 0;
    const mediaAlunosProfessor = totais.media_alunos_professor || 0;
    const mediaAlunosTurma = totais.media_alunos_turma || 0;
    const mediaPresenca = totais.media_presenca || 0;
    const taxaConversaoMedia = totais.taxa_conversao_media || 0;
    const taxaRenovacaoMedia = totais.taxa_renovacao_media || 0;
    const totalEvasoes = totais.total_evasoes || 0;
    const totalMatriculas = totais.total_matriculas || 0;
    const mrrTotal = totais.mrr_total || 0;

    // Buscar pesos configurados no banco para esta unidade
    const weights = await buscarPesos(unidadeId);

    // KPIs de professores - calcular Health Score com pesos do banco
    const kpisProfessoresRaw = dados.kpis_professores || [];
    const kpisProfessores = kpisProfessoresRaw.map((p: any) => {
      const numeroOu = (valor: unknown, fallback = 0) => {
        if (valor === null || valor === undefined || valor === '') return fallback;
        const numero = Number(valor);
        return Number.isFinite(numero) ? numero : fallback;
      };
      const healthResult = calcularHealthScore({
        taxaCrescimento: numeroOu(p.taxa_crescimento),
        mediaTurma: numeroOu(p.media_alunos_turma),
        retencao: numeroOu(p.taxa_retencao, 100),
        conversao: numeroOu(p.taxa_conversao),
        presenca: numeroOu(p.media_presenca),
        evasoes: numeroOu(p.evasoes),
        carteira: numeroOu(p.carteira_alunos),
      }, weights);
      const healthScoreInformado = Number(p.health_score);
      const healthStatusInformado = p.health_status;
      const usaHealthCanonico = Number.isFinite(healthScoreInformado)
        && ['critico', 'atencao', 'saudavel'].includes(healthStatusInformado);
      return {
        ...p,
        health_score: usaHealthCanonico ? healthScoreInformado : healthResult.score,
        health_status: usaHealthCanonico ? healthStatusInformado : healthResult.status
      };
    });

    // Calcular Health Score médio
    const healthScoreMedio = kpisProfessores.length > 0
      ? Math.round(kpisProfessores.reduce((sum: number, p: any) => sum + p.health_score, 0) / kpisProfessores.length * 10) / 10
      : 0;

    // Contar professores por status baseado no Health Score calculado
    const professorCriticosHS = kpisProfessores.filter((p: any) => p.health_status === 'critico');
    const professorAtencaoHS = kpisProfessores.filter((p: any) => p.health_status === 'atencao');
    const professorSaudaveisHS = kpisProfessores.filter((p: any) => p.health_status === 'saudavel');

    // Top Health Score
    const topHealthScore = [...kpisProfessores]
      .sort((a: any, b: any) => b.health_score - a.health_score)
      .slice(0, 3);
    
    // Rankings
    const topCarteira = dados.top_carteira || [];
    const topMediaTurma = dados.top_media_turma || [];
    const topPresenca = dados.top_presenca || [];
    const topMatriculadores = dados.top_matriculadores || [];
    const topRetencao = dados.top_retencao || [];

    // Professores com presença baixa. Esta lista não é a mesma classificação do Health Score.
    const professoresAlerta = dados.professores_alerta || [];
    const professorCriticos = professoresAlerta.filter((p: any) => p.status === 'critico');
    const professorAtencao = professoresAlerta.filter((p: any) => p.status === 'atencao');

    // Agenda
    const agenda = dados.agenda || {};
    const treinamentosAgendados = agenda.treinamentos_agendados || 0;
    const reunioesAgendadas = agenda.reunioes_agendadas || 0;
    const checkpointsAgendados = agenda.checkpoints_agendados || 0;
    const concluidos = agenda.concluidos || 0;
    const atrasados = agenda.atrasados || 0;

    // Catálogo de treinamentos
    const catalogoTreinamentos = dados.catalogo_treinamentos || [];

    // Metas de professores
    const metasProfessores = dados.metas_professores || {};
    const temMetas = Object.keys(metasProfessores).length > 0;

    // Comparativos
    const mesAnterior = dados.mes_anterior || {};
    const anoAnterior = dados.ano_anterior || {};

    // ═══════════════════════════════════════════════════════════════
    // CONSTRUIR TEMPLATE DO RELATÓRIO
    // ═══════════════════════════════════════════════════════════════

    let relatorioTemplate = '';

    // CABEÇALHO
    relatorioTemplate += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    relatorioTemplate += `📊 *RELATÓRIO COORDENAÇÃO PEDAGÓGICA*\n`;
    relatorioTemplate += `🏢 *${unidadeNome.toUpperCase()}*\n`;
    relatorioTemplate += `📅 *${mesNome.toUpperCase()}/${ano}*\n`;
    relatorioTemplate += `👥 Coordenadores: ${coordenadores.join(' e ')}\n`;
    relatorioTemplate += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    relatorioTemplate += `> [RESUMO_EXECUTIVO_IA]\n\n`;

    // VISÃO GERAL DA EQUIPE (usando Health Score calculado)
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `👨‍🏫 *VISÃO GERAL DA EQUIPE*\n`;
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `• Total de Professores: *${totalProfessores}*\n`;
    relatorioTemplate += `• Professores Críticos: *${professorCriticosHS.length}* 🔴\n`;
    relatorioTemplate += `• Professores Atenção: *${professorAtencaoHS.length}* 🟡\n`;
    relatorioTemplate += `• Professores Saudáveis: *${professorSaudaveisHS.length}* 🟢\n`;
    relatorioTemplate += `• Health Score Médio: *${healthScoreMedio}*\n\n`;

    // KPIs CONSOLIDADOS
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `📈 *KPIs CONSOLIDADOS*\n`;
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `• Total de Alunos: *${totalAlunos}*\n`;
    relatorioTemplate += `• Média Alunos/Professor: *${mediaAlunosProfessor.toFixed(1)}*\n`;
    relatorioTemplate += `• Média Alunos/Turma: *${mediaAlunosTurma ? mediaAlunosTurma.toFixed(2) : 'N/D'}*\n`;
    relatorioTemplate += `• Presença Média: *${mediaPresenca.toFixed(1)}%*\n`;
    relatorioTemplate += `• MRR Total: *R$ ${formatarMoeda(mrrTotal)}*\n\n`;

    // RETENÇÃO & DIAGNOSTICO COMERCIAL
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `🔄 *RETENÇÃO & DIAGNÓSTICO COMERCIAL*\n`;
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `• Taxa Renovação Média: *${taxaRenovacaoMedia.toFixed(1)}%*\n`;
    relatorioTemplate += `• Conversao Exp->Mat media: *${taxaConversaoMedia.toFixed(1)}%*\n`;
    relatorioTemplate += `• Evasões no Mês: *${totalEvasoes}*\n`;
    relatorioTemplate += `• Matrículas no Mês: *${totalMatriculas}*\n`;
    relatorioTemplate += `• Saldo Líquido: *${totalMatriculas - totalEvasoes >= 0 ? '+' : ''}${totalMatriculas - totalEvasoes}*\n\n`;

    // RANKINGS
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `🏆 *RANKINGS DE PROFESSORES*\n`;
    relatorioTemplate += `───────────────────────\n\n`;

    // Top Health Score (calculado)
    if (topHealthScore.length > 0) {
      relatorioTemplate += `🎖️ *TOP 3 HEALTH SCORE*\n`;
      topHealthScore.forEach((p: any, i: number) => {
        const emoji = p.health_status === 'saudavel' ? '🟢' : (p.health_status === 'atencao' ? '🟡' : '🔴');
        relatorioTemplate += `  ${i + 1}. ${p.professor_nome} - ${p.health_score} pontos ${emoji}\n`;
      });
      relatorioTemplate += `\n`;
    }

    // Top Carteira
    if (topCarteira.length > 0) {
      relatorioTemplate += `📊 *TOP 3 MAIOR CARTEIRA*\n`;
      topCarteira.slice(0, 3).forEach((p: any, i: number) => {
        relatorioTemplate += `  ${i + 1}. ${p.professor} - ${p.alunos} alunos\n`;
      });
      relatorioTemplate += `\n`;
    }

    // Top Média/Turma
    if (topMediaTurma.length > 0) {
      relatorioTemplate += `👥 *TOP 3 MÉDIA ALUNOS/TURMA*\n`;
      topMediaTurma.slice(0, 3).forEach((p: any, i: number) => {
        relatorioTemplate += `  ${i + 1}. ${p.professor} - ${p.media} alunos/turma\n`;
      });
      relatorioTemplate += `\n`;
    }

    // Top Fidelização (Tempo médio de permanência dos ALUNOS do professor)
    if (topRetencao.length > 0) {
      relatorioTemplate += `🎯 *TOP 3 FIDELIZAÇÃO (Tempo Médio Alunos)*\n`;
      topRetencao.slice(0, 3).forEach((p: any, i: number) => {
        relatorioTemplate += `  ${i + 1}. ${p.professor} - ${p.tempo_medio} meses\n`;
      });
      relatorioTemplate += `\n`;
    }

    // Top Presença
    if (topPresenca.length > 0) {
      relatorioTemplate += `📊 *TOP 3 PRESENÇA MÉDIA*\n`;
      topPresenca.slice(0, 3).forEach((p: any, i: number) => {
        relatorioTemplate += `  ${i + 1}. ${p.professor} - ${p.presenca}%\n`;
      });
      relatorioTemplate += `\n`;
    }

    // Top Matriculadores
    if (topMatriculadores.length > 0) {
      relatorioTemplate += `🎓 *TOP 3 MATRICULADORES*\n`;
      topMatriculadores.slice(0, 3).forEach((p: any, i: number) => {
        relatorioTemplate += `  ${i + 1}. ${p.professor} - ${p.matriculas} matrícula${p.matriculas > 1 ? 's' : ''}\n`;
      });
      relatorioTemplate += `\n`;
    }

    // PROFESSORES COM PRESENÇA BAIXA
    if (professoresAlerta.length > 0) {
      relatorioTemplate += `───────────────────────\n`;
      relatorioTemplate += `⚠️ *ALERTAS DE PRESENÇA E EVASÃO*\n`;
      relatorioTemplate += `───────────────────────\n\n`;

      if (professorCriticos.length > 0) {
        relatorioTemplate += `🔴 *PRESENÇA/EVASÃO CRÍTICA (${professorCriticos.length})*\n`;
        professorCriticos.slice(0, 5).forEach((p: any) => {
          relatorioTemplate += `• ${p.professor} - Presença ${p.presenca}%${p.evasoes > 0 ? ` | ${p.evasoes} evasões` : ''}\n`;
        });
        if (professorCriticos.length > 5) {
          relatorioTemplate += `  _...e mais ${professorCriticos.length - 5}_\n`;
        }
        relatorioTemplate += `\n`;
      }

      if (professorAtencao.length > 0) {
        relatorioTemplate += `🟡 *PRESENÇA/EVASÃO EM ATENÇÃO (${professorAtencao.length})*\n`;
        professorAtencao.slice(0, 5).forEach((p: any) => {
          relatorioTemplate += `• ${p.professor} - Presença ${p.presenca}%${p.evasoes > 0 ? ` | ${p.evasoes} evasões` : ''}\n`;
        });
        if (professorAtencao.length > 5) {
          relatorioTemplate += `  _...e mais ${professorAtencao.length - 5}_\n`;
        }
        relatorioTemplate += `\n`;
      }
    }

    // METAS PEDAGÓGICAS
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `🎯 *METAS PEDAGÓGICAS*\n`;
    relatorioTemplate += `───────────────────────\n`;
    if (temMetas) {
      if (metasProfessores.media_alunos_turma) {
        const pct = mediaAlunosTurma ? Math.min((mediaAlunosTurma / metasProfessores.media_alunos_turma) * 100, 100) : 0;
        const status = pct >= 100 ? '✅' : (pct >= 80 ? '⚠️' : '❌');
        relatorioTemplate += `${criarBarraProgresso(pct)} ${pct.toFixed(0)}% Média/Turma (${mediaAlunosTurma?.toFixed(2) || 0}/${metasProfessores.media_alunos_turma}) ${status}\n`;
      }
      if (metasProfessores.presenca_media) {
        const pct = Math.min((mediaPresenca / metasProfessores.presenca_media) * 100, 100);
        const status = pct >= 100 ? '✅' : (pct >= 90 ? '⚠️' : '❌');
        relatorioTemplate += `${criarBarraProgresso(pct)} ${pct.toFixed(0)}% Presença (${mediaPresenca.toFixed(1)}%/${metasProfessores.presenca_media}%) ${status}\n`;
      }
      if (metasProfessores.taxa_renovacao_prof) {
        const pct = Math.min((taxaRenovacaoMedia / metasProfessores.taxa_renovacao_prof) * 100, 100);
        const status = pct >= 100 ? '✅' : (pct >= 90 ? '⚠️' : '❌');
        relatorioTemplate += `${criarBarraProgresso(pct)} ${pct.toFixed(0)}% Renovação (${taxaRenovacaoMedia.toFixed(1)}%/${metasProfessores.taxa_renovacao_prof}%) ${status}\n`;
      }
      if (metasProfessores.taxa_conversao_exp) {
        const pct = Math.min((taxaConversaoMedia / metasProfessores.taxa_conversao_exp) * 100, 100);
        const status = pct >= 100 ? '✅' : (pct >= 70 ? '⚠️' : '❌');
        relatorioTemplate += `${criarBarraProgresso(pct)} ${pct.toFixed(0)}% Conversao Exp->Mat (${taxaConversaoMedia.toFixed(1)}%/${metasProfessores.taxa_conversao_exp}%) ${status}\n`;
      }
    } else {
      relatorioTemplate += `• Metas ainda não cadastradas para este período\n`;
      relatorioTemplate += `• _Configure as metas na aba Professores do painel de Metas_\n`;
    }
    relatorioTemplate += `\n`;

    // AGENDA & TREINAMENTOS
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `📅 *AGENDA & TREINAMENTOS*\n`;
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `• Treinamentos Agendados: *${treinamentosAgendados}*\n`;
    relatorioTemplate += `• Reuniões Agendadas: *${reunioesAgendadas}*\n`;
    relatorioTemplate += `• Checkpoints: *${checkpointsAgendados}*\n`;
    relatorioTemplate += `• Concluídos: *${concluidos}*\n`;
    if (atrasados > 0) {
      relatorioTemplate += `• Atrasados: *${atrasados}* ⚠️\n`;
    }
    relatorioTemplate += `\n`;

    // SUGESTÕES DE TREINAMENTO (IA vai preencher)
    relatorioTemplate += `🎓 *SUGESTÕES DE TREINAMENTO (IA)*\n`;
    relatorioTemplate += `[SUGESTOES_TREINAMENTO_IA]\n\n`;

    // COMPARATIVOS
    if (mesAnterior.total_professores || anoAnterior.total_professores) {
      relatorioTemplate += `───────────────────────\n`;
      relatorioTemplate += `⚖️ *COMPARATIVOS*\n`;
      relatorioTemplate += `───────────────────────\n\n`;

      if (mesAnterior.total_alunos) {
        relatorioTemplate += `📅 *VS MÊS ANTERIOR*\n`;
        const diffAlunos = totalAlunos - (mesAnterior.total_alunos || 0);
        relatorioTemplate += `• Alunos: ${mesAnterior.total_alunos || 0} → ${totalAlunos} (${diffAlunos >= 0 ? '↑' : '↓'}${Math.abs(diffAlunos)})\n`;
        if (mesAnterior.media_presenca) {
          const diffPresenca = mediaPresenca - mesAnterior.media_presenca;
          relatorioTemplate += `• Presença: ${mesAnterior.media_presenca}% → ${mediaPresenca.toFixed(1)}% (${diffPresenca >= 0 ? '↑' : '↓'}${Math.abs(diffPresenca).toFixed(1)}pp)\n`;
        }
        const diffEvasoes = totalEvasoes - (mesAnterior.total_evasoes || 0);
        relatorioTemplate += `• Evasões: ${mesAnterior.total_evasoes || 0} → ${totalEvasoes} (${diffEvasoes <= 0 ? '↓' : '↑'}${Math.abs(diffEvasoes)})\n`;
        relatorioTemplate += `\n`;
      }

      if (anoAnterior.total_alunos) {
        relatorioTemplate += `📅 *VS MESMO MÊS ANO PASSADO*\n`;
        const diffAlunos = totalAlunos - (anoAnterior.total_alunos || 0);
        relatorioTemplate += `• Alunos: ${anoAnterior.total_alunos || 0} → ${totalAlunos} (${diffAlunos >= 0 ? '↑' : '↓'}${Math.abs(diffAlunos)})\n`;
        if (anoAnterior.media_presenca) {
          const diffPresenca = mediaPresenca - anoAnterior.media_presenca;
          relatorioTemplate += `• Presença: ${anoAnterior.media_presenca}% → ${mediaPresenca.toFixed(1)}% (${diffPresenca >= 0 ? '↑' : '↓'}${Math.abs(diffPresenca).toFixed(1)}pp)\n`;
        }
        relatorioTemplate += `\n`;
      }
    }

    // Seções que a IA vai preencher
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `✅ *CONQUISTAS DO MÊS*\n`;
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `[CONQUISTAS_IA]\n\n`;

    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `⚠️ *PONTOS DE ATENÇÃO*\n`;
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `[PONTOS_ATENCAO_IA]\n\n`;

    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `🎯 *PLANO DE AÇÃO PEDAGÓGICO*\n`;
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `[PLANO_ACAO_IA]\n\n`;

    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `💬 *MENSAGEM PARA A COORDENAÇÃO*\n`;
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `> [MENSAGEM_FINAL_IA]\n\n`;

    const dataHora = new Date();
    relatorioTemplate += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    relatorioTemplate += `📅 Gerado em: ${dataHora.toLocaleDateString('pt-BR')} às ${dataHora.getHours()}:${dataHora.getMinutes().toString().padStart(2, '0')}\n`;
    relatorioTemplate += `━━━━━━━━━━━━━━━━━━━━━━`;

    // ═══════════════════════════════════════════════════════════════
    // CHAMAR IA PARA INSIGHTS
    // ═══════════════════════════════════════════════════════════════

    const treinamentosDisponiveis = catalogoTreinamentos.map((t: any) => `${t.nome}: ${t.descricao}`).join('\n');

    const systemPrompt = `Você é um consultor pedagógico especializado em escolas de música.
Sua tarefa é analisar os dados da equipe de professores e gerar insights para a coordenação.

COORDENADORES: ${coordenadores.join(' e ')}
TREINAMENTOS DISPONÍVEIS:
${treinamentosDisponiveis}

REGRAS:
- Seja direto e objetivo
- Use linguagem profissional mas motivacional
- Sugira treinamentos específicos do catálogo para professores com problemas
- Mencione professores pelo nome quando relevante
- Use emojis moderadamente
- Cada item deve ter no máximo 1-2 linhas

Responda EXATAMENTE neste formato JSON:
{
  "resumo_executivo": "2-3 linhas de resumo da equipe pedagógica",
  "sugestoes_treinamento": [
    {"professor": "Nome", "treinamento": "Nome do Treinamento", "motivo": "razão breve"}
  ],
  "conquistas": ["conquista 1", "conquista 2", "conquista 3"],
  "pontos_atencao": ["ponto 1", "ponto 2", "ponto 3"],
  "plano_acao": ["ação 1", "ação 2", "ação 3"],
  "mensagem_final": "mensagem motivacional para ${coordenadores.join(' e ')}"
}`;

    const dadosParaIA = {
      unidade: unidadeNome,
      mes: mesNome,
      ano: ano,
      total_professores: totalProfessores,
      health_score_medio: healthScoreMedio,
      professores_criticos_count: professorCriticosHS.length,
      professores_atencao_count: professorAtencaoHS.length,
      total_alunos: totalAlunos,
      media_alunos_professor: mediaAlunosProfessor,
      media_presenca: mediaPresenca,
      total_evasoes: totalEvasoes,
      total_matriculas: totalMatriculas,
      professores_criticos: professorCriticosHS.slice(0, 5).map((p: any) => ({
        nome: p.professor_nome,
        health_score: p.health_score,
        presenca: p.media_presenca
      })),
      professores_atencao: professorAtencaoHS.slice(0, 5).map((p: any) => ({
        nome: p.professor_nome,
        health_score: p.health_score,
        presenca: p.media_presenca
      })),
      top_health_score: topHealthScore.map((p: any) => ({
        nome: p.professor_nome,
        score: p.health_score
      })),
      top_retencao: topRetencao.slice(0, 3),
      top_presenca: topPresenca.slice(0, 3),
      agenda: {
        treinamentos: treinamentosAgendados,
        atrasados: atrasados
      }
    };

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
            { role: 'system', content: systemPrompt },
            { role: 'user', content: 'DADOS:\n' + JSON.stringify(dadosParaIA, null, 2) }
          ],
          temperature: 0.7,
          max_completion_tokens: 2048,
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro OpenAI:', errorText);
      throw new Error(`Erro na API OpenAI: ${response.status} — ${errorText}`);
    }

    const openaiResponse = await response.json();
    const iaResponseText = openaiResponse.choices?.[0]?.message?.content;

    if (!iaResponseText) {
      throw new Error('Resposta vazia da API OpenAI');
    }

    // Parsear resposta da IA
    let iaData;
    try {
      const jsonText = iaResponseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      iaData = JSON.parse(jsonText);
    } catch (e) {
      console.error('Erro ao parsear resposta da IA:', iaResponseText);
      iaData = {
        resumo_executivo: `${mesNome} apresentou resultados variados na equipe pedagógica. Análise detalhada nos indicadores.`,
        sugestoes_treinamento: [],
        conquistas: ['Equipe manteve foco nos objetivos', 'Processos pedagógicos em andamento', 'Base de alunos estável'],
        pontos_atencao: ['Monitorar presença dos professores', 'Acompanhar vinculo/presenca antes de liberar conversao experimental', 'Revisar estratégias de engajamento'],
        plano_acao: ['Realizar checkpoints individuais', 'Agendar treinamentos prioritários', 'Acompanhar professores críticos'],
        mensagem_final: `${coordenadores.join(' e ')}, vamos juntos elevar a qualidade pedagógica! 🎶`
      };
    }

    // Formatar sugestões de treinamento
    let sugestoesTreinamento = '';
    if (iaData.sugestoes_treinamento && iaData.sugestoes_treinamento.length > 0) {
      iaData.sugestoes_treinamento.slice(0, 5).forEach((s: any) => {
        sugestoesTreinamento += `• ${s.professor} → *${s.treinamento}* (${s.motivo})\n`;
      });
    } else {
      sugestoesTreinamento = '• Nenhuma sugestão prioritária no momento\n';
    }

    // Substituir placeholders no template
    let relatorioFinal = relatorioTemplate
      .replace('[RESUMO_EXECUTIVO_IA]', iaData.resumo_executivo || '')
      .replace('[SUGESTOES_TREINAMENTO_IA]', sugestoesTreinamento)
      .replace('[CONQUISTAS_IA]', (iaData.conquistas || []).map((c: string) => `• ${c}`).join('\n'))
      .replace('[PONTOS_ATENCAO_IA]', (iaData.pontos_atencao || []).map((p: string) => `• ${p}`).join('\n'))
      .replace('[PLANO_ACAO_IA]', (iaData.plano_acao || []).map((a: string) => `• ${a}`).join('\n'))
      .replace('[MENSAGEM_FINAL_IA]', iaData.mensagem_final || '');

    return new Response(
      JSON.stringify({ success: true, relatorio: relatorioFinal }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('Erro na Edge Function:', msg, error instanceof Error ? error.stack : '');
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
