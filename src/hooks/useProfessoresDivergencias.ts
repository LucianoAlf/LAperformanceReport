import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Fila de divergências de identidade de professor (nosso cadastro × Emusys).
 *
 * ⚠️ `professores_emusys_divergencias` tem RLS ligado e ZERO policies — ler a tabela
 * direto devolve vazio sem erro. Toda leitura passa pela RPC `SECURITY DEFINER`
 * `get_professores_divergencias_emusys`, que resolve o escopo por dentro.
 * A fila é de gestão: admin e perfil unidade. Professor recebe lista vazia.
 */

export type TipoDivergencia =
  | 'so_no_emusys'
  | 'so_no_la'
  | 'conflito_unidade'
  | 'sem_vinculo_la'
  | string;

export interface DivergenciaProfessor {
  id: number;
  unidade_id: string;
  unidade_codigo: string;
  professor_id: number | null;
  professor_nome: string | null;
  professor_ativo: boolean | null;
  emusys_professor_id: number | null;
  tipo_divergencia: TipoDivergencia;
  severidade: 'alta' | 'media' | 'baixa' | string;
  nome_la: string | null;
  nome_emusys: string | null;
  sugestao_acao: string | null;
  sugestao_texto: string | null;
  valor_nosso: Record<string, unknown> | null;
  valor_emusys: Record<string, unknown> | null;
  resolvido: boolean;
  decisao: string | null;
  decidido_por: string | null;
  decidido_em: string | null;
  detectado_em: string;
  dias_em_aberto: number;
  /** Aulas futuras órfãs desse id do Emusys — sinal de urgência real. */
  aulas_futuras_do_emusys: number;
}

interface Opcoes {
  incluirResolvidas?: boolean;
  unidadeId?: string | null;
}

export function useProfessoresDivergencias({ incluirResolvidas = false, unidadeId = null }: Opcoes = {}) {
  const [divergencias, setDivergencias] = useState<DivergenciaProfessor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [decidindoId, setDecidindoId] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    const { data, error } = await supabase.rpc('get_professores_divergencias_emusys', {
      p_incluir_resolvidas: incluirResolvidas,
      p_unidade_id: unidadeId,
    });

    if (error) {
      setErro(error.message);
      setDivergencias([]);
    } else {
      setDivergencias((data ?? []) as DivergenciaProfessor[]);
    }
    setCarregando(false);
  }, [incluirResolvidas, unidadeId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /**
   * Registra a decisão humana. A autoria é gravada pelo banco a partir do JWT —
   * não é enviada pelo cliente de propósito.
   */
  const decidir = useCallback(
    async (id: number, decisao: string, observacao?: string) => {
      setDecidindoId(id);
      const { error } = await supabase.rpc('decidir_professor_divergencia_emusys', {
        p_id: id,
        p_decisao: decisao,
        p_observacao: observacao ?? null,
      });
      setDecidindoId(null);

      if (error) throw new Error(error.message);
      await carregar();
    },
    [carregar],
  );

  const resumo = useMemo(() => {
    const abertas = divergencias.filter((d) => !d.resolvido);
    return {
      abertas: abertas.length,
      alta: abertas.filter((d) => d.severidade === 'alta').length,
      // O que dói de verdade: divergência com aula futura marcada = professor dando aula
      // agora cujas aulas não têm vínculo com nenhum cadastro nosso.
      comAulaFutura: abertas.filter((d) => d.aulas_futuras_do_emusys > 0).length,
      aulasFuturasAfetadas: abertas.reduce((soma, d) => soma + d.aulas_futuras_do_emusys, 0),
    };
  }, [divergencias]);

  return { divergencias, resumo, carregando, erro, decidindoId, recarregar: carregar, decidir };
}
