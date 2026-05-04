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


// Mapeamento de UUIDs para nomes de unidades (UUIDs reais do banco)
const UUID_NOME_MAP: Record<string, string> = {
  "2ec861f6-023f-4d7b-9927-3960ad8c2a92": "Campo Grande",
  "95553e96-971b-4590-a6eb-0201d013c14d": "Recreio",
  "368d47f5-2d88-4475-bc14-ba084a9a348e": "Barra",
};

// Mapeamento de Farmers (duplas) por unidade
const FARMERS_MAP: Record<string, { dupla: Array<{ nome: string; apelido: string }> }> = {
  "2ec861f6-023f-4d7b-9927-3960ad8c2a92": { // Campo Grande
    dupla: [
      { nome: "Gabriela", apelido: "Gabi" },
      { nome: "Jhonatan", apelido: "Jhon" }
    ]
  },
  "95553e96-971b-4590-a6eb-0201d013c14d": { // Recreio
    dupla: [
      { nome: "Fernanda", apelido: "Fefê" },
      { nome: "Daiana", apelido: "Dai" }
    ]
  },
  "368d47f5-2d88-4475-bc14-ba084a9a348e": { // Barra
    dupla: [
      { nome: "Eduarda", apelido: "Duda" },
      { nome: "Arthur", apelido: "Arthur" }
    ]
  },
};

// Programa Fideliza+ LA - Metas (conforme banco programa_fideliza_config)
// Sistema de pontuação TRIMESTRAL com 5 critérios (100 pts base)
// Período: TRIMESTRAL (avaliação a cada 3 meses)
const FIDELIZA_PLUS_METAS = {
  churn_maximo: 4, // Taxa de churn ≤ 4% → 25 pts
  inadimplencia_maxima: 1, // Inadimplência ≤ 1% → 20 pts
  renovacao_minima: 90, // Taxa renovação ≥ 90% → 25 pts
  reajuste_minimo: 7, // Reajuste médio ≥ 7% → 15 pts
  // Lojinha: CG R$5.000 / BR+RC R$3.000 → 15 pts (verificado por unidade)
};

// Metas de Lojinha por unidade (trimestral)
const METAS_LOJINHA: Record<string, number> = {
  "2ec861f6-023f-4d7b-9927-3960ad8c2a92": 5000, // Campo Grande
  "95553e96-971b-4590-a6eb-0201d013c14d": 3000, // Recreio
  "368d47f5-2d88-4475-bc14-ba084a9a348e": 3000, // Barra
};

// Função para obter info das outras duplas de Farmers (concorrentes)
function getOutrosFarmers(unidadeId: string): Array<{ nomes: string; apelidos: string; unidade: string }> {
  const outros: Array<{ nomes: string; apelidos: string; unidade: string }> = [];
  for (const [uuid, farmers] of Object.entries(FARMERS_MAP)) {
    if (uuid !== unidadeId) {
      const nomes = farmers.dupla.map(f => f.nome).join(" e ");
      const apelidos = farmers.dupla.map(f => f.apelido).join(" e ");
      outros.push({
        nomes,
        apelidos,
        unidade: UUID_NOME_MAP[uuid] || "Outra unidade",
      });
    }
  }
  return outros;
}

// Função para formatar nomes da dupla
function formatarDupla(dupla: Array<{ nome: string; apelido: string }>): { nomes: string; apelidos: string } {
  return {
    nomes: dupla.map(f => f.nome).join(" e "),
    apelidos: dupla.map(f => f.apelido).join(" e "),
  };
}

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
  meta_leads?: number;
  meta_experimentais?: number;
  meta_matriculas?: number;
  meta_taxa_conversao_experimental?: number;
  meta_taxa_conversao_lead?: number;
  meta_faturamento_passaportes?: number;
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

    const kpisGestao = dados.kpis_gestao || [];
    const kpisRetencao = dados.kpis_retencao || [];
    const renovacoesProximas = dados.renovacoes_proximas || [];
    const metas = dados.metas || [];
    const mesAnterior = dados.mes_anterior || [];
    const mesmoMesAnoPassado = dados.mesmo_mes_ano_passado || [];
    const evasoesRecentes = dados.evasoes_recentes || [];
    const permanenciaPorFaixa = dados.permanencia_por_faixa || [];
    const alunosUrgentes = dados.alunos_renovacao_urgente || [];

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

    const totalRenovacoesPrevistas = kpisRetencao.reduce((acc, k) => acc + (k.renovacoes_previstas || 0), 0);
    const totalRenovacoesRealizadas = kpisRetencao.reduce((acc, k) => acc + (k.renovacoes_realizadas || 0), 0);
    const taxaRenovacao = totalRenovacoesPrevistas > 0 
      ? (totalRenovacoesRealizadas / totalRenovacoesPrevistas * 100) 
      : 0;
    const totalEvasoes = kpisRetencao.reduce((acc, k) => acc + (k.total_evasoes || 0), 0);

    const totalUrgente7Dias = renovacoesProximas.reduce((acc, r) => acc + (r.urgente_7_dias || 0), 0);
    const totalAtencao15Dias = renovacoesProximas.reduce((acc, r) => acc + (r.atencao_15_dias || 0), 0);
    const totalProximo30Dias = renovacoesProximas.reduce((acc, r) => acc + (r.proximo_30_dias || 0), 0);
    const totalVencidos = renovacoesProximas.reduce((acc, r) => acc + (r.vencidos || 0), 0);

    const meta = metas.length > 0 ? metas[0] : null;
    const metaAlunosPagantes = meta?.meta_alunos_pagantes;
    const metaTicketMedio = meta?.meta_ticket_medio;
    const metaChurnMaximo = meta?.meta_churn_maximo;
    const metaTaxaRenovacao = meta?.meta_taxa_renovacao;
    const metaTempoPermanencia = meta?.meta_ltv_meses;
    const metaInadimplenciaMaxima = meta?.meta_inadimplencia_maxima;
    const metaFaturamento = meta?.meta_faturamento_parcelas;

    const dadosMesAtual = dados.dados_mes_atual || [];
    const reajusteMedio = dadosMesAtual.length > 0 ? dadosMesAtual[0]?.reajuste_parcelas : null;

    const churnMesAnterior = mesAnterior.length > 0 ? mesAnterior[0]?.churn_rate : null;
    const churnAnoPassado = mesmoMesAnoPassado.length > 0 ? mesmoMesAnoPassado[0]?.churn_rate : null;
    const ticketMesAnterior = mesAnterior.length > 0 ? mesAnterior[0]?.ticket_medio : null;
    const alunosMesAnterior = mesAnterior.length > 0 ? mesAnterior[0]?.alunos_pagantes : null;
    
    // Dados do ano passado para sazonalidade
    const alunosAnoPassado = mesmoMesAnoPassado.length > 0 ? mesmoMesAnoPassado[0]?.alunos_pagantes : null;
    const ticketAnoPassado = mesmoMesAnoPassado.length > 0 ? mesmoMesAnoPassado[0]?.ticket_medio : null;

    // Análise dinâmica por dia do mês
    const hoje = new Date();
    const diaAtual = hoje.getDate();
    const diasNoMes = new Date(dados.periodo.ano, dados.periodo.mes, 0).getDate();
    const diasRestantes = diasNoMes - diaAtual;
    const percentualMesDecorrido = Math.round((diaAtual / diasNoMes) * 100);
    
    // Projeções baseadas no ritmo atual
    const faltamParaMetaAlunos = metaAlunosPagantes ? metaAlunosPagantes - totalPagantes : null;
    const faltamParaMetaRenovacoes = totalRenovacoesPrevistas - totalRenovacoesRealizadas;
    const ritmoRenovacoesDia = diaAtual > 0 ? totalRenovacoesRealizadas / diaAtual : 0;
    const projecaoRenovacoesFimMes = Math.round(ritmoRenovacoesDia * diasNoMes);
    const renovacoesPorDiaNecessarias = diasRestantes > 0 ? Math.ceil(faltamParaMetaRenovacoes / diasRestantes) : 0;
    
    // Variação vs ano passado (sazonalidade)
    const variacaoAlunosAnoPassado = alunosAnoPassado ? ((totalPagantes - alunosAnoPassado) / alunosAnoPassado * 100) : null;
    const variacaoTicketAnoPassado = ticketAnoPassado ? ((ticketMedio - ticketAnoPassado) / ticketAnoPassado * 100) : null;
    const variacaoChurnAnoPassado = churnAnoPassado !== null ? (churnRate - churnAnoPassado) : null;

    // Identificar unidade e Farmers
    const unidadeId = kpisGestao.length === 1 ? kpisGestao[0]?.unidade_id : null;
    const nomeUnidadeFinal = unidade_nome || (kpisGestao.length === 1 ? kpisGestao[0]?.unidade_nome : undefined);
    const farmers = unidadeId ? FARMERS_MAP[unidadeId] : null;
    const duplaFormatada = farmers ? formatarDupla(farmers.dupla) : null;
    const outrosFarmers = unidadeId ? getOutrosFarmers(unidadeId) : [];

    // Meta de Lojinha específica da unidade
    const metaLojinhaUnidade = unidadeId ? METAS_LOJINHA[unidadeId] || 3000 : 3000;

    // Calcular progresso no Fideliza+ LA (5 critérios conforme banco)
    const progressoFidelizaPlus = {
      churn_premiado: {
        atual: churnRate,
        meta: FIDELIZA_PLUS_METAS.churn_maximo,
        conquistou: churnRate <= FIDELIZA_PLUS_METAS.churn_maximo,
        pontos: 25,
      },
      inadimplencia_zero: {
        atual: inadimplencia,
        meta: FIDELIZA_PLUS_METAS.inadimplencia_maxima,
        conquistou: inadimplencia <= FIDELIZA_PLUS_METAS.inadimplencia_maxima,
        pontos: 20,
      },
      max_renovacao: {
        atual: taxaRenovacao,
        meta: FIDELIZA_PLUS_METAS.renovacao_minima,
        conquistou: taxaRenovacao >= FIDELIZA_PLUS_METAS.renovacao_minima,
        pontos: 25,
      },
      reajuste_campeao: {
        atual: reajusteMedio,
        meta: FIDELIZA_PLUS_METAS.reajuste_minimo,
        conquistou: reajusteMedio !== null && reajusteMedio >= FIDELIZA_PLUS_METAS.reajuste_minimo,
        pontos: 15,
      },
      mestres_lojinha: {
        atual: 0, // Será preenchido com dados reais quando disponível
        meta: metaLojinhaUnidade,
        conquistou: false, // Será calculado com dados reais
        pontos: 15,
      },
    };

    // Contar critérios batidos (5 critérios no total)
    const criteriosBatidos = [
      progressoFidelizaPlus.churn_premiado.conquistou,
      progressoFidelizaPlus.inadimplencia_zero.conquistou,
      progressoFidelizaPlus.max_renovacao.conquistou,
      progressoFidelizaPlus.reajuste_campeao.conquistou,
      progressoFidelizaPlus.mestres_lojinha.conquistou,
    ].filter(Boolean).length;

    // Calcular pontuação total
    const pontuacaoTotal = 
      (progressoFidelizaPlus.churn_premiado.conquistou ? 25 : 0) +
      (progressoFidelizaPlus.inadimplencia_zero.conquistou ? 20 : 0) +
      (progressoFidelizaPlus.max_renovacao.conquistou ? 25 : 0) +
      (progressoFidelizaPlus.reajuste_campeao.conquistou ? 15 : 0) +
      (progressoFidelizaPlus.mestres_lojinha.conquistou ? 15 : 0);

    // Manter compatibilidade com código antigo (4 estrelas principais)
    const estrelasConquistadas = [
      progressoFidelizaPlus.churn_premiado.conquistou,
      progressoFidelizaPlus.inadimplencia_zero.conquistou,
      progressoFidelizaPlus.max_renovacao.conquistou,
      progressoFidelizaPlus.reajuste_campeao.conquistou,
    ].filter(Boolean).length;

    // Montar contexto competitivo para provocações
    let contextoCompetitivo = "";
    if (!is_consolidado && outrosFarmers.length > 0) {
      contextoCompetitivo = `
## SEUS CONCORRENTES NO FIDELIZA+ LA:
${outrosFarmers.map(f => `- ${f.apelidos} (${f.unidade})`).join("\n")}

Use os nomes/apelidos deles para criar provocações saudáveis e competitivas!
Exemplos de provocações:
- "Será que a ${outrosFarmers[0]?.apelidos} vai deixar vocês passarem?"
- "A dupla da ${outrosFarmers[1]?.unidade || outrosFarmers[0]?.unidade} tá voando, hein!"
- "Quem vai levar o Fideliza+ LA esse mês?"
- "Imagina a experiência que vocês vão curtir quando baterem todas as estrelas!"
`;
    }

    // System Prompt personalizado
    const systemPrompt = is_consolidado
      ? `Você é uma consultora de gestão ENERGÉTICA e ESTRATÉGICA para escolas de música, analisando dados CONSOLIDADOS de todas as unidades.
Seu papel é fornecer uma visão gerencial comparativa entre as unidades e seus times de Farmers.

CONTEXTO DO NEGÓCIO:
- LA Music é um grupo de escolas de música com 3 unidades no Rio de Janeiro: Barra, Campo Grande e Recreio
- O TIME DE FARMERS são os responsáveis por renovações, retenção e relacionamento com alunos
- Eles ganham comissão por renovação e estrelas no programa Fideliza+ LA que geram experiências culinárias, culturais, passeios, cinema, troféus, 14º salário e VR por 6 meses!

FARMERS POR UNIDADE:
- Campo Grande: Gabi e Jhon
- Recreio: Fefê e Dai
- Barra: Duda e Arthur

IMPORTANTE:
- Você está falando com o ADMINISTRADOR (visão geral)
- Compare o desempenho entre as unidades e duplas de Farmers
- Identifique qual dupla está performando melhor
- Sugira ações para equilibrar os resultados
- Mencione os nomes dos Farmers ao comparar

Tom: Profissional, analítico, estratégico, mas celebrando conquistas!`
      : `Você é uma coach de retenção ENERGÉTICA e PROVOCADORA para Farmers de uma escola de música!
Você está falando diretamente com ${duplaFormatada?.nomes || "a equipe"} (pode chamar de ${duplaFormatada?.apelidos || "pessoal"}), Farmers da unidade ${nomeUnidadeFinal}.

PERSONALIDADE:
- Chame pelos NOMES diretamente: "${duplaFormatada?.apelidos || "Pessoal"}, e aí?!" (NUNCA "Farmers da ${nomeUnidadeFinal}")
- Seja DESAFIADORA e COMPETITIVA - são vendedoras do pós-venda!
- Use provocações saudáveis mencionando as outras duplas de Farmers
- Fale sobre as EXPERIÊNCIAS e PRÊMIOS do Fideliza+ LA
- Seja direta, energética, use emojis com moderação
- Crie URGÊNCIA mas com bom humor

${contextoCompetitivo}

CONTEXTO DO NEGÓCIO:
- LA Music é um grupo de escolas de música com 3 unidades no Rio de Janeiro
- Farmers são responsáveis por renovações, retenção e relacionamento com alunos
- Ganham comissão por renovação - são vendedoras do pós-venda!

PAINEL DE METAS DE GESTÃO (o que você deve analisar):
1. **Alunos Pagantes**: Meta de alunos no fim do período
2. **Ticket Médio**: Valor médio por aluno
3. **Churn Rate (%)**: Taxa de cancelamento (meta máxima anual: 4%)
4. **Taxa Renovação (%)**: Percentual de renovações realizadas
5. **Tempo Permanência (meses)**: Média de meses que aluno fica
6. **Inadimplência (%)**: Taxa de inadimplência (meta máxima)
7. **Reajuste Médio (%)**: Percentual médio de reajuste nas renovações

## PROGRAMA FIDELIZA+ LA (TRIMESTRAL - 5 CRITÉRIOS - 100 pts):
Período de avaliação: TRIMESTRAL
Para ${duplaFormatada?.nomes || "a dupla"} conquistar pontos este trimestre:
⭐ Churn Premiado (25 pts): Taxa de churn ≤ ${FIDELIZA_PLUS_METAS.churn_maximo}%
⭐ Inadimplência 1% (20 pts): Inadimplência ≤ ${FIDELIZA_PLUS_METAS.inadimplencia_maxima}%
⭐ Max Renovação (25 pts): Taxa de renovação ≥ ${FIDELIZA_PLUS_METAS.renovacao_minima}%
⭐ Reajuste Campeão (15 pts): Média de reajustes ≥ ${FIDELIZA_PLUS_METAS.reajuste_minimo}%
🛒 Mestres da Lojinha (15 pts): Vendas ≥ R$ ${metaLojinhaUnidade.toLocaleString('pt-BR')}

PRÊMIOS: Experiências culinárias, culturais, passeios, cinema, troféus! 
GANHADOR DO ANO: 14º Salário + VR por 6 meses! 🏆
Provoque: "Qual experiência vocês vão curtir esse mês?"

SAZONALIDADE:
- Meses difíceis para retenção: Janeiro, Fevereiro, Julho, Dezembro
- Meses bons para matrícula: Janeiro, Fevereiro, Março, Agosto

REGRAS DE OURO:
1. SEMPRE chame pelos nomes/apelidos no início
2. Mencione os concorrentes para criar competitividade
3. Fale do Fideliza+ LA e das experiências/prêmios
4. Seja provocadora mas respeitosa
5. Crie senso de urgência com renovações pendentes
6. Celebre conquistas mas sempre desafie para mais`;

    const jsonFormat = `
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
  "painel_metas": {
    "resumo_geral": "Análise geral do desempenho vs metas em 2-3 frases",
    "metas_batidas": number,
    "metas_total": number,
    "kpis": [
      {
        "nome": "Alunos Pagantes" | "Ticket Médio" | "Churn Rate" | "Taxa Renovação" | "Tempo Permanência" | "Inadimplência" | "Reajuste Médio",
        "atual": number,
        "meta": number | null,
        "status": "bateu" | "proximo" | "longe" | "sem_meta",
        "variacao_mes_anterior": number | null,
        "analise": "Análise curta e provocadora do KPI",
        "acao_sugerida": "O que fazer para melhorar ou manter"
      }
    ]
  },
  "analise_temporal": {
    "dia_atual": number,
    "dias_no_mes": number,
    "percentual_decorrido": number,
    "dias_restantes": number,
    "ritmo_atual": "Descrição do ritmo atual de renovações",
    "projecao_fim_mes": "Projeção de como vai fechar o mês no ritmo atual",
    "urgencia": "baixa" | "media" | "alta" | "critica",
    "mensagem_motivacional": "Mensagem baseada no momento do mês (início, meio, fim)"
  },
  "sazonalidade": {
    "comparativo_ano_anterior": "Análise comparando com mesmo mês do ano passado",
    "tendencia": "melhor" | "igual" | "pior",
    "variacao_alunos_pct": number | null,
    "variacao_ticket_pct": number | null,
    "variacao_churn_pp": number | null,
    "insight_sazonal": "Insight sobre o comportamento sazonal deste mês"
  },
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
    "total_vencidos": number,
    "total_7_dias": number,
    "total_15_dias": number,
    "total_30_dias": number,
    "acao_sugerida": "string com ação específica",
    "script_ligacao": "Sugestão de script para ligar para alunos com renovação próxima"
  },
  "evasoes_analise": {
    "total_recente": number,
    "principais_motivos": ["string"],
    "perfil_risco": "Descrição do perfil de aluno com maior risco de evasão",
    "acao_preventiva": "O que fazer para prevenir novas evasões"
  },
  "permanencia_analise": {
    "faixa_critica": "Qual faixa de permanência tem mais risco",
    "quantidade_risco": number,
    "estrategia": "Estratégia para reter alunos nessa faixa"
  },
  "plano_acao_semanal": [
    {
      "prioridade": 1,
      "tipo": "ligacao" | "mensagem" | "reuniao" | "processo",
      "titulo": "string curto",
      "descricao": "string detalhada",
      "impacto_esperado": "string",
      "meta_quantitativa": "Ex: 5 ligações, 10 mensagens"
    }
  ],
  "insights_fidelizacao": [
    {
      "insight": "string com descoberta interessante",
      "acao_sugerida": "string com ação prática"
    }
  ],
  "competitividade": {
    "provocacao": "Provocação mencionando as outras duplas de Farmers",
    "desafio": "Desafio direto para a dupla",
    "ranking_estimado": "Onde a dupla está no ranking do Fideliza+"
  },
  "fideliza_plus": {
    "estrelas_conquistadas": number,
    "estrelas_possiveis": 4,
    "detalhamento": [
      {
        "estrela": "Churn Premiado" | "Inadimplência 1%" | "Max Renovação" | "Reajuste Campeão",
        "status": "conquistada" | "proxima" | "longe",
        "atual": number,
        "meta": number,
        "falta": "O que falta para conquistar"
      }
    ],
    "proxima_estrela": "Qual estrela está mais perto de conquistar",
    "dica_experiencia": "Provocação sobre a experiência/prêmio"
  },
  "dica_do_dia": "Uma dica prática e motivacional para aplicar hoje",
  "mensagem_final": "Mensagem de encerramento motivacional e encorajadora chamando pelos nomes (1-2 frases)"
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

    const userPrompt = `# DADOS DE GESTÃO - ${nomeUnidadeFinal ? nomeUnidadeFinal.toUpperCase() : 'CONSOLIDADO'} - ${dados.periodo.mes_nome}/${dados.periodo.ano}
${!is_consolidado && duplaFormatada ? `## FARMERS: ${duplaFormatada.nomes} (${duplaFormatada.apelidos})` : '## VISÃO CONSOLIDADA (ADMINISTRADOR)'}

📊 PAINEL DE METAS DE GESTÃO - KPIs vs METAS:
| KPI | Atual | Meta | Status |
|-----|-------|------|--------|
| Alunos Pagantes | ${totalPagantes} | ${metaAlunosPagantes || 'N/D'} | ${metaAlunosPagantes ? (totalPagantes >= metaAlunosPagantes ? '✅' : '❌') : '⚪'} |
| Ticket Médio | R$ ${ticketMedio.toFixed(0)} | ${metaTicketMedio ? `R$ ${metaTicketMedio}` : 'N/D'} | ${metaTicketMedio ? (ticketMedio >= metaTicketMedio ? '✅' : '❌') : '⚪'} |
| Churn Rate | ${churnRate.toFixed(1)}% | ${metaChurnMaximo ? `máx ${metaChurnMaximo}%` : 'N/D'} | ${metaChurnMaximo ? (churnRate <= metaChurnMaximo ? '✅' : '❌') : '⚪'} |
| Taxa Renovação | ${taxaRenovacao.toFixed(0)}% | ${metaTaxaRenovacao ? `${metaTaxaRenovacao}%` : 'N/D'} | ${metaTaxaRenovacao ? (taxaRenovacao >= metaTaxaRenovacao ? '✅' : '❌') : '⚪'} |
| Tempo Permanência | ${tempoPermanencia.toFixed(0)} meses | ${metaTempoPermanencia ? `${metaTempoPermanencia} meses` : 'N/D'} | ${metaTempoPermanencia ? (tempoPermanencia >= metaTempoPermanencia ? '✅' : '❌') : '⚪'} |
| Inadimplência | ${inadimplencia.toFixed(1)}% | ${metaInadimplenciaMaxima ? `máx ${metaInadimplenciaMaxima}%` : 'N/D'} | ${metaInadimplenciaMaxima ? (inadimplencia <= metaInadimplenciaMaxima ? '✅' : '❌') : '⚪'} |
| Reajuste Médio | ${reajusteMedio ? `${reajusteMedio.toFixed(1)}%` : 'N/D'} | ≥${FIDELIZA_PLUS_METAS.reajuste_minimo}% (Fideliza+) | ${reajusteMedio ? (reajusteMedio >= FIDELIZA_PLUS_METAS.reajuste_minimo ? '✅' : '❌') : '⚪'} |

📅 ANÁLISE TEMPORAL - DIA ${diaAtual}/${diasNoMes} (${percentualMesDecorrido}% do mês):
- Dias restantes: ${diasRestantes}
- Renovações realizadas: ${totalRenovacoesRealizadas}/${totalRenovacoesPrevistas}
- Faltam: ${faltamParaMetaRenovacoes} renovações
- Ritmo atual: ${ritmoRenovacoesDia.toFixed(1)} renovações/dia
- Projeção fim do mês: ${projecaoRenovacoesFimMes} renovações
- Necessário para bater meta: ${renovacoesPorDiaNecessarias} renovações/dia
${faltamParaMetaAlunos !== null ? `- Faltam ${faltamParaMetaAlunos} alunos para meta de ${metaAlunosPagantes}` : ''}

📈 COMPARATIVO COM MÊS ANTERIOR:
- Alunos: ${alunosMesAnterior !== null ? `${alunosMesAnterior} → ${totalPagantes} (${alunosMesAnterior < totalPagantes ? '+' : ''}${totalPagantes - alunosMesAnterior})` : 'N/D'}
- Ticket: ${ticketMesAnterior !== null ? `R$${ticketMesAnterior.toFixed(0)} → R$${ticketMedio.toFixed(0)} (${ticketMesAnterior < ticketMedio ? '+' : ''}${(ticketMedio - ticketMesAnterior).toFixed(0)})` : 'N/D'}
- Churn: ${churnMesAnterior !== null ? `${churnMesAnterior.toFixed(1)}% → ${churnRate.toFixed(1)}% (${churnMesAnterior > churnRate ? '✅ melhorou' : '⚠️ piorou'})` : 'N/D'}

📅 SAZONALIDADE - COMPARATIVO COM ${dados.periodo.mes_nome?.toUpperCase() || 'MESMO MÊS'}/${dados.periodo.ano - 1}:
- Alunos: ${alunosAnoPassado !== null ? `${alunosAnoPassado} → ${totalPagantes} (${variacaoAlunosAnoPassado !== null ? (variacaoAlunosAnoPassado >= 0 ? '+' : '') + variacaoAlunosAnoPassado.toFixed(1) + '%' : 'N/D'})` : 'N/D'}
- Ticket: ${ticketAnoPassado !== null ? `R$${ticketAnoPassado.toFixed(0)} → R$${ticketMedio.toFixed(0)} (${variacaoTicketAnoPassado !== null ? (variacaoTicketAnoPassado >= 0 ? '+' : '') + variacaoTicketAnoPassado.toFixed(1) + '%' : 'N/D'})` : 'N/D'}
- Churn: ${churnAnoPassado !== null ? `${churnAnoPassado.toFixed(1)}% → ${churnRate.toFixed(1)}% (${variacaoChurnAnoPassado !== null ? (variacaoChurnAnoPassado <= 0 ? '✅ melhorou ' : '⚠️ piorou ') + Math.abs(variacaoChurnAnoPassado).toFixed(1) + 'pp' : 'N/D'})` : 'N/D'}

🔔 RENOVAÇÕES PRÓXIMAS:
- Vencidos (URGENTE): ${totalVencidos}
- Próximos 7 dias: ${totalUrgente7Dias}
- Próximos 15 dias: ${totalAtencao15Dias}
- Próximos 30 dias: ${totalProximo30Dias}

${alunosUrgentesFormatados ? `👤 ALUNOS COM RENOVAÇÃO URGENTE:\n${alunosUrgentesFormatados}` : ''}

${evasoesFormatadas ? `❌ EVASÕES RECENTES:\n${evasoesFormatadas}` : ''}

${permanenciaFormatada ? `⏱️ DISTRIBUIÇÃO POR PERMANÊNCIA:\n${permanenciaFormatada}` : ''}

${comparativoUnidades}

🏆 PROGRAMA FIDELIZA+ LA - TRIMESTRAL (${pontuacaoTotal}/100 pts - ${criteriosBatidos}/5 critérios):
⭐ Churn Premiado (≤${FIDELIZA_PLUS_METAS.churn_maximo}% → 25pts): ${progressoFidelizaPlus.churn_premiado.conquistou ? '✅ +25pts' : '❌ 0pts'} (${churnRate.toFixed(1)}%)
⭐ Inadimplência 1% (≤${FIDELIZA_PLUS_METAS.inadimplencia_maxima}% → 20pts): ${progressoFidelizaPlus.inadimplencia_zero.conquistou ? '✅ +20pts' : '❌ 0pts'} (${inadimplencia.toFixed(1)}%)
⭐ Max Renovação (≥${FIDELIZA_PLUS_METAS.renovacao_minima}% → 25pts): ${progressoFidelizaPlus.max_renovacao.conquistou ? '✅ +25pts' : '❌ 0pts'} (${taxaRenovacao.toFixed(0)}%)
⭐ Reajuste Campeão (≥${FIDELIZA_PLUS_METAS.reajuste_minimo}% → 15pts): ${progressoFidelizaPlus.reajuste_campeao.conquistou ? '✅ +15pts' : '❌ 0pts'} (${reajusteMedio ? `${reajusteMedio.toFixed(1)}%` : 'N/D'})
🛒 Mestres da Lojinha (≥R$${metaLojinhaUnidade.toLocaleString('pt-BR')} → 15pts): ${progressoFidelizaPlus.mestres_lojinha.conquistou ? '✅ +15pts' : '❌ 0pts'}

---

Gere uma análise completa de TODAS as metas do painel e um plano de ação prático!
${!is_consolidado && duplaFormatada ? `LEMBRE-SE: Chame ${duplaFormatada.apelidos} pelo nome e faça provocações com as outras duplas!` : ''}`;

    // Chamar Gemini API
    const response = await fetchGeminiComRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: systemPrompt + '\n\n' + jsonFormat + '\n\n' + userPrompt }]
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
        saudacao_motivacional: is_consolidado 
          ? `Olá, Administrador! 💪 Vamos analisar os números de ${dados.periodo.mes_nome} e traçar estratégias para todas as unidades!` 
          : `E aí, ${duplaFormatada?.apelidos || 'pessoal'}! 🔥 Bora ver como estão os números de ${dados.periodo.mes_nome}?`,
        saude_retencao: churnRate < 3 ? 'excelente' : churnRate <= 4 ? 'saudavel' : churnRate <= 6 ? 'atencao' : 'critica',
        conquistas: progressoFidelizaPlus.churn_premiado.conquistou ? [{
          tipo: 'meta_batida',
          titulo: 'Churn Premiado!',
          descricao: `Churn de ${churnRate.toFixed(1)}% está dentro da meta de ${FIDELIZA_PLUS_METAS.churn_maximo}% - +25 pontos Fideliza+!`,
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
        competitividade: is_consolidado ? null : {
          provocacao: `Será que a ${outrosFarmers[0]?.apelidos || 'concorrência'} vai deixar vocês passarem?`,
          desafio: 'Mostrem quem manda na retenção!'
        },
        fideliza_plus: {
          estrelas_conquistadas: estrelasConquistadas,
          estrelas_possiveis: 4,
          proxima_estrela: !progressoFidelizaPlus.churn_premiado.conquistou ? 'Churn Premiado' : 
                          !progressoFidelizaPlus.inadimplencia_zero.conquistou ? 'Inadimplência 1%' :
                          !progressoFidelizaPlus.max_renovacao.conquistou ? 'Max Renovação' : 'Reajuste Campeão',
          dica_experiencia: 'Qual experiência vocês vão curtir esse mês?'
        },
        dica_do_dia: 'Ligue para um aluno que acabou de renovar e agradeça! Isso fortalece o relacionamento.',
        mensagem_final: is_consolidado 
          ? 'Acompanhe os números e apoie as equipes de Farmers!'
          : `Vambora, ${duplaFormatada?.apelidos || 'pessoal'}! 🚀 O Fideliza+ LA espera vocês!` 
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
