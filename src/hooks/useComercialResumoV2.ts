import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { UnidadeComercial } from '../types/comercial';
import { fetchExperimentaisDiagnosticoComercialV2 } from './useComercialOperacionalResumoV2';

interface UnidadeRow {
  id: string;
  nome: string;
}

interface KPIsComercialCanonicosV2 {
  leads_entrantes?: number;
  experimentais_realizadas_presenca_confirmada?: number;
  experimentais_realizadas_status_operacional?: number;
  matriculas_comerciais_principais?: number;
  conversoes_de_lead?: number;
}

interface KPIsComercialCanonicosV2Payload {
  kpis?: KPIsComercialCanonicosV2;
  gaps?: {
    experimental_status_realizada_sem_presenca?: number;
  };
}

export interface ComercialResumoV2 {
  leadsEntrantes: number;
  experimentaisConfirmadas: number;
  experimentaisOperacionais: number;
  matriculasComerciais: number;
  conversoesDeLead: number;
  taxaMatriculaComercial: number;
  experimentalStatusSemPresenca: number;
}

const RESUMO_VAZIO: ComercialResumoV2 = {
  leadsEntrantes: 0,
  experimentaisConfirmadas: 0,
  experimentaisOperacionais: 0,
  matriculasComerciais: 0,
  conversoesDeLead: 0,
  taxaMatriculaComercial: 0,
  experimentalStatusSemPresenca: 0,
};

function normalizarUnidade(valor: string): string {
  return valor.trim().toLocaleLowerCase('pt-BR');
}

function toNumber(valor: unknown): number {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

function calcularTaxaMatriculaComercial(leadsEntrantes: number, matriculasComerciais: number): number {
  return leadsEntrantes > 0
    ? Number(((matriculasComerciais / leadsEntrantes) * 100).toFixed(2))
    : 0;
}

export function normalizarResumoComercialV2(payload: KPIsComercialCanonicosV2Payload | null): ComercialResumoV2 {
  const kpis = payload?.kpis || {};
  const leadsEntrantes = toNumber(kpis.leads_entrantes);
  const matriculasComerciais = toNumber(kpis.matriculas_comerciais_principais);

  return {
    leadsEntrantes,
    experimentaisConfirmadas: toNumber(kpis.experimentais_realizadas_presenca_confirmada),
    experimentaisOperacionais: toNumber(kpis.experimentais_realizadas_status_operacional),
    matriculasComerciais,
    conversoesDeLead: toNumber(kpis.conversoes_de_lead),
    taxaMatriculaComercial: calcularTaxaMatriculaComercial(leadsEntrantes, matriculasComerciais),
    experimentalStatusSemPresenca: toNumber(payload?.gaps?.experimental_status_realizada_sem_presenca),
  };
}

export function somarResumosComercialV2(resumos: ComercialResumoV2[]): ComercialResumoV2 {
  const total = resumos.reduce(
    (acc, resumo) => ({
      leadsEntrantes: acc.leadsEntrantes + resumo.leadsEntrantes,
      experimentaisConfirmadas: acc.experimentaisConfirmadas + resumo.experimentaisConfirmadas,
      experimentaisOperacionais: acc.experimentaisOperacionais + resumo.experimentaisOperacionais,
      matriculasComerciais: acc.matriculasComerciais + resumo.matriculasComerciais,
      conversoesDeLead: acc.conversoesDeLead + resumo.conversoesDeLead,
      taxaMatriculaComercial: 0,
      experimentalStatusSemPresenca: acc.experimentalStatusSemPresenca + resumo.experimentalStatusSemPresenca,
    }),
    RESUMO_VAZIO,
  );

  return {
    ...total,
    taxaMatriculaComercial: calcularTaxaMatriculaComercial(
      total.leadsEntrantes,
      total.matriculasComerciais,
    ),
  };
}

export function useComercialResumoV2(ano: number = 2025, unidade: UnidadeComercial = 'Consolidado') {
  const [resumo, setResumo] = useState<ComercialResumoV2>(RESUMO_VAZIO);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resolverUnidadeId = useCallback(async (): Promise<string | null> => {
    if (unidade === 'Consolidado') {
      return null;
    }

    const { data, error: unidadesError } = await supabase
      .from('unidades')
      .select('id, nome')
      .eq('ativo', true);

    if (unidadesError) {
      throw unidadesError;
    }

    const unidadeEncontrada = (data as UnidadeRow[] | null)?.find(
      (row) => normalizarUnidade(row.nome) === normalizarUnidade(unidade),
    );

    if (!unidadeEncontrada) {
      throw new Error(`Unidade comercial nao encontrada: ${unidade}`);
    }

    return unidadeEncontrada.id;
  }, [unidade]);

  const fetchResumo = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const unidadeId = await resolverUnidadeId();
      const [resumosMensais, diagnosticoExperimentais] = await Promise.all([
        Promise.all(Array.from({ length: 12 }, async (_, index) => {
          const mes = index + 1;
          const { data, error: rpcError } = await supabase.rpc('get_kpis_comercial_canonicos_v2', {
            p_unidade_id: unidadeId,
            p_ano: ano,
            p_mes: mes,
            p_periodo: 'mensal',
            p_data: null,
          });

          if (rpcError) {
            throw new Error(`Erro ao buscar resumo comercial v2 ${ano}-${String(mes).padStart(2, '0')}: ${rpcError.message}`);
          }

          return normalizarResumoComercialV2(data as KPIsComercialCanonicosV2Payload | null);
        })),
        fetchExperimentaisDiagnosticoComercialV2({
          unidadeId: unidadeId || 'todos',
          ano,
          mesInicio: 1,
          mesFim: 12,
        }),
      ]);

      const resumoBase = somarResumosComercialV2(resumosMensais);
      setResumo({
        ...resumoBase,
        experimentaisConfirmadas: diagnosticoExperimentais.realizadasPresencaConfirmada,
        experimentaisOperacionais: diagnosticoExperimentais.realizadasStatusOperacional,
        experimentalStatusSemPresenca: diagnosticoExperimentais.statusOperacionalSemPresenca,
      });
    } catch (err: any) {
      setResumo(RESUMO_VAZIO);
      setError(err?.message || 'Erro ao buscar resumo comercial v2');
      console.error('Erro ao buscar resumo comercial v2:', err);
    } finally {
      setLoading(false);
    }
  }, [ano, resolverUnidadeId]);

  useEffect(() => {
    fetchResumo();
  }, [fetchResumo]);

  return { resumo, loading, error };
}
