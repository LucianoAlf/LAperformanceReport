// Edge Function: lojinha-relatorio-professor
// Envia relatório de carteira/Lalitas via WhatsApp para o professor
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

interface RelatorioProfessorPayload {
  professor_id: number;
  carteira_id?: number;
}

interface Movimentacao {
  tipo: string;
  valor: number;
  data: string;
  referencia?: string;
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
 * Formata data para exibição
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('pt-BR', { 
    day: '2-digit', 
    month: '2-digit'
  });
}

/**
 * Mapeia tipo de movimentação para label amigável
 */
function getTipoLabel(tipo: string): string {
  const labels: Record<string, string> = {
    'comissao_venda': '💰 Comissão venda',
    'comissao_indicacao': '🎯 Comissão indicação',
    'lalita': '🐶 Lalita',
    'moeda_la': '🐶 Lalita',
    'compra_loja': '🛒 Compra loja',
    'saque': '💸 Saque',
    'ajuste': '⚙️ Ajuste',
  };
  return labels[tipo] || tipo;
}

/**
 * Formata lista de movimentações
 */
function formatMovimentacoes(movimentacoes: Movimentacao[]): string {
  if (movimentacoes.length === 0) {
    return 'Nenhuma movimentação recente';
  }
  
  return movimentacoes.slice(0, 10).map(m => {
    const sinal = m.valor >= 0 ? '+' : '';
    const ref = m.referencia ? ` (${m.referencia})` : '';
    return `${formatDate(m.data)} | ${getTipoLabel(m.tipo)} | ${sinal}${formatCurrency(m.valor)}${ref}`;
  }).join('\n');
}

/**
 * Monta a mensagem do relatório
 */
function montarMensagem(dados: {
  professor_nome: string;
  saldo: number;
  lalitas: number;
  valor_lalitas: number;
  movimentacoes: Movimentacao[];
  mes_referencia: string;
}): string {
  const primeiroNome = dados.professor_nome.split(' ')[0];
  
  let mensagem = `📊 *Relatório Carteira Lojinha - LA Music*\n\n`;
  mensagem += `Olá, ${primeiroNome}! 👋\n\n`;
  mensagem += `Aqui está seu extrato atualizado:\n\n`;
  
  mensagem += `💰 *Saldo Disponível:* ${formatCurrency(dados.saldo)}\n`;
  mensagem += `🐶 *Lalitas:* ${dados.lalitas} (${formatCurrency(dados.valor_lalitas)})\n\n`;
  
  mensagem += `📋 *Últimas Movimentações:*\n`;
  mensagem += `─────────────────\n`;
  mensagem += formatMovimentacoes(dados.movimentacoes);
  mensagem += `\n─────────────────\n\n`;
  
  mensagem += `💡 *Dica:* Você pode usar seu saldo para compras na Lojinha ou solicitar saque!\n\n`;
  mensagem += `Dúvidas? Fale com a secretaria. 🎵`;
  
  return mensagem;
}

async function enviarWhatsApp(
  telefone: string,
  mensagem: string,
  creds: WhatsAppCreds
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const formattedPhone = formatPhoneNumber(telefone);

  console.log(`[lojinha-relatorio-professor] Enviando para: ${formattedPhone}`);

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
      console.log(`[lojinha-relatorio-professor] ✅ Mensagem enviada! ID: ${data.id || data.messageid || data.key?.id}`);
      return {
        success: true,
        messageId: data.id || data.messageid || data.key?.id
      };
    } else {
      console.error(`[lojinha-relatorio-professor] ❌ Erro WhatsApp:`, data);
      return {
        success: false,
        error: data.error || data.message || 'Erro ao enviar mensagem'
      };
    }
  } catch (error) {
    console.error(`[lojinha-relatorio-professor] ❌ Erro de conexão:`, error);
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
    const payload: RelatorioProfessorPayload = await req.json();

    // Validar payload
    if (!payload.professor_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'ID do professor não informado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Criar cliente Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const creds = await getWhatsAppCredentials(supabase, { funcao: 'sistema' });

    // Buscar dados do professor
    const { data: professor, error: profError } = await supabase
      .from('professores')
      .select('id, nome, telefone_whatsapp')
      .eq('id', payload.professor_id)
      .single();

    if (profError || !professor) {
      return new Response(
        JSON.stringify({ success: false, error: 'Professor não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!professor.telefone_whatsapp) {
      return new Response(
        JSON.stringify({ success: false, error: 'Professor não possui WhatsApp cadastrado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar carteira do professor
    let carteiraQuery = supabase
      .from('loja_carteira')
      .select('id, saldo, moedas_la')
      .eq('professor_id', payload.professor_id)
      .eq('tipo_titular', 'professor');

    if (payload.carteira_id) {
      carteiraQuery = carteiraQuery.eq('id', payload.carteira_id);
    }

    const { data: carteira, error: carteiraError } = await carteiraQuery.single();

    if (carteiraError || !carteira) {
      return new Response(
        JSON.stringify({ success: false, error: 'Carteira do professor não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar movimentações recentes
    const { data: movimentacoes } = await supabase
      .from('loja_carteira_movimentacoes')
      .select('tipo, valor, created_at, referencia')
      .eq('carteira_id', carteira.id)
      .order('created_at', { ascending: false })
      .limit(10);

    // Buscar valor da Lalita nas configurações
    const { data: configLalita } = await supabase
      .from('loja_configuracoes')
      .select('valor')
      .eq('chave', 'valor_moeda_la')
      .single();

    const valorLalita = parseFloat(configLalita?.valor || '30');

    // Formatar movimentações
    const movimentacoesFormatadas: Movimentacao[] = (movimentacoes || []).map(m => ({
      tipo: m.tipo,
      valor: m.valor,
      data: m.created_at,
      referencia: m.referencia,
    }));

    // Montar mensagem
    const mensagem = montarMensagem({
      professor_nome: professor.nome,
      saldo: carteira.saldo,
      lalitas: carteira.moedas_la || 0,
      valor_lalitas: (carteira.moedas_la || 0) * valorLalita,
      movimentacoes: movimentacoesFormatadas,
      mes_referencia: new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    });

    // Enviar WhatsApp
    const resultado = await enviarWhatsApp(professor.telefone_whatsapp, mensagem, creds);

    return new Response(
      JSON.stringify({
        ...resultado,
        professor: professor.nome,
        saldo: carteira.saldo,
        lalitas: carteira.moedas_la,
      }),
      { 
        status: resultado.success ? 200 : 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[lojinha-relatorio-professor] Erro:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
