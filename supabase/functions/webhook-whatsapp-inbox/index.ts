// Edge Function: webhook-whatsapp-inbox
// Roteador unificado: recebe webhooks da UAZAPI (messages + messages_update)
// - messages: identifica lead, cria/atualiza conversa, insere mensagem
// - messages_update: atualiza status de entrega (enviada/entregue/lida)
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

// Normalizar payload da UAZAPI para formato interno
function normalizeUazapiPayload(payload: any): { key: any; message: any; messageTimestamp: number } | null {
  // Se já tem a estrutura esperada (Baileys), retorna direto
  if (payload.key?.remoteJid) {
    return payload;
  }
  
  // Estrutura UAZAPI: { chat, message, owner, ... }
  if (payload.message?.chatid) {
    const msg = payload.message;
    const content = msg.content || {};
    
    // Construir estrutura normalizada
    return {
      key: {
        remoteJid: msg.chatid,
        fromMe: msg.fromMe === true,
        id: msg.messageid || msg.id
      },
      message: {
        // Texto
        conversation: msg.text || null,
        extendedTextMessage: msg.text ? { text: msg.text } : null,
        // Áudio/PTT
        audioMessage: (msg.mediaType === 'ptt' || msg.mediaType === 'audio' || msg.messageType === 'AudioMessage') ? {
          url: content.URL || content.url || null,
          mimetype: content.mimetype || 'audio/ogg',
          ptt: content.PTT === true
        } : null,
        // Imagem
        imageMessage: msg.mediaType === 'image' ? {
          url: content.URL || content.url || null,
          caption: msg.text || null,
          mimetype: content.mimetype || 'image/jpeg'
        } : null,
        // Vídeo
        videoMessage: msg.mediaType === 'video' ? {
          url: content.URL || content.url || null,
          caption: msg.text || null,
          mimetype: content.mimetype || 'video/mp4'
        } : null,
        // Documento
        documentMessage: msg.mediaType === 'document' ? {
          url: content.URL || content.url || null,
          fileName: content.fileName || 'documento',
          mimetype: content.mimetype || 'application/pdf'
        } : null
      },
      messageTimestamp: msg.messageTimestamp || Date.now()
    };
  }
  
  return null;
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

// ========== HANDLER RESPOSTA EVASÃO ==========
// Verifica se é resposta de pesquisa de evasão e processa
async function handleRespostaEvasao(
  msg: any,
  phone: string,
  supabase: any
): Promise<{ handled: boolean; pesquisa_id?: string }> {
  try {
    // Ignorar mensagens enviadas por nós (fromMe = true)
    if (msg.key?.fromMe === true) {
      console.log(`[webhook-evasao] Ignorando mensagem fromMe=true`);
      return { handled: false };
    }
    
    console.log(`[webhook-evasao] Verificando estado para telefone: ${phone}`);
    
    // Buscar estado de conversa de evasão
    // Tenta match exato primeiro, depois tenta com sufixo (últimos 11 dígitos)
    const phoneSuffix = phone.slice(-11); // Últimos 11 dígitos (DDD + número)
    
    // Buscar por telefone exato, sufixo, ou qualquer estado ativo (fallback para teste)
    let estado = null;
    let estadoError = null;
    
    // Tentativa 1: match exato ou sufixo
    const result1 = await supabase
      .from('conversa_estado_whatsapp')
      .select('*')
      .or(`whatsapp_numero.eq.${phone},whatsapp_numero.like.%${phoneSuffix}`)
      .eq('estado', 'aguardando_resposta_evasao')
      .gt('expira_em', new Date().toISOString())
      .maybeSingle();
    
    estado = result1.data;
    estadoError = result1.error;
    
    console.log(`[webhook-evasao] Tentativa 1 (phone=${phone}, sufixo=${phoneSuffix}): ${estado ? 'encontrado' : 'não encontrado'}`);
    
    // Tentativa 2: se não encontrou, busca qualquer estado ativo (para debug)
    if (!estado) {
      const result2 = await supabase
        .from('conversa_estado_whatsapp')
        .select('*')
        .eq('estado', 'aguardando_resposta_evasao')
        .gt('expira_em', new Date().toISOString())
        .limit(1)
        .maybeSingle();
      
      if (result2.data) {
        console.log(`[webhook-evasao] Tentativa 2 - Estado ativo encontrado para outro telefone: ${result2.data.whatsapp_numero}`);
        // Usar este estado como fallback (temporário para debug)
        estado = result2.data;
      }
    }

    if (estadoError) {
      console.error('[webhook-evasao] Erro ao buscar estado:', estadoError);
    }

    if (!estado) {
      console.log(`[webhook-evasao] Nenhum estado encontrado para ${phone}`);
      return { handled: false };
    }
    
    console.log(`[webhook-evasao] Estado encontrado: ${JSON.stringify(estado)}`)

    const contexto = estado.contexto || {};
    const pesquisaId = contexto.pesquisa_id;

    if (!pesquisaId) {
      return { handled: false };
    }

    // Verificar se a pesquisa ainda está em 'enviado' (não respondida)
    const { data: pesquisa } = await supabase
      .from('pesquisa_evasao')
      .select('id, status')
      .eq('id', pesquisaId)
      .eq('status', 'enviado')
      .maybeSingle();

    if (!pesquisa) {
      return { handled: false };
    }

    // Detectar tipo de mensagem
    const isAudio = msg.message?.audioMessage || msg.message?.ptt || msg.type === 'audio';
    const isText = msg.message?.conversation || msg.message?.extendedTextMessage?.text;

    let respostaTexto = null;
    let respostaAudioUrl = null;
    let respostaTipo = null;

    if (isAudio) {
      respostaTipo = 'audio';
      
      // Transcrever áudio via UAZAPI - UMA chamada só
      // O messageid vem do payload original (antes da normalização)
      const messageId = msg.key?.id;
      console.log(`[webhook-evasao] Tentando transcrever áudio com messageid: ${messageId}`);
      
      if (messageId) {
        try {
          const transcribeResponse = await fetch(
            `${Deno.env.get('UAZAPI_BASE_URL')}/message/download`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'token': Deno.env.get('UAZAPI_TOKEN') || ''  // header minúsculo conforme doc
              },
              body: JSON.stringify({
                id: messageId,
                transcribe: true,
                return_link: true,
                generate_mp3: true,
                openai_apikey: Deno.env.get('OPENAI_API_KEY') || ''  // Chave OpenAI para Whisper
              })
            }
          );
          
          console.log(`[webhook-evasao] Resposta UAZAPI: status=${transcribeResponse.status}`);
          
          if (transcribeResponse.ok) {
            const transcribeData = await transcribeResponse.json();
            console.log(`[webhook-evasao] Dados transcrição: ${JSON.stringify(transcribeData).substring(0, 200)}`);
            
            if (transcribeData.transcription) {
              respostaTexto = transcribeData.transcription;
              console.log(`[webhook-evasao] 🎤 Áudio transcrito: "${respostaTexto.substring(0, 100)}..."`);
            }
            if (transcribeData.fileURL) {
              respostaAudioUrl = transcribeData.fileURL;
            }
          } else {
            const errText = await transcribeResponse.text();
            console.error(`[webhook-evasao] Erro UAZAPI: ${transcribeResponse.status} - ${errText}`);
          }
        } catch (transcribeErr) {
          console.error('[webhook-evasao] Erro ao transcrever áudio:', transcribeErr);
        }
      }
    } else if (isText) {
      respostaTexto = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      respostaTipo = 'texto';
    } else {
      // Tipo não suportado para pesquisa
      return { handled: false };
    }

    // Atualizar pesquisa com a resposta
    await supabase
      .from('pesquisa_evasao')
      .update({
        status: 'respondido',
        resposta_texto: respostaTexto,
        resposta_audio_url: respostaAudioUrl,
        resposta_tipo: respostaTipo,
        respondido_em: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', pesquisaId);

    // Limpar estado da conversa
    await supabase
      .from('conversa_estado_whatsapp')
      .update({
        estado: 'respondido',
        updated_at: new Date().toISOString()
      })
      .eq('whatsapp_numero', phone);

    console.log(`[webhook-evasao] ✅ Resposta registrada: pesquisa ${pesquisaId} (${respostaTipo})`);

    return { handled: true, pesquisa_id: pesquisaId };
  } catch (err) {
    console.error('[webhook-evasao] Erro:', err);
    return { handled: false };
  }
}
// Mapear status UAZAPI para nosso enum
function mapStatus(uazapiStatus: string | number): string | null {
  const statusMap: Record<string, string> = {
    'DELIVERY_ACK': 'entregue',
    'READ': 'lida',
    'PLAYED': 'lida',
    'SERVER_ACK': 'enviada',
    'PENDING': 'enviando',
    'ERROR': 'erro',
    '1': 'enviada',
    '2': 'entregue',
    '3': 'lida',
    '4': 'lida',
    '5': 'erro',
  };
  const key = String(uazapiStatus).toUpperCase();
  return statusMap[key] || null;
}

async function handleStatusUpdate(payload: any, supabase: any): Promise<{ atualizadas: number }> {
  const updates = Array.isArray(payload) ? payload : payload.data ? [payload.data] : [payload];
  let atualizadas = 0;

  for (const update of updates) {
    try {
      const messageId = update.key?.id || update.id || update.messageId;
      const status = update.status || update.update?.status || update.ack;

      if (!messageId || status === undefined) {
        console.log('[webhook-status] Dados incompletos, ignorando');
        continue;
      }

      const novoStatus = mapStatus(status);
      if (!novoStatus) {
        console.log('[webhook-status] Status desconhecido:', status);
        continue;
      }

      const { data, error } = await supabase
        .from('crm_mensagens')
        .update({ status_entrega: novoStatus })
        .eq('whatsapp_message_id', messageId)
        .select('id, conversa_id')
        .maybeSingle();

      if (error) {
        console.error('[webhook-status] Erro ao atualizar:', error);
        continue;
      }

      if (data) {
        atualizadas++;
        console.log(`[webhook-status] Mensagem ${messageId} -> ${novoStatus}`);
      }
    } catch (updateErr) {
      console.error('[webhook-status] Erro individual:', updateErr);
    }
  }

  return { atualizadas };
}

// ========== DETECTAR TIPO DE EVENTO ==========
// messages_update: tem status/ack/update e NAO tem message (conteudo)
function isStatusUpdate(payload: any): boolean {
  const item = Array.isArray(payload) ? payload[0] : payload.data || payload;
  if (!item) return false;
  // Se tem status/ack/update E nao tem message (conteudo), eh status update
  const hasStatus = item.status !== undefined || item.ack !== undefined || item.update?.status !== undefined;
  const hasMessage = item.message !== undefined;
  return hasStatus && !hasMessage;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log('[webhook] Payload recebido:', JSON.stringify(payload).substring(0, 800));

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // DEBUG: Salvar payload no banco para análise
    await supabase.from('webhook_debug_log').insert({ payload });

    // Rotear: messages_update vai para handler de status
    const isStatus = isStatusUpdate(payload);
    console.log(`[webhook] isStatusUpdate=${isStatus}`);
    
    if (isStatus) {
      console.log('[webhook] Detectado: messages_update (status)');
      const result = await handleStatusUpdate(payload, supabase);
      return new Response(
        JSON.stringify({ success: true, tipo: 'status_update', ...result }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[webhook] Detectado: messages (nova mensagem)');

    // UAZAPI envia objeto único com estrutura própria
    // Normalizar para formato interno
    const normalizedMsg = normalizeUazapiPayload(payload);
    const messages = normalizedMsg ? [normalizedMsg] : (Array.isArray(payload) ? payload : payload.data ? [payload.data] : [payload]);
    console.log(`[webhook] Total de mensagens no payload: ${messages.length}, normalizado: ${!!normalizedMsg}`);

    // FORÇAR: Verificar se há estado de evasão ativo e processar qualquer mensagem
    const { data: estadoAtivo } = await supabase
      .from('conversa_estado_whatsapp')
      .select('*')
      .eq('estado', 'aguardando_resposta_evasao')
      .gt('expira_em', new Date().toISOString())
      .limit(1)
      .maybeSingle();
    
    if (estadoAtivo) {
      console.log(`[webhook] ESTADO ATIVO ENCONTRADO: ${estadoAtivo.whatsapp_numero}, pesquisa_id: ${estadoAtivo.contexto?.pesquisa_id}`);
    } else {
      console.log('[webhook] Nenhum estado de evasão ativo encontrado');
    }

    let processadas = 0;

    for (const msg of messages) {
      try {
        console.log(`[webhook-inbox] Payload COMPLETO: ${JSON.stringify(msg).substring(0, 800)}`);
        
        // Ignorar mensagens de grupo
        const remoteJid = msg.key?.remoteJid || msg.remoteJid || msg.from;
        if (!remoteJid || remoteJid.includes('@g.us')) {
          console.log('[webhook-inbox] Ignorando mensagem de grupo:', remoteJid);
          continue;
        }

        const phone = extractPhone(remoteJid);
        console.log(`[webhook-inbox] Telefone extraído: ${phone} de ${remoteJid}, fromMe: ${msg.key?.fromMe}`);
        if (!phone) {
          console.log('[webhook-inbox] Telefone vazio, ignorando');
          continue;
        }

        const whatsappMessageId = msg.key?.id || msg.id || msg.messageId;

        // Verificar se é resposta de pesquisa de evasão ANTES de filtrar fromMe
        // (porque o usuário pode responder do mesmo dispositivo)
        const evasaoResult = await handleRespostaEvasao(msg, phone, supabase);
        if (evasaoResult.handled) {
          console.log(`[webhook-inbox] Resposta de evasão processada: ${evasaoResult.pesquisa_id}`);
          processadas++;
          continue;
        }

        // Ignorar mensagens enviadas por nos (fromMe = true) - apenas para CRM
        if (msg.key?.fromMe === true) {
          console.log('[webhook-inbox] Ignorando mensagem enviada por nos (CRM)');
          continue;
        }

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

        // Detectar reação (reactionMessage) — não é uma mensagem nova, é uma reação a uma existente
        if (msg.message?.reactionMessage) {
          const reaction = msg.message.reactionMessage;
          const reactedMsgId = reaction.key?.id;
          const emoji = reaction.text || '';

          if (reactedMsgId) {
            console.log(`[webhook-inbox] Reação recebida: "${emoji}" na msg ${reactedMsgId}`);

            // Buscar a mensagem reagida
            const { data: msgReagida } = await supabase
              .from('crm_mensagens')
              .select('id, reacoes')
              .eq('whatsapp_message_id', reactedMsgId)
              .maybeSingle();

            if (msgReagida) {
              const reacoesAtuais = Array.isArray(msgReagida.reacoes) ? msgReagida.reacoes : [];
              let novasReacoes;

              if (!emoji) {
                // Remover reação do lead
                novasReacoes = reacoesAtuais.filter((r) => r.de !== 'lead');
              } else {
                // Adicionar/atualizar reação do lead
                const semReacaoLead = reacoesAtuais.filter((r) => r.de !== 'lead');
                novasReacoes = [...semReacaoLead, { emoji, de: 'lead', timestamp: Date.now() }];
              }

              await supabase
                .from('crm_mensagens')
                .update({ reacoes: novasReacoes })
                .eq('id', msgReagida.id);

              console.log(`[webhook-inbox] ✅ Reação salva: ${emoji || '(removida)'} na msg ${msgReagida.id}`);
            } else {
              console.log(`[webhook-inbox] Mensagem reagida não encontrada: ${reactedMsgId}`);
            }
          }
          processadas++;
          continue;
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

        // Atualizar preview e timestamp na conversa
        await supabase
          .from('crm_conversas')
          .update({
            ultima_mensagem_at: new Date().toISOString(),
            ultima_mensagem_preview: conteudo?.substring(0, 100) || `[${tipo}]`,
          })
          .eq('id', conversa.id);

        processadas++;
        console.log(`[webhook-inbox] ✅ Mensagem de ${lead.nome} salva (tipo: ${tipo})`);

      } catch (msgErr) {
        console.error('[webhook-inbox] Erro ao processar mensagem individual:', msgErr);
      }
    }

    return new Response(
      JSON.stringify({ success: true, tipo: 'messages', processadas }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[webhook] Erro geral:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
