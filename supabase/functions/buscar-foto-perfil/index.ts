// Edge Function: buscar-foto-perfil
// Busca a foto de perfil do WhatsApp via UAZAPI (/chat/details), BAIXA a imagem e
// PERSISTE no Storage (bucket 'avatars', pasta whatsapp/). Grava a URL pública
// permanente em foto_perfil_url.
//
// Antes: salvava direto a URL do WhatsApp (pps.whatsapp.net), que expira em ~20 dias
// (parâmetro oe=), deixando a foto quebrada (403) e nunca era renovada.
// Agora: a URL do Storage não expira. Ao trocar a foto, o arquivo é sobrescrito
// (upsert) e o ?v= faz cache-busting.
//
// Self-contained (getUazapiCredentials inline) para permitir deploy via MCP.
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'avatars';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function toCreds(row: any) {
  let baseUrl = row.uazapi_url || '';
  if (baseUrl && !/^https?:\/\//.test(baseUrl)) baseUrl = 'https://' + baseUrl;
  return { baseUrl: baseUrl.replace(/\/+$/, ''), token: row.uazapi_token, caixaId: row.id, caixaNome: row.nome };
}

// Resolve credenciais UAZAPI da tabela whatsapp_caixas (mesma lógica de _shared/uazapi.ts).
async function getUazapiCredentials(supabase: any, opts: { funcao?: string; caixaId?: number; unidadeId?: string } = {}) {
  const { funcao, caixaId, unidadeId } = opts;

  if (caixaId) {
    const { data } = await supabase.from('whatsapp_caixas')
      .select('id, nome, uazapi_url, uazapi_token').eq('id', caixaId).eq('ativo', true).maybeSingle();
    if (data) return toCreds(data);
  }
  if (funcao && unidadeId) {
    const { data } = await supabase.from('whatsapp_caixas')
      .select('id, nome, uazapi_url, uazapi_token, funcao').eq('ativo', true)
      .eq('unidade_id', unidadeId).in('funcao', [funcao, 'ambos']).limit(1).maybeSingle();
    if (data) return toCreds(data);
  }
  if (funcao) {
    const { data } = await supabase.from('whatsapp_caixas')
      .select('id, nome, uazapi_url, uazapi_token, funcao').eq('ativo', true)
      .in('funcao', [funcao, 'ambos']).limit(1).maybeSingle();
    if (data) return toCreds(data);
  }
  const { data } = await supabase.from('whatsapp_caixas')
    .select('id, nome, uazapi_url, uazapi_token').eq('ativo', true).limit(1).maybeSingle();
  if (data) return toCreds(data);

  throw new Error(`Nenhuma caixa UAZAPI ativa encontrada (funcao=${funcao || 'any'}, unidade=${unidadeId || 'any'})`);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { conversa_id, whatsapp_jid, tabela = 'crm_conversas' } = await req.json();

    if (!conversa_id || !whatsapp_jid) {
      return json({ error: 'conversa_id e whatsapp_jid são obrigatórios' }, 400);
    }

    const isAdmin = tabela === 'admin_conversas';
    const tbl = isAdmin ? 'admin_conversas' : 'crm_conversas';
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Resolver credenciais UAZAPI pela caixa da conversa
    const { data: conversa } = await supabase
      .from(tbl)
      .select('caixa_id, unidade_id')
      .eq('id', conversa_id)
      .single();

    const creds = await getUazapiCredentials(supabase, {
      caixaId: conversa?.caixa_id ?? undefined,
      funcao: isAdmin ? 'administrativo' : 'agente',
      unidadeId: conversa?.unidade_id ?? undefined,
    });

    // 1) Buscar a URL FRESCA da foto via UAZAPI
    const numero = String(whatsapp_jid).replace(/@.*$/, '').replace(/\D/g, '');
    const detResp = await fetch(`${creds.baseUrl}/chat/details`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: creds.token },
      body: JSON.stringify({ number: numero, preview: false }),
    });
    const det = await detResp.json().catch(() => null);
    const fotoUrl = det?.image || det?.imagePreview || null;
    console.log(`[buscar-foto-perfil] caixa=${creds.caixaNome} numero=${numero} temFoto=${!!fotoUrl}`);

    if (!fotoUrl) {
      // Contato sem foto pública (ou privacidade restrita) — nada a persistir.
      return json({ success: true, foto_perfil_url: null, motivo: 'contato_sem_foto' });
    }

    // 2) Baixar o binário da imagem (URL do WhatsApp, ainda fresca)
    const imgResp = await fetch(fotoUrl);
    if (!imgResp.ok) {
      console.error(`[buscar-foto-perfil] download da imagem falhou: ${imgResp.status}`);
      return json({ success: false, error: `download ${imgResp.status}` }, 502);
    }
    const bytes = new Uint8Array(await imgResp.arrayBuffer());
    const contentType = imgResp.headers.get('content-type') || 'image/jpeg';

    // 3) Subir pro Storage (1 arquivo por número, sobrescreve na troca de foto)
    const path = `whatsapp/${numero}.jpg`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType, upsert: true });
    if (upErr) {
      console.error('[buscar-foto-perfil] upload Storage falhou:', upErr.message);
      return json({ success: false, error: upErr.message }, 500);
    }

    // 4) URL pública permanente (+ cache-busting)
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = `${pub.publicUrl}?v=${Date.now()}`;

    await supabase.from(tbl).update({ foto_perfil_url: publicUrl }).eq('id', conversa_id);
    console.log(`[buscar-foto-perfil] ✅ Foto persistida no Storage p/ conversa ${conversa_id}`);

    return json({ success: true, foto_perfil_url: publicUrl });
  } catch (error) {
    console.error('[buscar-foto-perfil] Erro:', error);
    return json({ error: error instanceof Error ? error.message : 'Erro interno' }, 500);
  }
});
