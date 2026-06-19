export type UnidadeOperacionalV2 = string | 'todos' | null;

export interface ComercialOperacionalCompetenciaV2 {
  unidadeId: UnidadeOperacionalV2;
  ano: number;
  mesInicio: number;
  mesFim: number;
}

export interface ComercialOperacionalRpcParamsV2 {
  p_unidade_id: string | null;
  p_ano: number;
  p_mes: number;
  p_periodo: 'mensal';
  p_data: null;
}

export interface OrigemCanalPayloadV2 {
  canal?: string | null;
  leads?: number | string | null;
}

export interface PorUnidadePayloadV2 {
  unidade_nome?: string | null;
  leads_entrantes?: number | string | null;
}

export interface ComercialOperacionalPayloadV2 {
  kpis?: {
    leads_entrantes?: number | string | null;
  } | null;
  origem_canal?: OrigemCanalPayloadV2[] | null;
  por_unidade?: PorUnidadePayloadV2[] | null;
}

export interface OrigemCanalOperacionalV2 {
  canal: string;
  leads: number;
  percentual: number;
}

export interface UnidadeLeadsOperacionalV2 {
  unidadeNome: string;
  leadsEntrantes: number;
}

export interface ComercialOperacionalMesV2 {
  mes: number;
  leadsEntrantes: number;
  origemCanal: OrigemCanalOperacionalV2[];
  porUnidade: UnidadeLeadsOperacionalV2[];
}

export interface ComercialOperacionalResumoDadosV2 {
  leadsEntrantes: number;
  origemCanal: OrigemCanalOperacionalV2[];
  seriesMensais: ComercialOperacionalMesV2[];
}

export function toComercialNumber(valor: unknown): number {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

export function normalizarMesRange(mesInicio: number, mesFim: number): number[] {
  const inicio = Math.max(1, Math.min(12, Math.trunc(mesInicio)));
  const fim = Math.max(inicio, Math.min(12, Math.trunc(mesFim)));

  return Array.from({ length: fim - inicio + 1 }, (_, index) => inicio + index);
}

export function normalizarUnidadeOperacionalV2(unidadeId: UnidadeOperacionalV2): string | null {
  return !unidadeId || unidadeId === 'todos' ? null : unidadeId;
}

export function buildComercialOperacionalRpcParamsV2({
  unidadeId,
  ano,
  mes,
}: {
  unidadeId: UnidadeOperacionalV2;
  ano: number;
  mes: number;
}): ComercialOperacionalRpcParamsV2 {
  return {
    p_unidade_id: normalizarUnidadeOperacionalV2(unidadeId),
    p_ano: ano,
    p_mes: mes,
    p_periodo: 'mensal',
    p_data: null,
  };
}

function normalizarOrigemCanal(
  origemCanal: OrigemCanalPayloadV2[] | null | undefined,
): OrigemCanalOperacionalV2[] {
  return (Array.isArray(origemCanal) ? origemCanal : [])
    .map((item) => ({
      canal: item.canal?.trim() || 'Sem canal',
      leads: toComercialNumber(item.leads),
      percentual: 0,
    }))
    .filter((item) => item.leads > 0);
}

function normalizarPorUnidade(
  porUnidade: PorUnidadePayloadV2[] | null | undefined,
): UnidadeLeadsOperacionalV2[] {
  return (Array.isArray(porUnidade) ? porUnidade : [])
    .map((item) => ({
      unidadeNome: item.unidade_nome?.trim() || 'Sem unidade',
      leadsEntrantes: toComercialNumber(item.leads_entrantes),
    }))
    .filter((item) => item.leadsEntrantes > 0);
}

export function normalizarPayloadMensalComercialV2(
  mes: number,
  payload: ComercialOperacionalPayloadV2 | null,
): ComercialOperacionalMesV2 {
  return {
    mes,
    leadsEntrantes: toComercialNumber(payload?.kpis?.leads_entrantes),
    origemCanal: normalizarOrigemCanal(payload?.origem_canal),
    porUnidade: normalizarPorUnidade(payload?.por_unidade),
  };
}

export function somarSeriesMensaisComercialV2(
  seriesMensais: ComercialOperacionalMesV2[],
): ComercialOperacionalResumoDadosV2 {
  const origemPorCanal = new Map<string, OrigemCanalOperacionalV2>();
  let leadsEntrantes = 0;

  seriesMensais.forEach((mes) => {
    leadsEntrantes += mes.leadsEntrantes;

    mes.origemCanal.forEach((item) => {
      const atual = origemPorCanal.get(item.canal) || {
        canal: item.canal,
        leads: 0,
        percentual: 0,
      };

      atual.leads += item.leads;
      origemPorCanal.set(item.canal, atual);
    });
  });

  const origemCanal = Array.from(origemPorCanal.values())
    .map((item) => ({
      ...item,
      percentual: leadsEntrantes > 0 ? (item.leads / leadsEntrantes) * 100 : 0,
    }))
    .sort((a, b) => b.leads - a.leads);

  return {
    leadsEntrantes,
    origemCanal,
    seriesMensais,
  };
}
