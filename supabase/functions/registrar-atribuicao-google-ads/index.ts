/// <reference lib="deno.ns" />
// Edge Function: registrar-atribuicao-google-ads
//
// Recebe do n8n (workflow "[GOOGLE ADS] Webhook onpromedia - captura clique",
// DVqC4ihArH1Pz1vg) o evento de conversa que a onpromedia (plataforma "CQC") manda em
// tempo real, e grava no lead correspondente o gclid + campanha do Google Ads, com match
// por telefone. Loga toda tentativa em leads_automacao_log (evento='google_ads').
//
// O MESMO webhook da onpromedia manda conversas de Meta e organicas tambem (ela nao
// separa por canal do lado dela) -- por isso o filtro por atribuicao.origem==='google' E
// gclid presente e o PRIMEIRO passo, antes de qualquer leitura no banco. O braco do Meta
// ja tem dono (registrar-atribuicao-meta-ads / varrer-atribuicao-meta-ads); esta function
// nao toca nele.
//
// FIRST-TOUCH: so grava quando leads.gclid esta vazio -- mesma politica do
// meta_ad_source_id em varrer-atribuicao-meta-ads. A trava IS NULL fica no WHERE do
// UPDATE, entao e segura mesmo com o evento duplicado (a onpromedia manda
// conversa.criada e depois conversa.evento_disparado pra mesma conversa, com a MESMA
// atribuicao ecoada).
//
// Ambiguos NAO sao resolvidos aqui: quando 2+ leads nao-arquivados dividem o telefone e
// mais de um esta sem gclid, registra ambiguo_pendente no log para decisao humana --
// mesma politica do Meta.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Copia deliberada da mesma funcao em registrar-atribuicao-meta-ads/index.ts e
// varrer-atribuicao-meta-ads/index.ts (ja documentado la: mudar a regra de telefone
// exige mudar nas tres). Gera variantes no formato de leads.telefone (55 + DDD + numero,
// so digitos), cobrindo com/sem 9o digito.
function candidatosTelefone(raw: string): string[] {
  const d = (raw || '').toString().replace(/\D/g, '');
  if (!d) return [];
  const set = new Set<string>();
  const com55 = d.startsWith('55') && d.length >= 12 ? d : (d.length >= 10 && d.length <= 11 ? '55' + d : d);
  set.add(com55);
  if (/^55\d{10}$/.test(com55)) set.add(com55.replace(/^(55\d{2})(\d{8})$/, '$19$2'));
  if (/^55(\d{2})9(\d{8})$/.test(com55)) set.add(com55.replace(/^55(\d{2})9(\d{8})$/, '55$1$2'));
  return [...set];
}

// gad_campaignid vem dentro da query string de atribuicao.page_url_origem, nao como
// campo proprio -- extrai se presente. Ausente nao e erro (nem todo clique carrega).
function extrairCampanhaId(pageUrlOrigem: unknown): string | null {
  if (!pageUrlOrigem || typeof pageUrlOrigem !== 'string') return null;
  try {
    const url = new URL(pageUrlOrigem);
    return url.searchParams.get('gad_campaignid');
  } catch {
    return null;
  }
}

type LeadRow = { id: number; nome: string | null; unidade_id: string | null; gclid: string | null };

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));

    const evento = body?.event ?? null;
    const conversaId = body?.conversa?.id ?? null;
    const telefone = body?.conversa?.telefone_lead ?? null;
    const atribuicao = body?.atribuicao ?? {};
    const gclid = atribuicao?.gclid ?? null;
    const origem = atribuicao?.origem ?? null;
    const campanhaId = extrairCampanhaId(atribuicao?.page_url_origem);

    const detalhesBase = {
      cqc_event: evento,
      cqc_conversa_id: conversaId,
      telefone_recebido: telefone,
      origem_recebida: origem,
      gclid,
      gad_campaignid: campanhaId,
      page_url_origem: atribuicao?.page_url_origem ?? null,
      tracking_link_id: atribuicao?.tracking_link_id ?? null,
    };

    // Payload de teste manual (nunca gravar) -- ver 2026-09-17, testes do Rayan com
    // "teste": true e telefone fake 5511999999999.
    if (body?.teste === true) {
      return json({ ok: true, action: 'ignorado_teste' });
    }

    // O mesmo webhook traz Meta e organico -- so nos interessa o que tem gclid de verdade.
    if (origem !== 'google' || !gclid) {
      return json({ ok: true, action: 'ignorado_nao_google' });
    }

    if (!telefone) {
      await supabase.from('leads_automacao_log').insert({
        lead_nome: '(sem telefone)', lead_id: null, unidade_nome: null,
        evento: 'google_ads', acao: 'sem_telefone',
        detalhes: detalhesBase, payload_bruto: body,
      });
      return json({ ok: true, action: 'sem_telefone' });
    }

    const candidatos = candidatosTelefone(String(telefone));
    if (candidatos.length === 0) {
      await supabase.from('leads_automacao_log').insert({
        lead_nome: '(telefone invalido)', lead_id: null, unidade_nome: null,
        evento: 'google_ads', acao: 'sem_telefone',
        detalhes: { ...detalhesBase, motivo: 'telefone_invalido' }, payload_bruto: body,
      });
      return json({ ok: true, action: 'telefone_invalido' });
    }

    const { data: leads, error: selErr } = await supabase
      .from('leads')
      .select('id, nome, unidade_id, gclid')
      .in('telefone', candidatos)
      .eq('arquivado', false)
      .order('data_ultimo_contato', { ascending: false, nullsFirst: false })
      .limit(5);
    if (selErr) throw selErr;

    const detalhes = { ...detalhesBase, candidatos, matches: leads?.length ?? 0 };

    if (!leads || leads.length === 0) {
      await supabase.from('leads_automacao_log').insert({
        lead_nome: '(nao encontrado)', lead_id: null, unidade_nome: null,
        evento: 'google_ads', acao: 'nao_encontrado',
        detalhes, payload_bruto: body,
      });
      return json({ ok: true, action: 'nao_encontrado' });
    }

    const incompletos = (leads as LeadRow[]).filter((l) => !l.gclid);

    if (incompletos.length === 0) {
      // Todos os leads desse telefone ja tem gclid -- provavel reenvio do mesmo evento
      // (conversa.criada + conversa.evento_disparado ecoando a mesma atribuicao).
      return json({ ok: true, action: 'ja_completo' });
    }

    if (incompletos.length > 1) {
      await supabase.from('leads_automacao_log').insert({
        lead_nome: incompletos.map((l) => l.nome ?? '(sem nome)').join(' | '),
        lead_id: null, unidade_nome: null,
        evento: 'google_ads', acao: 'ambiguo_pendente',
        detalhes: { ...detalhes, lead_ids: incompletos.map((l) => l.id) },
        payload_bruto: body,
      });
      return json({ ok: true, action: 'ambiguo_pendente', lead_ids: incompletos.map((l) => l.id) });
    }

    const alvo = incompletos[0];
    const { data: upd, error: upErr } = await supabase
      .from('leads')
      .update({ gclid: String(gclid), google_ads_campanha_id: campanhaId })
      .eq('id', alvo.id)
      .is('gclid', null)
      .select('id');
    if (upErr) throw upErr;

    if (!upd || upd.length === 0) {
      // Corrida: outro evento chegou entre o SELECT e o UPDATE e preencheu o gclid antes.
      return json({ ok: true, action: 'ja_completo_corrida' });
    }

    // canal_origem_id em UPDATE separado e com trava propria -- mesmo motivo do
    // varrer-atribuicao-meta-ads: se essa coluna ja estivesse preenchida (por ex. o
    // Emusys mandou outro canal), um update so bloquearia a gravacao do gclid tambem.
    const { error: canalErr } = await supabase
      .from('leads')
      .update({ canal_origem_id: 3 }) // 3 = Google, ver public.canais_origem
      .eq('id', alvo.id)
      .is('canal_origem_id', null);
    if (canalErr) throw canalErr;

    await supabase.from('leads_automacao_log').insert({
      lead_nome: alvo.nome ?? '(sem nome)', lead_id: alvo.id, unidade_nome: alvo.unidade_id,
      evento: 'google_ads', acao: 'vinculado',
      detalhes, payload_bruto: body,
    });

    return json({ ok: true, action: 'vinculado', lead_id: alvo.id });
  } catch (e) {
    console.error('[registrar-atribuicao-google-ads]', e);
    return json({ ok: false, error: e instanceof Error ? e.message : 'erro interno' }, 500);
  }
});
