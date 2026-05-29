// Edge Function: lojinha-alerta-estoque
// Envia alerta de estoque baixo via WhatsApp para o responsável
// Integração com UAZAPI

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getWhatsAppCredentials, type WhatsAppCreds } from '../_shared/uazapi.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProdutoEstoqueBaixo {
  nome: string;
  variacao?: string;
  estoque_atual: number;
  estoque_minimo: number;
}

interface AlertaEstoquePayload {
  unidade_id: string;
  produtos?: ProdutoEstoqueBaixo[];
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
 * Formata data para exibição
 */
function formatDate(): string {
  return new Date().toLocaleDateString('pt-BR', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Monta a lista de produtos com estoque baixo
 */
function formatProdutos(produtos: ProdutoEstoqueBaixo[]): string {
  return produtos.map(p => {
    const variacao = p.variacao ? ` (${p.variacao})` : '';
    const urgencia = p.estoque_atual === 0 ? '🔴' : '🟡';
    return `${urgencia} ${p.nome}${variacao}: ${p.estoque_atual}/${p.estoque_minimo} un`;
  }).join('\n');
}

/**
 * Monta a mensagem de alerta usando template
 */
function montarMensagem(
  template: string,
  dados: {
    unidade: string;
    data: string;
    lista_produtos: string;
    total_produtos: number;
  }
): string {
  let mensagem = template;
  
  mensagem = mensagem.replace(/{unidade}/g, dados.unidade);
  mensagem = mensagem.replace(/{data}/g, dados.data);
  mensagem = mensagem.replace(/{lista_produtos}/g, dados.lista_produtos);
  mensagem = mensagem.replace(/{total_produtos}/g, String(dados.total_produtos));
  
  return mensagem;
}

/**
 * Template padrão caso não exista no banco
 */
const TEMPLATE_PADRAO = `⚠️ *Alerta de Estoque Baixo - LA Music*

📍 *Unidade:* {unidade}
📅 *Data:* {data}

🚨 *{total_produtos} produto(s) precisam de reposição:*

{lista_produtos}

Por favor, providencie a reposição o mais breve possível.

🔴 = Zerado | 🟡 = Baixo`;

async function enviarWhatsApp(
  telefone: string,
  mensagem: string,
  creds: WhatsAppCreds
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const formattedPhone = formatPhoneNumber(telefone);

  console.log(`[lojinha-alerta-estoque] Enviando para: ${formattedPhone}`);

  try {
    let response: Response;
    if (creds.provedor === 'waha') {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (creds.wahaApiKey) headers['X-Api-Key'] = creds.wahaApiKey;
      response = await fetch(`${creds.wahaUrl}/api/sendText`, {
        method: 'POST', headers,
        body: JSON.stringify({ session: creds.wahaSession, chatId: `${formattedPhone}@c.us`, text: mensagem }),
      });
    } else {
      response = await fetch(`${creds.baseUrl}/send/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'token': creds.token },
        body: JSON.stringify({ number: formattedPhone, text: mensagem, delay: 0, readchat: true }),
      });
    }

    const data = await response.json();

    if (response.ok && !data.error) {
      console.log(`[lojinha-alerta-estoque] ✅ Mensagem enviada! ID: ${data.id || data.messageid || data.key?.id}`);
      return {
        success: true,
        messageId: data.id || data.messageid || data.key?.id
      };
    } else {
      console.error(`[lojinha-alerta-estoque] ❌ Erro WhatsApp:`, data);
      return {
        success: false,
        error: data.error || data.message || 'Erro ao enviar mensagem'
      };
    }
  } catch (error) {
    console.error(`[lojinha-alerta-estoque] ❌ Erro de conexão:`, error);
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
    const payload: AlertaEstoquePayload = await req.json();

    // Validar payload
    if (!payload.unidade_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'ID da unidade não informado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Criar cliente Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const creds = await getWhatsAppCredentials(supabase, { funcao: 'sistema' });

    // Buscar unidade
    const { data: unidade, error: unidadeError } = await supabase
      .from('unidades')
      .select('id, nome')
      .eq('id', payload.unidade_id)
      .single();

    if (unidadeError || !unidade) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unidade não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar responsável por reposição da unidade
    const { data: responsavel, error: respError } = await supabase
      .from('loja_responsaveis_reposicao')
      .select('id, nome, whatsapp')
      .eq('unidade_id', payload.unidade_id)
      .eq('ativo', true)
      .limit(1)
      .single();

    if (respError || !responsavel) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhum responsável por reposição cadastrado para esta unidade' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!responsavel.whatsapp) {
      return new Response(
        JSON.stringify({ success: false, error: 'Responsável não possui WhatsApp cadastrado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Se não foram passados produtos, buscar do banco
    let produtos = payload.produtos;
    
    if (!produtos || produtos.length === 0) {
      // Buscar produtos com estoque baixo
      const { data: estoqueBaixo, error: estoqueError } = await supabase
        .from('loja_estoque')
        .select(`
          quantidade,
          loja_produtos:produto_id (nome, estoque_minimo),
          loja_produtos_variacoes:variacao_id (nome)
        `)
        .eq('unidade_id', payload.unidade_id)
        .lt('quantidade', supabase.rpc('get_estoque_minimo_produto'));

      // Alternativa: buscar todos e filtrar
      const { data: todoEstoque } = await supabase
        .from('loja_estoque')
        .select(`
          quantidade,
          loja_produtos:produto_id (id, nome, estoque_minimo),
          loja_produtos_variacoes:variacao_id (nome)
        `)
        .eq('unidade_id', payload.unidade_id);

      produtos = (todoEstoque || [])
        .filter(e => {
          const minimo = (e.loja_produtos as any)?.estoque_minimo || 5;
          return e.quantidade <= minimo;
        })
        .map(e => ({
          nome: (e.loja_produtos as any)?.nome || 'Produto',
          variacao: (e.loja_produtos_variacoes as any)?.nome,
          estoque_atual: e.quantidade,
          estoque_minimo: (e.loja_produtos as any)?.estoque_minimo || 5,
        }));
    }

    if (produtos.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'Nenhum produto com estoque baixo' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar template do banco
    const { data: configTemplate } = await supabase
      .from('loja_configuracoes')
      .select('valor')
      .eq('chave', 'template_alerta_estoque')
      .single();

    const template = configTemplate?.valor || TEMPLATE_PADRAO;

    // Montar mensagem
    const mensagem = montarMensagem(template, {
      unidade: unidade.nome,
      data: formatDate(),
      lista_produtos: formatProdutos(produtos),
      total_produtos: produtos.length,
    });

    // Enviar WhatsApp
    const resultado = await enviarWhatsApp(responsavel.whatsapp, mensagem, creds);

    return new Response(
      JSON.stringify({
        ...resultado,
        responsavel: responsavel.nome,
        produtos_alertados: produtos.length,
      }),
      { 
        status: resultado.success ? 200 : 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[lojinha-alerta-estoque] Erro:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
