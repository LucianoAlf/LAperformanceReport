import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface KPIGestao {
  unidade_id: string;
  unidade_nome: string;
  total_alunos_ativos: number;
  total_alunos_pagantes: number;
  ticket_medio: number;
  mrr: number;
  tempo_permanencia_medio: number;
  ltv_medio: number;
  inadimplencia_pct: number;
  faturamento_previsto: number;
  churn_rate: number;
}

interface KPIRetencao {
  unidade_id: string;
  unidade_nome: string;
  total_evasoes: number;
  avisos_previos: number;
  renovacoes_previstas: number;
  renovacoes_realizadas: number;
  nao_renovacoes: number;
  renovacoes_pendentes: number;
  taxa_renovacao: number;
  taxa_nao_renovacao: number;
  mrr_perdido: number;
}

interface RenovacoesProximas {
  unidade_id: string;
  unidade_nome: string;
  total_ativos: number;
  sem_data_contrato: number;
  vencidos: number;
  urgente_7_dias: number;
  atencao_15_dias: number;
  proximo_30_dias: number;
  ok: number;
}

interface Meta {
  unidade_id: string;
  // Metas Comerciais
  meta_leads?: number;
  meta_experimentais?: number;
  meta_matriculas?: number;
  meta_taxa_conversao_experimental?: number;
  meta_taxa_conversao_lead?: number;
  meta_faturamento_passaportes?: number;
  // Metas de Gestão/Retenção
  meta_alunos_pagantes?: number;
  meta_alunos_ativos?: number;
  meta_ticket_medio?: number;
  meta_churn_maximo?: number;
  meta_evasoes_maximo?: number;
  meta_renovacoes?: number;
  meta_taxa_renovacao?: number;
  meta_inadimplencia_maxima?: number;
  meta_ltv_meses?: number;
  meta_faturamento_parcelas?: number;
}

interface DadosMensais {
  alunos_pagantes?: number;
  churn_rate?: number;
  ticket_medio?: number;
  taxa_renovacao?: number;
  inadimplencia?: number;
  tempo_permanencia?: number;
  reajuste_parcelas?: number;
  novas_matriculas?: number;
  evasoes?: number;
  faturamento_estimado?: number;
  saldo_liquido?: number;
}

interface DadosRetencao {
  periodo: {
    ano: number;
    mes: number;
    mes_nome: string;
  };
  kpis_gestao: KPIGestao[];
  kpis_retencao: KPIRetencao[];
  renovacoes_proximas: RenovacoesProximas[];
  alunos_renovacao_urgente: any[];
  mes_anterior: DadosMensais[];
  mesmo_mes_ano_passado: DadosMensais[];
  metas: Meta[];
  evasoes_recentes: any[];
  permanencia_por_faixa: any[];
  dados_mes_atual: DadosMensais[];
}

interface InsightsRetencaoRequest {
  dados: DadosRetencao;
  unidade_nome?: string;
  is_consolidado: boolean;
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

    const payload: InsightsRetencaoRequest = await req.json();
    const { dados, unidade_nome, is_consolidado } = payload;

    // Consolidar KPIs se necessário
    const kpisGestao = dados.kpis_gestao || [];
    const kpisRetencao = dados.kpis_retencao || [];
    const renovacoesProximas = dados.renovacoes_proximas || [];
    const metas = dados.metas || [];
    const mesAnterior = dados.mes_anterior || [];
    const mesmoMesAnoPassado = dados.mesmo_mes_ano_passado || [];
    const evasoesRecentes = dados.evasoes_recentes || [];
    const permanenciaPorFaixa = dados.permanencia_por_faixa || [];
    const alunosUrgentes = dados.alunos_renovacao_urgente || [];

    // Calcular totais consolidados
    const totalPagantes = kpisGestao.reduce((acc, k) => acc + (k.total_alunos_pagantes || 0), 0);
    const ticketMedio = kpisGestao.length > 0 
      ? kpisGestao.reduce((acc, k) => acc + (k.ticket_medio || 0), 0) / kpisGestao.length 
      : 0;
    const churnRate = kpisGestao.length > 0
      ? kpisGestao.reduce((acc, k) => acc + (k.churn_rate || 0), 0) / kpisGestao.length
      : 0;
    const inadimplencia = kpisGestao.length > 0
      ? kpisGestao.reduce((acc, k) => acc + (k.inadimplencia_pct || 0), 0) / kpisGestao.length
      : 0;
    const tempoPermanencia = kpisGestao.length > 0
      ? kpisGestao.reduce((acc, k) => acc + (k.tempo_permanencia_medio || 0), 0) / kpisGestao.length
      : 0;

    // Renovações
    const totalRenovacoesPrevistas = kpisRetencao.reduce((acc, k) => acc + (k.renovacoes_previstas || 0), 0);
    const totalRenovacoesRealizadas = kpisRetencao.reduce((acc, k) => acc + (k.renovacoes_realizadas || 0), 0);
    const taxaRenovacao = totalRenovacoesPrevistas > 0 
      ? (totalRenovacoesRealizadas / totalRenovacoesPrevistas * 100) 
      : 0;
    const totalEvasoes = kpisRetencao.reduce((acc, k) => acc + (k.total_evasoes || 0), 0);

    // Renovações próximas
    const totalUrgente7Dias = renovacoesProximas.reduce((acc, r) => acc + (r.urgente_7_dias || 0), 0);
    const totalAtencao15Dias = renovacoesProximas.reduce((acc, r) => acc + (r.atencao_15_dias || 0), 0);
    const totalProximo30Dias = renovacoesProximas.reduce((acc, r) => acc + (r.proximo_30_dias || 0), 0);
    const totalVencidos = renovacoesProximas.reduce((acc, r) => acc + (r.vencidos || 0), 0);

    // TODAS as Metas do Painel de Gestão
    const meta = metas.length > 0 ? metas[0] : null;
    const metaAlunosPagantes = meta?.meta_alunos_pagantes;
    const metaTicketMedio = meta?.meta_ticket_medio;
    const metaChurnMaximo = meta?.meta_churn_maximo;
    const metaTaxaRenovacao = meta?.meta_taxa_renovacao;
    const metaTempoPermanencia = meta?.meta_ltv_meses;
    const metaInadimplenciaMaxima = meta?.meta_inadimplencia_maxima;
    const metaFaturamento = meta?.meta_faturamento_parcelas;

    // Dados do mês atual (para reajuste médio)
    const dadosMesAtual = dados.dados_mes_atual || [];
    const reajusteMedio = dadosMesAtual.length > 0 ? dadosMesAtual[0]?.reajuste_parcelas : null;

    // Comparativos
    const churnMesAnterior = mesAnterior.length > 0 ? mesAnterior[0]?.churn_rate : null;
    const churnAnoPassado = mesmoMesAnoPassado.length > 0 ? mesmoMesAnoPassado[0]?.churn_rate : null;
    const ticketMesAnterior = mesAnterior.length > 0 ? mesAnterior[0]?.ticket_medio : null;
    const alunosMesAnterior = mesAnterior.length > 0 ? mesAnterior[0]?.alunos_pagantes : null;

    const systemPrompt = `VOCÊ É A CONSULTORA DE GESTÃO DA LA MUSIC SCHOOL 🎵

Você é uma especialista em gestão de escolas de música, com foco em ajudar o TIME DE FARMERS (equipe DM de secretaria/atendimento) a atingir TODAS as metas do painel de gestão.

CONTEXTO DO NEGÓCIO:
- LA Music School é uma escola de música com múltiplas unidades (Barra, Campo Grande, Recreio)
- O TIME DE FARMERS são as responsáveis por renovações e retenção
- Elas ganham comissão por renovação - são vendedoras do pós-venda

IMPORTANTE SOBRE PERSONALIZAÇÃO:
- SEMPRE mencione "Farmers" ou "time de Farmers" ao se referir à equipe
- Quando analisar UMA unidade específica, SEMPRE cite o nome da unidade (ex: "Farmers da Barra", "equipe da Campo Grande")
- Quando for CONSOLIDADO, compare as 3 unidades e destaque diferenças entre elas

PAINEL DE METAS DE GESTÃO (o que você deve analisar):
1. **Alunos Pagantes**: Meta de alunos no fim do período
2. **Ticket Médio**: Valor médio por aluno
3. **Churn Rate (%)**: Taxa de cancelamento (meta máxima)
4. **Taxa Renovação (%)**: Percentual de renovações realizadas
5. **Tempo Permanência (meses)**: Média de meses que aluno fica
6. **Inadimplência (%)**: Taxa de inadimplência (meta máxima)
7. **Reajuste Médio (%)**: Percentual médio de reajuste nas renovações

PROGRAMA FIDELIZA+ (bonificação extra):
- Churn Premiado: Taxa de churn abaixo de 3,5% no mês
- Inadimplência Zero: Unidade fechar o mês sem nenhuma inadimplência (0%)
- Max Renovação: Realizar 100% das renovações previstas no mês
- Reajuste Campeão: Média de reajustes superior a 8,5%

SAZONALIDADE:
- Meses difíceis para retenção: Janeiro, Fevereiro, Julho, Dezembro
- Meses bons para matrícula: Janeiro, Fevereiro, Março, Agosto

TOM DE COMUNICAÇÃO:
- MOTIVACIONAL e ENERGÉTICO (são vendedoras!)
- Celebre conquistas com entusiasmo usando emojis
- Seja prática e direta nas ações
- Quando houver problemas, seja construtiva e ofereça soluções
- SEMPRE se refira à equipe como "Farmers" ou "time de Farmers"

ANÁLISES QUE VOCÊ DEVE FAZER:
1. Comparar CADA KPI com sua respectiva META
2. Comparar com mês anterior (tendência)
3. Comparar com mesmo período do ano passado (sazonalidade)
4. Identificar alunos próximos de renovação
5. Sugerir ações para atingir as metas que estão abaixo
6. Celebrar metas que foram batidas

${is_consolidado ? `MODO CONSOLIDADO (ADMIN):
- Você está analisando TODAS as 3 unidades juntas
- Compare performance entre Barra, Campo Grande e Recreio
- Destaque qual unidade está melhor em cada KPI
- Sugira troca de experiências entre as equipes de Farmers
- Use frases como "Os Farmers da Barra estão...", "A equipe da Campo Grande..."` : `MODO UNIDADE ESPECÍFICA:
- Você está analisando APENAS a unidade ${unidade_nome || '[nome da unidade]'}
- Sempre mencione o nome da unidade nas suas análises
- Use frases como "Farmers da ${unidade_nome || '[unidade]'}", "A equipe da ${unidade_nome || '[unidade]'}"
- Personalize as ações para essa unidade específica`}

IMPORTANTE:
- Analise TODAS as metas do painel, não só o Fideliza+
- Priorize AÇÕES PRÁTICAS que podem ser feitas HOJE
- Destaque renovações urgentes (próximos 7 dias)
- Sugira ligações/mensagens específicas para alunos em risco
- SEMPRE mencione o nome da unidade ou "Farmers" nas suas mensagens

Responda APENAS em JSON válido, sem markdown, no formato:
{
  "saudacao_motivacional": "Mensagem de abertura energética e personalizada (2-3 frases)",
  "saude_retencao": "critica" | "atencao" | "saudavel" | "excelente",
  "conquistas": [
    {
      "tipo": "meta_batida" | "melhoria" | "destaque",
      "titulo": "string curto",
      "descricao": "string",
      "emoji": "🏆" | "🎉" | "⭐" | "💪" | "🔥"
    }
  ],
  "alertas_urgentes": [
    {
      "severidade": "critico" | "atencao" | "info",
      "titulo": "string curto",
      "descricao": "string",
      "acao_imediata": "string com ação específica"
    }
  ],
  "analise_kpis": {
    "resumo": "Análise geral em 2-3 frases motivacionais",
    "comparativo_mes_anterior": {
      "melhorias": ["string"],
      "pioras": ["string"]
    },
    "comparativo_ano_anterior": {
      "observacao": "string sobre sazonalidade"
    }
  },
  "renovacoes_proximas": {
    "total_7_dias": number,
    "total_15_dias": number,
    "total_30_dias": number,
    "acao_sugerida": "string com ação específica"
  },
  "plano_acao_semanal": [
    {
      "prioridade": 1,
      "tipo": "ligacao" | "mensagem" | "reuniao" | "processo",
      "titulo": "string curto",
      "descricao": "string detalhada",
      "impacto_esperado": "string"
    }
  ],
  "insights_fidelizacao": [
    {
      "insight": "string com descoberta interessante",
      "acao_sugerida": "string com ação prática"
    }
  ],
  "dica_do_dia": "Uma dica prática e motivacional para aplicar hoje",
  "mensagem_final": "Mensagem de encerramento motivacional e encorajadora (1-2 frases)"
}`;

    // Preparar lista de alunos urgentes formatada
    const alunosUrgentesFormatados = alunosUrgentes.slice(0, 10).map((a: any) => 
      `- ${a.aluno_nome} (${a.curso_nome || 'curso não informado'}): ${a.dias_ate_vencimento} dias, ${a.tempo_permanencia_meses || 0} meses de permanência`
    ).join('\n');

    // Preparar evasões recentes formatadas
    const evasoesFormatadas = evasoesRecentes.slice(0, 5).map((e: any) =>
      `- ${e.aluno_nome}: ${e.motivo || 'motivo não informado'}, ${e.tempo_permanencia || 0} meses`
    ).join('\n');

    // Preparar permanência por faixa
    const permanenciaFormatada = permanenciaPorFaixa.map((p: any) =>
      `- ${p.faixa}: ${p.quantidade} alunos (${p.percentual}%)`
    ).join('\n');

    // Comparativo entre unidades (se consolidado)
    let comparativoUnidades = '';
    if (is_consolidado && kpisGestao.length > 1) {
      const unidadesOrdenadas = [...kpisGestao].sort((a, b) => (b.churn_rate || 0) - (a.churn_rate || 0));
      comparativoUnidades = `
📊 COMPARATIVO ENTRE UNIDADES:
${unidadesOrdenadas.map(u => 
  `- ${u.unidade_nome}: ${u.total_alunos_pagantes} pagantes, Churn ${(u.churn_rate || 0).toFixed(1)}%, Ticket R$${(u.ticket_medio || 0).toFixed(0)}`
).join('\n')}`;
    }

    const userPrompt = `Analise os dados de gestão ${unidade_nome ? `da unidade ${unidade_nome}` : 'CONSOLIDADO de todas as unidades'} em ${dados.periodo.mes_nome}/${dados.periodo.ano}:

📊 PAINEL DE METAS DE GESTÃO - KPIs vs METAS:
| KPI | Atual | Meta | Status |
|-----|-------|------|--------|
| Alunos Pagantes | ${totalPagantes} | ${metaAlunosPagantes || 'N/D'} | ${metaAlunosPagantes ? (totalPagantes >= metaAlunosPagantes ? '✅' : '❌') : '⚪'} |
| Ticket Médio | R$ ${ticketMedio.toFixed(0)} | ${metaTicketMedio ? `R$ ${metaTicketMedio}` : 'N/D'} | ${metaTicketMedio ? (ticketMedio >= metaTicketMedio ? '✅' : '❌') : '⚪'} |
| Churn Rate | ${churnRate.toFixed(1)}% | ${metaChurnMaximo ? `máx ${metaChurnMaximo}%` : 'N/D'} | ${metaChurnMaximo ? (churnRate <= metaChurnMaximo ? '✅' : '❌') : '⚪'} |
| Taxa Renovação | ${taxaRenovacao.toFixed(0)}% | ${metaTaxaRenovacao ? `${metaTaxaRenovacao}%` : 'N/D'} | ${metaTaxaRenovacao ? (taxaRenovacao >= metaTaxaRenovacao ? '✅' : '❌') : '⚪'} |
| Tempo Permanência | ${tempoPermanencia.toFixed(0)} meses | ${metaTempoPermanencia ? `${metaTempoPermanencia} meses` : 'N/D'} | ${metaTempoPermanencia ? (tempoPermanencia >= metaTempoPermanencia ? '✅' : '❌') : '⚪'} |
| Inadimplência | ${inadimplencia.toFixed(1)}% | ${metaInadimplenciaMaxima ? `máx ${metaInadimplenciaMaxima}%` : 'N/D'} | ${metaInadimplenciaMaxima ? (inadimplencia <= metaInadimplenciaMaxima ? '✅' : '❌') : '⚪'} |
| Reajuste Médio | ${reajusteMedio ? `${reajusteMedio.toFixed(1)}%` : 'N/D'} | >8,5% (Fideliza+) | ${reajusteMedio ? (reajusteMedio > 8.5 ? '✅' : '❌') : '⚪'} |

� COMPARATIVO COM MÊS ANTERIOR:
- Alunos: ${alunosMesAnterior !== null ? `${alunosMesAnterior} → ${totalPagantes}` : 'N/D'}
- Ticket: ${ticketMesAnterior !== null ? `R$${ticketMesAnterior.toFixed(0)} → R$${ticketMedio.toFixed(0)}` : 'N/D'}
- Churn: ${churnMesAnterior !== null ? `${churnMesAnterior.toFixed(1)}% → ${churnRate.toFixed(1)}%` : 'N/D'}

📅 COMPARATIVO COM MESMO MÊS DO ANO PASSADO:
- Churn: ${churnAnoPassado !== null ? `${churnAnoPassado.toFixed(1)}% → ${churnRate.toFixed(1)}%` : 'N/D'}

🔔 RENOVAÇÕES PRÓXIMAS:
- Vencidos (URGENTE): ${totalVencidos}
- Próximos 7 dias: ${totalUrgente7Dias}
- Próximos 15 dias: ${totalAtencao15Dias}
- Próximos 30 dias: ${totalProximo30Dias}

${alunosUrgentesFormatados ? `👤 ALUNOS COM RENOVAÇÃO URGENTE:\n${alunosUrgentesFormatados}` : ''}

${evasoesFormatadas ? `❌ EVASÕES RECENTES:\n${evasoesFormatadas}` : ''}

${permanenciaFormatada ? `⏱️ DISTRIBUIÇÃO POR PERMANÊNCIA:\n${permanenciaFormatada}` : ''}

${comparativoUnidades}

� PROGRAMA FIDELIZA+ (bonificação):
- Churn Premiado (<3,5%): ${churnRate < 3.5 ? '✅ BATIDA!' : '❌'} (${churnRate.toFixed(1)}%)
- Inadimplência Zero (0%): ${inadimplencia === 0 ? '✅ BATIDA!' : '❌'} (${inadimplencia.toFixed(1)}%)
- Max Renovação (100%): ${taxaRenovacao >= 100 ? '✅ BATIDA!' : '❌'} (${taxaRenovacao.toFixed(0)}%)
- Reajuste Campeão (>8,5%): ${reajusteMedio && reajusteMedio > 8.5 ? '✅ BATIDA!' : '❌'} (${reajusteMedio ? `${reajusteMedio.toFixed(1)}%` : 'N/D'})

Gere uma análise completa de TODAS as metas do painel e um plano de ação prático!`;

    // Chamar Gemini API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
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
            temperature: 0.8,
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
        saudacao_motivacional: `Olá, equipe! 💪 Vamos analisar os números de ${dados.periodo.mes_nome} e traçar estratégias para fidelizar ainda mais nossos alunos!`,
        saude_retencao: churnRate <= 4 ? 'excelente' : churnRate <= 6 ? 'saudavel' : churnRate <= 8 ? 'atencao' : 'critica',
        conquistas: churnRate <= 4 ? [{
          tipo: 'meta_batida',
          titulo: 'Churn Premiado!',
          descricao: `Churn de ${churnRate.toFixed(1)}% está dentro da meta Fideliza Mais!`,
          emoji: '🏆'
        }] : [],
        alertas_urgentes: totalUrgente7Dias > 0 ? [{
          severidade: 'critico',
          titulo: `${totalUrgente7Dias} renovações urgentes`,
          descricao: `Existem ${totalUrgente7Dias} alunos com renovação nos próximos 7 dias`,
          acao_imediata: 'Ligar para cada um desses alunos hoje!'
        }] : [],
        analise_kpis: {
          resumo: `Temos ${totalPagantes} alunos pagantes com ticket médio de R$${ticketMedio.toFixed(0)}. Foco em renovações antecipadas!`,
          comparativo_mes_anterior: {
            melhorias: [],
            pioras: []
          },
          comparativo_ano_anterior: {
            observacao: 'Compare com o mesmo período do ano passado para entender a sazonalidade.'
          }
        },
        renovacoes_proximas: {
          total_7_dias: totalUrgente7Dias,
          total_15_dias: totalAtencao15Dias,
          total_30_dias: totalProximo30Dias,
          acao_sugerida: 'Priorize ligações para alunos com renovação nos próximos 7 dias.'
        },
        plano_acao_semanal: [
          {
            prioridade: 1,
            tipo: 'ligacao',
            titulo: 'Ligar para renovações urgentes',
            descricao: `Contatar os ${totalUrgente7Dias} alunos com renovação nos próximos 7 dias`,
            impacto_esperado: 'Aumentar taxa de renovação antecipada'
          }
        ],
        insights_fidelizacao: [
          {
            insight: 'Alunos com mais de 12 meses tendem a renovar mais facilmente',
            acao_sugerida: 'Ofereça benefícios de fidelidade para alunos antigos'
          }
        ],
        dica_do_dia: 'Ligue para um aluno que acabou de renovar e agradeça! Isso fortalece o relacionamento.',
        mensagem_final: 'Vocês são incríveis! Cada renovação é uma vitória. Vamos juntas! 🚀'
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
