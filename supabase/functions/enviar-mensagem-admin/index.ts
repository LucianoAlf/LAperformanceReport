// Edge Function: enviar-mensagem-admin
// Envia mensagem administrativa (texto ou mídia) para um aluno via UAZAPI
// Insere no admin_mensagens e envia via WhatsApp
// Usa early-return: responde ao frontend imediatamente após inserir no DB,
// e faz o envio UAZAPI em background via EdgeRuntime.waitUntil()
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUazapiCredentials } from '../_shared/uazapi.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { conversa_id, aluno_id, conteudo, tipo = 'texto', remetente_nome = 'Admin', midia_url, midia_mimetype, midia_nome } = await req.json();

    if (!conversa_id) {
      return new Response(
        JSON.stringify({ error: 'conversa_id é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (tipo === 'texto' && !conteudo) {
      return new Response(
        JSON.stringify({ error: 'conteudo é obrigatório para mensagens de texto' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (['imagem', 'audio', 'video', 'documento'].includes(tipo) && !midia_url) {
      return new Response(
        JSON.stringify({ error: 'midia_url é obrigatório para mensagens de mídia' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Buscar conversa + aluno
    const { data: conversa, error: conversaError } = await supabase
      .from('admin_conversas')
      .select('whatsapp_jid, caixa_id, unidade_id, telefone_externo, nome_externo, aluno:aluno_id(telefone, whatsapp, nome)')
      .eq('id', conversa_id)
      .single();

    if (conversaError || !conversa) {
      console.error('[enviar-mensagem-admin] Conversa não encontrada:', conversaError);
      return new Response(
        JSON.stringify({ error: 'Conversa não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aluno = conversa.aluno as any;
    const telefone = aluno ? (aluno.whatsapp || aluno.telefone) : conversa.telefone_externo;

    if (!telefone) {
      return new Response(
        JSON.stringify({ error: 'Sem telefone para envio' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const numero = conversa.whatsapp_jid || formatPhoneNumber(telefone);

    // 2. Inserir mensagem + buscar creds UAZAPI em paralelo
    const [msgResult, creds] = await Promise.all([
      supabase
        .from('admin_mensagens')
        .insert({
          conversa_id,
          aluno_id: aluno_id || null,
          direcao: 'saida',
          tipo,
          conteudo: conteudo || null,
          midia_url: midia_url || null,
          midia_mimetype: midia_mimetype || null,
          midia_nome: midia_nome || null,
          remetente: 'admin',
          remetente_nome,
          status_entrega: 'enviando',
        })
        .select('id')
        .single(),
      getUazapiCredentials(supabase, {
        funcao: 'administrativo',
        caixaId: conversa.caixa_id ?? undefined,
        unidadeId: conversa.unidade_id ?? undefined,
      }),
    ]);

    const { data: mensagem, error: msgError } = msgResult;

    if (msgError || !mensagem) {
      console.error('[enviar-mensagem-admin] Erro ao inserir mensagem:', msgError);
      return new Response(
        JSON.stringify({ error: 'Erro ao salvar mensagem' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[enviar-mensagem-admin] Mensagem ${mensagem.id} inserida. Enviando para ${numero} via ${creds.caixaNome}...`);

    // 3. EARLY RETURN — responde ao frontend imediatamente
    const response = new Response(
      JSON.stringify({ success: true, mensagem_id: mensagem.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

    // 4. Envio UAZAPI em background (nao bloqueia o frontend)
    EdgeRuntime.waitUntil((async () => {
      try {
        // Montar payload UAZAPI
        let endpoint = '/send/text';
        let uazapiBody: Record<string, any> = {
          number: numero,
          delay: 500,
          readchat: true,
        };

        if (tipo === 'texto') {
          endpoint = '/send/text';
          uazapiBody.text = conteudo;
          uazapiBody.linkPreview = true;
        } else {
          endpoint = '/send/media';
          uazapiBody.file = midia_url;
          uazapiBody.text = conteudo || '';

          switch (tipo) {
            case 'imagem':
              uazapiBody.type = 'image';
              break;
            case 'audio':
              uazapiBody.type = 'ptt';
              break;
            case 'video':
              uazapiBody.type = 'video';
              break;
            case 'documento':
              uazapiBody.type = 'document';
              uazapiBody.docName = midia_nome || 'documento';
              if (midia_mimetype) uazapiBody.mimetype = midia_mimetype;
              break;
            default:
              uazapiBody.type = 'document';
              uazapiBody.docName = midia_nome || 'arquivo';
              break;
          }
        }

        console.log(`[enviar-mensagem-admin] [bg] Endpoint: ${endpoint}, tipo: ${tipo}`);

        // Timeout de 15s para evitar hang
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const uazapiResponse = await fetch(`${creds.baseUrl}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': creds.token,
          },
          body: JSON.stringify(uazapiBody),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        const uazapiData = await uazapiResponse.json();
        console.log('[enviar-mensagem-admin] [bg] Resposta UAZAPI:', JSON.stringify(uazapiData).substring(0, 300));

        if (uazapiResponse.ok && !uazapiData.error) {
          const whatsappMessageId = uazapiData.id || uazapiData.messageid || uazapiData.key?.id;

          // Atualizar mensagem + conversa em paralelo
          const preview = tipo === 'texto' ? (conteudo || '').substring(0, 100) : `📎 ${tipo}`;
          await Promise.all([
            supabase
              .from('admin_mensagens')
              .update({
                status_entrega: 'enviada',
                whatsapp_message_id: whatsappMessageId,
              })
              .eq('id', mensagem.id),
            supabase
              .from('admin_conversas')
              .update({
                ultima_mensagem_at: new Date().toISOString(),
                ultima_mensagem_preview: preview,
                whatsapp_jid: conversa.whatsapp_jid || numero,
                updated_at: new Date().toISOString(),
              })
              .eq('id', conversa_id),
          ]);

          console.log(`[enviar-mensagem-admin] [bg] ✅ Enviada! WhatsApp ID: ${whatsappMessageId}`);
        } else {
          const errorMsg = uazapiData.error || uazapiData.message || 'Erro UAZAPI';
          console.error('[enviar-mensagem-admin] [bg] ❌ Erro UAZAPI:', errorMsg);

          await supabase
            .from('admin_mensagens')
            .update({ status_entrega: 'erro' })
            .eq('id', mensagem.id);
        }
      } catch (bgError) {
        console.error('[enviar-mensagem-admin] [bg] Erro no background:', bgError);

        await supabase
          .from('admin_mensagens')
          .update({ status_entrega: 'erro' })
          .eq('id', mensagem.id);
      }
    })());

    return response;
  } catch (error) {
    console.error('[enviar-mensagem-admin] Erro geral:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
