import { supabase } from '@/lib/supabase';

export interface FinanceiroFaturasUnidade {
  unidade_id: string;
  unidade_nome: string;
  unidade_codigo: string;
  faturas_parcela: number;
  faturas_parcela_pagas: number;
  faturas_parcela_abertas: number;
  alunos_emusys_com_parcela: number;
  alunos_emusys_com_parcela_paga: number;
  alunos_locais_com_parcela: number;
  alunos_locais_com_parcela_paga: number;
  mrr_atual: number;
  faturamento_previsto: number;
  ticket_medio: number;
  ticket_medio_previsto: number;
  ticket_denominador: number;
  ticket_denominador_previsto: number;
}

export interface FinanceiroFaturasPayload {
  ano: number;
  mes: number;
  tem_dados: boolean;
  fonte: string;
  por_unidade: FinanceiroFaturasUnidade[];
  totais: FinanceiroFaturasUnidade | null;
}

interface FetchFinanceiroFaturasParams {
  unidadeId?: string | 'todos' | null;
  ano: number;
  mes: number;
}

function n(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeFinanceiroFaturas(row: any): FinanceiroFaturasUnidade {
  const alunosLocaisComParcelaPaga = n(row?.alunos_locais_com_parcela_paga);
  const alunosEmusysComParcelaPaga = n(row?.alunos_emusys_com_parcela_paga);
  const alunosLocaisComParcela = n(row?.alunos_locais_com_parcela);
  const alunosEmusysComParcela = n(row?.alunos_emusys_com_parcela);

  return {
    unidade_id: String(row?.unidade_id || ''),
    unidade_nome: String(row?.unidade_nome || ''),
    unidade_codigo: String(row?.unidade_codigo || ''),
    faturas_parcela: n(row?.faturas_parcela),
    faturas_parcela_pagas: n(row?.faturas_parcela_pagas),
    faturas_parcela_abertas: n(row?.faturas_parcela_abertas),
    alunos_emusys_com_parcela: alunosEmusysComParcela,
    alunos_emusys_com_parcela_paga: alunosEmusysComParcelaPaga,
    alunos_locais_com_parcela: alunosLocaisComParcela,
    alunos_locais_com_parcela_paga: alunosLocaisComParcelaPaga,
    mrr_atual: n(row?.mrr_atual),
    faturamento_previsto: n(row?.faturamento_previsto),
    ticket_medio: n(row?.ticket_medio),
    ticket_medio_previsto: n(row?.ticket_medio_previsto),
    ticket_denominador: alunosLocaisComParcelaPaga || alunosEmusysComParcelaPaga,
    ticket_denominador_previsto: alunosLocaisComParcela || alunosEmusysComParcela,
  };
}

export function hasFinanceiroFaturas(row?: FinanceiroFaturasUnidade | null): row is FinanceiroFaturasUnidade {
  return !!row && (row.faturas_parcela > 0 || row.mrr_atual > 0 || row.faturamento_previsto > 0);
}

export async function fetchFinanceiroFaturasEmusys({
  unidadeId = 'todos',
  ano,
  mes,
}: FetchFinanceiroFaturasParams): Promise<FinanceiroFaturasPayload | null> {
  const unidadeFiltro = unidadeId && unidadeId !== 'todos' ? String(unidadeId) : null;
  const { data, error } = await supabase.rpc('get_financeiro_faturas_emusys', {
    p_unidade_id: unidadeFiltro,
    p_ano: ano,
    p_mes: mes,
  });

  if (error) throw error;
  if (!data) return null;

  const payload = data as any;
  const porUnidade = Array.isArray(payload?.por_unidade)
    ? payload.por_unidade.map(normalizeFinanceiroFaturas)
    : [];
  const totais = payload?.totais && Object.keys(payload.totais).length > 0
    ? normalizeFinanceiroFaturas(payload.totais)
    : null;

  return {
    ano: n(payload?.ano) || ano,
    mes: n(payload?.mes) || mes,
    tem_dados: Boolean(payload?.tem_dados) || porUnidade.length > 0,
    fonte: String(payload?.fonte || 'emusys_faturas'),
    por_unidade: porUnidade,
    totais,
  };
}
