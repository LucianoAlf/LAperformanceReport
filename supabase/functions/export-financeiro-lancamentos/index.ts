/// <reference lib="deno.ns" />

// Leitura do espelho financeiro do Emusys para o Super Folha.
// Mesmo padrão do contas-receber-sync (decisão Alf 2026-09-14): POST com o
// segredo compartilhado no header x-super-folha-sync-secret; nada de token
// Emusys ou service role sai daqui.
//
// body: { competencia: "YYYY-MM-01", unidade_id?: uuid, incluir_payload?: bool }
// devolve: itens vivos da competência + totais de controle por
// (unidade × natureza) + status da última varredura completa da janela diária.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';

const INTERNAL_SECRET = Deno.env.get('SUPER_FOLHA_FINANCEIRO_SECRET')?.trim()
  || Deno.env.get('SUPER_FOLHA_CONTAS_RECEBER_SECRET')?.trim()
  || '';
const PAGE_SIZE = 500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

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

function validarCompetencia(valor: unknown) {
  const competencia = String(valor ?? '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(competencia)) {
    throw new Error('competencia obrigatoria no formato YYYY-MM-01');
  }
  return competencia;
}

const ultimoDia = (competencia: string) => {
  const [ano, mes] = competencia.split('-').map(Number);
  return new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
};

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
    const competencia = validarCompetencia(body.competencia);
    const unidadeId = String(body.unidade_id ?? '').trim() || null;
    if (unidadeId && !UUID_PATTERN.test(unidadeId)) {
      return json({ success: false, erro: 'unidade_id deve ser UUID quando informada' }, 400);
    }
    const incluirPayload = body.incluir_payload === true;
    const inicio = competencia;
    const fim = ultimoDia(competencia);

    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const unidades = await buscarUnidades(client);

    const campos = [
      'unidade_id', 'emusys_lancamento_id', 'data', 'valor', 'natureza',
      'conta_emusys_id', 'conta_descricao',
      'plano_emusys_id', 'plano_nome', 'plano_codigo',
      'forma_pagamento_emusys_id', 'forma_pagamento_descricao',
      'descricao',
      'primeira_vez_visto', 'ultima_vez_visto', 'alterado_em', 'sumiu_em',
      ...(incluirPayload ? ['payload'] : []),
    ].join(',');

    const itens: Record<string, unknown>[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      let query = client
        .from('financeiro_emusys_lancamentos')
        .select(campos)
        .gte('data', inicio)
        .lte('data', fim)
        .order('data', { ascending: true })
        .order('emusys_lancamento_id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (unidadeId) query = query.eq('unidade_id', unidadeId);
      // deno-lint-ignore no-explicit-any
      const { data, error } = await query as any;
      if (error) throw error;
      itens.push(...((data ?? []) as Record<string, unknown>[]));
      if ((data?.length ?? 0) < PAGE_SIZE) break;
    }

    // status da varredura: resumo da janela diária + cobertura dia a dia da competência pedida
    let statusQuery = client
      .from('financeiro_emusys_varredura_resumo')
      .select('unidade_id,janela_inicio,janela_fim,ultima_varredura_completa_em,ultima_tentativa_em,dias_pendentes,ultimo_erro');
    if (unidadeId) statusQuery = statusQuery.eq('unidade_id', unidadeId);
    const { data: resumos, error: erroResumo } = await statusQuery;
    if (erroResumo) throw erroResumo;

    let diasQuery = client
      .from('financeiro_emusys_varredura_dias')
      .select('unidade_id,data,status')
      .gte('data', inicio)
      .lte('data', fim);
    if (unidadeId) diasQuery = diasQuery.eq('unidade_id', unidadeId);
    const { data: dias, error: erroDias } = await diasQuery;
    if (erroDias) throw erroDias;

    const diasPorUnidade = new Map<string, { completos: number; erro: number }>();
    for (const dia of dias ?? []) {
      const atual = diasPorUnidade.get(dia.unidade_id) ?? { completos: 0, erro: 0 };
      if (dia.status === 'completo') atual.completos += 1;
      else atual.erro += 1;
      diasPorUnidade.set(dia.unidade_id, atual);
    }

    const varredura = (resumos ?? []).map((r) => {
      const unidade = unidades.get(r.unidade_id) as { nome?: string; codigo?: string } | undefined;
      const cobertura = diasPorUnidade.get(r.unidade_id) ?? { completos: 0, erro: 0 };
      return {
        unidade_id: r.unidade_id,
        unidade_nome: unidade?.nome ?? null,
        janela_inicio: r.janela_inicio,
        janela_fim: r.janela_fim,
        janela_cobre_competencia: !!r.janela_inicio && r.janela_inicio <= inicio && !!r.janela_fim && r.janela_fim >= inicio,
        ultima_varredura_completa_em: r.ultima_varredura_completa_em,
        ultima_tentativa_em: r.ultima_tentativa_em,
        dias_pendentes_janela: r.dias_pendentes,
        dias_competencia_completos: cobertura.completos,
        dias_competencia_com_erro: cobertura.erro,
        ultimo_erro: r.ultimo_erro,
      };
    });

    // itens sumidos: NÃO entram nos totais, mas ficam visíveis fora da lista viva
    const vivos = itens.filter((i) => i.sumiu_em == null);
    const sumidos = itens.filter((i) => i.sumiu_em != null);

    const totaisChave = new Map<string, { quantidade: number; valor_total: number }>();
    for (const item of vivos) {
      const chave = `${item.unidade_id}|${item.natureza}`;
      const atual = totaisChave.get(chave) ?? { quantidade: 0, valor_total: 0 };
      atual.quantidade += 1;
      atual.valor_total = Number((atual.valor_total + Number(item.valor ?? 0)).toFixed(2));
      totaisChave.set(chave, atual);
    }
    const totais = [...totaisChave.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([chave, agregado]) => {
        const [unidade, natureza] = chave.split('|');
        const info = unidades.get(unidade) as { nome?: string } | undefined;
        return {
          unidade_id: unidade,
          unidade_nome: info?.nome ?? null,
          natureza,
          quantidade: agregado.quantidade,
          valor_total: agregado.valor_total,
        };
      });

    return json({
      success: true,
      competencia,
      gerado_em: new Date().toISOString(),
      varredura,
      totais_por_natureza: totais,
      controle: {
        itens_vivos: vivos.length,
        itens_sumidos: sumidos.length,
        // item sumido = a origem parou de devolver; continua no espelho para rastro,
        // mas fora dos totais — mesmo raciocínio do export-contas-receber.
        sumidos_amostra: sumidos.slice(0, 50).map((i) => ({
          unidade_id: i.unidade_id,
          emusys_lancamento_id: i.emusys_lancamento_id,
          data: i.data,
          valor: i.valor,
          natureza: i.natureza,
          sumiu_em: i.sumiu_em,
        })),
      },
      itens: vivos.map((i) => ({
        unidade_id: i.unidade_id,
        emusys_lancamento_id: i.emusys_lancamento_id,
        data: i.data,
        valor: i.valor,
        natureza: i.natureza,
        conta: i.conta_emusys_id == null ? null : { id: i.conta_emusys_id, descricao: i.conta_descricao },
        plano_contas: i.plano_emusys_id == null ? null : {
          id: i.plano_emusys_id,
          nome: i.plano_nome,
          codigo: i.plano_codigo,
        },
        forma_pagamento: i.forma_pagamento_emusys_id == null ? null : {
          id: i.forma_pagamento_emusys_id,
          descricao: i.forma_pagamento_descricao,
        },
        descricao: i.descricao,
        primeira_vez_visto: i.primeira_vez_visto,
        ultima_vez_visto: i.ultima_vez_visto,
        alterado_em: i.alterado_em,
        ...(incluirPayload ? { payload: i.payload } : {}),
      })),
    });
  } catch (erro) {
    console.error('[export-financeiro-lancamentos]', erro);
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    const status = /competencia|UUID/i.test(mensagem) ? 400 : 500;
    return json({ success: false, erro: mensagem }, status);
  }
});
