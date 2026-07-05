// Edge Function: registrar-atribuicao-meta-ads
// Recebe do n8n (workflow "Definir Origem e Etiqueta Pela Mensagem do Anuncio", 5lRs2UVCB9xl0RCP)
// a atribuição de anúncio Meta (Click-to-WhatsApp) capturada no webhook do Chatwoot
// (content_attributes.external_ad_reply) e grava no lead correspondente em `leads`,
// com match por telefone. Loga toda tentativa em leads_automacao_log (evento='meta_ads').
//
// Seguro pós-2026-07-05: os triggers de inflação de dados_comerciais/origem_leads foram
// removidos — UPDATE em leads não tem mais efeito colateral em métricas comerciais.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Gera variantes do telefone no formato de leads.telefone (55 + DDD + numero, só dígitos).
// Cobre: com/sem '+', sem DDI, com/sem o 9º dígito (mesma regra do node formataNumero do n8n).
function candidatosTelefone(raw: string): string[] {
  const d = (raw || '').toString().replace(/\D/g, '');
  if (!d) return [];
  const set = new Set<string>();
  const com55 = d.startsWith('55') && d.length >= 12 ? d : (d.length >= 10 && d.length <= 11 ? '55' + d : d);
  set.add(com55);
  // 55 + DDD + 8 dígitos (sem o 9) → variante com o 9 inserido
  if (/^55\d{10}$/.test(com55)) set.add(com55.replace(/^(55\d{2})(\d{8})$/, '$19$2'));
  // 55 + DDD + 9 + 8 dígitos → variante sem o 9 (caso o lead tenha sido salvo sem)
  if (/^55(\d{2})9(\d{8})$/.test(com55)) set.add(com55.replace(/^55(\d{2})9(\d{8})$/, '55$1$2'));
  return [...set];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const { telefone, source_id, ctwa_clid, source_app, source_url, workflow_id, execution_id } = body ?? {};

    if (!telefone || !source_id) {
      return json({ ok: false, error: 'telefone e source_id são obrigatórios' }, 400);
    }

    const candidatos = candidatosTelefone(String(telefone));
    if (candidatos.length === 0) return json({ ok: false, error: 'telefone inválido' }, 400);

    // Lead mais recente com esse telefone (não arquivado). Pode haver homônimo em outra unidade.
    const { data: leads, error: selErr } = await supabase
      .from('leads')
      .select('id, nome, unidade_id, telefone')
      .in('telefone', candidatos)
      .eq('arquivado', false)
      .order('data_ultimo_contato', { ascending: false, nullsFirst: false })
      .limit(5);
    if (selErr) throw selErr;

    const detalhes = {
      telefone_recebido: telefone,
      candidatos,
      source_id: String(source_id),
      ctwa_clid: ctwa_clid ?? null,
      source_app: source_app ?? null,
      source_url: source_url ?? null,
      matches: leads?.length ?? 0,
    };

    if (!leads || leads.length === 0) {
      await supabase.from('leads_automacao_log').insert({
        lead_nome: '(não encontrado)',
        lead_id: null,
        unidade_nome: null,
        evento: 'meta_ads',
        acao: 'nao_encontrado',
        detalhes,
        workflow_id: workflow_id ?? null,
        execution_id: execution_id ?? null,
        payload_bruto: body,
      });
      return json({ ok: true, action: 'nao_encontrado' });
    }

    const alvo = leads[0];
    const { error: upErr } = await supabase
      .from('leads')
      .update({
        meta_ad_source_id: String(source_id),
        meta_ctwa_clid: ctwa_clid ? String(ctwa_clid) : null,
      })
      .eq('id', alvo.id);
    if (upErr) throw upErr;

    await supabase.from('leads_automacao_log').insert({
      lead_nome: alvo.nome ?? '(sem nome)',
      lead_id: alvo.id,
      unidade_nome: alvo.unidade_id,
      evento: 'meta_ads',
      acao: leads.length > 1 ? 'vinculado_ambiguo' : 'vinculado',
      detalhes,
      workflow_id: workflow_id ?? null,
      execution_id: execution_id ?? null,
      payload_bruto: body,
    });

    return json({ ok: true, action: 'vinculado', lead_id: alvo.id, ambiguo: leads.length > 1 });
  } catch (e) {
    console.error('[registrar-atribuicao-meta-ads]', e);
    return json({ ok: false, error: e instanceof Error ? e.message : 'erro interno' }, 500);
  }
});
