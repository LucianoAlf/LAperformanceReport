/// <reference lib="deno.ns" />
// Edge Function: registrar-atribuicao-google-ads
//
// Dois modos, na mesma funcao de proposito -- a logica de casamento e identica e duplica-la
// em duas edges (como o Meta faz) ja custou caro la: `candidatosTelefone` virou copia em
// dois arquivos com aviso de "mudar nas duas".
//
//   POST {...payload da onpromedia...}  -> registra o clique e tenta casar na hora
//   POST {"varrer": true}               -> re-tenta os cliques pendentes (cron)
//   POST {"resolver_campanhas": true}   -> descobre a campanha REAL de cada clique (cron)
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

// click_view so cobre os ultimos 90 dias. Passou disso, a campanha daquele clique nao tem
// mais como ser descoberta -- fica nula para sempre, e isso e um fato sobre a API, nao um bug.
const JANELA_CLICK_VIEW_DIAS = 88;
const VERSOES_ADS = (Deno.env.get('GOOGLE_ADS_API_VERSIONS') ?? 'v25,v24,v23,v22')
  .split(',').map((v) => v.trim()).filter(Boolean);

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
  // O que o Google carimbou na URL. NAO e o campaign.id da API -- ver resolverCampanhas().
  gad_campaignid: string | null;
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
      .update({ gclid: clique.gclid })
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
      gad_campaignid: clique.gad_campaignid,
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
    gad_campaignid: extrairCampanhaId(atribuicao?.page_url_origem),
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

/**
 * Modo cron: descobre a campanha REAL de cada clique, perguntando ao Google pelo gclid.
 *
 * ⚠️ POR QUE ISSO PRECISA EXISTIR: o `gad_campaignid` que vem carimbado na URL NAO e o
 * `campaign.id` da API. Medido em 17/09/2026 -- o clique do lead 14201 trouxe
 * gad_campaignid=23155373713, que nao existe em conta nenhuma (nem na nossa, nem nas 38 do
 * MCC que gerencia a escola, nem como asset_group/ad_group/budget). Perguntando pelo gclid,
 * o Google respondeu campaign.id 23150914508 -- "[CG] [P.MAX] [LEADS] 18.10.2025", que esta
 * na nossa conta. Sao dois identificadores diferentes, e so o segundo cruza com
 * google_ads_metricas_diarias.
 *
 * ⚠️ `click_view` e o UNICO recurso que casa gclid com campanha, e exige `segments.date`
 * de UM dia exato -- nao aceita intervalo. Por isso a consulta e por dia.
 *
 * ⚠️ O clique pode ser de um dia ANTERIOR a conversa (a pessoa clica, sai, volta depois).
 * Por isso cada clique e procurado no dia da conversa e nos 2 anteriores.
 *
 * ⚠️ NAO manda `login-customer-id`: o usuario OAuth alcanca a conta direto e nao e membro
 * do MCC -- mandar o header da 403 com mensagem que sugere exatamente o contrario. Mesma
 * regra ja documentada em capturar-google-ads-diario.
 */
async function resolverCampanhas(supabase: SupabaseClient, body: Record<string, any>) {
  const dev = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN') ?? '';
  const customer = (Deno.env.get('GOOGLE_ADS_CUSTOMER_ID') ?? '').replace(/\D/g, '');
  if (!dev || !customer) {
    return json({ ok: false, error: 'GOOGLE_ADS_DEVELOPER_TOKEN/CUSTOMER_ID nao configurados' }, 500);
  }

  const limiteDias = Number.isFinite(Number(body?.dias)) ? Number(body.dias) : JANELA_CLICK_VIEW_DIAS;
  const corte = new Date(Date.now() - limiteDias * 86400_000).toISOString();

  const { data: pendentes, error } = await supabase
    .from('google_ads_cliques')
    .select('id, gclid, conversa_criada_em, created_at, lead_id')
    .is('campanha_id', null)
    .gte('created_at', corte)
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;

  const resumo = { pendentes: pendentes?.length ?? 0, resolvidos: 0, nao_achados: 0, dias_consultados: 0, erros: [] as string[] };
  if (!pendentes || pendentes.length === 0) {
    console.log('[google-ads/resolver]', JSON.stringify(resumo));
    return json({ ok: true, ...resumo });
  }

  // OAuth (mesmas credenciais da captura diaria -- nada novo)
  const rTok = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_ADS_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('GOOGLE_ADS_CLIENT_SECRET') ?? '',
      refresh_token: Deno.env.get('GOOGLE_ADS_REFRESH_TOKEN') ?? '',
      grant_type: 'refresh_token',
    }),
  });
  const jTok = await rTok.json().catch(() => ({}));
  if (!rTok.ok || !jTok.access_token) {
    const extra = jTok.error === 'invalid_grant' ? ' (refresh token expirado/revogado)' : '';
    return json({ ok: false, error: `oauth ${rTok.status}: ${jTok.error ?? 'sem access_token'}${extra}` }, 502);
  }
  const token = jTok.access_token as string;

  // Agrupa os gclids pelos dias em que o clique pode ter acontecido.
  //
  // Com data da conversa: o dia dela e os 2 anteriores (a pessoa pode clicar, sair e voltar).
  // SEM data da conversa: os ultimos 7 dias a contar de hoje. E o caso das linhas de
  // backfill, cujo `created_at` e a data do LEAD, nao a do clique -- procurar ali erraria o
  // dia por semanas.
  const porDia = new Map<string, string[]>();
  const dia = (iso: string) => iso.slice(0, 10);
  for (const p of pendentes) {
    const temData = !!p.conversa_criada_em;
    const base = temData ? new Date(p.conversa_criada_em) : new Date();
    const janela = temData ? 2 : 6;
    for (let d = 0; d <= janela; d++) {
      const chave = dia(new Date(base.getTime() - d * 86400_000).toISOString());
      if (!porDia.has(chave)) porDia.set(chave, []);
      porDia.get(chave)!.push(p.gclid);
    }
  }

  let versaoOk: string | null = null;
  // gclid -> {id, nome}
  const achados = new Map<string, { id: string; nome: string }>();

  for (const [d, gclids] of porDia) {
    const unicos = [...new Set(gclids)].filter((g) => !achados.has(g));
    if (unicos.length === 0) continue;
    resumo.dias_consultados++;

    const lista = unicos.map((g) => `'${g.replace(/'/g, "")}'`).join(',');
    const query = `SELECT click_view.gclid, campaign.id, campaign.name, segments.date
                   FROM click_view
                   WHERE segments.date = '${d}' AND click_view.gclid IN (${lista})`;

    for (const v of versaoOk ? [versaoOk] : VERSOES_ADS) {
      const r = await fetch(
        `https://googleads.googleapis.com/${v}/customers/${customer}/googleAds:search`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'developer-token': dev, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        },
      );
      if (r.ok) {
        versaoOk = v;
        const jr = await r.json();
        for (const l of (jr.results ?? [])) {
          const g = l?.clickView?.gclid;
          const c = l?.campaign;
          if (g && c?.id) achados.set(g, { id: String(c.id), nome: String(c.name ?? '') });
        }
        break;
      }
      const txt = await r.text();
      if (r.status !== 404) {
        // Erro do pedido (token/permissao/GAQL) -- repetir noutra versao so esconderia a causa.
        resumo.erros.push(`${d}: HTTP ${r.status} ${txt.slice(0, 200)}`);
        break;
      }
    }
  }

  // Grava o que foi descoberto
  for (const p of pendentes) {
    const achado = achados.get(p.gclid);
    if (!achado) { resumo.nao_achados++; continue; }

    const { error: upErr } = await supabase
      .from('google_ads_cliques')
      .update({
        campanha_id: achado.id,
        campanha_nome: achado.nome,
        campanha_resolvida_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', p.id);
    if (upErr) { resumo.erros.push(`clique ${p.id}: ${upErr.message}`); continue; }

    // O lead guarda o id REAL, que e o que cruza com as metricas. Sobrescreve o
    // gad_campaignid que a primeira versao gravou -- ele nao servia para nada.
    if (p.lead_id) {
      const { error: leadErr } = await supabase
        .from('leads')
        .update({ google_ads_campanha_id: achado.id })
        .eq('id', p.lead_id);
      if (leadErr) resumo.erros.push(`lead ${p.lead_id}: ${leadErr.message}`);
    }
    resumo.resolvidos++;
  }

  console.log('[google-ads/resolver]', JSON.stringify(resumo));
  return json({ ok: true, ...resumo });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    if (body?.resolver_campanhas === true) return await resolverCampanhas(supabase, body);
    if (body?.varrer === true) return await varrer(supabase, body);
    return await registrar(supabase, body);
  } catch (e) {
    console.error('[registrar-atribuicao-google-ads]', e);
    return json({ ok: false, error: e instanceof Error ? e.message : 'erro interno' }, 500);
  }
});
