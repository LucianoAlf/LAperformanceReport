import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { ContratoAssinaturaStatus } from '@/lib/contratoAssinatura';

export type ContratoAssinaturaAluno = {
  contrato_assinatura_status: ContratoAssinaturaStatus;
  contratos_assinados_todos: boolean | null;
  contratos_relevantes: number;
  contratos_assinados: number;
  contratos_nao_assinados: number;
  contratos_sem_contrato: number;
  contratos_nao_verificados: number;
  contrato_status_observado_em: string | null;
  contrato_reconciliado_em: string | null;
  contrato_dado_fresco: boolean;
  matricula_contrato_status: ContratoAssinaturaStatus;
  matricula_contrato_emusys_id: string | null;
  matricula_contrato_assinado: boolean | null;
  matricula_status_observado_em: string | null;
};

const NAO_VERIFICADO: ContratoAssinaturaAluno = {
  contrato_assinatura_status: 'nao_verificado',
  contratos_assinados_todos: null,
  contratos_relevantes: 0,
  contratos_assinados: 0,
  contratos_nao_assinados: 0,
  contratos_sem_contrato: 0,
  contratos_nao_verificados: 0,
  contrato_status_observado_em: null,
  contrato_reconciliado_em: null,
  contrato_dado_fresco: false,
  matricula_contrato_status: 'nao_verificado',
  matricula_contrato_emusys_id: null,
  matricula_contrato_assinado: null,
  matricula_status_observado_em: null,
};

export function useContratoAssinaturaAluno(alunoId: number | null | undefined) {
  const [data, setData] = useState<ContratoAssinaturaAluno>(NAO_VERIFICADO);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!alunoId) {
      setData(NAO_VERIFICADO);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const { data: rows, error: rpcError } = await supabase
      .rpc('get_contrato_assinatura_aluno_v1', { p_aluno_id: alunoId });

    if (rpcError || !Array.isArray(rows) || !rows[0]) {
      setData(NAO_VERIFICADO);
      setError(rpcError?.message ?? 'Contrato ainda não verificado');
    } else {
      setData(rows[0] as ContratoAssinaturaAluno);
    }
    setLoading(false);
  }, [alunoId]);

  useEffect(() => { void refetch(); }, [refetch]);

  return { data, loading, error, refetch };
}
