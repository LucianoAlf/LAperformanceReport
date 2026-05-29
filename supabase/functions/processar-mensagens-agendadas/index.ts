// Edge Function: processar-mensagens-agendadas
// Busca mensagens agendadas com status 'pendente' e agendada_para <= agora
// Envia cada uma via a Edge Function enviar-mensagem-lead
// Também processa fila_relatorios_whatsapp (relatórios diários com 1 min de intervalo)
// Chamada via Supabase Cron a cada minuto
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const WA_FIELDS = 'id,nome,provedor,uazapi_url,uazapi_token,waha_url,waha_session,waha_api_key';
interface WhatsAppCreds { caixaId: number; caixaNome: string; provedor: string; baseUrl: string; token: string; wahaUrl?: string; wahaSession?: string; wahaApiKey?: string; }
async function getWhatsAppCredentials(supabase: any, opts: { funcao?: string; caixaId?: number; unidadeId?: string } = {}): Promise<WhatsAppCreds> {
  const { funcao, caixaId, unidadeId } = opts;
  const toCreds = (row: any): WhatsAppCreds => {
    let baseUrl = row.uazapi_url || '';
    if (baseUrl && !baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) baseUrl = 'https://' + baseUrl;
    return { caixaId: row.id, caixaNome: row.nome, provedor: row.provedor || 'uazapi', baseUrl: baseUrl.replace(/\/+$/, ''), token: row.uazapi_token || '', wahaUrl: row.waha_url ? row.waha_url.replace(/\/+$/, '') : undefined, wahaSession: row.waha_session || undefined, wahaApiKey: row.waha_api_key || undefined };
  };
  if (caixaId) {
    const { data } = await supabase.from('whatsapp_caixas').select(WA_FIELDS).eq('id', caixaId).eq('ativo', true).maybeSingle();
    if (data) return toCreds(data);
  }
  if (funcao && unidadeId) {
    const { data } = await supabase.from('whatsapp_caixas').select(WA_FIELDS).eq('ativo', true).eq('unidade_id', unidadeId).in('funcao', [funcao, 'ambos']).limit(1).maybeSingle();
    if (data) return toCreds(data);
  }
  if (funcao) {
    const { data } = await supabase.from('whatsapp_caixas').select(WA_FIELDS).eq('ativo', true).in('funcao', [funcao, 'ambos']).limit(1).maybeSingle();
    if (data) return toCreds(data);
  }
  const { data } = await supabase.from('whatsapp_caixas').select(WA_FIELDS).eq('ativo', true).limit(1).maybeSingle();
  if (data) return toCreds(data);
  throw new Error(`Nenhuma caixa WhatsApp ativa encontrada (funcao=${funcao || 'any'}, unidade=${unidadeId || 'any'})`);
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const agora = new Date().toISOString();

    // Buscar mensagens pendentes que já passaram do horário agendado
    const { data: mensagens, error: errBusca } = await supabase
      .from('crm_mensagens_agendadas')
      .select('*, conversa:conversa_id(lead_id)')
      .eq('status', 'pendente')
      .lte('agendada_para', agora)
      .order('agendada_para', { ascending: true })
      .limit(20);

    if (errBusca) {
      console.error('[processar-agendadas] Erro ao buscar:', errBusca);
      return new Response(
        JSON.stringify({ error: errBusca.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!mensagens || mensagens.length === 0) {
      const agenteFilaProcessadas = await processarFilaAgente(supabase);
      const relatoriosEnviados = await processarFilaRelatorios(supabase);
      return new Response(
        JSON.stringify({ ok: true, processadas: 0, mensagem: 'Nenhuma mensagem pendente', agente_fila: agenteFilaProcessadas, relatorios: relatoriosEnviados }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[processar-agendadas] ${mensagens.length} mensagem(ns) para enviar`);

    let enviadas = 0;
    let erros = 0;

    for (const msg of mensagens) {
      try {
        // Marcar como 'enviando' para evitar duplicatas
        await supabase
          .from('crm_mensagens_agendadas')
          .update({ status: 'enviando' })
          .eq('id', msg.id);

        // Chamar a Edge Function de envio
        const response = await fetch(`${SUPABASE_URL}/functions/v1/enviar-mensagem-lead`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            conversa_id: msg.conversa_id,
            lead_id: msg.lead_id,
            conteudo: msg.conteudo,
            tipo: msg.tipo || 'texto',
            remetente: msg.criado_por || 'andreza',
          }),
        });

        if (response.ok) {
          await supabase
            .from('crm_mensagens_agendadas')
            .update({ status: 'enviada', enviada_em: new Date().toISOString() })
            .eq('id', msg.id);
          enviadas++;
          console.log(`[processar-agendadas] ✅ Msg ${msg.id} enviada`);
        } else {
          const errBody = await response.text();
          await supabase
            .from('crm_mensagens_agendadas')
            .update({ status: 'erro', erro: errBody })
            .eq('id', msg.id);
          erros++;
          console.error(`[processar-agendadas] ❌ Msg ${msg.id} erro:`, errBody);
        }
      } catch (errMsg) {
        await supabase
          .from('crm_mensagens_agendadas')
          .update({ status: 'erro', erro: String(errMsg) })
          .eq('id', msg.id);
        erros++;
        console.error(`[processar-agendadas] ❌ Msg ${msg.id} exceção:`, errMsg);
      }
    }

    // ─── Processar fila do agente IA ──────────────────────────────────────────
    const agenteFilaProcessadas = await processarFilaAgente(supabase);
    if (agenteFilaProcessadas > 0) {
      console.log(`[processar-agendadas] 🤖 ${agenteFilaProcessadas} msg(s) da fila do agente processadas`);
    }

    // ─── Processar fila de relatórios WhatsApp ────────────────────────────────
    const relatoriosEnviados = await processarFilaRelatorios(supabase);
    if (relatoriosEnviados > 0) {
      console.log(`[processar-agendadas] 📋 ${relatoriosEnviados} relatório(s) enviado(s)`);
    }

    return new Response(
      JSON.stringify({ ok: true, processadas: mensagens.length, enviadas, erros, agente_fila: agenteFilaProcessadas, relatorios: relatoriosEnviados }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[processar-agendadas] Erro geral:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ─── Processar fila de relatórios WhatsApp ────────────────────────────────────

async function processarFilaRelatorios(supabase: any): Promise<number> {
  const agora = new Date().toISOString();

  const { data: itens, error } = await supabase
    .from('fila_relatorios_whatsapp')
    .select('id, unidade_id, unidade_nome, jid, grupo_nome, texto')
    .eq('status', 'pendente')
    .lte('agendada_para', agora)
    .order('agendada_para', { ascending: true })
    .limit(1); // 1 por vez — cron roda a cada minuto

  if (error) {
    console.error('[processar-agendadas] Erro ao buscar fila de relatórios:', error.message);
    return 0;
  }
  if (!itens?.length) return 0;

  const item = itens[0];

  await supabase
    .from('fila_relatorios_whatsapp')
    .update({ status: 'enviando' })
    .eq('id', item.id);

  try {
    const creds = await getWhatsAppCredentials(supabase, { funcao: 'sistema', unidadeId: item.unidade_id });

    let response: Response;
    if (creds.provedor === 'waha') {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (creds.wahaApiKey) headers['X-Api-Key'] = creds.wahaApiKey;
      response = await fetch(`${creds.wahaUrl}/api/sendText`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ session: creds.wahaSession, chatId: item.jid, text: item.texto }),
      });
    } else {
      response = await fetch(`${creds.baseUrl}/send/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'token': creds.token },
        body: JSON.stringify({ number: item.jid, text: item.texto, delay: 0, readchat: true }),
      });
    }

    const data = await response.json().catch(() => ({}));
    const success = response.ok && !data.error;

    if (success) {
      await supabase
        .from('fila_relatorios_whatsapp')
        .update({ status: 'enviada', enviada_em: new Date().toISOString() })
        .eq('id', item.id);
      console.log(`[processar-agendadas] ✅ Relatório enviado: ${item.unidade_nome} → ${item.grupo_nome}`);
    } else {
      const errMsg = typeof data.error === 'string' ? data.error : JSON.stringify(data);
      await supabase
        .from('fila_relatorios_whatsapp')
        .update({ status: 'erro', erro: errMsg })
        .eq('id', item.id);
      console.error(`[processar-agendadas] ❌ Erro ao enviar relatório ${item.unidade_nome}:`, errMsg);
    }
  } catch (err) {
    await supabase
      .from('fila_relatorios_whatsapp')
      .update({ status: 'erro', erro: String(err) })
      .eq('id', item.id);
    console.error(`[processar-agendadas] ❌ Exceção ao enviar relatório ${item.unidade_nome}:`, err);
  }

  return 1;
}

// ─── Processar fila do agente IA (debounce) ──────────────────────────────────

async function processarFilaAgente(supabase: any): Promise<number> {
  const agora = new Date().toISOString()

  // Safety: destravar filas stuck (processando há mais de 5 min)
  await supabase
    .from('agente_fila_mensagens')
    .update({ processando: false })
    .eq('processando', true)
    .lt('created_at', new Date(Date.now() - 5 * 60000).toISOString())

  // Buscar pendentes com processar_apos no passado
  const { data: pendentes } = await supabase
    .from('agente_fila_mensagens')
    .select('id, agente_id, unidade_id, telefone')
    .eq('processando', false)
    .lte('processar_apos', agora)
    .limit(10)

  if (!pendentes?.length) return 0

  for (const item of pendentes) {
    fetch(`${SUPABASE_URL}/functions/v1/agente-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({
        unidade_id: item.unidade_id,
        agente_id: item.agente_id,
        telefone: item.telefone,
        texto: '',
        tipo_mensagem: 'debounce_trigger',
      }),
    }).catch(err => console.error('[processar-agendadas] Erro fila agente:', err))
  }

  return pendentes.length
}
