import { supabase } from '@/lib/supabase';

export interface FiltroResumoDashboardProfessoresCanonico {
  ano: number;
  mes: number;
  unidadeId?: string | null;
  dataInicio?: string | null;
  dataFim?: string | null;
}

export interface ResumoDashboardProfessoresCanonico {
  carteira_alunos: number;
  alunos_via_turmas: number;
  turmas_elegiveis_media: number;
  renovacoes: number;
  nao_renovacoes: number;
}

const numero = (valor: unknown): number => {
  const convertido = Number(valor ?? 0);
  return Number.isFinite(convertido) ? convertido : 0;
};

function normalizarResumo(
  row: Record<string, unknown> | null | undefined,
): ResumoDashboardProfessoresCanonico {
  return {
    carteira_alunos: numero(row?.carteira_alunos),
    alunos_via_turmas: numero(row?.alunos_via_turmas),
    turmas_elegiveis_media: numero(row?.turmas_elegiveis_media),
    renovacoes: numero(row?.renovacoes),
    nao_renovacoes: numero(row?.nao_renovacoes),
  };
}

export async function buscarResumoDashboardProfessoresCanonico(
  filtro: FiltroResumoDashboardProfessoresCanonico,
): Promise<ResumoDashboardProfessoresCanonico> {
  const { data, error } = await supabase.rpc(
    'get_dashboard_professores_resumo_canonico_v1',
    {
      p_ano: filtro.ano,
      p_mes: filtro.mes,
      p_unidade_id: filtro.unidadeId && filtro.unidadeId !== 'todos'
        ? filtro.unidadeId
        : null,
      p_data_inicio: filtro.dataInicio || null,
      p_data_fim: filtro.dataFim || null,
    },
  );

  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  return normalizarResumo(rows[0] as Record<string, unknown> | undefined);
}
