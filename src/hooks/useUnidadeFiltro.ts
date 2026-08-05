import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { UnidadePermitida } from '../contexts/AuthContext';

interface UseUnidadeFiltroReturn {
  unidadeSelecionada: string | null;
  setUnidadeSelecionada: (unidadeId: string | null) => void;
  filtroAtivo: string | null;
  isConsolidado: boolean;
  canChangeUnidade: boolean;
  unidadesDisponiveis: UnidadePermitida[];
  podeVerConsolidado: boolean;
}

/**
 * Hook para gerenciar o filtro de unidade
 * - Admin: alterna entre consolidado (rede inteira) e qualquer unidade
 * - Multi-unidade não-admin: alterna entre as unidades dele, SEM consolidado
 * - Unidade única: filtro fixo na unidade dele (não pode alterar)
 */
export function useUnidadeFiltro(): UseUnidadeFiltroReturn {
  const { isAdmin, unidadeId, unidadesPermitidas } = useAuth();

  // Admin escolhe entre todas; não-admin só entre as unidades vinculadas a ele.
  const unidadesDisponiveis = isAdmin ? [] : unidadesPermitidas;

  // Admin entra pelo isAdmin porque seu vínculo RBAC é global (unidade_id NULL) e a lista
  // dele vem VAZIA — sem essa cláusula, todo admin perderia o seletor.
  const canChangeUnidade = isAdmin || unidadesPermitidas.length > 1;

  // "Consolidado" significa a REDE INTEIRA, e as ~213 RPCs SECURITY DEFINER que recebem
  // p_unidade_id honram null sem checar RLS. Quem tem 2 de 3 unidades veria a terceira.
  const podeVerConsolidado = isAdmin;

  // Unidade padrão de quem não é admin: a primeira das dele (evita p_unidade_id null).
  const unidadePadrao = unidadesPermitidas[0]?.id ?? unidadeId;

  const [unidadeSelecionada, setUnidadeSelecionada] = useState<string | null>(
    isAdmin ? null : unidadePadrao
  );

  // Admin começa em Consolidado; os demais começam numa unidade concreta.
  useEffect(() => {
    setUnidadeSelecionada(isAdmin ? null : unidadePadrao);
  }, [isAdmin, unidadePadrao]);

  // Não-admin nunca manda null: se a seleção não for uma unidade dele, cai no padrão.
  const selecaoValida =
    unidadeSelecionada && unidadesPermitidas.some(u => u.id === unidadeSelecionada);
  const filtroAtivo = isAdmin
    ? unidadeSelecionada
    : (selecaoValida ? unidadeSelecionada : unidadePadrao);

  const isConsolidado = podeVerConsolidado && !unidadeSelecionada;

  return {
    unidadeSelecionada,
    setUnidadeSelecionada,
    filtroAtivo,
    isConsolidado,
    canChangeUnidade,
    unidadesDisponiveis,
    podeVerConsolidado,
  };
}

export default useUnidadeFiltro;
