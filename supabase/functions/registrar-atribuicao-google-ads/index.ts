/// <reference lib="deno.ns" />
// Edge Function: registrar-atribuicao-google-ads
//
// Dois modos, na mesma funcao de proposito -- a logica de casamento e identica e duplica-la
// em duas edges (como o Meta faz) ja custou caro la: `candidatosTelefone` virou copia em
// dois arquivos com aviso de "mudar nas duas".
//
//   POST {...payload da onpromedia...}  -> registra o clique e tenta casar na hora
//   POST {"varrer": true}               -> re-tenta os cliques pendentes (cron)
//
// DE ONDE VEM: a onpromedia (plataforma "CQC") opera o redirect entre o anuncio e o
// WhatsApp, captura o gclid ali, e manda um evento por conversa. O n8n (DVqC4ihArH1Pz1vg)
// encaminha o payload cru pra ca.
//
// ⚠️ O MESMO webhook traz Meta e organico -- a onpromedia nao separa por canal do lado dela.
// O braco do Meta ja tem dono (registrar/varrer-atribuicao-meta-ads), entao o filtro
// origem==='google' && gclid e o PRIMEIRO passo, antes de qualquer leitura no banco.
//
// ⚠️ POR QUE EXISTE A VARREDURA: medido em 17/09/2026, o webhook chega ANTES do lead
// existir -- em 5 de 7 conversas o lead nasceu de 1,8 a 3,9 segundos DEPOIS do evento. Uma
// edge one-shot logaria "nao_encontrado" e perderia a atribuicao justamente no caso mais
// comum (lead novo, que e o que interessa).

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CANAL_GOOGLE = 3; // public.canais_origem
const JANELA_VARREDURA_DIAS = 7; // depois disso o clique vira orfao (situacao='expirado')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Copia deliberada da mesma funcao em registrar-atribuicao-meta-ads/index.ts e
// varrer-atribuicao-meta-ads/index.ts (ja documentado la: se a regra de telefone mudar,
// mudar nas tres). Gera variantes no formato de leads.telefone (55 + DDD + numero, so
// digitos), cobrindo com/sem o 9o digito.
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

// gad_campaignid vem dentro da query string de page_url_origem, nao como campo proprio.
// Ausente nao e erro: nem todo clique carrega.
function extrairCampanhaId(pageUrlOrigem: unknown): string | null {
  if (!pageUrlOrigem || typeof pageUrlOrigem !== 'string') return null;
  try {
    return new URL(pageUrlOrigem).searchParams.get('gad_campaignid');
  } catch {
    return null;
  }
}

type Clique = {
  id?: number;
  gclid: string;
  gbraid?: string | null;
  wbraid?: string | null;
  campanha_id: string | null;
  cqc_conversa_id: string | null;
  cqc_event: string | null;
  telefone: string;
  nome_lead: string | null;
  origem: string | null;
  page_url_origem: string | null;
  tracking_link_id: string | null;
  conversa_criada_em: string | null;
  tentativas?: number;
};

type LeadRow = {
  id: number;
  nome: string | null;
  unidade_id: string | null;
  gclid: string | null;
  canal_origem_id: number | null;
  created_at: string;
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/**
 * Tenta casar um clique com o lead do telefone e aplicar a atribuicao.
 *
 * A REGRA DE CANAL, que e o coracao disto:
 *
 *   canal vazio ........................... preenche Google (tapa-buraco, sem risco)
 *   lead criado DEPOIS da conversa ........ sobrescreve -- foi o clique que trouxe a pessoa
 *   lead ja existia antes da conversa ..... nao encosta -- reengajamento, nao originacao
 *
 * ⚠️ O criterio e BINARIO (o lead ja existia?), nao uma janela de tempo. A comparacao usa
 * `conversa_criada_em` do payload, NUNCA a hora em que o webhook chegou: o webhook chega
 * ~1-2s depois da conversa nascer e o lead ~2-4s depois disso, entao comparar pela chegada
 * classificaria errado justamente o caso mais comum.
 *
 * ⚠️ O gclid do lead e FIRST-TOUCH (so grava quando vazio). O clique de reengajamento nao
 * se perde: ele vive na linha propria em google_ads_cliques, com o lead_id casado.
 */
async function casar(supabase: SupabaseClient, clique: Clique) {
  const candidatos = candidatosTelefone(clique.telefone);
  if (candidatos.length === 0) {
    return { situacao: 'expirado', motivo_canal: null, lead_id: null, acao: 'telefone_invalido' };
  }

  const { data: leads, error: selErr } = await supabase
    .from('leads')
    .select('id, nome, unidade_id, gclid, canal_origem_id, created_at')
    .in('telefone', candidatos)
    .eq('arquivado', false)
    .order('data_ultimo_contato', { ascending: false, nullsFirst: false })
    .limit(5);
  if (selErr) throw selErr;

  // Lead ainda nao existe: continua pendente e a varredura re-tenta (a corrida de segundos).
  if (!leads || leads.length === 0) {
    return { situacao: 'pendente', motivo_canal: null, lead_id: null, acao: 'aguardando_lead' };
  }

  // 2+ leads nao-arquivados dividindo o telefone: NAO escolhemos -- mesma politica do Meta.
  if (leads.length > 1) {
    return {
      situacao: 'ambiguo',
      motivo_canal: null,
      lead_id: null,
      acao: 'ambiguo_pendente',
      lead_ids: (leads as LeadRow[]).map((l) => l.id),
    };
  }

  const lead = leads[0] as LeadRow;

  // 1. gclid + campanha: first-touch (so quando vazio). A trava IS NULL fica no WHERE do
  //    UPDATE, entao sobrevive a corrida entre os dois eventos da mesma conversa.
  if (!lead.gclid) {
    const { error: upErr } = await supabase
      .from('leads')
      .update({ gclid: clique.gclid, google_ads_campanha_id: clique.campanha_id })
      .eq('id', lead.id)
      .is('gclid', null);
    if (upErr) throw upErr;
  }

  // 2. canal de origem
  let motivo: string;
  let aplicaCanal: boolean;

  if (lead.canal_origem_id === null) {
    motivo = 'vazio_preenchido';
    aplicaCanal = true;
  } else if (clique.conversa_criada_em && new Date(lead.created_at) >= new Date(clique.conversa_criada_em)) {
    // O lead nasceu depois da conversa => foi este clique que o trouxe. O fato vence a
    // declaracao manual do Emusys.
    motivo = 'sobrescrito';
    aplicaCanal = lead.canal_origem_id !== CANAL_GOOGLE;
  } else {
    // Lead ja existia (ou nao da pra saber, se a conversa veio sem data): nao encosta.
    // Na duvida, preservar -- reatribuir lead antigo faz o canal de retargeting roubar o
    // credito de quem realmente trouxe a pessoa, e muda a serie historica para tras.
    motivo = 'preservado_reengajamento';
    aplicaCanal = false;
  }

  if (aplicaCanal) {
    const { error: canalErr } = await supabase
      .from('leads')
      .update({ canal_origem_id: CANAL_GOOGLE })
      .eq('id', lead.id);
    if (canalErr) throw canalErr;
  }

  await supabase.from('leads_automacao_log').insert({
    lead_nome: lead.nome ?? '(sem nome)',
    lead_id: lead.id,
    unidade_nome: lead.unidade_id,
    evento: 'google_ads',
    acao: 'vinculado',
    detalhes: {
      gclid: clique.gclid,
      gad_campaignid: clique.campanha_id,
      cqc_conversa_id: clique.cqc_conversa_id,
      cqc_event: clique.cqc_event,
      conversa_criada_em: clique.conversa_criada_em,
      lead_created_at: lead.created_at,
      canal_anterior: lead.canal_origem_id,
      motivo_canal: motivo,
      canal_aplicado: aplicaCanal,
      candidatos,
    },
  });

  return { situacao: 'casado', motivo_canal: motivo, lead_id: lead.id, acao: 'vinculado', canal_aplicado: aplicaCanal };
}

/** Grava o resultado do casamento de volta na linha do clique. */
async function anotarResultado(supabase: SupabaseClient, cliqueId: number, r: Record<string, unknown>, tentativas: number) {
  const patch: Record<string, unknown> = {
    situacao: r.situacao,
    motivo_canal: r.motivo_canal ?? null,
    lead_id: r.lead_id ?? null,
    canal_aplicado: r.canal_aplicado === true,
    tentativas: tentativas + 1,
    ultima_tentativa_em: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (r.situacao === 'casado') patch.casado_em = new Date().toISOString();

  const { error } = await supabase.from('google_ads_cliques').update(patch).eq('id', cliqueId);
  if (error) console.error('[google-ads] falha ao anotar resultado no clique', cliqueId, error.message);
}

/** Modo webhook: registra o clique e tenta casar na hora. */
async function registrar(supabase: SupabaseClient, body: Record<string, any>) {
  const atribuicao = body?.atribuicao ?? {};
  const gclid = atribuicao?.gclid ?? null;
  const origem = atribuicao?.origem ?? null;

  // Payload de teste manual da onpromedia (telefone fake). Nunca grava.
  if (body?.teste === true) return json({ ok: true, action: 'ignorado_teste' });

  // Meta e organico passam direto -- nao sao escopo desta funcao.
  if (origem !== 'google' || !gclid) return json({ ok: true, action: 'ignorado_nao_google' });

  const telefone = body?.conversa?.telefone_lead ?? null;
  if (!telefone) {
    await supabase.from('leads_automacao_log').insert({
      lead_nome: '(sem telefone)', lead_id: null, unidade_nome: null,
      evento: 'google_ads', acao: 'sem_telefone',
      detalhes: { gclid, origem }, payload_bruto: body,
    });
    return json({ ok: true, action: 'sem_telefone' });
  }

  const clique: Clique = {
    gclid: String(gclid),
    gbraid: atribuicao?.gbraid ?? null,
    wbraid: atribuicao?.wbraid ?? null,
    campanha_id: extrairCampanhaId(atribuicao?.page_url_origem),
    cqc_conversa_id: body?.conversa?.id ?? null,
    cqc_event: body?.event ?? null,
    telefone: String(telefone),
    nome_lead: body?.conversa?.nome_lead ?? null,
    origem,
    page_url_origem: atribuicao?.page_url_origem ?? null,
    tracking_link_id: atribuicao?.tracking_link_id ?? null,
    conversa_criada_em: body?.conversa?.created_at ?? null,
  };

  // Uma linha por clique. O 2o evento da mesma conversa (conversa.evento_disparado) ecoa a
  // MESMA atribuicao e cai aqui como update, nao como linha nova.
  const { data: gravado, error: upsertErr } = await supabase
    .from('google_ads_cliques')
    .upsert({ ...clique, payload: body, updated_at: new Date().toISOString() }, { onConflict: 'gclid' })
    .select('id, situacao, tentativas, lead_id')
    .single();
  if (upsertErr) throw upsertErr;

  // Ja casado por um evento anterior: nada a refazer.
  if (gravado.situacao === 'casado') {
    return json({ ok: true, action: 'ja_casado', clique_id: gravado.id, lead_id: gravado.lead_id });
  }

  const r = await casar(supabase, clique);
  await anotarResultado(supabase, gravado.id, r, gravado.tentativas ?? 0);

  return json({ ok: true, action: r.acao, clique_id: gravado.id, ...r });
}

/** Modo cron: re-tenta os cliques que ainda nao acharam lead. */
async function varrer(supabase: SupabaseClient, body: Record<string, any>) {
  const dias = Number.isFinite(Number(body?.dias)) ? Math.min(Number(body.dias), 60) : JANELA_VARREDURA_DIAS;
  const corte = new Date(Date.now() - dias * 86400_000).toISOString();

  const { data: pendentes, error } = await supabase
    .from('google_ads_cliques')
    .select('*')
    .eq('situacao', 'pendente')
    .gte('created_at', corte)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw error;

  const resumo = { lidos: pendentes?.length ?? 0, casados: 0, ainda_pendentes: 0, ambiguos: 0, erros: 0, expirados: 0 };

  for (const p of (pendentes ?? []) as (Clique & { id: number; tentativas: number })[]) {
    try {
      const r = await casar(supabase, p);
      await anotarResultado(supabase, p.id, r, p.tentativas ?? 0);
      if (r.situacao === 'casado') resumo.casados++;
      else if (r.situacao === 'ambiguo') resumo.ambiguos++;
      else resumo.ainda_pendentes++;
    } catch (e) {
      // Um clique problematico nao pode derrubar o ciclo inteiro -- mas tambem nao some:
      // o erro sai no log com o gclid e o id da linha.
      resumo.erros++;
      console.error('[google-ads/varrer] clique', p.id, p.gclid, e instanceof Error ? e.message : e);
    }
  }

  // Passou da janela sem nunca achar lead: e clique orfao. Vira 'expirado' para sair da
  // fila -- mas continua na tabela, porque e informacao (verba gasta que nao virou lead).
  const { data: exp, error: expErr } = await supabase
    .from('google_ads_cliques')
    .update({ situacao: 'expirado', updated_at: new Date().toISOString() })
    .eq('situacao', 'pendente')
    .lt('created_at', corte)
    .select('id');
  if (expErr) console.error('[google-ads/varrer] falha ao expirar orfaos:', expErr.message);
  resumo.expirados = exp?.length ?? 0;

  console.log('[google-ads/varrer]', JSON.stringify(resumo));
  return json({ ok: true, ...resumo });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    return body?.varrer === true ? await varrer(supabase, body) : await registrar(supabase, body);
  } catch (e) {
    console.error('[registrar-atribuicao-google-ads]', e);
    return json({ ok: false, error: e instanceof Error ? e.message : 'erro interno' }, 500);
  }
});
