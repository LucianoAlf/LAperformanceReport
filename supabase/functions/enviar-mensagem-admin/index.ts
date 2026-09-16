// Edge Function: enviar-mensagem-admin
// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getWhatsAppCredentials } from './_shared/uazapi.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

function formatPhoneNumber(phone) { let c = phone.replace(/\D/g, ''); if (c.startsWith('0')) c = c.substring(1); if (!c.startsWith('55')) c = '55' + c; return c; }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json();
    if (body.ping) return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const { conversa_id, aluno_id, conteudo, tipo = 'texto', remetente_nome = 'Admin', midia_url, midia_mimetype, midia_nome } = body;
    if (!conversa_id) return new Response(JSON.stringify({ error: 'conversa_id e obrigatorio' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (tipo === 'texto' && !conteudo) return new Response(JSON.stringify({ error: 'conteudo e obrigatorio para mensagens de texto' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (['imagem', 'audio', 'video', 'documento'].includes(tipo) && !midia_url) return new Response(JSON.stringify({ error: 'midia_url e obrigatorio para mensagens de midia' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: conversa, error: conversaError } = await supabase.from('admin_conversas').select('whatsapp_jid, caixa_id, unidade_id, departamento, telefone_externo, nome_externo, aluno:aluno_id(telefone, whatsapp, nome)').eq('id', conversa_id).single();
    if (conversaError || !conversa) return new Response(JSON.stringify({ error: 'Conversa nao encontrada' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const aluno = conversa.aluno;
    const telefone = aluno ? (aluno.whatsapp || aluno.telefone) : conversa.telefone_externo;
    if (!telefone) return new Response(JSON.stringify({ error: 'Sem telefone para envio' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const numero = conversa.whatsapp_jid || formatPhoneNumber(telefone);
    const [msgResult, creds] = await Promise.all([
      supabase.from('admin_mensagens').insert({ conversa_id, aluno_id: aluno_id || null, direcao: 'saida', tipo, conteudo: conteudo || null, midia_url: midia_url || null, midia_mimetype: midia_mimetype || null, midia_nome: midia_nome || null, remetente: 'admin', remetente_nome, status_entrega: 'enviando' }).select('id').single(),
      getWhatsAppCredentials(supabase, { funcao: 'administrativo', caixaId: conversa.caixa_id ?? undefined, unidadeId: conversa.unidade_id ?? undefined, departamento: conversa.departamento ?? undefined }),
    ]);
    const { data: mensagem, error: msgError } = msgResult;
    if (msgError || !mensagem) return new Response(JSON.stringify({ error: 'Erro ao salvar mensagem' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    console.log(`[enviar-mensagem-admin] Mensagem ${mensagem.id} inserida. Enviando para ${numero} via ${creds.caixaNome} (depto=${conversa.departamento})...`);
    const response = new Response(JSON.stringify({ success: true, mensagem_id: mensagem.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    EdgeRuntime.waitUntil((async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        let waResponse;
        if (creds.provedor === 'waha') {
          const chatId = numero.includes('@') ? numero : `${numero}@c.us`;
          const headers = { 'Content-Type': 'application/json' };
          if (creds.wahaApiKey) headers['X-Api-Key'] = creds.wahaApiKey;
          let wahaEndpoint, wahaBody = { session: creds.wahaSession, chatId };
          if (tipo === 'texto') { wahaEndpoint = '/api/sendText'; wahaBody.text = conteudo; }
          else if (tipo === 'imagem') { wahaEndpoint = '/api/sendImage'; wahaBody.file = { url: midia_url }; wahaBody.caption = conteudo || ''; }
          else if (tipo === 'audio') { wahaEndpoint = '/api/sendVoice'; wahaBody.file = { url: midia_url }; }
          else if (tipo === 'video') { wahaEndpoint = '/api/sendVideo'; wahaBody.file = { url: midia_url }; wahaBody.caption = conteudo || ''; }
          else { wahaEndpoint = '/api/sendFile'; wahaBody.file = { url: midia_url }; wahaBody.filename = midia_nome || 'arquivo'; }
          waResponse = await fetch(`${creds.wahaUrl}${wahaEndpoint}`, { method: 'POST', headers, body: JSON.stringify(wahaBody), signal: controller.signal });
        } else {
          let endpoint = '/send/text';
          let uazapiBody = { number: numero, delay: 500, readchat: true };
          if (tipo === 'texto') { uazapiBody.text = conteudo; uazapiBody.linkPreview = true; }
          else {
            endpoint = '/send/media';
            uazapiBody.file = midia_url;
            uazapiBody.text = conteudo || '';
            switch (tipo) {
              case 'imagem': uazapiBody.type = 'image'; break;
              case 'audio': uazapiBody.type = 'ptt'; break;
              case 'video': uazapiBody.type = 'video'; break;
              case 'documento': uazapiBody.type = 'document'; uazapiBody.docName = midia_nome || 'documento'; if (midia_mimetype) uazapiBody.mimetype = midia_mimetype; break;
              default: uazapiBody.type = 'document'; uazapiBody.docName = midia_nome || 'arquivo';
            }
          }
          waResponse = await fetch(`${creds.baseUrl}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'token': creds.token }, body: JSON.stringify(uazapiBody), signal: controller.signal });
        }
        clearTimeout(timeout);
        const uazapiData = await waResponse.json();
        if (waResponse.ok && !uazapiData.error) {
          const whatsappMessageId = uazapiData.id || uazapiData.messageid || uazapiData.key?.id;
          const preview = tipo === 'texto' ? (conteudo || '').substring(0, 100) : `midia: ${tipo}`;
          await Promise.all([
            supabase.from('admin_mensagens').update({ status_entrega: 'enviada', whatsapp_message_id: whatsappMessageId }).eq('id', mensagem.id),
            supabase.from('admin_conversas').update({ ultima_mensagem_at: new Date().toISOString(), ultima_mensagem_preview: preview, whatsapp_jid: conversa.whatsapp_jid || numero, updated_at: new Date().toISOString() }).eq('id', conversa_id),
          ]);
          console.log(`[enviar-mensagem-admin] [bg] Enviada! ID: ${whatsappMessageId}`);
        } else {
          const errorMsg = uazapiData.error || uazapiData.message || 'Erro WhatsApp';
          console.error('[enviar-mensagem-admin] [bg] Erro WhatsApp:', errorMsg);
          await supabase.from('admin_mensagens').update({ status_entrega: 'erro' }).eq('id', mensagem.id);
        }
      } catch (bgError) {
        console.error('[enviar-mensagem-admin] [bg] Erro no background:', bgError);
        await supabase.from('admin_mensagens').update({ status_entrega: 'erro' }).eq('id', mensagem.id);
      }
    })());
    return response;
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
