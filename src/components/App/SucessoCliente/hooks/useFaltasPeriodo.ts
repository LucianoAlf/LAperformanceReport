import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { criarPublicacaoFaltasEmAuditoria } from '@/lib/presencaPublicacao';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';

export interface FaltaAluno {
  aluno_id: number;
  nome: string;
  unidade_id: string;
  unidade_codigo: string | null;
  curso_nome: string | null;
  professor_nome: string | null;
  telefone: string | null;
  whatsapp: string | null;
  responsavel_telefone: string | null;
  total_aulas: number;
  faltas: number;
  presencas: number;
  pct_presenca: number;
  pct_presenca_publicavel: number | null;
  denominador: number;
  fonte: string;
  periodo_inicio: string;
  periodo_fim: string;
  regra_versao: string;
  estado_publicacao: 'em_auditoria' | 'publicado';
  is_projeto_banda: boolean;
}

export interface PublicacaoFaltasPeriodo {
  denominador: number | null;
  fonte: string;
  periodo_inicio: string;
  periodo_fim: string;
  regra_versao: string;
  estado_publicacao: 'em_auditoria' | 'publicado';
}

interface Params {
  unidadeId: UnidadeId;
  dataInicio: string; // yyyy-MM-dd
  dataFim: string; // yyyy-MM-dd
}

/**
 * Ranking de faltas por aluno no período, via ocorrência canônica v2.
 * A RPC entrega um número apenas quando todo o universo está publicável.
 */
export function useFaltasPeriodo({ unidadeId, dataInicio, dataFim }: Params) {
  const [faltas, setFaltas] = useState<FaltaAluno[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publicacao, setPublicacao] = useState<PublicacaoFaltasPeriodo>(() =>
    criarPublicacaoFaltasEmAuditoria(dataInicio, dataFim));

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFaltas([]);
    setPublicacao(criarPublicacaoFaltasEmAuditoria(dataInicio, dataFim));
    const { data, error } = await supabase.rpc('get_faltas_periodo_v2', {
      p_unidade_id: unidadeId === 'todos' ? null : unidadeId,
      p_data_inicio: dataInicio,
      p_data_fim: dataFim,
    });
    if (error) {
      setError(error.message);
      setPublicacao(criarPublicacaoFaltasEmAuditoria(dataInicio, dataFim));
    } else {
      const linhas = data || [];
      const universoPublicavel = linhas.length > 0
        && linhas.every((f: any) => f.estado_publicacao === 'publicavel'
          && f.denominador !== null
          && f.percentual_presenca !== null);
      // Coage numéricos somente depois de validar a publicação. Assim null não
      // vira zero e uma linha incompleta nunca entra no ranking.
      const normalizadas = (universoPublicavel ? linhas : []).map((f: any) => {
        const denominador = Number(f.denominador);
        return {
          ...f,
          total_aulas: denominador,
          faltas: Number(f.faltas_total),
          presencas: Number(f.presentes),
          pct_presenca: Number(f.percentual_presenca),
          pct_presenca_publicavel: Number(f.percentual_presenca),
          denominador,
          fonte: 'get_faltas_periodo_v2',
          periodo_inicio: dataInicio,
          periodo_fim: dataFim,
          regra_versao: String(f.regra_versao || 'faltas-periodo-v2.1'),
          estado_publicacao: 'publicado' as const,
        };
      }) as FaltaAluno[];
      setFaltas(normalizadas);
      setPublicacao({
        denominador: universoPublicavel
          ? normalizadas.reduce((soma, falta) => soma + falta.denominador, 0)
          : null,
        fonte: 'get_faltas_periodo_v2',
        periodo_inicio: dataInicio,
        periodo_fim: dataFim,
        regra_versao: String(linhas[0]?.regra_versao || 'faltas-periodo-v2.1'),
        estado_publicacao: universoPublicavel ? 'publicado' : 'em_auditoria',
      });
    }
    setLoading(false);
  }, [unidadeId, dataInicio, dataFim]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return { faltas, publicacao, loading, error, refetch: carregar };
}
