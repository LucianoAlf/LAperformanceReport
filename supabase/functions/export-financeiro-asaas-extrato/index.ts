/// <reference lib="deno.ns" />

// Leitura do espelho do extrato Asaas (via Emusys beta) para o Super Folha.
// Mesmo padrão do export-financeiro-lancamentos (decisão Alf 2026-10-05, molde
// de 14/09): POST com o segredo compartilhado no header
// x-super-folha-sync-secret; nada de token Emusys ou service role sai daqui.
//
// body: { inicio: "YYYY-MM-DD", fim: "YYYY-MM-DD", unidade_id?: uuid,
//         convenio_id?: number, incluir_payload?: bool }
// intervalo de até 1 ano por chamada. devolve: itens vivos do período + totais
// por (convênio × type) + status de varredura por convênio (inclui a fronteira
// da carga inicial) + catálogo de convênios.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';

const INTERNAL_SECRET = Deno.env.get('SUPER_FOLHA_FINANCEIRO_SECRET')?.trim()
  || Deno.env.get('SUPER_FOLHA_CONTAS_RECEBER_SECRET')?.trim()
  || '';
const PAGE_SIZE = 500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const DATA_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const INTERVALO_MAXIMO_DIAS = 366;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

function safeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
}

function validarPeriodo(inicio: unknown, fim: unknown) {
  const ini = String(inicio ?? '').trim();
  const f = String(fim ?? '').trim();
  if (!DATA_PATTERN.test(ini) || !DATA_PATTERN.test(f)) {
    throw new Error('inicio e fim obrigatorios no formato YYYY-MM-DD');
  }
  if (ini > f) throw new Error('inicio deve ser <= fim');
  const dias = (Date.parse(`${f}T00:00:00Z`) - Date.parse(`${ini}T00:00:00Z`)) / 86400000 + 1;
  if (dias > INTERVALO_MAXIMO_DIAS) {
    throw new Error(`intervalo maximo de ${INTERVALO_MAXIMO_DIAS} dias por chamada`);
  }
  return { inicio: ini, fim: f, dias };
}

async function buscarUnidades(client: SupabaseClient) {
  const { data, error } = await client.from('unidades').select('id,nome,codigo');
  if (error) throw error;
  return new Map((data ?? []).map((u) => [String(u.id), u as Record<string, unknown>]));
}

serve(async (request) => {
  if (request.method !== 'POST') return json({ success: false, erro: 'metodo nao permitido' }, 405);
  if (!INTERNAL_SECRET) return json({ success: false, erro: 'segredo interno nao configurado' }, 503);
  const supplied = request.headers.get('x-super-folha-sync-secret')?.trim() ?? '';
  if (!supplied || !safeEqual(supplied, INTERNAL_SECRET)) {
    return json({ success: false, erro: 'acesso negado' }, 403);
  }

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const periodo = validarPeriodo(body.inicio, body.fim);
    const unidadeId = String(body.unidade_id ?? '').trim() || null;
    if (unidadeId && !UUID_PATTERN.test(unidadeId)) {
      return json({ success: false, erro: 'unidade_id deve ser UUID quando informada' }, 400);
    }
    const convenioFiltro = body.convenio_id == null ? null : Number(body.convenio_id);
    if (convenioFiltro != null && (!Number.isSafeInteger(convenioFiltro) || convenioFiltro <= 0)) {
      return json({ success: false, erro: 'convenio_id deve ser inteiro positivo quando informado' }, 400);
    }
    const incluirPayload = body.incluir_payload === true;

    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const unidades = await buscarUnidades(client);

    const campos = [
      'unidade_id', 'convenio_id', 'asaas_id', 'data', 'valor', 'balance', 'tipo',
      'descricao', 'payment_id', 'external_reference', 'transfer_id',
      'pix_transaction_id', 'split_id', 'anticipation_id', 'bill_id',
      'invoice_id', 'payment_dunning_id', 'credit_bureau_report_id',
      'posicao_dia',
      'primeira_vez_visto', 'ultima_vez_visto', 'alterado_em', 'sumiu_em',
      ...(incluirPayload ? ['payload'] : []),
    ].join(',');

    const itens: Record<string, unknown>[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      let query = client
        .from('financeiro_asaas_extrato')
        .select(campos)
        .gte('data', periodo.inicio)
        .lte('data', periodo.fim)
        .order('convenio_id', { ascending: true })
        .order('data', { ascending: true })
        .order('posicao_dia', { ascending: true })
        .order('asaas_id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (unidadeId) query = query.eq('unidade_id', unidadeId);
      if (convenioFiltro != null) query = query.eq('convenio_id', convenioFiltro);
      // deno-lint-ignore no-explicit-any
      const { data, error } = await query as any;
      if (error) throw error;
      itens.push(...((data ?? []) as Record<string, unknown>[]));
      if ((data?.length ?? 0) < PAGE_SIZE) break;
    }

    // catálogo de convênios vivos (escopo do filtro, se houver)
    let convQuery = client
      .from('financeiro_asaas_convenios')
      .select('unidade_id,convenio_id,status,conta_emusys_id,conta_descricao,conta_banco,conta_agencia,conta_numero,conta_titular')
      .is('sumiu_em', null)
      .order('unidade_id')
      .order('convenio_id');
    if (unidadeId) convQuery = convQuery.eq('unidade_id', unidadeId);
    if (convenioFiltro != null) convQuery = convQuery.eq('convenio_id', convenioFiltro);
    const { data: convenios, error: erroConv } = await convQuery;
    if (erroConv) throw erroConv;

    // status da varredura por convênio + cobertura dia a dia do período pedido
    let resumoQuery = client
      .from('financeiro_asaas_varredura_resumo')
      .select('unidade_id,convenio_id,janela_inicio,janela_fim,ultima_varredura_completa_em,ultima_revarredura_mensal_em,carga_inicial_concluida_ate,ultima_tentativa_em,dias_pendentes,ultimo_erro');
    if (unidadeId) resumoQuery = resumoQuery.eq('unidade_id', unidadeId);
    if (convenioFiltro != null) resumoQuery = resumoQuery.eq('convenio_id', convenioFiltro);
    const { data: resumos, error: erroResumo } = await resumoQuery;
    if (erroResumo) throw erroResumo;

    let diasQuery = client
      .from('financeiro_asaas_varredura_dias')
      .select('unidade_id,convenio_id,data,status,balance_quebras,concluido_em')
      .gte('data', periodo.inicio)
      .lte('data', periodo.fim)
      .order('data', { ascending: true });
    if (unidadeId) diasQuery = diasQuery.eq('unidade_id', unidadeId);
    if (convenioFiltro != null) diasQuery = diasQuery.eq('convenio_id', convenioFiltro);
    const { data: dias, error: erroDias } = await diasQuery;
    if (erroDias) throw erroDias;

    const resumoPorConvenio = new Map<string, Record<string, unknown>>();
    for (const r of resumos ?? []) resumoPorConvenio.set(`${r.unidade_id}|${r.convenio_id}`, r as Record<string, unknown>);

    const coberturaPorConvenio = new Map<string, {
      completos: number; erro: number; quebras: number; ultimoCompletoEm: string | null;
      dias: { data: string; status: string; balance_quebras: number; concluido_em: string | null }[];
    }>();
    for (const dia of dias ?? []) {
      const chave = `${dia.unidade_id}|${dia.convenio_id}`;
      const atual = coberturaPorConvenio.get(chave) ?? { completos: 0, erro: 0, quebras: 0, ultimoCompletoEm: null, dias: [] };
      if (dia.status === 'completo') {
        atual.completos += 1;
        if (dia.concluido_em && (!atual.ultimoCompletoEm || dia.concluido_em > atual.ultimoCompletoEm)) {
          atual.ultimoCompletoEm = dia.concluido_em;
        }
      } else {
        atual.erro += 1;
      }
      atual.quebras += Number(dia.balance_quebras ?? 0);
      atual.dias.push({
        data: dia.data,
        status: dia.status,
        balance_quebras: Number(dia.balance_quebras ?? 0),
        concluido_em: dia.concluido_em,
      });
      coberturaPorConvenio.set(chave, atual);
    }

    const varredura = (convenios ?? []).map((c) => {
      const chave = `${c.unidade_id}|${c.convenio_id}`;
      const r = resumoPorConvenio.get(chave) ?? {};
      const cobertura = coberturaPorConvenio.get(chave) ?? { completos: 0, erro: 0, quebras: 0, ultimoCompletoEm: null, dias: [] };
      const unidade = unidades.get(c.unidade_id) as { nome?: string } | undefined;
      // período_ultima_varredura_completa_em: só preenchido quando TODOS os dias
      // do período pedido estão completos — mesma régua do export de lançamentos
      const periodoCompleto = cobertura.completos >= periodo.dias && cobertura.erro === 0;
      return {
        unidade_id: c.unidade_id,
        unidade_nome: unidade?.nome ?? null,
        convenio_id: c.convenio_id,
        convenio_status: c.status,
        janela_inicio: r.janela_inicio ?? null,
        janela_fim: r.janela_fim ?? null,
        janela_cobre_periodo: !!r.janela_inicio && r.janela_inicio <= periodo.inicio && !!r.janela_fim && r.janela_fim >= periodo.inicio,
        ultima_varredura_completa_em: r.ultima_varredura_completa_em ?? null,
        ultima_revarredura_mensal_em: r.ultima_revarredura_mensal_em ?? null,
        carga_inicial_concluida_ate: r.carga_inicial_concluida_ate ?? null,
        periodo_ultima_varredura_completa_em: periodoCompleto ? cobertura.ultimoCompletoEm : null,
        periodo_total_dias: periodo.dias,
        ultima_tentativa_em: r.ultima_tentativa_em ?? null,
        dias_pendentes_janela: r.dias_pendentes ?? null,
        dias_periodo_completos: cobertura.completos,
        dias_periodo_com_erro: cobertura.erro,
        balance_quebras_periodo: cobertura.quebras,
        ultimo_erro: r.ultimo_erro ?? null,
        dias: cobertura.dias,
      };
    });

    // itens sumidos: NÃO entram nos totais, mas ficam visíveis fora da lista viva
    const vivos = itens.filter((i) => i.sumiu_em == null);
    const sumidos = itens.filter((i) => i.sumiu_em != null);

    const totaisChave = new Map<string, { quantidade: number; valor_total: number }>();
    for (const item of vivos) {
      const chave = `${item.unidade_id}|${item.convenio_id}|${item.tipo}`;
      const atual = totaisChave.get(chave) ?? { quantidade: 0, valor_total: 0 };
      atual.quantidade += 1;
      atual.valor_total = Number((atual.valor_total + Number(item.valor ?? 0)).toFixed(2));
      totaisChave.set(chave, atual);
    }
    const totais = [...totaisChave.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([chave, agregado]) => {
        const [unidade, convenio, tipo] = chave.split('|');
        const info = unidades.get(unidade) as { nome?: string } | undefined;
        return {
          unidade_id: unidade,
          unidade_nome: info?.nome ?? null,
          convenio_id: Number(convenio),
          tipo,
          quantidade: agregado.quantidade,
          valor_total: agregado.valor_total,
        };
      });

    return json({
      success: true,
      inicio: periodo.inicio,
      fim: periodo.fim,
      gerado_em: new Date().toISOString(),
      varredura,
      convenios: (convenios ?? []).map((c) => {
        const unidade = unidades.get(c.unidade_id) as { nome?: string } | undefined;
        return {
          unidade_id: c.unidade_id,
          unidade_nome: unidade?.nome ?? null,
          convenio_id: c.convenio_id,
          status: c.status,
          conta_bancaria: {
            id: c.conta_emusys_id,
            descricao: c.conta_descricao,
            banco: c.conta_banco,
            agencia: c.conta_agencia,
            numero: c.conta_numero,
            titular: c.conta_titular,
          },
        };
      }),
      totais_por_tipo: totais,
      controle: {
        itens_vivos: vivos.length,
        itens_sumidos: sumidos.length,
        sumidos_amostra: sumidos.slice(0, 50).map((i) => ({
          unidade_id: i.unidade_id,
          convenio_id: i.convenio_id,
          asaas_id: i.asaas_id,
          data: i.data,
          valor: i.valor,
          tipo: i.tipo,
          sumiu_em: i.sumiu_em,
        })),
      },
      itens: vivos.map((i) => ({
        unidade_id: i.unidade_id,
        convenio_id: i.convenio_id,
        asaas_id: i.asaas_id,
        data: i.data,
        valor: i.valor,
        balance: i.balance,
        tipo: i.tipo,
        descricao: i.descricao,
        payment_id: i.payment_id,
        external_reference: i.external_reference,
        transfer_id: i.transfer_id,
        pix_transaction_id: i.pix_transaction_id,
        split_id: i.split_id,
        anticipation_id: i.anticipation_id,
        bill_id: i.bill_id,
        invoice_id: i.invoice_id,
        payment_dunning_id: i.payment_dunning_id,
        credit_bureau_report_id: i.credit_bureau_report_id,
        posicao_dia: i.posicao_dia,
        primeira_vez_visto: i.primeira_vez_visto,
        ultima_vez_visto: i.ultima_vez_visto,
        alterado_em: i.alterado_em,
        ...(incluirPayload ? { payload: i.payload } : {}),
      })),
    });
  } catch (erro) {
    console.error('[export-financeiro-asaas-extrato]', erro);
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    const status = /inicio|fim|intervalo|UUID|convenio/i.test(mensagem) ? 400 : 500;
    return json({ success: false, erro: mensagem }, status);
  }
});
