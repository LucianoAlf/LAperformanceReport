// Edge Function: lojinha-enviar-comprovante
// Envia comprovante de venda via WhatsApp para o cliente
// Integração com UAZAPI

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const UAZAPI_URL = Deno.env.get('UAZAPI_BASE_URL') || 'https://lamusic.uazapi.com';
const UAZAPI_TOKEN = Deno.env.get('UAZAPI_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ComprovantePayload {
  venda_id: number;
}

interface VendaItem {
  produto_nome: string;
  variacao_nome?: string;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
}

/**
 * Formata número de telefone para o padrão UAZAPI
 */
function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  if (!cleaned.startsWith('55')) {
    cleaned = '55' + cleaned;
  }
  return cleaned;
}

/**
 * Formata valor em reais
 */
function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Formata data para exibição (fuso horário Brasil UTC-3)
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  // Ajustar para fuso horário do Brasil (UTC-3)
  return date.toLocaleDateString('pt-BR', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric',
    timeZone: 'America/Sao_Paulo'
  });
}

/**
 * Monta a lista de itens formatada
 */
function formatItens(itens: VendaItem[]): string {
  return itens.map(item => {
    const variacao = item.variacao_nome ? ` (${item.variacao_nome})` : '';
    return `• ${item.quantidade}x ${item.produto_nome}${variacao} - ${formatCurrency(item.subtotal)}`;
  }).join('\n');
}

/**
 * Monta a mensagem do comprovante usando template
 */
function montarMensagem(
  template: string,
  dados: {
    unidade: string;
    data: string;
    cliente: string;
    itens: string;
    total: string;
    forma_pagamento: string;
    vendedor?: string;
  }
): string {
  let mensagem = template;
  
  // Substituir variáveis
  mensagem = mensagem.replace(/{unidade}/g, dados.unidade);
  mensagem = mensagem.replace(/{data}/g, dados.data);
  mensagem = mensagem.replace(/{cliente}/g, dados.cliente);
  mensagem = mensagem.replace(/{itens}/g, dados.itens);
  mensagem = mensagem.replace(/{total}/g, dados.total);
  mensagem = mensagem.replace(/{forma_pagamento}/g, dados.forma_pagamento);
  mensagem = mensagem.replace(/{vendedor}/g, dados.vendedor || '');
  
  return mensagem;
}

/**
 * Template padrão caso não exista no banco
 */
const TEMPLATE_PADRAO = `🛒 *Comprovante de Compra - LA Music*

📍 *Unidade:* {unidade}
📅 *Data:* {data}
👤 *Cliente:* {cliente}
🧑‍💼 *Vendedor:* {vendedor}

📦 *Itens:*
{itens}

💰 *Total:* {total}
💳 *Pagamento:* {forma_pagamento}

Obrigado pela preferência! 🎵
Dúvidas? Fale com a secretaria.`;

/**
 * Envia mensagem via UAZAPI
 */
async function enviarWhatsApp(telefone: string, mensagem: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!UAZAPI_TOKEN) {
    return { success: false, error: 'Token UAZAPI não configurado' };
  }

  const formattedPhone = formatPhoneNumber(telefone);
  
  let baseUrl = UAZAPI_URL;
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = 'https://' + baseUrl;
  }

  console.log(`[lojinha-enviar-comprovante] Enviando para: ${formattedPhone}`);

  try {
    const response = await fetch(`${baseUrl}/send/text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': UAZAPI_TOKEN,
      },
      body: JSON.stringify({
        number: formattedPhone,
        text: mensagem,
        delay: 0,
        readchat: true,
      }),
    });

    const data = await response.json();

    if (response.ok && !data.error) {
      console.log(`[lojinha-enviar-comprovante] ✅ Mensagem enviada! ID: ${data.id || data.messageid || data.key?.id}`);
      return { 
        success: true, 
        messageId: data.id || data.messageid || data.key?.id 
      };
    } else {
      console.error(`[lojinha-enviar-comprovante] ❌ Erro UAZAPI:`, data);
      return { 
        success: false, 
        error: data.error || data.message || 'Erro ao enviar mensagem' 
      };
    }
  } catch (error) {
    console.error(`[lojinha-enviar-comprovante] ❌ Erro de conexão:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Erro de conexão' 
    };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload: ComprovantePayload = await req.json();

    // Validar payload
    if (!payload.venda_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'ID da venda não informado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Criar cliente Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Buscar dados da venda incluindo vendedor
    const { data: venda, error: vendaError } = await supabase
      .from('loja_vendas')
      .select(`
        id,
        data_venda,
        cliente_nome,
        total,
        forma_pagamento,
        unidade_id,
        aluno_id,
        professor_indicador_id,
        vendedor_id,
        unidades:unidade_id (nome),
        alunos:aluno_id (nome, whatsapp),
        professores:professor_indicador_id (nome, telefone_whatsapp),
        colaboradores:vendedor_id (nome, apelido)
      `)
      .eq('id', payload.venda_id)
      .single();

    if (vendaError || !venda) {
      return new Response(
        JSON.stringify({ success: false, error: 'Venda não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Coletar todos os destinatários para envio
    const destinatarios: { telefone: string; tipo: string }[] = [];
    
    // Nome do cliente - prioridade: cliente_nome > nome do aluno
    let clienteNome = venda.cliente_nome;
    if (!clienteNome && venda.aluno_id && (venda.alunos as any)?.nome) {
      clienteNome = (venda.alunos as any).nome;
    }
    
    // Adicionar aluno se tiver WhatsApp
    if (venda.aluno_id && (venda.alunos as any)?.whatsapp) {
      destinatarios.push({
        telefone: (venda.alunos as any).whatsapp,
        tipo: 'aluno'
      });
      console.log(`[lojinha-enviar-comprovante] Aluno com WhatsApp: ${(venda.alunos as any).whatsapp}`);
    }
    
    // Adicionar professor indicador se tiver WhatsApp
    if (venda.professor_indicador_id && (venda.professores as any)?.telefone_whatsapp) {
      destinatarios.push({
        telefone: (venda.professores as any).telefone_whatsapp,
        tipo: 'professor'
      });
      console.log(`[lojinha-enviar-comprovante] Professor indicador com WhatsApp: ${(venda.professores as any).telefone_whatsapp}`);
    }

    // Verificar se tem pelo menos um destinatário
    if (destinatarios.length === 0) {
      console.log('[lojinha-enviar-comprovante] Nenhum WhatsApp disponível para envio');
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhum WhatsApp disponível (aluno ou professor indicador)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Nome do vendedor
    const vendedorNome = (venda.colaboradores as any)?.apelido || (venda.colaboradores as any)?.nome || 'Equipe LA Music';
    
    console.log(`[lojinha-enviar-comprovante] Enviando para ${destinatarios.length} destinatário(s)`);

    // Buscar itens da venda
    const { data: itens, error: itensError } = await supabase
      .from('loja_vendas_itens')
      .select(`
        quantidade,
        preco_unitario,
        subtotal,
        loja_produtos:produto_id (nome),
        loja_produtos_variacoes:variacao_id (nome)
      `)
      .eq('venda_id', payload.venda_id);

    if (itensError) {
      console.error('[lojinha-enviar-comprovante] Erro ao buscar itens:', itensError);
    }

    // Formatar itens
    const itensFormatados: VendaItem[] = (itens || []).map(item => ({
      produto_nome: (item.loja_produtos as any)?.nome || 'Produto',
      variacao_nome: (item.loja_produtos_variacoes as any)?.nome,
      quantidade: item.quantidade,
      preco_unitario: item.preco_unitario,
      subtotal: item.subtotal,
    }));

    // Buscar template do banco
    const { data: configTemplate } = await supabase
      .from('loja_configuracoes')
      .select('valor')
      .eq('chave', 'template_comprovante')
      .single();

    const template = configTemplate?.valor || TEMPLATE_PADRAO;

    // Montar mensagem
    const mensagem = montarMensagem(template, {
      unidade: (venda.unidades as any)?.nome || 'LA Music',
      data: formatDate(venda.data_venda),
      cliente: clienteNome || 'Cliente',
      itens: formatItens(itensFormatados),
      total: formatCurrency(venda.total),
      forma_pagamento: venda.forma_pagamento || 'Não informado',
      vendedor: vendedorNome,
    });

    // Enviar WhatsApp para TODOS os destinatários (aluno + professor)
    const resultados: { tipo: string; success: boolean; messageId?: string; error?: string }[] = [];
    
    for (const dest of destinatarios) {
      console.log(`[lojinha-enviar-comprovante] Enviando para ${dest.tipo}: ${dest.telefone}`);
      const resultado = await enviarWhatsApp(dest.telefone, mensagem);
      resultados.push({
        tipo: dest.tipo,
        ...resultado
      });
      
      // Pequeno delay entre envios para não sobrecarregar a API
      if (destinatarios.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Verificar se pelo menos um envio foi bem sucedido
    const algumSucesso = resultados.some(r => r.success);

    // Atualizar venda com status de envio
    if (algumSucesso) {
      await supabase
        .from('loja_vendas')
        .update({ 
          comprovante_enviado: true,
          comprovante_enviado_em: new Date().toISOString()
        })
        .eq('id', payload.venda_id);
    }

    return new Response(
      JSON.stringify({ 
        success: algumSucesso, 
        enviados: resultados.filter(r => r.success).length,
        total: resultados.length,
        detalhes: resultados
      }),
      { 
        status: algumSucesso ? 200 : 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[lojinha-enviar-comprovante] Erro:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
