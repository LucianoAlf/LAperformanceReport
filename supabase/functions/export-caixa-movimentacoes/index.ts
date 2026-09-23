/// <reference lib="deno.ns" />

// Exporta as movimentacoes do caixa (Sol + equipe) para o Super Folha.
// Mesmo padrao do export-financeiro-lancamentos: POST com o segredo
// compartilhado no header x-super-folha-sync-secret.
//
// Por que existe: o espelho de lancamentos do Emusys cobre o que a Rose
// conciliou; o caixa cobre o que a equipe/Sol lancou — Pix que entra por
// comprovante de WhatsApp, venda de balcao, etc. O `fatura_id` +
// `emusys_fatura_id` e' a ponte: com ela o Super Folha cruza extrato ->
// caixa -> fatura sem heuristicas de nome.
//
// body: { competencia: "YYYY-MM-01" }  ou  { data_inicio: "YYYY-MM-DD",
//       data_fim: "YYYY-MM-DD", unidade_id?: uuid }
// devolve: itens do periodo + totais de controle por (unidade x tipo).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';

const INTERNAL_SECRET = Deno.env.get('SUPER_FOLHA_FINANCEIRO_SECRET')?.trim()
  || Deno.env.get('SUPER_FOLHA_CONTAS_RECEBER_SECRET')?.trim()
  || '';
const PAGE_SIZE = 500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const DATA_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

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

function validarData(valor: unknown, campo: string) {
  const data = String(valor ?? '').trim();
  if (!DATA_PATTERN.test(data)) {
    throw new Error(`${campo} obrigatorio no formato YYYY-MM-DD`);
  }
  return data;
}

const ultimoDia = (competencia: string) => {
  const [ano, mes] = competencia.split('-').map(Number);
  return new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
};

// Mesma regra do src/lib/caixaIdentidade.ts: o prefixo em criado_por diz quem lancou.
function origemDoLancamento(criadoPor: unknown) {
  const valor = String(criadoPor ?? '').trim();
  if (!valor) return 'desconhecida';
  if (valor.startsWith('sol-agente:')) return 'sol';
  if (valor.startsWith('migracao:')) return 'migracao';
  return 'humano';
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
    let inicio: string;
    let fim: string;
    const competencia = String(body.competencia ?? '').trim();
    if (competencia) {
      if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(competencia)) {
        throw new Error('competencia obrigatoria no formato YYYY-MM-01');
      }
      inicio = competencia;
      fim = ultimoDia(competencia);
    } else {
      inicio = validarData(body.data_inicio, 'data_inicio');
      fim = validarData(body.data_fim, 'data_fim');
    }
    if (fim < inicio) throw new Error('data_fim nao pode ser anterior a data_inicio');
    const unidadeId = String(body.unidade_id ?? '').trim() || null;
    if (unidadeId && !UUID_PATTERN.test(unidadeId)) {
      return json({ success: false, erro: 'unidade_id deve ser UUID quando informada' }, 400);
    }

    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const unidades = await buscarUnidades(client);

    const campos = [
      'id', 'caixa_diario_id', 'unidade_id', 'data_movimento', 'ambiente',
      'tipo', 'forma_pagamento', 'categoria', 'descricao', 'valor',
      'responsavel', 'criado_por', 'aluno_id', 'fatura_id',
      'cartao_modalidade', 'cartao_parcelas',
      'created_at', 'updated_at',
    ].join(',');

    const itens: Record<string, unknown>[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      let query = client
        .from('caixa_movimentacoes')
        .select(campos)
        .gte('data_movimento', inicio)
        .lte('data_movimento', fim)
        .order('data_movimento', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (unidadeId) query = query.eq('unidade_id', unidadeId);
      // deno-lint-ignore no-explicit-any
      const { data, error } = await query as any;
      if (error) throw error;
      itens.push(...((data ?? []) as Record<string, unknown>[]));
      if ((data?.length ?? 0) < PAGE_SIZE) break;
    }

    // Resolve a ponte: fatura interna -> ids do Emusys (a fatura_id da API deles
    // e' por unidade, entao devolvemos unidade + emusys_fatura_id juntos).
    const faturaIds = [...new Set(
      itens.map((i) => String(i.fatura_id ?? '')).filter((v) => UUID_PATTERN.test(v)),
    )];
    const faturas = new Map<string, Record<string, unknown>>();
    for (let from = 0; from < faturaIds.length; from += PAGE_SIZE) {
      const { data, error } = await client
        .from('emusys_faturas')
        .select('id,emusys_fatura_id,emusys_matricula_id,emusys_student_id,status,valor_pago,data_pagamento')
        .in('id', faturaIds.slice(from, from + PAGE_SIZE));
      if (error) throw error;
      for (const f of data ?? []) faturas.set(String(f.id), f as Record<string, unknown>);
    }

    const alunoIds = [...new Set(
      itens.map((i) => i.aluno_id).filter((v): v is number => typeof v === 'number'),
    )];
    const alunos = new Map<number, string>();
    for (let from = 0; from < alunoIds.length; from += PAGE_SIZE) {
      const { data, error } = await client
        .from('alunos')
        .select('id,nome')
        .in('id', alunoIds.slice(from, from + PAGE_SIZE));
      if (error) throw error;
      for (const a of data ?? []) alunos.set(a.id as number, String(a.nome ?? ''));
    }

    const totaisChave = new Map<string, { quantidade: number; valor_total: number }>();
    for (const item of itens) {
      const chave = `${item.unidade_id}|${item.tipo}`;
      const atual = totaisChave.get(chave) ?? { quantidade: 0, valor_total: 0 };
      atual.quantidade += 1;
      atual.valor_total = Number((atual.valor_total + Number(item.valor ?? 0)).toFixed(2));
      totaisChave.set(chave, atual);
    }
    const totais = [...totaisChave.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([chave, agregado]) => {
        const [unidade, tipo] = chave.split('|');
        const info = unidades.get(unidade) as { nome?: string } | undefined;
        return {
          unidade_id: unidade,
          unidade_nome: info?.nome ?? null,
          tipo,
          quantidade: agregado.quantidade,
          valor_total: agregado.valor_total,
        };
      });

    return json({
      success: true,
      periodo: { inicio, fim },
      gerado_em: new Date().toISOString(),
      totais_por_tipo: totais,
      controle: {
        itens: itens.length,
        com_fatura: itens.filter((i) => i.fatura_id != null).length,
        sem_fatura_entrada: itens.filter((i) => i.fatura_id == null && i.tipo === 'entrada').length,
      },
      itens: itens.map((i) => {
        const fatura = i.fatura_id ? faturas.get(String(i.fatura_id)) : undefined;
        const unidade = unidades.get(String(i.unidade_id)) as { codigo?: string; nome?: string } | undefined;
        return {
          id: i.id,
          caixa_diario_id: i.caixa_diario_id,
          unidade_id: i.unidade_id,
          unidade_codigo: unidade?.codigo ?? null,
          data_movimento: i.data_movimento,
          ambiente: i.ambiente,
          tipo: i.tipo,
          forma_pagamento: i.forma_pagamento,
          categoria: i.categoria,
          descricao: i.descricao,
          valor: i.valor,
          responsavel: i.responsavel,
          origem: origemDoLancamento(i.criado_por),
          aluno_id: i.aluno_id,
          aluno_nome: typeof i.aluno_id === 'number' ? alunos.get(i.aluno_id) ?? null : null,
          // Ponte canonica: com fatura_id o Super Folha resolve
          // contas_receber por (unidade + emusys_fatura_id) sem heuristica.
          fatura_id: i.fatura_id,
          emusys_fatura_id: fatura?.emusys_fatura_id ?? null,
          emusys_matricula_id: fatura?.emusys_matricula_id ?? null,
          emusys_student_id: fatura?.emusys_student_id ?? null,
          cartao_modalidade: i.cartao_modalidade,
          cartao_parcelas: i.cartao_parcelas,
          created_at: i.created_at,
          updated_at: i.updated_at,
        };
      }),
    });
  } catch (erro) {
    console.error('[export-caixa-movimentacoes]', erro);
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    const status = /competencia|data_|UUID/i.test(mensagem) ? 400 : 500;
    return json({ success: false, erro: mensagem }, status);
  }
});
