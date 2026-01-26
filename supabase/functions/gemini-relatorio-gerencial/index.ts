
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RelatorioGerencialRequest {
  dados: any;
  unidade_nome?: string;
  is_consolidado: boolean;
}

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

// Função para calcular variação com seta
function calcularVariacao(atual: number, anterior: number, inverso: boolean = false): string {
  if (anterior === 0 || anterior === null) return 'N/D';
  const diff = atual - anterior;
  const seta = inverso 
    ? (diff <= 0 ? '↓' : '↑')
    : (diff >= 0 ? '↑' : '↓');
  return `${seta}${Math.abs(diff).toFixed(diff % 1 === 0 ? 0 : 1)}`;
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

    const payload: RelatorioGerencialRequest = await req.json();
    const { dados } = payload;

    // ═══════════════════════════════════════════════════════════════
    // EXTRAIR DADOS DO PAYLOAD
    // ═══════════════════════════════════════════════════════════════
    
    const periodo = dados.periodo || {};
    const unidadeNome = periodo.unidade_nome || 'Consolidado';
    const ano = periodo.ano || new Date().getFullYear();
    const mesAtual = periodo.mes || new Date().getMonth() + 1;

    // Meses por extenso
    const mesesPorExtenso: Record<number, string> = {
      1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril',
      5: 'Maio', 6: 'Junho', 7: 'Julho', 8: 'Agosto',
      9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro'
    };
    const mesNome = mesesPorExtenso[mesAtual] || '';
    const anoAnterior = ano - 1;
    const mesAnoAnteriorAbrev = `${mesNome.substring(0, 3).toUpperCase()}/${String(anoAnterior).slice(-2)}`;
    const mesAnteriorNome = mesesPorExtenso[mesAtual === 1 ? 12 : mesAtual - 1] || '';
    const mesAnteriorAbrev = `${mesAnteriorNome.substring(0, 3).toUpperCase()}/${mesAtual === 1 ? String(anoAnterior).slice(-2) : String(ano).slice(-2)}`;

    // Equipe
    const gerenteNome = dados.gerente_nome || 'N/D';
    const hunterNome = dados.hunter_nome || 'N/D';
    const farmersNomes = dados.farmers_nomes || [];

    // KPIs de Gestão
    const kpisGestao = dados.kpis_gestao || [];
    const totalPagantes = kpisGestao.reduce((acc: number, k: any) => acc + (k.total_alunos_pagantes || 0), 0);
    const totalAtivos = kpisGestao.reduce((acc: number, k: any) => acc + (k.total_alunos_ativos || 0), 0);
    const ticketMedio = kpisGestao.length > 0 
      ? kpisGestao.reduce((acc: number, k: any) => acc + (k.ticket_medio || 0), 0) / kpisGestao.length 
      : 0;
    const mrr = kpisGestao.reduce((acc: number, k: any) => acc + (k.mrr || 0), 0);
    const churnRate = kpisGestao.length > 0
      ? kpisGestao.reduce((acc: number, k: any) => acc + (k.churn_rate || 0), 0) / kpisGestao.length
      : 0;
    const inadimplencia = kpisGestao.length > 0
      ? kpisGestao.reduce((acc: number, k: any) => acc + (k.inadimplencia_pct || 0), 0) / kpisGestao.length
      : 0;
    const tempoPermanencia = kpisGestao.length > 0
      ? kpisGestao.reduce((acc: number, k: any) => acc + (k.tempo_permanencia_medio || 0), 0) / kpisGestao.length
      : 0;
    const ltvMedio = kpisGestao.length > 0
      ? kpisGestao.reduce((acc: number, k: any) => acc + (k.ltv_medio || 0), 0) / kpisGestao.length
      : 0;

    // KPIs de Retenção
    const kpisRetencao = dados.kpis_retencao || [];
    const totalEvasoes = kpisRetencao.reduce((acc: number, k: any) => acc + (k.total_evasoes || 0), 0);
    const mrrPerdido = kpisRetencao.reduce((acc: number, k: any) => acc + (k.mrr_perdido || 0), 0);
    const renovacoesPrevistas = kpisRetencao.reduce((acc: number, k: any) => acc + (k.renovacoes_previstas || 0), 0);
    const renovacoesRealizadas = kpisRetencao.reduce((acc: number, k: any) => acc + (k.renovacoes_realizadas || 0), 0);
    const taxaRenovacao = renovacoesPrevistas > 0 ? (renovacoesRealizadas / renovacoesPrevistas * 100) : 0;
    const naoRenovacoes = kpisRetencao.reduce((acc: number, k: any) => acc + (k.nao_renovacoes || 0), 0);
    const reajusteMedio = kpisRetencao.length > 0
      ? kpisRetencao.reduce((acc: number, k: any) => acc + (k.reajuste_medio || 0), 0) / kpisRetencao.length
      : 0;

    // KPIs Comerciais
    const kpisComercial = dados.kpis_comercial || [];
    const totalLeads = kpisComercial.reduce((acc: number, k: any) => acc + (k.total_leads || 0), 0);
    const totalExperimentais = kpisComercial.reduce((acc: number, k: any) => acc + (k.experimentais_realizadas || 0), 0);
    const novasMatriculas = kpisComercial.reduce((acc: number, k: any) => acc + (k.novas_matriculas || 0), 0);
    const taxaLeadExp = kpisComercial.length > 0
      ? kpisComercial.reduce((acc: number, k: any) => acc + (k.taxa_lead_experimental || 0), 0) / kpisComercial.length
      : 0;
    const taxaExpMat = kpisComercial.length > 0
      ? kpisComercial.reduce((acc: number, k: any) => acc + (k.taxa_experimental_matricula || 0), 0) / kpisComercial.length
      : 0;
    const taxaConversaoGeral = kpisComercial.length > 0
      ? kpisComercial.reduce((acc: number, k: any) => acc + (k.taxa_conversao_geral || 0), 0) / kpisComercial.length
      : 0;

    // Matrículas detalhadas
    const matriculasAtivas = dados.matriculas_ativas || 0;
    const matriculasBanda = dados.matriculas_banda || 0;
    const matriculas2Curso = dados.matriculas_2_curso || 0;
    const totalBolsistas = dados.total_bolsistas || 0;

    // Metas (da tabela metas_kpi)
    const metasKpi = dados.metas_kpi || {};
    const temMetas = Object.keys(metasKpi).length > 0;

    // Dados do mês anterior
    const mesAnterior = dados.mes_anterior || [];
    const alunosMesAnterior = mesAnterior.length > 0 ? mesAnterior[0]?.alunos_pagantes : null;
    const ticketMesAnterior = mesAnterior.length > 0 ? mesAnterior[0]?.ticket_medio : null;
    const churnMesAnterior = mesAnterior.length > 0 ? mesAnterior[0]?.churn_rate : null;
    const matriculasMesAnterior = mesAnterior.length > 0 ? mesAnterior[0]?.novas_matriculas : null;
    const evasoesMesAnterior = mesAnterior.length > 0 ? mesAnterior[0]?.evasoes : null;

    // Dados do mesmo mês ano passado (sazonalidade)
    const anoPassado = dados.mesmo_mes_ano_passado || [];
    const alunosAnoPassado = anoPassado.length > 0 ? anoPassado[0]?.alunos_pagantes : null;
    const churnAnoPassado = anoPassado.length > 0 ? anoPassado[0]?.churn_rate : null;
    const matriculasAnoPassado = anoPassado.length > 0 ? anoPassado[0]?.novas_matriculas : null;
    const evasoesAnoPassado = anoPassado.length > 0 ? anoPassado[0]?.evasoes : null;
    const saldoLiquidoAnoPassado = anoPassado.length > 0 ? anoPassado[0]?.saldo_liquido : null;

    // Sazonalidade histórica
    const sazonalidade = dados.sazonalidade || [];
    const churnMedioHistorico = sazonalidade.length > 0
      ? sazonalidade.reduce((acc: number, s: any) => acc + (s.churn_rate || 0), 0) / sazonalidade.length
      : null;

    // Motivos de evasão
    const motivosEvasao = dados.motivos_evasao || [];
    
    // Rankings de professores
    const topRetencao = dados.top_professores_retencao || [];
    const topMatriculadores = dados.top_professores_matriculadores || [];
    const topPresenca = dados.top_professores_presenca || [];
    const topMediaTurma = dados.top_professores_media_turma || [];

    // Cursos mais procurados
    const cursosMaisProcurados = dados.cursos_mais_procurados || [];

    // Canais com maior conversão
    const canaisMaiorConversao = dados.canais_maior_conversao || [];

    // Indicações (para Matriculador+)
    const totalIndicacoes = dados.total_indicacoes || 0;
    const totalFamilyPacotes = dados.total_family_pacotes || 0;

    // ═══════════════════════════════════════════════════════════════
    // CONSTRUIR TEMPLATE FIXO DO RELATÓRIO
    // ═══════════════════════════════════════════════════════════════

    let relatorioTemplate = '';

    // CABEÇALHO
    relatorioTemplate += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    relatorioTemplate += `📊 *RELATÓRIO GERENCIAL - LA MUSIC*\n`;
    relatorioTemplate += `🏢 *${unidadeNome.toUpperCase()}*\n`;
    relatorioTemplate += `📅 *${mesNome.toUpperCase()}/${ano}*\n`;
    relatorioTemplate += `👤 Gerente: ${gerenteNome}\n`;
    relatorioTemplate += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    relatorioTemplate += `> [RESUMO_EXECUTIVO_IA]\n\n`;

    // FINANCEIRO
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `💰 *FINANCEIRO*\n`;
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `• MRR Atual: *R$ ${formatarMoeda(mrr)}*\n`;
    relatorioTemplate += `• Ticket Médio: *R$ ${formatarMoeda(ticketMedio)}*\n`;
    relatorioTemplate += `• Inadimplência: *${inadimplencia.toFixed(1).replace('.', ',')}%*\n\n`;

    // BASE DE ALUNOS
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `👥 *BASE DE ALUNOS*\n`;
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `• Ativos: *${totalAtivos}*\n`;
    relatorioTemplate += `• Pagantes: *${totalPagantes}*\n`;
    relatorioTemplate += `• Bolsistas: *${totalBolsistas}*\n`;
    relatorioTemplate += `• Novos no Mês: *${novasMatriculas}*\n`;
    relatorioTemplate += `• Permanência Média: *${tempoPermanencia.toFixed(1).replace('.', ',')} meses*\n`;
    relatorioTemplate += `• LTV Médio: *R$ ${formatarMoeda(ltvMedio)}*\n\n`;

    relatorioTemplate += `📚 *MATRÍCULAS*\n`;
    relatorioTemplate += `• Ativas: *${matriculasAtivas}*\n`;
    relatorioTemplate += `• Em Banda: *${matriculasBanda}*\n`;
    relatorioTemplate += `• 2º Curso: *${matriculas2Curso}*\n\n`;

    // FUNIL COMERCIAL
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `📈 *FUNIL COMERCIAL*\n`;
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `• Leads: *${totalLeads}*\n`;
    relatorioTemplate += `• Experimentais: *${totalExperimentais}*\n`;
    relatorioTemplate += `• Matrículas: *${novasMatriculas}*\n`;
    relatorioTemplate += `• Taxa Lead→Exp: *${taxaLeadExp.toFixed(1).replace('.', ',')}%*\n`;
    relatorioTemplate += `• Taxa Exp→Mat: *${taxaExpMat.toFixed(1).replace('.', ',')}%*\n`;
    relatorioTemplate += `• Conversão Geral: *${taxaConversaoGeral.toFixed(1).replace('.', ',')}%*\n\n`;

    // Metas comerciais
    if (temMetas && (metasKpi.leads || metasKpi.experimentais || metasKpi.matriculas)) {
      relatorioTemplate += `🎯 *METAS COMERCIAIS*\n`;
      if (metasKpi.leads) {
        const pctLeads = Math.min((totalLeads / metasKpi.leads) * 100, 100);
        relatorioTemplate += `${criarBarraProgresso(pctLeads)} ${pctLeads.toFixed(0)}% Leads (${totalLeads}/${metasKpi.leads})\n`;
      }
      if (metasKpi.experimentais) {
        const pctExp = Math.min((totalExperimentais / metasKpi.experimentais) * 100, 100);
        relatorioTemplate += `${criarBarraProgresso(pctExp)} ${pctExp.toFixed(0)}% Experimentais (${totalExperimentais}/${metasKpi.experimentais})\n`;
      }
      if (metasKpi.matriculas) {
        const pctMat = Math.min((novasMatriculas / metasKpi.matriculas) * 100, 100);
        relatorioTemplate += `${criarBarraProgresso(pctMat)} ${pctMat.toFixed(0)}% Matrículas (${novasMatriculas}/${metasKpi.matriculas})\n`;
      }
      relatorioTemplate += `\n`;
    }

    // RETENÇÃO
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `📉 *RETENÇÃO*\n`;
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `• Churn Rate: *${churnRate.toFixed(1).replace('.', ',')}%*\n`;
    relatorioTemplate += `• Evasões: *${totalEvasoes}*\n`;
    relatorioTemplate += `• Não Renovações: *${naoRenovacoes}*\n`;
    relatorioTemplate += `• MRR Perdido: *R$ ${formatarMoeda(mrrPerdido)}*\n`;
    relatorioTemplate += `• Taxa Renovação: *${taxaRenovacao.toFixed(0)}%*\n`;
    relatorioTemplate += `• Reajuste Médio: *${reajusteMedio.toFixed(1).replace('.', ',')}%*\n\n`;

    // Motivos de evasão
    if (motivosEvasao.length > 0) {
      relatorioTemplate += `🔴 *TOP 5 MOTIVOS DE EVASÃO*\n`;
      motivosEvasao.slice(0, 5).forEach((m: any, i: number) => {
        relatorioTemplate += `  ${i + 1}. ${m.motivo}: ${m.quantidade} (${m.percentual}%)\n`;
      });
      relatorioTemplate += `\n`;
    }

    // RANKINGS
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `🏆 *RANKINGS*\n`;
    relatorioTemplate += `───────────────────────\n\n`;

    if (topRetencao.length > 0) {
      relatorioTemplate += `🥇 *TOP 3 PROFESSORES RETENÇÃO*\n`;
      topRetencao.slice(0, 3).forEach((p: any, i: number) => {
        relatorioTemplate += `  ${i + 1}. ${p.professor} - ${p.tempo_medio_permanencia} meses\n`;
      });
      relatorioTemplate += `\n`;
    }

    if (topMatriculadores.length > 0) {
      relatorioTemplate += `🎯 *TOP 3 PROFESSORES MATRICULADORES*\n`;
      topMatriculadores.slice(0, 3).forEach((p: any, i: number) => {
        relatorioTemplate += `  ${i + 1}. ${p.professor_nome} - ${p.matriculas} matrícula${p.matriculas > 1 ? 's' : ''}\n`;
      });
      relatorioTemplate += `\n`;
    }

    if (topPresenca.length > 0) {
      relatorioTemplate += `📊 *TOP 3 PRESENÇA MÉDIA*\n`;
      topPresenca.slice(0, 3).forEach((p: any, i: number) => {
        relatorioTemplate += `  ${i + 1}. ${p.professor} - ${p.presenca_media}%\n`;
      });
      relatorioTemplate += `\n`;
    }

    if (topMediaTurma.length > 0) {
      relatorioTemplate += `👥 *TOP 3 MÉDIA DE ALUNOS POR TURMA*\n`;
      topMediaTurma.slice(0, 3).forEach((p: any, i: number) => {
        relatorioTemplate += `  ${i + 1}. ${p.professor} - ${p.media_alunos_turma} alunos/turma (${p.total_turmas} turmas)\n`;
      });
      relatorioTemplate += `\n`;
    }

    // CURSOS MAIS PROCURADOS
    if (cursosMaisProcurados.length > 0) {
      relatorioTemplate += `───────────────────────\n`;
      relatorioTemplate += `🎸 *CURSOS MAIS PROCURADOS*\n`;
      relatorioTemplate += `───────────────────────\n`;
      cursosMaisProcurados.slice(0, 5).forEach((c: any, i: number) => {
        relatorioTemplate += `  ${i + 1}. ${c.curso} - ${c.total_alunos} alunos\n`;
      });
      relatorioTemplate += `\n`;
    }

    // CANAIS COM MAIOR CONVERSÃO
    if (canaisMaiorConversao.length > 0) {
      relatorioTemplate += `───────────────────────\n`;
      relatorioTemplate += `📱 *CANAIS COM MAIOR CONVERSÃO*\n`;
      relatorioTemplate += `───────────────────────\n`;
      canaisMaiorConversao.slice(0, 3).forEach((c: any, i: number) => {
        relatorioTemplate += `  ${i + 1}. ${c.canal} - ${c.taxa_conversao}% conversão\n`;
      });
      relatorioTemplate += `\n`;
    }

    // COMPARATIVOS
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `⚖️ *COMPARATIVOS*\n`;
    relatorioTemplate += `───────────────────────\n\n`;

    relatorioTemplate += `📅 *VS MÊS ANTERIOR (${mesAnteriorAbrev})*\n`;
    if (alunosMesAnterior != null) {
      const diffAlunos = totalPagantes - alunosMesAnterior;
      relatorioTemplate += `• Alunos: ${alunosMesAnterior} → ${totalPagantes} (${diffAlunos >= 0 ? '↑' : '↓'}${Math.abs(diffAlunos)})\n`;
    }
    if (ticketMesAnterior != null) {
      const diffTicket = ticketMedio - ticketMesAnterior;
      relatorioTemplate += `• Ticket: R$${ticketMesAnterior.toFixed(0)} → R$${ticketMedio.toFixed(0)} (${diffTicket >= 0 ? '↑' : '↓'}R$${Math.abs(diffTicket).toFixed(0)})\n`;
    }
    if (churnMesAnterior != null) {
      relatorioTemplate += `• Churn: ${churnMesAnterior.toFixed(1).replace('.', ',')}% → ${churnRate.toFixed(1).replace('.', ',')}% (${churnRate <= churnMesAnterior ? '↓' : '↑'})\n`;
    }
    if (matriculasMesAnterior != null) {
      const diffMat = novasMatriculas - matriculasMesAnterior;
      relatorioTemplate += `• Matrículas: ${matriculasMesAnterior} → ${novasMatriculas} (${diffMat >= 0 ? '↑' : '↓'}${Math.abs(diffMat)})\n`;
    }
    if (evasoesMesAnterior != null) {
      const diffEv = totalEvasoes - evasoesMesAnterior;
      relatorioTemplate += `• Evasões: ${evasoesMesAnterior} → ${totalEvasoes} (${diffEv <= 0 ? '↓' : '↑'}${Math.abs(diffEv)})\n`;
    }
    relatorioTemplate += `\n`;

    relatorioTemplate += `📅 *VS MESMO MÊS ANO PASSADO (${mesAnoAnteriorAbrev})*\n`;
    if (alunosAnoPassado != null) {
      const diffAlunos = totalPagantes - alunosAnoPassado;
      relatorioTemplate += `• Alunos: ${alunosAnoPassado} → ${totalPagantes} (${diffAlunos >= 0 ? '↑' : '↓'}${Math.abs(diffAlunos)})\n`;
    }
    if (churnAnoPassado != null) {
      const diffChurn = churnRate - churnAnoPassado;
      relatorioTemplate += `• Churn: ${churnAnoPassado.toFixed(1).replace('.', ',')}% → ${churnRate.toFixed(1).replace('.', ',')}% (${diffChurn <= 0 ? '↓' : '↑'}${Math.abs(diffChurn).toFixed(1)}pp)\n`;
    }
    if (matriculasAnoPassado != null) {
      const diffMat = novasMatriculas - matriculasAnoPassado;
      relatorioTemplate += `• Matrículas: ${matriculasAnoPassado} → ${novasMatriculas} (${diffMat >= 0 ? '↑' : '↓'}${Math.abs(diffMat)})\n`;
    }
    if (evasoesAnoPassado != null) {
      const diffEv = totalEvasoes - evasoesAnoPassado;
      relatorioTemplate += `• Evasões: ${evasoesAnoPassado} → ${totalEvasoes} (${diffEv <= 0 ? '↓' : '↑'}${Math.abs(diffEv)})\n`;
    }
    const saldoLiquidoAtual = novasMatriculas - totalEvasoes;
    if (saldoLiquidoAnoPassado != null) {
      relatorioTemplate += `• Saldo Líquido: ${saldoLiquidoAnoPassado} → ${saldoLiquidoAtual} (${saldoLiquidoAtual >= saldoLiquidoAnoPassado ? '↑' : '↓'})\n`;
    }
    relatorioTemplate += `\n`;

    // Análise de sazonalidade
    if (churnMedioHistorico != null) {
      relatorioTemplate += `📈 *ANÁLISE DE SAZONALIDADE*\n`;
      relatorioTemplate += `• ${mesNome} historicamente tem churn médio de ${churnMedioHistorico.toFixed(1).replace('.', ',')}%\n`;
      if (churnRate < churnMedioHistorico) {
        relatorioTemplate += `• Performance *acima* da média histórica ✅\n`;
      } else {
        relatorioTemplate += `• Performance *abaixo* da média histórica ⚠️\n`;
      }
      relatorioTemplate += `\n`;
    }

    // METAS DO MÊS
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `🎯 *METAS DO MÊS*\n`;
    relatorioTemplate += `───────────────────────\n`;
    if (temMetas) {
      relatorioTemplate += `\n📊 *GESTÃO*\n`;
      // Alunos Pagantes
      if (metasKpi.alunos_pagantes) {
        const pct = Math.min((totalPagantes / metasKpi.alunos_pagantes) * 100, 100);
        const status = pct >= 100 ? '✅' : (pct >= 90 ? '⚠️' : '❌');
        relatorioTemplate += `${criarBarraProgresso(pct)} ${pct.toFixed(0)}% Alunos (${totalPagantes}/${metasKpi.alunos_pagantes}) ${status}\n`;
      }
      // Ticket Médio
      if (metasKpi.ticket_medio) {
        const pct = Math.min((ticketMedio / metasKpi.ticket_medio) * 100, 100);
        const status = pct >= 100 ? '✅' : (pct >= 90 ? '⚠️' : '❌');
        relatorioTemplate += `${criarBarraProgresso(pct)} ${pct.toFixed(0)}% Ticket (R$${ticketMedio.toFixed(0)}/R$${metasKpi.ticket_medio}) ${status}\n`;
      }
      // Churn Rate (inverso - quanto menor, melhor)
      if (metasKpi.churn_rate) {
        const pctChurn = churnRate <= metasKpi.churn_rate ? 100 : Math.max(0, 100 - ((churnRate - metasKpi.churn_rate) / metasKpi.churn_rate * 100));
        const status = churnRate <= metasKpi.churn_rate ? '✅' : '❌';
        relatorioTemplate += `${criarBarraProgresso(pctChurn)} ${pctChurn.toFixed(0)}% Churn (${churnRate.toFixed(1).replace('.', ',')}%/${metasKpi.churn_rate}%) ${status}\n`;
      }
      // Taxa Renovação
      if (metasKpi.taxa_renovacao) {
        const pct = Math.min((taxaRenovacao / metasKpi.taxa_renovacao) * 100, 100);
        const status = pct >= 100 ? '✅' : (pct >= 90 ? '⚠️' : '❌');
        relatorioTemplate += `${criarBarraProgresso(pct)} ${pct.toFixed(0)}% Renovação (${taxaRenovacao.toFixed(0)}%/${metasKpi.taxa_renovacao}%) ${status}\n`;
      }
      // Tempo Permanência
      if (metasKpi.tempo_permanencia) {
        const pct = Math.min((tempoPermanencia / metasKpi.tempo_permanencia) * 100, 100);
        const status = pct >= 100 ? '✅' : (pct >= 90 ? '⚠️' : '❌');
        relatorioTemplate += `${criarBarraProgresso(pct)} ${pct.toFixed(0)}% Permanência (${tempoPermanencia.toFixed(1)}/${metasKpi.tempo_permanencia} meses) ${status}\n`;
      }
      // Inadimplência (inverso - quanto menor, melhor)
      if (metasKpi.inadimplencia) {
        const pctInad = inadimplencia <= metasKpi.inadimplencia ? 100 : Math.max(0, 100 - ((inadimplencia - metasKpi.inadimplencia) / metasKpi.inadimplencia * 100));
        const status = inadimplencia <= metasKpi.inadimplencia ? '✅' : '❌';
        relatorioTemplate += `${criarBarraProgresso(pctInad)} ${pctInad.toFixed(0)}% Inadimpl. (${inadimplencia.toFixed(1).replace('.', ',')}%/${metasKpi.inadimplencia}%) ${status}\n`;
      }
      // Reajuste Médio
      if (metasKpi.reajuste_medio) {
        const pct = Math.min((reajusteMedio / metasKpi.reajuste_medio) * 100, 100);
        const status = pct >= 100 ? '✅' : (pct >= 90 ? '⚠️' : '❌');
        relatorioTemplate += `${criarBarraProgresso(pct)} ${pct.toFixed(0)}% Reajuste (${reajusteMedio.toFixed(1).replace('.', ',')}%/${metasKpi.reajuste_medio}%) ${status}\n`;
      }

      relatorioTemplate += `\n📈 *COMERCIAL*\n`;
      // Leads
      if (metasKpi.leads) {
        const pct = Math.min((totalLeads / metasKpi.leads) * 100, 100);
        const status = pct >= 100 ? '✅' : (pct >= 70 ? '⚠️' : '❌');
        relatorioTemplate += `${criarBarraProgresso(pct)} ${pct.toFixed(0)}% Leads (${totalLeads}/${metasKpi.leads}) ${status}\n`;
      }
      // Experimentais
      if (metasKpi.experimentais) {
        const pct = Math.min((totalExperimentais / metasKpi.experimentais) * 100, 100);
        const status = pct >= 100 ? '✅' : (pct >= 70 ? '⚠️' : '❌');
        relatorioTemplate += `${criarBarraProgresso(pct)} ${pct.toFixed(0)}% Experimentais (${totalExperimentais}/${metasKpi.experimentais}) ${status}\n`;
      }
      // Matrículas
      if (metasKpi.matriculas) {
        const pct = Math.min((novasMatriculas / metasKpi.matriculas) * 100, 100);
        const status = pct >= 100 ? '✅' : (pct >= 70 ? '⚠️' : '❌');
        relatorioTemplate += `${criarBarraProgresso(pct)} ${pct.toFixed(0)}% Matrículas (${novasMatriculas}/${metasKpi.matriculas}) ${status}\n`;
      }
      // Taxa Lead→Exp
      if (metasKpi.taxa_lead_exp) {
        const pct = Math.min((taxaLeadExp / metasKpi.taxa_lead_exp) * 100, 100);
        const status = pct >= 100 ? '✅' : (pct >= 70 ? '⚠️' : '❌');
        relatorioTemplate += `${criarBarraProgresso(pct)} ${pct.toFixed(0)}% Lead→Exp (${taxaLeadExp.toFixed(1).replace('.', ',')}%/${metasKpi.taxa_lead_exp}%) ${status}\n`;
      }
      // Taxa Exp→Mat
      if (metasKpi.taxa_exp_mat) {
        const pct = Math.min((taxaExpMat / metasKpi.taxa_exp_mat) * 100, 100);
        const status = pct >= 100 ? '✅' : (pct >= 70 ? '⚠️' : '❌');
        relatorioTemplate += `${criarBarraProgresso(pct)} ${pct.toFixed(0)}% Exp→Mat (${taxaExpMat.toFixed(1).replace('.', ',')}%/${metasKpi.taxa_exp_mat}%) ${status}\n`;
      }
      // Taxa Conversão Total
      if (metasKpi.taxa_conversao) {
        const pct = Math.min((taxaConversaoGeral / metasKpi.taxa_conversao) * 100, 100);
        const status = pct >= 100 ? '✅' : (pct >= 70 ? '⚠️' : '❌');
        relatorioTemplate += `${criarBarraProgresso(pct)} ${pct.toFixed(0)}% Conversão (${taxaConversaoGeral.toFixed(1).replace('.', ',')}%/${metasKpi.taxa_conversao}%) ${status}\n`;
      }
    } else {
      relatorioTemplate += `• Sem metas cadastradas\n`;
    }
    relatorioTemplate += `\n`;

    // PROGRAMA FIDELIZA+ LA
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `🏆 *PROGRAMA FIDELIZA+ LA*\n`;
    relatorioTemplate += `───────────────────────\n\n`;

    // Churn Premiado (meta: <3%)
    const metaChurnFideliza = 3;
    const pctChurnFideliza = churnRate < metaChurnFideliza ? 100 : Math.max(0, (1 - (churnRate - metaChurnFideliza) / metaChurnFideliza) * 100);
    const statusChurn = churnRate < metaChurnFideliza ? '✅ BATIDA 🎉' : '❌';
    relatorioTemplate += `⭐ *CHURN PREMIADO* (meta: <3%)\n`;
    relatorioTemplate += `${criarBarraProgresso(pctChurnFideliza)} ${churnRate.toFixed(1).replace('.', ',')}% ${statusChurn}\n`;
    relatorioTemplate += `Atual: *${churnRate.toFixed(1).replace('.', ',')}%* | Meta: *<3%*\n\n`;

    // Inadimplência Zero
    const statusInad = inadimplencia === 0 ? '✅ BATIDA 🎉' : '❌';
    const pctInad = inadimplencia === 0 ? 100 : Math.max(0, 100 - inadimplencia * 10);
    relatorioTemplate += `⭐ *INADIMPLÊNCIA ZERO* (meta: 0%)\n`;
    relatorioTemplate += `${criarBarraProgresso(pctInad)} ${inadimplencia.toFixed(1).replace('.', ',')}% ${statusInad}\n`;
    relatorioTemplate += `Atual: *${inadimplencia.toFixed(1).replace('.', ',')}%* | Meta: *0%*\n\n`;

    // Max Renovação
    const statusRenov = taxaRenovacao >= 100 ? '✅ BATIDA 🎉' : (taxaRenovacao >= 90 ? '⚠️' : '❌');
    relatorioTemplate += `⭐ *MAX RENOVAÇÃO* (meta: 100%)\n`;
    relatorioTemplate += `${criarBarraProgresso(taxaRenovacao)} ${taxaRenovacao.toFixed(0)}% ${statusRenov}\n`;
    relatorioTemplate += `Atual: *${taxaRenovacao.toFixed(0)}%* | Meta: *100%*\n\n`;

    // Reajuste Campeão
    const metaReajuste = 8.5;
    const statusReajuste = reajusteMedio > metaReajuste ? '✅ BATIDA 🎉' : '❌';
    const pctReajuste = Math.min((reajusteMedio / metaReajuste) * 100, 100);
    relatorioTemplate += `⭐ *REAJUSTE CAMPEÃO* (meta: >8,5%)\n`;
    relatorioTemplate += `${criarBarraProgresso(pctReajuste)} ${reajusteMedio.toFixed(1).replace('.', ',')}% ${statusReajuste}\n`;
    relatorioTemplate += `Atual: *${reajusteMedio.toFixed(1).replace('.', ',')}%* | Meta: *>8,5%*\n\n`;

    // PROGRAMA MATRICULADOR+ LA
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `🎯 *PROGRAMA MATRICULADOR+ LA*\n`;
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `Hunter: *${hunterNome}*\n\n`;

    // Metas do Matriculador+ variam por unidade
    const metaMatriculaPlus = unidadeNome === 'Campo Grande' ? 21 : (unidadeNome === 'Recreio' ? 17 : 14);
    const metaIndicacao = unidadeNome === 'Campo Grande' ? 5 : (unidadeNome === 'Recreio' ? 4 : 3);
    const metaFamily = 3;

    const pctMatPlus = Math.min((novasMatriculas / metaMatriculaPlus) * 100, 100);
    const statusMatPlus = novasMatriculas >= metaMatriculaPlus ? '✅ BATIDA 🎉' : (pctMatPlus >= 70 ? '⚠️' : '❌');
    relatorioTemplate += `⭐ *MATRÍCULA PLUS* (meta: ${metaMatriculaPlus})\n`;
    relatorioTemplate += `${criarBarraProgresso(pctMatPlus)} ${pctMatPlus.toFixed(0)}% ${statusMatPlus}\n`;
    relatorioTemplate += `Atual: *${novasMatriculas}* | Meta: *${metaMatriculaPlus}*\n\n`;

    const pctInd = Math.min((totalIndicacoes / metaIndicacao) * 100, 100);
    const statusInd = totalIndicacoes >= metaIndicacao ? '✅ BATIDA 🎉' : (pctInd >= 70 ? '⚠️' : '❌');
    relatorioTemplate += `⭐ *MAX INDICAÇÃO* (meta: ${metaIndicacao})\n`;
    relatorioTemplate += `${criarBarraProgresso(pctInd)} ${pctInd.toFixed(0)}% ${statusInd}\n`;
    relatorioTemplate += `Atual: *${totalIndicacoes}* | Meta: *${metaIndicacao}*\n\n`;

    const pctFamily = Math.min((totalFamilyPacotes / metaFamily) * 100, 100);
    const statusFamily = totalFamilyPacotes >= metaFamily ? '✅ BATIDA 🎉' : (pctFamily >= 70 ? '⚠️' : '❌');
    relatorioTemplate += `⭐ *LA MUSIC FAMILY* (meta: ${metaFamily})\n`;
    relatorioTemplate += `${criarBarraProgresso(pctFamily)} ${pctFamily.toFixed(0)}% ${statusFamily}\n`;
    relatorioTemplate += `Atual: *${totalFamilyPacotes}* | Meta: *${metaFamily}*\n\n`;

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
    relatorioTemplate += `🎯 *PLANO DE AÇÃO*\n`;
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `[PLANO_ACAO_IA]\n\n`;

    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `💬 *MENSAGEM FINAL*\n`;
    relatorioTemplate += `───────────────────────\n`;
    relatorioTemplate += `> [MENSAGEM_FINAL_IA]\n\n`;

    const dataHora = new Date();
    relatorioTemplate += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    relatorioTemplate += `📅 Gerado em: ${dataHora.toLocaleDateString('pt-BR')} às ${dataHora.getHours()}:${dataHora.getMinutes().toString().padStart(2, '0')}\n`;
    relatorioTemplate += `━━━━━━━━━━━━━━━━━━━━━━`;

    // ═══════════════════════════════════════════════════════════════
    // CHAMAR IA APENAS PARA INSIGHTS
    // ═══════════════════════════════════════════════════════════════

    const systemPrompt = `Você é um consultor de gestão especializado em escolas de música.
Sua tarefa é analisar os dados e gerar APENAS os insights para um relatório gerencial.

REGRAS:
- Seja direto e objetivo
- Use linguagem profissional mas motivacional
- Considere a sazonalidade (${mesNome} é historicamente um mês de ${churnMedioHistorico ? `churn médio de ${churnMedioHistorico.toFixed(1)}%` : 'transição'})
- Mencione comparativos com mês anterior e ano passado quando relevante
- Use emojis moderadamente
- Cada item deve ter no máximo 1-2 linhas

Responda EXATAMENTE neste formato JSON:
{
  "resumo_executivo": "2-3 linhas de resumo do mês",
  "conquistas": ["conquista 1", "conquista 2", "conquista 3"],
  "pontos_atencao": ["ponto 1", "ponto 2", "ponto 3"],
  "plano_acao": ["ação 1", "ação 2", "ação 3"],
  "mensagem_final": "mensagem motivacional de 2-3 linhas"
}`;

    const dadosParaIA = {
      unidade: unidadeNome,
      mes: mesNome,
      ano: ano,
      gerente: gerenteNome,
      mrr: mrr,
      ticket_medio: ticketMedio,
      inadimplencia: inadimplencia,
      alunos_ativos: totalAtivos,
      alunos_pagantes: totalPagantes,
      novas_matriculas: novasMatriculas,
      permanencia_media: tempoPermanencia,
      ltv_medio: ltvMedio,
      churn_rate: churnRate,
      evasoes: totalEvasoes,
      taxa_renovacao: taxaRenovacao,
      reajuste_medio: reajusteMedio,
      leads: totalLeads,
      experimentais: totalExperimentais,
      taxa_conversao: taxaConversaoGeral,
      top_motivos_evasao: motivosEvasao.slice(0, 3).map((m: any) => m.motivo),
      comparativo_mes_anterior: {
        alunos: alunosMesAnterior,
        churn: churnMesAnterior,
        matriculas: matriculasMesAnterior
      },
      comparativo_ano_passado: {
        alunos: alunosAnoPassado,
        churn: churnAnoPassado,
        matriculas: matriculasAnoPassado
      },
      churn_medio_historico: churnMedioHistorico,
      metas_batidas: {
        churn_premiado: churnRate < 3,
        inadimplencia_zero: inadimplencia === 0,
        max_renovacao: taxaRenovacao >= 100,
        reajuste_campeao: reajusteMedio > 8.5
      }
    };

    const response = await fetch(
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
            maxOutputTokens: 2048,
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
    const iaResponseText = geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!iaResponseText) {
      throw new Error('Resposta vazia da API Gemini');
    }

    // Parsear resposta da IA
    let iaData;
    try {
      // Remover possíveis marcadores de código
      const jsonText = iaResponseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      iaData = JSON.parse(jsonText);
    } catch (e) {
      console.error('Erro ao parsear resposta da IA:', iaResponseText);
      // Fallback com valores padrão
      iaData = {
        resumo_executivo: `${mesNome} apresentou resultados mistos. Análise detalhada nos indicadores abaixo.`,
        conquistas: ['Equipe manteve foco nos objetivos', 'Processos operacionais em dia', 'Base de alunos estável'],
        pontos_atencao: ['Monitorar indicadores de churn', 'Acompanhar funil comercial', 'Revisar estratégias de retenção'],
        plano_acao: ['Intensificar ações de captação', 'Reforçar relacionamento com alunos', 'Acompanhar renovações pendentes'],
        mensagem_final: 'Vamos juntos construir um mês ainda melhor! 🚀🎶'
      };
    }

    // Substituir placeholders no template
    let relatorioFinal = relatorioTemplate
      .replace('[RESUMO_EXECUTIVO_IA]', iaData.resumo_executivo || '')
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
