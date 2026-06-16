import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';

export interface MarcoAluno {
  aluno_id: number;
  nome: string;
  curso_nome: string | null;
  professor_nome: string | null;
  data_marco: string;
  horario: string | null;
  telefone: string | null;
  whatsapp: string | null;
  responsavel_telefone: string | null;
}

export interface RenovacaoAluno {
  aluno_id: number;
  aluno_nome: string;
  unidade_id: string;
  unidade_nome: string | null;
  curso_nome: string | null;
  professor_nome: string | null;
  data_fim_contrato: string | null;
  dias_ate_vencimento: number | null;
  status_renovacao: string;
  telefone: string | null;
  whatsapp: string | null;
}

const STATUS_A_RENOVAR = ['vencido', 'urgente_7_dias', 'atencao_15_dias', 'proximo_30_dias'];

interface Params {
  unidadeId: UnidadeId;
  janelaDias: number;
  nrAlvo: number;
}

/**
 * Marcos da jornada para envio de pesquisas:
 * - primeiras aulas + marco de aula (calouros): edge `marcos-jornada` (aulas agendadas no Emusys)
 * - prestes a renovar: view `vw_renovacoes_proximas` (já classifica por janela de vencimento)
 */
export function useMarcosJornada({ unidadeId, janelaDias, nrAlvo }: Params) {
  const [primeirasAulas, setPrimeirasAulas] = useState<MarcoAluno[]>([]);
  const [marcoAula, setMarcoAula] = useState<MarcoAluno[]>([]);
  const [renovacoes, setRenovacoes] = useState<RenovacaoAluno[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Renovações (view) — rápido
    let qRenov = supabase
      .from('vw_renovacoes_proximas')
      .select('aluno_id, aluno_nome, unidade_id, unidade_nome, curso_nome, professor_nome, data_fim_contrato, dias_ate_vencimento, status_renovacao, telefone, whatsapp')
      .in('status_renovacao', STATUS_A_RENOVAR)
      .order('dias_ate_vencimento', { ascending: true });
    if (unidadeId !== 'todos') qRenov = qRenov.eq('unidade_id', unidadeId);

    const [edge, renov] = await Promise.all([
      supabase.functions.invoke('marcos-jornada', {
        body: { unidade_id: unidadeId === 'todos' ? null : unidadeId, janela_dias: janelaDias, nr_alvo: nrAlvo },
      }),
      qRenov,
    ]);

    if (edge.error) {
      setError(edge.error.message);
      setPrimeirasAulas([]);
      setMarcoAula([]);
    } else {
      setPrimeirasAulas((edge.data?.primeiras_aulas || []) as MarcoAluno[]);
      setMarcoAula((edge.data?.marco_aula || []) as MarcoAluno[]);
    }

    if (renov.error) {
      setRenovacoes([]);
    } else {
      setRenovacoes((renov.data || []) as RenovacaoAluno[]);
    }

    setLoading(false);
  }, [unidadeId, janelaDias, nrAlvo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return { primeirasAulas, marcoAula, renovacoes, loading, error, refetch: carregar };
}
