import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

interface KPIsComercialCanonicosV2 {
  leads_entrantes?: number;
  matriculas_comerciais_principais?: number;
}

interface KPIsComercialPorUnidadeV2 {
  unidade_nome?: string;
  leads_entrantes?: number;
  matriculas_comerciais_principais?: number;
}

interface KPIsComercialCanonicosV2Payload {
  kpis?: KPIsComercialCanonicosV2;
  por_unidade?: KPIsComercialPorUnidadeV2[] | null;
}

interface PayloadMensalV2 {
  mes: number;
  payload: KPIsComercialCanonicosV2Payload | null;
}

export interface ComercialSerieMensalV2 {
  mesNumero: number;
  mes: string;
  cg_leads: number;
  cg_mat: number;
  rec_leads: number;
  rec_mat: number;
  barra_leads: number;
  barra_mat: number;
  total_leads: number;
  total_mat: number;
}

export type MetricaSazonalidadeV2 = 'leads' | 'matriculas';

const SERIE_VAZIA: ComercialSerieMensalV2[] = MESES_ABREV.map((mes, index) => ({
  mesNumero: index + 1,
  mes,
  cg_leads: 0,
  cg_mat: 0,
  rec_leads: 0,
  rec_mat: 0,
  barra_leads: 0,
  barra_mat: 0,
  total_leads: 0,
  total_mat: 0,
}));

function normalizarTexto(valor: string): string {
  return valor
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

function toNumber(valor: unknown): number {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

function encontrarUnidade(
  payload: KPIsComercialCanonicosV2Payload | null,
  unidade: string,
): KPIsComercialPorUnidadeV2 | null {
  const unidades = Array.isArray(payload?.por_unidade) ? payload?.por_unidade : [];
  const unidadeNormalizada = normalizarTexto(unidade);

  return unidades.find((row) => normalizarTexto(row.unidade_nome || '') === unidadeNormalizada) || null;
}

function normalizarMes({ mes, payload }: PayloadMensalV2): ComercialSerieMensalV2 {
  const campoGrande = encontrarUnidade(payload, 'Campo Grande');
  const recreio = encontrarUnidade(payload, 'Recreio');
  const barra = encontrarUnidade(payload, 'Barra');

  return {
    mesNumero: mes,
    mes: MESES_ABREV[mes - 1] || String(mes),
    cg_leads: toNumber(campoGrande?.leads_entrantes),
    cg_mat: toNumber(campoGrande?.matriculas_comerciais_principais),
    rec_leads: toNumber(recreio?.leads_entrantes),
    rec_mat: toNumber(recreio?.matriculas_comerciais_principais),
    barra_leads: toNumber(barra?.leads_entrantes),
    barra_mat: toNumber(barra?.matriculas_comerciais_principais),
    total_leads: toNumber(payload?.kpis?.leads_entrantes),
    total_mat: toNumber(payload?.kpis?.matriculas_comerciais_principais),
  };
}

export function normalizarSeriesMensaisComercialV2(payloads: PayloadMensalV2[]): ComercialSerieMensalV2[] {
  const payloadPorMes = new Map(payloads.map((item) => [item.mes, item.payload]));

  return MESES_ABREV.map((_, index) => {
    const mes = index + 1;
    return normalizarMes({
      mes,
      payload: payloadPorMes.get(mes) || null,
    });
  });
}

export function valorDaMetricaSazonalidade(
  serie: ComercialSerieMensalV2,
  metrica: MetricaSazonalidadeV2,
): number {
  return metrica === 'leads' ? serie.total_leads : serie.total_mat;
}

export function ordenarSeriesPorMetrica(
  series: ComercialSerieMensalV2[],
  metrica: MetricaSazonalidadeV2,
): ComercialSerieMensalV2[] {
  return [...series].sort((a, b) => valorDaMetricaSazonalidade(b, metrica) - valorDaMetricaSazonalidade(a, metrica));
}

export function useComercialSeriesMensaisV2(ano: number = 2025) {
  const [series, setSeries] = useState<ComercialSerieMensalV2[]>(SERIE_VAZIA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSeries = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const payloads: PayloadMensalV2[] = [];

      for (let mes = 1; mes <= 12; mes += 1) {
        const { data, error: rpcError } = await supabase.rpc('get_kpis_comercial_canonicos_v2', {
          p_unidade_id: null,
          p_ano: ano,
          p_mes: mes,
          p_periodo: 'mensal',
          p_data: null,
        });

        if (rpcError) {
          throw new Error(`Erro ao buscar sazonalidade v2 ${ano}-${String(mes).padStart(2, '0')}: ${rpcError.message}`);
        }

        payloads.push({
          mes,
          payload: data as KPIsComercialCanonicosV2Payload | null,
        });
      }

      setSeries(normalizarSeriesMensaisComercialV2(payloads));
    } catch (err: any) {
      setSeries(SERIE_VAZIA);
      setError(err?.message || 'Erro ao buscar sazonalidade comercial v2');
      console.error('Erro ao buscar sazonalidade comercial v2:', err);
    } finally {
      setLoading(false);
    }
  }, [ano]);

  useEffect(() => {
    fetchSeries();
  }, [fetchSeries]);

  return { series, loading, error };
}
