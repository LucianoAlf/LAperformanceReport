// Edge Function: lojinha-relatorio-vendas
// Gera relatório de vendas da Lojinha para envio via WhatsApp
// Tipos: diario, semanal, mensal, meta_fideliza

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mapeamento de UUIDs para nomes de unidade
const UUID_NOME_MAP: Record<string, string> = {
  '368d47f5-2d88-4475-bc14-ba084a9a348e': 'Barra',
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 'Campo Grande',
  '95553e96-971b-4590-a6eb-0201d013c14d': 'Recreio',
};

interface RelatorioPayload {
  unidade_id: string | null;
  tipo_relatorio: 'diario' | 'semanal' | 'mensal' | 'meta_fideliza';
  data_inicio: string;
  data_fim: string;
}

interface VendaResumo {
  total_vendas: number;
  valor_total: number;
  ticket_medio: number;
  produtos_vendidos: number;
}

interface TopProduto {
  nome: string;
  quantidade: number;
  valor: number;
}

interface FarmerVendas {
  nome: string;
  vendas: number;
  valor: number;
}

/**
 * Formata valor em reais
 */
function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Formata data para exibição
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Gera relatório diário
 */
function gerarRelatorioDiario(
  unidadeNome: string,
  data: string,
  resumo: VendaResumo,
  topProdutos: TopProduto[],
  farmers: FarmerVendas[]
): string {
  let relatorio = `📊 *RELATÓRIO DIÁRIO - LOJINHA*\n`;
  relatorio += `📍 ${unidadeNome} | 📅 ${formatDate(data)}\n`;
  relatorio += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  relatorio += `💰 *RESUMO DO DIA*\n`;
  relatorio += `• Vendas: ${resumo.total_vendas}\n`;
  relatorio += `• Faturamento: ${formatCurrency(resumo.valor_total)}\n`;
  relatorio += `• Ticket Médio: ${formatCurrency(resumo.ticket_medio)}\n`;
  relatorio += `• Itens vendidos: ${resumo.produtos_vendidos}\n\n`;

  if (topProdutos.length > 0) {
    relatorio += `🏆 *TOP PRODUTOS*\n`;
    topProdutos.slice(0, 5).forEach((p, i) => {
      relatorio += `${i + 1}. ${p.nome} (${p.quantidade}x) - ${formatCurrency(p.valor)}\n`;
    });
    relatorio += `\n`;
  }

  if (farmers.length > 0) {
    relatorio += `👩‍💼 *VENDAS POR FARMER*\n`;
    farmers.forEach(f => {
      relatorio += `• ${f.nome}: ${f.vendas} vendas - ${formatCurrency(f.valor)}\n`;
    });
  }

  relatorio += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
  relatorio += `_Gerado automaticamente pelo LA Report_`;

  return relatorio;
}

/**
 * Gera relatório semanal
 */
function gerarRelatorioSemanal(
  unidadeNome: string,
  dataInicio: string,
  dataFim: string,
  resumo: VendaResumo,
  topProdutos: TopProduto[],
  farmers: FarmerVendas[]
): string {
  let relatorio = `📊 *RELATÓRIO SEMANAL - LOJINHA*\n`;
  relatorio += `📍 ${unidadeNome}\n`;
  relatorio += `📅 ${formatDate(dataInicio)} a ${formatDate(dataFim)}\n`;
  relatorio += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  relatorio += `💰 *RESUMO DA SEMANA*\n`;
  relatorio += `• Total de vendas: ${resumo.total_vendas}\n`;
  relatorio += `• Faturamento: ${formatCurrency(resumo.valor_total)}\n`;
  relatorio += `• Ticket Médio: ${formatCurrency(resumo.ticket_medio)}\n`;
  relatorio += `• Itens vendidos: ${resumo.produtos_vendidos}\n\n`;

  if (topProdutos.length > 0) {
    relatorio += `🏆 *TOP 5 PRODUTOS DA SEMANA*\n`;
    topProdutos.slice(0, 5).forEach((p, i) => {
      relatorio += `${i + 1}. ${p.nome} (${p.quantidade}x) - ${formatCurrency(p.valor)}\n`;
    });
    relatorio += `\n`;
  }

  if (farmers.length > 0) {
    relatorio += `👩‍💼 *RANKING FARMERS*\n`;
    farmers.sort((a, b) => b.valor - a.valor).forEach((f, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      relatorio += `${medal} ${f.nome}: ${f.vendas} vendas - ${formatCurrency(f.valor)}\n`;
    });
  }

  relatorio += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
  relatorio += `_Gerado automaticamente pelo LA Report_`;

  return relatorio;
}

/**
 * Gera relatório mensal
 */
function gerarRelatorioMensal(
  unidadeNome: string,
  mes: string,
  resumo: VendaResumo,
  topProdutos: TopProduto[],
  farmers: FarmerVendas[],
  comissoesTotal: number
): string {
  let relatorio = `📊 *RELATÓRIO MENSAL - LOJINHA*\n`;
  relatorio += `📍 ${unidadeNome} | 📅 ${mes}\n`;
  relatorio += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  relatorio += `💰 *RESUMO DO MÊS*\n`;
  relatorio += `• Total de vendas: ${resumo.total_vendas}\n`;
  relatorio += `• Faturamento bruto: ${formatCurrency(resumo.valor_total)}\n`;
  relatorio += `• Ticket Médio: ${formatCurrency(resumo.ticket_medio)}\n`;
  relatorio += `• Itens vendidos: ${resumo.produtos_vendidos}\n`;
  relatorio += `• Comissões pagas: ${formatCurrency(comissoesTotal)}\n\n`;

  if (topProdutos.length > 0) {
    relatorio += `🏆 *TOP 10 PRODUTOS*\n`;
    topProdutos.slice(0, 10).forEach((p, i) => {
      relatorio += `${i + 1}. ${p.nome} (${p.quantidade}x) - ${formatCurrency(p.valor)}\n`;
    });
    relatorio += `\n`;
  }

  if (farmers.length > 0) {
    relatorio += `👩‍💼 *PERFORMANCE FARMERS*\n`;
    farmers.sort((a, b) => b.valor - a.valor).forEach((f, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      relatorio += `${medal} ${f.nome}: ${f.vendas} vendas - ${formatCurrency(f.valor)}\n`;
    });
  }

  relatorio += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
  relatorio += `_Gerado automaticamente pelo LA Report_`;

  return relatorio;
}

/**
 * Gera relatório de meta Fideliza+
 */
function gerarRelatorioMetaFideliza(
  unidadeNome: string,
  mes: string,
  valorVendido: number,
  metaValor: number,
  percentualAtingido: number,
  diasRestantes: number,
  farmers: FarmerVendas[]
): string {
  const bateuMeta = percentualAtingido >= 100;
  const faltando = metaValor - valorVendido;

  let relatorio = `🏆 *META FIDELIZA+ LOJINHA*\n`;
  relatorio += `📍 ${unidadeNome} | 📅 ${mes}\n`;
  relatorio += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (bateuMeta) {
    relatorio += `🎉 *PARABÉNS! META BATIDA!*\n\n`;
  }

  relatorio += `📊 *PROGRESSO*\n`;
  relatorio += `• Vendido: ${formatCurrency(valorVendido)}\n`;
  relatorio += `• Meta: ${formatCurrency(metaValor)}\n`;
  relatorio += `• Atingido: ${percentualAtingido.toFixed(1)}%\n`;
  
  if (!bateuMeta) {
    relatorio += `• Faltam: ${formatCurrency(faltando)}\n`;
    relatorio += `• Dias restantes: ${diasRestantes}\n`;
    
    if (diasRestantes > 0) {
      const mediaDiaria = faltando / diasRestantes;
      relatorio += `• Média diária necessária: ${formatCurrency(mediaDiaria)}\n`;
    }
  }

  relatorio += `\n`;

  // Barra de progresso visual
  const barraCheia = Math.min(Math.floor(percentualAtingido / 10), 10);
  const barraVazia = 10 - barraCheia;
  relatorio += `[${('█').repeat(barraCheia)}${('░').repeat(barraVazia)}] ${percentualAtingido.toFixed(0)}%\n\n`;

  if (farmers.length > 0) {
    relatorio += `👩‍💼 *CONTRIBUIÇÃO FARMERS*\n`;
    farmers.sort((a, b) => b.valor - a.valor).forEach(f => {
      const contrib = metaValor > 0 ? ((f.valor / metaValor) * 100).toFixed(1) : '0';
      relatorio += `• ${f.nome}: ${formatCurrency(f.valor)} (${contrib}% da meta)\n`;
    });
  }

  relatorio += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
  relatorio += `_Programa Fideliza+ LA - 15 pontos_`;

  return relatorio;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload: RelatorioPayload = await req.json();
    const { unidade_id, tipo_relatorio, data_inicio, data_fim } = payload;

    // Criar cliente Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Nome da unidade
    const unidadeNome = unidade_id ? (UUID_NOME_MAP[unidade_id] || 'Unidade') : 'Consolidado';

    // Buscar vendas do período
    let vendasQuery = supabase
      .from('loja_vendas')
      .select(`
        id,
        data_venda,
        total,
        vendedor_id,
        colaboradores:vendedor_id (nome, apelido)
      `)
      .gte('data_venda', data_inicio)
      .lte('data_venda', data_fim + 'T23:59:59');

    if (unidade_id) {
      vendasQuery = vendasQuery.eq('unidade_id', unidade_id);
    }

    const { data: vendas, error: vendasError } = await vendasQuery;

    if (vendasError) {
      console.error('Erro ao buscar vendas:', vendasError);
      throw vendasError;
    }

    // Buscar itens das vendas
    const vendaIds = (vendas || []).map(v => v.id);
    let itensQuery = supabase
      .from('loja_vendas_itens')
      .select(`
        quantidade,
        subtotal,
        loja_produtos:produto_id (nome)
      `);

    if (vendaIds.length > 0) {
      itensQuery = itensQuery.in('venda_id', vendaIds);
    }

    const { data: itens } = await itensQuery;

    // Calcular resumo
    const totalVendas = vendas?.length || 0;
    const valorTotal = vendas?.reduce((sum, v) => sum + (v.total || 0), 0) || 0;
    const ticketMedio = totalVendas > 0 ? valorTotal / totalVendas : 0;
    const produtosVendidos = itens?.reduce((sum, i) => sum + (i.quantidade || 0), 0) || 0;

    const resumo: VendaResumo = {
      total_vendas: totalVendas,
      valor_total: valorTotal,
      ticket_medio: ticketMedio,
      produtos_vendidos: produtosVendidos,
    };

    // Top produtos
    const produtosMap = new Map<string, { quantidade: number; valor: number }>();
    (itens || []).forEach(item => {
      const nome = (item.loja_produtos as any)?.nome || 'Produto';
      const atual = produtosMap.get(nome) || { quantidade: 0, valor: 0 };
      produtosMap.set(nome, {
        quantidade: atual.quantidade + (item.quantidade || 0),
        valor: atual.valor + (item.subtotal || 0),
      });
    });

    const topProdutos: TopProduto[] = Array.from(produtosMap.entries())
      .map(([nome, dados]) => ({ nome, ...dados }))
      .sort((a, b) => b.valor - a.valor);

    // Vendas por farmer
    const farmersMap = new Map<string, { vendas: number; valor: number }>();
    (vendas || []).forEach(venda => {
      const colab = venda.colaboradores as any;
      const nome = colab?.apelido || colab?.nome || 'Não identificado';
      const atual = farmersMap.get(nome) || { vendas: 0, valor: 0 };
      farmersMap.set(nome, {
        vendas: atual.vendas + 1,
        valor: atual.valor + (venda.total || 0),
      });
    });

    const farmers: FarmerVendas[] = Array.from(farmersMap.entries())
      .map(([nome, dados]) => ({ nome, ...dados }));

    // Gerar relatório baseado no tipo
    let relatorio = '';

    if (tipo_relatorio === 'diario') {
      relatorio = gerarRelatorioDiario(unidadeNome, data_inicio, resumo, topProdutos, farmers);
    } else if (tipo_relatorio === 'semanal') {
      relatorio = gerarRelatorioSemanal(unidadeNome, data_inicio, data_fim, resumo, topProdutos, farmers);
    } else if (tipo_relatorio === 'mensal') {
      // Buscar comissões do mês
      const { data: comissoes } = await supabase
        .from('loja_carteira_movimentacoes')
        .select('valor')
        .eq('tipo', 'comissao_venda')
        .gte('created_at', data_inicio)
        .lte('created_at', data_fim + 'T23:59:59');

      const comissoesTotal = comissoes?.reduce((sum, c) => sum + (c.valor || 0), 0) || 0;

      const mesNome = new Date(data_inicio).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      relatorio = gerarRelatorioMensal(unidadeNome, mesNome, resumo, topProdutos, farmers, comissoesTotal);
    } else if (tipo_relatorio === 'meta_fideliza') {
      // Buscar meta do Fideliza+
      const ano = new Date().getFullYear();
      const { data: config } = await supabase
        .from('programa_fideliza_config')
        .select('metas_lojinha')
        .eq('ano', ano)
        .single();

      const metasLojinha = config?.metas_lojinha as Record<string, number> || {};
      const metaValor = unidade_id ? (metasLojinha[unidade_id] || 3000) : 
        Object.values(metasLojinha).reduce((sum, v) => sum + v, 0);

      const percentualAtingido = metaValor > 0 ? (valorTotal / metaValor) * 100 : 0;

      // Calcular dias restantes no mês
      const hoje = new Date();
      const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
      const diasRestantes = ultimoDiaMes.getDate() - hoje.getDate();

      const mesNome = hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      relatorio = gerarRelatorioMetaFideliza(unidadeNome, mesNome, valorTotal, metaValor, percentualAtingido, diasRestantes, farmers);
    }

    return new Response(
      JSON.stringify({ success: true, relatorio }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[lojinha-relatorio-vendas] Erro:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro ao gerar relatório' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
