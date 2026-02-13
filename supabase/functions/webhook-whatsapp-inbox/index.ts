// Edge Function: webhook-whatsapp-inbox
// Recebe webhook da UAZAPI (messages.upsert) com mensagens recebidas dos leads
// Identifica lead pelo telefone, cria/atualiza conversa, insere mensagem
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Extrair numero limpo do JID ou remoteJid
function extractPhone(jidOrPhone: string): string {
  if (!jidOrPhone) return '';
  // Remove @s.whatsapp.net ou @g.us
  let phone = jidOrPhone.split('@')[0];
  // Remove qualquer caractere nao numerico
  phone = phone.replace(/\D/g, '');
  return phone;
}

// Determinar tipo de mensagem baseado no payload UAZAPI
function detectMessageType(message: any): { tipo: string; conteudo: string | null; midia_url: string | null; midia_mimetype: string | null; midia_nome: string | null } {
  // Texto simples
  if (message.message?.conversation || message.message?.extendedTextMessage?.text) {
    return {
      tipo: 'texto',
      conteudo: message.message?.conversation || message.message?.extendedTextMessage?.text,
      midia_url: null,
      midia_mimetype: null,
      midia_nome: null,
    };
  }

  // Imagem
  if (message.message?.imageMessage) {
    return {
      tipo: 'imagem',
      conteudo: message.message.imageMessage.caption || null,
      midia_url: message.message.imageMessage.url || null,
      midia_mimetype: message.message.imageMessage.mimetype || 'image/jpeg',
      midia_nome: null,
    };
  }

  // Audio (PTT = mensagem de voz)
  if (message.message?.audioMessage) {
    return {
      tipo: 'audio',
      conteudo: null,
      midia_url: message.message.audioMessage.url || null,
      midia_mimetype: message.message.audioMessage.mimetype || 'audio/ogg',
      midia_nome: null,
    };
  }

  // Video
  if (message.message?.videoMessage) {
    return {
      tipo: 'video',
      conteudo: message.message.videoMessage.caption || null,
      midia_url: message.message.videoMessage.url || null,
      midia_mimetype: message.message.videoMessage.mimetype || 'video/mp4',
      midia_nome: null,
    };
  }

  // Documento
  if (message.message?.documentMessage) {
    return {
      tipo: 'documento',
      conteudo: message.message.documentMessage.caption || null,
      midia_url: message.message.documentMessage.url || null,
      midia_mimetype: message.message.documentMessage.mimetype || 'application/pdf',
      midia_nome: message.message.documentMessage.fileName || null,
    };
  }

  // Sticker
  if (message.message?.stickerMessage) {
    return {
      tipo: 'sticker',
      conteudo: null,
      midia_url: message.message.stickerMessage.url || null,
      midia_mimetype: 'image/webp',
      midia_nome: null,
    };
  }

  // Localizacao
  if (message.message?.locationMessage) {
    const loc = message.message.locationMessage;
    return {
      tipo: 'localizacao',
      conteudo: `${loc.degreesLatitude},${loc.degreesLongitude}`,
      midia_url: null,
      midia_mimetype: null,
      midia_nome: null,
    };
  }

  // Contato
  if (message.message?.contactMessage) {
    return {
      tipo: 'contato',
      conteudo: message.message.contactMessage.displayName || message.message.contactMessage.vcard || null,
      midia_url: null,
      midia_mimetype: null,
      midia_nome: null,
    };
  }

  // Fallback: texto generico
  return {
    tipo: 'texto',
    conteudo: '[Mensagem não suportada]',
    midia_url: null,
    midia_mimetype: null,
    midia_nome: null,
  };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log('[webhook-inbox] Payload recebido:', JSON.stringify(payload).substring(0, 500));

    // UAZAPI envia array de mensagens ou objeto unico
    const messages = Array.isArray(payload) ? payload : payload.data ? [payload.data] : [payload];

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let processadas = 0;

    for (const msg of messages) {
      try {
        // Ignorar mensagens de grupo
        const remoteJid = msg.key?.remoteJid || msg.remoteJid || msg.from;
        if (!remoteJid || remoteJid.includes('@g.us')) {
          console.log('[webhook-inbox] Ignorando mensagem de grupo:', remoteJid);
          continue;
        }

        // Ignorar mensagens enviadas por nos (fromMe = true)
        if (msg.key?.fromMe === true) {
          console.log('[webhook-inbox] Ignorando mensagem enviada por nos');
          continue;
        }

        const phone = extractPhone(remoteJid);
        if (!phone) {
          console.log('[webhook-inbox] Telefone vazio, ignorando');
          continue;
        }

        const whatsappMessageId = msg.key?.id || msg.id || msg.messageId;

        // Verificar se mensagem ja existe (evitar duplicatas)
        if (whatsappMessageId) {
          const { data: existente } = await supabase
            .from('crm_mensagens')
            .select('id')
            .eq('whatsapp_message_id', whatsappMessageId)
            .maybeSingle();

          if (existente) {
            console.log('[webhook-inbox] Mensagem duplicada, ignorando:', whatsappMessageId);
            continue;
          }
        }

        // Buscar lead pelo telefone
        const { data: lead } = await supabase
          .from('leads')
          .select('id, nome, unidade_id')
          .or(`telefone.eq.${phone},whatsapp.eq.${phone}`)
          .limit(1)
          .maybeSingle();

        if (!lead) {
          console.log('[webhook-inbox] Lead nao encontrado para telefone:', phone);
          // Poderiamos criar um lead automaticamente aqui no futuro
          continue;
        }

        console.log(`[webhook-inbox] Lead encontrado: ${lead.nome} (ID: ${lead.id})`);

        // Buscar ou criar conversa
        let { data: conversa } = await supabase
          .from('crm_conversas')
          .select('id, atribuido_a')
          .eq('lead_id', lead.id)
          .maybeSingle();

        if (!conversa) {
          // Criar conversa nova
          const { data: novaConversa, error: criarErr } = await supabase
            .from('crm_conversas')
            .insert({
              lead_id: lead.id,
              status: 'aberta',
              atribuido_a: 'mila',
              whatsapp_jid: phone,
            })
            .select('id, atribuido_a')
            .single();

          if (criarErr) {
            console.error('[webhook-inbox] Erro ao criar conversa:', criarErr);
            continue;
          }
          conversa = novaConversa;
          console.log(`[webhook-inbox] Conversa criada: ${conversa.id}`);
        } else {
          // Atualizar JID se nao tiver
          await supabase
            .from('crm_conversas')
            .update({ whatsapp_jid: phone })
            .eq('id', conversa.id)
            .is('whatsapp_jid', null);
        }

        // Detectar tipo de mensagem
        const { tipo, conteudo, midia_url, midia_mimetype, midia_nome } = detectMessageType(msg);

        // Inserir mensagem
        const { error: insertErr } = await supabase
          .from('crm_mensagens')
          .insert({
            conversa_id: conversa.id,
            lead_id: lead.id,
            direcao: 'entrada',
            tipo,
            conteudo,
            midia_url,
            midia_mimetype,
            midia_nome,
            remetente: 'lead',
            remetente_nome: msg.pushName || lead.nome || 'Lead',
            status_entrega: 'entregue',
            whatsapp_message_id: whatsappMessageId,
            is_sistema: false,
          });

        if (insertErr) {
          console.error('[webhook-inbox] Erro ao inserir mensagem:', insertErr);
          continue;
        }

        processadas++;
        console.log(`[webhook-inbox] ✅ Mensagem de ${lead.nome} salva (tipo: ${tipo})`);

      } catch (msgErr) {
        console.error('[webhook-inbox] Erro ao processar mensagem individual:', msgErr);
      }
    }

    return new Response(
      JSON.stringify({ success: true, processadas }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[webhook-inbox] Erro geral:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
