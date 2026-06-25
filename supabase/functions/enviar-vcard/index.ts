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

// Normaliza telefone: descarta sufixo @..., só dígitos, garante prefixo 55. Vazio -> ''.
function normalizarTelefone(tel) {
  const limpo = String(tel || '').split('@')[0].replace(/\D/g, '');
  if (!limpo) return '';
  return limpo.startsWith('55') ? limpo : '55' + limpo;
}

// Monta um vCard 3.0 (.vcf) a partir dos dados do cartão.
function montarVCard(fullName, telefones, organizacao) {
  const linhas = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${fullName}`];
  if (organizacao) linhas.push(`ORG:${organizacao}`);
  for (const t of telefones) linhas.push(`TEL;type=CELL:${t}`);
  linhas.push('END:VCARD');
  return linhas.join('\n');
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
    const { numeroDestino, vcardId, vcard, conversaId, remetenteNome } = await req.json();

    const destino = normalizarTelefone(numeroDestino);
    if (!destino) return json({ ok: false, erro: 'numeroDestino inválido ou ausente' }, 400);
    if (!vcardId && !vcard) return json({ ok: false, erro: 'Informe vcardId ou vcard' }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // vcard ad-hoc tem prioridade (permite testar edições não salvas)
    let dados = vcard;
    if (!dados && vcardId) {
      const { data, error } = await supabase
        .from('vcards_unidade')
        .select('titulo, full_name, telefones, organizacao, email, url')
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

    // Registro no histórico da conversa (só quando veio de uma conversa do inbox)
    if (conversaId) {
      try {
        const vcf = montarVCard(fullName, telefones, dados.organizacao);
        await supabase.from('admin_mensagens').insert({
          conversa_id: conversaId,
          aluno_id: null,
          direcao: 'saida',
          remetente: 'admin',
          remetente_nome: remetenteNome || 'Admin',
          tipo: 'contato',
          conteudo: vcf,
          midia_nome: fullName,
          status_entrega: 'enviada',
          whatsapp_message_id: messageId,
        });
      } catch (regErr) {
        console.error('[enviar-vcard] Falha ao registrar em admin_mensagens (envio ok):', regErr);
        // não falha o envio por causa do registro
      }
    }

    return json({ ok: true, messageId });
  } catch (err) {
    console.error('[enviar-vcard] Erro:', err);
    return json({ ok: false, erro: err?.message || 'Erro interno' }, 500);
  }
});
