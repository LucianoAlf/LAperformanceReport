type MovimentoFinanceiroRetencao = {
  valor_parcela_evasao?: number | string | null;
  valor_parcela_anterior?: number | string | null;
  valor_parcela_novo?: number | string | null;
  alunos?: {
    valor_parcela?: number | string | null;
  } | null;
};

type ResumoFinanceiroMensal = {
  alunos_pagantes?: number | string | null;
  ticket_medio?: number | string | null;
  faturamento?: number | string | null;
  ltv_meses?: number | string | null;
  churn_rate?: number | string | null;
  mrr_perdido?: number | string | null;
  evasoes_interrompido?: number | string | null;
  evasoes_nao_renovou?: number | string | null;
};

export type KpisMensaisAdministrativos = {
  ticketMedio: number;
  mrrAtual: number;
  ltv: number;
  churnRate: number;
  mrrPerdido: number;
  tempoPermanenciaMeses: number;
};

function n(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function valorPerdidoRelatorioMensal(movimento: MovimentoFinanceiroRetencao | null | undefined): number {
  return n(
    movimento?.valor_parcela_evasao
      ?? movimento?.valor_parcela_anterior
      ?? movimento?.valor_parcela_novo
      ?? movimento?.alunos?.valor_parcela
  );
}

export function calcularKpisMensaisAdministrativos({
  resumo,
  evasoes,
  naoRenovacoes,
}: {
  resumo?: ResumoFinanceiroMensal | null;
  evasoes?: MovimentoFinanceiroRetencao[];
  naoRenovacoes?: MovimentoFinanceiroRetencao[];
}): KpisMensaisAdministrativos {
  const alunosPagantes = n(resumo?.alunos_pagantes);
  const faturamentoResumo = n(resumo?.faturamento);
  const ticketResumo = n(resumo?.ticket_medio);
  const ticketMedio = ticketResumo || (alunosPagantes > 0 ? faturamentoResumo / alunosPagantes : 0);
  const mrrAtual = faturamentoResumo || (alunosPagantes * ticketMedio);
  const tempoPermanenciaMeses = n(resumo?.ltv_meses);
  const ltv = tempoPermanenciaMeses * ticketMedio;

  const movimentosRetencao = [...(evasoes || []), ...(naoRenovacoes || [])];
  const mrrPerdidoMovimentos = movimentosRetencao.reduce(
    (acc, movimento) => acc + valorPerdidoRelatorioMensal(movimento),
    0
  );
  const mrrPerdido = n(resumo?.mrr_perdido) || mrrPerdidoMovimentos;

  const totalEvasoesRetencao = n(resumo?.evasoes_interrompido) + n(resumo?.evasoes_nao_renovou);
  const churnRate = alunosPagantes > 0 && totalEvasoesRetencao > 0
    ? (totalEvasoesRetencao / alunosPagantes) * 100
    : n(resumo?.churn_rate);

  return {
    ticketMedio,
    mrrAtual,
    ltv,
    churnRate,
    mrrPerdido,
    tempoPermanenciaMeses,
  };
}
