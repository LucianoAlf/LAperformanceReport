// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUazapiCredentials } from '../_shared/uazapi.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CAIXA_SUCESSO_ALUNO_ID = 3; // "Sol – Sucesso do Aluno" (UAZAPI)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Normaliza telefone: só dígitos, garante prefixo 55. Vazio retorna ''.
function normalizarTelefone(tel) {
  const limpo = String(tel || '').replace(/\D/g, '');
  if (!limpo) return '';
  return limpo.startsWith('55') ? limpo : '55' + limpo;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { numeroDestino, vcardId, vcard } = await req.json();

    const destino = normalizarTelefone(numeroDestino);
    if (!destino) return json({ ok: false, erro: 'numeroDestino inválido ou ausente' }, 400);
    if (!vcardId && !vcard) return json({ ok: false, erro: 'Informe vcardId ou vcard' }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // vcard ad-hoc tem prioridade (permite testar edições não salvas)
    let dados = vcard;
    if (!dados && vcardId) {
      const { data, error } = await supabase
        .from('vcards_unidade')
        .select('full_name, telefones, organizacao, email, url')
        .eq('id', vcardId)
        .maybeSingle();
      if (error || !data) return json({ ok: false, erro: 'Cartão não encontrado' }, 404);
      dados = {
        fullName: data.full_name,
        telefones: data.telefones || [],
        organizacao: data.organizacao,
        email: data.email,
        url: data.url,
      };
    }

    const fullName = (dados.fullName || '').trim();
    const telefones = (dados.telefones || []).map(normalizarTelefone).filter(Boolean);
    if (!fullName) return json({ ok: false, erro: 'fullName é obrigatório' }, 400);
    if (telefones.length === 0) return json({ ok: false, erro: 'Informe ao menos um telefone' }, 400);

    const creds = await getUazapiCredentials(supabase, { caixaId: CAIXA_SUCESSO_ALUNO_ID });

    const payload = {
      number: destino,
      fullName,
      phoneNumber: telefones.join(','),
      organization: dados.organizacao || undefined,
      email: dados.email || undefined,
      url: dados.url || undefined,
      delay: 1000,
    };

    const resp = await fetch(`${creds.baseUrl}/send/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: creds.token },
      body: JSON.stringify(payload),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error('[enviar-vcard] UAZAPI erro:', resp.status, data);
      return json({ ok: false, erro: data?.error || `UAZAPI retornou ${resp.status}` }, 502);
    }

    const messageId = data.id || data.messageid || data.key?.id || null;
    return json({ ok: true, messageId });
  } catch (err) {
    console.error('[enviar-vcard] Erro:', err);
    return json({ ok: false, erro: err?.message || 'Erro interno' }, 500);
  }
});
