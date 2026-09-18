/// <reference lib="deno.ns" />
// Edge Function: enviar-conversoes-google-ads  (Fase 3 do rastreio do Google)
//
// Devolve ao Google Ads a matricula que nasceu de um clique pago: "este gclid virou
// matricula, R$ X". E o unico passo do projeto que muda o COMPORTAMENTO da campanha em vez
// de so mudar a nossa visao dela -- o Smart Bidding para de perseguir as 2.510 conversoes
// declaradas (clique no botao de WhatsApp) e passa a perseguir as matriculas reais.
//
//   POST {"diagnostico": true}           -> le a conta e a fila. NAO escreve em lugar nenhum.
//   POST {"dry_run": true}  (ou vazio)   -> monta o payload e devolve. NAO envia ao Google.
//   POST {"enviar": true}                -> envia de verdade e grava o que enviou.
//   POST {"criar_conversion_action": true} -> cria a conversion action na conta. ⚠️ ver abaixo.
//
// ⚠️ O PADRAO E DRY RUN, E ISSO E DELIBERADO. Conversao enviada ao Google nao se apaga: so se
// retrata por outra chamada de API, item a item. Um engano aqui nao e "rodar de novo depois" --
// e ensinar ao algoritmo um fato falso sobre o negocio, com verba atras.
//
// ⚠️ `criar_conversion_action` E O UNICO MODO QUE ALTERA A CONTA DE MIDIA. Ele nasce com
// `primaryForGoal: false` de proposito: a conversao entra como OBSERVACAO, nao como meta de
// lance. Trocar a meta de lance reinicia o aprendizado da campanha (1-2 semanas de
// instabilidade) e so deve acontecer quando houver volume -- medido em 17/09/2026, a conta
// tem 9 matriculas/ano com origem Google atribuida, contra a referencia de ~30/mes por
// campanha que o Smart Bidding pede. O gargalo da Fase 3 nao e o valor, e o volume.
//
// ⚠️ NAO manda `login-customer-id`: o usuario OAuth alcanca a conta direto e nao e membro do
// MCC -- mandar o header da 403 com mensagem que sugere exatamente o contrario. Mesma regra
// ja documentada em registrar-atribuicao-google-ads e capturar-google-ads-diario.
//
// ⚠️ NAO SOBE PII. O que vai para o Google e gclid + valor + data. Nome e telefone ficam aqui.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VERSOES_ADS = (Deno.env.get('GOOGLE_ADS_API_VERSIONS') ?? 'v25,v24,v23,v22')
  .split(',').map((v) => v.trim()).filter(Boolean);

// Janela de lookback da conversion action. O Google recusa conversao cujo clique seja mais
// velho que isso. 90 e o maximo que a API aceita, e e o que a action e criada pedindo.
const LOOKBACK_DIAS = 90;

const LOTE_MAXIMO = 200;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * O Google exige `yyyy-MM-dd HH:mm:ss+|-HH:mm`, com offset explicito. ISO puro e recusado.
 *
 * ⚠️ BRT fixo em -03:00: o Brasil nao tem horario de verao desde 2019. Se voltar, esta linha
 * passa a carimbar 1h errado em parte do ano -- e o erro seria mudo, porque o Google aceita
 * o timestamp sem reclamar e so atribui a conversao ao dia errado.
 */
function dataGoogle(iso: string): string {
  const brt = new Date(new Date(iso).getTime() - 3 * 3600_000);
  return `${brt.toISOString().slice(0, 19).replace('T', ' ')}-03:00`;
}

function credenciais() {
  const dev = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN') ?? '';
  const customer = (Deno.env.get('GOOGLE_ADS_CUSTOMER_ID') ?? '').replace(/\D/g, '');
  return { dev, customer, ok: !!dev && !!customer };
}

async function accessToken(): Promise<{ token?: string; erro?: string }> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_ADS_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('GOOGLE_ADS_CLIENT_SECRET') ?? '',
      refresh_token: Deno.env.get('GOOGLE_ADS_REFRESH_TOKEN') ?? '',
      grant_type: 'refresh_token',
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    const extra = j.error === 'invalid_grant' ? ' (refresh token expirado/revogado)' : '';
    return { erro: `oauth ${r.status}: ${j.error ?? 'sem access_token'}${extra}` };
  }
  return { token: j.access_token as string };
}

/**
 * Chama a API tentando as versoes em ordem. 404 = versao aposentada, tenta a proxima.
 * Qualquer outro status PARA a tentativa -- repetir noutra versao so esconderia a causa real
 * (token, permissao, GAQL malformado) atras de uma cascata de 404.
 */
async function chamarAds(
  caminho: string,
  corpo: unknown,
  token: string,
  dev: string,
  versaoPreferida?: string,
): Promise<{ ok: boolean; status: number; corpo: any; versao?: string; texto?: string }> {
  for (const v of versaoPreferida ? [versaoPreferida] : VERSOES_ADS) {
    const r = await fetch(`https://googleads.googleapis.com/${v}/${caminho}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'developer-token': dev,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(corpo),
    });
    const texto = await r.text();
    let parsed: any = null;
    try { parsed = JSON.parse(texto); } catch { /* resposta nao-JSON: segue com o texto cru */ }

    if (r.ok) return { ok: true, status: r.status, corpo: parsed, versao: v, texto };
    if (r.status !== 404) return { ok: false, status: r.status, corpo: parsed, versao: v, texto };
  }
  return { ok: false, status: 404, corpo: null, texto: 'nenhuma versao da API respondeu' };
}

// ---------------------------------------------------------------------------
// MODO 1 -- diagnostico (read-only)
// ---------------------------------------------------------------------------

async function diagnostico(supabase: SupabaseClient) {
  const { dev, customer, ok } = credenciais();
  if (!ok) return json({ ok: false, error: 'GOOGLE_ADS_DEVELOPER_TOKEN/CUSTOMER_ID nao configurados' }, 500);

  const { token, erro } = await accessToken();
  if (!token) return json({ ok: false, error: erro }, 502);

  const query = `SELECT conversion_action.id, conversion_action.name, conversion_action.type,
                        conversion_action.status, conversion_action.category,
                        conversion_action.primary_for_goal,
                        conversion_action.click_through_lookback_window_days
                 FROM conversion_action
                 WHERE conversion_action.status != 'REMOVED'`;

  const r = await chamarAds(`customers/${customer}/googleAds:search`, { query }, token, dev);
  if (!r.ok) {
    return json({ ok: false, error: `conversion_action: HTTP ${r.status} ${(r.texto ?? '').slice(0, 300)}` }, 502);
  }

  const actions = (r.corpo?.results ?? []).map((l: any) => ({
    id: String(l?.conversionAction?.id ?? ''),
    nome: l?.conversionAction?.name ?? '',
    tipo: l?.conversionAction?.type ?? '',
    status: l?.conversionAction?.status ?? '',
    categoria: l?.conversionAction?.category ?? '',
    meta_de_lance: l?.conversionAction?.primaryForGoal ?? null,
    lookback_dias: l?.conversionAction?.clickThroughLookbackWindowDays ?? null,
  }));

  const { data: fila, error: eFila } = await supabase
    .from('google_ads_conversoes_fila')
    .select('aluno_id, nome, data_matricula, valor, via, clique_em')
    .limit(LOTE_MAXIMO);
  if (eFila) throw eFila;

  const { count: jaEnviadas } = await supabase
    .from('google_ads_conversoes')
    .select('id', { count: 'exact', head: true })
    .not('enviado_em', 'is', null);

  return json({
    ok: true,
    versao_api: r.versao,
    customer_id: customer,
    conversion_action_configurada: Deno.env.get('GOOGLE_ADS_CONVERSION_ACTION_ID') ?? null,
    conversion_actions_upload: actions.filter((a: any) => a.tipo === 'UPLOAD_CLICKS'),
    conversion_actions_total: actions.length,
    fila: fila?.length ?? 0,
    fila_amostra: (fila ?? []).slice(0, 10),
    ja_enviadas: jaEnviadas ?? 0,
  });
}

// ---------------------------------------------------------------------------
// MODO 2 -- criar a conversion action (⚠️ ALTERA A CONTA DE MIDIA)
// ---------------------------------------------------------------------------

async function criarConversionAction(body: Record<string, any>) {
  const { dev, customer, ok } = credenciais();
  if (!ok) return json({ ok: false, error: 'GOOGLE_ADS_DEVELOPER_TOKEN/CUSTOMER_ID nao configurados' }, 500);

  const { token, erro } = await accessToken();
  if (!token) return json({ ok: false, error: erro }, 502);

  const nome = String(body?.nome ?? 'Matricula (LA Report)');

  const r = await chamarAds(
    `customers/${customer}/conversionActions:mutate`,
    {
      operations: [{
        create: {
          name: nome,
          type: 'UPLOAD_CLICKS',
          category: 'PURCHASE',
          status: 'ENABLED',
          // ⚠️ false = entra como OBSERVACAO, nao como meta de lance. Ver o cabecalho.
          primaryForGoal: false,
          clickThroughLookbackWindowDays: LOOKBACK_DIAS,
          valueSettings: { alwaysUseDefaultValue: false },
        },
      }],
    },
    token, dev,
  );

  if (!r.ok) {
    return json({ ok: false, error: `criar conversion action: HTTP ${r.status} ${(r.texto ?? '').slice(0, 500)}` }, 502);
  }

  const resource = r.corpo?.results?.[0]?.resourceName ?? '';
  const id = resource.split('/').pop() ?? '';
  console.log('[google-ads/conversoes] conversion action criada', JSON.stringify({ resource, nome }));

  return json({
    ok: true,
    resource_name: resource,
    conversion_action_id: id,
    proximo_passo: `Configurar o secret GOOGLE_ADS_CONVERSION_ACTION_ID=${id} e so depois usar o modo enviar.`,
  });
}

// ---------------------------------------------------------------------------
// MODO 3 -- enviar (e o dry run, que e o mesmo caminho sem o POST final)
// ---------------------------------------------------------------------------

async function enviar(supabase: SupabaseClient, body: Record<string, any>) {
  const enviarDeVerdade = body?.enviar === true;
  const { dev, customer, ok } = credenciais();
  if (!ok) return json({ ok: false, error: 'GOOGLE_ADS_DEVELOPER_TOKEN/CUSTOMER_ID nao configurados' }, 500);

  const actionId = (Deno.env.get('GOOGLE_ADS_CONVERSION_ACTION_ID') ?? '').replace(/\D/g, '');
  if (enviarDeVerdade && !actionId) {
    // Falhar aqui e o certo: sem a action, o Google recusaria o lote inteiro com uma
    // mensagem generica, e a fila ficaria "tentada" sem ninguem saber por que.
    return json({
      ok: false,
      error: 'GOOGLE_ADS_CONVERSION_ACTION_ID nao configurado. Rode {"diagnostico":true} para ver as actions existentes, ou {"criar_conversion_action":true} para criar.',
    }, 500);
  }

  const { data: fila, error } = await supabase
    .from('google_ads_conversoes_fila')
    .select('aluno_id, nome, data_matricula, ocorrido_em, valor, gclid, via, clique_em')
    .order('data_matricula', { ascending: true })
    .limit(LOTE_MAXIMO);
  if (error) throw error;

  const resumo = {
    modo: enviarDeVerdade ? 'enviar' : 'dry_run',
    na_fila: fila?.length ?? 0,
    elegiveis: 0,
    fora_da_janela: 0,
    sem_data_de_clique: 0,
    enviadas: 0,
    falhas: 0,
    erros: [] as string[],
  };

  if (!fila || fila.length === 0) {
    console.log('[google-ads/conversoes]', JSON.stringify(resumo));
    return json({ ok: true, ...resumo });
  }

  const agora = Date.now();
  const elegiveis: typeof fila = [];

  for (const f of fila) {
    // Sem data de clique nao da para saber se cabe na janela de lookback. Mandar seria
    // apostar; descartar em silencio seria pior. Conta e reporta.
    if (!f.clique_em) {
      resumo.sem_data_de_clique++;
      resumo.erros.push(`aluno ${f.aluno_id} (${f.nome}): clique sem data, nao da para validar a janela`);
      continue;
    }
    const idadeDias = (agora - new Date(f.clique_em).getTime()) / 86400_000;
    if (idadeDias > LOOKBACK_DIAS) {
      resumo.fora_da_janela++;
      resumo.erros.push(`aluno ${f.aluno_id} (${f.nome}): clique de ${Math.round(idadeDias)} dias, fora da janela de ${LOOKBACK_DIAS}`);
      continue;
    }
    // O Google recusa conversao anterior ao proprio clique. Acontece de verdade: aluno
    // antigo que voltou e casou pelo telefone com um clique novo.
    if (new Date(f.ocorrido_em).getTime() < new Date(f.clique_em).getTime()) {
      resumo.falhas++;
      resumo.erros.push(`aluno ${f.aluno_id} (${f.nome}): matricula (${f.ocorrido_em}) anterior ao clique (${f.clique_em}) -- provavel casamento por telefone de aluno de retorno`);
      continue;
    }
    elegiveis.push(f);
  }

  resumo.elegiveis = elegiveis.length;

  const conversoes = elegiveis.map((f) => ({
    gclid: f.gclid,
    conversionAction: `customers/${customer}/conversionActions/${actionId}`,
    conversionDateTime: dataGoogle(f.ocorrido_em),
    conversionValue: Number(f.valor),
    currencyCode: 'BRL',
  }));

  if (!enviarDeVerdade) {
    console.log('[google-ads/conversoes]', JSON.stringify(resumo));
    return json({
      ok: true,
      ...resumo,
      aviso: 'DRY RUN -- nada foi enviado ao Google nem gravado. Para enviar: {"enviar": true}.',
      payload_que_seria_enviado: conversoes,
    });
  }

  if (conversoes.length === 0) {
    console.log('[google-ads/conversoes]', JSON.stringify(resumo));
    return json({ ok: true, ...resumo });
  }

  const { token, erro: eTok } = await accessToken();
  if (!token) return json({ ok: false, error: eTok, ...resumo }, 502);

  // partialFailure: o lote nao morre inteiro por causa de um item ruim, e a resposta diz
  // QUAL item falhou e por que. Sem isso, um gclid invalido derrubaria a rodada toda.
  const r = await chamarAds(
    `customers/${customer}:uploadClickConversions`,
    { conversions: conversoes, partialFailure: true },
    token, dev,
  );

  if (!r.ok) {
    const msg = `HTTP ${r.status} ${(r.texto ?? '').slice(0, 400)}`;
    resumo.falhas += conversoes.length;
    resumo.erros.push(`lote inteiro recusado: ${msg}`);
    // Registra a tentativa em cada linha -- senao a proxima rodada repetiria o mesmo erro
    // sem que ninguem soubesse que ja tinha acontecido.
    for (const f of elegiveis) {
      await supabase.from('google_ads_conversoes').upsert({
        aluno_id: f.aluno_id, gclid: f.gclid, tipo: 'matricula',
        valor: f.valor, ocorrido_em: f.ocorrido_em, via: f.via, clique_em: f.clique_em,
        tentativas: 1, ultimo_erro: msg, updated_at: new Date().toISOString(),
      }, { onConflict: 'aluno_id,tipo' });
    }
    console.error('[google-ads/conversoes]', JSON.stringify(resumo));
    return json({ ok: false, ...resumo }, 502);
  }

  // partialFailureError chega DENTRO de uma resposta 200. Nao checar aqui e o jeito classico
  // de reportar sucesso para uma rodada que nao gravou nada no Google.
  const parcial = r.corpo?.partialFailureError ?? null;
  const falhouIndice = new Map<number, string>();
  if (parcial) {
    for (const det of (parcial.details ?? [])) {
      for (const e of (det?.errors ?? [])) {
        const idx = e?.location?.fieldPathElements?.find((p: any) => p?.fieldName === 'conversions')?.index;
        const msg = e?.message ?? JSON.stringify(e).slice(0, 200);
        if (typeof idx === 'number') falhouIndice.set(idx, msg);
      }
    }
    if (falhouIndice.size === 0) {
      // Veio erro parcial que nao consegui atribuir a um item. Guardar cru e melhor que perder.
      resumo.erros.push(`partialFailure sem indice: ${JSON.stringify(parcial).slice(0, 300)}`);
    }
  }

  const agoraIso = new Date().toISOString();
  for (let i = 0; i < elegiveis.length; i++) {
    const f = elegiveis[i];
    const falha = falhouIndice.get(i);
    const linha = {
      aluno_id: f.aluno_id,
      gclid: f.gclid,
      tipo: 'matricula',
      valor: f.valor,
      ocorrido_em: f.ocorrido_em,
      via: f.via,
      clique_em: f.clique_em,
      tentativas: 1,
      enviado_em: falha ? null : agoraIso,
      ultimo_erro: falha ?? null,
      resposta: falha ? null : (r.corpo?.results?.[i] ?? null),
      updated_at: agoraIso,
    };
    const { error: upErr } = await supabase
      .from('google_ads_conversoes')
      .upsert(linha, { onConflict: 'aluno_id,tipo' });

    if (upErr) {
      // O Google JA recebeu. Nao gravar aqui significa reenviar na proxima rodada e contar
      // a matricula duas vezes -- por isso o erro grita com o identificador do aluno.
      resumo.erros.push(`aluno ${f.aluno_id}: ENVIADO ao Google mas NAO gravado localmente (${upErr.code}: ${upErr.message}) -- risco de envio duplicado na proxima rodada`);
      resumo.falhas++;
      continue;
    }
    if (falha) {
      resumo.falhas++;
      resumo.erros.push(`aluno ${f.aluno_id} (${f.nome}), gclid ${f.gclid.slice(0, 12)}...: ${falha}`);
    } else {
      resumo.enviadas++;
    }
  }

  const log = JSON.stringify(resumo);
  if (resumo.falhas > 0) console.error('[google-ads/conversoes]', log);
  else console.log('[google-ads/conversoes]', log);

  return json({ ok: resumo.falhas === 0, ...resumo });
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const body = await req.json().catch(() => ({}));

    if (body?.diagnostico === true) return await diagnostico(supabase);
    if (body?.criar_conversion_action === true) return await criarConversionAction(body);
    return await enviar(supabase, body);
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error('[google-ads/conversoes] excecao', msg);
    return json({ ok: false, error: msg }, 500);
  }
});
